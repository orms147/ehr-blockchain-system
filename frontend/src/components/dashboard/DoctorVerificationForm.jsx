"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    CheckCircle, Clock, AlertCircle, Loader2, Upload,
    Award, Building, Stethoscope, FileCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { verificationService } from '@/services';

const SPECIALTIES = [
    'Nội khoa', 'Ngoại khoa', 'Tim mạch', 'Thần kinh', 'Da liễu',
    'Nhi khoa', 'Sản phụ khoa', 'Mắt', 'Tai mũi họng', 'Răng hàm mặt',
    'Khác'
];

export default function DoctorVerificationForm({ onStatusChange = null }) {

    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        fullName: '',
        licenseNumber: '',
        specialty: '',
        organization: '',
        documentCid: '',
    });

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const data = await verificationService.getVerificationStatus();
            setStatus(data);
            if (onStatusChange) onStatusChange(data);
        } catch (err) {
            console.error('Error fetching verification status:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.fullName) {
            toast({ title: "Lỗi", description: "Vui lòng nhập họ tên", variant: "destructive" });
            return;
        }

        setSubmitting(true);
        try {
            await verificationService.submitVerification(formData);

            toast({
                title: "Đã gửi yêu cầu xác thực!",
                description: "Vui lòng chờ Bộ Y tế phê duyệt.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            fetchStatus();
        } catch (err) {
            toast({
                title: "Lỗi",
                description: err.message || "Không thể gửi yêu cầu",
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                <span className="ml-3 text-slate-600">Đang kiểm tra trạng thái...</span>
            </div>
        );
    }

    // Already verified
    if (status?.isVerified) {
        return (
            <Card className="bg-green-50 border-green-200">
                <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-8 h-8 text-green-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-green-800">Đã xác thực ✅</h3>
                            <p className="text-green-700">Bạn đã được xác thực là Bác sĩ hợp lệ.</p>
                            {status.approvedRequest && (
                                <p className="text-sm text-green-600 mt-1">
                                    Số giấy phép: {status.approvedRequest.licenseNumber}
                                </p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Has pending request
    if (status?.hasPendingRequest) {
        return (
            <Card className="bg-yellow-50 border-yellow-200">
                <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                            <Clock className="w-8 h-8 text-yellow-600 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-yellow-800">Đang chờ xét duyệt</h3>
                            <p className="text-yellow-700">Yêu cầu xác thực của bạn đang được Bộ Y tế xem xét.</p>
                            <p className="text-sm text-yellow-600 mt-2">
                                Gửi lúc: {new Date(status.pendingRequest.createdAt).toLocaleString('vi-VN')}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Not registered as doctor yet
    if (!status?.isDoctor) {
        return (
            <Card className="bg-orange-50 border-orange-200">
                <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
                            <AlertCircle className="w-8 h-8 text-orange-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-orange-800">Chưa đăng ký Bác sĩ</h3>
                            <p className="text-orange-700">Bạn cần đăng ký vai trò Bác sĩ trước khi xác thực.</p>
                            <Button className="mt-4 bg-orange-600 hover:bg-orange-700" asChild>
                                <a href="/register">Đăng ký ngay</a>
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Show verification form
    return (
        <Card className="bg-white">
            <CardHeader>
                <CardTitle className="text-slate-900 flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-teal-600" />
                    Yêu cầu xác thực Bác sĩ
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Full Name */}
                    <div className="space-y-2">
                        <Label htmlFor="fullName" className="flex items-center gap-1">
                            <Stethoscope className="w-4 h-4" />
                            Họ và tên đầy đủ *
                        </Label>
                        <Input
                            id="fullName"
                            placeholder="BS. Nguyễn Văn A"
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            required
                        />
                    </div>

                    {/* License Number */}
                    <div className="space-y-2">
                        <Label htmlFor="licenseNumber" className="flex items-center gap-1">
                            <Award className="w-4 h-4" />
                            Số giấy phép hành nghề
                        </Label>
                        <Input
                            id="licenseNumber"
                            placeholder="VD: 0001234/BYT"
                            value={formData.licenseNumber}
                            onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                        />
                    </div>

                    {/* Specialty */}
                    <div className="space-y-2">
                        <Label htmlFor="specialty" className="text-slate-800 font-medium">Chuyên khoa</Label>
                        <select
                            id="specialty"
                            className="w-full p-2 border rounded-lg"
                            value={formData.specialty}
                            onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                        >
                            <option value="">Chọn chuyên khoa</option>
                            {SPECIALTIES.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {/* Organization */}
                    <div className="space-y-2">
                        <Label htmlFor="organization" className="flex items-center gap-1">
                            <Building className="w-4 h-4" />
                            Đơn vị công tác
                        </Label>
                        <Input
                            id="organization"
                            placeholder="VD: Bệnh viện Bạch Mai"
                            value={formData.organization}
                            onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                        />
                    </div>

                    {/* Document Upload - simplified for now */}
                    <div className="p-4 bg-slate-50 rounded-xl">
                        <p className="text-sm text-slate-600">
                            <Upload className="w-4 h-4 inline mr-1" />
                            Upload giấy tờ xác thực sẽ được hỗ trợ trong phiên bản sau.
                        </p>
                    </div>

                    {/* Submit */}
                    <Button
                        type="submit"
                        className="w-full bg-teal-600 hover:bg-teal-700"
                        disabled={submitting || !formData.fullName}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Đang gửi...
                            </>
                        ) : (
                            <>
                                <FileCheck className="w-4 h-4 mr-2" />
                                Gửi yêu cầu xác thực
                            </>
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
