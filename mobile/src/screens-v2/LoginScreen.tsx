// LoginScreen v2 — port từ "ViEH Login Redesign.html" (Claude Design 2026-06-03).
//
// Khác biệt chính vs phiên bản trước:
//   - Bỏ "Sinh trắc học (đăng nhập nhanh)" — Web3Auth không cho restore session
//     cold-start (gotcha CLAUDE.md #10), button cũ chỉ pick provider mặc định.
//   - Passwordless promoted lên TOP (Email Khuyên dùng + SMS) — UX nghiên cứu
//     của Claude Design ưu tiên không-mật-khẩu cho người dùng Việt.
//   - Social grid 3-cột: 6 primary (Google/Apple/Facebook/X/Discord/LINE) +
//     8 expandable "Xem thêm" (Reddit/Twitch/GitHub/Kakao/LinkedIn/Weibo/
//     WeChat/Farcaster). Tổng 14 providers Web3Auth Sapphire v8.1.0 hỗ trợ.
//   - Brand-accurate SVG icons (BrandIcons.tsx) thay FontAwesome6 generic.
//   - Disclosure card jade-tinted cuối màn — cite Nghị định 13/2023/NĐ-CP về
//     dữ liệu cá nhân nhạy cảm (yêu cầu compliance pre-OAuth).
//   - Top bar dùng ViSealLogo (hướng C — dấu son + nhịp tim) + wordmark.
//
// Web3Auth wiring giữ nguyên: ping/getNonce/login retry, hint modal, Sentry,
// encryption keypair register, deriveRolesFromUser.

import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'tamagui';
import Constants from 'expo-constants';
import { ArrowLeft, ChevronDown, ChevronRight, Mail, MessageSquareText, ShieldCheck } from 'lucide-react-native';

import useAuthStore from '../store/authStore';
import authService from '../services/auth.service';
import walletActionService from '../services/walletAction.service';
import { getOrCreateEncryptionKeypair } from '../services/nacl-crypto';
import { deriveRolesFromUser } from '../utils/authRoles';
import { friendlyProviderError } from '../utils/friendlyError';
import { Sentry } from '../lib/sentry';
import ViSealLogo from '../components-v2/ViSealLogo';
import { useEhrPalette } from '../constants/uiColors';
import {
    GoogleIcon, AppleIcon, FacebookIcon, XIcon, DiscordIcon, LineIcon,
    RedditIcon, TwitchIcon, GithubIcon, KakaoIcon, LinkedinIcon, WeiboIcon,
    WechatIcon, FarcasterIcon,
} from '../components-v2/BrandIcons';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SERIF_MED = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const SANS_BOLD = 'DMSans_700Bold';

const isExpoGo = Constants.appOwnership === 'expo';
const OAUTH_SOCIAL_PROVIDERS = new Set([
    'google', 'apple', 'twitter', 'facebook', 'discord',
    'line', 'reddit', 'twitch', 'github', 'kakao',
    'linkedin', 'weibo', 'wechat', 'farcaster',
]);

type ProviderKey =
    | 'google' | 'apple' | 'twitter' | 'facebook' | 'discord' | 'line'
    | 'reddit' | 'twitch' | 'github' | 'kakao' | 'linkedin'
    | 'weibo' | 'wechat' | 'farcaster'
    | 'email_passwordless' | 'sms_passwordless';

type SocialTile = {
    key: ProviderKey;
    label: string;
    Icon: React.ComponentType<{ size?: number }>;
};

// 6 providers ưu tiên hiển thị mặc định (theo mockup).
const PRIMARY_SOCIAL: SocialTile[] = [
    { key: 'google', label: 'Google', Icon: GoogleIcon },
    { key: 'apple', label: 'Apple', Icon: AppleIcon },
    { key: 'facebook', label: 'Facebook', Icon: FacebookIcon },
    { key: 'twitter', label: 'X', Icon: XIcon },
    { key: 'discord', label: 'Discord', Icon: DiscordIcon },
    { key: 'line', label: 'LINE', Icon: LineIcon },
];

// 8 providers hiển thị khi user bấm "Xem thêm".
const MORE_SOCIAL: SocialTile[] = [
    { key: 'reddit', label: 'Reddit', Icon: RedditIcon },
    { key: 'twitch', label: 'Twitch', Icon: TwitchIcon },
    { key: 'github', label: 'GitHub', Icon: GithubIcon },
    { key: 'kakao', label: 'Kakao', Icon: KakaoIcon },
    { key: 'linkedin', label: 'LinkedIn', Icon: LinkedinIcon },
    { key: 'weibo', label: 'Weibo', Icon: WeiboIcon },
    { key: 'wechat', label: 'WeChat', Icon: WechatIcon },
    { key: 'farcaster', label: 'Farcaster', Icon: FarcasterIcon },
];

