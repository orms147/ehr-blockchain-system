// EmergencyProfileScreen v2 — port of .design-bundle/project/screens-extras2.jsx
// EmergencyProfileScreen. Consolidates 3 surfaces:
//   - CCCD identifier status (enrolled / not enrolled) → links to TrustedContacts
//     for the keccak256 modal flow
//   - Lifesaving info form (bloodType + allergies; conditions deferred until
//     User schema gains a column)
//   - Trusted contacts preview (3 most recent) + link to full list
//   - "How you'll be found" 3-step explainer
//
// Backend wiring:
//   - GET /api/profile/me — fetch bloodType + allergies + nationalIdHash
//   - PUT /api/profile/me — save bloodType + allergies (existing endpoint)
//   - trustedContactService.listMyContacts (TanStack Query)

import React, { useEffect, useState } from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { ChevronLeft, ChevronRight, IdCard, Heart, AlertTriangle } from 'lucide-react-native';

import api from '../services/api';
import trustedContactService from '../services/trustedContact.service';
import ViCard from '../components-v2/ViCard';
import ViButton from '../components-v2/ViButton';
import { ViSectionLabel } from '../components-v2/ViChips';
import {
    EHR_SURFACE,
    EHR_SURFACE_LOWEST,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE,
    EHR_OUTLINE_SOFT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_TERTIARY,
    EHR_SECONDARY,
    EHR_SLATE,
} from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const ALLERGY_QUICK = ['Penicillin', 'Aspirin', 'Lactose', 'Đậu phộng', 'Hải sản', 'Trứng'];

type Contact = {
    contactAddress: string;
    label?: string | null;
    fullName?: string | null;
};

type Profile = {
    bloodType?: string | null;
    allergies?: string | null;
    nationalIdHash?: string | null;
};

const truncate = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

