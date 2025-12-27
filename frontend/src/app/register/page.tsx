"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useWeb3Auth } from '@web3auth/modal/react';
import { User, Stethoscope, Loader2, CheckCircle, ArrowRight, Shield, Wallet, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { relayerService } from '@/services';

export default function RegisterPage() {
    const router = useRouter();
    const { provider, isConnected } = useWeb3Auth();

    const [selectedRole, setSelectedRole] = useState<'patient' | 'doctor' | null>(null);
    const [isRegistering, setIsRegistering] = useState(false);
    const [step, setStep] = useState<'select' | 'confirm' | 'success'>('select');
    const [walletAddress, setWalletAddress] = useState<string>('');
    const [quota, setQuota] = useState<any>(null);

    // Get wallet address and quota on load
    useEffect(() => {
        const init = async () => {
            if (provider && isConnected) {
                try {
                    const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
                    if (accounts[0]) {
                        setWalletAddress(accounts[0]);

                        // Fetch quota status
                        try {
                            const quotaData = await relayerService.getQuotaStatus();
                            setQuota(quotaData);
                        } catch {
                            // Quota fetch fails before login, silently ignore
                        }
                    }
                } catch (e) {
                    console.error('Error getting address:', e);
                }
            }
        };
        init();
    }, [provider, isConnected]);

    // Redirect if not connected
    useEffect(() => {
        if (!isConnected && !provider) {
            router.push('/login');
        }
    }, [isConnected, provider, router]);

    const handleRegister = async () => {
        if (!selectedRole || !walletAddress) return;

        setIsRegistering(true);
        setStep('confirm');

        try {
            // Use backend relayer for gas sponsorship
            const result = await relayerService.sponsoredRegister(selectedRole);
            setStep('success');

            toast({
                title: "Đăng ký thành công!",
                description: result.alreadyRegistered
                    ? "Bạn đã có role này trước đó"
                    : selectedRole === 'patient'
                        ? "Bạn đã đăng ký làm Bệnh nhân - Được tài trợ bởi hệ thống"
                        : "Bạn đã đăng ký làm Bác sĩ. Vui lòng chờ xác thực.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            // Save role to localStorage for profile page (multi-role support)
            const existingRolesStr = localStorage.getItem('userRoles');
            const existingRoles = existingRolesStr ? JSON.parse(existingRolesStr) : [];

            // Add new role if not already exists
            if (!existingRoles.includes(selectedRole)) {
                existingRoles.push(selectedRole);
                localStorage.setItem('userRoles', JSON.stringify(existingRoles));
            }

            // Set as active role
            localStorage.setItem('activeRole', selectedRole);
            localStorage.setItem('userRole', selectedRole); // Backward compatibility

            // Redirect after success
            setTimeout(() => {
                router.push(selectedRole === 'patient' ? '/dashboard/patient' : '/dashboard/doctor');
            }, 2000);



        } catch (err: any) {
            console.error('Registration error:', err);
            setStep('select');

            const errorMessage = err.response?.data?.error || err.message || 'Không thể đăng ký. Vui lòng thử lại.';

            toast({
                title: "Lỗi đăng ký",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsRegistering(false);
        }
    };

    const springConfig = { type: "spring" as const, stiffness: 100, damping: 20 };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springConfig}
                className="w-full max-w-2xl"
            >
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">
                        Chọn vai trò của bạn
                    </h1>
                    <p className="text-slate-400">
                        Đăng ký miễn phí - Được tài trợ bởi hệ thống
                    </p>
                    {walletAddress && (
                        <p className="text-xs text-slate-500 mt-2 font-mono">
                            Ví: {walletAddress.slice(0, 8)}...{walletAddress.slice(-6)}
                        </p>
                    )}

                    {/* Quota Info */}
                    {quota && !quota.registrationAvailable && (
                        <div className="mt-4 p-3 rounded-lg bg-yellow-900/20 border border-yellow-600/30">
                            <div className="flex items-center justify-center gap-2 text-yellow-400">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="text-sm">Đã sử dụng đăng ký miễn phí</span>
                            </div>
                            <p className="text-xs text-yellow-500/80 mt-1">
                                Kết nối ví có ETH để đăng ký thêm role
                            </p>
                        </div>
                    )}
                </div>

                {/* Role Selection */}
                {step === 'select' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Patient Card */}
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Card
                                className={`cursor-pointer transition-all border-2 ${selectedRole === 'patient'
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-slate-700 bg-slate-800/50 hover:border-blue-400'
                                    }`}
                                onClick={() => setSelectedRole('patient')}
                            >
                                <CardContent className="p-8 text-center">
                                    <div className={`w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center ${selectedRole === 'patient' ? 'bg-blue-500' : 'bg-blue-600/20'
                                        }`}>
                                        <User className={`w-10 h-10 ${selectedRole === 'patient' ? 'text-white' : 'text-blue-400'
                                            }`} />
                                    </div>
                                    <h3 className={`text-xl font-bold mb-2 ${selectedRole === 'patient' ? 'text-blue-900' : 'text-white'
                                        }`}>
                                        Bệnh nhân
                                    </h3>
                                    <p className={`text-sm ${selectedRole === 'patient' ? 'text-blue-700' : 'text-slate-400'
                                        }`}>
                                        Quản lý hồ sơ y tế cá nhân, cấp quyền truy cập cho bác sĩ
                                    </p>
                                    <ul className={`text-xs mt-4 text-left space-y-1 ${selectedRole === 'patient' ? 'text-blue-600' : 'text-slate-500'
                                        }`}>
                                        <li>✓ Upload hồ sơ y tế</li>
                                        <li>✓ Mã hóa AES-256</li>
                                        <li>✓ Chia sẻ cho bác sĩ</li>
                                        <li>✓ Toàn quyền kiểm soát</li>
                                    </ul>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Doctor Card */}
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Card
                                className={`cursor-pointer transition-all border-2 ${selectedRole === 'doctor'
                                    ? 'border-teal-500 bg-teal-50'
                                    : 'border-slate-700 bg-slate-800/50 hover:border-teal-400'
                                    }`}
                                onClick={() => setSelectedRole('doctor')}
                            >
                                <CardContent className="p-8 text-center">
                                    <div className={`w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center ${selectedRole === 'doctor' ? 'bg-teal-500' : 'bg-teal-600/20'
                                        }`}>
                                        <Stethoscope className={`w-10 h-10 ${selectedRole === 'doctor' ? 'text-white' : 'text-teal-400'
                                            }`} />
                                    </div>
                                    <h3 className={`text-xl font-bold mb-2 ${selectedRole === 'doctor' ? 'text-teal-900' : 'text-white'
                                        }`}>
                                        Bác sĩ
                                    </h3>
                                    <p className={`text-sm ${selectedRole === 'doctor' ? 'text-teal-700' : 'text-slate-400'
                                        }`}>
                                        Xem hồ sơ bệnh nhân được ủy quyền, thêm ghi chú điều trị
                                    </p>
                                    <ul className={`text-xs mt-4 text-left space-y-1 ${selectedRole === 'doctor' ? 'text-teal-600' : 'text-slate-500'
                                        }`}>
                                        <li>✓ Xem hồ sơ được chia sẻ</li>
                                        <li>✓ Thêm chẩn đoán mới</li>
                                        <li>✓ Yêu cầu xác thực</li>
                                        <li>✓ Quản lý bệnh nhân</li>
                                    </ul>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                )}

                {/* Confirm Step */}
                {step === 'confirm' && (
                    <div className="text-center py-12">
                        <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-white mb-2">
                            Đang đăng ký...
                        </h3>
                        <p className="text-slate-400">
                            Hệ thống đang xử lý đăng ký của bạn
                        </p>
                    </div>
                )}

                {/* Success Step */}
                {step === 'success' && (
                    <div className="text-center py-12">
                        <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">
                            Đăng ký thành công!
                        </h3>
                        <p className="text-slate-400 mb-4">
                            {selectedRole === 'patient'
                                ? 'Chào mừng bạn đến với hệ thống EHR'
                                : 'Tài khoản bác sĩ đã được tạo. Vui lòng chờ xác thực.'}
                        </p>
                        <p className="text-sm text-slate-500">
                            Đang chuyển hướng...
                        </p>
                    </div>
                )}

                {/* Register Button */}
                {step === 'select' && (
                    <div className="flex justify-center">
                        <Button
                            size="lg"
                            onClick={handleRegister}
                            disabled={!selectedRole || isRegistering || (quota && !quota.registrationAvailable)}
                            className="px-12 py-6 text-lg bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700"
                        >
                            {isRegistering ? (
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            ) : (
                                <Shield className="w-5 h-5 mr-2" />
                            )}
                            Đăng ký miễn phí
                            <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                    </div>
                )}

                {/* Info */}
                <p className="text-center text-xs text-slate-500 mt-8">
                    Đăng ký được tài trợ bởi hệ thống.
                    Mỗi tài khoản được đăng ký miễn phí 1 lần.
                </p>

                {/* Quota display */}
                {quota && (
                    <div className="mt-4 text-center text-xs text-slate-400">
                        <p>📤 Upload: {quota.uploadsRemaining}/100 còn lại tháng này</p>
                        <p>❌ Revoke: {quota.revokesRemaining}/20 còn lại tháng này</p>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
