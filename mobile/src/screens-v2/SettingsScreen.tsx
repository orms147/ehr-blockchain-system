// SettingsScreen v2 — port of .design-bundle/project/screens-extras.jsx
// SettingsScreen. Sectioned tile layout (Hồ sơ / Ví / Bảo mật & uỷ quyền /
// Hỗ trợ / Đăng xuất). Biometric switch is a tile-row affordance, not a
// standalone card. Cinnabar reserved for "Đăng xuất" (the only legal-action
// moment in this screen).
//
// Wiring preserved:
//   - useAuthStore.logout (Web3Auth signOut)
//   - isBiometricSigningEnabled / setBiometricSigningEnabled (utils/biometricGate)
//   - Clipboard copy + Arbiscan / Alchemy faucet links
//   - Navigation routes: EditProfile, TrustedContacts, Delegation
//   - New routes (port later, defined now): EmergencyProfile, BiometricSettings

import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useNavigation } from '@react-navigation/native';
import {
    User as UserIcon,
    Wallet,
    Heart,
    ShieldCheck,
    Clock,
    Fingerprint,
    HelpCircle,
    LogOut,
    ChevronRight,
    Sun,
    Moon,
    Smartphone,
    Check,
} from 'lucide-react-native';

import useAuthStore from '../store/authStore';
import { isBiometricSigningEnabled, setBiometricSigningEnabled } from '../utils/biometricGate';
import { ViSectionLabel } from '../components-v2/ViChips';
import ViCard from '../components-v2/ViCard';
import HexRow from '../components/HexRow';
import { useThemePreference, type ThemePreference } from '../constants/themeContext';
import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const truncate = (s?: string, head = 6, tail = 4) =>
    s ? `${s.slice(0, head)}…${s.slice(-tail)}` : '';

