"use client";

import { useState, useEffect } from 'react';
import { Building2, CheckCircle2, XCircle, Clock, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { orgService } from '@/services';
import { useUserRoles } from '@/hooks/useUserRoles';

/**
 * Ministry-only component to review org applications
 */
export default function AdminOrgApplications() {
    const { toast } = useToast();
    const { isMinistry, loading: rolesLoading } = useUserRoles();
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState(null);
    const [rejectDialog, setRejectDialog] = useState({ open: false, application: null });
    const [rejectReason, setRejectReason] = useState('');

    const fetchApplications = async () => {
        try {
            setLoading(true);
            const response = await orgService.getOrgApplications('PENDING');
            setApplications(response.data?.applications || []);
        } catch (error) {
            console.error('Fetch applications error:', error);
            toast({
                title: 'Lỗi tải danh sách',
                description: 'Không thể tải danh sách đơn đăng ký',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isMinistry) {
            fetchApplications();
        }
    }, [isMinistry]);

    const handleApprove = async (application) => {
        setProcessingId(application.id);
        try {
            const result = await orgService.approveOrgApplication(application.id);
            toast({
                title: 'Đã phê duyệt',
                description: `${application.orgName} đã được xác thực thành công`,
            });
            fetchApplications();
        } catch (error) {
            console.error('Approve error:', error);

            const errorMsg = error.response?.data?.error || 'Không thể phê duyệt';
            const code = error.response?.data?.code;

            if (code === 'NOT_REGISTERED_ON_CHAIN') {
                toast({
                    title: 'Chưa đăng ký on-chain',
                    description: 'Tổ chức này chưa gọi registerAsOrganization() trên blockchain',
                    variant: 'destructive',
                });
            } else {
                toast({
                    title: 'Lỗi phê duyệt',
                    description: errorMsg,
                    variant: 'destructive',
                });
            }
        } finally {
            setProcessingId(null);
        }
    };

    const openRejectDialog = (application) => {
        setRejectDialog({ open: true, application });
        setRejectReason('');
    };

    const handleReject = async () => {
        if (!rejectReason || rejectReason.length < 10) {
            toast({
                title: 'Lý do quá ngắn',
                description: 'Vui lòng nhập lý do từ chối (ít nhất 10 ký tự)',
                variant: 'destructive',
            });
            return;
        }

        const application = rejectDialog.application;
        setProcessingId(application.id);
        setRejectDialog({ open: false, application: null });

        try {
            await orgService.rejectOrgApplication(application.id, rejectReason);
            toast({
                title: 'Đã từ chối',
                description: `Đơn của ${application.orgName} đã bị từ chối`,
            });
            fetchApplications();
        } catch (error) {
            console.error('Reject error:', error);
            toast({
                title: 'Lỗi từ chối',
                description: 'Không thể từ chối đơn',
                variant: 'destructive',
            });
        } finally {
            setProcessingId(null);
        }
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            PENDING: { label: 'Chờ duyệt', variant: 'outline', icon: Clock },
            APPROVED: { label: 'Đã duyệt', variant: 'default', icon: CheckCircle2 },
            REJECTED: { label: 'Từ chối', variant: 'destructive', icon: XCircle },
            FAILED: { label: 'Lỗi', variant: 'destructive', icon: AlertTriangle },
        };
        const config = statusMap[status] || statusMap.PENDING;
        const Icon = config.icon;
        return (
            <Badge variant={config.variant} className="flex items-center gap-1">
                <Icon className="w-3 h-3" />
                {config.label}
            </Badge>
        );
    };

    if (rolesLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!isMinistry) {
        return (
            <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-6 text-center">
                    <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <p className="text-red-700 font-medium">
                        Chỉ Bộ Y tế mới có quyền truy cập trang này
                    </p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="w-5 h-5" />
                        Đơn đăng ký Tổ chức
                    </CardTitle>
                    <CardDescription>
                        Xét duyệt đơn đăng ký tổ chức y tế
                    </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchApplications} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Làm mới
                </Button>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                ) : applications.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-400" />
                        <p>Không có đơn đăng ký nào đang chờ duyệt</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {applications.map((app) => (
                            <div
                                key={app.id}
                                className="border rounded-lg p-4 hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h4 className="font-semibold text-lg">{app.orgName}</h4>
                                            {getStatusBadge(app.status)}
                                            <Badge variant="secondary">
                                                {app.orgType === 'hospital' ? 'Bệnh viện' : 'Phòng khám'}
                                            </Badge>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                                            <div>
                                                <strong>Email:</strong> {app.contactEmail}
                                            </div>
                                            <div>
                                                <strong>Giấy phép:</strong> {app.licenseNumber || 'Chưa cung cấp'}
                                            </div>
                                            <div>
                                                <strong>Địa chỉ ví:</strong>{' '}
                                                <code className="text-xs bg-slate-100 px-1 rounded">
                                                    {app.applicantAddress?.slice(0, 10)}...
                                                </code>
                                            </div>
                                            <div>
                                                <strong>Ngày nộp:</strong>{' '}
                                                {new Date(app.createdAt).toLocaleDateString('vi-VN')}
                                            </div>
                                        </div>
                                        {app.description && (
                                            <p className="text-sm text-slate-500 mt-2">{app.description}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openRejectDialog(app)}
                                            disabled={processingId === app.id}
                                        >
                                            <XCircle className="w-4 h-4 mr-1" />
                                            Từ chối
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => handleApprove(app)}
                                            disabled={processingId === app.id}
                                        >
                                            {processingId === app.id ? (
                                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                            ) : (
                                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                            )}
                                            Phê duyệt
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>

            {/* Reject Dialog */}
            <Dialog open={rejectDialog.open} onOpenChange={(open) => !open && setRejectDialog({ open: false, application: null })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Từ chối đơn đăng ký</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-slate-600">
                            Bạn đang từ chối đơn của: <strong>{rejectDialog.application?.orgName}</strong>
                        </p>
                        <Textarea
                            placeholder="Nhập lý do từ chối (ít nhất 10 ký tự)..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            rows={3}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectDialog({ open: false, application: null })}>
                            Hủy
                        </Button>
                        <Button variant="destructive" onClick={handleReject}>
                            Xác nhận từ chối
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
