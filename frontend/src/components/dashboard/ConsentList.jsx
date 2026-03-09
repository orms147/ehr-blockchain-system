"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Shield, Lock, Unlock, Loader2, RefreshCw,
    AlertTriangle, User, Clock, XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { keyShareService, relayerService } from '@/services';
import UserName from '@/components/ui/UserName';

export default function ConsentList({ walletAddress }) {
    const [consents, setConsents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [revokingId, setRevokingId] = useState(null);
    const [quota, setQuota] = useState(null);

    const fetchConsents = async () => {
        setLoading(true);
        try {
            // Get shared keys as a proxy for active consents
            // In production, this should query on-chain consents or The Graph
            const keys = await keyShareService.getSentKeys();

            // Filter to only show active (not revoked) shares
            const activeConsents = keys.filter(k => k.status !== 'revoked');
            setConsents(activeConsents);
        } catch (err) {
            console.error('Error fetching consents:', err);
            toast({
                title: "Lỗi",
                description: "Không thể tải danh sách quyền truy cập",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchQuota = async () => {
        try {
            const quotaData = await relayerService.getQuotaStatus();
            setQuota(quotaData);
        } catch (err) {
        }
    };

    useEffect(() => {
        if (walletAddress) {
            fetchConsents();
            fetchQuota();
        }
    }, [walletAddress]);

    const handleRevoke = async (consent) => {
        // Confirm before revoke
        const confirmed = window.confirm(
            `Bạn có chắc muốn thu hồi quyền truy cập của ${consent.recipientAddress?.slice(0, 8)}...?`
        );
        if (!confirmed) return;

        // Check quota
        if (quota && quota.revokesRemaining <= 0 && !quota.hasSelfWallet) {
            toast({
                title: "Hết quota",
                description: "Bạn đã hết lượt revoke miễn phí tháng này. Vui lòng kết nối ví có ETH hoặc chờ đến tháng sau.",
                variant: "destructive",
            });
            return;
        }

        // Prevent double-clicks by immediately removing from list
        setRevokingId(consent.id);
        const previousConsents = [...consents];
        setConsents(prev => prev.filter(c => c.id !== consent.id));

        try {
            // Use unified revoke API that handles on-chain + DB
            const { recordService } = await import('@/services');
            await recordService.revokeAccess(consent.cidHash, consent.recipientAddress);

            toast({
                title: "Đã thu hồi!",
                description: "Quyền truy cập đã được thu hồi on-chain thành công.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            // Refresh quota
            fetchQuota();
        } catch (err) {
            console.error('Revoke error:', err);
            // Restore list on error
            setConsents(previousConsents);
            toast({
                title: "Lỗi thu hồi",
                description: err.message || "Không thể thu hồi quyền truy cập. Vui lòng thử lại.",
                variant: "destructive",
            });
        } finally {
            setRevokingId(null);
        }
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
                    <Lock className="w-5 h-5 text-orange-600" />
                    Quyền truy cập đã cấp
                    {consents.length > 0 && (
                        <Badge className="bg-orange-500 text-white ml-2">{consents.length}</Badge>
                    )}
                </CardTitle>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchConsents}
                    disabled={loading}
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </CardHeader>
            <CardContent>
                {/* Quota warning */}
                {quota && !quota.hasSelfWallet && quota.revokesRemaining <= 5 && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        <span className="text-sm text-yellow-800">
                            Còn <strong>{quota.revokesRemaining}</strong> lượt thu hồi miễn phí tháng này
                        </span>
                    </div>
                )}

                {consents.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl">
                        <Shield className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-500">Bạn chưa cấp quyền truy cập cho ai.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {consents.map((consent) => (
                            <motion.div
                                key={consent.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-xl border bg-white border-slate-200 hover:border-orange-300 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                                            <User className="w-6 h-6 text-orange-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-900">
                                                Người được cấp: <UserName address={consent.recipientAddress} />
                                            </p>
                                            <p className="text-xs text-teal-600 font-medium">
                                                🩺 Bác sĩ
                                            </p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge className={
                                                    consent.status === 'claimed'
                                                        ? 'bg-green-100 text-green-800'
                                                        : consent.status === 'rejected'
                                                            ? 'bg-red-100 text-red-800'
                                                            : 'bg-blue-100 text-blue-800'
                                                }>
                                                    {consent.status === 'claimed'
                                                        ? 'Đã xem'
                                                        : consent.status === 'rejected'
                                                            ? 'Đã từ chối'
                                                            : 'Chưa xem'}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Cấp lúc: {new Date(consent.createdAt).toLocaleString('vi-VN')}
                                            </p>
                                            {consent.expiresAt ? (
                                                <p className={`text-xs font-medium mt-1 ${new Date(consent.expiresAt) < new Date() ? 'text-red-500' : 'text-orange-500'}`}>
                                                    ⏱️ {new Date(consent.expiresAt) < new Date()
                                                        ? 'Đã hết hạn'
                                                        : `Hết hạn: ${new Date(consent.expiresAt).toLocaleString('vi-VN')}`}
                                                </p>
                                            ) : (
                                                <p className="text-xs text-green-600 font-medium mt-1">
                                                    ∞ Vĩnh viễn
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleRevoke(consent)}
                                        disabled={revokingId === consent.id}
                                        className="bg-red-600 hover:bg-red-700"
                                    >
                                        {revokingId === consent.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <XCircle className="w-4 h-4 mr-1" />
                                                Thu hồi
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
