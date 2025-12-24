"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Clock, CheckCircle, XCircle, Archive, Eye, Loader2,
    Shield, AlertTriangle, User, FileText, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { requestService, relayerService } from '@/services';
import { getOrCreateEncryptionKeypair, encryptForRecipient } from '@/services/nacl-crypto';
import { api } from '@/services/api';
import { ensureArbitrumSepolia } from '@/utils/chainSwitch';
import { createWalletClient, custom, parseAbi, parseGwei } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

const EHR_SYSTEM_ADDRESS = process.env.NEXT_PUBLIC_EHR_SYSTEM_ADDRESS;

// ABI for confirming access request
const EHR_SYSTEM_ABI = parseAbi([
    'function confirmAccessRequestWithSignature(bytes32 reqId, uint256 deadline, bytes signature) external',
]);

const REQUEST_TYPES = {
    0: { label: 'Chỉ xem', color: 'bg-blue-100 text-blue-800' },
    1: { label: 'Truy cập đầy đủ', color: 'bg-teal-100 text-teal-800' },
    2: { label: 'Khẩn cấp', color: 'bg-red-100 text-red-800' },
};

export default function AccessRequestList({ walletAddress, provider, onApproved }) {
    const [requests, setRequests] = useState([]);
    const [archivedRequests, setArchivedRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [showArchived, setShowArchived] = useState(false);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const [incoming, archived] = await Promise.all([
                requestService.getPendingRequestsForMe(),
                relayerService.getArchivedRequests(),
            ]);
            setRequests(incoming.requests || []);
            setArchivedRequests(archived.requests || []);
        } catch (err) {
            console.error('Error fetching requests:', err);
            toast({
                title: "Lỗi",
                description: "Không thể tải danh sách yêu cầu",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (walletAddress) {
            fetchRequests();
        }
    }, [walletAddress]);

    // Handle approve request with signature + encrypted key sharing
    const handleApprove = async (request) => {
        if (!provider) {
            toast({ title: "Lỗi", description: "Không có provider", variant: "destructive" });
            return;
        }

        setProcessingId(request.requestId);
        try {
            // 0. Ensure correct chain before signing
            await ensureArbitrumSepolia(provider);

            // 0.1 Wait for network switch to complete (MetaMask needs time)
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 1. Get EIP-712 message to sign
            const { typedData, deadline } = await requestService.getApprovalMessage(request.requestId);

            // 2. Sign with wallet (Patient signs, no gas needed!)
            const signature = await provider.request({
                method: 'eth_signTypedData_v4',
                params: [walletAddress, JSON.stringify(typedData)],
            });

            // 3. Prepare encrypted key payload for Doctor
            let encryptedKeyPayload = null;
            let senderPublicKey = null;

            try {
                // 3a. Get my (Patient's) NaCl keypair
                const myKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);
                senderPublicKey = myKeypair.publicKey;

                // 3b. Get Doctor's encryption public key
                const doctorKeyRes = await api.get(`/api/auth/encryption-key/${request.requesterAddress}`);
                const doctorPubKey = doctorKeyRes.encryptionPublicKey;

                // 3c. Get local AES key for this record
                const localRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
                const localRecord = localRecords[request.cidHash];

                if (localRecord && doctorPubKey) {
                    // 3d. Encrypt AES key payload using NaCl box
                    const keyPayload = JSON.stringify({
                        cid: localRecord.cid,
                        aesKey: localRecord.aesKey,
                    });
                    encryptedKeyPayload = encryptForRecipient(keyPayload, doctorPubKey, myKeypair.secretKey);
                    console.log('✅ Encrypted key payload created for Doctor');
                } else {
                    console.warn('⚠️ No local record or Doctor pubkey, key will not be shared');
                }
            } catch (keyErr) {
                console.warn('Key encryption warning:', keyErr);
                // Continue even if key encryption fails - approval still works
            }

            // 4. Save signature + encrypted key to backend
            await requestService.approveWithSignature(
                request.requestId,
                signature,
                deadline,
                encryptedKeyPayload,
                request.cidHash,
                senderPublicKey
            );

            toast({
                title: "Đã ký phê duyệt!",
                description: encryptedKeyPayload
                    ? "Bác sĩ sẽ nhận được key giải mã khi xác nhận giao dịch."
                    : "Bác sĩ sẽ nhận được quyền truy cập khi xác nhận giao dịch.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            // Refresh list
            fetchRequests();

            // Notify parent component
            if (onApproved) {
                onApproved(request);
            }

        } catch (err) {
            console.error('Approve error:', err);

            const errorMsg = String(err.message || '');
            if (errorMsg.toLowerCase().includes('insufficient funds')) {
                toast({
                    title: "Không đủ ETH",
                    description: "Ví của bạn không có đủ ETH để trả phí giao dịch.",
                    variant: "destructive",
                });
            } else if (errorMsg.includes('rejected') || errorMsg.includes('denied')) {
                toast({
                    title: "Đã từ chối",
                    description: "Bạn đã từ chối xác nhận giao dịch.",
                    variant: "destructive",
                });
            } else {
                toast({
                    title: "Lỗi",
                    description: err.message || "Không thể phê duyệt yêu cầu",
                    variant: "destructive",
                });
            }
        } finally {
            setProcessingId(null);
        }
    };

    // Handle archive request (hide without on-chain reject)
    const handleArchive = async (request) => {
        setProcessingId(request.requestId);
        try {
            await relayerService.archiveRequest(request.requestId);

            toast({
                title: "Đã ẩn",
                description: "Yêu cầu đã được ẩn. Bạn có thể xem lại trong mục 'Đã ẩn'.",
            });

            fetchRequests();
        } catch (err) {
            console.error('Archive error:', err);
            toast({
                title: "Lỗi",
                description: err.message || "Không thể ẩn yêu cầu",
                variant: "destructive",
            });
        } finally {
            setProcessingId(null);
        }
    };

    // Handle restore archived request
    const handleRestore = async (request) => {
        setProcessingId(request.requestId);
        try {
            await relayerService.restoreRequest(request.requestId);

            toast({
                title: "Đã khôi phục",
                description: "Yêu cầu đã được khôi phục.",
            });

            fetchRequests();
        } catch (err) {
            console.error('Restore error:', err);
            toast({
                title: "Lỗi",
                description: err.message || "Không thể khôi phục yêu cầu",
                variant: "destructive",
            });
        } finally {
            setProcessingId(null);
        }
    };

    const isExpired = (deadline) => {
        return new Date(deadline) < new Date();
    };

    const renderRequestItem = (request, isArchived = false) => {
        const expired = isExpired(request.deadline);
        const typeInfo = REQUEST_TYPES[request.requestType] || REQUEST_TYPES[0];

        return (
            <motion.div
                key={request.requestId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-xl border ${expired ? 'bg-gray-50 border-gray-200' : 'bg-white border-slate-200 hover:border-blue-300'
                    } transition-colors`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${expired ? 'bg-gray-100' : 'bg-blue-100'
                            }`}>
                            <User className={`w-6 h-6 ${expired ? 'text-gray-400' : 'text-blue-600'}`} />
                        </div>
                        <div>
                            <p className="font-medium text-slate-900">
                                Bác sĩ: {request.requesterAddress?.slice(0, 8)}...{request.requesterAddress?.slice(-6)}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                                <Badge className={typeInfo.color}>
                                    {typeInfo.label}
                                </Badge>
                                {expired && (
                                    <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                                        Đã hết hạn
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                                Hạn: {new Date(request.deadline).toLocaleString('vi-VN')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!isArchived && !expired && (
                            <>
                                <Button
                                    size="sm"
                                    onClick={() => handleApprove(request)}
                                    disabled={processingId === request.requestId}
                                    className="bg-green-600 hover:bg-green-700"
                                >
                                    {processingId === request.requestId ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4 mr-1" />
                                            Duyệt
                                        </>
                                    )}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleArchive(request)}
                                    disabled={processingId === request.requestId}
                                    className="text-slate-600"
                                >
                                    <Archive className="w-4 h-4 mr-1" />
                                    Ẩn
                                </Button>
                            </>
                        )}
                        {isArchived && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRestore(request)}
                                disabled={processingId === request.requestId}
                            >
                                {processingId === request.requestId ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    'Khôi phục'
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </motion.div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-3 text-slate-600">Đang tải...</span>
            </div>
        );
    }

    return (
        <Card className="bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-slate-900 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-600" />
                    Yêu cầu truy cập
                    {requests.length > 0 && (
                        <Badge className="bg-red-500 text-white ml-2">{requests.length}</Badge>
                    )}
                </CardTitle>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowArchived(!showArchived)}
                    >
                        <Archive className="w-4 h-4 mr-1" />
                        {showArchived ? 'Ẩn đã lưu trữ' : `Đã ẩn (${archivedRequests.length})`}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchRequests}
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {requests.length === 0 && !showArchived ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl">
                        <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                        <p className="text-slate-500">Không có yêu cầu nào đang chờ xử lý.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Active requests */}
                        {requests.map(request => renderRequestItem(request, false))}

                        {/* Archived requests */}
                        {showArchived && archivedRequests.length > 0 && (
                            <>
                                <div className="border-t pt-4 mt-4">
                                    <p className="text-sm font-medium text-slate-500 mb-3">Yêu cầu đã ẩn</p>
                                </div>
                                {archivedRequests.map(request => renderRequestItem(request, true))}
                            </>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
