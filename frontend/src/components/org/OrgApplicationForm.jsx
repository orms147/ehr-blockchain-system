"use client";

import { useState } from 'react';
import { Building2, Mail, FileText, MapPin, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { orgService } from '@/services';

/**
 * Form for users to apply to become an organization
 */
export default function OrgApplicationForm({ onSuccess }) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [formData, setFormData] = useState({
        orgName: '',
        description: '',
        contactEmail: '',
        licenseNumber: '',
        orgType: 'hospital',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.orgName || !formData.contactEmail) {
            toast({
                title: 'Thiếu thông tin',
                description: 'Vui lòng điền tên tổ chức và email liên hệ',
                variant: 'destructive',
            });
            return;
        }

        setLoading(true);
        try {
            const result = await orgService.applyOrg(formData);

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
                        <div className="text-sm text-green-600 bg-green-100 rounded-lg p-4 mt-4">
                            <strong>Bước tiếp theo:</strong>
                            <br />
                            Hãy đăng ký trên blockchain bằng cách gọi{' '}
                            <code className="bg-green-200 px-1 rounded">registerAsOrganization()</code>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Đăng ký Tổ chức Y tế
                </CardTitle>
                <CardDescription>
                    Điền thông tin để đăng ký trở thành tổ chức y tế (bệnh viện, phòng khám)
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="orgName">Tên tổ chức *</Label>
                        <Input
                            id="orgName"
                            name="orgName"
                            placeholder="Bệnh viện ABC"
                            value={formData.orgName}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="orgType">Loại hình</Label>
                        <Select
                            value={formData.orgType}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, orgType: value }))}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="hospital">Bệnh viện</SelectItem>
                                <SelectItem value="clinic">Phòng khám</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="contactEmail">Email liên hệ *</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                id="contactEmail"
                                name="contactEmail"
                                type="email"
                                placeholder="contact@hospital.com"
                                value={formData.contactEmail}
                                onChange={handleChange}
                                className="pl-10"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="licenseNumber">Số giấy phép hoạt động</Label>
                        <div className="relative">
                            <FileText className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                id="licenseNumber"
                                name="licenseNumber"
                                placeholder="GP-12345"
                                value={formData.licenseNumber}
                                onChange={handleChange}
                                className="pl-10"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Mô tả</Label>
                        <Textarea
                            id="description"
                            name="description"
                            placeholder="Mô tả về tổ chức..."
                            value={formData.description}
                            onChange={handleChange}
                            rows={3}
                        />
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Đang gửi...
                            </>
                        ) : (
                            <>
                                <Building2 className="w-4 h-4 mr-2" />
                                Gửi đơn đăng ký
                            </>
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
