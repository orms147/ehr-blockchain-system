import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Mail, Loader2, CheckCircle, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { authService } from '@/services';
import { createWalletClient, custom } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { useWeb3Auth, useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from '@web3auth/modal/react';

export default function LoginPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Web3Auth React Hooks
    const { isConnected, provider } = useWeb3Auth();
    const { connect } = useWeb3AuthConnect();
    const { disconnect } = useWeb3AuthDisconnect();
    const { userInfo } = useWeb3AuthUser();

    // Check if already logged in
    useEffect(() => {
        if (authService.isLoggedIn()) {
            navigate('/dashboard/patient');
        }
    }, []);

    // Handle login with Web3Auth modal
    const handleLogin = async () => {
        setLoading(true);
        setStep(2);

        try {
            // Connect using Web3Auth React Hooks - opens modal
            await connect();
        } catch (error) {
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

    // Effect to handle post-connection authentication
    useEffect(() => {
        const authenticateWithBackend = async () => {
            if (isConnected && provider && step === 2) {
                try {
                    // Create wallet client from Web3Auth provider
                    const walletClient = createWalletClient({
                        chain: arbitrumSepolia,
                        transport: custom(provider),
                    });

                    // Get wallet address
                    const [address] = await walletClient.getAddresses();

                    // Get nonce from backend
                    const { nonce } = await authService.getNonce(address);

                    // Create & sign message
                    const message = `Đăng nhập EHR System\n\nMã xác thực: ${nonce}\nThời gian: ${new Date().toISOString()}`;
                    const signature = await walletClient.signMessage({ account: address, message });

                    // Login with backend
                    const loginResult = await authService.login(address, message, signature);

                    if (loginResult.token) {
                        setStep(3);
                        toast({
                            title: "Đăng nhập thành công!",
                            description: `Chào mừng ${userInfo?.name || 'bạn'}!`,
                            className: "bg-green-50 border-green-200 text-green-800",
                        });

                        setTimeout(() => {
                            navigate(loginResult.roles?.isVerifiedDoctor ? '/dashboard/doctor' : '/dashboard/patient');
                        }, 1500);
                    }
                } catch (error) {
                    console.error('Backend auth error:', error);
                    setStep(1);
                    await disconnect();

                    toast({
                        title: "Xác thực thất bại",
                        description: error.message || "Vui lòng thử lại.",
                        variant: "destructive",
                    });
                } finally {
                    setLoading(false);
                }
            }
        };

        authenticateWithBackend();
    }, [isConnected, provider, step]);

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
                    <Card className="border-slate-200 shadow-xl bg-white/90 backdrop-blur-sm">
                        <CardHeader className="text-center pb-6 border-b border-slate-100">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-teal-500 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg">
                                <Shield className="w-8 h-8 text-white" />
                            </div>
                            <CardTitle className="text-2xl font-bold text-slate-900">
                                Đăng Nhập
                            </CardTitle>
                            <CardDescription className="text-slate-600">
                                Truy cập hồ sơ y tế của bạn một cách an toàn
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="p-6 space-y-6">
                            {/* Step 1: Login button */}
                            {step === 1 && (
                                <div className="space-y-4">
                                    <Button
                                        onClick={handleLogin}
                                        disabled={loading}
                                        className="w-full h-14 text-base bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white"
                                    >
                                        <Shield className="w-5 h-5 mr-3" />
                                        Đăng nhập với Web3Auth
                                    </Button>

                                    <p className="text-xs text-center text-slate-500 pt-2">
                                        Hỗ trợ Google, Facebook, Email và nhiều hơn nữa
                                    </p>

                                    <p className="text-xs text-center text-slate-500 pt-2 border-t border-slate-100 mt-4">
                                        Bằng cách đăng nhập, bạn đồng ý với Điều khoản dịch vụ
                                    </p>
                                </div>
                            )}

                            {/* Step 2: Loading */}
                            {step === 2 && (
                                <div className="text-center space-y-4 py-8">
                                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
                                    <p className="text-slate-600 font-medium">Đang xác thực...</p>
                                    <p className="text-sm text-slate-500">Hoàn thành đăng nhập trong cửa sổ bật lên</p>
                                </div>
                            )}

                            {/* Step 3: Success */}
                            {step === 3 && (
                                <div className="text-center space-y-4 py-8">
                                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                                    </motion.div>

                                    {userInfo && (
                                        <div className="flex items-center justify-center gap-3">
                                            {userInfo.profileImage ? (
                                                <img src={userInfo.profileImage} alt="" className="w-10 h-10 rounded-full" />
                                            ) : (
                                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                                    <User className="w-5 h-5 text-blue-600" />
                                                </div>
                                            )}
                                            <div className="text-left">
                                                <p className="font-medium text-slate-900">{userInfo.name || 'Người dùng'}</p>
                                                <p className="text-sm text-slate-500">{userInfo.email}</p>
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-slate-600">Đang chuyển hướng...</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <p className="text-center text-sm text-slate-500 mt-4">
                        Chưa có tài khoản?{' '}
                        <a href="/register" className="text-blue-600 hover:underline">Đăng ký ngay</a>
                    </p>
                </motion.div>
            </main>

            <Footer />
        </div>
    );
}
