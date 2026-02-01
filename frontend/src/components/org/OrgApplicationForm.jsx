"use client";

import { useState, useRef } from 'react';
import { Building2, Mail, FileText, Loader2, CheckCircle2, Upload, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { orgService } from '@/services';

// Validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LICENSE_REGEX = /^[A-Z]{2,3}-\d{4,10}$/i;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/**
 * Form for users to apply to become an organization
 */
export default function OrgApplicationForm({ onSuccess }) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [errors, setErrors] = useState({});
    const [licenseFile, setLicenseFile] = useState(null);
    const fileInputRef = useRef(null);

    const [formData, setFormData] = useState({
        orgName: '',
        description: '',
        contactEmail: '',
        licenseNumber: '',
        orgType: 'hospital',
        address: '',
        phone: '',
    });

    const validateField = (name, value) => {
        switch (name) {
            case 'orgName':
                if (!value.trim()) return 'Tên tổ chức là bắt buộc';
                if (value.length < 3) return 'Tên tổ chức phải có ít nhất 3 ký tự';
                if (value.length > 100) return 'Tên tổ chức không được quá 100 ký tự';
                return null;
            case 'contactEmail':
                if (!value.trim()) return 'Email là bắt buộc';
                if (!EMAIL_REGEX.test(value)) return 'Email không hợp lệ';
                return null;
            case 'licenseNumber':
                if (!value.trim()) return 'Số giấy phép là bắt buộc';
                if (!LICENSE_REGEX.test(value)) return 'Định dạng: XX-12345 hoặc XXX-123456';
                return null;
            case 'phone':
                if (value && !/^0\d{9,10}$/.test(value.replace(/\s/g, ''))) {
                    return 'Số điện thoại không hợp lệ';
                }
                return null;
            default:
                return null;
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));

        // Clear error when user starts typing
        if (errors[name]) {
            const error = validateField(name, value);
            setErrors(prev => ({ ...prev, [name]: error }));
        }
    };

    const handleBlur = (e) => {
        const { name, value } = e.target;
        const error = validateField(name, value);
        setErrors(prev => ({ ...prev, [name]: error }));
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!ALLOWED_FILE_TYPES.includes(file.type)) {
            toast({
                title: 'Định dạng file không hỗ trợ',
                description: 'Chỉ chấp nhận PDF, JPEG, PNG',
                variant: 'destructive',
            });
            return;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            toast({
                title: 'File quá lớn',
                description: 'Kích thước file tối đa là 5MB',
                variant: 'destructive',
            });
            return;
        }

        setLicenseFile(file);
        setErrors(prev => ({ ...prev, licenseFile: null }));
    };

    const removeFile = () => {
        setLicenseFile(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const validateForm = () => {
        const newErrors = {};

        ['orgName', 'contactEmail', 'licenseNumber'].forEach(field => {
            const error = validateField(field, formData[field]);
            if (error) newErrors[field] = error;
        });

        if (!licenseFile) {
            newErrors.licenseFile = 'Vui lòng upload giấy phép hoạt động';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            toast({
                title: 'Thông tin chưa đầy đủ',
                description: 'Vui lòng kiểm tra lại các trường bắt buộc',
                variant: 'destructive',
            });
            return;
        }

        setLoading(true);
        try {
            // Create FormData for file upload
            const submitData = new FormData();
            Object.entries(formData).forEach(([key, value]) => {
                submitData.append(key, value);
            });
            if (licenseFile) {
                submitData.append('licenseFile', licenseFile);
            }

            const result = await orgService.applyOrg(submitData);

            setSubmitted(true);
            toast({
                title: 'Đã gửi đơn đăng ký',
                description: 'Đơn của bạn đã được gửi. Vui lòng đợi Bộ Y tế xét duyệt.',
            });

            if (onSuccess) onSuccess(result);
        } catch (error) {
            console.error('Apply org error:', error);
            toast({
                title: 'Lỗi gửi đơn',
                description: error.response?.data?.error || 'Không thể gửi đơn đăng ký',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-6">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <CheckCircle2 className="w-16 h-16 text-green-500" />
                        <div>
                            <h3 className="text-xl font-semibold text-green-800">
                                Đã gửi đơn thành công!
                            </h3>
                            <p className="text-green-600 mt-2">
                                Đơn đăng ký của bạn đã được gửi đến Bộ Y tế.
                                <br />
                                Bạn sẽ nhận được thông báo khi được xét duyệt.
                            </p>
                        </div>
                        <Button
                            onClick={() => window.location.href = '/'}
                            className="mt-4 bg-green-600 hover:bg-green-700"
                        >
                            <Building2 className="w-4 h-4 mr-2" />
                            Về trang chủ
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-white shadow-lg border-slate-200">
            <CardHeader className="pb-4 flex flex-row items-start justify-between">
                <div>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Building2 className="w-5 h-5 text-blue-600" />
                        Cập nhật hồ sơ tổ chức
                    </CardTitle>
                    <CardDescription className="text-slate-600 mt-1">
                        Cập nhật thông tin và tài liệu tuân thủ của tổ chức y tế
                    </CardDescription>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => {
                        localStorage.removeItem('jwt_token');
                        window.location.href = '/login';
                    }}
                >
                    Đăng xuất
                </Button>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Organization Name */}
                    <div className="space-y-2">
                        <Label htmlFor="orgName" className="text-slate-800 font-medium">
                            Tên tổ chức <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="orgName"
                            name="orgName"
                            placeholder="Bệnh viện ABC"
                            value={formData.orgName}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className={`bg-white text-slate-900 placeholder:text-slate-400 border-slate-300 focus:border-blue-500 ${errors.orgName ? 'border-red-500' : ''}`}
                        />
                        {errors.orgName && (
                            <p className="text-sm text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.orgName}
                            </p>
                        )}
                    </div>

                    {/* Organization Type */}
                    <div className="space-y-2">
                        <Label htmlFor="orgType" className="text-slate-800 font-medium">
                            Loại hình <span className="text-red-500">*</span>
                        </Label>
                        <Select
                            value={formData.orgType}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, orgType: value }))}
                        >
                            <SelectTrigger className="bg-white text-slate-900 border-slate-300">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="hospital">Bệnh viện công</SelectItem>
                                <SelectItem value="private_hospital">Bệnh viện tư</SelectItem>
                                <SelectItem value="clinic">Phòng khám</SelectItem>
                                <SelectItem value="medical_center">Trung tâm y tế</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Contact Email */}
                    <div className="space-y-2">
                        <Label htmlFor="contactEmail" className="text-slate-800 font-medium">
                            Email liên hệ <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                            <Input
                                id="contactEmail"
                                name="contactEmail"
                                type="email"
                                placeholder="contact@hospital.com"
                                value={formData.contactEmail}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={`pl-10 bg-white text-slate-900 placeholder:text-slate-400 border-slate-300 ${errors.contactEmail ? 'border-red-500' : ''}`}
                            />
                        </div>
                        {errors.contactEmail && (
                            <p className="text-sm text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.contactEmail}
                            </p>
                        )}
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                        <Label htmlFor="phone" className="text-slate-800 font-medium">
                            Số điện thoại
                        </Label>
                        <Input
                            id="phone"
                            name="phone"
                            type="tel"
                            placeholder="0123 456 789"
                            value={formData.phone}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            className={`bg-white text-slate-900 placeholder:text-slate-400 border-slate-300 ${errors.phone ? 'border-red-500' : ''}`}
                        />
                        {errors.phone && (
                            <p className="text-sm text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.phone}
                            </p>
                        )}
                    </div>

                    {/* License Number */}
                    <div className="space-y-2">
                        <Label htmlFor="licenseNumber" className="text-slate-800 font-medium">
                            Số giấy phép hoạt động <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                            <FileText className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                            <Input
                                id="licenseNumber"
                                name="licenseNumber"
                                placeholder="GP-12345 hoặc BYT-123456"
                                value={formData.licenseNumber}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                className={`pl-10 bg-white text-slate-900 placeholder:text-slate-400 border-slate-300 ${errors.licenseNumber ? 'border-red-500' : ''}`}
                            />
                        </div>
                        {errors.licenseNumber && (
                            <p className="text-sm text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.licenseNumber}
                            </p>
                        )}
                    </div>

                    {/* License File Upload */}
                    <div className="space-y-2">
                        <Label className="text-slate-800 font-medium">
                            Giấy phép hoạt động (file) <span className="text-red-500">*</span>
                        </Label>
                        <div
                            className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors
                                ${errors.licenseFile ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400'}`}
                        >
                            {licenseFile ? (
                                <div className="flex items-center justify-between bg-white p-3 rounded-md border border-slate-200">
                                    <div className="flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-blue-600" />
                                        <div className="text-left">
                                            <p className="text-sm font-medium text-slate-900">{licenseFile.name}</p>
                                            <p className="text-xs text-slate-500">
                                                {(licenseFile.size / 1024).toFixed(1)} KB
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={removeFile}
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    >
                                        <X className="w-4 h-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={handleFileSelect}
                                        className="hidden"
                                        id="licenseFileInput"
                                    />
                                    <label
                                        htmlFor="licenseFileInput"
                                        className="cursor-pointer flex flex-col items-center gap-2"
                                    >
                                        <Upload className="w-8 h-8 text-slate-400" />
                                        <span className="text-sm text-slate-600">
                                            <span className="text-blue-600 font-medium">Click để upload</span> hoặc kéo thả file
                                        </span>
                                        <span className="text-xs text-slate-400">
                                            PDF, JPEG, PNG (tối đa 5MB)
                                        </span>
                                    </label>
                                </div>
                            )}
                        </div>
                        {errors.licenseFile && (
                            <p className="text-sm text-red-500 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.licenseFile}
                            </p>
                        )}
                    </div>

                    {/* Address */}
                    <div className="space-y-2">
                        <Label htmlFor="address" className="text-slate-800 font-medium">
                            Địa chỉ
                        </Label>
                        <Textarea
                            id="address"
                            name="address"
                            placeholder="Số nhà, đường, quận/huyện, tỉnh/thành phố"
                            value={formData.address}
                            onChange={handleChange}
                            rows={2}
                            className="bg-white text-slate-900 placeholder:text-slate-400 border-slate-300"
                        />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-slate-800 font-medium">
                            Mô tả về tổ chức
                        </Label>
                        <Textarea
                            id="description"
                            name="description"
                            placeholder="Giới thiệu về tổ chức, chuyên khoa, dịch vụ..."
                            value={formData.description}
                            onChange={handleChange}
                            rows={3}
                            className="bg-white text-slate-900 placeholder:text-slate-400 border-slate-300"
                        />
                    </div>

                    {/* Submit Button */}
                    <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Đang lưu...
                            </>
                        ) : (
                            <>
                                <Building2 className="w-4 h-4 mr-2" />
                                Lưu hồ sơ
                            </>
                        )}
                    </Button>

                    {/* Note */}
                    <p className="text-xs text-slate-500 text-center">
                        Thông tin và tài liệu này phục vụ cho mục đích kiểm tra và audit.
                        Bộ Y tế có thể xem xét hồ sơ bất kỳ lúc nào.
                    </p>
                </form>
            </CardContent>
        </Card>
    );
}
