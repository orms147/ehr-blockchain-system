// MfaOnboardingModal — one-time disclosure shown after first login.
//
// Device-level model (2026-06): every patient/doctor signing action requires a
// DEVICE authentication factor (biometric OR the device screen-lock PIN/pattern),
// enforced non-bypassably in utils/biometricGate.requireBiometric. This modal is
// a one-time DISCLOSURE (sinh trắc/khoá thiết bị) + a nudge to set a device lock
// when none exists. It does NOT set an app-level PIN and does NOT offer an
// opt-out — the gate is mandatory.
//
// Legal basis: ký/xác nhận HSBA điện tử bằng sinh trắc học là hình thức hợp lệ
// (TT 13/2025/TT-BYT Đ3); dữ liệu sinh trắc là dữ liệu cá nhân nhạy cảm (Luật
// BVDLCN 91/2025/QH15 + NĐ 356/2025/NĐ-CP) — OS khớp cục bộ, app KHÔNG nhận dữ
// liệu sinh trắc thô nên không phát sinh nghĩa vụ xử lý dữ liệu sinh trắc.

import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Fingerprint, ShieldAlert, Smartphone } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { isMfaOnboarded, setMfaOnboarded } from '../utils/biometricGate';
import { useEhrPalette } from '../constants/uiColors';
import ViButton from '../components-v2/ViButton';

const SERIF = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';

export default function MfaOnboardingModal() {
    const palette = useEhrPalette();
    const [visible, setVisible] = useState(false);
    const [hasDeviceLock, setHasDeviceLock] = useState(true);

    useEffect(() => {
        let mounted = true;
        const check = async () => {
            try {
                const done = await isMfaOnboarded();
                if (done || !mounted) return;
                let level = LocalAuthentication.SecurityLevel.NONE;
                try {
                    level = await LocalAuthentication.getEnrolledLevelAsync();
                } catch {
                    level = LocalAuthentication.SecurityLevel.NONE;
                }
                if (mounted) {
                    setHasDeviceLock(level !== LocalAuthentication.SecurityLevel.NONE);
                    setVisible(true);
                }
            } catch (e) {
                console.warn('[MfaOnboarding] check failed', e);
            }
        };
        check();
        return () => { mounted = false; };
    }, []);

    const finish = async () => {
        try {
            await setMfaOnboarded(true);
        } catch (e) {
            console.warn('[MfaOnboarding] save failed', e);
        }
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={finish}>
            <View style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.78)',
                justifyContent: 'center',
                paddingHorizontal: 22,
            }}>
                <SafeAreaView style={{
                    backgroundColor: palette.EHR_SURFACE,
                    borderRadius: 20,
                    borderWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_VARIANT,
                    maxHeight: '88%',
                }}>
                    <ScrollView contentContainerStyle={{ padding: 24 }}>
                        <YStack style={{ gap: 18 }}>
                            <View style={{ alignItems: 'center', marginBottom: 4 }}>
                                <View style={{
                                    width: 64, height: 64, borderRadius: 32,
                                    backgroundColor: hasDeviceLock ? `${palette.EHR_PRIMARY}1A` : `${palette.EHR_CLAY}1A`,
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {hasDeviceLock
                                        ? <Fingerprint size={32} color={palette.EHR_PRIMARY} />
                                        : <Smartphone size={32} color={palette.EHR_CLAY} />}
                                </View>
                            </View>

                            <Text style={{
                                fontFamily: SERIF, fontSize: 22, color: palette.EHR_ON_SURFACE,
                                textAlign: 'center', letterSpacing: -0.3,
                            }}>
                                {hasDeviceLock ? 'Xác thực khi ký hồ sơ' : 'Hãy đặt khoá màn hình'}
                            </Text>

                            <Text style={{
                                fontFamily: SANS, fontSize: 14, color: palette.EHR_ON_SURFACE_VARIANT,
                                textAlign: 'center', lineHeight: 21,
                            }}>
                                {hasDeviceLock
                                    ? 'Mỗi khi bạn cấp/thu hồi quyền truy cập hồ sơ y tế hoặc tạo hồ sơ, hệ thống yêu cầu vân tay/khuôn mặt hoặc mã PIN khoá màn hình thiết bị để xác nhận chính bạn là người ký.'
                                    : 'Thiết bị của bạn chưa đặt khoá màn hình. Để ký hồ sơ y tế, hãy bật vân tay/khuôn mặt hoặc mã PIN/mật khẩu trong Cài đặt thiết bị.'}
                            </Text>

                            {/* Disclosure — dữ liệu sinh trắc là DLCN nhạy cảm; OS khớp cục bộ. */}
                            <View style={{
                                padding: 14, borderRadius: 12,
                                backgroundColor: palette.EHR_SURFACE_LOWEST,
                                borderWidth: 0.5, borderColor: palette.EHR_OUTLINE_SOFT,
                            }}>
                                <XStack style={{ gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                                    <ShieldAlert size={14} color={palette.EHR_PRIMARY} style={{ marginTop: 1 }} />
                                    <Text style={{
                                        fontFamily: SANS_SEMI, fontSize: 12,
                                        color: palette.EHR_ON_SURFACE, fontWeight: '700',
                                        letterSpacing: 0.4, textTransform: 'uppercase', flex: 1,
                                    }}>
                                        Bảo vệ dữ liệu sinh trắc học
                                    </Text>
                                </XStack>
                                <Text style={{
                                    fontFamily: SANS, fontSize: 12,
                                    color: palette.EHR_ON_SURFACE_VARIANT, lineHeight: 18,
                                }}>
                                    Vân tay/khuôn mặt là <Text style={{ fontWeight: '700', color: palette.EHR_ON_SURFACE }}>dữ liệu cá nhân nhạy cảm</Text> (Luật BVDLCN 91/2025 + NĐ 356/2025). Việc khớp sinh trắc do hệ điều hành thực hiện cục bộ — <Text style={{ fontWeight: '700', color: palette.EHR_ON_SURFACE }}>ứng dụng chỉ nhận tín hiệu đã/chưa xác thực, không nhận hình ảnh vân tay/khuôn mặt</Text>. Sinh trắc học cũng là hình thức ký HSBA điện tử hợp lệ (TT 13/2025/TT-BYT Đ3).
                                </Text>
                            </View>

                            <YStack style={{ gap: 10, marginTop: 6 }}>
                                {hasDeviceLock ? (
                                    <ViButton variant="primary" full size="lg" onPress={finish}>
                                        Đã hiểu
                                    </ViButton>
                                ) : (
                                    <>
                                        <ViButton
                                            variant="primary"
                                            full
                                            size="lg"
                                            onPress={() => {
                                                Linking.openSettings().catch(() => {
                                                    Alert.alert('Không mở được Cài đặt', 'Vui lòng mở Cài đặt thiết bị thủ công.');
                                                });
                                            }}
                                        >
                                            Mở Cài đặt thiết bị
                                        </ViButton>
                                        <Pressable onPress={finish} style={{ paddingVertical: 12, alignItems: 'center' }}>
                                            <Text style={{
                                                fontFamily: SANS_SEMI, fontSize: 13.5,
                                                color: palette.EHR_ON_SURFACE_VARIANT,
                                            }}>
                                                Để sau (sẽ được nhắc lại khi ký)
                                            </Text>
                                        </Pressable>
                                    </>
                                )}
                            </YStack>
                        </YStack>
                    </ScrollView>
                </SafeAreaView>
            </View>
        </Modal>
    );
}
