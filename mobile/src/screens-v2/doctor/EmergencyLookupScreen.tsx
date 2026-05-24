// EmergencyLookupScreen v2 — port of .design-bundle/project/screens-emergency.jsx
// EmergencyLookupScreen. Doctor in ER nhập CCCD → keccak256 client-side →
// resolve wallet + Trusted Contact list. Cinnabar hero warning (audit-logged
// emergency action) + result card + contact phone tel: links.
//
// Wiring preserved:
//   - keccak256(toBytes(raw)) client-side hashing
//   - trustedContactService.lookupByCccd + getContactsForPatient
//   - Linking.openURL('tel:...') for phone calls
//   - Error code mapping: PATIENT_NOT_FOUND, LOOKUP_RATE_LIMITED

import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { keccak256, toBytes } from 'viem';
import { Text, XStack, YStack } from 'tamagui';
import { Search, Phone, Heart, AlertTriangle, Droplet, ShieldAlert, Info } from 'lucide-react-native';

import trustedContactService from '../../services/trustedContact.service';
import ViCard from '../../components-v2/ViCard';
import ViButton from '../../components-v2/ViButton';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type PatientInfo = {
    walletAddress: string;
    fullName?: string | null;
    gender?: string | null;
    bloodType?: string | null;
    allergies?: string | null;
    avatarUrl?: string | null;
};

type Contact = {
    contactAddress: string;
    label?: string | null;
    fullName?: string | null;
    phone?: string | null;
};

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '');

/**
 * emergencyRelationTone — map label string to color token per polish pack §3
 * A·2. Same mapping as TrustedContactsScreen.relationTone — duplicated to
 * avoid a shared-util import cycle for a 5-line helper.
 */
function emergencyRelationTone(label: string | null | undefined, palette: any): string {
    if (!label) return palette.EHR_TEXT_MUTED;
    const l = label.toLowerCase().trim();
    if (l.includes('vợ') || l.includes('chồng') || l === 'spouse') return palette.EHR_CINNABAR_DEEP;
    if (l.includes('cha') || l.includes('mẹ') || l.includes('bố') || l === 'parent') return palette.EHR_CLAY;
    if (l.includes('con') || l === 'child') return palette.EHR_TERTIARY;
    if (l.includes('anh') || l.includes('chị') || l.includes('em') || l === 'sibling') return palette.EHR_OUTLINE;
    return palette.EHR_TEXT_MUTED;
}

