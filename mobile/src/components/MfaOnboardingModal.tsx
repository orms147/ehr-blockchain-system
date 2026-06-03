// MfaOnboardingModal — hiển thị 1 lần sau login đầu tiên (§19 R4 fix 2026-06-03).
//
// Mục đích: tuân thủ Nghị định 13/2023/NĐ-CP Điều 11.8 (BUỘC thông báo khi xử lý
// dữ liệu cá nhân nhạy cảm — bao gồm sinh trắc học) trước khi user bật biometric
// MFA. Cũng dispatch 3 case theo research biometric-research.md mục 4.3:
//   - Case A: no hardware → notice "sẽ dùng PIN" + dismiss
//   - Case B: hardware nhưng chưa enrolled → guide vào Cài đặt + dismiss
//   - Case C: hardware + enrolled → disclosure + bật MFA / để sau

import React, { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Fingerprint, Shield, ShieldAlert, Smartphone } from 'lucide-react-native';

import {
    getBiometricStatus,
    isMfaOnboarded,
    setMfaOnboarded,
    setBiometricSigningEnabled,
} from '../utils/biometricGate';
import { useEhrPalette } from '../constants/uiColors';
import ViButton from '../components-v2/ViButton';
import SetupPinModal from './SetupPinModal';

const SERIF = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';

type Case = 'A_no_hardware' | 'B_not_enrolled' | 'C_ready';

export default function MfaOnboardingModal() {
    const palette = useEhrPalette();
    const [visible, setVisible] = useState(false);
    const [mfaCase, setMfaCase] = useState<Case | null>(null);
    const [pinSetupOpen, setPinSetupOpen] = useState(false);

    useEffect(() => {
        let mounted = true;
        const check = async () => {
            try {
                const done = await isMfaOnboarded();
                if (done || !mounted) return;
                const status = await getBiometricStatus();
                let c: Case;
                if (!status.hasHardware) c = 'A_no_hardware';
                else if (!status.isEnrolled) c = 'B_not_enrolled';
                else c = 'C_ready';
                if (mounted) {
                    setMfaCase(c);
                    setVisible(true);
                }
            } catch (e) {
                console.warn('[MfaOnboarding] check failed', e);
            }
        };
        check();
        return () => { mounted = false; };
    }, []);

    const finish = async (enableBiometric: boolean) => {
        try {
            await setBiometricSigningEnabled(enableBiometric);
            await setMfaOnboarded(true);
        } catch (e) {
            console.warn('[MfaOnboarding] save failed', e);
        }
        setVisible(false);
    };

    if (!visible || !mfaCase) return null;

    return (
        <>
            <Modal visible={visible} transparent animationType="fade" onRequestClose={() => finish(false)}>
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
                            {mfaCase === 'C_ready' && <ReadyContent palette={palette} onFinish={finish} />}
                            {mfaCase === 'B_not_enrolled' && (
                                <NotEnrolledContent
                                    palette={palette}
                                    onFinish={finish}
                                    onSetupPin={() => setPinSetupOpen(true)}
                                />
                            )}
                            {mfaCase === 'A_no_hardware' && (
                                <NoHardwareContent
                                    palette={palette}
                                    onFinish={finish}
                                    onSetupPin={() => setPinSetupOpen(true)}
                                />
                            )}
                        </ScrollView>
                    </SafeAreaView>
                </View>
            </Modal>

            <SetupPinModal
                visible={pinSetupOpen}
                onDismiss={() => setPinSetupOpen(false)}
                onSuccess={() => { setPinSetupOpen(false); finish(false); }}
            />
        </>
    );
}

