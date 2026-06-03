// SetupPinModal — đặt PIN 6 chữ số fallback khi không có biometric (§19 R3).
//
// Flow:
//   1. User nhập PIN 6 chữ số (Step 1)
//   2. Nhập lại lần 2 để confirm (Step 2)
//   3. Verify khớp → setupPin() lưu hashed vào SecureStore → callback onSuccess
//   4. Nếu không khớp → reset Step 1 + báo lỗi
//
// Caller mở modal qua prop `visible`, đóng qua callback `onDismiss`.

import React, { useState, useEffect, useRef } from 'react';
import { Alert, Modal, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Lock, X } from 'lucide-react-native';

import { setupPin, validatePinFormat } from '../services/pinService';
import { useEhrPalette } from '../constants/uiColors';
import ViButton from '../components-v2/ViButton';

const SERIF = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

type Props = {
    visible: boolean;
    onDismiss: () => void;
    onSuccess?: () => void;
};

export default function SetupPinModal({ visible, onDismiss, onSuccess }: Props) {
    const palette = useEhrPalette();
    const [step, setStep] = useState<1 | 2>(1);
    const [pin1, setPin1] = useState('');
    const [pin2, setPin2] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const input1Ref = useRef<TextInput>(null);
    const input2Ref = useRef<TextInput>(null);

    useEffect(() => {
        if (visible) {
            setStep(1);
            setPin1('');
            setPin2('');
            setError(null);
            // Focus delay để Modal mount xong
            setTimeout(() => input1Ref.current?.focus(), 250);
        }
    }, [visible]);

    const handleStep1Submit = () => {
        try {
            validatePinFormat(pin1);
            setError(null);
            setStep(2);
            setTimeout(() => input2Ref.current?.focus(), 100);
        } catch (e: any) {
            setError(e?.message || 'PIN không hợp lệ.');
        }
    };

    const handleStep2Submit = async () => {
        if (pin1 !== pin2) {
            setError('PIN nhập lại không khớp. Vui lòng thử lại.');
            setPin2('');
            input2Ref.current?.focus();
            return;
        }
        setError(null);
        setIsSaving(true);
        try {
            await setupPin(pin1);
            Alert.alert(
                'Đã đặt PIN',
                'PIN 6 chữ số đã được lưu an toàn trên thiết bị. Bạn sẽ dùng PIN này khi sinh trắc học không khả dụng.',
                [{ text: 'OK', onPress: () => { onSuccess?.(); onDismiss(); } }],
            );
        } catch (e: any) {
            setError(e?.message || 'Không thể lưu PIN. Vui lòng thử lại.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
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
                    padding: 24,
                }}>
                    {/* Close icon */}
                    <Pressable
                        onPress={onDismiss}
                        hitSlop={10}
                        style={{
                            position: 'absolute',
                            top: 14,
                            right: 14,
                            width: 32, height: 32,
                            borderRadius: 16,
                            alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <X size={18} color={palette.EHR_ON_SURFACE_VARIANT} />
                    </Pressable>

                    <View style={{ alignItems: 'center', marginBottom: 18, marginTop: 4 }}>
                        <View style={{
                            width: 56, height: 56, borderRadius: 28,
                            backgroundColor: `${palette.EHR_PRIMARY}1A`,
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Lock size={28} color={palette.EHR_PRIMARY} />
                        </View>
                    </View>

                    <Text style={{
                        fontFamily: SERIF, fontSize: 22, color: palette.EHR_ON_SURFACE,
                        textAlign: 'center', letterSpacing: -0.3, marginBottom: 8,
                    }}>
                        {step === 1 ? 'Đặt PIN dự phòng' : 'Xác nhận PIN'}
                    </Text>
                    <Text style={{
                        fontFamily: SANS, fontSize: 13.5, color: palette.EHR_ON_SURFACE_VARIANT,
                        textAlign: 'center', lineHeight: 20, marginBottom: 22,
                    }}>
                        {step === 1
                            ? 'Tạo PIN 6 chữ số. Sẽ dùng khi sinh trắc học không khả dụng (vd: thiết bị không có vân tay).'
                            : 'Nhập lại PIN 6 chữ số để xác nhận.'}
                    </Text>

                    {/* PIN input */}
                    <TextInput
                        ref={step === 1 ? input1Ref : input2Ref}
                        value={step === 1 ? pin1 : pin2}
                        onChangeText={(v) => {
                            const digits = v.replace(/\D/g, '').slice(0, 6);
                            if (step === 1) setPin1(digits);
                            else setPin2(digits);
                            setError(null);
                        }}
                        placeholder="••••••"
                        placeholderTextColor={palette.EHR_TEXT_MUTED}
                        keyboardType="number-pad"
                        secureTextEntry
                        maxLength={6}
                        autoFocus
                        style={{
                            borderRadius: 12,
                            borderWidth: 0.5,
                            borderColor: error ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            paddingHorizontal: 18,
                            paddingVertical: 16,
                            color: palette.EHR_ON_SURFACE,
                            fontFamily: MONO,
                            fontSize: 28,
                            letterSpacing: 8,
                            textAlign: 'center',
                        }}
                    />

                    {error ? (
                        <Text style={{
                            marginTop: 10,
                            fontFamily: SANS, fontSize: 12, color: palette.EHR_PRIMARY,
                            textAlign: 'center',
                        }}>
                            {error}
                        </Text>
                    ) : null}

                    <View style={{ marginTop: 22 }}>
                        <ViButton
                            variant="primary"
                            full
                            size="lg"
                            loading={isSaving}
                            disabled={isSaving || (step === 1 ? pin1.length !== 6 : pin2.length !== 6)}
                            onPress={step === 1 ? handleStep1Submit : handleStep2Submit}
                        >
                            {step === 1 ? 'Tiếp tục' : isSaving ? 'Đang lưu…' : 'Xác nhận đặt PIN'}
                        </ViButton>
                    </View>

                    {step === 2 ? (
                        <Pressable
                            onPress={() => { setStep(1); setPin2(''); setError(null); }}
                            style={{ paddingVertical: 12, alignItems: 'center', marginTop: 4 }}
                        >
                            <Text style={{
                                fontFamily: SANS_SEMI, fontSize: 13,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                            }}>
                                Quay lại
                            </Text>
                        </Pressable>
                    ) : null}
                </SafeAreaView>
            </View>
        </Modal>
    );
}
