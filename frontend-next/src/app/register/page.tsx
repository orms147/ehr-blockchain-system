"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, User, Stethoscope, Loader2, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Toaster } from '@/components/ui/toaster';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        role: ''
    });

    const springConfig = { type: "spring", stiffness: 100, damping: 20 };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        setSuccess(true);
        toast({
            title: "Đăng ký thành công!",
            description: `Chào mừng, ${formData.fullName}! Bạn đã đăng ký thành công với vai trò ${formData.role === 'Doctor' ? 'Bác sĩ' : 'Bệnh nhân'}.`,
            className: "bg-green-50 border-green-200 text-green-800",
        });

        setLoading(false);

        // Redirect after success
        setTimeout(() => {
            router.push('/login');
        }, 2000);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-teal-50 flex flex-col">
            <Navbar />

            <main className="flex-1 flex items-center justify-center px-4 py-24">
                <motion.div
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ ...springConfig, delay: 0.1 }}
                    className="w-full max-w-lg"
                >
                    <Card className="border-slate-200 shadow-2xl bg-white/90 backdrop-blur-sm overflow-hidden">
                        <CardHeader className="text-center pb-8 border-b border-slate-100 bg-gradient-to-br from-white to-slate-50">
                            <motion.div
                                className="w-16 h-16 bg-gradient-to-br from-blue-600 to-teal-500 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-blue-500/30"
                                initial={{ rotate: -10, scale: 0.8 }}
                                animate={{ rotate: 3, scale: 1 }}
                                whileHover={{ rotate: 8, scale: 1.1 }}
                                transition={springConfig}
                            >
                                <Shield className="w-8 h-8 text-white" />
                            </motion.div>
                            <CardTitle className="text-3xl font-bold text-slate-900">Tạo Tài Khoản</CardTitle>
                            <CardDescription className="text-lg text-slate-600 mt-2">
                                Tham gia mạng lưới EHR blockchain bảo mật
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="p-8">
                            {!success ? (
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <motion.div
                                        className="space-y-2"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.2 }}
                                    >
                                        <Label htmlFor="fullName">Họ và Tên</Label>
                                        <div className="relative group">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                                            <Input
                                                id="fullName"
                                                placeholder="Nguyễn Văn A"
                                                className="pl-10 transition-all duration-300 focus:ring-2 focus:ring-blue-500/20"
                                                value={formData.fullName}
                                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                                required
                                            />
                                        </div>
                                    </motion.div>

                                    <motion.div
                                        className="space-y-2"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.3 }}
                                    >
                                        <Label htmlFor="email">Địa chỉ Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="nguyenvana@example.com"
                                            className="transition-all duration-300 focus:ring-2 focus:ring-blue-500/20"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                            required
                                        />
                                    </motion.div>

                                    <motion.div
                                        className="space-y-2"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.4 }}
                                    >
                                        <Label htmlFor="role">Tôi là...</Label>
                                        <Select
                                            value={formData.role}
                                            onValueChange={(val) => setFormData({ ...formData, role: val })}
                                            required
                                        >
                                            <SelectTrigger className="transition-all duration-300 focus:ring-2 focus:ring-blue-500/20">
                                                <SelectValue placeholder="Chọn vai trò của bạn" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Patient">
                                                    <div className="flex items-center gap-2">
                                                        <User className="w-4 h-4 text-blue-600" />
                                                        <span>Bệnh nhân</span>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="Doctor">
                                                    <div className="flex items-center gap-2">
                                                        <Stethoscope className="w-4 h-4 text-teal-600" />
                                                        <span>Bác sĩ / Nhà cung cấp dịch vụ y tế</span>
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </motion.div>

                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.5 }}
                                    >
                                        <motion.div
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                        >
                                            <Button
                                                type="submit"
                                                className="w-full h-12 text-lg bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all duration-300"
                                                disabled={loading}
                                            >
                                                {loading ? (
                                                    <>
                                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                                        Đang tạo tài khoản...
                                                    </>
                                                ) : (
                                                    'Đăng Ký'
                                                )}
                                            </Button>
                                        </motion.div>
                                    </motion.div>

                                    <p className="text-xs text-center text-slate-500 mt-4">
                                        Bằng cách đăng ký, bạn đồng ý với Điều khoản dịch vụ và Chính sách quyền riêng tư của chúng tôi.
                                    </p>
                                </form>
                            ) : (
                                <motion.div
                                    className="text-center py-8 space-y-4"
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={springConfig}
                                >
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", stiffness: 200 }}
                                    >
                                        <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
                                    </motion.div>
                                    <h3 className="text-2xl font-bold text-slate-900">Đăng ký thành công!</h3>
                                    <p className="text-slate-600">Đang chuyển hướng đến trang đăng nhập...</p>
                                </motion.div>
                            )}
                        </CardContent>
                    </Card>

                    <motion.p
                        className="text-center text-sm text-slate-500 mt-6"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                    >
                        Đã có tài khoản?{' '}
                        <Link href="/login" className="text-blue-600 hover:underline font-medium">
                            Đăng nhập
                        </Link>
                    </motion.p>
                </motion.div>
            </main>

            <Footer />
            <Toaster />
        </div>
    );
}
