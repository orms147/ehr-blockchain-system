// EditProfileScreen v2 — port of .design-bundle/project/screens-extras.jsx
// EditProfileScreen. Clean form layout: name + dob + gender chips + blood
// type chips + allergies textarea + cinnabar save CTA.
//
// Wiring preserved:
//   - profileService.getMyProfile + updateMyProfile
//   - useAuthStore.token gate for fetching
//   - YYYY-MM-DD date validation
//   - Alert.alert success → navigation.goBack()

import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Save, Droplets, Heart } from 'lucide-react-native';

import LoadingSpinner from '../components/LoadingSpinner';
import profileService from '../services/profile.service';
import useAuthStore from '../store/authStore';
import ViCard from '../components-v2/ViCard';
import ViButton from '../components-v2/ViButton';
import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const SANS_MEDIUM = 'DMSans_500Medium';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = [
    { key: 'MALE', label: 'Nam' },
    { key: 'FEMALE', label: 'Nữ' },
    { key: 'OTHER', label: 'Khác' },
];

export default function EditProfileScreen({ navigation }: any) {
    const palette = useEhrPalette();
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

    if (isLoading) return <LoadingSpinner message="Đang tải thông tin..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['left', 'right', 'bottom']}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                {/* Hero */}
                <View style={{ marginBottom: 18 }}>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 26,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.4,
                            lineHeight: 30,
                        }}
                    >
                        Chỉnh sửa hồ sơ
                    </Text>
                    <Text
                        style={{
                            marginTop: 4,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                        }}
                    >
                        Cập nhật thông tin cá nhân của bạn.
                    </Text>
                </View>

                {/* Basic info */}
                <ViCard padding={16} style={{ marginBottom: 14 }}>
                    <FieldLabel>Họ và tên *</FieldLabel>
                    <Input
                        value={fullName}
                        onChangeText={setFullName}
                        placeholder="Nguyễn Văn A"
                    />

                    <View style={{ height: 12 }} />
                    <FieldLabel>Ngày sinh (YYYY-MM-DD)</FieldLabel>
                    <Input
                        value={dateOfBirth}
                        onChangeText={setDateOfBirth}
                        placeholder="1990-01-15"
                        keyboardType="numbers-and-punctuation"
                    />
                </ViCard>

                {/* Gender */}
                <ViCard padding={16} style={{ marginBottom: 14 }}>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 17,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.2,
                            marginBottom: 12,
                        }}
                    >
                        Giới tính
                    </Text>
                    <XStack style={{ gap: 8 }}>
                        {GENDERS.map((g) => {
                            const active = gender === g.key;
                            return (
                                <Pressable key={g.key} onPress={() => setGender(g.key)} style={{ flex: 1 }}>
                                    <View
                                        style={{
                                            paddingVertical: 11,
                                            borderRadius: 12,
                                            borderWidth: active ? 1.5 : 0.5,
                                            borderColor: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                            backgroundColor: active ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE_LOWEST,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: SANS_SEMI,
                                                fontSize: 13.5,
                                                color: active ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE,
                                                fontWeight: '700',
                                            }}
                                        >
                                            {g.label}
                                        </Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </XStack>
                </ViCard>

                {/* Blood type */}
                <ViCard padding={16} style={{ marginBottom: 14 }}>
                    <XStack style={{ alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Droplets size={16} color={palette.EHR_SECONDARY} />
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 17,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                            }}
                        >
                            Nhóm máu
                        </Text>
                    </XStack>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {BLOOD_TYPES.map((bt) => {
                            const active = bloodType === bt;
                            return (
                                <Pressable key={bt} onPress={() => setBloodType(active ? null : bt)}>
                                    <View
                                        style={{
                                            paddingVertical: 8,
                                            paddingHorizontal: 14,
                                            borderRadius: 10,
                                            borderWidth: active ? 1.5 : 0.5,
                                            borderColor: active ? palette.EHR_SECONDARY : palette.EHR_OUTLINE_SOFT,
                                            backgroundColor: active ? `${palette.EHR_SECONDARY}1A` : 'transparent',
                                            minWidth: 50,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: 'monospace',
                                                fontSize: 13,
                                                fontWeight: '700',
                                                color: active ? palette.EHR_SECONDARY : palette.EHR_ON_SURFACE_VARIANT,
                                            }}
                                        >
                                            {bt}
                                        </Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                </ViCard>

                {/* Allergies */}
                <ViCard padding={16} style={{ marginBottom: 20 }}>
                    <XStack style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Heart size={16} color={palette.EHR_PRIMARY} />
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 17,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                            }}
                        >
                            Dị ứng & ghi chú
                        </Text>
                    </XStack>
                    <TextInput
                        value={allergies}
                        onChangeText={setAllergies}
                        placeholder="Ví dụ: Dị ứng Penicillin, Hải sản…"
                        placeholderTextColor={palette.EHR_OUTLINE}
                        multiline
                        textAlignVertical="top"
                        style={{
                            minHeight: 90,
                            borderRadius: 12,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            backgroundColor: palette.EHR_SURFACE,
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            color: palette.EHR_ON_SURFACE,
                            fontFamily: SANS,
                            fontSize: 14,
                        }}
                    />
                </ViCard>
            </ScrollView>

            {/* Sticky footer Save CTA (G.7: avoid Android soft-keyboard clipping) */}
            <View
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    paddingHorizontal: 20,
                    paddingTop: 12,
                    paddingBottom: 22,
                    backgroundColor: palette.EHR_SURFACE,
                    borderTopWidth: 0.5,
                    borderTopColor: palette.EHR_OUTLINE_VARIANT,
                }}
            >
                <ViButton
                    variant="primary"
                    full
                    size="lg"
                    loading={isSaving}
                    onPress={handleSave}
                    leftIcon={isSaving ? undefined : <Save size={16} color={palette.EHR_SURFACE} />}
                >
                    {isSaving ? 'Đang lưu…' : 'Lưu thông tin'}
                </ViButton>
            </View>
        </SafeAreaView>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    const palette = useEhrPalette();
    return (
        <Text
            style={{
                fontFamily: SANS_SEMI,
                fontSize: 11.5,
                color: palette.EHR_TEXT_MUTED,
                marginBottom: 6,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                fontWeight: '600',
            }}
        >
            {children}
        </Text>
    );
}

function Input({
    value, onChangeText, placeholder, keyboardType,
}: {
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    keyboardType?: any;
}) {
    const palette = useEhrPalette();
    return (
        <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={palette.EHR_OUTLINE}
            keyboardType={keyboardType}
            style={{
                height: 46,
                borderRadius: 12,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE,
                paddingHorizontal: 14,
                color: palette.EHR_ON_SURFACE,
                fontFamily: SANS,
                fontSize: 14,
            }}
        />
    );
}

void SANS_MEDIUM;
