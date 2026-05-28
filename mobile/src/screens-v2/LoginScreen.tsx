// LoginScreen v2 — port of screens/LoginScreen.tsx with the editorial
// .design-bundle/project/screens-auth.jsx LandingScreen visual treatment.
// THIS IS THE FIRST IMPRESSION — keep it clean, ink-paper, cinnabar reserved
// for the primary CTA only.
//
// ALL Web3Auth wiring preserved bit-for-bit:
//   - 7 providers (google / apple / twitter / facebook / discord +
//     email_passwordless + sms_passwordless)
//   - promptForLoginHint cross-platform modal (sms REQUIRES login_hint;
//     auto-converts 0xxx → +84xxx for VN)
//   - runAuthStepWithRetry around ping/getNonce/login (handles transient
//     network errors)
//   - Sentry breadcrumb on Web3Auth failure with provider + errorCode
//   - getOrCreateEncryptionKeypair + registerEncryptionKey post-login
//   - Biometric quick-login (LocalAuthentication.hasHardwareAsync probe)
//   - Expo Go OAuth limitation alert with email fallback
//   - deriveRolesFromUser → useAuthStore.login

import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'tamagui';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { FontAwesome6 } from '@expo/vector-icons';
import { ArrowLeft, ChevronRight, Fingerprint, Mail, MessageSquareText } from 'lucide-react-native';

import useAuthStore from '../store/authStore';
import authService from '../services/auth.service';
import walletActionService from '../services/walletAction.service';
import { getOrCreateEncryptionKeypair } from '../services/nacl-crypto';
import { deriveRolesFromUser } from '../utils/authRoles';
import { friendlyProviderError } from '../utils/friendlyError';
import { Sentry } from '../lib/sentry';
import ViWordmark from '../components-v2/ViWordmark';
import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const isExpoGo = Constants.appOwnership === 'expo';
const OAUTH_SOCIAL_PROVIDERS = new Set(['google', 'apple', 'twitter', 'facebook', 'discord']);

type ProviderKey =
    | 'google'
    | 'apple'
    | 'twitter'
    | 'facebook'
    | 'discord'
    | 'email_passwordless'
    | 'sms_passwordless';

const TOP_SOCIAL: Array<{ key: ProviderKey; icon: string; label: string }> = [
    { key: 'google', icon: 'google', label: 'Google' },
    { key: 'twitter', icon: 'x-twitter', label: 'X' },
    { key: 'facebook', icon: 'facebook-f', label: 'Facebook' },
    { key: 'apple', icon: 'apple', label: 'Apple' },
];

const MORE_SOCIAL: Array<{ key: ProviderKey; icon: string; label: string }> = [
    { key: 'discord', icon: 'discord', label: 'Discord' },
];