// ============================================================
// Case C — Hardware + Enrolled. Disclosure NĐ 13/2023 + bật MFA.
// ============================================================
function ReadyContent({ palette, onFinish }: any) {
    return (
        <YStack style={{ gap: 18 }}>
            <View style={{ alignItems: 'center', marginBottom: 4 }}>
                <View style={{
                    width: 64, height: 64, borderRadius: 32,
                    backgroundColor: `${palette.EHR_PRIMARY}1A`,
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <Fingerprint size={32} color={palette.EHR_PRIMARY} />
                </View>
            </View>

            <Text style={{
                fontFamily: SERIF, fontSize: 22, color: palette.EHR_ON_SURFACE,
                textAlign: 'center', letterSpacing: -0.3,
            }}>
                Bật xác thực sinh trắc học
            </Text>

            <Text style={{
                fontFamily: SANS, fontSize: 14, color: palette.EHR_ON_SURFACE_VARIANT,
                textAlign: 'center', lineHeight: 21,
            }}>
                Mỗi khi bạn cấp quyền truy cập hồ sơ y tế hoặc thu hồi quyền của bác sĩ, hệ thống sẽ yêu cầu vân tay hoặc khuôn mặt để xác nhận chính bạn là người ra quyết định.
            </Text>

            {/* Disclosure NĐ 13/2023 Điều 11.8 — BUỘC */}
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
                        Thông báo theo Nghị định 13/2023/NĐ-CP
                    </Text>
                </XStack>
                <Text style={{
                    fontFamily: SANS, fontSize: 12,
                    color: palette.EHR_ON_SURFACE_VARIANT, lineHeight: 18,
                }}>
                    Vân tay và khuôn mặt là <Text style={{ fontWeight: '700', color: palette.EHR_ON_SURFACE }}>dữ liệu cá nhân nhạy cảm</Text> theo Điều 2 khoản 4 điểm đ. Dữ liệu sinh trắc học không rời khỏi thiết bị của bạn — hệ thống chỉ nhận tín hiệu đã/chưa xác thực, không nhận hình ảnh vân tay hay khuôn mặt.
                </Text>
            </View>

            <YStack style={{ gap: 10, marginTop: 6 }}>
                <ViButton variant="primary" full size="lg" onPress={() => onFinish(true)}>
                    Bật xác thực sinh trắc học
                </ViButton>
                <Pressable onPress={() => onFinish(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{
                        fontFamily: SANS_SEMI, fontSize: 13.5,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                    }}>
                        Để sau (có thể bật trong Cài đặt)
                    </Text>
                </Pressable>
            </YStack>
        </YStack>
    );
}

// ============================================================
// Case B — Hardware có nhưng chưa enrolled vân tay/face id.
// ============================================================
function NotEnrolledContent({ palette, onFinish, onSetupPin }: any) {
    return (
        <YStack style={{ gap: 18 }}>
            <View style={{ alignItems: 'center', marginBottom: 4 }}>
                <View style={{
                    width: 64, height: 64, borderRadius: 32,
                    backgroundColor: `${palette.EHR_CLAY}1A`,
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <Smartphone size={32} color={palette.EHR_CLAY} />
                </View>
            </View>

            <Text style={{
                fontFamily: SERIF, fontSize: 22, color: palette.EHR_ON_SURFACE,
                textAlign: 'center', letterSpacing: -0.3,
            }}>
                Thiết bị chưa thiết lập vân tay
            </Text>

            <Text style={{
                fontFamily: SANS, fontSize: 14, color: palette.EHR_ON_SURFACE_VARIANT,
                textAlign: 'center', lineHeight: 21,
            }}>
                Điện thoại của bạn hỗ trợ vân tay / Face ID nhưng chưa được thiết lập. Vào{' '}
                <Text style={{ fontWeight: '700', color: palette.EHR_ON_SURFACE }}>Cài đặt → Bảo mật → Sinh trắc học</Text>
                {' '}để đăng ký, sau đó quay lại app và bật xác thực trong Cài đặt ViEH.
            </Text>

            <YStack style={{ gap: 10, marginTop: 6 }}>
                <ViButton
                    variant="primary"
                    full
                    size="lg"
                    onPress={() => {
                        Linking.openSettings().catch(() => {
                            Alert.alert('Không mở được Cài đặt', 'Vui lòng mở Cài đặt thủ công.');
                        });
                    }}
                >
                    Mở Cài đặt thiết bị
                </ViButton>
                <Pressable onPress={onSetupPin} style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{
                        fontFamily: SANS_SEMI, fontSize: 13.5,
                        color: palette.EHR_PRIMARY,
                    }}>
                        Đặt PIN 6 số làm dự phòng
                    </Text>
                </Pressable>
                <Pressable onPress={() => onFinish(false)} style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <Text style={{
                        fontFamily: SANS_SEMI, fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                    }}>
                        Để sau
                    </Text>
                </Pressable>
            </YStack>
        </YStack>
    );
}

// ============================================================
// Case A — Thiết bị không có hardware sinh trắc học.
// ============================================================
function NoHardwareContent({ palette, onFinish, onSetupPin }: any) {
    return (
        <YStack style={{ gap: 18 }}>
            <View style={{ alignItems: 'center', marginBottom: 4 }}>
                <View style={{
                    width: 64, height: 64, borderRadius: 32,
                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                    borderWidth: 0.5, borderColor: palette.EHR_OUTLINE_SOFT,
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <Shield size={32} color={palette.EHR_ON_SURFACE_VARIANT} />
                </View>
            </View>

            <Text style={{
                fontFamily: SERIF, fontSize: 22, color: palette.EHR_ON_SURFACE,
                textAlign: 'center', letterSpacing: -0.3,
            }}>
                Thiết bị không hỗ trợ sinh trắc học
            </Text>

            <Text style={{
                fontFamily: SANS, fontSize: 14, color: palette.EHR_ON_SURFACE_VARIANT,
                textAlign: 'center', lineHeight: 21,
            }}>
                Ứng dụng sẽ dùng mã PIN 6 chữ số để bảo vệ các thao tác ký xác nhận hồ sơ y tế. Bạn có thể tạo PIN trong Cài đặt → Bảo mật của ứng dụng.
            </Text>

            <YStack style={{ gap: 10, marginTop: 6 }}>
                <ViButton variant="primary" full size="lg" onPress={onSetupPin}>
                    Đặt PIN 6 số ngay
                </ViButton>
                <Pressable onPress={() => onFinish(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{
                        fontFamily: SANS_SEMI, fontSize: 13.5,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                    }}>
                        Để sau (đặt qua Cài đặt)
                    </Text>
                </Pressable>
            </YStack>
        </YStack>
    );
}
