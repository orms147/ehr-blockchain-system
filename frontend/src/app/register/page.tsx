"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useWeb3Auth, useWeb3AuthDisconnect } from '@web3auth/modal/react';
import { User, Stethoscope, Loader2, CheckCircle, ArrowRight, Shield, Wallet, AlertTriangle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { relayerService, authService } from '@/services';
import { addRole } from '@/hooks/useAuthRoles';

export default function RegisterPage() {
    const router = useRouter();
    const { provider, isConnected } = useWeb3Auth();
    const { disconnect } = useWeb3AuthDisconnect();

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

            // Save role using unified auth roles
            addRole(selectedRole, true);

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
    const handleLogout = async () => {
        try {
            await authService.logout();
            await disconnect();
            localStorage.removeItem('jwt_token');
            router.push('/login');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const springConfig = { type: "spring" as const, stiffness: 100, damping: 20 };

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0f1c] to-black flex items-center justify-center p-6 relative overflow-hidden">

            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[100px]" />
            </div>

            {/* Logout Button (Top Right) */}
            <div className="absolute top-6 right-6 z-10">
                <Button
                    variant="ghost"
                    className="text-slate-400 hover:text-white hover:bg-slate-800/50 gap-2 backdrop-blur-sm border border-transparent hover:border-slate-700"
                    onClick={handleLogout}
                >
                    <LogOut className="w-4 h-4" />
                    Đổi tài khoản
                </Button>
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={springConfig}
                className="w-full max-w-3xl relative z-10"
            >
                {/* Main Card */}
                <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">

                    {/* Header */}
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-2xl mb-4">
                            <Shield className="w-8 h-8 text-blue-400" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">
                            Tham gia Hệ sinh thái <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-400">EHR Chain</span>
                        </h1>
                        <p className="text-slate-400 text-lg max-w-lg mx-auto leading-relaxed">
                            Chọn vai trò của bạn để bắt đầu hành trình quản lý sức khỏe phi tập trung.
                        </p>

                        {walletAddress && (
                            <div className="mt-6 flex justify-center">
                                <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700/50 text-slate-300">
                                    <Wallet className="w-4 h-4 text-blue-400" />
                                    <span className="font-mono text-sm">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                                    <div className="w-2 h-2 rounded-full bg-green-500 ml-2 animate-pulse" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Role Selection */}
                    {step === 'select' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            {/* Patient Card */}
                            <motion.div whileHover={{ y: -5 }} whileTap={{ scale: 0.98 }}>
                                <div
                                    className={`cursor-pointer group relative p-6 rounded-2xl border-2 transition-all duration-300 ${selectedRole === 'patient'
                                        ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.2)]'
                                        : 'border-slate-800 bg-slate-800/20 hover:border-blue-500/50 hover:bg-slate-800/50'
                                        }`}
                                    onClick={() => setSelectedRole('patient')}
                                >
                                    <div className="flex flex-col items-center text-center">
                                        <div className={`w-16 h-16 rounded-2xl mb-4 flex items-center justify-center transition-all ${selectedRole === 'patient' ? 'bg-blue-500 text-white' : 'bg-slate-800 text-blue-500 group-hover:bg-blue-500/20'}`}>
                                            <User className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-2">Bệnh nhân</h3>
                                        <p className="text-slate-400 text-sm mb-6">Lưu trữ hồ sơ y tế an toàn, riêng tư và toàn quyền kiểm soát dữ liệu.</p>

                                        <div className="space-y-2 w-full">
                                            {['Upload hồ sơ', 'Mã hóa AES-256', 'Chia sẻ cho bác sĩ'].map((feature, i) => (
                                                <div key={i} className="flex items-center text-xs text-slate-300 bg-slate-900/50 p-2 rounded-lg">
                                                    <CheckCircle className="w-3 h-3 text-blue-500 mr-2" />
                                                    {feature}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedRole === 'patient' && (
                                        <div className="absolute top-4 right-4">
                                            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                                <CheckCircle className="w-4 h-4 text-white" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>

                            {/* Doctor Card */}
                            <motion.div whileHover={{ y: -5 }} whileTap={{ scale: 0.98 }}>
                                <div
                                    className={`cursor-pointer group relative p-6 rounded-2xl border-2 transition-all duration-300 ${selectedRole === 'doctor'
                                        ? 'border-teal-500 bg-teal-500/10 shadow-[0_0_30px_rgba(20,184,166,0.2)]'
                                        : 'border-slate-800 bg-slate-800/20 hover:border-teal-500/50 hover:bg-slate-800/50'
                                        }`}
                                    onClick={() => setSelectedRole('doctor')}
                                >
                                    <div className="flex flex-col items-center text-center">
                                        <div className={`w-16 h-16 rounded-2xl mb-4 flex items-center justify-center transition-all ${selectedRole === 'doctor' ? 'bg-teal-500 text-white' : 'bg-slate-800 text-teal-500 group-hover:bg-teal-500/20'}`}>
                                            <Stethoscope className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-2">Bác sĩ</h3>
                                        <p className="text-slate-400 text-sm mb-6">Tiếp cận hồ sơ bệnh án chi tiết để chẩn đoán và điều trị chính xác hơn.</p>

                                        <div className="space-y-2 w-full">
                                            {['Xem hồ sơ chia sẻ', 'Thêm chẩn đoán', 'Quản lý bệnh nhân'].map((feature, i) => (
                                                <div key={i} className="flex items-center text-xs text-slate-300 bg-slate-900/50 p-2 rounded-lg">
                                                    <CheckCircle className="w-3 h-3 text-teal-500 mr-2" />
                                                    {feature}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedRole === 'doctor' && (
                                        <div className="absolute top-4 right-4">
                                            <div className="w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center">
                                                <CheckCircle className="w-4 h-4 text-white" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </div>
                    )}

                    {/* Step Content: Confirm & Success */}
                    {step !== 'select' && (
                        <div className="py-12 bg-slate-900/30 rounded-2xl border border-slate-800/50">
                            {step === 'confirm' && (
                                <div className="text-center">
                                    <div className="relative w-20 h-20 mx-auto mb-6">
                                        <div className="absolute inset-0 border-t-4 border-blue-500 rounded-full animate-spin"></div>
                                        <div className="absolute inset-2 border-t-4 border-teal-500 rounded-full animate-spin-slow"></div>
                                        <Loader2 className="absolute inset-0 w-full h-full p-6 text-white animate-pulse" />
                                    </div>
                                    <h3 className="text-xl font-semibold text-white mb-2">Đang khởi tạo danh tính...</h3>
                                    <p className="text-slate-400">Vui lòng chờ trong giây lát</p>
                                </div>
                            )}

                            {step === 'success' && (
                                <div className="text-center">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6"
                                    >
                                        <CheckCircle className="w-12 h-12 text-green-500" />
                                    </motion.div>
                                    <h3 className="text-2xl font-bold text-white mb-2">Đăng ký hoàn tất!</h3>
                                    <p className="text-slate-400 mb-6">Đang chuyển hướng đến Dashboard...</p>
                                    <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto overflow-hidden">
                                        <div className="h-full bg-green-500 animate-progress"></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Register Button */}
                    {step === 'select' && (
                        <div className="mt-8 flex justify-center">
                            <Button
                                size="lg"
                                onClick={handleRegister}
                                disabled={!selectedRole || isRegistering}
                                className={`w-full md:w-auto px-12 py-7 text-lg font-bold rounded-xl shadow-xl transition-all ${selectedRole
                                    ? 'bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-500 hover:to-teal-500 hover:shadow-blue-500/25 hover:scale-105'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    }`}
                            >
                                {isRegistering ? (
                                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                                ) : (
                                    <span className="flex items-center">
                                        {selectedRole ? 'Xác nhận Đăng ký' : 'Chọn vai trò để tiếp tục'}
                                        {selectedRole && <ArrowRight className="w-6 h-6 ml-2" />}
                                    </span>
                                )}
                            </Button>
                        </div>
                    )}

                </div>
            </motion.div>
        </div>
    );
}