export default function EmergencyLookupScreen() {
    const palette = useEhrPalette();
    const [cccdInput, setCccdInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [patient, setPatient] = useState<PatientInfo | null>(null);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleLookup = async () => {
        const raw = cccdInput.trim();
        if (!/^\d{9,12}$/.test(raw)) {
            Alert.alert('CCCD không hợp lệ', 'Vui lòng nhập 9-12 chữ số.');
            return;
        }
        setError(null);
        setPatient(null);
        setContacts([]);

        try {
            setLoading(true);
            const cccdHash = keccak256(toBytes(raw));
            const found = await trustedContactService.lookupByCccd(cccdHash);
            setPatient(found);
            try {
                const list = await trustedContactService.getContactsForPatient(found.walletAddress);
                setContacts(Array.isArray(list) ? list : []);
            } catch {
                setContacts([]);
            }
        } catch (err: any) {
            const code = err?.data?.code;
            if (code === 'PATIENT_NOT_FOUND') {
                setError('Không tìm thấy bệnh nhân với CCCD này. Bệnh nhân có thể chưa đăng ký Mã định danh khẩn cấp.');
            } else if (code === 'LOOKUP_RATE_LIMITED') {
                setError(err?.data?.error || 'Bạn đã tra cứu quá nhiều lần. Vui lòng thử lại sau.');
            } else {
                setError(err?.data?.error || err?.message || 'Tra cứu thất bại.');
            }
        } finally {
            setLoading(false);
        }
    };

    const callContact = (phone?: string | null) => {
        if (!phone) {
            Alert.alert('Người thân chưa cập nhật số điện thoại trong app.');
            return;
        }
        Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Không mở được trình quay số.', phone));
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {/* Hero */}
                <View style={{ marginBottom: 16 }}>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 26,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.4,
                            lineHeight: 30,
                        }}
                    >
                        Tra cứu cấp cứu
                    </Text>
                    <Text
                        style={{
                            marginTop: 4,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 19,
                        }}
                    >
                        Nhập CCCD/CMND của bệnh nhân để tra cứu ví + liên hệ Người thân tin cậy.
                    </Text>
                </View>

                {/* Audit warning */}
                <View
                    style={{
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 12,
                        backgroundColor: `${palette.EHR_PRIMARY}14`,
                        borderWidth: 0.5,
                        borderColor: `${palette.EHR_PRIMARY}50`,
                        marginBottom: 16,
                        flexDirection: 'row',
                        gap: 10,
                    }}
                >
                    <ShieldAlert size={16} color={palette.EHR_PRIMARY} style={{ marginTop: 2 }} />
                    <Text
                        style={{
                            flex: 1,
                            fontFamily: SANS,
                            fontSize: 12,
                            color: palette.EHR_ON_SURFACE,
                            lineHeight: 18,
                        }}
                    >
                        Mọi tra cứu được ghi log audit. Chỉ sử dụng trong tình huống cấp cứu thực tế.
                    </Text>
                </View>

                {/* Input */}
                <FieldLabel>Số CCCD/CMND (9-12 chữ số)</FieldLabel>
                <XStack style={{ gap: 8, marginBottom: 14 }}>
                    <TextInput
                        value={cccdInput}
                        onChangeText={setCccdInput}
                        placeholder="012345678901"
                        placeholderTextColor={palette.EHR_OUTLINE}
                        keyboardType="number-pad"
                        maxLength={12}
                        style={{
                            flex: 1,
                            borderWidth: 0.75,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            borderRadius: 12,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            color: palette.EHR_ON_SURFACE,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            fontFamily: 'monospace',
                            fontSize: 14,
                        }}
                    />
                    <ViButton
                        variant="primary"
                        onPress={handleLookup}
                        loading={loading}
                        leftIcon={<Search size={15} color={palette.EHR_SURFACE} />}
                    >
                        Tra
                    </ViButton>
                </XStack>

                {error ? (
                    <View
                        style={{
                            padding: 12,
                            borderRadius: 12,
                            backgroundColor: `${palette.EHR_DANGER}14`,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_DANGER,
                            marginBottom: 14,
                        }}
                    >
                        <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_DANGER, lineHeight: 18 }}>
                            {error}
                        </Text>
                    </View>
                ) : null}

                {/* Result */}
                {patient ? (
                    <>
                        <ViCard padding={16} style={{ marginBottom: 16 }}>
                            <Text
                                style={{
                                    fontFamily: SERIF,
                                    fontSize: 20,
                                    color: palette.EHR_ON_SURFACE,
                                    letterSpacing: -0.3,
                                }}
                            >
                                {patient.fullName || '(Không có tên)'}
                            </Text>
                            <Text
                                style={{
                                    marginTop: 4,
                                    fontFamily: 'monospace',
                                    fontSize: 11,
                                    color: palette.EHR_TEXT_MUTED,
                                }}
                                numberOfLines={1}
                            >
                                {patient.walletAddress}
                            </Text>

                            <XStack style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                                {patient.bloodType ? (
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 5,
                                            backgroundColor: `${palette.EHR_DANGER}1A`,
                                            paddingHorizontal: 10,
                                            paddingVertical: 5,
                                            borderRadius: 999,
                                        }}
                                    >
                                        <Droplet size={12} color={palette.EHR_DANGER} />
                                        <Text
                                            style={{
                                                fontFamily: 'monospace',
                                                fontSize: 12,
                                                color: palette.EHR_DANGER,
                                                fontWeight: '700',
                                            }}
                                        >
                                            {patient.bloodType}
                                        </Text>
                                    </View>
                                ) : null}
                                {patient.gender ? (
                                    <View
                                        style={{
                                            backgroundColor: `${palette.EHR_TERTIARY}1A`,
                                            paddingHorizontal: 10,
                                            paddingVertical: 5,
                                            borderRadius: 999,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: SANS_SEMI,
                                                fontSize: 12,
                                                color: palette.EHR_TERTIARY,
                                                fontWeight: '700',
                                            }}
                                        >
                                            {patient.gender}
                                        </Text>
                                    </View>
                                ) : null}
                            </XStack>

                            {patient.allergies ? (
                                <View
                                    style={{
                                        marginTop: 14,
                                        padding: 14,
                                        borderRadius: 12,
                                        backgroundColor: `${palette.EHR_DANGER}1A`,
                                        borderWidth: 0.5,
                                        borderColor: `${palette.EHR_DANGER}66`,
                                        flexDirection: 'row',
                                        gap: 10,
                                    }}
                                >
                                    <AlertTriangle size={18} color={palette.EHR_DANGER} style={{ marginTop: 2 }} />
                                    <YStack style={{ flex: 1 }}>
                                        <Text
                                            style={{
                                                fontFamily: SANS_SEMI,
                                                fontSize: 11,
                                                color: palette.EHR_DANGER,
                                                fontWeight: '700',
                                                letterSpacing: 1.2,
                                                textTransform: 'uppercase',
                                            }}
                                        >
                                            Dị ứng — đọc kỹ trước khi điều trị
                                        </Text>
                                        <Text
                                            style={{
                                                marginTop: 4,
                                                fontFamily: SANS_SEMI,
                                                fontSize: 17,
                                                color: palette.EHR_DANGER,
                                                lineHeight: 24,
                                                fontWeight: '600',
                                            }}
                                        >
                                            {patient.allergies}
                                        </Text>
                                    </YStack>
                                </View>
                            ) : null}
                        </ViCard>

                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 18,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                                marginBottom: 8,
                            }}
                        >
                            Người thân tin cậy ({contacts.length})
                        </Text>
                        <View
                            style={{
                                paddingVertical: 10,
                                paddingHorizontal: 14,
                                borderRadius: 12,
                                backgroundColor: palette.EHR_PRIMARY_FIXED,
                                marginBottom: 12,
                                flexDirection: 'row',
                                gap: 8,
                            }}
                        >
                            <Info size={14} color={palette.EHR_PRIMARY} style={{ marginTop: 2 }} />
                            <Text
                                style={{
                                    flex: 1,
                                    fontFamily: SANS,
                                    fontSize: 12,
                                    color: palette.EHR_PRIMARY,
                                    lineHeight: 17,
                                }}
                            >
                                Liên hệ người thân để họ ký uỷ quyền cho bạn truy cập hồ sơ trong app của họ.
                            </Text>
                        </View>

                        {contacts.length === 0 ? (
                            <Text
                                style={{
                                    fontFamily: SANS,
                                    fontSize: 13,
                                    color: palette.EHR_TEXT_MUTED,
                                    padding: 14,
                                    textAlign: 'center',
                                }}
                            >
                                Bệnh nhân chưa có Người thân tin cậy nào. Không thể truy cập hồ sơ trong tình huống này.
                            </Text>
                        ) : (
                            contacts.map((c) => {
                                const tone = emergencyRelationTone(c.label, palette);
                                return (
                                    <View
                                        key={c.contactAddress}
                                        style={{
                                            paddingVertical: 12,
                                            paddingHorizontal: 12,
                                            marginBottom: 8,
                                            borderRadius: 12,
                                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                                            borderWidth: 0.5,
                                            borderColor: palette.EHR_OUTLINE_SOFT,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 10,
                                        }}
                                    >
                                        {/* Cinnabar-tinted heart avatar */}
                                        <View
                                            style={{
                                                width: 40,
                                                height: 40,
                                                borderRadius: 20,
                                                backgroundColor: `${palette.EHR_CINNABAR_DEEP}2E`,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <Heart size={18} color={palette.EHR_CINNABAR_DEEP} fill={palette.EHR_CINNABAR_DEEP} />
                                        </View>
                                        <YStack style={{ flex: 1, minWidth: 0 }}>
                                            <XStack style={{ alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                                                <Text
                                                    style={{
                                                        fontFamily: SANS_SEMI,
                                                        fontSize: 14,
                                                        color: palette.EHR_ON_SURFACE,
                                                        fontWeight: '600',
                                                    }}
                                                    numberOfLines={1}
                                                >
                                                    {c.fullName || truncate(c.contactAddress)}
                                                </Text>
                                                {c.label ? (
                                                    <View
                                                        style={{
                                                            paddingHorizontal: 6,
                                                            paddingVertical: 2,
                                                            borderRadius: 3,
                                                            backgroundColor: `${tone}2E`,
                                                        }}
                                                    >
                                                        <Text
                                                            style={{
                                                                fontSize: 10,
                                                                fontFamily: SANS_SEMI,
                                                                color: tone,
                                                                letterSpacing: 0.3,
                                                                fontWeight: '600',
                                                            }}
                                                        >
                                                            {c.label}
                                                        </Text>
                                                    </View>
                                                ) : null}
                                            </XStack>
                                            <Text
                                                style={{
                                                    marginTop: 2,
                                                    fontFamily: 'monospace',
                                                    fontSize: 10.5,
                                                    color: palette.EHR_TEXT_MUTED,
                                                    letterSpacing: 0.2,
                                                }}
                                                numberOfLines={1}
                                            >
                                                {truncate(c.contactAddress)}
                                            </Text>
                                        </YStack>
                                        {c.phone ? (
                                            <Pressable
                                                onPress={() => callContact(c.phone)}
                                                style={({ pressed }) => ({
                                                    paddingHorizontal: 14,
                                                    paddingVertical: 10,
                                                    borderRadius: 8,
                                                    backgroundColor: palette.EHR_CINNABAR_DEEP,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    opacity: pressed ? 0.85 : 1,
                                                })}
                                            >
                                                <Phone size={13} color="#FAF7F1" />
                                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 12, color: '#FAF7F1', fontWeight: '700' }}>
                                                    Gọi
                                                </Text>
                                            </Pressable>
                                        ) : null}
                                    </View>
                                );
                            })
                        )}
                    </>
                ) : null}
            </ScrollView>
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
                marginBottom: 8,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                fontWeight: '600',
            }}
        >
            {children}
        </Text>
    );
}
