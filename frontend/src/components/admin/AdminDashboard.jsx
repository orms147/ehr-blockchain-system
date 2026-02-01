"use client";

import { useState, useEffect } from 'react';
import { Building2, UserCheck, Activity, Settings, Shield, Loader2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import AdminOrgApplications from '@/components/org/AdminOrgApplications';

/**
 * Ministry Admin Dashboard - Only accessible by Ministry wallet
 */
export default function AdminDashboard() {
    const { address } = useWalletAddress();
    const { isMinistry, loading: rolesLoading } = useUserRoles();

    if (rolesLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        );
    }

    if (!isMinistry) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <Card className="max-w-md border-red-500/30 bg-slate-800">
                    <CardContent className="pt-6 text-center">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-white mb-2">Truy cập bị từ chối</h2>
                        <p className="text-slate-400">
                            Chỉ Bộ Y tế mới có quyền truy cập trang này.
                        </p>
                        <p className="text-xs text-slate-500 mt-4">
                            Địa chỉ của bạn: {address?.slice(0, 10)}...
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
            <div className="container mx-auto px-4 py-8 max-w-6xl">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                            <Shield className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Bộ Y tế Vietnam</h1>
                            <p className="text-slate-400">Quản lý hệ thống EHR Chain</p>
                        </div>
                        <Badge className="ml-auto bg-purple-500/20 text-purple-300 border-purple-500/30">
                            <Shield className="w-3 h-3 mr-1" />
                            Ministry
                        </Badge>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <StatsCard
                        icon={Building2}
                        label="Tổ chức chờ duyệt"
                        value="--"
                        color="text-yellow-400"
                    />
                    <StatsCard
                        icon={UserCheck}
                        label="Bác sĩ chờ xác thực"
                        value="--"
                        color="text-blue-400"
                    />
                    <StatsCard
                        icon={Building2}
                        label="Tổ chức đã duyệt"
                        value="--"
                        color="text-green-400"
                    />
                    <StatsCard
                        icon={Activity}
                        label="Giao dịch hôm nay"
                        value="--"
                        color="text-purple-400"
                    />
                </div>

                {/* Main Content */}
                <Tabs defaultValue="org-applications" className="space-y-6">
                    <TabsList className="bg-slate-800 border-slate-700">
                        <TabsTrigger value="org-applications" className="data-[state=active]:bg-purple-600">
                            <Building2 className="w-4 h-4 mr-2" />
                            Đơn đăng ký ORG
                        </TabsTrigger>
                        <TabsTrigger value="doctor-verification" className="data-[state=active]:bg-purple-600">
                            <UserCheck className="w-4 h-4 mr-2" />
                            Xác thực Bác sĩ
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="data-[state=active]:bg-purple-600">
                            <Settings className="w-4 h-4 mr-2" />
                            Cài đặt
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="org-applications">
                        <AdminOrgApplications />
                    </TabsContent>

                    <TabsContent value="doctor-verification">
                        <Card className="bg-slate-800 border-slate-700">
                            <CardHeader>
                                <CardTitle className="text-white">Xác thực Bác sĩ</CardTitle>
                                <CardDescription>
                                    Xem xét và xác thực giấy phép hành nghề của bác sĩ
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-slate-400 text-center py-8">
                                    Component sẽ được thêm sau
                                </p>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="settings">
                        <Card className="bg-slate-800 border-slate-700">
                            <CardHeader>
                                <CardTitle className="text-white">Cài đặt Hệ thống</CardTitle>
                                <CardDescription>
                                    Quản lý cấu hình contract và hệ thống
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-4 bg-slate-700/50 rounded-lg">
                                    <p className="text-sm text-slate-400">Ministry Address</p>
                                    <code className="text-xs text-purple-300 font-mono">{address}</code>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

function StatsCard({ icon: Icon, label, value, color }) {
    return (
        <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-slate-700 ${color}`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-white">{value}</p>
                        <p className="text-xs text-slate-400">{label}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