export default function LoginScreen({ navigation }: any) {
    const palette = useEhrPalette();
    const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('google');
    const [loading, setLoading] = useState(false);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const { login } = useAuthStore();

    useEffect(() => {
        (async () => {
            try {
                const compatible = await LocalAuthentication.hasHardwareAsync();
                setIsBiometricSupported(compatible);
            } catch {
                setIsBiometricSupported(false);
            }
        })();
    }, []);

    const shouldRetryAuthStep = (error: any) => {
        if (!error) return false;
        if (error?.code === 'BACKEND_UNREACHABLE') return true;
        const status = Number(error?.status || 0);
        if (status >= 500) return true;
        const raw = String(error?.message || '').toLowerCase();
        return (
            raw.includes('qua thoi gian') ||
            raw.includes('timeout') ||
            raw.includes('timed out') ||
            raw.includes('failed to fetch') ||
            raw.includes('network')
        );
    };

    const runAuthStepWithRetry = async <T,>(task: () => Promise<T>, retries = 1): Promise<T> => {
        let lastError: any = null;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
                return await task();
            } catch (error: any) {
                lastError = error;
                const canRetry = attempt < retries && shouldRetryAuthStep(error);
                if (!canRetry) break;
                await new Promise((resolve) => setTimeout(resolve, 400));
            }
        }
        throw lastError;
    };

    const [hintModalProvider, setHintModalProvider] = useState<ProviderKey | null>(null);
    const [hintInput, setHintInput] = useState('');
    const hintResolverRef = useRef<((value: string | null) => void) | null>(null);

    const promptForLoginHint = (provider: ProviderKey): Promise<string | null> => {
        return new Promise((resolve) => {
            hintResolverRef.current = resolve;
            setHintInput('');
            setHintModalProvider(provider);
        });
    };

    const closeHintModal = (value: string | null) => {
        const resolver = hintResolverRef.current;
        hintResolverRef.current = null;
        setHintModalProvider(null);
        setHintInput('');
        resolver?.(value);
    };

    const handleHintConfirm = () => {
        const provider = hintModalProvider;
        const raw = hintInput.trim();
        if (!provider || !raw) {
            closeHintModal(null);
            return;
        }
        if (provider === 'sms_passwordless') {
            let phone = raw.replace(/[\s-]/g, '');
            if (/^0\d{8,10}$/.test(phone)) phone = '+84' + phone.slice(1);
            if (!/^\+\d{8,15}$/.test(phone)) {
                Alert.alert('Số điện thoại không hợp lệ', 'Hãy nhập theo định dạng quốc tế, ví dụ +84901234567.');
                return;
            }
            closeHintModal(phone);
        } else {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
                Alert.alert('Email không hợp lệ', 'Hãy nhập email đúng định dạng.');
                return;
            }
            closeHintModal(raw);
        }
    };

    const handleWeb3Login = async (providerKey?: ProviderKey) => {
        const providerToUse = providerKey || selectedProvider;

        if (isExpoGo && OAUTH_SOCIAL_PROVIDERS.has(providerToUse)) {
            Alert.alert(
                'Expo Go limitation',
                `"${providerToUse}" OAuth không hoạt động trong Expo Go vì Google/Apple chặn URL exp://\n\nHãy thử:\n- Email OTP (hoạt động trong Expo Go)\n- Build dev client: npx expo run:android`,
                [
                    { text: 'Dùng Email OTP', onPress: () => handleWeb3Login('email_passwordless') },
                    { text: 'Đóng', style: 'cancel' },
                ],
            );
            return;
        }

        let loginHint: string | undefined;
        if (providerToUse === 'sms_passwordless' || providerToUse === 'email_passwordless') {
            const hint = await promptForLoginHint(providerToUse);
            if (!hint) return;
            loginHint = hint;
        }

        try {
            setLoading(true);
            setSelectedProvider(providerToUse);

            await walletActionService.ensureWeb3AuthReady();
            const { walletClient, address } = await walletActionService.loginWithWeb3Auth(
                providerToUse,
                loginHint ? { loginHint } : undefined,
            );

            await runAuthStepWithRetry(() => authService.ping(), 1);
            const nonceRes = await runAuthStepWithRetry(() => authService.getNonce(address), 1);
            const message = nonceRes?.message;
            if (!message) throw new Error('Không lấy được nonce từ backend.');

            const signature = await walletActionService.signMessage(walletClient, message);
            const loginResult = await runAuthStepWithRetry(
                () => authService.login(address, message, signature),
                1,
            );

            if (!loginResult?.token) {
                throw new Error('Backend không trả về token đăng nhập hợp lệ.');
            }

            const availableRoles = deriveRolesFromUser(loginResult.user);
            await login(loginResult.token, loginResult.user, availableRoles);

            try {
                const keypair = await getOrCreateEncryptionKeypair(walletClient, address);
                const regMessage = `Register EHR encryption key: ${keypair.publicKey.substring(0, 20)}`;
                const regSignature = await walletActionService.signMessage(walletClient, regMessage);
                await authService.registerEncryptionKey(keypair.publicKey, regSignature, regMessage);
            } catch (keyErr) {
                console.warn('[Login] Failed to register encryption public key:', keyErr);
            }
        } catch (error: any) {
            const raw = String(error?.message || '').toLowerCase();
            const isAbandoned =
                raw.includes('dismiss') ||
                raw.includes('user closed') ||
                raw.includes('user cancel') ||
                raw.includes('user denied') ||
                raw.includes('cancelled') ||
                raw.includes('canceled') ||
                raw.includes('quá thời gian') ||
                raw.includes('timeout') ||
                raw.includes('timed out');
            if (isAbandoned) {
                const isTimeout = raw.includes('quá thời gian') || raw.includes('timeout') || raw.includes('timed out');
                if (isTimeout) {
                    console.warn('[Login] Abandoned (timeout):', error?.message || error);
                    Alert.alert(
                        'Hết phiên đăng nhập',
                        'Bạn chưa hoàn thành xác nhận trên trình duyệt. Hãy thử đăng nhập lại khi sẵn sàng.',
                    );
                }
                return;
            }
            console.error('Web3Auth Login error:', error);
            try {
                Sentry.addBreadcrumb({
                    category: 'auth',
                    level: 'error',
                    message: 'Web3Auth login failed',
                    data: {
                        provider: providerToUse,
                        errorCode: error?.code,
                        message: String(error?.message || '').slice(0, 200),
                    },
                });
                Sentry.captureException(error);
            } catch {}
            let message: string;
            if (error?.code === 'BACKEND_UNREACHABLE') {
                message = 'Không kết nối được hệ thống. Vui lòng kiểm tra mạng và thử lại.';
            } else if (raw.includes('cannot connect to expo cli') || raw.includes('could not load bundle')) {
                message = 'Ứng dụng không kết nối được Metro. Hãy chạy expo start và thử lại.';
            } else {
                // friendlyProviderError map OAuth codes sang VN (user feedback A6).
                message = friendlyProviderError(error, providerToUse);
            }
            Alert.alert('Đăng nhập thất bại', message);
        } finally {
            setLoading(false);
        }
    };

    const handleBiometricAuth = async () => {
        try {
            const biometricAuth = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Xác thực sinh trắc học',
                fallbackLabel: 'Sử dụng mật khẩu',
            });
            if (biometricAuth.success) await handleWeb3Login();
        } catch (error) {
            console.error(error);
        }
    };

    const renderSocialIcon = (item: { key: ProviderKey; icon: string; label: string }) => {
        const isLoading = loading && selectedProvider === item.key;
        return (
            <Pressable
                key={item.key}
                onPress={() => handleWeb3Login(item.key)}
                disabled={loading}
                style={({ pressed }) => ({
                    width: 52,
                    height: 52,
                    borderRadius: 14,
                    borderWidth: 0.75,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                })}
            >
                {isLoading ? (
                    <ActivityIndicator size="small" color={palette.EHR_PRIMARY} />
                ) : (
                    <FontAwesome6 name={item.icon as any} size={20} color={palette.EHR_ON_SURFACE} />
                )}
            </Pressable>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }}>
            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingBottom: 30 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* TopBar */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: 8,
                            paddingBottom: 14,
                        }}
                    >
                        <Pressable
                            onPress={() => navigation.goBack()}
                            disabled={loading}
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
                    </View>

                    {/* Hero serif greeting */}
                    <View style={{ marginTop: 20, marginBottom: 28 }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 34,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.8,
                                lineHeight: 38,
                            }}
                        >
                            Đăng nhập
                        </Text>
                        <Text
                            style={{
                                marginTop: 4,
                                fontFamily: SERIF_ITALIC,
                                fontStyle: 'italic',
                                fontSize: 34,
                                color: palette.EHR_PRIMARY,
                                letterSpacing: -0.8,
                                lineHeight: 38,
                            }}
                        >
                            an toàn.
                        </Text>
                        <Text
                            style={{
                                marginTop: 10,
                                fontFamily: SANS,
                                fontSize: 14,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 21,
                                maxWidth: 320,
                            }}
                        >
                            Hệ thống không lưu mật khẩu. Dữ liệu của bạn được bảo mật bằng mã hoá đầu-cuối.
                        </Text>
                    </View>

                    {/* Social row */}
                    <FieldLabel>Đăng nhập bằng tài khoản</FieldLabel>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 10 }}>
                        {TOP_SOCIAL.map(renderSocialIcon)}
                        <Pressable
                            onPress={() => setShowMore((s) => !s)}
                            disabled={loading}
                            style={({ pressed }) => ({
                                width: 52,
                                height: 52,
                                borderRadius: 14,
                                borderWidth: 0.75,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                backgroundColor: palette.EHR_SURFACE_LOWEST,
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 18,
                                    color: palette.EHR_ON_SURFACE_VARIANT,
                                    fontWeight: '700',
                                }}
                            >
                                •••
                            </Text>
                        </Pressable>
                    </View>

                    {showMore ? (
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                            {MORE_SOCIAL.map(renderSocialIcon)}
                        </View>
                    ) : null}

                    {/* Divider */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginVertical: 22,
                            gap: 10,
                        }}
                    >
                        <View style={{ flex: 1, height: 0.5, backgroundColor: palette.EHR_OUTLINE_SOFT }} />
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 10,
                                color: palette.EHR_TEXT_MUTED,
                                letterSpacing: 1.2,
                                fontWeight: '700',
                            }}
                        >
                            HOẶC
                        </Text>
                        <View style={{ flex: 1, height: 0.5, backgroundColor: palette.EHR_OUTLINE_SOFT }} />
                    </View>

                    {/* Email + Phone passwordless */}
                    <FieldLabel>Mã xác thực một lần</FieldLabel>
                    <View style={{ marginTop: 10, gap: 8 }}>
                        <PasswordlessRow
                            icon={<Mail size={18} color={palette.EHR_PRIMARY} />}
                            title="Dùng Email"
                            subtitle="Nhận mã OTP qua email"
                            badge="Khuyên dùng"
                            loading={loading && selectedProvider === 'email_passwordless'}
                            disabled={loading}
                            onPress={() => handleWeb3Login('email_passwordless')}
                        />
                        <PasswordlessRow
                            icon={<MessageSquareText size={18} color={palette.EHR_PRIMARY} />}
                            title="Dùng số điện thoại"
                            subtitle="Nhận mã OTP qua SMS"
                            loading={loading && selectedProvider === 'sms_passwordless'}
                            disabled={loading}
                            onPress={() => handleWeb3Login('sms_passwordless')}
                        />
                    </View>

                    {/* Biometric quick-login */}
                    {isBiometricSupported ? (
                        <Pressable
                            onPress={handleBiometricAuth}
                            disabled={loading}
                            style={({ pressed }) => ({
                                marginTop: 22,
                                alignSelf: 'center',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                opacity: pressed ? 0.5 : 1,
                            })}
                        >
                            <Fingerprint size={16} color={palette.EHR_PRIMARY} />
                            <Text
                                style={{
                                    fontFamily: SANS_MEDIUM,
                                    fontSize: 13,
                                    color: palette.EHR_PRIMARY,
                                    fontWeight: '600',
                                }}
                            >
                                Sinh trắc học (đăng nhập nhanh)
                            </Text>
                        </Pressable>
                    ) : null}

                    {/* Footer trust line */}
                    <View
                        style={{
                            marginTop: 26,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                        }}
                    >
                        <View style={{ width: 14, height: 0.5, backgroundColor: palette.EHR_OUTLINE_SOFT }} />
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 10.5,
                                color: palette.EHR_TEXT_MUTED,
                                letterSpacing: 1.2,
                                textTransform: 'uppercase',
                                fontWeight: '600',
                            }}
                        >
                            ViEH · Bảo mật phân quyền
                        </Text>
                        <View style={{ width: 14, height: 0.5, backgroundColor: palette.EHR_OUTLINE_SOFT }} />
                    </View>
                </ScrollView>
            </SafeAreaView>

            {/* Hint modal (cross-platform Alert.prompt replacement) */}
            <Modal
                visible={hintModalProvider !== null}
                transparent
                animationType="fade"
                onRequestClose={() => closeHintModal(null)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', paddingHorizontal: 24 }}
                >
                    <View style={{ backgroundColor: palette.EHR_SURFACE_LOWEST, borderRadius: 20, padding: 22 }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 20,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                                marginBottom: 6,
                            }}
                        >
                            {hintModalProvider === 'sms_passwordless'
                                ? 'Đăng nhập bằng số điện thoại'
                                : 'Đăng nhập bằng email'}
                        </Text>
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 19,
                                marginBottom: 14,
                            }}
                        >
                            {hintModalProvider === 'sms_passwordless'
                                ? 'Nhập số theo định dạng quốc tế (0xxx tự đổi thành +84xxx).'
                                : 'Mã xác thực sẽ được gửi đến email này.'}
                        </Text>
                        <TextInput
                            style={{ borderWidth: 0.75, borderColor: palette.EHR_OUTLINE_SOFT, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontFamily: 'monospace', fontSize: 14, color: palette.EHR_ON_SURFACE, backgroundColor: palette.EHR_SURFACE }}
                            value={hintInput}
                            onChangeText={setHintInput}
                            keyboardType={hintModalProvider === 'sms_passwordless' ? 'phone-pad' : 'email-address'}
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholder={hintModalProvider === 'sms_passwordless' ? '+84901234567' : 'name@example.com'}
                            placeholderTextColor={palette.EHR_OUTLINE}
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                            <Pressable
                                onPress={() => closeHintModal(null)}
                                style={({ pressed }) => ({
                                    flex: 1,
                                    paddingVertical: 13,
                                    borderRadius: 12,
                                    borderWidth: 0.75,
                                    borderColor: palette.EHR_OUTLINE_VARIANT,
                                    alignItems: 'center',
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 14, color: palette.EHR_ON_SURFACE_VARIANT }}>
                                    Huỷ
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handleHintConfirm}
                                style={({ pressed }) => ({
                                    flex: 1,
                                    paddingVertical: 13,
                                    borderRadius: 12,
                                    backgroundColor: palette.EHR_ON_SURFACE,
                                    alignItems: 'center',
                                    opacity: pressed ? 0.85 : 1,
                                })}
                            >
                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 14, color: palette.EHR_SURFACE, fontWeight: '600' }}>
                                    Tiếp tục
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    const palette = useEhrPalette();
    return (
        <Text
            style={{
                fontFamily: SANS_SEMI,
                fontSize: 11,
                color: palette.EHR_TEXT_MUTED,
                letterSpacing: 1,
                textTransform: 'uppercase',
                fontWeight: '600',
            }}
        >
            {children}
        </Text>
    );
}