export default function EmergencyProfileScreen() {
    const navigation = useNavigation<any>();
    const [bloodType, setBloodType] = useState<string>('');
    const [allergies, setAllergies] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [enrolled, setEnrolled] = useState(false);

    const profileQuery = useQuery<Profile>({
        queryKey: ['profile', 'me'],
        queryFn: () => api.get('/api/profile/me'),
    });

    const contactsQuery = useQuery<Contact[]>({
        queryKey: ['trustedContacts', 'me'],
        queryFn: () => trustedContactService.listMyContacts(),
    });

    useEffect(() => {
        if (profileQuery.data) {
            setBloodType(profileQuery.data.bloodType || '');
            setAllergies(profileQuery.data.allergies || '');
            setEnrolled(!!profileQuery.data.nationalIdHash);
        }
    }, [profileQuery.data]);

    const allContacts = contactsQuery.data || [];
    const contactsPreview = allContacts.slice(0, 3);

    const addAllergyTag = (tag: string) => {
        const list = allergies
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        if (!list.includes(tag)) {
            setAllergies([...list, tag].join(', '));
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            await api.put('/api/profile/me', {
                bloodType: bloodType || null,
                allergies: allergies.trim() || null,
            });
            Alert.alert('Đã lưu', 'Thông tin cứu sinh đã được cập nhật.');
        } catch (err: any) {
            Alert.alert('Lỗi', err?.data?.error || err?.message || 'Không thể lưu thông tin.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {/* PageHeader */}
                <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 18 }}>
                    <Pressable
                        onPress={() => navigation.goBack()}
                        style={({ pressed }) => ({
                            alignSelf: 'flex-start',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingVertical: 6,
                            paddingRight: 10,
                            opacity: pressed ? 0.5 : 1,
                        })}
                    >
                        <ChevronLeft size={18} color={EHR_ON_SURFACE_VARIANT} />
                        <Text style={{ fontFamily: SANS, fontSize: 13, color: EHR_ON_SURFACE_VARIANT }}>
                            Quay lại
                        </Text>
                    </Pressable>
                    <Text
                        style={{
                            marginTop: 6,
                            fontFamily: SERIF,
                            fontSize: 28,
                            color: EHR_ON_SURFACE,
                            letterSpacing: -0.5,
                            lineHeight: 32,
                        }}
                    >
                        Hồ sơ khẩn cấp
                    </Text>
                    <Text
                        style={{
                            marginTop: 6,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: EHR_ON_SURFACE_VARIANT,
                            lineHeight: 19,
                        }}
                    >
                        Thông tin cứu sinh bác sĩ cấp cứu thấy khi tra cứu CCCD của bạn.
                    </Text>
                </View>

                {/* ───────── CCCD identifier ───────── */}
                <ViSectionLabel>Mã định danh CCCD</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
                    <Pressable
                        onPress={() => navigation.navigate('TrustedContacts')}
                        style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            paddingVertical: 14,
                            paddingHorizontal: 16,
                            borderRadius: 14,
                            backgroundColor: EHR_SURFACE_LOWEST,
                            borderWidth: 0.5,
                            borderColor: enrolled ? `${EHR_TERTIARY}40` : EHR_OUTLINE_SOFT,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <View
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                backgroundColor: enrolled ? `${EHR_TERTIARY}26` : `${EHR_SLATE}1A`,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <IdCard size={18} color={enrolled ? EHR_TERTIARY : EHR_SLATE} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <XStack style={{ alignItems: 'center', gap: 8 }}>
                                <Text
                                    style={{
                                        fontFamily: SANS_MEDIUM,
                                        fontSize: 13.5,
                                        color: EHR_ON_SURFACE,
                                        fontWeight: '600',
                                    }}
                                >
                                    CCCD đã đăng ký
                                </Text>
                                <View
                                    style={{
                                        paddingHorizontal: 7,
                                        paddingVertical: 2,
                                        borderRadius: 999,
                                        backgroundColor: enrolled
                                            ? `${EHR_TERTIARY}1A`
                                            : `${EHR_SLATE}1A`,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 9.5,
                                            color: enrolled ? EHR_TERTIARY : EHR_OUTLINE,
                                            letterSpacing: 0.5,
                                            textTransform: 'uppercase',
                                            fontWeight: '700',
                                        }}
                                    >
                                        {enrolled ? '✓ Đã đăng ký' : 'Chưa'}
                                    </Text>
                                </View>
                            </XStack>
                            <Text
                                style={{
                                    marginTop: 3,
                                    fontFamily: SANS,
                                    fontSize: 11.5,
                                    color: EHR_OUTLINE,
                                    lineHeight: 16,
                                }}
                            >
                                Bác sĩ nhập số CCCD vật lý → app tự tra ví của bạn.
                            </Text>
                        </View>
                        <ChevronRight size={16} color={EHR_OUTLINE} />
                    </Pressable>
                </View>

                {/* ───────── Lifesaving info ───────── */}
                <ViSectionLabel>Thông tin cứu sinh</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                    <ViCard padding={16}>
                        <FieldLabel>Nhóm máu</FieldLabel>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {BLOOD_TYPES.map((b) => {
                                const active = bloodType === b;
                                return (
                                    <Pressable
                                        key={b}
                                        onPress={() => setBloodType(active ? '' : b)}
                                        style={({ pressed }) => ({
                                            minWidth: 48,
                                            paddingVertical: 8,
                                            paddingHorizontal: 10,
                                            borderRadius: 8,
                                            backgroundColor: active ? `${EHR_SECONDARY}24` : 'transparent',
                                            borderWidth: 0.5,
                                            borderColor: active ? `${EHR_SECONDARY}80` : EHR_OUTLINE_SOFT,
                                            alignItems: 'center',
                                            opacity: pressed ? 0.7 : 1,
                                        })}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: 'monospace',
                                                fontSize: 13,
                                                fontWeight: '700',
                                                color: active ? EHR_SECONDARY : EHR_ON_SURFACE_VARIANT,
                                            }}
                                        >
                                            {b}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View style={{ height: 16 }} />
                        <FieldLabel>Dị ứng</FieldLabel>
                        <TextInput
                            value={allergies}
                            onChangeText={setAllergies}
                            placeholder="Penicillin, Aspirin…"
                            placeholderTextColor={EHR_OUTLINE}
                            multiline
                            style={{
                                marginTop: 8,
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                                borderWidth: 0.5,
                                borderColor: EHR_OUTLINE_SOFT,
                                backgroundColor: EHR_SURFACE,
                                color: EHR_ON_SURFACE,
                                fontFamily: SANS,
                                fontSize: 13,
                                minHeight: 48,
                                textAlignVertical: 'top',
                            }}
                        />
                        <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {ALLERGY_QUICK.map((a) => (
                                <Pressable
                                    key={a}
                                    onPress={() => addAllergyTag(a)}
                                    style={({ pressed }) => ({
                                        paddingHorizontal: 9,
                                        paddingVertical: 4,
                                        borderRadius: 999,
                                        borderWidth: 0.5,
                                        borderColor: EHR_OUTLINE_VARIANT,
                                        borderStyle: 'dashed',
                                        opacity: pressed ? 0.6 : 1,
                                    })}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS,
                                            fontSize: 10.5,
                                            color: EHR_OUTLINE,
                                        }}
                                    >
                                        + {a}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </ViCard>
                    <View
                        style={{
                            marginTop: 10,
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderRadius: 10,
                            backgroundColor: `${EHR_SLATE}1A`,
                            borderWidth: 0.5,
                            borderColor: EHR_OUTLINE_SOFT,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 11.5,
                                color: EHR_OUTLINE,
                                lineHeight: 18,
                            }}
                        >
                            Chỉ bác sĩ có phiên cấp cứu đang hoạt động + đã được xác minh mới thấy thông tin này.
                        </Text>
                    </View>
                </View>

                {/* ───────── Trusted contacts preview ───────── */}
                <View style={{ paddingHorizontal: 0, marginTop: 14 }}>
                    <XStack
                        style={{
                            paddingHorizontal: 20,
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 11,
                                color: EHR_OUTLINE,
                                letterSpacing: 1.2,
                                textTransform: 'uppercase',
                                fontWeight: '600',
                            }}
                        >
                            Người thân tin cậy
                        </Text>
                        <Pressable onPress={() => navigation.navigate('TrustedContacts')}>
                            <Text
                                style={{
                                    fontFamily: SANS_MEDIUM,
                                    fontSize: 11.5,
                                    color: EHR_ON_SURFACE_VARIANT,
                                    fontWeight: '500',
                                }}
                            >
                                Xem tất cả ({allContacts.length}) →
                            </Text>
                        </Pressable>
                    </XStack>

                    {allContacts.length === 0 ? (
                        <View style={{ paddingHorizontal: 20, marginTop: 10 }}>
                            <View
                                style={{
                                    paddingVertical: 14,
                                    paddingHorizontal: 16,
                                    borderRadius: 12,
                                    backgroundColor: `${EHR_PRIMARY}14`,
                                    borderWidth: 0.5,
                                    borderColor: `${EHR_PRIMARY}40`,
                                    flexDirection: 'row',
                                    gap: 12,
                                    alignItems: 'flex-start',
                                }}
                            >
                                <AlertTriangle size={16} color={EHR_PRIMARY} style={{ marginTop: 2 }} />
                                <Text
                                    style={{
                                        flex: 1,
                                        fontFamily: SANS,
                                        fontSize: 12.5,
                                        color: EHR_ON_SURFACE,
                                        lineHeight: 18,
                                    }}
                                >
                                    <Text style={{ fontFamily: SANS_SEMI, color: EHR_PRIMARY, fontWeight: '700' }}>
                                        Bạn chưa có người thân nào.{' '}
                                    </Text>
                                    Trong tình huống cấp cứu, không ai có thể đại diện cho bạn cấp quyền truy cập.
                                </Text>
                            </View>
                        </View>
                    ) : (
                        <View style={{ paddingHorizontal: 20, marginTop: 10, gap: 6 }}>
                            {contactsPreview.map((c) => (
                                <View
                                    key={c.contactAddress}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 12,
                                        paddingVertical: 12,
                                        paddingHorizontal: 14,
                                        backgroundColor: EHR_SURFACE_LOWEST,
                                        borderWidth: 0.5,
                                        borderColor: EHR_OUTLINE_SOFT,
                                        borderRadius: 10,
                                    }}
                                >
                                    <View
                                        style={{
                                            width: 34,
                                            height: 34,
                                            borderRadius: 17,
                                            backgroundColor: EHR_PRIMARY_FIXED,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Heart size={16} color={EHR_PRIMARY} />
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text
                                            style={{
                                                fontFamily: SANS_MEDIUM,
                                                fontSize: 13.5,
                                                color: EHR_ON_SURFACE,
                                                fontWeight: '500',
                                            }}
                                            numberOfLines={1}
                                        >
                                            {c.fullName || truncate(c.contactAddress)}
                                        </Text>
                                        <Text
                                            style={{
                                                marginTop: 1,
                                                fontFamily: SANS,
                                                fontSize: 11,
                                                color: EHR_OUTLINE,
                                            }}
                                            numberOfLines={1}
                                        >
                                            {c.label || '—'} · {truncate(c.contactAddress)}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                <View style={{ height: 26 }} />

                {/* ───────── How you'll be found ───────── */}
                <ViSectionLabel>Bạn sẽ được tìm thấy như thế nào</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
                    <View
                        style={{
                            padding: 18,
                            borderRadius: 14,
                            backgroundColor: EHR_SURFACE_LOWEST,
                            borderWidth: 0.5,
                            borderColor: EHR_OUTLINE_SOFT,
                        }}
                    >
                        {[
                            {
                                n: '1',
                                title: 'Bác sĩ quét CCCD vật lý',
                                sub: 'Trên thẻ căn cước của bạn — không cần mở app',
                            },
                            {
                                n: '2',
                                title: 'App tính keccak256 → tra ví',
                                sub: 'Backend tìm địa chỉ ví của bạn từ hash CCCD',
                            },
                            {
                                n: '3',
                                title: 'Bác sĩ gọi Người thân → ký uỷ quyền',
                                sub: 'Người thân đại diện bạn cấp quyền truy cập tạm thời',
                            },
                        ].map((s, i, arr) => (
                            <View
                                key={s.n}
                                style={{
                                    flexDirection: 'row',
                                    gap: 12,
                                    paddingTop: i === 0 ? 0 : 12,
                                    paddingBottom: i === arr.length - 1 ? 0 : 12,
                                    borderBottomWidth: i < arr.length - 1 ? 0.5 : 0,
                                    borderColor: EHR_OUTLINE_SOFT,
                                    borderStyle: 'dashed',
                                }}
                            >
                                <View
                                    style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: 12,
                                        backgroundColor: `${EHR_PRIMARY}1A`,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SERIF,
                                            fontSize: 11,
                                            fontWeight: '700',
                                            color: EHR_PRIMARY,
                                        }}
                                    >
                                        {s.n}
                                    </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={{
                                            fontFamily: SANS_MEDIUM,
                                            fontSize: 13,
                                            color: EHR_ON_SURFACE,
                                            fontWeight: '500',
                                            lineHeight: 18,
                                        }}
                                    >
                                        {s.title}
                                    </Text>
                                    <Text
                                        style={{
                                            marginTop: 3,
                                            fontFamily: SANS,
                                            fontSize: 11.5,
                                            color: EHR_OUTLINE,
                                            lineHeight: 16,
                                        }}
                                    >
                                        {s.sub}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>

                {/* ───────── CTAs ───────── */}
                <View style={{ paddingHorizontal: 20, marginTop: 24, flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                        <ViButton variant="ghost" full onPress={() => navigation.goBack()}>
                            Đóng
                        </ViButton>
                    </View>
                    <View style={{ flex: 1 }}>
                        <ViButton variant="primary" full loading={saving} onPress={handleSave}>
                            {saving ? 'Đang lưu…' : 'Lưu thông tin'}
                        </ViButton>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <Text
            style={{
                fontFamily: SANS_SEMI,
                fontSize: 11.5,
                color: EHR_OUTLINE,
                fontWeight: '600',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
            }}
        >
            {children}
        </Text>
    );
}
