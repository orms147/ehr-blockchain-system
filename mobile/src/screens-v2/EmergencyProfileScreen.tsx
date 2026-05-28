// EmergencyProfileScreen v2 — Phase G.8 full redesign per Claude Design
// viehp-g-pack-screens.html §2 ("One document, not seven cards"):
//
// Layout intent: this is ONE document — what an ER doctor sees when they look
// you up. The page reads as a single paper sheet with sectioned content, and
// surfaces a LIVE PREVIEW of the ER-side view at top — the emotional anchor
// for filling this in carefully.
//
// Sections (hairline-separated, NO card chrome):
//   1. ER preview card ("Bác sĩ cấp cứu thấy") — at top, reactive to edits
//   2. CCCD enrolment banner — the ONE cinnabar moment, links to TrustedContacts
//   3. Nhóm máu (critical, larger type)
//   4. Dị ứng (critical, warn tone)
//   5. Người thân tin cậy (preview + link to full list)
//   6. Khác (gender + DOB — read-only KV rows)
//   7. Footer note in dashed border explaining what CCCD lookup exposes
//
// Backend wiring (unchanged):
//   - GET /api/profile/me — bloodType + allergies + nationalIdHash + fullName + gender + dateOfBirth
//   - PUT /api/profile/me — save bloodType + allergies
//   - trustedContactService.listMyContacts (TanStack Query)

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { ChevronLeft, ChevronRight, IdCard, Heart, AlertTriangle, X, Plus } from 'lucide-react-native';

import api from '../services/api';
import trustedContactService from '../services/trustedContact.service';
import ViButton from '../components-v2/ViButton';
import { useEhrPalette } from '../constants/uiColors';
import { friendlyBackendError } from '../utils/friendlyError';

const SERIF = 'Fraunces_400Regular';
const SERIF_MEDIUM = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

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
    fullName?: string | null;
    gender?: string | null;
    dateOfBirth?: string | null;
};

const truncate = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

const parseList = (raw: string): string[] =>
    raw
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

