// RoleSelectionScreen v2 — port of screens/RoleSelectionScreen.tsx.
// First screen after Web3Auth login. Two flows:
//   - registrationMode: user has no roles on-chain → register patient/doctor
//   - selectionMode: user has multiple roles → pick active role
//
// Wiring preserved:
//   - useAuthStore (availableRoles, needsRoleRegistration, completeRoleSelection,
//     refreshAuthSession, logout)
//   - roleRegistrationService.register + exp-backoff poll (1s, 2s, 4s)
//   - Consent modal lists role-specific features before registration
//   - mapRegistrationError for BACKEND_UNREACHABLE / RELAYER_NOT_CONFIGURED

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import {
    ArrowLeft,
    Check,
    ChevronRight,
    HeartPulse,
    ShieldCheck,
    Stethoscope,
    X,
    FileText,
    Lock,
    Share2,
    UserCheck,
    Clock,
    Shield,
} from 'lucide-react-native';

import useAuthStore, { ROLE_CONFIG } from '../store/authStore';
import roleRegistrationService from '../services/roleRegistration.service';
import ViButton from '../components-v2/ViButton';
import ViWordmark from '../components-v2/ViWordmark';
import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const ROLE_CONFIG_MAP = ROLE_CONFIG as Record<string, { label: string; emoji: string }>;
const FALLBACK_ROLE = { label: 'Vai trò', emoji: '👤' };

const REGISTRATION_OPTIONS = [
    {
        role: 'patient',
        label: 'Bệnh nhân',
        description: 'Lưu giữ hồ sơ khám bệnh, đơn thuốc và kết quả xét nghiệm.',
        badge: 'Quyền truy cập cá nhân',
        Icon: HeartPulse,
    },
    {
        role: 'doctor',
        label: 'Bác sĩ',
        description: 'Gửi yêu cầu truy cập hồ sơ bệnh nhân + tạo entry.',
        badge: 'Xác minh chứng chỉ',
        Icon: Stethoscope,
    },
] as const;

const ROLE_FEATURES: Record<string, { title: string; features: { icon: any; text: string }[] }> = {
    patient: {
        title: 'Chức năng dành cho Bệnh nhân',
        features: [
            { icon: FileText, text: 'Tạo và lưu trữ hồ sơ sức khoẻ (khám bệnh, xét nghiệm, đơn thuốc) an toàn trên hệ thống.' },
            { icon: Lock, text: 'Hồ sơ được mã hoá. Chỉ bạn mới có quyền xem — không ai khác, kể cả hệ thống.' },
            { icon: Share2, text: 'Tự quyết định chia sẻ hồ sơ cho bác sĩ. Bạn chọn chia sẻ cho ai, bao lâu, và thu hồi bất cứ lúc nào.' },
            { icon: Clock, text: 'Xem lịch sử ai đã truy cập hồ sơ của bạn và khi nào.' },
            { icon: Shield, text: 'Mọi hành động được ghi lại minh bạch, không thể sửa đổi hay xoá.' },
        ],
    },
    doctor: {
        title: 'Chức năng dành cho Bác sĩ',
        features: [
            { icon: FileText, text: 'Gửi yêu cầu xem hồ sơ sức khoẻ của bệnh nhân. Bệnh nhân sẽ duyệt trước khi bạn xem được.' },
            { icon: UserCheck, text: 'Cần được tổ chức y tế xác minh chứng chỉ hành nghề trước khi đọc hồ sơ.' },
            { icon: Share2, text: 'Thêm kết quả khám, chẩn đoán, đơn thuốc vào hồ sơ bệnh nhân khi đã được cấp quyền truy cập.' },
            { icon: Clock, text: 'Quyền truy cập có thời hạn. Sau khi hết hạn, bạn không còn xem được hồ sơ.' },
            { icon: Shield, text: 'Mọi hành động đều được ghi nhận minh bạch và bệnh nhân có thể kiểm tra bất kỳ lúc nào.' },
        ],
    },
};

