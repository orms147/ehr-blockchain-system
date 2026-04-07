import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
} from 'react-native-reanimated';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import {
    ArrowLeft,
    ChevronRight,
    Fingerprint,
    HeartPulse,
    Lock,
    Mail,
    MessageSquareText,
    Shield,
    Wallet,
} from 'lucide-react-native';

import useAuthStore from '../store/authStore';
import authService from '../services/auth.service';
import walletActionService from '../services/walletAction.service';
import { getOrCreateEncryptionKeypair } from '../services/nacl-crypto';
import { deriveRolesFromUser } from '../utils/authRoles';
import {
    EHR_ON_PRIMARY,
    EHR_ON_PRIMARY_CONTAINER,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_CONTAINER,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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

/* Top social row — mirrors Web3Auth modal: Google, X, Facebook, + more */
const TOP_SOCIAL: Array<{ key: ProviderKey; icon: string; label: string }> = [
    { key: 'google', icon: 'google', label: 'Google' },
    { key: 'twitter', icon: 'x-twitter', label: 'X' },
    { key: 'facebook', icon: 'facebook-f', label: 'Facebook' },
    { key: 'apple', icon: 'apple', label: 'Apple' },
];

const MORE_SOCIAL: Array<{ key: ProviderKey; icon: string; label: string }> = [
    { key: 'discord', icon: 'discord', label: 'Discord' },
];

/* Wallet list — embedded wallets / passwordless */
const WALLETS: Array<{
    id: string;
    title: string;
    subtitle: string;
    provider: ProviderKey;
    lucide?: 'mail' | 'sms';
    badge?: string;
}> = [
    {
        id: 'wallet-email',
        title: 'Dùng Email',
        subtitle: 'Nhận mã xác thực qua email, không cần mật khẩu',
        provider: 'email_passwordless',
        lucide: 'mail',
        badge: 'Khuyên dùng',
    },
    {
        id: 'wallet-sms',
        title: 'Dùng số điện thoại',
        subtitle: 'Nhận mã xác thực qua tin nhắn SMS',
        provider: 'sms_passwordless',
        lucide: 'sms',
    },
];

export default function LoginScreen({ navigation }: any) {
    const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('google');
    const [loading, setLoading] = useState(false);
    const [isBiometricSupported, setIsBiometricSupported] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const { login } = useAuthStore();

    const cardEnter = useSharedValue(0);
    const logoEnter = useSharedValue(0);

    useEffect(() => {
        cardEnter.value = withSpring(1, { damping: 16, stiffness: 100, mass: 0.8 });
        logoEnter.value = withDelay(150, withSpring(1, { damping: 14, stiffness: 120, mass: 0.7 }));
    }, []);

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

    const cardStyle = useAnimatedStyle(() => ({
        opacity: interpolate(cardEnter.value, [0, 1], [0, 1]),
        transform: [
            { translateY: interpolate(cardEnter.value, [0, 1], [32, 0]) },
            { scale: interpolate(cardEnter.value, [0, 1], [0.95, 1]) },
        ],
    }));

    const logoStyle = useAnimatedStyle(() => ({
        opacity: interpolate(logoEnter.value, [0, 1], [0, 1]),
        transform: [{ scale: interpolate(logoEnter.value, [0, 1], [0.5, 1]) }],
    }));

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

    const handleWeb3Login = async (providerKey?: ProviderKey) => {
        const providerToUse = providerKey || selectedProvider;

        if (isExpoGo && OAUTH_SOCIAL_PROVIDERS.has(providerToUse)) {
            Alert.alert(
                'Expo Go limitation',
                `"${providerToUse}" OAuth không hoạt động trong Expo Go vì Google/Apple chặn URL exp://\n\nHãy thử:\n- Email OTP (hoạt động trong Expo Go)\n- Build dev client: npx expo run:android`,
                [
                    { text: 'Dùng Email OTP', onPress: () => handleWeb3Login('email_passwordless') },
                    { text: 'Đóng', style: 'cancel' },
                ]
            );
            return;
        }

        try {
            setLoading(true);
            setSelectedProvider(providerToUse);

            await walletActionService.ensureWeb3AuthReady();
            const { walletClient, address } = await walletActionService.loginWithWeb3Auth(providerToUse);

            await runAuthStepWithRetry(() => authService.ping(), 1);

            const nonceRes = await runAuthStepWithRetry(() => authService.getNonce(address), 1);
            const message = nonceRes?.message;

            if (!message) throw new Error('Không lấy được nonce từ backend.');

            const signature = await walletActionService.signMessage(walletClient, message);
            const loginResult = await runAuthStepWithRetry(
                () => authService.login(address, message, signature),
                1
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

            // User cancelled the Web3Auth modal — silent, not an error.
            if (
                raw.includes('dismiss') ||
                raw.includes('user closed') ||
                raw.includes('user cancel') ||
                raw.includes('user denied') ||
                raw.includes('cancelled') ||
                raw.includes('canceled')
            ) {
                return;
            }

            console.error('Web3Auth Login error:', error);
            let message = error?.message || 'Lỗi không xác định';
            if (error?.code === 'BACKEND_UNREACHABLE') {
                message = 'Không kết nối được backend. Hãy bật backend và kiểm tra EXPO_PUBLIC_API_URL.';
            } else if (raw.includes('cannot connect to expo cli') || raw.includes('could not load bundle')) {
                message = 'Ứng dụng không kết nối được Metro. Hãy chạy expo start và thử lại.';
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
            <TouchableOpacity
                key={item.key}
                style={styles.socialBtn}
                onPress={() => handleWeb3Login(item.key)}
                activeOpacity={0.8}
                disabled={loading}
            >
                {isLoading ? (
                    <ActivityIndicator size="small" color={EHR_PRIMARY} />
                ) : (
                    <FontAwesome6 name={item.icon as any} size={20} color={EHR_ON_SURFACE} />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.root}>
            <LinearGradient
                colors={[EHR_SURFACE, EHR_SURFACE_LOW, EHR_SURFACE_CONTAINER]}
                style={StyleSheet.absoluteFillObject}
            />
            {/* Background mesh */}
            <View style={styles.meshA} />
            <View style={styles.meshB} />

            <SafeAreaView style={styles.safe}>
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Header bar */}
                    <View style={styles.headerBar}>
                        <TouchableOpacity
                            style={styles.backBtn}
                            onPress={() => navigation.goBack()}
                            activeOpacity={0.7}
                            disabled={loading}
                        >
                            <ArrowLeft size={18} color={EHR_ON_SURFACE} strokeWidth={2.4} />
                        </TouchableOpacity>
                        <View style={styles.brandChip}>
                            <View style={styles.brandDot}>
                                <HeartPulse size={12} color={EHR_ON_PRIMARY} strokeWidth={2.6} />
                            </View>
                            <Text style={styles.brandText}>Sổ sức khoẻ</Text>
                        </View>
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Modal card */}
                    <Animated.View style={[styles.card, cardStyle]}>
                        {/* Logo */}
                        <Animated.View style={[styles.logoWrap, logoStyle]}>
                            <LinearGradient
                                colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.logoCircle}
                            >
                                <Shield size={26} color={EHR_ON_PRIMARY} strokeWidth={2.2} />
                            </LinearGradient>
                        </Animated.View>

                        <Text style={styles.title}>Chào mừng trở lại</Text>
                        <Text style={styles.subtitle}>
                            Đăng nhập để xem hồ sơ sức khoẻ của bạn
                        </Text>

                        {/* Social icons row */}
                        <View style={styles.socialRow}>
                            {TOP_SOCIAL.map(renderSocialIcon)}
                            <TouchableOpacity
                                style={styles.socialBtn}
                                onPress={() => setShowMore((s) => !s)}
                                activeOpacity={0.8}
                                disabled={loading}
                            >
                                <Text style={styles.moreDots}>•••</Text>
                            </TouchableOpacity>
                        </View>

                        {/* More social (collapsible) */}
                        {showMore && (
                            <View style={styles.moreSocialRow}>
                                {MORE_SOCIAL.map(renderSocialIcon)}
                            </View>
                        )}

                        {/* Primary email CTA */}
                        <TouchableOpacity
                            style={styles.emailBtn}
                            onPress={() => handleWeb3Login('email_passwordless')}
                            activeOpacity={0.85}
                            disabled={loading}
                        >
                            {loading && selectedProvider === 'email_passwordless' ? (
                                <ActivityIndicator size="small" color={EHR_ON_SURFACE} />
                            ) : (
                                <>
                                    <Mail size={18} color={EHR_ON_SURFACE} strokeWidth={2.2} />
                                    <Text style={styles.emailBtnText}>Tiếp tục với Email / Số điện thoại</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.divider}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>HOẶC</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        {/* Wallet list */}
                        <View style={styles.walletList}>
                            {WALLETS.map((item) => {
                                const isLoading = loading && selectedProvider === item.provider;
                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={styles.walletItem}
                                        onPress={() => handleWeb3Login(item.provider)}
                                        activeOpacity={0.85}
                                        disabled={loading}
                                    >
                                        <View style={styles.walletIcon}>
                                            {item.lucide === 'mail' ? (
                                                <Mail size={18} color={EHR_PRIMARY} strokeWidth={2.2} />
                                            ) : (
                                                <MessageSquareText size={18} color={EHR_PRIMARY} strokeWidth={2.2} />
                                            )}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.walletTitle}>{item.title}</Text>
                                            <Text style={styles.walletSubtitle}>{item.subtitle}</Text>
                                        </View>
                                        {isLoading ? (
                                            <ActivityIndicator size="small" color={EHR_PRIMARY} />
                                        ) : item.badge ? (
                                            <View style={styles.badge}>
                                                <Text style={styles.badgeText}>{item.badge}</Text>
                                            </View>
                                        ) : (
                                            <ChevronRight size={18} color={EHR_ON_SURFACE_VARIANT} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Biometric */}
                        {isBiometricSupported && (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.bioBtn,
                                    pressed && { opacity: 0.8 },
                                ]}
                                onPress={handleBiometricAuth}
                                disabled={loading}
                            >
                                <Fingerprint size={16} color={EHR_PRIMARY} strokeWidth={2.2} />
                                <Text style={styles.bioBtnText}>Sinh trắc học</Text>
                            </Pressable>
                        )}

                        {/* Powered by footer */}
                        <View style={styles.poweredRow}>
                            <Lock size={10} color={EHR_ON_SURFACE_VARIANT} strokeWidth={2.4} />
                            <Text style={styles.poweredText}>Thông tin của bạn được bảo vệ tuyệt đối</Text>
                        </View>
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: EHR_SURFACE },
    safe: { flex: 1 },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 28,
    },

    meshA: {
        position: 'absolute',
        top: -SCREEN_H * 0.15,
        right: -SCREEN_W * 0.3,
        width: SCREEN_W * 0.95,
        height: SCREEN_W * 0.95,
        borderRadius: SCREEN_W * 0.475,
        backgroundColor: EHR_PRIMARY_FIXED,
        opacity: 0.5,
    },
    meshB: {
        position: 'absolute',
        bottom: -SCREEN_H * 0.1,
        left: -SCREEN_W * 0.25,
        width: SCREEN_W * 0.75,
        height: SCREEN_W * 0.75,
        borderRadius: SCREEN_W * 0.375,
        backgroundColor: EHR_PRIMARY_CONTAINER,
        opacity: 0.2,
    },

    /* Header */
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 18,
        paddingHorizontal: 2,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: `${EHR_SURFACE_LOWEST}EE`,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
    },
    brandChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        backgroundColor: `${EHR_SURFACE_LOWEST}EE`,
        paddingLeft: 5,
        paddingRight: 12,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
    },
    brandDot: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: EHR_PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandText: {
        fontSize: 12,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
        letterSpacing: 0.3,
    },

    /* Card */
    card: {
        backgroundColor: `${EHR_SURFACE_LOWEST}FA`,
        borderRadius: 28,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        paddingHorizontal: 24,
        paddingTop: 28,
        paddingBottom: 20,
        shadowColor: EHR_ON_SURFACE,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.1,
        shadowRadius: 28,
        elevation: 10,
    },

    /* Logo */
    logoWrap: {
        alignItems: 'center',
        marginBottom: 14,
    },
    logoCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: EHR_PRIMARY,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
    },

    /* Title */
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: EHR_ON_SURFACE,
        textAlign: 'center',
        letterSpacing: -0.4,
    },
    subtitle: {
        fontSize: 13,
        color: EHR_ON_SURFACE_VARIANT,
        textAlign: 'center',
        marginTop: 6,
        marginBottom: 22,
        lineHeight: 18,
        paddingHorizontal: 8,
    },

    /* Social row */
    socialRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 14,
    },
    moreSocialRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 14,
    },
    socialBtn: {
        flex: 1,
        height: 52,
        borderRadius: 14,
        backgroundColor: EHR_SURFACE_LOWEST,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    moreDots: {
        fontSize: 18,
        fontWeight: '900',
        color: EHR_ON_SURFACE_VARIANT,
        letterSpacing: 1,
    },

    /* Email CTA */
    emailBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        height: 52,
        borderRadius: 14,
        backgroundColor: EHR_SURFACE_LOWEST,
        borderWidth: 1.5,
        borderColor: EHR_OUTLINE_VARIANT,
        marginBottom: 18,
    },
    emailBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
    },

    /* Divider */
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: EHR_OUTLINE_VARIANT,
    },
    dividerText: {
        fontSize: 10,
        fontWeight: '800',
        color: EHR_ON_SURFACE_VARIANT,
        letterSpacing: 1.2,
    },

    /* Wallet list */
    walletList: {
        gap: 10,
        marginBottom: 14,
    },
    walletItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: EHR_SURFACE_LOWEST,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
    },
    walletIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: EHR_PRIMARY_FIXED,
        alignItems: 'center',
        justifyContent: 'center',
    },
    walletTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
    },
    walletSubtitle: {
        fontSize: 11,
        color: EHR_ON_SURFACE_VARIANT,
        marginTop: 1,
    },
    badge: {
        backgroundColor: EHR_PRIMARY_FIXED,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: EHR_PRIMARY_CONTAINER,
    },
    badgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: EHR_PRIMARY,
        letterSpacing: 0.3,
    },

    /* Biometric */
    bioBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 10,
        marginBottom: 12,
    },
    bioBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: EHR_PRIMARY,
    },

    /* Footer */
    poweredRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: EHR_OUTLINE_VARIANT,
    },
    poweredText: {
        fontSize: 10,
        color: EHR_ON_SURFACE_VARIANT,
        fontWeight: '600',
        letterSpacing: 0.2,
    },
});
