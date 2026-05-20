// ProfileScreen v2 — port of .design-bundle/project/screens-patient.jsx
// ProfileScreen. Editorial serif name + Vi monogram avatar + verified badge +
// health info ViCard (blood / gender / dob / allergies) + sectioned tile menu.
//
// Wiring preserved:
//   - profileService.getMyProfile + updateMyProfile
//   - useAuthStore (user + logout)
//   - MyAddressModal for QR / full address copy
//   - RoleSwitcher (multi-role tab toggle)
//   - Navigation routes: EditProfile, Settings, Delegation, EmergencyProfile

import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Text, XStack, YStack } from 'tamagui';
import {
    User,
    LogOut,
    Droplets,
    ChevronRight,
    Edit3,
    Calendar,
    Settings,
    Info,
    UserCheck,
    QrCode,
    Siren,
    Sun,
    Moon,
    Smartphone,
    Check,
} from 'lucide-react-native';

import LoadingSpinner from '../components/LoadingSpinner';
import MyAddressModal from '../components/MyAddressModal';
import RoleSwitcher from '../components/RoleSwitcher';
import UserChip from '../components/UserChip';
import HexRow from '../components/HexRow';
import profileService from '../services/profile.service';
import useAuthStore from '../store/authStore';
import ViCard from '../components-v2/ViCard';
import { ViSectionLabel } from '../components-v2/ViChips';
import { useEhrPalette } from '../constants/uiColors';
import { useThemePreference, type ThemePreference } from '../constants/themeContext';

const SERIF = 'Fraunces_400Regular';
const SERIF_MEDIUM = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '0x000…0000');

function firstInitial(fullName?: string) {
    if (!fullName) return 'V';
    const parts = fullName.trim().split(/\s+/);
    return (parts[parts.length - 1] || fullName)[0]?.toUpperCase() || 'V';
}