export default function SettingsScreen() {
    const palette = useEhrPalette();
    const { user, logout } = useAuthStore();
    const navigation = useNavigation<any>();
    const { preference: themePref, setPreference: setThemePref } = useThemePreference();
    const [copied, setCopied] = useState(false);
    const [bioEnabled, setBioEnabled] = useState(true);

    useEffect(() => {
        isBiometricSigningEnabled().then(setBioEnabled).catch(() => setBioEnabled(true));
    }, []);

    const handleToggleBio = async (next: boolean) => {
        setBioEnabled(next);
        try {
            await setBiometricSigningEnabled(next);
        } catch (err) {
            setBioEnabled(!next);
            Alert.alert('Lỗi', 'Không lưu được thiết lập. Vui lòng thử lại.');
        }
    };

    const walletAddress = user?.walletAddress || (user as any)?.address || '';

    const copyAddress = async () => {
        if (!walletAddress) return;
        await Clipboard.setStringAsync(walletAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const openExplorer = () => {
        if (walletAddress) Linking.openURL(`https://sepolia.arbiscan.io/address/${walletAddress}`);
    };

    const openFaucet = () => {
        Linking.openURL('https://www.alchemy.com/faucets/arbitrum-sepolia');
    };

    const handleSignOut = () => {
        Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất khỏi ViEH?', [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Đăng xuất',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await logout();
                    } catch (err: any) {
                        Alert.alert('Lỗi đăng xuất', err?.message || 'Không thể đăng xuất.');
                    }
                },
            },
        ]);
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['bottom', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {/* Hero header */}
                <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 18 }}>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 32,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.6,
                            lineHeight: 36,
                        }}
                    >
                        Cài đặt
                    </Text>
                    <Text
                        style={{
                            marginTop: 4,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 18,
                        }}
                    >
                        Quản lý hồ sơ, ví blockchain và bảo mật của bạn.
                    </Text>
                </View>

                {/* ───────── Hồ sơ cá nhân ───────── */}
                <ViSectionLabel>Hồ sơ cá nhân</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
                    <ViCard padding={0}>
                        <Tile
                            icon={<UserIcon size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Thông tin cá nhân"
                            sub={user?.fullName || truncate(walletAddress, 6, 4) || 'Chưa cập nhật'}
                            onPress={() => navigation.navigate('EditProfile')}
                            last
                        />
                    </ViCard>
                </View>

                {/* ───────── Ví Blockchain ───────── G.12.c — HexRow pattern */}
                <ViSectionLabel>Ví blockchain</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
                    {walletAddress ? (
                        <HexRow
                            label="Địa chỉ ví (Arbitrum Sepolia)"
                            value={walletAddress}
                            head={8}
                            tail={6}
                            sheetTitle="Địa chỉ ví đầy đủ"
                        />
                    ) : (
                        <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_OUTLINE }}>
                            Chưa kết nối ví.
                        </Text>
                    )}
                    <XStack style={{ marginTop: 10, gap: 8 }}>
                        <SmallButton onPress={openExplorer} disabled={!walletAddress}>
                            Arbiscan ↗
                        </SmallButton>
                        <SmallButton onPress={openFaucet}>Faucet ↗</SmallButton>
                    </XStack>
                    <Text
                        style={{
                            marginTop: 12,
                            fontFamily: SANS,
                            fontSize: 11,
                            color: palette.EHR_OUTLINE,
                            lineHeight: 16,
                        }}
                    >
                        Khoá riêng do Web3Auth quản lý. ViEH không có quyền truy cập khoá.
                    </Text>
                </View>

                {/* ───────── Bảo mật & uỷ quyền ───────── */}
                <ViSectionLabel>Bảo mật & uỷ quyền</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
                    <ViCard padding={0}>
                        <Tile
                            icon={<Heart size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Người thân tin cậy"
                            sub="Người được giúp bạn trong tình huống cấp cứu"
                            onPress={() => navigation.navigate('TrustedContacts')}
                        />
                        <Tile
                            icon={<Clock size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Uỷ quyền cho bác sĩ"
                            sub="Toàn quyền truy cập có thời hạn"
                            onPress={() => navigation.navigate('Delegation')}
                        />
                        <Tile
                            icon={<ShieldCheck size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Hồ sơ khẩn cấp"
                            sub="Nhóm máu, dị ứng, người thân"
                            onPress={() => safeNavigate(navigation, 'EmergencyProfile', 'TrustedContacts')}
                        />
                        <BioToggleTile
                            value={bioEnabled}
                            onChange={handleToggleBio}
                            last
                        />
                    </ViCard>
                </View>

                {/* ───────── Giao diện ───────── */}
                <ViSectionLabel>Giao diện</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
                    <ViCard padding={0}>
                        <ThemeRow
                            icon={<Smartphone size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Tự động"
                            sub="Theo cài đặt hệ thống"
                            selected={themePref === 'auto'}
                            onPress={() => setThemePref('auto')}
                        />
                        <ThemeRow
                            icon={<Sun size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Sáng"
                            sub="Giấy gạo · ban ngày"
                            selected={themePref === 'light'}
                            onPress={() => setThemePref('light')}
                        />
                        <ThemeRow
                            icon={<Moon size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Tối"
                            sub="Mực đen · mặc định thương hiệu"
                            selected={themePref === 'dark'}
                            onPress={() => setThemePref('dark')}
                            last
                        />
                    </ViCard>
                </View>

                {/* ───────── Hỗ trợ ───────── */}
                <ViSectionLabel>Hỗ trợ</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
                    <ViCard padding={0}>
                        <Tile
                            icon={<HelpCircle size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Điều khoản & quyền riêng tư"
                            sub="TT 13/2025/TT-BYT · ND 13/2023/ND-CP"
                            onPress={() => Linking.openURL('https://moh.gov.vn')}
                            last
                        />
                    </ViCard>
                </View>

                {/* ───────── Đăng xuất ───────── */}
                <View style={{ paddingHorizontal: 20 }}>
                    <ViCard padding={0}>
                        <Tile
                            icon={<LogOut size={18} color={palette.EHR_PRIMARY} />}
                            title="Đăng xuất"
                            onPress={handleSignOut}
                            danger
                            last
                        />
                    </ViCard>
                </View>

                {/* Footer */}
                <Text
                    style={{
                        marginTop: 18,
                        textAlign: 'center',
                        fontFamily: SANS,
                        fontSize: 11,
                        color: palette.EHR_OUTLINE,
                        letterSpacing: 0.4,
                    }}
                >
                    ViEH · v1.0.0 · Đồ án tốt nghiệp
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

// ───────── Tile (icon + title + sub + chevron) ─────────
function Tile({
    icon,
    title,
    sub,
    onPress,
    danger,
    last,
}: {
    icon?: React.ReactNode;
    title: string;
    sub?: string;
    onPress?: () => void;
    danger?: boolean;
    last?: boolean;
}) {
    const palette = useEhrPalette();
    const fg = danger ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE;

    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderBottomWidth: last ? 0 : 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                {icon ? (
                    <View style={{ width: 20, alignItems: 'center' }}>{icon}</View>
                ) : null}
                <View style={{ flex: 1 }}>
                    <Text
                        style={{
                            fontFamily: SANS_MEDIUM,
                            fontSize: 14,
                            color: fg,
                        }}
                    >
                        {title}
                    </Text>
                    {sub ? (
                        <Text
                            style={{
                                marginTop: 2,
                                fontFamily: SANS,
                                fontSize: 11.5,
                                color: palette.EHR_OUTLINE,
                                lineHeight: 16,
                            }}
                            numberOfLines={2}
                        >
                            {sub}
                        </Text>
                    ) : null}
                </View>
            </View>
            {!danger && onPress ? (
                <ChevronRight size={16} color={palette.EHR_OUTLINE} />
            ) : null}
        </Pressable>
    );
}

// ───────── BioToggleTile (inline switch row) ─────────
function BioToggleTile({
    value,
    onChange,
    last,
}: {
    value: boolean;
    onChange: (next: boolean) => void;
    last?: boolean;
}) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderBottomWidth: last ? 0 : 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
            }}
        >
            <View style={{ width: 20, alignItems: 'center' }}>
                <Fingerprint size={18} color={palette.EHR_ON_SURFACE_VARIANT} />
            </View>
            <View style={{ flex: 1, marginLeft: 12, marginRight: 12 }}>
                <Text
                    style={{
                        fontFamily: SANS_MEDIUM,
                        fontSize: 14,
                        color: palette.EHR_ON_SURFACE,
                    }}
                >
                    Vân tay khi ký
                </Text>
                <Text
                    style={{
                        marginTop: 2,
                        fontFamily: SANS,
                        fontSize: 11.5,
                        color: palette.EHR_OUTLINE,
                        lineHeight: 16,
                    }}
                >
                    TT 13/2025/TT-BYT · sinh trắc là chữ ký pháp lý
                </Text>
            </View>
            <Switch
                value={value}
                onValueChange={onChange}
                trackColor={{ false: palette.EHR_OUTLINE_VARIANT, true: palette.EHR_PRIMARY }}
                thumbColor="#FAF7F1"
            />
        </View>
    );
}

// ───────── ThemeRow (radio-style row for Auto/Light/Dark) ─────────
function ThemeRow({
    icon,
    title,
    sub,
    selected,
    onPress,
    last,
}: {
    icon: React.ReactNode;
    title: string;
    sub: string;
    selected: boolean;
    onPress: () => void;
    last?: boolean;
}) {
    const palette = useEhrPalette();
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderBottomWidth: last ? 0 : 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <View style={{ width: 20, alignItems: 'center' }}>{icon}</View>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text
                    style={{
                        fontFamily: SANS_MEDIUM,
                        fontSize: 14,
                        color: palette.EHR_ON_SURFACE,
                    }}
                >
                    {title}
                </Text>
                <Text
                    style={{
                        marginTop: 2,
                        fontFamily: SANS,
                        fontSize: 11.5,
                        color: palette.EHR_OUTLINE,
                        lineHeight: 16,
                    }}
                >
                    {sub}
                </Text>
            </View>
            <View
                style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: selected ? 0 : 1.5,
                    borderColor: palette.EHR_OUTLINE,
                    backgroundColor: selected ? palette.EHR_PRIMARY : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {selected ? <Check size={14} color="#FBF8F1" strokeWidth={2.5} /> : null}
            </View>
        </Pressable>
    );
}

// ───────── SmallButton (ghost-style pill) ─────────
function SmallButton({
    children,
    onPress,
    disabled,
}: {
    children: React.ReactNode;
    onPress: () => void;
    disabled?: boolean;
}) {
    const palette = useEhrPalette();
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE,
                opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
            })}
        >
            <Text
                style={{
                    fontFamily: SANS_MEDIUM,
                    fontSize: 12.5,
                    color: palette.EHR_ON_SURFACE,
                }}
            >
                {children}
            </Text>
        </Pressable>
    );
}

// safeNavigate — fall back to alternate route if primary is not registered
function safeNavigate(navigation: any, primary: string, fallback: string) {
    try {
        navigation.navigate(primary);
    } catch {
        navigation.navigate(fallback);
    }
}

// Suppress unused import warning for palette.EHR_TERTIARY (kept available for future
// jade-accent variants without re-editing imports).
