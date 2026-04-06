import React, { useState, useEffect } from 'react';
import { Alert, ScrollView, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Save, User, Droplets, Calendar, Heart } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import LoadingSpinner from '../components/LoadingSpinner';
import profileService from '../services/profile.service';
import useAuthStore from '../store/authStore';
import {
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SECONDARY,
    EHR_SECONDARY_CONTAINER,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = [
    { key: 'MALE', label: 'Nam' },
    { key: 'FEMALE', label: 'Nữ' },
    { key: 'OTHER', label: 'Khác' },
];

export default function EditProfileScreen({ navigation }: any) {
    const { token } = useAuthStore();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [fullName, setFullName] = useState('');
    const [gender, setGender] = useState<string | null>(null);
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [bloodType, setBloodType] = useState<string | null>(null);
    const [allergies, setAllergies] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const data = await profileService.getMyProfile();
                if (data) {
                    setFullName(data.fullName || '');
                    setGender(data.gender || null);
                    setDateOfBirth(data.dateOfBirth ? new Date(data.dateOfBirth).toISOString().split('T')[0] : '');
                    setBloodType(data.bloodType || null);
                    setAllergies(data.allergies || '');
                }
            } catch (err) {
                console.warn('Failed to load profile:', err);
            } finally {
                setIsLoading(false);
            }
        };
        if (token) load();
    }, [token]);

    const handleSave = async () => {
        if (!fullName.trim()) {
            Alert.alert('Thiếu thông tin', 'Vui lòng nhập họ tên.');
            return;
        }

        setIsSaving(true);
        try {
            const payload: any = {
                fullName: fullName.trim(),
                gender: gender || undefined,
                bloodType: bloodType || undefined,
                allergies: allergies.trim() || undefined,
            };

            if (dateOfBirth) {
                // Validate date format YYYY-MM-DD
                const parsed = new Date(dateOfBirth);
                if (!isNaN(parsed.getTime())) {
                    payload.dateOfBirth = parsed.toISOString();
                }
            }

            await profileService.updateMyProfile(payload);
            Alert.alert('Thành công', 'Đã cập nhật thông tin cá nhân.', [
                { text: 'OK', onPress: () => navigation.goBack() },
            ]);
        } catch (err: any) {
            Alert.alert('Lỗi', err?.message || 'Không thể cập nhật hồ sơ.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingSpinner message={'Đang tải thông tin...'} />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['left', 'right', 'bottom']}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 14 }}>
                        <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: EHR_PRIMARY_FIXED, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                            <User size={24} color={EHR_PRIMARY} />
                        </View>
                        <YStack style={{ flex: 1 }}>
                            <Text fontSize="$6" fontWeight="800" color="$color12">Chỉnh sửa hồ sơ</Text>
                            <Text fontSize="$3" color="$color10">Cập nhật thông tin cá nhân của bạn</Text>
                        </YStack>
                    </XStack>

                    <YStack style={{ marginBottom: 14 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 6 }}>Họ và tên *</Text>
                        <TextInput
                            value={fullName}
                            onChangeText={setFullName}
                            placeholder="Nguyễn Văn A"
                            placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                            style={{
                                height: 52, borderRadius: 18, borderWidth: 1, borderColor: EHR_OUTLINE_VARIANT,
                                backgroundColor: EHR_SURFACE_LOWEST, paddingHorizontal: 14, color: EHR_ON_SURFACE, fontSize: 15,
                            }}
                        />
                    </YStack>

                    <YStack style={{ marginBottom: 14 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 6 }}>Ngày sinh (YYYY-MM-DD)</Text>
                        <TextInput
                            value={dateOfBirth}
                            onChangeText={setDateOfBirth}
                            placeholder="1990-01-15"
                            placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                            keyboardType="numbers-and-punctuation"
                            style={{
                                height: 52, borderRadius: 18, borderWidth: 1, borderColor: EHR_OUTLINE_VARIANT,
                                backgroundColor: EHR_SURFACE_LOWEST, paddingHorizontal: 14, color: EHR_ON_SURFACE, fontSize: 15,
                            }}
                        />
                    </YStack>
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 12 }}>Giới tính</Text>
                    <XStack style={{ gap: 10 }}>
                        {GENDERS.map((g) => {
                            const active = gender === g.key;
                            return (
                                <Pressable key={g.key} onPress={() => setGender(g.key)} style={{ flex: 1 }}>
                                    <View style={{
                                        borderRadius: 16, borderWidth: 1, paddingVertical: 12, alignItems: 'center',
                                        borderColor: active ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                                        backgroundColor: active ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOWEST,
                                    }}>
                                        <Text fontWeight="700" style={{ color: active ? EHR_PRIMARY : EHR_ON_SURFACE }}>{g.label}</Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </XStack>
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 12 }}>
                        <Droplets size={18} color={EHR_SECONDARY} />
                        <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginLeft: 8 }}>Nhóm máu</Text>
                    </XStack>
                    <XStack style={{ gap: 8, flexWrap: 'wrap' }}>
                        {BLOOD_TYPES.map((bt) => {
                            const active = bloodType === bt;
                            return (
                                <Pressable key={bt} onPress={() => setBloodType(bt)}>
                                    <View style={{
                                        borderRadius: 14, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14,
                                        borderColor: active ? EHR_SECONDARY : EHR_OUTLINE_VARIANT,
                                        backgroundColor: active ? EHR_SECONDARY_CONTAINER : EHR_SURFACE_LOWEST,
                                    }}>
                                        <Text fontWeight="700" style={{ color: active ? EHR_SECONDARY : EHR_ON_SURFACE }}>{bt}</Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </XStack>
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 20 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 8 }}>
                        <Heart size={18} color={EHR_PRIMARY} />
                        <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginLeft: 8 }}>Dị ứng và ghi chú</Text>
                    </XStack>
                    <TextInput
                        value={allergies}
                        onChangeText={setAllergies}
                        placeholder="Ví dụ: Dị ứng penicillin, hải sản..."
                        placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                        multiline
                        textAlignVertical="top"
                        style={{
                            minHeight: 100, borderRadius: 18, borderWidth: 1, borderColor: EHR_OUTLINE_VARIANT,
                            backgroundColor: EHR_SURFACE_LOWEST, paddingHorizontal: 14, paddingVertical: 12,
                            color: EHR_ON_SURFACE, fontSize: 15,
                        }}
                    />
                </View>

                <Button
                    size="$5"
                    background={EHR_PRIMARY}
                    pressStyle={{ background: EHR_PRIMARY_CONTAINER }}
                    disabled={isSaving}
                    opacity={isSaving ? 0.7 : 1}
                    onPress={handleSave}
                >
                    <XStack style={{ alignItems: 'center', gap: 10 }}>
                        <Save size={18} color={EHR_ON_PRIMARY} />
                        <Text color={EHR_ON_PRIMARY} fontWeight="800">
                            {isSaving ? 'Đang lưu...' : 'Lưu thông tin'}
                        </Text>
                    </XStack>
                </Button>
            </ScrollView>
        </SafeAreaView>
    );
}
