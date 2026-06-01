// EditProfileScreen v3 — text-rhythm refactor per viehp-screens-polish-pack §3 A·3.
//
// Polish summary:
//   - FieldLabel: uppercase mono 11px / 600 letter-spacing 0.4 textMuted
//     + cinnabar dot · for required (not ascii *)
//   - Avatar 64×64 with pencil overlay 24×24 (cinnabar bg, ring 2 of paper)
//   - Drop ViCard chrome → hairline section dividers
//   - Section labels uppercase mono — consistent with form pattern
//
// Wiring preserved bit-for-bit:
//   - profileService.getMyProfile + updateMyProfile
//   - useAuthStore.token gate for fetching
//   - YYYY-MM-DD date validation
//   - Alert.alert success → navigation.goBack()

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Save, Pencil } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';

import LoadingSpinner from '../components/LoadingSpinner';
import profileService from '../services/profile.service';
import ipfsService from '../services/ipfs.service';
import useAuthStore from '../store/authStore';
import ViButton from '../components-v2/ViButton';
import { useEhrPalette } from '../constants/uiColors';
import { friendlyBackendError, friendlyPickerError } from '../utils/friendlyError';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = [
    { key: 'MALE', label: 'Nam' },
    { key: 'FEMALE', label: 'Nữ' },
    { key: 'OTHER', label: 'Khác' },
];