export default function LoginScreen({ navigation }: any) {
    const palette = useEhrPalette();
    const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('email_passwordless');
    const [loading, setLoading] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const { login } = useAuthStore();

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

    const handleWeb3Login = async (providerKey: ProviderKey) => {
        if (isExpoGo && OAUTH_SOCIAL_PROVIDERS.has(providerKey)) {
            Alert.alert(
                'Expo Go không hỗ trợ',
                `"${providerKey}" không hoạt động trong Expo Go vì Google/Apple chặn URL exp://\n\nHãy dùng Email OTP hoặc build dev client: npx expo run:android`,
                [
                    { text: 'Dùng Email OTP', onPress: () => handleWeb3Login('email_passwordless') },
                    { text: 'Đóng', style: 'cancel' },
                ],
            );
            return;
        }

        let loginHint: string | undefined;
        if (providerKey === 'sms_passwordless' || providerKey === 'email_passwordless') {
            const hint = await promptForLoginHint(providerKey);
            if (!hint) return;
            loginHint = hint;
        }

        try {
            setLoading(true);
            setSelectedProvider(providerKey);

            await walletActionService.ensureWeb3AuthReady();
            const { walletClient, address } = await walletActionService.loginWithWeb3Auth(
                providerKey,
                loginHint ? { loginHint } : undefined,
            );

            await runAuthStepWithRetry(() => authService.ping(), 1);
            const nonceRes = await runAuthStepWithRetry(() => authService.getNonce(address), 1);
            const message = nonceRes?.message;
            if (!message) throw new Error('Không lấy được nonce từ hệ thống.');

            const signature = await walletActionService.signMessage(walletClient, message);
            const loginResult = await runAuthStepWithRetry(
                () => authService.login(address, message, signature),
                1,
            );

            if (!loginResult?.token) {
                throw new Error('Hệ thống không trả về token đăng nhập hợp lệ.');
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
                    category: 'auth', level: 'error',
                    message: 'Web3Auth login failed',
                    data: { provider: providerKey, errorCode: error?.code, message: String(error?.message || '').slice(0, 200) },
                });
                Sentry.captureException(error);
            } catch {}

            let message: string;
            if (error?.code === 'BACKEND_UNREACHABLE') {
                message = 'Không kết nối được hệ thống. Vui lòng kiểm tra mạng và thử lại.';
            } else if (raw.includes('cannot connect to expo cli') || raw.includes('could not load bundle')) {
                message = 'Ứng dụng không kết nối được Metro. Hãy chạy expo start và thử lại.';
            } else {
                message = friendlyProviderError(error, providerKey);
            }
            Alert.alert('Đăng nhập thất bại', message);
        } finally {
            setLoading(false);
        }
    };

    const renderSocialTile = (tile: SocialTile) => {
        const isLoading = loading && selectedProvider === tile.key;
        const Icon = tile.Icon;
        return (
            <Pressable
                key={tile.key}
                onPress={() => handleWeb3Login(tile.key)}
                disabled={loading}
                accessibilityLabel={`Đăng nhập bằng ${tile.label}`}
                style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 60,
                    paddingVertical: 8,
                    paddingHorizontal: 4,
                    borderRadius: 13,
                    borderWidth: 0.75,
                    borderColor: pressed ? '#34404c' : palette.EHR_OUTLINE_VARIANT,
                    backgroundColor: pressed ? '#0c0e13' : palette.EHR_SURFACE_LOWEST,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    opacity: loading && !isLoading ? 0.55 : 1,
                })}
            >
                {isLoading ? (
                    <ActivityIndicator size="small" color={palette.EHR_PRIMARY} />
                ) : (
                    <Icon size={23} />
                )}
                <Text style={{
                    fontFamily: SANS_SEMI, fontSize: 10.5,
                    color: palette.EHR_ON_SURFACE_VARIANT,
                    fontWeight: '600',
                }}>
                    {tile.label}
                </Text>
            </Pressable>
        );
    };

    const renderTileGrid = (tiles: SocialTile[]) => {
        // 3 cột — group thành rows of 3, render mỗi row trong View row gap 8.
        const rows: SocialTile[][] = [];
        for (let i = 0; i < tiles.length; i += 3) {
            rows.push(tiles.slice(i, i + 3));
        }
        return (
            <View style={{ gap: 8 }}>
                {rows.map((row, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', gap: 8 }}>
                        {row.map(renderSocialTile)}
                        {/* Pad row cuối nếu thiếu để giữ width đều */}
                        {row.length < 3
                            ? Array.from({ length: 3 - row.length }).map((_, i) => (
                                  <View key={`pad-${i}`} style={{ flex: 1 }} />
                              ))
                            : null}
                    </View>
                ))}
            </View>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }}>
            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Top bar — back + wordmark+seal + spacer */}
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: 2,
                            paddingBottom: 6,
                        }}
                    >
                        <Pressable
                            onPress={() => navigation.goBack()}
                            disabled={loading}
                            hitSlop={8}
                            accessibilityLabel="Quay lại"
                            style={({ pressed }) => ({
                                width: 44, height: 44, borderRadius: 22,
                                alignItems: 'center', justifyContent: 'center',
                                opacity: pressed ? 0.5 : 1,
                            })}
                        >
                            <ArrowLeft size={20} color={palette.EHR_ON_SURFACE_VARIANT} />
                        </Pressable>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                            <ViSealLogo size={22} />
                            <Text style={{
                                fontFamily: SANS_SEMI, fontSize: 13,
                                letterSpacing: 1.5, textTransform: 'uppercase',
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                fontWeight: '600',
                            }}>
                                ViEH
                            </Text>
                        </View>
                        <View style={{ width: 44 }} />
                    </View>

                    {/* Hero serif greeting */}
                    <View style={{ marginTop: 6, marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <Text style={{
                                fontFamily: SERIF, fontSize: 33,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.9, lineHeight: 34,
                            }}>
                                Đăng nhập{' '}
                            </Text>
                            <Text style={{
                                fontFamily: SERIF_ITALIC, fontStyle: 'italic',
                                fontSize: 33,
                                color: palette.EHR_PRIMARY,
                                letterSpacing: -0.9, lineHeight: 34,
                                fontWeight: '500',
                            }}>
                                an toàn.
                            </Text>
                        </View>
                        <Text style={{
                            marginTop: 9,
                            fontFamily: SANS,
                            fontSize: 13.5,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 20,
                            maxWidth: 320,
                        }}>
                            Hệ thống không lưu mật khẩu. Mọi truy cập đều được mã hoá đầu-cuối.
                        </Text>
                    </View>

                    {/* Section label */}
                    <SectionLabel icon={<ShieldCheck size={13} color={palette.EHR_TEXT_MUTED} />}>
                        Đăng nhập không mật khẩu
                    </SectionLabel>

                    {/* Passwordless rows — promoted to primary */}
                    <View style={{ gap: 8 }}>
                        <PasswordlessRow
                            recommended
                            icon={<Mail size={22} color={palette.EHR_PRIMARY} />}
                            title="Đăng nhập bằng Email"
                            subtitle="Mã xác thực gửi qua email"
                            badge="Khuyên dùng"
                            loading={loading && selectedProvider === 'email_passwordless'}
                            disabled={loading}
                            onPress={() => handleWeb3Login('email_passwordless')}
                        />
                        <PasswordlessRow
                            icon={<MessageSquareText size={22} color={palette.EHR_PRIMARY} />}
                            title="Đăng nhập bằng số điện thoại"
                            subtitle="Mã xác thực gửi qua SMS"
                            loading={loading && selectedProvider === 'sms_passwordless'}
                            disabled={loading}
                            onPress={() => handleWeb3Login('sms_passwordless')}
                        />
                    </View>

                    {/* Divider */}
                    <View
                        style={{
                            flexDirection: 'row', alignItems: 'center',
                            marginVertical: 14, gap: 12,
                        }}
                    >
                        <View style={{ flex: 1, height: 0.5, backgroundColor: palette.EHR_OUTLINE_VARIANT }} />
                        <Text style={{
                            fontFamily: SANS_BOLD, fontSize: 10.5,
                            color: palette.EHR_TEXT_MUTED,
                            letterSpacing: 1.3, textTransform: 'uppercase',
                            fontWeight: '700',
                        }}>
                            Hoặc đăng nhập bằng mạng xã hội
                        </Text>
                        <View style={{ flex: 1, height: 0.5, backgroundColor: palette.EHR_OUTLINE_VARIANT }} />
                    </View>

                    {/* Social grid 3-cột — 6 primary providers */}
                    {renderTileGrid(PRIMARY_SOCIAL)}

                    {/* Expandable more (8 providers) */}
                    {showMore ? (
                        <View style={{ marginTop: 10 }}>
                            {renderTileGrid(MORE_SOCIAL)}
                        </View>
                    ) : null}

                    {/* Toggle "Xem thêm" / "Thu gọn" */}
                    <Pressable
                        onPress={() => setShowMore((s) => !s)}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityLabel={showMore ? 'Thu gọn danh sách mạng xã hội' : 'Xem thêm mạng xã hội'}
                        style={({ pressed }) => ({
                            marginTop: 10,
                            minHeight: 44,
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                            gap: 8,
                            borderRadius: 14,
                            borderWidth: 0.75,
                            borderColor: pressed ? '#34404c' : palette.EHR_OUTLINE_VARIANT,
                            backgroundColor: 'transparent',
                            paddingHorizontal: 14,
                        })}
                    >
                        <Text style={{
                            fontFamily: SANS_SEMI, fontSize: 13.5,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            fontWeight: '600', letterSpacing: 0.2,
                        }}>
                            {showMore ? 'Thu gọn' : 'Xem thêm'}
                        </Text>
                        <View style={{
                            paddingHorizontal: 8, paddingVertical: 2,
                            borderRadius: 999,
                            backgroundColor: palette.EHR_SURFACE_HIGH,
                        }}>
                            <Text style={{
                                fontFamily: SANS_BOLD, fontSize: 10.5,
                                color: palette.EHR_TEXT_MUTED,
                                fontWeight: '700',
                            }}>
                                {MORE_SOCIAL.length}
                            </Text>
                        </View>
                        <ChevronDown
                            size={14}
                            color={palette.EHR_ON_SURFACE_VARIANT}
                            style={{ transform: [{ rotate: showMore ? '180deg' : '0deg' }] }}
                        />
                    </Pressable>

                    {/* Legal disclosure card jade-tinted (NĐ 13/2023) */}
                    <View
                        style={{
                            marginTop: 14,
                            flexDirection: 'row', gap: 10,
                            paddingHorizontal: 13, paddingVertical: 11,
                            borderRadius: 13,
                            backgroundColor: 'rgba(123,168,138,0.05)',
                            borderWidth: 0.75,
                            borderColor: 'rgba(123,168,138,0.16)',
                        }}
                    >
                        <ShieldCheck size={18} color={palette.EHR_SUCCESS ?? '#7BA88A'} />
                        <Text style={{
                            flex: 1,
                            fontFamily: SANS, fontSize: 11,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 16.5,
                        }}>
                            Tiếp tục nghĩa là bạn đồng ý Điều khoản & Chính sách bảo mật, và đã hiểu{' '}
                            <Text style={{
                                color: palette.EHR_ON_SURFACE,
                                fontFamily: SANS_MEDIUM, fontWeight: '500',
                            }}>
                                Nghị định 13/2023/NĐ-CP
                            </Text>
                            {' '}về xử lý dữ liệu cá nhân (gồm dữ liệu y tế nhạy cảm).
                        </Text>
                    </View>

                    {/* Footer meta */}
                    <View
                        style={{
                            marginTop: 11,
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                            gap: 10,
                        }}
                    >
                        <View style={{ width: 16, height: 0.5, backgroundColor: palette.EHR_OUTLINE_VARIANT }} />
                        <Text style={{
                            fontFamily: SANS_SEMI, fontSize: 10,
                            color: palette.EHR_TEXT_MUTED,
                            letterSpacing: 1.3, textTransform: 'uppercase',
                            fontWeight: '600',
                        }}>
                            ViEH · Bảo mật phân quyền
                        </Text>
                        <View style={{ width: 16, height: 0.5, backgroundColor: palette.EHR_OUTLINE_VARIANT }} />
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
                    style={{
                        flex: 1, backgroundColor: 'rgba(0,0,0,0.66)',
                        justifyContent: 'center', paddingHorizontal: 24,
                    }}
                >
                    <View style={{
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                        borderRadius: 22,
                        borderWidth: 0.75,
                        borderColor: palette.EHR_OUTLINE_VARIANT,
                        padding: 24,
                    }}>
                        <Text style={{
                            fontFamily: SERIF_MED, fontSize: 23,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.4, marginBottom: 6,
                            fontWeight: '500',
                        }}>
                            {hintModalProvider === 'sms_passwordless'
                                ? 'Đăng nhập bằng số điện thoại'
                                : 'Đăng nhập bằng email'}
                        </Text>
                        <Text style={{
                            fontFamily: SANS, fontSize: 13,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 20, marginBottom: 16,
                        }}>
                            {hintModalProvider === 'sms_passwordless'
                                ? 'Nhập số theo định dạng quốc tế (0xxx tự đổi thành +84xxx).'
                                : 'Mã xác thực một lần sẽ được gửi đến email này.'}
                        </Text>
                        <TextInput
                            style={{
                                borderWidth: 0.75,
                                borderColor: palette.EHR_OUTLINE_VARIANT,
                                borderRadius: 13,
                                paddingVertical: 15, paddingHorizontal: 16,
                                fontFamily: 'monospace', fontSize: 15,
                                color: palette.EHR_ON_SURFACE,
                                backgroundColor: palette.EHR_SURFACE,
                            }}
                            value={hintInput}
                            onChangeText={setHintInput}
                            keyboardType={hintModalProvider === 'sms_passwordless' ? 'phone-pad' : 'email-address'}
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholder={hintModalProvider === 'sms_passwordless' ? '+84 90 123 4567' : 'name@example.com'}
                            placeholderTextColor={palette.EHR_TEXT_MUTED}
                            autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                            <Pressable
                                onPress={() => closeHintModal(null)}
                                style={({ pressed }) => ({
                                    flex: 1, minHeight: 52,
                                    borderRadius: 13,
                                    borderWidth: 0.75,
                                    borderColor: palette.EHR_OUTLINE_VARIANT,
                                    alignItems: 'center', justifyContent: 'center',
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <Text style={{
                                    fontFamily: SANS_SEMI, fontSize: 15,
                                    color: palette.EHR_ON_SURFACE_VARIANT,
                                    fontWeight: '600',
                                }}>
                                    Huỷ
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={handleHintConfirm}
                                style={({ pressed }) => ({
                                    flex: 1, minHeight: 52,
                                    borderRadius: 13,
                                    backgroundColor: palette.EHR_PRIMARY,
                                    alignItems: 'center', justifyContent: 'center',
                                    opacity: pressed ? 0.85 : 1,
                                })}
                            >
                                <Text style={{
                                    fontFamily: SANS_SEMI, fontSize: 15,
                                    color: '#FAF7F1',
                                    fontWeight: '600',
                                }}>
                                    Gửi mã
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
    const palette = useEhrPalette();
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            marginBottom: 9,
        }}>
            {icon}
            <Text style={{
                fontFamily: SANS_BOLD, fontSize: 11,
                color: palette.EHR_TEXT_MUTED,
                letterSpacing: 1.4, textTransform: 'uppercase',
                fontWeight: '700',
            }}>
                {children}
            </Text>
        </View>
    );
}

function PasswordlessRow({
    icon, title, subtitle, badge, loading, disabled, onPress, recommended,
}: {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    badge?: string;
    loading: boolean;
    disabled: boolean;
    onPress: () => void;
    recommended?: boolean;
}) {
    const palette = useEhrPalette();
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={title}
            style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center',
                gap: 13,
                minHeight: 60,
                paddingVertical: 11, paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: recommended
                    ? `${palette.EHR_PRIMARY}10`
                    : palette.EHR_SURFACE_LOWEST,
                borderWidth: 0.75,
                borderColor: pressed
                    ? '#34404c'
                    : recommended
                        ? `${palette.EHR_PRIMARY}73`
                        : palette.EHR_OUTLINE_VARIANT,
                opacity: pressed ? 0.85 : 1,
            })}
        >
            <View
                style={{
                    width: 40, height: 40,
                    borderRadius: 11,
                    backgroundColor: `${palette.EHR_PRIMARY}22`,
                    alignItems: 'center', justifyContent: 'center',
                }}
            >
                {icon}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{
                    fontFamily: SANS_SEMI, fontSize: 14.5,
                    color: palette.EHR_ON_SURFACE,
                    fontWeight: '600', letterSpacing: -0.2,
                }}>
                    {title}
                </Text>
                <Text style={{
                    marginTop: 3,
                    fontFamily: SANS, fontSize: 11.5,
                    color: palette.EHR_TEXT_MUTED,
                }}>
                    {subtitle}
                </Text>
            </View>
            {loading ? (
                <ActivityIndicator size="small" color={palette.EHR_PRIMARY} />
            ) : badge ? (
                <View
                    style={{
                        paddingHorizontal: 10, paddingVertical: 5,
                        borderRadius: 999,
                        backgroundColor: `${palette.EHR_PRIMARY}24`,
                    }}
                >
                    <Text style={{
                        fontFamily: SANS_BOLD, fontSize: 10.5,
                        color: palette.EHR_PRIMARY,
                        fontWeight: '700', letterSpacing: 0.3,
                    }}>
                        {badge}
                    </Text>
                </View>
            ) : (
                <ChevronRight size={18} color={palette.EHR_TEXT_MUTED} />
            )}
        </Pressable>
    );
}
