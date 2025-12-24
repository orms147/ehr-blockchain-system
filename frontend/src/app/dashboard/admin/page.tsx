"use client";

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import {
    Shield, Users, CheckCircle, XCircle, Clock, Loader2,
    RefreshCw, Eye, Award, Building, Stethoscope
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { verificationService } from '@/services';
import { useWeb3Auth } from '@web3auth/modal/react';
import { createWalletClient, custom, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { ensureArbitrumSepolia } from '@/utils/chainSwitch';

const ACCESS_CONTROL_ADDRESS = process.env.NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS;
const ACCESS_CONTROL_ABI = parseAbi([
    'function verifyDoctor(address doctor, string credential) external',
]);

interface VerificationRequest {
    id: string;
    doctorAddress: string;
    fullName: string;
    licenseNumber?: string;
    specialty?: string;
    organization?: string;
    status: string;
    createdAt: string;
    reviewedAt?: string;
    reviewedBy?: string;
    rejectionReason?: string;
}

export default function AdminDashboardPage() {
    const { provider, address } = useWeb3Auth();
    const [requests, setRequests] = useState<VerificationRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
    const [filter, setFilter] = useState('pending');

    const springConfig = { type: "spring" as const, stiffness: 100, damping: 20 };

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const data = filter === 'all'
                ? await verificationService.getAllVerifications()
                : await verificationService.getAllVerifications(filter);
            setRequests(data.requests || []);
        } catch (err) {
            console.error('Error fetching requests:', err);
            toast({
                title: "Lỗi",
                description: "Không thể tải danh sách yêu cầu",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRequests();
    }, [filter]);

    const handleApprove = async (request: VerificationRequest) => {
        if (!provider || !address) {
            toast({ title: "Lỗi", description: "Vui lòng kết nối ví", variant: "destructive" });
            return;
        }

        setProcessingId(request.id);
        try {
            // 1. Update status in backend
            const result = await verificationService.reviewVerification(request.id, true);

            // 2. Ensure correct chain
            await ensureArbitrumSepolia(provider);

            // 3. Call verifyDoctor on-chain
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });

            const credential = request.licenseNumber || 'VERIFIED';

            const hash = await walletClient.writeContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'verifyDoctor',
                args: [request.doctorAddress, credential],
                account: address,
            });

            toast({
                title: "Đã xác thực Bác sĩ!",
                description: `${request.fullName} đã được xác thực on-chain.`,
                className: "bg-green-50 border-green-200 text-green-800",
            });

            fetchRequests();

        } catch (err) {
            console.error('Approve error:', err);
            toast({
                title: "Lỗi",
                description: err instanceof Error ? err.message : "Không thể xác thực",
                variant: "destructive",
            });
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (requestId: string) => {
        setProcessingId(requestId);
        try {
            await verificationService.reviewVerification(requestId, false, rejectionReason);

            toast({
                title: "Đã từ chối",
                description: "Yêu cầu xác thực đã bị từ chối.",
            });

            setShowRejectModal(null);
            setRejectionReason('');
            fetchRequests();

        } catch (err) {
            console.error('Reject error:', err);
            toast({
                title: "Lỗi",
                description: err instanceof Error ? err.message : "Không thể từ chối",
                variant: "destructive",
            });
        } finally {
            setProcessingId(null);
        }
    };

    const stats = [
        {
            icon: Clock,
            label: 'Đang chờ',
            value: requests.filter(r => r.status === 'pending').length.toString(),
            color: 'from-yellow-500 to-yellow-600'
        },
        {
            icon: CheckCircle,
            label: 'Đã duyệt',
            value: requests.filter(r => r.status === 'approved').length.toString(),
            color: 'from-green-500 to-green-600'
        },
        {
            icon: XCircle,
            label: 'Đã từ chối',
            value: requests.filter(r => r.status === 'rejected').length.toString(),
            color: 'from-red-500 to-red-600'
        },
    ];

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
                        <Shield className="w-8 h-8 text-purple-600" />
                        Bảng điều khiển Quản trị
                    </h1>
                    <p className="text-slate-500 mt-2">Quản lý xác thực bác sĩ và hệ thống.</p>
                </motion.div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-6 mb-8">
                    {stats.map((stat, index) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ ...springConfig, delay: index * 0.1 }}
                        >
                            <Card className="hover:shadow-lg transition-shadow bg-white">
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

                {/* Filter Tabs */}
                <Tabs value={filter} onValueChange={setFilter} className="space-y-6">
                    <TabsList className="bg-white border p-1 rounded-xl">
                        <TabsTrigger value="pending" className="rounded-lg px-6 py-2.5">
                            <Clock className="w-4 h-4 mr-2" />
                            Đang chờ
                        </TabsTrigger>
                        <TabsTrigger value="approved" className="rounded-lg px-6 py-2.5">
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Đã duyệt
                        </TabsTrigger>
                        <TabsTrigger value="rejected" className="rounded-lg px-6 py-2.5">
                            <XCircle className="w-4 h-4 mr-2" />
                            Đã từ chối
                        </TabsTrigger>
                        <TabsTrigger value="all" className="rounded-lg px-6 py-2.5">
                            Tất cả
                        </TabsTrigger>
                    </TabsList>

                    <Card className="bg-white">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Yêu cầu xác thực</CardTitle>
                            <Button variant="ghost" size="sm" onClick={fetchRequests}>
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                                    <span className="ml-3">Đang tải...</span>
                                </div>
                            ) : requests.length === 0 ? (
                                <div className="text-center py-12 bg-slate-50 rounded-xl">
                                    <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                    <p className="text-slate-500">Không có yêu cầu nào.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {requests.map((request) => (
                                        <div
                                            key={request.id}
                                            className="p-4 border rounded-xl hover:border-purple-300 transition-colors"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-start gap-4">
                                                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                                                        <Stethoscope className="w-6 h-6 text-purple-600" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-slate-900">{request.fullName}</p>
                                                        <p className="text-sm text-slate-500">
                                                            {request.doctorAddress?.slice(0, 10)}...{request.doctorAddress?.slice(-8)}
                                                        </p>
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            {request.licenseNumber && (
                                                                <Badge variant="secondary" className="flex items-center gap-1">
                                                                    <Award className="w-3 h-3" />
                                                                    {request.licenseNumber}
                                                                </Badge>
                                                            )}
                                                            {request.specialty && (
                                                                <Badge variant="outline">{request.specialty}</Badge>
                                                            )}
                                                            {request.organization && (
                                                                <Badge variant="outline" className="flex items-center gap-1">
                                                                    <Building className="w-3 h-3" />
                                                                    {request.organization}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-400 mt-2">
                                                            Gửi lúc: {new Date(request.createdAt).toLocaleString('vi-VN')}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Badge className={
                                                        request.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                            request.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                                'bg-yellow-100 text-yellow-800'
                                                    }>
                                                        {request.status === 'approved' ? 'Đã duyệt' :
                                                            request.status === 'rejected' ? 'Đã từ chối' : 'Đang chờ'}
                                                    </Badge>

                                                    {request.status === 'pending' && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleApprove(request)}
                                                                disabled={processingId === request.id}
                                                                className="bg-green-600 hover:bg-green-700"
                                                            >
                                                                {processingId === request.id ? (
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <CheckCircle className="w-4 h-4 mr-1" />
                                                                        Duyệt
                                                                    </>
                                                                )}
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                onClick={() => setShowRejectModal(request.id)}
                                                                disabled={processingId === request.id}
                                                            >
                                                                <XCircle className="w-4 h-4 mr-1" />
                                                                Từ chối
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Reject Modal */}
                                            {showRejectModal === request.id && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    className="mt-4 p-4 bg-red-50 rounded-xl border border-red-200"
                                                >
                                                    <p className="text-sm font-medium text-red-800 mb-2">Lý do từ chối:</p>
                                                    <Input
                                                        placeholder="Nhập lý do..."
                                                        value={rejectionReason}
                                                        onChange={(e) => setRejectionReason(e.target.value)}
                                                        className="mb-2"
                                                    />
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            onClick={() => handleReject(request.id)}
                                                            disabled={processingId === request.id}
                                                        >
                                                            Xác nhận từ chối
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => setShowRejectModal(null)}
                                                        >
                                                            Hủy
                                                        </Button>
                                                    </div>
                                                </motion.div>
                                            )}

                                            {/* Rejection reason display */}
                                            {request.status === 'rejected' && request.rejectionReason && (
                                                <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                                                    Lý do: {request.rejectionReason}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </Tabs>
            </div>
        </DashboardLayout>
    );
}