export default function EditProfileScreen({ navigation }: any) {
    const palette = useEhrPalette();
    const { token, user, refreshAuthSession } = useAuthStore() as any;
    const queryClient = useQueryClient();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [fullName, setFullName] = useState('');
    const [gender, setGender] = useState<string | null>(null);
    const [dateOfBirth, setDateOfBirth] = useState('');
    const [bloodType, setBloodType] = useState<string | null>(null);
    const [allergies, setAllergies] = useState('');
    const [insuranceNumber, setInsuranceNumber] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

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
                    setInsuranceNumber(data.insuranceNumber || '');
                    setAvatarUrl(data.avatarUrl || null);
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
        // Validate BHYT format chỉ khi có nhập (cho phép để trống)
        const trimmedBhyt = insuranceNumber.trim().toUpperCase();
        if (trimmedBhyt && !/^[A-Z]{2}\d{13}$/.test(trimmedBhyt)) {
            Alert.alert(
                'Số BHYT không hợp lệ',
                'Số BHYT phải gồm 2 chữ cái + 13 chữ số (vd SV4796543210123). Để trống nếu chưa có.',
            );
            return;
        }

        setIsSaving(true);
        try {
            const payload: any = {
                fullName: fullName.trim(),
                gender: gender || undefined,
                bloodType: bloodType || undefined,
                allergies: allergies.trim() || undefined,
                insuranceNumber: trimmedBhyt || null,
            };

            if (dateOfBirth) {
                const parsed = new Date(dateOfBirth);
                if (!isNaN(parsed.getTime())) {
                    payload.dateOfBirth = parsed.toISOString();
                }
            }

            await profileService.updateMyProfile(payload);

            // Live update: refresh authStore.user (cho SettingsScreen header +
            // mọi nơi đọc user.fullName) + invalidate UserChip cache cho ví của
            // chính mình (cho mọi list hiển thị tên qua useUserProfile).
            // Trước đây phải logout + login mới thấy tên mới — feedback A1.2.
            try {
                await refreshAuthSession?.();
            } catch (refreshErr) {
                console.warn('refreshAuthSession after profile save failed:', refreshErr);
            }
            const myAddr = (user?.walletAddress || (user as any)?.address || '').toLowerCase();
            if (myAddr) {
                queryClient.invalidateQueries({ queryKey: ['userProfile', myAddr] });
            }

            Alert.alert('Thành công', 'Đã cập nhật thông tin cá nhân.', [
                { text: 'OK', onPress: () => navigation.goBack() },
            ]);
        } catch (err: any) {
            Alert.alert('Lỗi', friendlyBackendError(err, 'Không thể cập nhật hồ sơ.'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleAvatarEdit = async () => {
        if (avatarUploading) return;
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert('Cần quyền', 'Vui lòng cấp quyền truy cập thư viện ảnh trong Cài đặt.');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.7,
                base64: true,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            if (!asset.base64) {
                Alert.alert('Lỗi', 'Không đọc được ảnh đã chọn.');
                return;
            }

            setAvatarUploading(true);
            const cid = await ipfsService.upload(asset.base64, { name: 'avatar', type: 'avatar' });
            const url = ipfsService.getUrl(cid);

            await profileService.updateMyProfile({ avatarUrl: url });
            setAvatarUrl(url);

            try { await refreshAuthSession?.(); } catch (e) { console.warn('refreshAuthSession failed', e); }
            const myAddr = (user?.walletAddress || (user as any)?.address || '').toLowerCase();
            if (myAddr) {
                queryClient.invalidateQueries({ queryKey: ['userProfile', myAddr] });
            }
            queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
        } catch (err: any) {
            const pickMsg = friendlyPickerError(err, '');
            if (pickMsg) {
                Alert.alert('Lỗi', pickMsg);
            } else {
                Alert.alert('Lỗi', friendlyBackendError(err, 'Không thể cập nhật ảnh đại diện.'));
            }
        } finally {
            setAvatarUploading(false);
        }
    };

    const initial = (fullName.trim() || '?').charAt(0).toUpperCase();

    if (isLoading) return <LoadingSpinner message="Đang tải thông tin..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['left', 'right', 'bottom']}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero */}
                <View style={{ paddingHorizontal: 22, paddingTop: 12, paddingBottom: 22 }}>
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 22,
                            color: palette.EHR_ON_SURFACE,
                            fontWeight: '700',
                            letterSpacing: -0.3,
                            lineHeight: 26,
                        }}
                    >
                        Chỉnh sửa hồ sơ
                    </Text>
                    <Text
                        style={{
                            marginTop: 6,
                            fontFamily: SANS,
                            fontSize: 13.5,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 21,
                        }}
                    >
                        Cập nhật thông tin cá nhân của bạn.
                    </Text>
                </View>

                {/* Avatar with pencil overlay + identity field block */}
                <View style={{ paddingHorizontal: 22, paddingBottom: 22 }}>
                    <XStack style={{ alignItems: 'center', gap: 16 }}>
                        <View style={{ position: 'relative', width: 64, height: 64 }}>
                            <View
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 32,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                }}
                            >
                                {avatarUrl ? (
                                    <Image
                                        source={{ uri: avatarUrl }}
                                        style={{ width: 64, height: 64 }}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <Text
                                        style={{
                                            fontFamily: SERIF_ITALIC,
                                            fontStyle: 'italic',
                                            fontSize: 22,
                                            fontWeight: '600',
                                            color: palette.EHR_ON_SURFACE_VARIANT,
                                        }}
                                    >
                                        {initial}
                                    </Text>
                                )}
                                {avatarUploading ? (
                                    <View
                                        style={{
                                            position: 'absolute',
                                            top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: 'rgba(0,0,0,0.45)',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <ActivityIndicator color="#FAF7F1" />
                                    </View>
                                ) : null}
                            </View>
                            <Pressable
                                onPress={handleAvatarEdit}
                                hitSlop={8}
                                disabled={avatarUploading}
                                style={({ pressed }) => ({
                                    position: 'absolute',
                                    bottom: -2,
                                    right: -2,
                                    width: 24,
                                    height: 24,
                                    borderRadius: 12,
                                    backgroundColor: palette.EHR_CINNABAR_DEEP,
                                    borderWidth: 2,
                                    borderColor: palette.EHR_SURFACE,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: pressed || avatarUploading ? 0.7 : 1,
                                })}
                            >
                                <Pencil size={11} color="#FAF7F1" strokeWidth={2} />
                            </Pressable>
                        </View>
                        <YStack style={{ flex: 1 }}>
                            <FieldLabel required>Họ và tên</FieldLabel>
                            <Input
                                value={fullName}
                                onChangeText={setFullName}
                                placeholder="Nguyễn Văn A"
                            />
                        </YStack>
                    </XStack>

                    <View style={{ marginTop: 16 }}>
                        <FieldLabel>Ngày sinh (YYYY-MM-DD)</FieldLabel>
                        <Input
                            value={dateOfBirth}
                            onChangeText={setDateOfBirth}
                            placeholder="1990-01-15"
                            keyboardType="numbers-and-punctuation"
                            mono
                        />
                    </View>
                </View>

                {/* Gender */}
                <SectionLabel>Giới tính</SectionLabel>
                <View style={{ paddingHorizontal: 22, paddingBottom: 22 }}>
                    <XStack style={{ gap: 8 }}>
                        {GENDERS.map((g) => {
                            const active = gender === g.key;
                            return (
                                <Pressable key={g.key} onPress={() => setGender(g.key)} style={{ flex: 1 }}>
                                    <View
                                        style={{
                                            paddingVertical: 11,
                                            borderRadius: 10,
                                            borderWidth: active ? 1.25 : 0.5,
                                            borderColor: active ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE_SOFT,
                                            backgroundColor: active ? palette.EHR_ON_SURFACE : palette.EHR_SURFACE_LOWEST,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: SANS_SEMI,
                                                fontSize: 13,
                                                color: active ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE,
                                                fontWeight: '600',
                                            }}
                                        >
                                            {g.label}
                                        </Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </XStack>
                </View>

                {/* Blood type */}
                <SectionLabel trailing="Tuỳ chọn">Nhóm máu</SectionLabel>
                <View style={{ paddingHorizontal: 22, paddingBottom: 22 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {BLOOD_TYPES.map((bt) => {
                            const active = bloodType === bt;
                            return (
                                <Pressable key={bt} onPress={() => setBloodType(active ? null : bt)}>
                                    <View
                                        style={{
                                            paddingVertical: 8,
                                            paddingHorizontal: 14,
                                            borderRadius: 8,
                                            borderWidth: active ? 1.25 : 0.5,
                                            borderColor: active ? palette.EHR_CINNABAR_DEEP : palette.EHR_OUTLINE_SOFT,
                                            backgroundColor: active ? `${palette.EHR_CINNABAR_DEEP}1A` : 'transparent',
                                            minWidth: 50,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: MONO,
                                                fontSize: 13,
                                                fontWeight: '700',
                                                color: active ? palette.EHR_CINNABAR_DEEP : palette.EHR_ON_SURFACE_VARIANT,
                                            }}
                                        >
                                            {bt}
                                        </Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                {/* BHYT — TT 32/2023 yêu cầu, để trống nếu chưa có */}
                <SectionLabel trailing="2 chữ + 13 số">Bảo hiểm y tế</SectionLabel>
                <View style={{ paddingHorizontal: 22, paddingBottom: 22 }}>
                    <FieldLabel>Số thẻ BHYT</FieldLabel>
                    <TextInput
                        value={insuranceNumber}
                        onChangeText={(v) => setInsuranceNumber(v.toUpperCase())}
                        placeholder="SV4796543210123"
                        placeholderTextColor={palette.EHR_TEXT_MUTED}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={15}
                        style={{
                            borderRadius: 10,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            color: palette.EHR_ON_SURFACE,
                            fontFamily: 'monospace',
                            fontSize: 14,
                        }}
                    />
                    <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, lineHeight: 16 }}>
                        Để trống nếu chưa có. Định dạng: 2 chữ cái viết hoa + 13 chữ số (vd SV4796543210123).
                    </Text>
                </View>

                {/* Allergies */}
                <SectionLabel trailing="Hiển thị khi cấp cứu">Dị ứng &amp; ghi chú</SectionLabel>
                <View style={{ paddingHorizontal: 22, paddingBottom: 28 }}>
                    <TextInput
                        value={allergies}
                        onChangeText={setAllergies}
                        placeholder="Ví dụ: Dị ứng Penicillin, Hải sản…"
                        placeholderTextColor={palette.EHR_TEXT_MUTED}
                        multiline
                        textAlignVertical="top"
                        style={{
                            minHeight: 86,
                            borderRadius: 10,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            color: palette.EHR_ON_SURFACE,
                            fontFamily: SANS,
                            fontSize: 14,
                        }}
                    />
                </View>
            </ScrollView>

            {/* Sticky footer Save CTA */}
            <View
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    paddingHorizontal: 22,
                    paddingTop: 12,
                    paddingBottom: 22,
                    backgroundColor: palette.EHR_SURFACE,
                    borderTopWidth: 0.5,
                    borderTopColor: palette.EHR_OUTLINE_SOFT,
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

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    const palette = useEhrPalette();
    return (
        <XStack style={{ alignItems: 'baseline', gap: 5, marginBottom: 6 }}>
            <Text
                style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                }}
            >
                {children}
            </Text>
            {required ? (
                <View
                    style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: palette.EHR_CINNABAR_DEEP,
                    }}
                />
            ) : null}
        </XStack>
    );
}

function SectionLabel({ children, trailing }: { children: React.ReactNode; trailing?: string }) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                paddingHorizontal: 22,
                paddingTop: 22,
                paddingBottom: 10,
                borderTopWidth: 0.5,
                borderTopColor: palette.EHR_OUTLINE_SOFT,
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
            }}
        >
            <Text
                style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: palette.EHR_ON_SURFACE_VARIANT,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                }}
            >
                {children}
            </Text>
            {trailing ? (
                <Text
                    style={{
                        fontFamily: SANS,
                        fontSize: 11,
                        color: palette.EHR_TEXT_MUTED,
                        letterSpacing: 0.3,
                    }}
                >
                    {trailing}
                </Text>
            ) : null}
        </View>
    );
}

function Input({
    value, onChangeText, placeholder, keyboardType, mono,
}: {
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    keyboardType?: any;
    mono?: boolean;
}) {
    const palette = useEhrPalette();
    return (
        <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={palette.EHR_TEXT_MUTED}
            keyboardType={keyboardType}
            style={{
                height: 46,
                borderRadius: 10,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE_LOWEST,
                paddingHorizontal: 14,
                color: palette.EHR_ON_SURFACE,
                fontFamily: mono ? MONO : SANS,
                fontSize: 14,
                letterSpacing: mono ? 0.2 : 0,
            }}
        />
    );
}

void SERIF;
