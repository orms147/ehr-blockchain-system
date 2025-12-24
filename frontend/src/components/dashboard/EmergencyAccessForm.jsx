"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
    AlertTriangle, Loader2, User, FileText,
    CheckCircle, Clock, MapPin, Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { emergencyService } from '@/services';

const EMERGENCY_TYPES = [
    { value: 'medical', label: 'Cấp cứu y tế', icon: '🏥' },
    { value: 'accident', label: 'Tai nạn', icon: '🚑' },
    { value: 'critical', label: 'Nguy kịch', icon: '⚠️' },
];

export default function EmergencyAccessForm({ onSuccess = null }) {
    const [patientAddress, setPatientAddress] = useState('');
    const [reason, setReason] = useState('');
    const [emergencyType, setEmergencyType] = useState('medical');
    const [location, setLocation] = useState('');
    const [durationHours, setDurationHours] = useState(24);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(null);

    const isValidAddress = (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isValidAddress(patientAddress)) {
            toast({ title: "Lỗi", description: "Địa chỉ bệnh nhân không hợp lệ", variant: "destructive" });
            return;
        }

        if (reason.length < 10) {
            toast({ title: "Lỗi", description: "Vui lòng nhập lý do chi tiết hơn (tối thiểu 10 ký tự)", variant: "destructive" });
            return;
        }

        setSubmitting(true);

        try {
            const result = await emergencyService.requestEmergencyAccess({
                patientAddress,
                reason,
                emergencyType,
                location: location || undefined,
                durationHours,
            });

            setSuccess(result.emergency);

            toast({
                title: "Thành công!",
                description: "Đã tạo quyền truy cập khẩn cấp",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            if (onSuccess) {
                onSuccess(result.emergency);
            }
        } catch (err) {
            console.error('Emergency access error:', err);
            toast({
                title: "Lỗi",
                description: err.message || "Không thể tạo quyền truy cập khẩn cấp",
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setPatientAddress('');
        setReason('');
        setEmergencyType('medical');
        setLocation('');
        setDurationHours(24);
        setSuccess(null);
    };

    // Success state
    if (success) {
        return (
            <Card className="bg-green-50 border-green-200">
                <CardContent className="p-8">
                    <div className="flex flex-col items-center text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-green-800 mb-2">Đã cấp quyền truy cập!</h3>
                        <p className="text-green-700 mb-4">Bạn có thể truy cập hồ sơ của bệnh nhân</p>

                        <div className="bg-white p-4 rounded-xl w-full max-w-md text-left mb-6">
                            <p className="text-sm text-slate-600 mb-2">
                                <strong>Bệnh nhân:</strong> {success.patientAddress?.slice(0, 10)}...
                            </p>
                            <p className="text-sm text-slate-600 mb-2">
                                <strong>Loại:</strong> {EMERGENCY_TYPES.find(t => t.value === success.emergencyType)?.label}
                            </p>
                            <p className="text-sm text-slate-600">
                                <strong>Hết hạn:</strong> {new Date(success.expiresAt).toLocaleString('vi-VN')}
                            </p>
                        </div>

                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-6">
                            <p className="text-sm text-yellow-800 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                Quyền truy cập sẽ tự động hết hạn và được ghi nhận trong audit log
                            </p>
                        </div>

                        <Button onClick={resetForm} className="bg-teal-600 hover:bg-teal-700">
                            Yêu cầu mới
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-white border-red-200">
            <CardHeader className="bg-red-50 rounded-t-lg">
                <CardTitle className="text-red-800 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Truy cập Khẩn cấp
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-6">
                    <p className="text-sm text-red-800">
                        <strong>Cảnh báo:</strong> Quyền truy cập khẩn cấp chỉ được sử dụng trong trường hợp y tế khẩn cấp
                        khi bệnh nhân không thể cấp quyền thông thường. Mọi truy cập sẽ được ghi nhận.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Patient Address */}
                    <div className="space-y-2">
                        <Label htmlFor="patientAddress" className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            Địa chỉ ví bệnh nhân *
                        </Label>
                        <Input
                            id="patientAddress"
                            placeholder="0x..."
                            value={patientAddress}
                            onChange={(e) => setPatientAddress(e.target.value)}
                            className={!patientAddress || isValidAddress(patientAddress) ? '' : 'border-red-500'}
                        />
                    </div>

                    {/* Emergency Type */}
                    <div className="space-y-2">
                        <Label>Loại khẩn cấp</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {EMERGENCY_TYPES.map((type) => (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => setEmergencyType(type.value)}
                                    className={`p-3 rounded-lg border-2 text-center transition-all ${emergencyType === type.value
                                            ? 'border-red-500 bg-red-50 text-red-700'
                                            : 'border-slate-200 hover:border-red-300'
                                        }`}
                                >
                                    <div className="text-2xl mb-1">{type.icon}</div>
                                    <div className="text-xs">{type.label}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Reason */}
                    <div className="space-y-2">
                        <Label htmlFor="reason">
                            <FileText className="w-4 h-4 inline mr-1" />
                            Lý do truy cập khẩn cấp *
                        </Label>
                        <Textarea
                            id="reason"
                            placeholder="Mô tả tình huống y tế khẩn cấp..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            required
                        />
                        <p className="text-xs text-slate-500">Tối thiểu 10 ký tự</p>
                    </div>

                    {/* Location */}
                    <div className="space-y-2">
                        <Label htmlFor="location" className="flex items-center gap-1">
                            <MapPin className="w-4 h-4" />
                            Địa điểm cấp cứu
                        </Label>
                        <Input
                            id="location"
                            placeholder="VD: Bệnh viện Chợ Rẫy, Phòng cấp cứu"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                        />
                    </div>

                    {/* Duration */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Thời hạn truy cập
                        </Label>
                        <div className="flex gap-2">
                            {[12, 24, 48].map((hours) => (
                                <button
                                    key={hours}
                                    type="button"
                                    onClick={() => setDurationHours(hours)}
                                    className={`flex-1 p-2 rounded-lg border-2 text-sm ${durationHours === hours
                                            ? 'border-red-500 bg-red-50 text-red-700'
                                            : 'border-slate-200'
                                        }`}
                                >
                                    {hours} giờ
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Submit */}
                    <Button
                        type="submit"
                        className="w-full bg-red-600 hover:bg-red-700"
                        disabled={submitting || !isValidAddress(patientAddress) || reason.length < 10}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Đang xử lý...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Yêu cầu truy cập khẩn cấp
                            </>
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