export default function ProfileScreen() {
    const palette = useEhrPalette();
    const navigation = useNavigation<any>();
    const { user, logout, token } = useAuthStore();
    const { preference: themePref, setPreference: setThemePref } = useThemePreference();
    const [profile, setProfile] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [addressModalOpen, setAddressModalOpen] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!token) {
                setIsLoading(false);
                return;
            }
            try {
                const data = await profileService.getMyProfile();
                setProfile(data);
            } catch (error: any) {
                console.warn('Failed to fetch profile', error?.message || error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    }, [token]);

    const handleLogout = () => {
        Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất khỏi thiết bị này?', [
            { text: 'Huỷ', style: 'cancel' },
            { text: 'Đăng xuất', style: 'destructive', onPress: () => logout() },
        ]);
    };

    if (isLoading) return <LoadingSpinner message="Đang tải thông tin cá nhân..." />;

    const userData = { ...(user || {}), ...(profile || {}) };
    const genderDisplay =
        userData.gender === 'MALE' || userData.gender === 'male' ? 'Nam'
            : userData.gender === 'FEMALE' || userData.gender === 'female' ? 'Nữ'
                : userData.gender ? 'Khác' : 'Chưa rõ';
    const birthYear = userData.dateOfBirth
        ? new Date(userData.dateOfBirth).getFullYear()
        : userData.DOB || 'Chưa rõ';

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: 80, paddingTop: 14 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Role switcher top-right */}
                <View style={{ alignItems: 'flex-end', paddingHorizontal: 20, marginBottom: 10 }}>
                    <RoleSwitcher />
                </View>

                {/* Avatar + name */}
                <View style={{ alignItems: 'center', paddingHorizontal: 20, marginBottom: 18 }}>
                    <View
                        style={{
                            width: 80,
                            height: 80,
                            borderRadius: 40,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderWidth: 0.75,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 14,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SERIF_MEDIUM,
                                fontSize: 36,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 40,
                            }}
                        >
                            {firstInitial(userData.fullName)}
                        </Text>
                    </View>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 24,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.3,
                            lineHeight: 28,
                            textAlign: 'center',
                        }}
                    >
                        {userData.fullName || 'Chưa cập nhật tên'}
                    </Text>
                    {/* G.12.c — HexRow replaces inline wallet pill */}
                    {userData.walletAddress || (userData as any).address ? (
                        <View style={{ marginTop: 14, alignSelf: 'stretch' }}>
                            <HexRow
                                label="Mã ví của bạn"
                                value={userData.walletAddress || (userData as any).address}
                                head={6}
                                tail={4}
                                sheetTitle="Mã ví đầy đủ"
                            />
                        </View>
                    ) : null}
                    {/* Canonical identity card — same UserChip used everywhere else
                        (Design G.7: replace hard-coded role line with UserChip(self)) */}
                    <View
                        style={{
                            marginTop: 14,
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderRadius: 12,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            alignSelf: 'stretch',
                        }}
                    >
                        <UserChip
                            address={userData.walletAddress || (userData as any).address}
                            expanded
                            showAddress={false}
                            interactive={false}
                            fallbackName={userData.fullName}
                        />
                    </View>
                </View>

                {/* Health info */}
                <ViSectionLabel trailing={
                    <Text
                        style={{ fontFamily: SANS_SEMI, fontSize: 11, color: palette.EHR_PRIMARY, fontWeight: '600' }}
                        onPress={() => navigation.navigate('EditProfile')}
                    >
                        Sửa
                    </Text>
                }>
                    Thông tin sức khoẻ
                </ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
                    <ViCard padding={16}>
                        <XStack style={{ justifyContent: 'space-around', marginBottom: 16 }}>
                            <HealthItem
                                icon={<Droplets size={16} color={palette.EHR_SECONDARY} />}
                                label="Nhóm máu"
                                value={userData.bloodType || '—'}
                                tint={palette.EHR_SECONDARY}
                            />
                            <HealthItem
                                icon={<User size={16} color={palette.EHR_PRIMARY} />}
                                label="Giới tính"
                                value={genderDisplay}
                                tint={palette.EHR_PRIMARY}
                            />
                            <HealthItem
                                icon={<Calendar size={16} color={palette.EHR_TERTIARY} />}
                                label="Năm sinh"
                                value={String(birthYear)}
                                tint={palette.EHR_TERTIARY}
                            />
                        </XStack>
                        <View
                            style={{
                                height: 0.5,
                                backgroundColor: palette.EHR_OUTLINE_SOFT,
                                marginBottom: 12,
                            }}
                        />
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 10.5,
                                color: palette.EHR_TEXT_MUTED,
                                letterSpacing: 0.6,
                                textTransform: 'uppercase',
                                fontWeight: '600',
                                marginBottom: 4,
                            }}
                        >
                            Dị ứng & ghi chú
                        </Text>
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_ON_SURFACE,
                                lineHeight: 19,
                            }}
                        >
                            {userData.allergies || 'Không có ghi nhận dị ứng y tế đặc biệt.'}
                        </Text>
                    </ViCard>
                </View>

                {/* Menu */}
                <ViSectionLabel>Tài khoản & ví</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
                    <ViCard padding={0}>
                        <MenuRow icon={<QrCode size={16} color={palette.EHR_ON_SURFACE_VARIANT} />} label="Địa chỉ của tôi (QR)" onPress={() => setAddressModalOpen(true)} />
                        <MenuRow icon={<Settings size={16} color={palette.EHR_ON_SURFACE_VARIANT} />} label="Cài đặt & ví" onPress={() => navigation.navigate('Settings')} />
                        <MenuRow icon={<Edit3 size={16} color={palette.EHR_ON_SURFACE_VARIANT} />} label="Chỉnh sửa hồ sơ" onPress={() => navigation.navigate('EditProfile')} />
                        <MenuRow icon={<UserCheck size={16} color={palette.EHR_ON_SURFACE_VARIANT} />} label="Uỷ quyền cho bác sĩ" onPress={() => navigation.navigate('Delegation')} />
                        <MenuRow icon={<Siren size={16} color={palette.EHR_ON_SURFACE_VARIANT} />} label="Hồ sơ khẩn cấp" onPress={() => navigation.navigate('EmergencyProfile')} last />
                    </ViCard>
                </View>

                {/* G.12 — Giao diện section per user request: theme toggle visible on Profile tab */}
                <ViSectionLabel>Giao diện</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
                    <ViCard padding={0}>
                        <ThemeRow
                            icon={<Smartphone size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Tự động"
                            sub="Theo cài đặt hệ thống"
                            selected={themePref === 'auto'}
                            onPress={() => setThemePref('auto')}
                            palette={palette}
                        />
                        <ThemeRow
                            icon={<Sun size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Sáng"
                            sub="Giấy gạo · ban ngày"
                            selected={themePref === 'light'}
                            onPress={() => setThemePref('light')}
                            palette={palette}
                        />
                        <ThemeRow
                            icon={<Moon size={18} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            title="Tối"
                            sub="Mực đen · mặc định thương hiệu"
                            selected={themePref === 'dark'}
                            onPress={() => setThemePref('dark')}
                            palette={palette}
                            last
                        />
                    </ViCard>
                </View>

                <ViSectionLabel>Hỗ trợ</ViSectionLabel>
                <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
                    <ViCard padding={0}>
                        <MenuRow
                            icon={<Info size={16} color={palette.EHR_ON_SURFACE_VARIANT} />}
                            label="Về ViEH"
                            onPress={() =>
                                Alert.alert(
                                    'ViEH',
                                    'Hệ thống lưu trữ hồ sơ bệnh án phi tập trung.\nv1.0.0-beta · Arbitrum Sepolia',
                                )
                            }
                            last
                        />
                    </ViCard>
                </View>

                {/* Sign out */}
                <View style={{ paddingHorizontal: 20 }}>
                    <ViCard padding={0}>
                        <MenuRow
                            icon={<LogOut size={16} color={palette.EHR_PRIMARY} />}
                            label="Đăng xuất"
                            onPress={handleLogout}
                            danger
                            last
                        />
                    </ViCard>
                </View>
            </ScrollView>

            <MyAddressModal
                visible={addressModalOpen}
                onClose={() => setAddressModalOpen(false)}
                address={userData.walletAddress || (userData as any).address}
                displayName={userData.fullName}
                role={userData.role || user?.role}
            />
        </SafeAreaView>
    );
}

function HealthItem({
    icon,
    label,
    value,
    tint,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    tint: string;
}) {
    const palette = useEhrPalette();
    return (
        <YStack style={{ alignItems: 'center', flex: 1 }}>
            <View
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: `${tint}1A`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                }}
            >
                {icon}
            </View>
            <Text
                style={{
                    fontFamily: SANS_SEMI,
                    fontSize: 10,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    fontWeight: '600',
                    marginBottom: 2,
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    fontFamily: SERIF,
                    fontSize: 16,
                    color: palette.EHR_ON_SURFACE,
                    letterSpacing: -0.2,
                }}
            >
                {value}
            </Text>
        </YStack>
    );
}

