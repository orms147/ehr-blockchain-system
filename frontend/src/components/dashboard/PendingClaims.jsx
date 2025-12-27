"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Clock, RefreshCw, Gift, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { requestService } from '@/services';
import { ensureArbitrumSepolia } from '@/utils/chainSwitch';
import { createWalletClient, custom, parseGwei } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { EHR_SYSTEM_ABI } from '@/abi/EHRSystemSecure';

const EHR_SYSTEM_ADDRESS = process.env.NEXT_PUBLIC_EHR_SYSTEM_ADDRESS;
const MIN_APPROVAL_DELAY = 15; // 15 seconds

// Helper to calculate seconds remaining
function getSecondsRemaining(createdAt) {
    const createdTime = new Date(createdAt).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - createdTime) / 1000);
    const remaining = MIN_APPROVAL_DELAY - elapsed;
    return Math.max(0, remaining);
}

export default function PendingClaims({ walletAddress, provider, onClaimed }) {
    const [claims, setClaims] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [countdown, setCountdown] = useState({}); // { requestId: secondsRemaining }

    const fetchClaims = async () => {
        setLoading(true);
        try {
            const response = await requestService.getSignedRequests();
            const newClaims = response.requests || [];
            setClaims(newClaims);

            // Initialize countdown for each claim
            const newCountdown = {};
            newClaims.forEach(claim => {
                newCountdown[claim.requestId] = getSecondsRemaining(claim.createdAt);
            });
            setCountdown(newCountdown);
        } catch (err) {
            console.error('Error fetching claims:', err);
            toast({
                title: "Lỗi",
                description: "Không thể tải danh sách phê duyệt",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (walletAddress) {
            fetchClaims();

            // Auto-refresh every 30 seconds
            const interval = setInterval(fetchClaims, 30000);
            return () => clearInterval(interval);
        }
    }, [walletAddress]);

    // Countdown timer effect
    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(prev => {
                const updated = { ...prev };
                let hasChanges = false;
                Object.keys(updated).forEach(id => {
                    if (updated[id] > 0) {
                        updated[id] = updated[id] - 1;
                        hasChanges = true;
                    }
                });
                return hasChanges ? updated : prev;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const handleClaim = async (claim) => {
        // Check if still waiting
        if (countdown[claim.requestId] > 0) {
            toast({
                title: `⏳ Vui lòng chờ ${countdown[claim.requestId]} giây`,
                description: "Cần đợi ít nhất 15 giây sau khi yêu cầu được tạo.",
                variant: "destructive",
            });
            return;
        }

        if (!provider) {
            toast({ title: "Lỗi", description: "Không có provider", variant: "destructive" });
            return;
        }

        setProcessingId(claim.requestId);
        try {
            await ensureArbitrumSepolia(provider);

            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });

            toast({
                title: "Đang xác nhận on-chain...",
                description: "Vui lòng xác nhận giao dịch trong ví.",
            });
            const txHash = await walletClient.writeContract({
                address: EHR_SYSTEM_ADDRESS,
                abi: EHR_SYSTEM_ABI,
                functionName: 'confirmAccessRequestWithSignature',
                args: [claim.requestId, BigInt(claim.signatureDeadline), claim.signature],
                account: walletAddress,
                gas: BigInt(300000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });
            await requestService.markClaimed(claim.requestId, txHash);

            toast({
                title: "Đã nhận quyền truy cập!",
                description: "Bạn có thể xem hồ sơ bệnh nhân trong mục 'Hồ sơ đã chia sẻ'.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            fetchClaims();
            if (onClaimed) onClaimed(claim);

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
            } else if (errorMsg.includes('ApprovalTooSoon') || errorMsg.includes('0x3d693ada')) {
                // Reset countdown to 15 seconds
                setCountdown(prev => ({ ...prev, [claim.requestId]: MIN_APPROVAL_DELAY }));
                toast({
                    title: "⏳ Vui lòng chờ thêm",
                    description: "Cần đợi ít nhất 15 giây. Đếm ngược đã được cập nhật.",
                    variant: "destructive",
                });
            } else {
                toast({
                    title: "Lỗi",
                    description: err.message || "Không thể nhận quyền truy cập",
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

    if (claims.length === 0) {
        return null;
    }

    return (
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg text-green-800 flex items-center gap-2">
                    <Gift className="w-5 h-5" />
                    Phê duyệt đang chờ nhận
                    <Badge className="bg-green-600 text-white">{claims.length}</Badge>
                </CardTitle>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchClaims}
                    disabled={loading}
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {claims.map((claim) => {
                        const secondsLeft = countdown[claim.requestId] || 0;
                        const isWaiting = secondsLeft > 0;
                        const isProcessing = processingId === claim.requestId;

                        return (
                            <motion.div
                                key={claim.requestId}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center justify-between p-3 bg-white rounded-xl border border-green-200"
                            >
                                <div>
                                    <p className="text-sm font-medium text-slate-800">
                                        Bệnh nhân: {claim.patientAddress?.slice(0, 8)}...{claim.patientAddress?.slice(-6)}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        <span className="text-xs text-slate-500">
                                            Đã ký: {new Date(claim.createdAt).toLocaleString('vi-VN')}
                                        </span>
                                    </div>
                                </div>

                                {isWaiting ? (
                                    <div className="flex items-center gap-2 text-amber-600">
                                        <Timer className="w-4 h-4 animate-pulse" />
                                        <span className="text-sm font-medium">
                                            Chờ {secondsLeft}s
                                        </span>
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        onClick={() => handleClaim(claim)}
                                        disabled={isProcessing}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        {isProcessing ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                                Nhận truy cập
                                            </>
                                        )}
                                    </Button>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
                <p className="text-xs text-slate-500 mt-3 text-center">
                    Bạn sẽ trả phí gas khi nhận quyền truy cập
                </p>
            </CardContent>
        </Card>
    );
}
