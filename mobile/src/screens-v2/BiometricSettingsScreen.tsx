// BiometricSettingsScreen v2 — port of .design-bundle/project/screens-extras2.jsx
// BiometricSettingsScreen. Standalone screen reachable from SettingsScreen
// → "Hồ sơ khẩn cấp" tile (or via direct nav). Probes device hardware
// status, exposes the same Switch as Settings + future PIN fallback toggle.
//
// Wiring:
//   - expo-local-authentication probes hasHardwareAsync + isEnrolledAsync
//     + supportedAuthenticationTypesAsync for the status banner
//   - isBiometricSigningEnabled / setBiometricSigningEnabled (utils/biometricGate)
//
// Sections dropped from design until backend support lands:
//   - Trusted devices list (needs device-fingerprint registry)
//   - Recent signing activity (needs AuditLog table for sign events)
// These are visual placeholders in the design only; not feature-critical
// for thesis demo.

import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Fingerprint, ChevronLeft, ScanFace } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useNavigation } from '@react-navigation/native';

import { isBiometricSigningEnabled, setBiometricSigningEnabled, requireBiometric } from '../utils/biometricGate';
import ViButton from '../components-v2/ViButton';
import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

type Support = {
    hasHardware: boolean;
    isEnrolled: boolean;
    types: LocalAuthentication.AuthenticationType[];
};

function describeTypes(types: LocalAuthentication.AuthenticationType[]) {
    const names: string[] = [];
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) names.push('Vân tay');
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) names.push('Khuôn mặt');
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) names.push('Mống mắt');
    return names.length > 0 ? names.join(' · ') : 'Không xác định';
}

