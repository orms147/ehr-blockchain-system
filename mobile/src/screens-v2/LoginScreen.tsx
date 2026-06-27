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
//   - Disclosure card jade-tinted cuối màn — cite Luật BVDLCN 91/2025/QH15 về
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
import { ArrowLeft, ChevronRight, ChevronUp, Mail, MessageSquareText, MoreHorizontal, ShieldCheck } from 'lucide-react-native';

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

// 3 social ưu tiên (theo mockup v2.4.1 — grid 4 cột, ô thứ 4 là "Xem thêm").
const PRIMARY_SOCIAL: SocialTile[] = [
    { key: 'google', label: 'Google', Icon: GoogleIcon },
    { key: 'apple', label: 'Apple', Icon: AppleIcon },
    { key: 'facebook', label: 'Facebook', Icon: FacebookIcon },
];

// 11 social còn lại hiển thị khi user bấm "Xem thêm".
const MORE_SOCIAL: SocialTile[] = [
    { key: 'twitter', label: 'X', Icon: XIcon },
    { key: 'discord', label: 'Discord', Icon: DiscordIcon },
    { key: 'line', label: 'LINE', Icon: LineIcon },
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
            // Web3Auth's SMS passwordless requires "+{countryCode}-{number}" (WITH a
            // hyphen). Plain E.164 like +84901234567 is rejected by Web3Auth itself:
            // "Invalid phone number ... format eg: +{cc}-{number}".
            const cleaned = raw.replace(/[^\d+\-]/g, '');
            let phone: string | null = null;
            if (/^\+\d{1,3}-\d{4,14}$/.test(cleaned)) {
                phone = cleaned;                              // user already gave +cc-number
            } else {
                // Otherwise treat it as a Vietnamese number → build +84-<national>.
                let national = cleaned.replace(/\D/g, '');
                if (national.startsWith('0')) national = national.slice(1);
                else if (national.startsWith('84')) national = national.slice(2);
                if (/^\d{8,11}$/.test(national)) phone = '+84-' + national;
            }
            if (!phone) {
                Alert.alert(
                    'Số điện thoại không hợp lệ',
                    'Nhập số Việt Nam (vd 0901234567) hoặc theo định dạng +{mã quốc gia}-{số}, vd +84-901234567.',
                );
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

    // Ô lưới chung (social / ví / nút "Xem thêm").
    type GridTile = {
        key: string;
        label: string;
        Icon: React.ComponentType<{ size?: number }>;
        onPress: () => void;
        loadingKey?: ProviderKey; // social: hiện spinner khi đang đăng nhập provider này
    };

    const renderTile = (tile: GridTile) => {
        const isLoading = !!tile.loadingKey && loading && selectedProvider === tile.loadingKey;
        const Icon = tile.Icon;
        return (
            <Pressable
                key={tile.key}
                onPress={tile.onPress}
                disabled={loading}
                accessibilityLabel={tile.label}
                style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 58,
                    paddingVertical: 8,
                    paddingHorizontal: 2,
                    borderRadius: 13,
                    borderWidth: 0.75,
                    borderColor: pressed ? '#34404c' : palette.EHR_OUTLINE_VARIANT,
                    backgroundColor: pressed ? '#0c0e13' : palette.EHR_SURFACE_LOWEST,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    opacity: loading && !isLoading ? 0.55 : 1,
                })}
            >
                {isLoading ? (
                    <ActivityIndicator size="small" color={palette.EHR_PRIMARY} />
                ) : (
                    <Icon size={22} />
                )}
                <Text
                    numberOfLines={1}
                    style={{
                        fontFamily: SANS_SEMI, fontSize: 9.5,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        fontWeight: '600',
                        maxWidth: '100%',
                    }}
                >
                    {tile.label}
                </Text>
            </Pressable>
        );
    };

    const renderGrid = (tiles: GridTile[]) => {
        // 4 cột — group thành rows of 4.
        const rows: GridTile[][] = [];
        for (let i = 0; i < tiles.length; i += 4) {
            rows.push(tiles.slice(i, i + 4));
        }
        return (
            <View style={{ gap: 8 }}>
                {rows.map((row, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', gap: 8 }}>
                        {row.map(renderTile)}
                        {/* Pad row cuối nếu thiếu để giữ width đều */}
                        {row.length < 4
                            ? Array.from({ length: 4 - row.length }).map((_, i) => (
                                  <View key={`pad-${i}`} style={{ flex: 1 }} />
                              ))
                            : null}
                    </View>
                ))}
            </View>
        );
    };

    // Icon ô toggle: collapsed = "•••" (Xem thêm); expanded = "^" (Thu gọn) — theo HTML (DOTS_SVG / UP_SVG).
    const MoreDotsIcon = ({ size = 22 }: { size?: number }) => (
        <MoreHorizontal size={size} color={palette.EHR_ON_SURFACE_VARIANT} />
    );
    const CollapseIcon = ({ size = 20 }: { size?: number }) => (
        <ChevronUp size={size} color={palette.EHR_ON_SURFACE_VARIANT} />
    );

    // Ô social. Toggle LUÔN ở cuối lưới: collapsed → sau 3 primary; expanded → sau tất cả.
    const socialPrimaryCells: GridTile[] = PRIMARY_SOCIAL.map((t) => ({
        key: t.key, label: t.label, Icon: t.Icon, loadingKey: t.key,
        onPress: () => handleWeb3Login(t.key),
    }));
    const socialMoreCells: GridTile[] = MORE_SOCIAL.map((t) => ({
        key: t.key, label: t.label, Icon: t.Icon, loadingKey: t.key,
        onPress: () => handleWeb3Login(t.key),
    }));
    const socialToggle: GridTile = {
        key: '__social_toggle',
        label: showMore ? 'Thu gọn' : 'Xem thêm',
        Icon: showMore ? CollapseIcon : MoreDotsIcon,
        onPress: () => setShowMore((s) => !s),
    };
    const socialCells: GridTile[] = showMore
        ? [...socialPrimaryCells, ...socialMoreCells, socialToggle]
        : [...socialPrimaryCells, socialToggle];

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
                            icon={<Mail size={22} color={palette.EHR_PRIMARY} />}
                            title="Đăng nhập bằng Email"
                            subtitle="Mã xác thực gửi qua email"
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

                    {/* Social grid 4-cột — 3 primary + ô "Xem thêm" */}
                    {renderGrid(socialCells)}

                    {/* Legal disclosure card jade-tinted (Luật BVDLCN 91/2025/QH15) */}
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
                                Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15
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
                            ViEH · Bảo mật phân quyền ·{' '}
                            <Text style={{ textTransform: 'none' }}>v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
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
                                ? 'Nhập số điện thoại của bạn.'
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
                            placeholder={hintModalProvider === 'sms_passwordless' ? '+84-901234567' : 'name@example.com'}
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
