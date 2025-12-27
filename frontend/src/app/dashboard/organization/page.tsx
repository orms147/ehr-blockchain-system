"use client";

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import {
    Building2, Users, UserCheck, FileText, Clock, AlertCircle, Loader2,
    RefreshCw, Shield, Award, CheckCircle, XCircle, Search
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useWalletAddress } from '@/hooks/useWalletAddress';

// Mock data for demo - replace with real API calls
const mockDoctors = [
    { id: 1, address: '0x1234...abcd', name: 'Dr. Nguyễn Văn A', specialty: 'Nội khoa', verified: true, joinedAt: '2024-01-15' },
    { id: 2, address: '0x5678...efgh', name: 'Dr. Trần Thị B', specialty: 'Ngoại khoa', verified: false, joinedAt: '2024-02-20' },
    { id: 3, address: '0x9abc...ijkl', name: 'Dr. Lê Văn C', specialty: 'Tim mạch', verified: true, joinedAt: '2024-03-10' },
];

const mockPendingVerifications = [
    { id: 1, address: '0xdef0...mnop', name: 'Dr. Phạm Văn D', specialty: 'Thần kinh', requestedAt: '2024-12-20' },
    { id: 2, address: '0x1357...qrst', name: 'Dr. Hoàng Thị E', specialty: 'Nhi khoa', requestedAt: '2024-12-22' },
];