export default function BiometricSettingsScreen() {
    const palette = useEhrPalette();
    const navigation = useNavigation<any>();
    const [enabled, setEnabled] = useState(true);
    const [pinFallback, setPinFallback] = useState(true);
    const [support, setSupport] = useState<Support | null>(null);

    useEffect(() => {
        isBiometricSigningEnabled().then(setEnabled).catch(() => setEnabled(true));
        (async () => {
            try {
                const [hasHardware, isEnrolled, types] = await Promise.all([
                    LocalAuthentication.hasHardwareAsync(),
                    LocalAuthentication.isEnrolledAsync(),
                    LocalAuthentication.supportedAuthenticationTypesAsync(),
                ]);
                setSupport({ hasHardware, isEnrolled, types });
            } catch {
                setSupport({ hasHardware: false, isEnrolled: false, types: [] });
            }
        })();
    }, []);

    const handleToggle = async (next: boolean) => {
        setEnabled(next);
        try {
            await setBiometricSigningEnabled(next);
        } catch {
            setEnabled(!next);
            Alert.alert('Lỗi', 'Không lưu được thiết lập. Vui lòng thử lại.');
        }
    };

    const handleTestPrompt = async () => {
        const ok = await requireBiometric('Kiểm tra vân tay');
        if (ok) {
            Alert.alert('Thành công', 'Xác thực sinh trắc học hoạt động bình thường.');
        } else {
            Alert.alert('Đã huỷ', 'Bạn đã huỷ xác thực hoặc thiết bị không phản hồi.');
        }
    };

    const hwReady = support?.hasHardware && support?.isEnrolled;
    const typesLabel = support ? describeTypes(support.types) : '—';
    const hwIcon = support?.types?.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
        ? <ScanFace size={20} color={hwReady ? palette.EHR_TERTIARY : palette.EHR_SLATE} />
        : <Fingerprint size={20} color={hwReady ? palette.EHR_TERTIARY : palette.EHR_SLATE} />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top', 'left', 'right']}>
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
                        Bảo mật sinh trắc học
                    </Text>
                    <Text
                        style={{
                            marginTop: 6,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 19,
                        }}
                    >
                        Yêu cầu vân tay hoặc Face ID mỗi lần ký giao dịch.
                    </Text>
                </View>

                {/* ───────── Device status — mono hero per polish pack §3 A·4
                       ("Thiết bị · iPhone 13 · Face ID · sẵn sàng") with jade
                       dot when ready, slate dot when not enrolled. ───────── */}
                <View style={{ paddingHorizontal: 22, marginBottom: 22 }}>
                    <View
                        style={{
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            borderRadius: 10,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 10,
                        }}
                    >
                        <View
                            style={{
                                width: 7,
                                height: 7,
                                borderRadius: 4,
                                backgroundColor: hwReady ? palette.EHR_TERTIARY : palette.EHR_OUTLINE,
                                flexShrink: 0,
                            }}
                        />
                        <Text
                            style={{
                                flex: 1,
                                fontFamily: MONO,
                                fontSize: 11.5,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: 0.3,
                            }}
                        >
                            {Platform.OS === 'ios' ? 'iOS' : 'Android'} · {typesLabel} ·{' '}
                            <Text style={{ color: hwReady ? palette.EHR_TERTIARY : palette.EHR_TEXT_MUTED }}>
                                {hwReady ? 'sẵn sàng' : support?.hasHardware ? 'chưa cấu hình' : 'không hỗ trợ'}
                            </Text>
                        </Text>
                        <View
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                backgroundColor: hwReady ? `${palette.EHR_TERTIARY}1A` : `${palette.EHR_OUTLINE}1A`,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {hwIcon}
                        </View>
                    </View>
                </View>

                {/* ───────── Main toggle ───────── */}
                <SectionLabel>Sử dụng sinh trắc học</SectionLabel>
                <View style={{ paddingHorizontal: 22, marginBottom: 12 }}>
                    <View style={{ gap: 8 }}>
                        <ToggleRow
                            value={enabled}
                            onChange={handleToggle}
                            title="Yêu cầu vân tay khi ký"
                            sub="Mỗi lần cấp consent, uỷ quyền, tạo hồ sơ sẽ yêu cầu xác thực sinh trắc học."
                        />
                        <ToggleRow
                            value={pinFallback}
                            onChange={setPinFallback}
                            disabled={!enabled}
                            title="Cho phép PIN khi không quét được vân tay"
                            sub="Dùng PIN khoá màn hình của thiết bị, không phải PIN riêng cho app."
                            last
                        />
                    </View>
                    <View
                        style={{
                            marginTop: 10,
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderRadius: 10,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 11.5,
                                color: palette.EHR_TEXT_MUTED,
                                lineHeight: 18,
                            }}
                        >
                            <Text style={{ fontFamily: SANS_SEMI, color: palette.EHR_ON_SURFACE_VARIANT, fontWeight: '600' }}>
                                TT 13/2025/TT-BYT ·{' '}
                            </Text>
                            công nhận chữ ký sinh trắc học là chữ ký pháp lý đối với hồ sơ y tế điện tử.
                        </Text>
                    </View>
                </View>

                {/* ───────── Test prompt ───────── */}
                <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
                    <ViButton variant="ghost" full onPress={handleTestPrompt} disabled={!hwReady}>
                        Thử xác thực ngay
                    </ViButton>
                    <Text
                        style={{
                            marginTop: 8,
                            textAlign: 'center',
                            fontFamily: SANS,
                            fontSize: 11,
                            color: palette.EHR_TEXT_MUTED,
                            lineHeight: 16,
                        }}
                    >
                        Kiểm tra xem prompt vân tay/Face ID hiện đúng và hoạt động.
                    </Text>
                </View>

                {/* Footer note */}
                <Text
                    style={{
                        marginTop: 28,
                        textAlign: 'center',
                        fontFamily: SANS,
                        fontSize: 11,
                        color: palette.EHR_TEXT_MUTED,
                        letterSpacing: 0.4,
                    }}
                >
                    expo-local-authentication · Web3Auth ECDSA underneath
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

// ToggleRow — custom switch per polish pack §3 A·4.
// Off: track borderSoft, knob textMuted. On: track cinnabar, knob paperInk
// (shifts right; spring 220ms via native Pressable transition). Each row is
// its own pill card (surface-lowest bg) — no shared container chrome.
function ToggleRow({
    value,
    onChange,
    title,
    sub,
    disabled,
    last,
}: {
    value: boolean;
    onChange: (next: boolean) => void;
    title: string;
    sub?: string;
    disabled?: boolean;
    last?: boolean;
}) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: 10,
                backgroundColor: palette.EHR_SURFACE_LOWEST,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                opacity: disabled ? 0.5 : 1,
            }}
        >
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                    style={{
                        fontFamily: SANS_SEMI,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE,
                        fontWeight: '600',
                    }}
                >
                    {title}
                </Text>
                {sub ? (
                    <Text
                        style={{
                            marginTop: 3,
                            fontFamily: SANS,
                            fontSize: 11,
                            color: palette.EHR_TEXT_MUTED,
                            lineHeight: 15,
                        }}
                    >
                        {sub}
                    </Text>
                ) : null}
            </View>
            <Pressable
                onPress={() => !disabled && onChange(!value)}
                disabled={disabled}
                style={{
                    width: 38,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: value ? palette.EHR_CINNABAR_DEEP : 'transparent',
                    borderWidth: value ? 0 : 0.5,
                    borderColor: palette.EHR_OUTLINE,
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                <View
                    style={{
                        position: 'absolute',
                        top: 2,
                        left: value ? 18 : 2,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: value ? palette.EHR_SURFACE : palette.EHR_TEXT_MUTED,
                    }}
                />
            </Pressable>
        </View>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                paddingHorizontal: 22,
                paddingTop: 18,
                paddingBottom: 10,
                borderTopWidth: 0.5,
                borderTopColor: palette.EHR_OUTLINE_SOFT,
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
        </View>
    );
}

