"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    User, Wallet, Copy, CheckCircle, Shield,
    Key, ExternalLink, Eye, EyeOff, AlertTriangle,
    Coins, RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { useWeb3Auth, useWeb3AuthUser } from '@web3auth/modal/react';
import useWalletAddress from '@/hooks/useWalletAddress';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { createPublicClient, http, formatEther } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

// Public client for balance check
const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http('https://sepolia-rollup.arbitrum.io/rpc'),
});

export default function ProfilePage() {
    const { isConnected, provider } = useWeb3Auth();
    const { userInfo } = useWeb3AuthUser();
    const { address, loading: addressLoading } = useWalletAddress();

    const [copied, setCopied] = useState(false);
    const [copiedPK, setCopiedPK] = useState(false);
    const [balance, setBalance] = useState(null);
    const [loadingBalance, setLoadingBalance] = useState(false);

    // Private key reveal state
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [privateKey, setPrivateKey] = useState(null);
    const [holdProgress, setHoldProgress] = useState(0);
    const [isHolding, setIsHolding] = useState(false);
    const holdTimerRef = useRef(null);
    const progressIntervalRef = useRef(null);

    // Fetch ETH balance
    const fetchBalance = useCallback(async () => {
        if (!address) return;
        setLoadingBalance(true);
        try {
            const bal = await publicClient.getBalance({ address });
            setBalance(formatEther(bal));
        } catch (err) {
            console.error('Error fetching balance:', err);
            setBalance('0');
        } finally {
            setLoadingBalance(false);
        }
    }, [address]);

    useEffect(() => {
        if (address) {
            fetchBalance();
        }
    }, [address, fetchBalance]);

    // Copy address
    const copyAddress = () => {
        if (address) {
            navigator.clipboard.writeText(address);
            setCopied(true);
            toast({
                title: "Đã sao chép!",
                description: "Địa chỉ ví đã được sao chép vào clipboard",
            });
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Copy private key
    const copyPrivateKey = () => {
        if (privateKey) {
            navigator.clipboard.writeText(privateKey);
            setCopiedPK(true);
            toast({
                title: "Đã sao chép Private Key!",
                description: "Lưu ý: Không chia sẻ private key với ai!",
                variant: "warning",
            });
            setTimeout(() => setCopiedPK(false), 2000);
        }
    };

    const viewOnExplorer = () => {
        if (address) {
            window.open(`https://sepolia.arbiscan.io/address/${address}`, '_blank');
        }
    };

    // Get private key from Web3Auth - try multiple methods
    const getPrivateKey = async () => {
        if (!provider) {
            toast({
                title: "Lỗi",
                description: "Không thể lấy private key. Provider không khả dụng.",
                variant: "destructive",
            });
            return null;
        }

        // Try different methods to get private key
        const methods = ['private_key', 'eth_private_key', 'solana_privateKey'];

        for (const method of methods) {
            try {
                const pk = await provider.request({ method });
                if (pk) {
                    return pk.startsWith('0x') ? pk : `0x${pk}`;
                }
            } catch (err) {
                console.log(`Method ${method} not available, trying next...`);
            }
        }

        // If all methods fail, show error
        toast({
            title: "Không thể xuất Private Key",
            description: "Tính năng này có thể không khả dụng với phương thức đăng nhập của bạn. Hãy thử đăng nhập lại hoặc sử dụng ví MetaMask.",
            variant: "destructive",
        });
        return null;
    };

    // Hold to reveal handlers
    const handleHoldStart = () => {
        setIsHolding(true);
        setHoldProgress(0);

        // Progress animation (3 seconds)
        const startTime = Date.now();
        const duration = 3000; // 3 seconds

        progressIntervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min((elapsed / duration) * 100, 100);
            setHoldProgress(progress);

            if (progress >= 100) {
                clearInterval(progressIntervalRef.current);
            }
        }, 50);

        // Complete after 3 seconds
        holdTimerRef.current = setTimeout(async () => {
            clearInterval(progressIntervalRef.current);
            const pk = await getPrivateKey();
            if (pk) {
                setPrivateKey(pk);
                setShowPrivateKey(true);
            }
            setIsHolding(false);
            setHoldProgress(0);
        }, duration);
    };

    const handleHoldEnd = () => {
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
        }
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
        }
        setIsHolding(false);
        setHoldProgress(0);
    };

    const hidePrivateKey = () => {
        setShowPrivateKey(false);
        setPrivateKey(null);
    };

    // Get user role from URL or localStorage
    const getUserRole = () => {
        if (typeof window !== 'undefined') {
            const path = window.location.pathname;
            if (path.includes('/doctor')) return 'doctor';
            if (path.includes('/admin')) return 'admin';
            const stored = localStorage.getItem('userRole');
            if (stored) return stored;
        }
        return 'patient';
    };

    const role = getUserRole();

    const roleInfo = {
        patient: { label: 'Bệnh nhân', color: 'bg-blue-100 text-blue-800', icon: User },
        doctor: { label: 'Bác sĩ', color: 'bg-green-100 text-green-800', icon: Shield },
        organization: { label: 'Tổ chức', color: 'bg-orange-100 text-orange-800', icon: Shield },
        admin: { label: 'Quản trị', color: 'bg-purple-100 text-purple-800', icon: Key },
    };


    const current = roleInfo[role] || roleInfo.patient;

    return (
        <DashboardLayout>
            <div className="max-w-2xl mx-auto space-y-6">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <h1 className="text-3xl font-bold text-slate-900 mb-2">Hồ sơ của tôi</h1>
                    <p className="text-slate-500">Thông tin tài khoản và ví blockchain</p>
                </motion.div>

                {/* Wallet Card with Balance */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                >
                    <Card className="bg-gradient-to-br from-blue-600 to-teal-600 text-white overflow-hidden">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-white">
                                <Wallet className="w-5 h-5" />
                                Ví Blockchain
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {/* Balance */}
                                <div className="flex items-center justify-between bg-white/20 backdrop-blur rounded-xl p-4">
                                    <div>
                                        <p className="text-sm text-white/80 mb-1">Số dư</p>
                                        <div className="flex items-center gap-2">
                                            <Coins className="w-5 h-5" />
                                            <span className="text-2xl font-bold">
                                                {loadingBalance ? (
                                                    <RefreshCw className="w-5 h-5 animate-spin" />
                                                ) : (
                                                    `${parseFloat(balance || 0).toFixed(6)} ETH`
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={fetchBalance}
                                        className="text-white hover:bg-white/20"
                                        disabled={loadingBalance}
                                    >
                                        <RefreshCw className={`w-4 h-4 ${loadingBalance ? 'animate-spin' : ''}`} />
                                    </Button>
                                </div>

                                {/* Address */}
                                <div className="bg-white/10 rounded-xl p-4">
                                    <p className="text-sm text-white/80 mb-2">Địa chỉ ví</p>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 font-mono text-sm bg-white/10 px-3 py-2 rounded-lg break-all">
                                            {addressLoading ? 'Đang tải...' : (address || 'Không có địa chỉ')}

                                        </code>
                                        {address && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={copyAddress}
                                                    className="shrink-0 text-white hover:bg-white/20"
                                                >
                                                    {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={viewOnExplorer}
                                                    className="shrink-0 text-white hover:bg-white/20"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* User Info Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    <Card className="bg-white">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-slate-900">
                                <User className="w-5 h-5 text-teal-600" />
                                Thông tin tài khoản
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Role */}
                            <div className="flex items-center justify-between py-3 border-b">
                                <span className="text-slate-600">Vai trò</span>
                                <Badge className={current.color}>
                                    {current.label}
                                </Badge>
                            </div>

                            {/* Email (from Web3Auth) */}
                            {userInfo?.email && (
                                <div className="flex items-center justify-between py-3 border-b">
                                    <span className="text-slate-600">Email</span>
                                    <span className="text-slate-900">{userInfo.email}</span>
                                </div>
                            )}

                            {/* Name */}
                            {userInfo?.name && (
                                <div className="flex items-center justify-between py-3 border-b">
                                    <span className="text-slate-600">Tên</span>
                                    <span className="text-slate-900">{userInfo.name}</span>
                                </div>
                            )}

                            {/* Connection status */}
                            <div className="flex items-center justify-between py-3">
                                <span className="text-slate-600">Trạng thái</span>
                                <Badge className={isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                                    {isConnected ? 'Đã kết nối' : 'Chưa kết nối'}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Private Key Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <Card className="bg-amber-50 border-amber-200">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-amber-900">
                                <Key className="w-5 h-5" />
                                Private Key
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {/* Warning */}
                            <div className="flex items-start gap-3 bg-amber-100 rounded-lg p-3 mb-4">
                                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                <div className="text-sm text-amber-800">
                                    <p className="font-semibold mb-1">Cảnh báo bảo mật</p>
                                    <p>
                                        Private key cho phép kiểm soát hoàn toàn ví của bạn.
                                        <strong> KHÔNG BAO GIỜ</strong> chia sẻ với bất kỳ ai.
                                    </p>
                                </div>
                            </div>

                            {!showPrivateKey ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-slate-600">
                                        Giữ nút bên dưới 3 giây để hiển thị private key.
                                        Bạn có thể import key này vào MetaMask hoặc ví khác.
                                    </p>

                                    {/* Hold to reveal button */}
                                    <div className="relative">
                                        <Button
                                            className="w-full relative overflow-hidden bg-amber-600 hover:bg-amber-700 text-white"
                                            onMouseDown={handleHoldStart}
                                            onMouseUp={handleHoldEnd}
                                            onMouseLeave={handleHoldEnd}
                                            onTouchStart={handleHoldStart}
                                            onTouchEnd={handleHoldEnd}
                                        >
                                            {/* Progress overlay */}
                                            {isHolding && (
                                                <div
                                                    className="absolute left-0 top-0 bottom-0 bg-amber-800 transition-all duration-75"
                                                    style={{ width: `${holdProgress}%` }}
                                                />
                                            )}
                                            <span className="relative flex items-center justify-center gap-2">
                                                <Eye className="w-4 h-4" />
                                                {isHolding
                                                    ? `Giữ... ${Math.round(holdProgress)}%`
                                                    : 'Giữ để hiển thị Private Key'
                                                }
                                            </span>
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Revealed private key */}
                                    <div className="bg-white rounded-lg p-4 border border-amber-200">
                                        <p className="text-xs text-slate-500 mb-2">Private Key của bạn:</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 font-mono text-xs bg-slate-100 px-3 py-2 rounded break-all">
                                                {privateKey}
                                            </code>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={copyPrivateKey}
                                            >
                                                {copiedPK ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Instructions */}
                                    <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
                                        <p className="font-medium mb-1">💡 Cách import vào MetaMask:</p>
                                        <ol className="list-decimal list-inside space-y-1 text-xs">
                                            <li>Mở MetaMask → Click vào icon tài khoản</li>
                                            <li>Chọn &quot;Import Account&quot;</li>
                                            <li>Dán Private Key vào và nhấn &quot;Import&quot;</li>
                                        </ol>
                                    </div>

                                    <Button
                                        className="w-full"
                                        variant="outline"
                                        onClick={hidePrivateKey}
                                    >
                                        <EyeOff className="w-4 h-4 mr-2" />
                                        Ẩn Private Key
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Security Info */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <Card className="bg-slate-50 border-slate-200">
                        <CardContent className="pt-6">
                            <div className="flex items-start gap-3">
                                <Shield className="w-6 h-6 text-teal-600 shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="font-semibold text-slate-900 mb-1">Bảo mật & Phi tập trung</h3>
                                    <p className="text-sm text-slate-600">
                                        Khóa riêng được mã hóa và lưu trữ an toàn bởi Web3Auth.
                                        Hệ thống EHR Chain <strong>không lưu trữ</strong> private key của bạn.
                                        Bạn có thể export key và import vào ví khác bất kỳ lúc nào.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </DashboardLayout>
    );
}
