"use client";

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import {
    User, Save, Loader2, Stethoscope, MapPin, Phone,
    Calendar, Heart, AlertTriangle, Droplets
} from 'lucide-react';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { profileService } from '@/services';

export default function ProfilePage() {
    const { address, provider, loading: walletLoading } = useWalletAddress();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeSection, setActiveSection] = useState('personal'); // personal | doctor

    // Profile form state
    const [profile, setProfile] = useState({
        fullName: '',
        dateOfBirth: '',
        gender: '',
        phone: '',
        email: '',
        homeAddress: '',
        bloodType: '',
        allergies: '',
    });

    // Doctor profile form state
    const [doctorProfile, setDoctorProfile] = useState({
        specialty: '',
        licenseNumber: '',
        hospitalName: '',
        yearsExperience: '',
        bio: '',
    });

    const [isDoctorRole, setIsDoctorRole] = useState(false);

    // Load profile on mount
    useEffect(() => {
        if (!address) return;
        loadProfile();
    }, [address]);

    const loadProfile = async () => {
        setLoading(true);
        try {
            const data = await profileService.getMyProfile();

            setProfile({
                fullName: data.fullName || '',
                dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
                gender: data.gender || '',
                phone: data.phone || '',
                email: data.email || '',
                homeAddress: data.homeAddress || '',
                bloodType: data.bloodType || '',
                allergies: data.allergies || '',
            });

            if (data.doctorProfile) {
                setIsDoctorRole(true);
                setDoctorProfile({
                    specialty: data.doctorProfile.specialty || '',
                    licenseNumber: data.doctorProfile.licenseNumber || '',
                    hospitalName: data.doctorProfile.hospitalName || '',
                    yearsExperience: data.doctorProfile.yearsExperience?.toString() || '',
                    bio: data.doctorProfile.bio || '',
                });
            }

            // Check if user has doctor role from localStorage
            const savedRoles = localStorage.getItem('ehr_user_roles');
            if (savedRoles) {
                const roles = JSON.parse(savedRoles);
                if (roles.includes('doctor')) setIsDoctorRole(true);
            }
        } catch (err) {
            console.error('Failed to load profile:', err);
            // Profile might not exist yet — that's fine
        } finally {
            setLoading(false);
        }
    };

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            const data = {
                ...profile,
                dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString() : null,
                gender: profile.gender || null,
            };

            await profileService.updateMyProfile(data);

            toast({
                title: "✅ Đã lưu hồ sơ!",
                description: "Thông tin cá nhân đã được cập nhật.",
                className: "bg-green-50 border-green-200 text-green-800",
            });
        } catch (err) {
            console.error('Save profile error:', err);
            toast({
                title: "Lỗi",
                description: err.message || "Không thể lưu hồ sơ. Vui lòng thử lại.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveDoctorProfile = async () => {
        setSaving(true);
        try {
            const data = {
                ...doctorProfile,
                yearsExperience: doctorProfile.yearsExperience ? parseInt(doctorProfile.yearsExperience) : null,
            };

            await profileService.updateDoctorProfile(data);

            toast({
                title: "✅ Đã lưu hồ sơ bác sĩ!",
                description: "Thông tin chuyên môn đã được cập nhật.",
                className: "bg-green-50 border-green-200 text-green-800",
            });
        } catch (err) {
            toast({
                title: "Lỗi",
                description: err.message || "Không thể lưu. Vui lòng thử lại.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    if (walletLoading || !address) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="max-w-3xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <User className="w-8 h-8 text-blue-600" />
                        Hồ sơ cá nhân
                    </h1>
                    <p className="text-slate-500 mt-2">Cập nhật thông tin cá nhân và chuyên môn của bạn.</p>
                </div>

                {/* Section Tabs */}
                <div className="flex gap-2 mb-6">
                    <Button
                        variant={activeSection === 'personal' ? 'default' : 'outline'}
                        onClick={() => setActiveSection('personal')}
                        className={activeSection === 'personal' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                    >
                        <User className="w-4 h-4 mr-2" /> Thông tin cá nhân
                    </Button>
                    {isDoctorRole && (
                        <Button
                            variant={activeSection === 'doctor' ? 'default' : 'outline'}
                            onClick={() => setActiveSection('doctor')}
                            className={activeSection === 'doctor' ? 'bg-teal-600 hover:bg-teal-700' : ''}
                        >
                            <Stethoscope className="w-4 h-4 mr-2" /> Chuyên môn bác sĩ
                        </Button>
                    )}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                        <span className="ml-3 text-slate-500">Đang tải...</span>
                    </div>
                ) : (
                    <>
                        {/* Personal Info Section */}
                        {activeSection === 'personal' && (
                            <Card className="bg-white">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <User className="w-5 h-5 text-blue-600" />
                                        Thông tin cá nhân
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    {/* Name */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="fullName">Họ và tên</Label>
                                        <Input
                                            id="fullName"
                                            value={profile.fullName}
                                            onChange={e => setProfile(p => ({ ...p, fullName: e.target.value }))}
                                            placeholder="Nguyễn Văn A"
                                            className="bg-white"
                                        />
                                    </div>

                                    {/* DOB & Gender */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="dateOfBirth" className="flex items-center gap-1">
                                                <Calendar className="w-3.5 h-3.5" /> Ngày sinh
                                            </Label>
                                            <Input
                                                id="dateOfBirth"
                                                type="date"
                                                value={profile.dateOfBirth}
                                                onChange={e => setProfile(p => ({ ...p, dateOfBirth: e.target.value }))}
                                                className="bg-white"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Giới tính</Label>
                                            <select
                                                value={profile.gender}
                                                onChange={e => setProfile(p => ({ ...p, gender: e.target.value }))}
                                                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                                            >
                                                <option value="">Chọn...</option>
                                                <option value="MALE">Nam</option>
                                                <option value="FEMALE">Nữ</option>
                                                <option value="OTHER">Khác</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Phone & Email */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="phone" className="flex items-center gap-1">
                                                <Phone className="w-3.5 h-3.5" /> Số điện thoại
                                            </Label>
                                            <Input
                                                id="phone"
                                                value={profile.phone}
                                                onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                                                placeholder="0912 345 678"
                                                className="bg-white"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="email">Email</Label>
                                            <Input
                                                id="email"
                                                type="email"
                                                value={profile.email}
                                                onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                                                placeholder="email@example.com"
                                                className="bg-white"
                                                disabled // Email usually comes from Web3Auth
                                            />
                                            {profile.email && (
                                                <p className="text-xs text-slate-400">Email từ Web3Auth, không thể chỉnh sửa.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Address */}
                                    <div className="space-y-1.5">
                                        <Label htmlFor="homeAddress" className="flex items-center gap-1">
                                            <MapPin className="w-3.5 h-3.5" /> Địa chỉ
                                        </Label>
                                        <Input
                                            id="homeAddress"
                                            value={profile.homeAddress}
                                            onChange={e => setProfile(p => ({ ...p, homeAddress: e.target.value }))}
                                            placeholder="123 Đường ABC, Quận 1, TP.HCM"
                                            className="bg-white"
                                        />
                                    </div>

                                    {/* Blood Type & Allergies */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="flex items-center gap-1">
                                                <Droplets className="w-3.5 h-3.5 text-red-500" /> Nhóm máu
                                            </Label>
                                            <select
                                                value={profile.bloodType}
                                                onChange={e => setProfile(p => ({ ...p, bloodType: e.target.value }))}
                                                className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                                            >
                                                <option value="">Chọn...</option>
                                                <option value="A+">A+</option>
                                                <option value="A-">A-</option>
                                                <option value="B+">B+</option>
                                                <option value="B-">B-</option>
                                                <option value="AB+">AB+</option>
                                                <option value="AB-">AB-</option>
                                                <option value="O+">O+</option>
                                                <option value="O-">O-</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="flex items-center gap-1">
                                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Dị ứng
                                            </Label>
                                            <Input
                                                value={profile.allergies}
                                                onChange={e => setProfile(p => ({ ...p, allergies: e.target.value }))}
                                                placeholder="Penicillin, hải sản..."
                                                className="bg-white"
                                            />
                                        </div>
                                    </div>

                                    {/* Wallet Address (read-only) */}
                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                        <p className="text-xs text-slate-500 mb-1">Địa chỉ ví</p>
                                        <p className="text-sm font-mono text-slate-700 break-all">{address}</p>
                                    </div>

                                    {/* Save Button */}
                                    <Button
                                        onClick={handleSaveProfile}
                                        disabled={saving}
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        {saving ? (
                                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang lưu...</>
                                        ) : (
                                            <><Save className="w-4 h-4 mr-2" /> Lưu thông tin</>
                                        )}
                                    </Button>
                                </CardContent>
                            </Card>
                        )}

                        {/* Doctor Profile Section */}
                        {activeSection === 'doctor' && isDoctorRole && (
                            <Card className="bg-white">
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <Stethoscope className="w-5 h-5 text-teal-600" />
                                        Thông tin chuyên môn
                                        <Badge className="bg-teal-100 text-teal-700 ml-2">Bác sĩ</Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="specialty">Chuyên khoa</Label>
                                        <Input
                                            id="specialty"
                                            value={doctorProfile.specialty}
                                            onChange={e => setDoctorProfile(p => ({ ...p, specialty: e.target.value }))}
                                            placeholder="Tim mạch, Nội khoa, Nhi khoa..."
                                            className="bg-white"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="licenseNumber">Số giấy phép hành nghề</Label>
                                            <Input
                                                id="licenseNumber"
                                                value={doctorProfile.licenseNumber}
                                                onChange={e => setDoctorProfile(p => ({ ...p, licenseNumber: e.target.value }))}
                                                placeholder="GP-12345"
                                                className="bg-white"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="yearsExperience">Số năm kinh nghiệm</Label>
                                            <Input
                                                id="yearsExperience"
                                                type="number"
                                                value={doctorProfile.yearsExperience}
                                                onChange={e => setDoctorProfile(p => ({ ...p, yearsExperience: e.target.value }))}
                                                placeholder="5"
                                                className="bg-white"
                                                min="0"
                                                max="80"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="hospitalName">Bệnh viện / Phòng khám</Label>
                                        <Input
                                            id="hospitalName"
                                            value={doctorProfile.hospitalName}
                                            onChange={e => setDoctorProfile(p => ({ ...p, hospitalName: e.target.value }))}
                                            placeholder="Bệnh viện Đại học Y Hà Nội"
                                            className="bg-white"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="bio">Giới thiệu ngắn</Label>
                                        <textarea
                                            id="bio"
                                            value={doctorProfile.bio}
                                            onChange={e => setDoctorProfile(p => ({ ...p, bio: e.target.value }))}
                                            placeholder="Kinh nghiệm chuyên môn, lĩnh vực nghiên cứu..."
                                            rows={3}
                                            className="w-full px-3 py-2 rounded-md border border-slate-200 bg-white text-sm resize-none"
                                            maxLength={1000}
                                        />
                                    </div>

                                    <Button
                                        onClick={handleSaveDoctorProfile}
                                        disabled={saving}
                                        className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                                    >
                                        {saving ? (
                                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang lưu...</>
                                        ) : (
                                            <><Save className="w-4 h-4 mr-2" /> Lưu thông tin bác sĩ</>
                                        )}
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