function mapRegistrationError(error: any) {
    if (error?.code === 'BACKEND_UNREACHABLE') {
        return 'Không kết nối được backend. Hãy bật backend và kiểm tra EXPO_PUBLIC_API_URL.';
    }
    const raw = String(error?.message || '').toLowerCase();
    if (raw.includes('relayer') && raw.includes('not configured')) {
        return 'Backend chưa cấu hình relayer. Cần thiết lập SPONSOR_PRIVATE_KEY và contract address.';
    }
    if (raw.includes('not authorized') || raw.includes('authorize')) {
        return 'Ví relayer chưa được cấp quyền trên AccessControl. Vui lòng kiểm tra authorizedRelayers.';
    }
    return error?.message || 'Không thể đăng ký role on-chain. Vui lòng thử lại.';
}

export default function RoleSelectionScreen() {
    const palette = useEhrPalette();
    const {
        availableRoles,
        needsRoleRegistration,
        completeRoleSelection,
        refreshAuthSession,
        logout,
    } = useAuthStore();

    const [busyRole, setBusyRole] = useState<string | null>(null);
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const [consentVisible, setConsentVisible] = useState(false);

    const roles = useMemo(() => {
        if (!Array.isArray(availableRoles)) return [];
        return availableRoles.filter(Boolean);
    }, [availableRoles]);

    const registrationMode = needsRoleRegistration || roles.length === 0;

    useEffect(() => {
        if (registrationMode && !selectedRole) {
            setSelectedRole(REGISTRATION_OPTIONS[0].role);
        } else if (!registrationMode && roles.length > 0 && !selectedRole) {
            setSelectedRole(roles[0]);
        }
    }, [registrationMode, roles, selectedRole]);

    const handleSelectRole = async (role: string) => {
        if (busyRole) return;
        setBusyRole(role);
        try {
            await completeRoleSelection(role);
        } finally {
            setBusyRole(null);
        }
    };

    const handleRegisterRole = async (role: 'patient' | 'doctor') => {
        if (busyRole) return;
        setBusyRole(role);
        try {
            await roleRegistrationService.register(role);
            const BACKOFF_DELAYS = [1000, 2000, 4000];
            let synced: any = null;
            for (const delay of BACKOFF_DELAYS) {
                await new Promise((resolve) => setTimeout(resolve, delay));
                synced = await refreshAuthSession();
                if (synced?.roles?.length) break;
            }
            if (!synced?.roles?.length) {
                Alert.alert(
                    'Đang đồng bộ',
                    'Role đã đăng ký on-chain nhưng chưa sync. Hệ thống sẽ tự cập nhật trong vài giây.',
                );
                await completeRoleSelection(role);
                return;
            }
            Alert.alert('Thành công', 'Đăng ký role on-chain thành công.');
        } catch (error: any) {
            Alert.alert('Đăng ký thất bại', mapRegistrationError(error));
        } finally {
            setBusyRole(null);
        }
    };

    const handleContinue = () => {
        if (!selectedRole) return;
        if (registrationMode) {
            setConsentVisible(true);
        } else {
            handleSelectRole(selectedRole);
        }
    };

    const handleConsentConfirm = () => {
        setConsentVisible(false);
        if (selectedRole) handleRegisterRole(selectedRole as 'patient' | 'doctor');
    };

    // Editorial inline-hairline row (RecordRow-style) per design G.7.
    // Replaces the previous "marketing-y" iconboxed card. One-time decision
    // deserves quiet typography, not app-store visual weight.
    const renderRow = (
        role: string,
        label: string,
        description: string,
        _badge: string,
        _Icon: any,
        _tint: string,
        index: number,
    ) => {
        const selected = selectedRole === role;
        const isBusy = busyRole === role;
        return (
            <Pressable
                key={role}
                onPress={() => setSelectedRole(role)}
                disabled={Boolean(busyRole)}
                style={({ pressed }) => ({
                    paddingVertical: 18,
                    paddingHorizontal: 4,
                    borderTopWidth: index === 0 ? 0.5 : 0,
                    borderBottomWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_VARIANT,
                    opacity: pressed ? 0.6 : busyRole && !isBusy ? 0.5 : 1,
                })}
            >
                <XStack style={{ alignItems: 'center', gap: 12 }}>
                    <YStack style={{ flex: 1 }}>
                        <Text
                            style={{
                                fontFamily: SERIF_ITALIC,
                                fontStyle: 'italic',
                                fontSize: 22,
                                color: selected ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE,
                                letterSpacing: -0.3,
                                lineHeight: 26,
                            }}
                        >
                            {label}
                        </Text>
                        <Text
                            style={{
                                marginTop: 4,
                                fontFamily: SANS,
                                fontSize: 12.5,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 18,
                            }}
                        >
                            {description}
                        </Text>
                    </YStack>
                    {selected ? (
                        <View
                            style={{
                                width: 22,
                                height: 22,
                                borderRadius: 11,
                                backgroundColor: palette.EHR_PRIMARY,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Check size={13} color="#FAF7F1" strokeWidth={3} />
                        </View>
                    ) : (
                        <ChevronRight size={18} color={palette.EHR_TEXT_MUTED} />
                    )}
                </XStack>
                {isBusy ? (
                    <View
                        style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundColor: 'rgba(15,20,25,0.6)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 8,
                        }}
                    >
                        <ActivityIndicator size="small" color={palette.EHR_PRIMARY} />
                        <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 13, color: '#FAF7F1' }}>
                            Đang xử lý…
                        </Text>
                    </View>
                ) : null}
            </Pressable>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }}>
            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 30, flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* TopBar */}
                    <XStack
                        style={{
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: 8,
                            paddingBottom: 14,
                        }}
                    >
                        <Pressable
                            onPress={() => {
                                Alert.alert(
                                    'Huỷ đăng ký?',
                                    'Bạn sẽ được đưa về màn hình đăng nhập.',
                                    [
                                        { text: 'Ở lại', style: 'cancel' },
                                        { text: 'Quay lại', style: 'destructive', onPress: () => logout() },
                                    ],
                                );
                            }}
                            style={({ pressed }) => ({
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: pressed ? 0.5 : 1,
                            })}
                            hitSlop={8}
                        >
                            <ArrowLeft size={18} color={palette.EHR_ON_SURFACE_VARIANT} />
                        </Pressable>
                        <ViWordmark size={16} color={palette.EHR_ON_SURFACE_VARIANT} />
                        <View style={{ width: 40 }} />
                    </XStack>

                    {/* Title */}
                    <View style={{ marginTop: 20, marginBottom: 24 }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 32,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.7,
                                lineHeight: 36,
                            }}
                        >
                            Bạn là{' '}
                            <Text
                                style={{
                                    fontFamily: SERIF_ITALIC,
                                    fontStyle: 'italic',
                                    color: palette.EHR_PRIMARY,
                                }}
                            >
                                ai
                            </Text>
                            ?
                        </Text>
                        <Text
                            style={{
                                marginTop: 8,
                                fontFamily: SANS,
                                fontSize: 14,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 21,
                                maxWidth: 320,
                            }}
                        >
                            Chọn vai trò phù hợp để hệ thống hiển thị đúng nội dung cho bạn.
                        </Text>
                    </View>

                    {/* Role cards */}
                    <YStack>
                        {registrationMode
                            ? REGISTRATION_OPTIONS.map((opt, i) =>
                                renderRow(opt.role, opt.label, opt.description, opt.badge, opt.Icon, palette.EHR_PRIMARY, i))
                            : roles.map((role: string, i: number) => {
                                const cfg = ROLE_CONFIG_MAP[role] || FALLBACK_ROLE;
                                const isDoctor = role === 'doctor';
                                const Icon = isDoctor ? Stethoscope : HeartPulse;
                                const tint = isDoctor ? palette.EHR_TERTIARY : palette.EHR_PRIMARY;
                                const badge = isDoctor ? 'Xác minh chứng chỉ' : 'Quyền truy cập cá nhân';
                                return renderRow(
                                    role,
                                    cfg.label,
                                    `Đăng nhập với quyền ${String(cfg.label).toLowerCase()}`,
                                    badge,
                                    Icon,
                                    tint,
                                    i,
                                );
                            })}
                    </YStack>

                    <View style={{ height: 14 }} />

                    {/* CTA */}
                    <ViButton
                        variant="primary"
                        full
                        size="lg"
                        loading={Boolean(busyRole)}
                        disabled={!selectedRole}
                        onPress={handleContinue}
                    >
                        {registrationMode ? 'Tiếp tục đăng ký' : 'Tiếp tục'}
                    </ViButton>

                    <Text
                        style={{
                            marginTop: 14,
                            textAlign: 'center',
                            fontFamily: SANS,
                            fontSize: 11.5,
                            color: palette.EHR_TEXT_MUTED,
                            lineHeight: 17,
                        }}
                    >
                        Bằng cách tiếp tục, bạn đồng ý với{' '}
                        <Text style={{ color: palette.EHR_ON_SURFACE_VARIANT, textDecorationLine: 'underline' }}>
                            Chính sách Bảo mật
                        </Text>{' '}
                        của ViEH.
                    </Text>
                </ScrollView>
            </SafeAreaView>

            {/* Consent modal */}
            <Modal
                visible={consentVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setConsentVisible(false)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
                    <View
                        style={{
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderTopLeftRadius: 24,
                            borderTopRightRadius: 24,
                            padding: 22,
                            paddingBottom: 36,
                            maxHeight: '85%',
                        }}
                    >
                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <XStack style={{ alignItems: 'center', gap: 8 }}>
                                <ShieldCheck size={20} color={palette.EHR_PRIMARY} />
                                <Text
                                    style={{
                                        fontFamily: SERIF,
                                        fontSize: 20,
                                        color: palette.EHR_ON_SURFACE,
                                        letterSpacing: -0.3,
                                    }}
                                >
                                    Xác nhận đăng ký
                                </Text>
                            </XStack>
                            <Pressable onPress={() => setConsentVisible(false)} hitSlop={8}>
                                <X size={18} color={palette.EHR_TEXT_MUTED} />
                            </Pressable>
                        </XStack>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View
                                style={{
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    borderRadius: 12,
                                    backgroundColor: palette.EHR_PRIMARY_FIXED,
                                    marginBottom: 18,
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 13.5,
                                        color: palette.EHR_PRIMARY,
                                        textAlign: 'center',
                                        fontWeight: '700',
                                    }}
                                >
                                    {selectedRole ? ROLE_FEATURES[selectedRole]?.title : ''}
                                </Text>
                            </View>

                            <YStack style={{ gap: 14, marginBottom: 22 }}>
                                {selectedRole && ROLE_FEATURES[selectedRole]?.features.map((feat, idx) => {
                                    const Icon = feat.icon;
                                    return (
                                        <XStack key={idx} style={{ gap: 12, alignItems: 'flex-start' }}>
                                            <View
                                                style={{
                                                    width: 32,
                                                    height: 32,
                                                    borderRadius: 10,
                                                    backgroundColor: palette.EHR_PRIMARY_FIXED,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    marginTop: 2,
                                                }}
                                            >
                                                <Icon size={16} color={palette.EHR_PRIMARY} />
                                            </View>
                                            <Text
                                                style={{
                                                    flex: 1,
                                                    fontFamily: SANS,
                                                    fontSize: 13,
                                                    color: palette.EHR_ON_SURFACE,
                                                    lineHeight: 19,
                                                }}
                                            >
                                                {feat.text}
                                            </Text>
                                        </XStack>
                                    );
                                })}
                            </YStack>

                            <XStack style={{ gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                    <ViButton variant="ghost" full onPress={() => setConsentVisible(false)}>
                                        Huỷ
                                    </ViButton>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <ViButton variant="cinnabar" full onPress={handleConsentConfirm}>
                                        Đồng ý + đăng ký
                                    </ViButton>
                                </View>
                            </XStack>
                            <Text
                                style={{
                                    marginTop: 12,
                                    textAlign: 'center',
                                    fontFamily: SANS,
                                    fontSize: 11,
                                    color: palette.EHR_TEXT_MUTED,
                                    lineHeight: 17,
                                }}
                            >
                                Đăng ký role là một giao dịch on-chain (gas sponsor) — không thể huỷ bỏ.
                            </Text>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