function MenuRow({
    icon,
    label,
    onPress,
    danger,
    last,
}: {
    icon: React.ReactNode;
    label: string;
    onPress?: () => void;
    danger?: boolean;
    last?: boolean;
}) {
    const palette = useEhrPalette();
    return (
        <Pressable
            onPress={onPress}
            disabled={!onPress}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderBottomWidth: last ? 0 : 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <View style={{ width: 20, alignItems: 'center' }}>{icon}</View>
            <Text
                style={{
                    flex: 1,
                    fontFamily: SANS_MEDIUM,
                    fontSize: 14,
                    color: danger ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE,
                    fontWeight: '500',
                }}
            >
                {label}
            </Text>
            {!danger ? <ChevronRight size={16} color={palette.EHR_TEXT_MUTED} /> : null}
        </Pressable>
    );
}

// ───────── ThemeRow (3-radio choice for theme preference) ─────────
function ThemeRow({
    icon,
    title,
    sub,
    selected,
    onPress,
    palette,
    last,
}: {
    icon: React.ReactNode;
    title: string;
    sub: string;
    selected: boolean;
    onPress: () => void;
    palette: ReturnType<typeof useEhrPalette>;
    last?: boolean;
}) {
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
                        color: palette.EHR_TEXT_MUTED,
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

