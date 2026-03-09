"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    FileEdit, CheckCircle2, XCircle, Loader2, Clock, RefreshCw,
    Eye, User, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { pendingUpdateService } from '@/services';
import UserName from '@/components/ui/UserName';

export default function PendingUpdatesSection({ walletAddress, onUpdated }) {
    const [updates, setUpdates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);

    const fetchUpdates = async () => {
        setLoading(true);
        try {
            const response = await pendingUpdateService.getIncomingUpdates();
            setUpdates(response.updates || []);
        } catch (err) {
            console.error('Error fetching pending updates:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (walletAddress) {
            fetchUpdates();
        }
    }, [walletAddress]);

    const handleApprove = async (id) => {
        setProcessingId(id);
        try {
            await pendingUpdateService.approveUpdate(id);
            toast({
                title: "Đã phê duyệt!",
                description: "Bác sĩ có thể xác nhận cập nhật này.",
                className: "bg-green-50 border-green-200 text-green-800",
            });
            fetchUpdates();
            if (onUpdated) onUpdated();
        } catch (err) {
            console.error('Error approving:', err);
            toast({
                title: "Lỗi",
                description: err.response?.data?.error || "Không thể phê duyệt",
                variant: "destructive",
            });
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (id) => {
        setProcessingId(id);
        try {
            await pendingUpdateService.rejectUpdate(id);
            toast({
                title: "Đã từ chối",
                description: "Yêu cầu cập nhật đã bị từ chối.",
            });
            fetchUpdates();
            if (onUpdated) onUpdated();
        } catch (err) {
            console.error('Error rejecting:', err);
            toast({
                title: "Lỗi",
                description: err.response?.data?.error || "Không thể từ chối",
                variant: "destructive",
            });
        } finally {
            setProcessingId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                <span className="ml-2 text-slate-600">Đang tải...</span>
            </div>
        );
    }

    if (updates.length === 0) {
        return null; // Don't show section if no pending updates
    }

    return (
        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg text-amber-800 flex items-center gap-2">
                    <FileEdit className="w-5 h-5" />
                    Cập nhật chờ duyệt
                    <Badge className="bg-amber-600 text-white">{updates.length}</Badge>
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
                            className="p-4 bg-white rounded-xl border border-amber-200"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <User className="w-4 h-4 text-slate-500" />
                                        <span className="text-sm font-medium text-slate-800">
                                            Bác sĩ: <UserName address={update.doctorAddress} className="font-semibold" />
                                        </span>
                                    </div>

                                    {update.title && (
                                        <p className="text-sm font-medium text-amber-900 mb-1">
                                            {update.title}
                                        </p>
                                    )}

                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            <span>
                                                {new Date(update.createdAt).toLocaleString('vi-VN')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            <span>
                                                Hết hạn: {new Date(update.expiresAt).toLocaleDateString('vi-VN')}
                                            </span>
                                        </div>
                                    </div>

                                    <p className="text-xs text-slate-400 mt-1">
                                        Hồ sơ gốc: {update.parentCidHash?.slice(0, 16)}...
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 ml-4">
                                    <Button
                                        size="sm"
                                        onClick={() => handleApprove(update.id)}
                                        disabled={processingId === update.id}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        {processingId === update.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                                Đồng ý
                                            </>
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleReject(update.id)}
                                        disabled={processingId === update.id}
                                        className="border-red-300 text-red-600 hover:bg-red-50"
                                    >
                                        <XCircle className="w-4 h-4 mr-1" />
                                        Từ chối
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <p className="text-xs text-slate-500 mt-3 text-center">
                    Bác sĩ muốn cập nhật hồ sơ của bạn. Xem xét và phê duyệt nếu đồng ý.
                </p>
            </CardContent>
        </Card>
    );
}
