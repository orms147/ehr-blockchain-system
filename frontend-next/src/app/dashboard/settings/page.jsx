"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Wallet, Copy, CheckCircle, ExternalLink,
    ArrowDownToLine, Info, Shield, Coins
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import DashboardLayout from '@/components/layout/DashboardLayout';

export default function SettingsPage() {
    const { address, loading } = useWalletAddress();
    const [copied, setCopied] = useState(false);

    const copyAddress = () => {
        if (address) {
            navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast({ title: "Đã sao chép địa chỉ ví!" });
        }
    };

    const openFaucet = () => {
        window.open('https://www.alchemy.com/faucets/arbitrum-sepolia', '_blank');
    };

    const viewOnExplorer = () => {
        if (address) {
            window.open(`https://sepolia.arbiscan.io/address/${address}`, '_blank');
        }
    };

    return (
        <DashboardLayout>
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">Cài đặt</h1>
                    <p className="text-slate-500">Quản lý ví và cấu hình tài khoản</p>
                </div>

                {/* Wallet Section */}
                <Card className="bg-gradient-to-br from-blue-600 to-teal-600 text-white">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-white">
                            <Wallet className="w-5 h-5" />
                            Ví Blockchain của bạn
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Address */}
                        <div className="bg-white/20 backdrop-blur rounded-xl p-4">
                            <p className="text-sm text-white/80 mb-2">Địa chỉ ví (Arbitrum Sepolia)</p>
                            <div className="flex items-center gap-2">
                                <code className="flex-1 font-mono text-sm bg-white/10 px-3 py-2 rounded-lg break-all">
                                    {loading ? 'Đang tải...' : (address || 'Chưa kết nối')}
                                </code>
                                {address && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={copyAddress}
                                        className="shrink-0 text-white hover:bg-white/20"
                                    >
                                        {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        {address && (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={viewOnExplorer}
                                    className="bg-white/20 hover:bg-white/30 text-white border-0"
                                >
                                    <ExternalLink className="w-4 h-4 mr-1" />
                                    Xem trên Arbiscan
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Fund Wallet Section */}
                <Card className="bg-white border-2 border-teal-200">
                    <CardHeader className="bg-teal-50">
                        <CardTitle className="flex items-center gap-2 text-teal-800">
                            <Coins className="w-5 h-5" />
                            Nạp ETH để không giới hạn quota
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        {/* Info */}
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                            <div className="flex items-start gap-3">
                                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-800">
                                    <p className="font-medium mb-1">Tại sao cần nạp ETH?</p>
                                    <p>Khi ví có ETH, bạn có thể tự trả gas và không bị giới hạn số lần upload/revoke mỗi tháng.</p>
                                </div>
                            </div>
                        </div>

                        {/* Steps */}
                        <div className="space-y-3">
                            <h4 className="font-semibold text-slate-900">Cách nạp ETH (Testnet):</h4>

                            <div className="space-y-2">
                                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                                    <span className="w-6 h-6 bg-teal-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">1</span>
                                    <div>
                                        <p className="font-medium text-slate-900">Sao chép địa chỉ ví</p>
                                        <p className="text-sm text-slate-600">Click nút copy ở card phía trên</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                                    <span className="w-6 h-6 bg-teal-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">2</span>
                                    <div>
                                        <p className="font-medium text-slate-900">Nhận ETH testnet miễn phí</p>
                                        <p className="text-sm text-slate-600">Truy cập faucet và dán địa chỉ ví</p>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={openFaucet}
                                            className="mt-2 text-teal-700 border-teal-300 hover:bg-teal-50"
                                        >
                                            <ArrowDownToLine className="w-4 h-4 mr-1" />
                                            Mở Alchemy Faucet
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                                    <span className="w-6 h-6 bg-teal-500 text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">3</span>
                                    <div>
                                        <p className="font-medium text-slate-900">Hoặc gửi từ MetaMask</p>
                                        <p className="text-sm text-slate-600">Nếu bạn có ETH trên Arbitrum Sepolia trong MetaMask, gửi tới địa chỉ ví phía trên</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Note */}
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-800">
                                <strong>Lưu ý:</strong> Đây là mạng testnet (Arbitrum Sepolia). ETH trên testnet không có giá trị thực.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Security Info */}
                <Card className="bg-slate-50 border-slate-200">
                    <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                            <Shield className="w-6 h-6 text-teal-600 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-slate-900 mb-1">Bảo mật</h3>
                                <p className="text-sm text-slate-600">
                                    Khóa riêng của bạn được mã hóa và lưu trữ an toàn bởi Web3Auth.
                                    Hệ thống EHR Chain <strong>không có quyền truy cập</strong> vào khóa riêng -
                                    chỉ bạn mới có thể ký giao dịch.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
