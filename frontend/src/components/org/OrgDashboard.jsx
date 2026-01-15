"use client";

import { useState, useEffect } from 'react';
import { Building2, Users, Shield, Clock, Loader2, AlertTriangle, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useUserRoles } from '@/hooks/useUserRoles';
import { orgService } from '@/services';
import OrgApplicationForm from './OrgApplicationForm';
import AdminOrgApplications from './AdminOrgApplications';

/**
 * Main ORG Dashboard - handles different states:
 * 1. Not an org - show application form
 * 2. Pending application - show status
 * 3. Verified org - show management tabs
 * 4. Ministry - show additional admin tab
 */
export default function OrgDashboard() {
    const { toast } = useToast();
    const { isOrg, isVerifiedOrg, isMinistry, loading: rolesLoading } = useUserRoles();
    const [application, setApplication] = useState(null);
    const [org, setOrg] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);

                // Check if user has a pending/approved application
                const appResponse = await orgService.getMyApplication();
                if (appResponse.data?.hasApplication) {
                    setApplication(appResponse.data.application);
                }

                // If verified org, get org details
                if (isVerifiedOrg) {
                    const orgResponse = await orgService.getMyOrg();
                    if (orgResponse.data?.hasOrg) {
                        setOrg(orgResponse.data.organization);
                    }
                }
            } catch (error) {
                console.error('Load org data error:', error);
            } finally {
                setLoading(false);
            }
        };

        if (!rolesLoading) {
            fetchData();
        }
    }, [rolesLoading, isVerifiedOrg]);

    if (rolesLoading || loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    // Status badge for application
    const getStatusBadge = (status) => {
        const statusMap = {
            PENDING: { label: 'Đang chờ duyệt', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
            APPROVED: { label: 'Đã duyệt', color: 'bg-green-100 text-green-700', icon: Shield },
            REJECTED: { label: 'Bị từ chối', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
            FAILED: { label: 'Lỗi', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
        };
        const config = statusMap[status] || statusMap.PENDING;
        const Icon = config.icon;
        return (
            <Badge className={`${config.color} flex items-center gap-1`}>
                <Icon className="w-3 h-3" />
                {config.label}
            </Badge>
        );
    };

    // Case 1: Verified ORG - show full dashboard
    if (isVerifiedOrg && org) {
        return (
            <div className="space-y-6">
                {/* Header */}
                <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
                                <Building2 className="w-8 h-8 text-purple-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-purple-800">{org.name}</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <Badge className="bg-green-100 text-green-700">
                                        <Shield className="w-3 h-3 mr-1" />
                                        Đã xác thực
                                    </Badge>
                                    <Badge variant="outline">
                                        {org.orgType === 'hospital' ? 'Bệnh viện' : 'Phòng khám'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Tabs */}
                <Tabs defaultValue="members">
                    <TabsList>
                        <TabsTrigger value="members">
                            <Users className="w-4 h-4 mr-2" />
                            Thành viên
                        </TabsTrigger>
                        <TabsTrigger value="verification">
                            <Shield className="w-4 h-4 mr-2" />
                            Xác thực Bác sĩ
                        </TabsTrigger>
                        {isMinistry && (
                            <TabsTrigger value="admin">
                                <Building2 className="w-4 h-4 mr-2" />
                                Quản lý ORG
                            </TabsTrigger>
                        )}
                    </TabsList>

                    <TabsContent value="members" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Thành viên tổ chức</CardTitle>
                                <CardDescription>
                                    Quản lý bác sĩ và nhân viên trong tổ chức
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-slate-500 text-center py-8">
                                    Component OrgMemberList sẽ được thêm vào đây
                                </p>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="verification" className="mt-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Xác thực Bác sĩ</CardTitle>
                                <CardDescription>
                                    Xác thực thông tin và chứng chỉ của bác sĩ
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-slate-500 text-center py-8">
                                    Component OrgVerifyDoctor sẽ được thêm vào đây
                                </p>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {isMinistry && (
                        <TabsContent value="admin" className="mt-4">
                            <AdminOrgApplications />
                        </TabsContent>
                    )}
                </Tabs>
            </div>
        );
    }

    // Case 2: Has pending application - show status
    if (application && application.status === 'PENDING') {
        return (
            <Card className="border-yellow-200 bg-yellow-50">
                <CardContent className="pt-6">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <Clock className="w-16 h-16 text-yellow-500" />
                        <div>
                            <h3 className="text-xl font-semibold text-yellow-800">
                                Đơn đang chờ duyệt
                            </h3>
                            <p className="text-yellow-700 mt-2">
                                Đơn đăng ký "{application.orgName}" của bạn đang được xem xét.
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-4 text-left w-full max-w-md">
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Trạng thái:</span>
                                    {getStatusBadge(application.status)}
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Ngày nộp:</span>
                                    <span>{new Date(application.createdAt).toLocaleDateString('vi-VN')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Email:</span>
                                    <span>{application.contactEmail}</span>
                                </div>
                            </div>
                        </div>
                        <div className="text-sm text-yellow-600 bg-yellow-100 rounded-lg p-4 mt-2">
                            <strong>Lưu ý:</strong> Hãy chắc chắn bạn đã gọi{' '}
                            <code className="bg-yellow-200 px-1 rounded">registerAsOrganization()</code>{' '}
                            trên blockchain trước khi được duyệt.
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Case 3: Application rejected - show reason and allow re-apply
    if (application && application.status === 'REJECTED') {
        return (
            <div className="space-y-6">
                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <div className="flex flex-col items-center gap-4 text-center">
                            <AlertTriangle className="w-16 h-16 text-red-500" />
                            <div>
                                <h3 className="text-xl font-semibold text-red-800">
                                    Đơn bị từ chối
                                </h3>
                                <p className="text-red-700 mt-2">
                                    Đơn đăng ký "{application.orgName}" đã bị từ chối.
                                </p>
                            </div>
                            {application.reviewNote && (
                                <div className="bg-white rounded-lg p-4 text-left w-full max-w-md">
                                    <p className="text-sm text-slate-600">
                                        <strong>Lý do:</strong> {application.reviewNote}
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
                <OrgApplicationForm />
            </div>
        );
    }

    // Case 4: Ministry without org - show admin panel
    if (isMinistry && !isOrg) {
        return <AdminOrgApplications />;
    }

    // Case 5: No application - show form
    return <OrgApplicationForm />;
}
