"use client";

import { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import {
    Landmark, Building2, Users, Shield, Award, Clock, AlertCircle,
    RefreshCw, CheckCircle, XCircle, Search, FileText, TrendingUp,
    Settings, Database, Key
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useWalletAddress } from '@/hooks/useWalletAddress';

// Mock data
const mockOrganizations = [
    { id: 1, address: '0xorg1...1234', name: 'Bệnh viện Bạch Mai', type: 'Bệnh viện công', verified: true, doctorCount: 45 },
    { id: 2, address: '0xorg2...5678', name: 'Bệnh viện Việt Đức', type: 'Bệnh viện công', verified: true, doctorCount: 38 },
    { id: 3, address: '0xorg3...9abc', name: 'Phòng khám ABC', type: 'Phòng khám tư', verified: false, doctorCount: 12 },
];

const mockPendingOrgs = [
    { id: 1, address: '0xpend1...def0', name: 'Bệnh viện XYZ', type: 'Bệnh viện tư', requestedAt: '2024-12-20' },
    { id: 2, address: '0xpend2...1357', name: 'Phòng khám Family', type: 'Phòng khám tư', requestedAt: '2024-12-22' },
];

const mockRelayers = [
    { address: '0xrelay1...aaaa', name: 'Relayer 1', active: true, sponsored: 1250 },
    { address: '0xrelay2...bbbb', name: 'Relayer 2', active: true, sponsored: 890 },
];

export default function MinistryDashboardPage() {
    const { address: walletAddress } = useWalletAddress();
    const [organizations, setOrganizations] = useState(mockOrganizations);
    const [pendingOrgs, setPendingOrgs] = useState(mockPendingOrgs);
    const [relayers, setRelayers] = useState(mockRelayers);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const springConfig = { type: "spring" as const, stiffness: 100, damping: 20 };

    const stats = [
        { icon: Building2, label: 'Tổ chức', value: organizations.length.toString(), color: 'from-blue-500 to-blue-600' },
        { icon: Award, label: 'Đã xác thực', value: organizations.filter(o => o.verified).length.toString(), color: 'from-green-500 to-green-600' },
        { icon: Clock, label: 'Chờ duyệt', value: pendingOrgs.length.toString(), color: 'from-orange-500 to-orange-600' },
        { icon: Users, label: 'Tổng bác sĩ', value: organizations.reduce((acc, o) => acc + o.doctorCount, 0).toString(), color: 'from-purple-500 to-purple-600' },
    ];

    const handleVerifyOrg = async (orgId: number, approve: boolean) => {
        setLoading(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (approve) {
                const org = pendingOrgs.find(o => o.id === orgId);
                if (org) {
                    setOrganizations(prev => [...prev, { ...org, verified: true, doctorCount: 0 }]);
                }
                toast({
                    title: "Đã xác thực tổ chức",
                    description: "Tổ chức đã được đăng ký trên blockchain.",
                    className: "bg-green-50 border-green-200 text-green-800",
                });
            } else {
                toast({
                    title: "Đã từ chối",
                    description: "Yêu cầu đăng ký đã bị từ chối.",
                    variant: "destructive",
                });
            }

            setPendingOrgs(prev => prev.filter(o => o.id !== orgId));
        } catch {
            toast({
                title: "Lỗi",
                description: "Không thể xử lý yêu cầu.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const filteredOrgs = organizations.filter(o =>
        o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.type.toLowerCase().includes(searchTerm.toLowerCase())
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
                        <Landmark className="w-8 h-8 text-red-600" />
                        Bảng điều khiển Bộ Y tế
                    </h1>
                    <p className="text-slate-500 mt-2">Quản lý hệ thống EHR blockchain toàn quốc.</p>
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
                <Tabs defaultValue="organizations" className="space-y-6">
                    <TabsList className="bg-white border border-slate-200 p-1 rounded-xl">
                        <TabsTrigger value="organizations" className="rounded-lg px-4 py-2 data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
                            <Building2 className="w-4 h-4 mr-2" />
                            Tổ chức
                        </TabsTrigger>
                        <TabsTrigger value="pending" className="rounded-lg px-4 py-2 data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
                            <Clock className="w-4 h-4 mr-2" />
                            Chờ duyệt ({pendingOrgs.length})
                        </TabsTrigger>
                        <TabsTrigger value="relayers" className="rounded-lg px-4 py-2 data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
                            <Database className="w-4 h-4 mr-2" />
                            Relayers
                        </TabsTrigger>
                        <TabsTrigger value="system" className="rounded-lg px-4 py-2 data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
                            <Settings className="w-4 h-4 mr-2" />
                            Hệ thống
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Organizations */}
                    <TabsContent value="organizations" className="outline-none">
                        <Card className="bg-white">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-slate-900">Danh sách Tổ chức Y tế</CardTitle>
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
                                <div className="space-y-4">
                                    {filteredOrgs.map((org) => (
                                        <div
                                            key={org.id}
                                            className="p-4 border border-slate-200 rounded-xl hover:border-red-300 transition-colors bg-white"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                                                        <Building2 className="w-6 h-6 text-red-600" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-slate-900">{org.name}</p>
                                                        <p className="text-sm text-slate-500">{org.type}</p>
                                                        <p className="text-xs text-slate-400">{org.doctorCount} bác sĩ</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Badge className={org.verified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                                                        {org.verified ? (
                                                            <><CheckCircle className="w-3 h-3 mr-1" /> Đã xác thực</>
                                                        ) : (
                                                            <><Clock className="w-3 h-3 mr-1" /> Chưa xác thực</>
                                                        )}
                                                    </Badge>
                                                    <Button variant="outline" size="sm">
                                                        Quản lý
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tab 2: Pending */}
                    <TabsContent value="pending" className="outline-none">
                        <Card className="bg-white">
                            <CardHeader>
                                <CardTitle className="text-slate-900">Tổ chức đang chờ xác thực</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {pendingOrgs.length === 0 ? (
                                    <div className="text-center py-12 bg-slate-50 rounded-xl">
                                        <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
                                        <p className="text-slate-500">Không có yêu cầu nào đang chờ.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {pendingOrgs.map((org) => (
                                            <div
                                                key={org.id}
                                                className="p-4 border border-orange-200 rounded-xl bg-orange-50"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                                                            <Clock className="w-6 h-6 text-orange-600" />
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-slate-900">{org.name}</p>
                                                            <p className="text-sm text-slate-500">{org.type}</p>
                                                            <p className="text-xs text-slate-400">
                                                                Yêu cầu: {new Date(org.requestedAt).toLocaleDateString('vi-VN')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleVerifyOrg(org.id, true)}
                                                            disabled={loading}
                                                            className="bg-green-600 hover:bg-green-700"
                                                        >
                                                            <CheckCircle className="w-4 h-4 mr-1" />
                                                            Phê duyệt
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleVerifyOrg(org.id, false)}
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

                    {/* Tab 3: Relayers */}
                    <TabsContent value="relayers" className="outline-none">
                        <Card className="bg-white">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-slate-900 flex items-center gap-2">
                                    <Database className="w-5 h-5 text-blue-600" />
                                    Quản lý Relayers
                                </CardTitle>
                                <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                                    <Key className="w-4 h-4 mr-2" />
                                    Thêm Relayer
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    {relayers.map((relayer, index) => (
                                        <div
                                            key={relayer.address}
                                            className="p-4 border border-slate-200 rounded-xl bg-gradient-to-r from-blue-50 to-slate-50"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                                                        <Database className="w-6 h-6 text-blue-600" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-slate-900">{relayer.name}</p>
                                                        <p className="text-xs text-slate-400 font-mono">{relayer.address}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-lg font-bold text-blue-600">{relayer.sponsored}</p>
                                                        <p className="text-xs text-slate-500">Tx đã sponsor</p>
                                                    </div>
                                                    <Badge className={relayer.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                                                        {relayer.active ? 'Hoạt động' : 'Tạm dừng'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tab 4: System */}
                    <TabsContent value="system" className="outline-none">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="bg-white">
                                <CardHeader>
                                    <CardTitle className="text-slate-900 flex items-center gap-2">
                                        <Shield className="w-5 h-5 text-green-600" />
                                        Smart Contracts
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {[
                                        { name: 'AccessControl', status: 'active' },
                                        { name: 'RecordRegistry', status: 'active' },
                                        { name: 'ConsentLedger', status: 'active' },
                                        { name: 'DoctorUpdate', status: 'active' },
                                        { name: 'EHRSystemSecure', status: 'active' },
                                    ].map((contract) => (
                                        <div key={contract.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                            <span className="font-mono text-sm text-slate-700">{contract.name}</span>
                                            <Badge className="bg-green-100 text-green-700">
                                                <CheckCircle className="w-3 h-3 mr-1" />
                                                Active
                                            </Badge>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>

                            <Card className="bg-white">
                                <CardHeader>
                                    <CardTitle className="text-slate-900 flex items-center gap-2">
                                        <TrendingUp className="w-5 h-5 text-purple-600" />
                                        Thống kê hệ thống
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="p-4 bg-purple-50 rounded-xl">
                                        <p className="text-sm text-slate-600">Tổng hồ sơ on-chain</p>
                                        <p className="text-3xl font-bold text-purple-700">12,458</p>
                                    </div>
                                    <div className="p-4 bg-blue-50 rounded-xl">
                                        <p className="text-sm text-slate-600">Transactions tháng này</p>
                                        <p className="text-3xl font-bold text-blue-700">3,256</p>
                                    </div>
                                    <div className="p-4 bg-green-50 rounded-xl">
                                        <p className="text-sm text-slate-600">Gas đã tiết kiệm (ETH)</p>
                                        <p className="text-3xl font-bold text-green-700">45.8</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
}