export default function OrganizationDashboardPage() {
    const { address: walletAddress } = useWalletAddress();
    const [doctors, setDoctors] = useState(mockDoctors);
    const [pendingVerifications, setPendingVerifications] = useState(mockPendingVerifications);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const springConfig = { type: "spring" as const, stiffness: 100, damping: 20 };

    const stats = [
        { icon: Users, label: 'Tổng bác sĩ', value: doctors.length.toString(), color: 'from-blue-500 to-blue-600' },
        { icon: UserCheck, label: 'Đã xác thực', value: doctors.filter(d => d.verified).length.toString(), color: 'from-green-500 to-green-600' },
        { icon: Clock, label: 'Chờ xác thực', value: pendingVerifications.length.toString(), color: 'from-orange-500 to-orange-600' },
        { icon: FileText, label: 'Hồ sơ quản lý', value: '156', color: 'from-purple-500 to-purple-600' },
    ];

    const handleVerifyDoctor = async (doctorId: number, approve: boolean) => {
        setLoading(true);
        try {
            // TODO: Call smart contract AccessControl.verifyDoctor()
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call

            if (approve) {
                const doctor = pendingVerifications.find(d => d.id === doctorId);
                if (doctor) {
                    setDoctors(prev => [...prev, { ...doctor, verified: true, joinedAt: new Date().toISOString().split('T')[0] }]);
                }
                toast({
                    title: "Đã xác thực bác sĩ",
                    description: "Bác sĩ đã được xác thực thành công trên blockchain.",
                    className: "bg-green-50 border-green-200 text-green-800",
                });
            } else {
                toast({
                    title: "Đã từ chối",
                    description: "Yêu cầu xác thực đã bị từ chối.",
                    variant: "destructive",
                });
            }

            setPendingVerifications(prev => prev.filter(d => d.id !== doctorId));
        } catch (error) {
            toast({
                title: "Lỗi",
                description: "Không thể xử lý yêu cầu. Vui lòng thử lại.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const filteredDoctors = doctors.filter(d =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.specialty.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={springConfig}
                    className="mb-8"
                >
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Building2 className="w-8 h-8 text-indigo-600" />
                        Bảng điều khiển Tổ chức
                    </h1>
                    <p className="text-slate-500 mt-2">Quản lý bác sĩ và xác thực trong tổ chức.</p>
                </motion.div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {stats.map((stat, index) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ ...springConfig, delay: index * 0.1 }}
                        >
                            <Card className="hover:shadow-lg transition-shadow duration-300 overflow-hidden bg-white">
                                <CardContent className="p-6">
                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4 shadow-lg`}>
                                        <stat.icon className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="text-3xl font-bold text-slate-900">{stat.value}</div>
                                    <div className="text-sm text-slate-500">{stat.label}</div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                {/* Tabs */}
                <Tabs defaultValue="doctors" className="space-y-6">
                    <TabsList className="bg-white border border-slate-200 p-1 rounded-xl">
                        <TabsTrigger value="doctors" className="rounded-lg px-4 py-2 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                            <Users className="w-4 h-4 mr-2" />
                            Danh sách bác sĩ
                        </TabsTrigger>
                        <TabsTrigger value="pending" className="rounded-lg px-4 py-2 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                            <Clock className="w-4 h-4 mr-2" />
                            Chờ xác thực ({pendingVerifications.length})
                        </TabsTrigger>
                        <TabsTrigger value="verification" className="rounded-lg px-4 py-2 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700">
                            <Award className="w-4 h-4 mr-2" />
                            Trạng thái xác thực
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Doctor List */}
                    <TabsContent value="doctors" className="outline-none">
                        <Card className="bg-white">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-slate-900">Bác sĩ trong tổ chức</CardTitle>
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <Input
                                            placeholder="Tìm kiếm..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-9 w-64"
                                        />
                                    </div>
                                    <Button variant="ghost" size="sm">
                                        <RefreshCw className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {filteredDoctors.length === 0 ? (
                                    <div className="text-center py-12 bg-slate-50 rounded-xl">
                                        <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                        <p className="text-slate-500">Không tìm thấy bác sĩ nào.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {filteredDoctors.map((doctor) => (
                                            <div
                                                key={doctor.id}
                                                className="p-4 border border-slate-200 rounded-xl hover:border-indigo-300 transition-colors bg-white"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                                                            <Users className="w-6 h-6 text-indigo-600" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-slate-900">{doctor.name}</p>
                                                            <p className="text-sm text-slate-500">{doctor.specialty}</p>
                                                            <p className="text-xs text-slate-400 font-mono">{doctor.address}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Badge className={doctor.verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                                                            {doctor.verified ? (
                                                                <><CheckCircle className="w-3 h-3 mr-1" /> Đã xác thực</>
                                                            ) : (
                                                                <><Clock className="w-3 h-3 mr-1" /> Chưa xác thực</>
                                                            )}
                                                        </Badge>
                                                        <Button variant="outline" size="sm">
                                                            Chi tiết
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tab 2: Pending Verifications */}
                    <TabsContent value="pending" className="outline-none">
                        <Card className="bg-white">
                            <CardHeader>
                                <CardTitle className="text-slate-900">Yêu cầu xác thực đang chờ</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {pendingVerifications.length === 0 ? (
                                    <div className="text-center py-12 bg-slate-50 rounded-xl">
                                        <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                                        <p className="text-slate-500">Không có yêu cầu nào đang chờ.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {pendingVerifications.map((doctor) => (
                                            <div
                                                key={doctor.id}
                                                className="p-4 border border-orange-200 rounded-xl bg-orange-50"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                                                            <Clock className="w-6 h-6 text-orange-600" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-slate-900">{doctor.name}</p>
                                                            <p className="text-sm text-slate-500">{doctor.specialty}</p>
                                                            <p className="text-xs text-slate-400">
                                                                Yêu cầu: {new Date(doctor.requestedAt).toLocaleDateString('vi-VN')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleVerifyDoctor(doctor.id, true)}
                                                            disabled={loading}
                                                            className="bg-green-600 hover:bg-green-700"
                                                        >
                                                            <CheckCircle className="w-4 h-4 mr-1" />
                                                            Xác thực
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleVerifyDoctor(doctor.id, false)}
                                                            disabled={loading}
                                                            className="border-red-300 text-red-600 hover:bg-red-50"
                                                        >
                                                            <XCircle className="w-4 h-4 mr-1" />
                                                            Từ chối
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tab 3: Verification Status */}
                    <TabsContent value="verification" className="outline-none">
                        <Card className="bg-white">
                            <CardHeader>
                                <CardTitle className="text-slate-900 flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-indigo-600" />
                                    Trạng thái xác thực Tổ chức
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center">
                                            <Award className="w-8 h-8 text-indigo-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900">Bệnh viện XYZ</h3>
                                            <p className="text-slate-600">Tổ chức y tế được xác thực</p>
                                        </div>
                                        <Badge className="bg-green-100 text-green-700 ml-auto">
                                            <CheckCircle className="w-4 h-4 mr-1" />
                                            Đã xác thực bởi Bộ Y tế
                                        </Badge>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-white rounded-lg border border-slate-200">
                                            <p className="text-sm text-slate-500">Mã định danh</p>
                                            <p className="font-mono text-sm text-slate-900">{walletAddress?.slice(0, 20)}...</p>
                                        </div>
                                        <div className="p-4 bg-white rounded-lg border border-slate-200">
                                            <p className="text-sm text-slate-500">Ngày xác thực</p>
                                            <p className="font-medium text-slate-900">15/01/2024</p>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
}
