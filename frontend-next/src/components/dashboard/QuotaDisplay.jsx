"use client";

import React, { useState, useEffect } from 'react';
import { relayerService } from '@/services';
import { Wallet, Upload, Shield, RefreshCw, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function QuotaDisplay({ walletAddress }) {
    const [quota, setQuota] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchQuota = async () => {
        setLoading(true);
        try {
            const data = await relayerService.getQuotaStatus();
            setQuota(data);
        } catch (err) {
            console.error('Error fetching quota:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (walletAddress) {
            fetchQuota();
        } else {
            setLoading(false);
        }
    }, [walletAddress]);

    // No wallet connected
    if (!walletAddress) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-400 p-2 bg-slate-50 rounded-lg">
                <Wallet className="w-4 h-4" />
                Đăng nhập để xem quota
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang tải quota...
            </div>
        );
    }


    if (!quota) {
        return null;
    }

    // If user has own wallet, show unlimited
    if (quota.hasSelfWallet) {
        return (
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200">
                <Wallet className="w-5 h-5 text-green-600" />
                <div>
                    <p className="text-sm font-medium text-green-800">Ví riêng - Không giới hạn</p>
                    <p className="text-xs text-green-600">Bạn đang dùng ví có ETH, không bị giới hạn quota</p>
                </div>
            </div>
        );
    }

    // Show quota stats
    const uploadPercent = (quota.uploadsRemaining / (quota.limits?.UPLOADS_PER_MONTH || 100)) * 100;
    const revokePercent = (quota.revokesRemaining / (quota.limits?.REVOKES_PER_MONTH || 20)) * 100;

    return (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-teal-50 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-600" />
                    Quota miễn phí tháng này
                </h4>
                <button
                    onClick={fetchQuota}
                    className="p-1 hover:bg-blue-100 rounded-lg transition-colors"
                >
                    <RefreshCw className="w-4 h-4 text-slate-500" />
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Upload quota */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 flex items-center gap-1">
                            <Upload className="w-3 h-3" />
                            Upload/Cập nhật
                        </span>
                        <span className="font-medium text-slate-900">
                            {quota.uploadsRemaining}/{quota.limits?.UPLOADS_PER_MONTH || 100}
                        </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${uploadPercent > 50 ? 'bg-green-500' :
                                uploadPercent > 20 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                            style={{ width: `${uploadPercent}%` }}
                        />
                    </div>
                </div>

                {/* Revoke quota */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            Thu hồi
                        </span>
                        <span className="font-medium text-slate-900">
                            {quota.revokesRemaining}/{quota.limits?.REVOKES_PER_MONTH || 20}
                        </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${revokePercent > 50 ? 'bg-green-500' :
                                revokePercent > 20 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                            style={{ width: `${revokePercent}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Reset date */}
            <p className="text-xs text-slate-500 mt-3">
                Reset vào đầu tháng sau •
                <span className="text-blue-600 ml-1 cursor-pointer hover:underline">
                    Kết nối ví → không giới hạn
                </span>
            </p>
        </div>
    );
}
