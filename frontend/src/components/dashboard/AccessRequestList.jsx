"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Clock, CheckCircle, XCircle, Archive, Eye, Loader2,
    Shield, AlertTriangle, User, FileText, RefreshCw, Users, Link2
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const EHR_SYSTEM_ADDRESS = process.env.NEXT_PUBLIC_EHR_SYSTEM_ADDRESS;
const CONSENT_LEDGER_ADDRESS = process.env.NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS;

// ABI for confirming access request
// ABI for confirming access request
import { EHR_SYSTEM_ABI, CONSENT_LEDGER_ABI } from '@/config/contractABI';


const REQUEST_TYPES = {
    0: { label: 'Chỉ xem', color: 'bg-blue-100 text-blue-800' },
    1: { label: 'Truy cập đầy đủ', color: 'bg-teal-100 text-teal-800' },
    2: { label: 'Ủy quyền', color: 'bg-purple-100 text-purple-800' },
};

export default function AccessRequestList({ walletAddress, provider, onApproved }) {
    const [activeTab, setActiveTab] = useState('personal'); // 'personal' | 'delegate'

    // Personal requests
    const [requests, setRequests] = useState([]);
    const [archivedRequests, setArchivedRequests] = useState([]);

    // Delegate requests
    const [delegateRequests, setDelegateRequests] = useState([]);

    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [showArchived, setShowArchived] = useState(false);
    const [confirmRequest, setConfirmRequest] = useState(null);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            // Load both concurrently? Or dependent on tab?
            // Let's load both for simpler UX switching
            const [incoming, archived, delegated] = await Promise.all([
                requestService.getPendingRequestsForMe(),
                relayerService.getArchivedRequests(),
                requestService.getAsDelegate() // New service call
            ]);

            setRequests(incoming.requests || []);
            setArchivedRequests(archived.requests || []);
            setDelegateRequests(delegated.requests || []);
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

    // Handle approve request with signature + encrypted key sharing (Personal)
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
                description: request.requestType === 2
                    ? "Đã cấp quyền ủy quyền cho bác sĩ thành công."
                    : (encryptedKeyPayload
                        ? "Bác sĩ sẽ nhận được key giải mã khi xác nhận giao dịch."
                        : "Bác sĩ sẽ nhận được quyền truy cập khi xác nhận giao dịch."),
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
            handleError(err);
        } finally {
            setProcessingId(null);
        }
    };

    // Handle delegate approval (On-chain tx directly)
    const handleDelegateApprove = async (request) => {
        if (!provider) {
            toast({ title: "Lỗi", description: "Không có provider", variant: "destructive" });
            return;
        }

        setProcessingId(request.requestId);

        try {
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });
            const [account] = await walletClient.getAddresses();

            // Duration logic
            const duration = BigInt(request.durationDays || 7) * BigInt(24 * 60 * 60);

            // Call On-chain grantUsingDelegation
            // function grantUsingDelegation(address patient, address grantee, bytes32 rootCidHash, uint40 duration)
            const hash = await walletClient.writeContract({
                account,
                address: CONSENT_LEDGER_ADDRESS,
                abi: CONSENT_LEDGER_ABI,
                functionName: 'grantUsingDelegation',
                args: [
                    request.patientAddress,
                    request.requesterAddress,
                    request.cidHash,
                    Number(duration)
                ]
            });

            toast({
                title: "Đang xử lý trên Blockchain...",
                description: "Đại diện phê duyệt đang được thực hiện. Vui lòng chờ.",
            });

            await walletClient.waitForTransactionReceipt({ hash });

            // Note: Delegate mode currently does NOT support automatic Key Sharing 
            // because Delegate doesn't have the Patient's records AES keys.
            // Doctor will have permission but needs key via other channel.

            // Notify Backend
            await requestService.grantAsDelegate({
                requestId: request.requestId,
                txHash: hash,
                // encryptedKeyPayload: null
            });

            toast({
                title: "Thành công!",
                description: "Đã phê duyệt yêu cầu thay cho bệnh nhân.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            fetchRequests();

        } catch (err) {
            console.error('Delegate approve error:', err);
            handleError(err);
        } finally {
            setProcessingId(null);
        }
    };

    const handleError = (err) => {
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
    };

    const handleArchive = async (request) => {
        setProcessingId(request.requestId);
        try {
            await relayerService.archiveRequest(request.requestId);
            toast({ title: "Đã ẩn", description: "Yêu cầu đã được ẩn." });
            fetchRequests();
        } catch (err) {
            toast({ title: "Lỗi", description: err.message, variant: "destructive" });
        } finally {
            setProcessingId(null);
        }
    };

    const handleRestore = async (request) => {
        setProcessingId(request.requestId);
        try {
            await relayerService.restoreRequest(request.requestId);
            toast({ title: "Đã khôi phục", description: "Yêu cầu đã được khôi phục." });
            fetchRequests();
        } catch (err) {
            toast({ title: "Lỗi", description: err.message, variant: "destructive" });
        } finally {
            setProcessingId(null);
        }
    };

    const isExpired = (deadline) => {
        return new Date(deadline) < new Date();
    };

    const renderRequestItem = (request, isArchived = false, isDelegate = false) => {
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
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start md:items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${expired ? 'bg-gray-100' : isDelegate ? 'bg-purple-100' : 'bg-blue-100'
                            }`}>
                            {isDelegate ? (
                                <Users className={`w-6 h-6 ${expired ? 'text-gray-400' : 'text-purple-600'}`} />
                            ) : (
                                <User className={`w-6 h-6 ${expired ? 'text-gray-400' : 'text-blue-600'}`} />
                            )}
                        </div>
                        <div>
                            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
                                <p className="font-medium text-slate-900">
                                    Bác sĩ: {request.requesterAddress?.slice(0, 8)}...{request.requesterAddress?.slice(-6)}
                                </p>
                                {isDelegate && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                        Thay mặt: {request.patientAddress?.slice(0, 6)}...
                                    </span>
                                )}
                            </div>

                            <p className="text-sm text-slate-600 mt-1">
                                📋 Hồ sơ: {request.recordTitle || `${request.cidHash?.slice(0, 12)}...`}
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

                    <div className="flex items-center gap-2 self-end md:self-auto">
                        {request.status === 'signed' && (
                            <Badge className="bg-amber-100 text-amber-800">
                                <Clock className="w-3 h-3 mr-1" />
                                Chờ bác sĩ xác nhận
                            </Badge>
                        )}
                        {!isArchived && !expired && request.status !== 'signed' && (
                            <>
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        if (isDelegate) {
                                            handleDelegateApprove(request);
                                        } else {
                                            if (request.requestType === 2) {
                                                setConfirmRequest(request);
                                            } else {
                                                handleApprove(request);
                                            }
                                        }
                                    }}
                                    disabled={processingId === request.requestId}
                                    className={isDelegate ? "bg-purple-600 hover:bg-purple-700" : "bg-green-600 hover:bg-green-700"}
                                >
                                    {processingId === request.requestId ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            {isDelegate ? <Link2 className="w-4 h-4 mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                                            {isDelegate ? 'Phê duyệt thay' : 'Duyệt'}
                                        </>
                                    )}
                                </Button>
                                {!isDelegate && (
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
                                )}
                            </>
                        )}
                        {isArchived && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRestore(request)}
                                disabled={processingId === request.requestId}
                            >
                                {processingId === request.requestId ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Khôi phục'}
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

    // Only show tabs if there are delegate requests
    const showTabs = delegateRequests.length > 0;

    return (
        <Card className="bg-white">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-slate-900 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-600" />
                    Yêu cầu truy cập
                    {(requests.length > 0 || delegateRequests.length > 0) && (
                        <Badge className="bg-red-500 text-white ml-2">{requests.length + delegateRequests.length}</Badge>
                    )}
                </CardTitle>
                <div className="flex items-center gap-2">
                    {!showTabs && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowArchived(!showArchived)}
                        >
                            <Archive className="w-4 h-4 mr-1" />
                            {showArchived ? 'Ẩn đã lưu trữ' : `Đã ẩn (${archivedRequests.length})`}
                        </Button>
                    )}
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
                {showTabs ? (
                    <Tabs defaultValue="personal" value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                            <TabsTrigger value="personal">Cá nhân ({requests.length})</TabsTrigger>
                            <TabsTrigger value="delegate">Được ủy quyền ({delegateRequests.length})</TabsTrigger>
                        </TabsList>

                        <TabsContent value="personal" className="space-y-4">
                            <div className="flex justify-end mb-2">
                                <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)}>
                                    <Archive className="w-4 h-4 mr-1" />
                                    {showArchived ? 'Ẩn đã lưu trữ' : `Đã ẩn (${archivedRequests.length})`}
                                </Button>
                            </div>

                            {requests.length === 0 && !showArchived ? (
                                <div className="text-center py-12 bg-slate-50 rounded-xl">
                                    <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                                    <p className="text-slate-500">Bạn không có yêu cầu nào.</p>
                                </div>
                            ) : (
                                <>
                                    {requests.map(request => renderRequestItem(request, false, false))}
                                    {showArchived && archivedRequests.length > 0 && (
                                        <>
                                            <div className="border-t pt-4 mt-4">
                                                <p className="text-sm font-medium text-slate-500 mb-3">Yêu cầu đã ẩn</p>
                                            </div>
                                            {archivedRequests.map(request => renderRequestItem(request, true, false))}
                                        </>
                                    )}
                                </>
                            )}
                        </TabsContent>

                        <TabsContent value="delegate" className="space-y-4">
                            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg mb-2">
                                <p className="text-sm text-purple-800 flex items-start gap-2">
                                    <Users className="w-4 h-4 mt-0.5 shrink-0" />
                                    Bạn đang xem các yêu cầu gửi đến bạn với tư cách là Bên được ủy quyền (Tổ chức/Bác sĩ/Người giám hộ).
                                </p>
                            </div>

                            {delegateRequests.length === 0 ? (
                                <div className="text-center py-12 bg-slate-50 rounded-xl">
                                    <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                                    <p className="text-slate-500">Chưa có yêu cầu nào cần duyệt thay.</p>
                                </div>
                            ) : (
                                delegateRequests.map(request => renderRequestItem(request, false, true))
                            )}
                        </TabsContent>
                    </Tabs>
                ) : (
                    /* Simple view (no tabs) if no delegate requests */
                    requests.length === 0 && !showArchived ? (
                        <div className="text-center py-12 bg-slate-50 rounded-xl">
                            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                            <p className="text-slate-500">Không có yêu cầu nào đang chờ xử lý.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {requests.map(request => renderRequestItem(request, false, false))}
                            {showArchived && archivedRequests.length > 0 && (
                                <>
                                    <div className="border-t pt-4 mt-4">
                                        <p className="text-sm font-medium text-slate-500 mb-3">Yêu cầu đã ẩn</p>
                                    </div>
                                    {archivedRequests.map(request => renderRequestItem(request, true, false))}
                                </>
                            )}
                        </div>
                    )
                )}
            </CardContent>

            <AlertDialog open={!!confirmRequest} onOpenChange={(open) => !open && setConfirmRequest(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="w-5 h-5" />
                            Cảnh báo cấp quyền Ủy quyền
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2">
                            <p>
                                Bạn đang sắp cấp quyền <strong>Ủy quyền (Delegation)</strong> cho bác sĩ này.
                            </p>
                            <p className="font-medium text-slate-800">
                                Điều này có nghĩa là Bác sĩ sẽ có quyền CHIA SẺ LẠI hồ sơ của bạn cho các bác sĩ khác (ví dụ: để hội chẩn) mà không cần hỏi lại ý kiến bạn.
                            </p>
                            <p>
                                Bạn có chắc chắn muốn tiếp tục không?
                            </p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Hủy bỏ</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                handleApprove(confirmRequest);
                                setConfirmRequest(null);
                            }}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            Đồng ý cấp quyền
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
