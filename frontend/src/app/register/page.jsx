'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, User, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function RegisterPage() {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        role: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log("Registration Data:", formData);
        toast({
            title: "Đăng ký thành công",
            description: `Chào mừng, ${formData.fullName}! Bạn đã đăng ký thành công với vai trò ${formData.role === 'Doctor' ? 'Bác sĩ' : 'Bệnh nhân'}.`,
        });
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-teal-50 flex flex-col">
            <Navbar />

            <main className="flex-1 flex items-center justify-center px-4 py-20">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-lg"
                >
                    <Card className="border-slate-200 shadow-xl bg-white/80 backdrop-blur-sm">
                        <CardHeader className="text-center pb-8 border-b border-slate-100">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-teal-500 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg transform rotate-3 hover:rotate-6 transition-transform">
                                <Shield className="w-8 h-8 text-white" />
                            </div>
                            <CardTitle className="text-3xl font-bold text-slate-900">Tạo Tài Khoản</CardTitle>
                            <CardDescription className="text-lg text-slate-600 mt-2">
                                Tham gia mạng lưới EHR blockchain bảo mật
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-8">
                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Họ và Tên</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <Input
                                            id="fullName"
                                            placeholder="Nguyễn Văn A"
                                            className="pl-10"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Địa chỉ Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="nguyenvana@example.com"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="role">Tôi là...</Label>
                                    <Select
                                        value={formData.role}
                                        onValueChange={(val) => setFormData({ ...formData, role: val })}
                                        required
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Chọn vai trò của bạn" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Patient">
                                                <div className="flex items-center gap-2">
                                                    <User className="w-4 h-4" />
                                                    <span>Bệnh nhân</span>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="Doctor">
                                                <div className="flex items-center gap-2">
                                                    <Stethoscope className="w-4 h-4" />
                                                    <span>Bác sĩ / Nhà cung cấp dịch vụ y tế</span>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full h-12 text-lg bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                                    disabled={loading}
                                >
                                    {loading ? 'Đang tạo tài khoản...' : 'Đăng Ký'}
                                </Button>

                                <p className="text-xs text-center text-slate-500 mt-4">
                                    Bằng cách đăng ký, bạn đồng ý với Điều khoản dịch vụ và Chính sách quyền riêng tư của chúng tôi.
                                    Danh tính của bạn sẽ được bảo mật trên blockchain.
                                </p>
                            </form>
                        </CardContent>
                    </Card>
                </motion.div>
            </main>

            <Footer />
        </div>
    );
}