const formatVnDate = (iso?: string | null) => {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}·${mm}·${d.getFullYear()}`;
    } catch {
        return '—';
    }
};

const computeAge = (iso?: string | null) => {
    if (!iso) return null;
    try {
        const d = new Date(iso);
        const diff = Date.now() - d.getTime();
        const age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
        return age >= 0 && age < 150 ? age : null;
    } catch {
        return null;
    }
};

const formatGender = (g?: string | null) => {
    if (!g) return '—';
    const lower = String(g).toLowerCase();
    if (lower === 'male' || lower === 'm') return 'Nam';
    if (lower === 'female' || lower === 'f') return 'Nữ';
    return 'Khác';
};

export default function EmergencyProfileScreen() {
    const palette = useEhrPalette();
    const navigation = useNavigation<any>();
    const [bloodType, setBloodType] = useState<string>('');
    const [allergies, setAllergies] = useState<string>('');
    const [allergyInput, setAllergyInput] = useState('');
    const [saving, setSaving] = useState(false);

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
        }
    }, [profileQuery.data]);

    const profile = profileQuery.data || {};
    const enrolled = !!profile.nationalIdHash;
    const allContacts = contactsQuery.data || [];
    const contactsPreview = allContacts.slice(0, 3);
    const age = computeAge(profile.dateOfBirth);
    const allergyList = useMemo(() => parseList(allergies), [allergies]);

    const addAllergy = (tag: string) => {
        const clean = tag.trim();
        if (!clean) return;
        const list = parseList(allergies);
        if (list.includes(clean)) return;
        setAllergies([...list, clean].join(', '));
        setAllergyInput('');
    };

    const removeAllergy = (tag: string) => {
        const list = parseList(allergies).filter((x) => x !== tag);
        setAllergies(list.join(', '));
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
            Alert.alert('Lỗi', friendlyBackendError(err, 'Không thể lưu thông tin cấp cứu.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
                {/* Top bar */}
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
                        <ChevronLeft size={18} color={palette.EHR_ON_SURFACE_VARIANT} />
                        <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_ON_SURFACE_VARIANT }}>
                            Quay lại
                        </Text>
                    </Pressable>
                    <Text
                        style={{
                            marginTop: 6,
                            fontFamily: SERIF,
                            fontSize: 28,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.5,
                            lineHeight: 32,
                        }}
                    >
                        Hồ sơ khẩn cấp
                    </Text>
                </View>

                {/* ───────── ER PREVIEW — "Bác sĩ cấp cứu thấy" ───────── */}
                <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 10,
                            color: palette.EHR_PRIMARY,
                            letterSpacing: 1.4,
                            textTransform: 'uppercase',
                            fontWeight: '700',
                            marginBottom: 10,
                        }}
                    >
                        Bác sĩ cấp cứu thấy
                    </Text>
                    <ERPreviewCard
                        fullName={profile.fullName}
                        gender={profile.gender}
                        age={age}
                        dateOfBirth={profile.dateOfBirth}
                        blood={bloodType}
                        allergies={allergyList}
                        firstContact={contactsPreview[0] || null}
                    />
                </View>

                {/* ───────── CCCD enrolment — the ONE cinnabar moment ───────── */}
                {!enrolled ? (
                    <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
                        <Pressable
                            onPress={() => navigation.navigate('TrustedContacts')}
                            style={({ pressed }) => ({
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 12,
                                paddingVertical: 14,
                                paddingHorizontal: 16,
                                borderRadius: 14,
                                backgroundColor: palette.EHR_PRIMARY,
                                opacity: pressed ? 0.85 : 1,
                            })}
                        >
                            <View
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 8,
                                    backgroundColor: 'rgba(250,247,241,0.18)',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <IdCard size={18} color="#FBF8F1" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 13.5,
                                        color: '#FBF8F1',
                                        fontWeight: '700',
                                    }}
                                >
                                    Đăng ký CCCD để được tra cứu
                                </Text>
                                <Text
                                    style={{
                                        marginTop: 3,
                                        fontFamily: SANS,
                                        fontSize: 11,
                                        color: 'rgba(250,247,241,0.78)',
                                        lineHeight: 15,
                                    }}
                                >
                                    ER nhập CCCD → app tra ví của bạn. Chưa đăng ký · 2 phút.
                                </Text>
                            </View>
                            <ChevronRight size={16} color="#FBF8F1" />
                        </Pressable>
                    </View>
                ) : (
                    <View style={{ paddingHorizontal: 20, marginBottom: 22 }}>
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 10,
                                paddingVertical: 10,
                                paddingHorizontal: 14,
                                borderRadius: 10,
                                backgroundColor: `${palette.EHR_TERTIARY}1A`,
                                borderWidth: 0.5,
                                borderColor: `${palette.EHR_TERTIARY}40`,
                            }}
                        >
                            <IdCard size={14} color={palette.EHR_TERTIARY} />
                            <Text
                                style={{
                                    flex: 1,
                                    fontFamily: SANS_MEDIUM,
                                    fontSize: 12,
                                    color: palette.EHR_TERTIARY,
                                    fontWeight: '600',
                                }}
                            >
                                CCCD đã đăng ký — bạn có thể được tra cứu khi cấp cứu.
                            </Text>
                        </View>
                    </View>
                )}

                {/* ───────── EDITING — sectioned hairlines, no card chrome ───────── */}
                <View style={{ paddingHorizontal: 20 }}>
                    {/* Nhóm máu */}
                    <SectionRow label="Nhóm máu" critical>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {BLOOD_TYPES.map((b) => {
                                const active = bloodType === b;
                                return (
                                    <Pressable
                                        key={b}
                                        onPress={() => setBloodType(active ? '' : b)}
                                        style={({ pressed }) => ({
                                            minWidth: 52,
                                            paddingVertical: 9,
                                            paddingHorizontal: 12,
                                            borderRadius: 8,
                                            backgroundColor: active ? `${palette.EHR_SECONDARY}24` : 'transparent',
                                            borderWidth: 0.5,
                                            borderColor: active ? `${palette.EHR_SECONDARY}80` : palette.EHR_OUTLINE_SOFT,
                                            alignItems: 'center',
                                            opacity: pressed ? 0.7 : 1,
                                        })}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: MONO,
                                                fontSize: 13,
                                                fontWeight: '700',
                                                color: active ? palette.EHR_SECONDARY : palette.EHR_ON_SURFACE_VARIANT,
                                            }}
                                        >
                                            {b}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </SectionRow>

                    {/* Dị ứng */}
                    <SectionRow label="Dị ứng" critical hint="Liệt kê tất cả · ER tin tưởng tuyệt đối">
                        {allergyList.length > 0 ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                {allergyList.map((a) => (
                                    <Pressable
                                        key={a}
                                        onPress={() => removeAllergy(a)}
                                        style={({ pressed }) => ({
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 5,
                                            paddingVertical: 5,
                                            paddingHorizontal: 10,
                                            borderRadius: 6,
                                            backgroundColor: `${palette.EHR_WARNING}1F`,
                                            borderWidth: 0.5,
                                            borderColor: `${palette.EHR_WARNING}60`,
                                            opacity: pressed ? 0.7 : 1,
                                        })}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: SANS_SEMI,
                                                fontSize: 12.5,
                                                color: palette.EHR_WARNING,
                                                fontWeight: '700',
                                            }}
                                        >
                                            !  {a}
                                        </Text>
                                        <X size={11} color={palette.EHR_WARNING} />
                                    </Pressable>
                                ))}
                            </View>
                        ) : null}
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TextInput
                                value={allergyInput}
                                onChangeText={setAllergyInput}
                                onSubmitEditing={() => addAllergy(allergyInput)}
                                placeholder="Thêm dị ứng…"
                                placeholderTextColor={palette.EHR_OUTLINE}
                                style={{
                                    flex: 1,
                                    paddingVertical: 9,
                                    paddingHorizontal: 12,
                                    borderRadius: 8,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    color: palette.EHR_ON_SURFACE,
                                    fontFamily: SANS,
                                    fontSize: 13,
                                }}
                                returnKeyType="done"
                            />
                            <Pressable
                                onPress={() => addAllergy(allergyInput)}
                                disabled={!allergyInput.trim()}
                                style={({ pressed }) => ({
                                    paddingHorizontal: 12,
                                    justifyContent: 'center',
                                    borderRadius: 8,
                                    borderWidth: 0.5,
                                    borderColor: allergyInput.trim() ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                    backgroundColor: allergyInput.trim() ? `${palette.EHR_PRIMARY}1A` : 'transparent',
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <Plus size={16} color={allergyInput.trim() ? palette.EHR_PRIMARY : palette.EHR_OUTLINE} />
                            </Pressable>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                            {ALLERGY_QUICK.filter((a) => !allergyList.includes(a)).map((a) => (
                                <Pressable
                                    key={a}
                                    onPress={() => addAllergy(a)}
                                    style={({ pressed }) => ({
                                        paddingHorizontal: 9,
                                        paddingVertical: 4,
                                        borderRadius: 999,
                                        borderWidth: 0.5,
                                        borderStyle: 'dashed',
                                        borderColor: palette.EHR_OUTLINE_VARIANT,
                                        opacity: pressed ? 0.6 : 1,
                                    })}
                                >
                                    <Text style={{ fontFamily: SANS, fontSize: 10.5, color: palette.EHR_TEXT_MUTED }}>
                                        + {a}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </SectionRow>

                    {/* Người thân tin cậy */}
                    <SectionRow
                        label="Người thân tin cậy"
                        trailing={`${allContacts.length} người`}
                        onTrailingPress={() => navigation.navigate('TrustedContacts')}
                    >
                        {allContacts.length === 0 ? (
                            <View
                                style={{
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    borderRadius: 10,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_VARIANT,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    flexDirection: 'row',
                                    alignItems: 'flex-start',
                                    gap: 10,
                                }}
                            >
                                <AlertTriangle size={14} color={palette.EHR_TEXT_MUTED} style={{ marginTop: 2 }} />
                                <Text
                                    style={{
                                        flex: 1,
                                        fontFamily: SANS,
                                        fontSize: 12.5,
                                        color: palette.EHR_ON_SURFACE_VARIANT,
                                        lineHeight: 18,
                                    }}
                                >
                                    Chưa có người thân nào. Trong tình huống cấp cứu, không ai có thể đại diện cấp quyền truy cập.
                                </Text>
                            </View>
                        ) : (
                            <View style={{ gap: 6 }}>
                                {contactsPreview.map((c) => (
                                    <View
                                        key={c.contactAddress}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 10,
                                            paddingVertical: 8,
                                        }}
                                    >
                                        <View
                                            style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: 15,
                                                backgroundColor: palette.EHR_PRIMARY_FIXED,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <Heart size={14} color={palette.EHR_PRIMARY} />
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text
                                                style={{
                                                    fontFamily: SANS_MEDIUM,
                                                    fontSize: 13,
                                                    color: palette.EHR_ON_SURFACE,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {c.fullName || truncate(c.contactAddress)}
                                            </Text>
                                            <Text
                                                style={{
                                                    marginTop: 1,
                                                    fontFamily: SANS,
                                                    fontSize: 10.5,
                                                    color: palette.EHR_TEXT_MUTED,
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
                    </SectionRow>

                    {/* Khác */}
                    <SectionRow label="Khác" last>
                        <KVRow k="Giới tính" v={formatGender(profile.gender)} />
                        <KVRow k="Ngày sinh" v={formatVnDate(profile.dateOfBirth)} />
                    </SectionRow>
                </View>

                {/* "Bạn sẽ được tìm thấy như thế nào" — 3-step demo flowchart
                    per viehp-screens-polish-pack.html §1. Educational moment
                    explaining the emergency lookup flow to the patient. */}
                <HowYouWillBeFound />

                {/* Footer note */}
                <View
                    style={{
                        marginTop: 20,
                        marginHorizontal: 20,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                        borderWidth: 0.5,
                        borderStyle: 'dashed',
                        borderColor: palette.EHR_OUTLINE_VARIANT,
                        borderRadius: 10,
                    }}
                >
                    <Text
                        style={{
                            fontFamily: SANS,
                            fontSize: 11,
                            color: palette.EHR_TEXT_MUTED,
                            lineHeight: 17,
                        }}
                    >
                        Chỉ thông tin trong khung &quot;Bác sĩ cấp cứu thấy&quot; ở trên được hiển thị qua tra cứu CCCD. Ngoài lúc cấp cứu, không ai khác có quyền xem.
                    </Text>
                </View>
            </ScrollView>

            {/* Sticky footer Save CTA */}
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
                    flexDirection: 'row',
                    gap: 10,
                }}
            >
                <View style={{ flex: 1 }}>
                    <ViButton variant="ghost" full onPress={() => navigation.goBack()}>
                        Đóng
                    </ViButton>
                </View>
                <View style={{ flex: 2 }}>
                    <ViButton variant="primary" full loading={saving} onPress={handleSave}>
                        {saving ? 'Đang lưu…' : 'Lưu thông tin'}
                    </ViButton>
                </View>
            </View>
        </SafeAreaView>
    );
}

// ───────── ER Preview Card — what the doctor sees ─────────
function ERPreviewCard({
    fullName,
    gender,
    age,
    dateOfBirth,
    blood,
    allergies,
    firstContact,
}: {
    fullName?: string | null;
    gender?: string | null;
    age: number | null;
    dateOfBirth?: string | null;
    blood: string;
    allergies: string[];
    firstContact: Contact | null;
}) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                position: 'relative',
                padding: 18,
                backgroundColor: palette.EHR_SURFACE_HIGH,
                borderRadius: 14,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_VARIANT,
            }}
        >
            {/* watermark stamp */}
            <View
                style={{
                    position: 'absolute',
                    right: 12,
                    top: 10,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderWidth: 0.5,
                    borderColor: `${palette.EHR_PRIMARY}40`,
                    borderRadius: 4,
                }}
            >
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        fontWeight: '700',
                        color: palette.EHR_PRIMARY,
                    }}
                >
                    ER · Read-only
                </Text>
            </View>

            {/* identity line */}
            <Text
                style={{
                    fontFamily: SERIF_MEDIUM,
                    fontSize: 19,
                    color: palette.EHR_ON_SURFACE,
                    letterSpacing: -0.2,
                    lineHeight: 23,
                }}
            >
                {fullName || 'Chưa cập nhật tên'}
            </Text>
            <Text
                style={{
                    marginTop: 2,
                    fontFamily: MONO,
                    fontSize: 11.5,
                    color: palette.EHR_ON_SURFACE_VARIANT,
                }}
            >
                {formatGender(gender)}
                {age !== null ? ` · ${age} tuổi` : ''}
                {dateOfBirth ? ` · ${formatVnDate(dateOfBirth)}` : ''}
            </Text>

            {/* CRITICAL — blood + allergies */}
            <XStack style={{ marginTop: 14, gap: 16, alignItems: 'flex-start' }}>
                <YStack>
                    <Text
                        style={{
                            fontSize: 9,
                            color: palette.EHR_TEXT_MUTED,
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            fontWeight: '700',
                        }}
                    >
                        Máu
                    </Text>
                    <Text
                        style={{
                            fontFamily: SERIF_MEDIUM,
                            fontSize: 28,
                            color: blood ? palette.EHR_SECONDARY : palette.EHR_OUTLINE,
                            letterSpacing: -0.6,
                            lineHeight: 32,
                            marginTop: 4,
                        }}
                    >
                        {blood || '—'}
                    </Text>
                </YStack>
                <YStack style={{ flex: 1 }}>
                    <Text
                        style={{
                            fontSize: 9,
                            color: palette.EHR_TEXT_MUTED,
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            fontWeight: '700',
                        }}
                    >
                        Dị ứng · cảnh báo
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                        {allergies.length === 0 ? (
                            <Text
                                style={{
                                    fontFamily: SANS,
                                    fontSize: 12,
                                    color: palette.EHR_TEXT_MUTED,
                                    fontStyle: 'italic',
                                }}
                            >
                                Không có thông tin
                            </Text>
                        ) : (
                            allergies.map((a) => (
                                <View
                                    key={a}
                                    style={{
                                        paddingHorizontal: 9,
                                        paddingVertical: 4,
                                        borderRadius: 4,
                                        backgroundColor: `${palette.EHR_WARNING}1F`,
                                        borderWidth: 0.5,
                                        borderColor: `${palette.EHR_WARNING}60`,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 12,
                                            color: palette.EHR_WARNING,
                                            fontWeight: '700',
                                        }}
                                    >
                                        !  {a}
                                    </Text>
                                </View>
                            ))
                        )}
                    </View>
                </YStack>
            </XStack>

            {/* contact mini-strip */}
            {firstContact ? (
                <View
                    style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTopWidth: 0.5,
                        borderStyle: 'dashed',
                        borderColor: palette.EHR_OUTLINE_VARIANT,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 9,
                            color: palette.EHR_TEXT_MUTED,
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            fontWeight: '700',
                        }}
                    >
                        Liên hệ
                    </Text>
                    <Text
                        style={{
                            flex: 1,
                            fontFamily: SANS_MEDIUM,
                            fontSize: 11.5,
                            color: palette.EHR_ON_SURFACE,
                        }}
                        numberOfLines={1}
                    >
                        {firstContact.fullName || truncate(firstContact.contactAddress)}
                        {firstContact.label ? (
                            <Text style={{ color: palette.EHR_TEXT_MUTED }}> · {firstContact.label}</Text>
                        ) : null}
                    </Text>
                </View>
            ) : null}
        </View>
    );
}

// ───────── SectionRow — one row in the "single document" layout ─────────
function SectionRow({
    label,
    children,
    trailing,
    onTrailingPress,
    critical,
    hint,
    last,
}: {
    label: string;
    children: React.ReactNode;
    trailing?: string;
    onTrailingPress?: () => void;
    critical?: boolean;
    hint?: string;
    last?: boolean;
}) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                paddingVertical: 18,
                borderBottomWidth: last ? 0 : 0.5,
                borderColor: palette.EHR_OUTLINE_VARIANT,
            }}
        >
            <XStack style={{ alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <XStack style={{ alignItems: 'baseline', gap: 6 }}>
                    <Text
                        style={{
                            fontSize: 10,
                            color: critical ? palette.EHR_WARNING : palette.EHR_OUTLINE,
                            letterSpacing: 1.2,
                            textTransform: 'uppercase',
                            fontWeight: '700',
                            fontFamily: SANS_SEMI,
                        }}
                    >
                        {label}
                    </Text>
                    {critical ? (
                        <Text
                            style={{
                                fontSize: 9,
                                color: palette.EHR_WARNING,
                                letterSpacing: 0.5,
                                fontWeight: '600',
                            }}
                        >
                            (quan trọng)
                        </Text>
                    ) : null}
                </XStack>
                {trailing ? (
                    onTrailingPress ? (
                        <Pressable onPress={onTrailingPress} hitSlop={6}>
                            <Text
                                style={{
                                    fontFamily: SANS_MEDIUM,
                                    fontSize: 11.5,
                                    color: palette.EHR_ON_SURFACE_VARIANT,
                                }}
                            >
                                {trailing} →
                            </Text>
                        </Pressable>
                    ) : (
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 11.5,
                                color: palette.EHR_TEXT_MUTED,
                            }}
                        >
                            {trailing}
                        </Text>
                    )
                ) : null}
            </XStack>
            {children}
            {hint ? (
                <Text
                    style={{
                        marginTop: 8,
                        fontFamily: SANS,
                        fontSize: 11,
                        color: palette.EHR_TEXT_MUTED,
                        lineHeight: 16,
                        fontStyle: 'italic',
                    }}
                >
                    {hint}
                </Text>
            ) : null}
        </View>
    );
}

function KVRow({ k, v }: { k: string; v: string }) {
    const palette = useEhrPalette();
    return (
        <XStack style={{ justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_ON_SURFACE_VARIANT }}>{k}</Text>
            <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 13, color: palette.EHR_ON_SURFACE, fontWeight: '500' }}>{v}</Text>
        </XStack>
    );
}

/**
 * HowYouWillBeFound — 3-step educational flowchart per polish pack §1.
 * Vertical timeline (mobile-narrow) connecting 3 scenes:
 *   T+0s — Bạn bất tỉnh · Có CCCD trong ví
 *   T+5s — Bác sĩ gõ 12 số CCCD vào app
 *   T+6s — App hiện danh tính + máu + dị ứng + người thân
 * Spine + cinnabar dots + serif italic heading. This is the demo moment.
 */
function HowYouWillBeFound() {
    const palette = useEhrPalette();
    const steps = [
        {
            time: 'T + 0s',
            heading: 'Bạn bất tỉnh.',
            body: 'Không phản ứng. Trong ví chỉ có một mảnh nhựa — CCCD 12 số.',
        },
        {
            time: 'T + 5s',
            heading: 'Bác sĩ cấp cứu gõ 12 số.',
            body: 'App băm CCCD trên thiết bị, đối chiếu hash với chuỗi. Không CCCD gốc nào rời máy.',
        },
        {
            time: 'T + 6s',
            heading: 'App hiện đủ thông tin.',
            body: 'Danh tính · nhóm máu · dị ứng · 1 nút Gọi người thân. Audit-log gửi về máy bạn.',
        },
    ];
    return (
        <View style={{ marginTop: 28, marginHorizontal: 20 }}>
            <Text
                style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                    marginBottom: 6,
                }}
            >
                Khi bạn cần đến nó
            </Text>
            <Text
                style={{
                    fontFamily: SERIF_MEDIUM,
                    fontSize: 22,
                    color: palette.EHR_ON_SURFACE,
                    letterSpacing: -0.3,
                    lineHeight: 26,
                    marginBottom: 18,
                }}
            >
                Bạn sẽ được{' '}
                <Text style={{ fontStyle: 'italic', color: palette.EHR_CINNABAR_DEEP }}>tìm thấy</Text>
                {' '}như thế nào?
            </Text>

            {/* Timeline with spine + dots */}
            <View style={{ position: 'relative', paddingLeft: 22 }}>
                {/* Vertical spine — drawn behind dots */}
                <View
                    style={{
                        position: 'absolute',
                        left: 5,
                        top: 8,
                        bottom: 8,
                        width: 0.5,
                        backgroundColor: palette.EHR_OUTLINE_SOFT,
                    }}
                />
                {steps.map((step, i) => (
                    <View
                        key={step.time}
                        style={{
                            paddingBottom: i === steps.length - 1 ? 0 : 18,
                        }}
                    >
                        {/* Dot */}
                        <View
                            style={{
                                position: 'absolute',
                                left: -22,
                                top: 4,
                                width: 12,
                                height: 12,
                                borderRadius: 6,
                                backgroundColor: palette.EHR_SURFACE,
                                borderWidth: 1.25,
                                borderColor: palette.EHR_CINNABAR_DEEP,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <View
                                style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: 2.5,
                                    backgroundColor: palette.EHR_CINNABAR_DEEP,
                                }}
                            />
                        </View>
                        <Text
                            style={{
                                fontFamily: MONO,
                                fontSize: 10,
                                color: palette.EHR_CINNABAR_DEEP,
                                letterSpacing: 1.2,
                                textTransform: 'uppercase',
                                fontWeight: '700',
                                marginBottom: 4,
                            }}
                        >
                            {step.time}
                        </Text>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 15,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                                lineHeight: 20,
                                marginBottom: 4,
                            }}
                        >
                            {step.heading}
                        </Text>
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 12.5,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 18,
                            }}
                        >
                            {step.body}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

