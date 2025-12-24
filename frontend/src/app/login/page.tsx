"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, Loader2, CheckCircle, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Toaster } from '@/components/ui/toaster';
import { useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from '@web3auth/modal/react';
import { createWalletClient, custom } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { authService } from '@/services';

export default function LoginPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Web3Auth React Hooks
    const { isConnected, provider } = useWeb3Auth();
    const { connect } = useWeb3AuthConnect();
    const { disconnect } = useWeb3AuthDisconnect();
    const { userInfo } = useWeb3AuthUser();

    // Check if already logged in - redirect to last active role
    useEffect(() => {
        if (authService.isLoggedIn()) {
            const activeRole = localStorage.getItem('activeRole') || localStorage.getItem('userRole') || 'patient';
            const dashboardPath = activeRole === 'doctor' ? '/dashboard/doctor' :
                activeRole === 'admin' ? '/dashboard/admin' :
                    '/dashboard/patient';
            router.push(dashboardPath);
        }
    }, [router]);

    // Handle login with Web3Auth modal
    const handleLogin = async () => {
        setLoading(true);
        setStep(2);

        try {
            await connect();
            // connect() will trigger the useEffect below when isConnected becomes true
        } catch (error: any) {
            console.error('Web3Auth connect error:', error);
            setStep(1);
            setLoading(false);

            if (!error.message?.includes('closed')) {
                toast({
                    title: "Đăng nhập thất bại",
                    description: error.message || "Vui lòng thử lại.",
                    variant: "destructive",
                });
            }
        }
    };

    // Handle post-connection authentication
    useEffect(() => {
        // Skip if already have a token
        if (authService.isLoggedIn()) {
            return;
        }

        const authenticateWithBackend = async () => {
            // Only authenticate if connected AND has provider AND user initiated login (step === 2)
            if (!isConnected || !provider || step !== 2) {
                return;
            }

            try {
                setLoading(true);

                const walletClient = createWalletClient({
                    chain: arbitrumSepolia,
                    transport: custom(provider),
                });

                const [address] = await walletClient.getAddresses();

                // Get FRESH nonce and message from backend
                const { message } = await authService.getNonce(address);

                // Sign the exact message from backend (contains nonce)
                const signature = await walletClient.signMessage({ account: address, message });

                const loginResult = await authService.login(address, message, signature);

                if (loginResult.token) {
                    setStep(3);
                    setLoading(false);
                    toast({
                        title: "Đăng nhập thành công!",
                        description: `Chào mừng ${userInfo?.name || 'bạn'}!`,
                        className: "bg-green-50 border-green-200 text-green-800",
                    });

                    // Check roles and redirect appropriately
                    const { isPatient, isDoctor, isVerifiedDoctor } = loginResult.user || loginResult.roles || {};

                    setTimeout(() => {
                        if (!isPatient && !isDoctor) {
                            // No role registered yet - go to registration
                            router.push('/register');
                        } else if (isVerifiedDoctor || isDoctor) {
                            // Save Doctor role to localStorage
                            const roles = JSON.parse(localStorage.getItem('userRoles') || '[]');
                            if (!roles.includes('doctor')) roles.push('doctor');
                            localStorage.setItem('userRoles', JSON.stringify(roles));
                            localStorage.setItem('activeRole', 'doctor');
                            localStorage.setItem('userRole', 'doctor');
                            router.push('/dashboard/doctor');
                        } else {
                            // Save Patient role to localStorage
                            const roles = JSON.parse(localStorage.getItem('userRoles') || '[]');
                            if (!roles.includes('patient')) roles.push('patient');
                            localStorage.setItem('userRoles', JSON.stringify(roles));
                            localStorage.setItem('activeRole', 'patient');
                            localStorage.setItem('userRole', 'patient');
                            router.push('/dashboard/patient');
                        }
                    }, 1500);
                }

            } catch (error: any) {
                console.error('Backend auth error:', error);

                // If nonce error, auto-retry with fresh nonce (one attempt)
                if (error.message?.includes('nonce') || error.message?.includes('Nonce')) {
                    console.log('🔄 Invalid nonce, auto-retrying with fresh nonce...');
                    try {
                        const walletClient = createWalletClient({
                            chain: arbitrumSepolia,
                            transport: custom(provider!),
                        });
                        const [address] = await walletClient.getAddresses();

                        // Get FRESH nonce (this creates new one in DB)
                        const { message: freshMessage } = await authService.getNonce(address);
                        const freshSignature = await walletClient.signMessage({ account: address, message: freshMessage });
                        const retryResult = await authService.login(address, freshMessage, freshSignature);

                        if (retryResult.token) {
                            setStep(3);
                            setLoading(false);
                            toast({
                                title: "Đăng nhập thành công!",
                                description: `Chào mừng ${userInfo?.name || 'bạn'}!`,
                                className: "bg-green-50 border-green-200 text-green-800",
                            });

                            const { isPatient, isDoctor, isVerifiedDoctor } = retryResult.user || retryResult.roles || {};
                            setTimeout(() => {
                                if (!isPatient && !isDoctor) {
                                    router.push('/register');
                                } else if (isVerifiedDoctor || isDoctor) {
                                    localStorage.setItem('activeRole', 'doctor');
                                    localStorage.setItem('userRole', 'doctor');
                                    router.push('/dashboard/doctor');
                                } else {
                                    localStorage.setItem('activeRole', 'patient');
                                    localStorage.setItem('userRole', 'patient');
                                    router.push('/dashboard/patient');
                                }
                            }, 1500);
                            return; // Success on retry!
                        }
                    } catch (retryError) {
                        console.error('Retry also failed:', retryError);
                    }

                    // Retry failed, fallback to disconnect
                    setLoading(false);
                    localStorage.removeItem('jwt');
                    await disconnect();
                    setStep(1);
                    toast({
                        title: "Phiên đăng nhập hết hạn",
                        description: "Vui lòng đăng nhập lại.",
                        variant: "destructive",
                    });
                } else {
                    setStep(1);
                    await disconnect();
                    toast({
                        title: "Xác thực thất bại",
                        description: error.message || "Vui lòng thử lại.",
                        variant: "destructive",
                    });
                }
            }
        };

        authenticateWithBackend();
    }, [isConnected, provider, step, disconnect, router, userInfo?.name]);


    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-teal-50 flex flex-col">
            <Navbar />

            <main className="flex-1 flex items-center justify-center px-4 py-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-md"
                >
                    <Card className="shadow-xl border-0 bg-white/80 backdrop-blur-sm">
                        <CardHeader className="text-center pb-2">
                            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-teal-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                                <Shield className="w-8 h-8 text-white" />
                            </div>
                            <CardTitle className="text-2xl font-bold text-gray-900">
                                Đăng nhập EHR Chain
                            </CardTitle>
                            <CardDescription className="text-gray-600">
                                Kết nối ví để truy cập hệ thống hồ sơ sức khỏe
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-6">
                            {/* Step Indicator */}
                            <div className="flex items-center justify-center gap-2">
                                {[1, 2, 3].map((s) => (
                                    <div
                                        key={s}
                                        className={`w-3 h-3 rounded-full transition-all duration-300 ${step >= s
                                            ? 'bg-gradient-to-r from-blue-500 to-teal-500'
                                            : 'bg-gray-200'
                                            }`}
                                    />
                                ))}
                            </div>

                            {/* Step Content */}
                            {step === 1 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-4"
                                >
                                    <p className="text-center text-gray-600 text-sm">
                                        Nhấn nút bên dưới để kết nối ví và xác thực danh tính
                                    </p>
                                    <Button
                                        onClick={handleLogin}
                                        disabled={loading}
                                        className="w-full h-12 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                                Đang kết nối...
                                            </>
                                        ) : (
                                            <>
                                                <User className="mr-2 h-5 w-5" />
                                                Đăng nhập với Web3Auth
                                            </>
                                        )}
                                    </Button>
                                </motion.div>
                            )}

                            {step === 2 && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="text-center space-y-4"
                                >
                                    <Loader2 className="mx-auto h-12 w-12 text-blue-500 animate-spin" />
                                    <p className="text-gray-600">Đang xác thực với hệ thống...</p>
                                    <p className="text-sm text-gray-500">Vui lòng ký tin nhắn trong ví của bạn</p>
                                </motion.div>
                            )}

                            {step === 3 && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-center space-y-4"
                                >
                                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                                        <CheckCircle className="h-10 w-10 text-green-500" />
                                    </div>
                                    <p className="text-green-600 font-medium">Đăng nhập thành công!</p>
                                    <p className="text-sm text-gray-500">Đang chuyển hướng...</p>
                                </motion.div>
                            )}

                            {/* Info */}
                            <div className="pt-4 border-t border-gray-100">
                                <p className="text-xs text-center text-gray-500">
                                    Bằng việc đăng nhập, bạn đồng ý với{' '}
                                    <a href="#" className="text-blue-600 hover:underline">Điều khoản sử dụng</a>
                                    {' '}và{' '}
                                    <a href="#" className="text-blue-600 hover:underline">Chính sách bảo mật</a>
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </main>

            <Footer />
            <Toaster />
        </div>
    );
}
