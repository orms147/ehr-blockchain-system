"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileCheck, Loader2, Clock, RefreshCw, CheckCircle2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { pendingUpdateService, ipfsService } from '@/services';
import { ensureArbitrumSepolia } from '@/utils/chainSwitch';
import { createWalletClient, custom, parseGwei, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { keccak256, toBytes } from 'viem';

// Contract details
const DOCTOR_UPDATE_ADDRESS = process.env.NEXT_PUBLIC_DOCTOR_UPDATE_ADDRESS;
const DOCTOR_UPDATE_ABI = parseAbi([
    'function addRecordByDoctor(bytes32 cidHash, bytes32 parentCidHash, bytes32 recordTypeHash, address patient, bytes32 doctorEncKeyHash, uint40 doctorAccessHours) external',
]);

export default function PendingUpdateClaims({ walletAddress, provider, onClaimed }) {
    const [updates, setUpdates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);

    const fetchUpdates = async () => {
        setLoading(true);
        try {
            const response = await pendingUpdateService.getApprovedUpdates();
            // Handle both {updates: [...]} and direct array response
            setUpdates(response?.updates || response || []);
        } catch (err) {
            console.error('Error fetching approved updates:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (walletAddress) {
            fetchUpdates();

            // Auto-refresh every 30 seconds
            const interval = setInterval(fetchUpdates, 30000);
            return () => clearInterval(interval);
        }
    }, [walletAddress]);

    const handleClaim = async (update) => {
        if (!provider) {
            toast({ title: "Lỗi", description: "Không có provider", variant: "destructive" });
            return;
        }

        setProcessingId(update.id);
        try {
            // 1. Ensure correct chain
            await ensureArbitrumSepolia(provider);

            // 2. Parse the encrypted content to get AES key and encryptedData
            let aesKey;
            let actualEncryptedData;
            let parsedMetadata = {};
            try {
                const decoded = atob(update.encryptedContent);
                const parsed = JSON.parse(decoded);
                aesKey = parsed.aesKey;
                actualEncryptedData = parsed.encryptedData; // The actual AES-encrypted content
                parsedMetadata = parsed.metadata || {}; // Extract metadata for title/type
            } catch (e) {
                console.error('Failed to parse encryptedContent:', e);
                throw new Error('Không thể đọc key mã hóa từ nội dung');
            }

            // 3. Upload ONLY the encrypted data to IPFS (not the whole package!)
            toast({
                title: "Đang tải lên IPFS...",
                description: "Vui lòng chờ...",
            });

            // Use title from: 1) update object, 2) metadata in encryptedContent, 3) fallback
            const recordTitle = update.title || parsedMetadata.title || 'Doctor Update';
            const recordType = update.recordType || parsedMetadata.type || 'update';
            // Upload the actual encrypted data (AES-encrypted content that can be decrypted with aesKey)
            const cid = await ipfsService.upload(actualEncryptedData, {
                name: recordTitle,
                type: recordType,
            });

            const cidHash = keccak256(toBytes(cid));

            console.log('📦 IPFS uploaded:', cid.slice(0, 20) + '...');
            // 4. Create wallet client
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });

            toast({
                title: "Đang gửi giao dịch...",
                description: "Vui lòng xác nhận trong ví.",
            });

            // 5. Calculate record type hash
            const recordTypeHash = update.recordType
                ? keccak256(toBytes(update.recordType))
                : '0x0000000000000000000000000000000000000000000000000000000000000000';

            // 6. Call DoctorUpdate.addRecordByDoctor
            const txHash = await walletClient.writeContract({
                address: DOCTOR_UPDATE_ADDRESS,
                abi: DOCTOR_UPDATE_ABI,
                functionName: 'addRecordByDoctor',
                args: [
                    cidHash,
                    update.parentCidHash,
                    recordTypeHash,
                    update.patientAddress,
                    '0x0000000000000000000000000000000000000000000000000000000000000000', // encKeyHash (not used for now)
                    24, // doctorAccessHours (24 hours)
                ],
                account: walletAddress,
                gas: BigInt(500000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });
            // 7. Mark as claimed in backend with CID and AES key
            await pendingUpdateService.claimUpdate(update.id, cidHash, txHash, cid, aesKey);

            toast({
                title: "Thành công!",
                description: "Hồ sơ đã được cập nhật on-chain. Bệnh nhân sẽ thấy phiên bản mới.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            // Refresh list
            fetchUpdates();

            // Notify parent
            if (onClaimed) {
                onClaimed(update);
            }

        } catch (err) {
            console.error('Claim error:', err);

            const errorMsg = String(err.message || '');
            if (errorMsg.toLowerCase().includes('insufficient funds')) {
                toast({
                    title: "Không đủ ETH",
                    description: "Ví của bạn không đủ ETH để trả phí giao dịch.",
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
                    description: err.message || "Không thể xác nhận cập nhật",
                    variant: "destructive",
                });
            }
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                <span className="ml-2 text-slate-600">Đang tải...</span>
            </div>
        );
    }

    if (updates.length === 0) {
        return null; // Don't show section if no approved updates
    }

    return (
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg text-blue-800 flex items-center gap-2">
                    <FileCheck className="w-5 h-5" />
                    Cập nhật đã duyệt
                    <Badge className="bg-blue-600 text-white">{updates.length}</Badge>
                </CardTitle>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchUpdates}
                    disabled={loading}
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {updates.map((update) => (
                        <motion.div
                            key={update.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center justify-between p-3 bg-white rounded-xl border border-blue-200"
                        >
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <User className="w-4 h-4 text-slate-500" />
                                    <span className="text-sm font-medium text-slate-800">
                                        Bệnh nhân: {update.patientAddress?.slice(0, 8)}...{update.patientAddress?.slice(-6)}
                                    </span>
                                </div>
                                {update.title && (
                                    <p className="text-sm text-blue-700 font-medium">{update.title}</p>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    <span className="text-xs text-slate-500">
                                        Duyệt lúc: {new Date(update.approvedAt).toLocaleString('vi-VN')}
                                    </span>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                onClick={() => handleClaim(update)}
                                disabled={processingId === update.id}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {processingId === update.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 mr-1" />
                                        Xác nhận
                                    </>
                                )}
                            </Button>
                        </motion.div>
                    ))}
                </div>
                <p className="text-xs text-slate-500 mt-3 text-center">
                    Bạn sẽ trả phí gas khi xác nhận cập nhật on-chain
                </p>
            </CardContent>
        </Card>
    );
}