function PasswordlessRow({
    icon,
    title,
    subtitle,
    badge,
    loading,
    disabled,
    onPress,
}: {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    badge?: string;
    loading: boolean;
    disabled: boolean;
    onPress: () => void;
}) {
    const palette = useEhrPalette();
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: palette.EHR_SURFACE_LOWEST,
                borderWidth: 0.75,
                borderColor: palette.EHR_OUTLINE_SOFT,
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <View
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: `${palette.EHR_PRIMARY}1A`,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {icon}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 14, color: palette.EHR_ON_SURFACE, fontWeight: '500' }}>
                    {title}
                </Text>
                <Text style={{ marginTop: 2, fontFamily: SANS, fontSize: 11.5, color: palette.EHR_TEXT_MUTED }}>
                    {subtitle}
                </Text>
            </View>
            {loading ? (
                <ActivityIndicator size="small" color={palette.EHR_PRIMARY} />
            ) : badge ? (
                <View
                    style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: `${palette.EHR_PRIMARY}1A`,
                    }}
                >
                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 10, color: palette.EHR_PRIMARY, fontWeight: '700', letterSpacing: 0.4 }}>
                        {badge}
                    </Text>
                </View>
            ) : (
                <ChevronRight size={16} color={palette.EHR_TEXT_MUTED} />
            )}
        </Pressable>
    );
}

