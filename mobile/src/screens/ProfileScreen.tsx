import React, { useState, useEffect } from 'react';
import { Alert, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
    User, LogOut, Shield, Droplets, ChevronRight,
    Edit3, Calendar, Settings, Info, Wallet, Copy, UserCheck, QrCode, Siren,
} from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDelay,
    interpolate,
} from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';

import LoadingSpinner from '../components/LoadingSpinner';
import MyAddressModal from '../components/MyAddressModal';
import RoleSwitcher from '../components/RoleSwitcher';
import profileService from '../services/profile.service';
import useAuthStore from '../store/authStore';
import {
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SECONDARY,
    EHR_SECONDARY_CONTAINER,
    EHR_SHADOW,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

const SPRING = { damping: 18, stiffness: 120, mass: 0.8 };

export default function ProfileScreen() {
    const navigation = useNavigation<any>();
    const { user, logout, token } = useAuthStore();
    const [profile, setProfile] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [addressModalOpen, setAddressModalOpen] = useState(false);

    const enter = useSharedValue(0);
    const cardEnter = useSharedValue(0);
    const menuEnter = useSharedValue(0);

    useEffect(() => {
        enter.value = withSpring(1, SPRING);
        cardEnter.value = withDelay(100, withSpring(1, SPRING));
        menuEnter.value = withDelay(200, withSpring(1, SPRING));
    }, []);

    const avatarStyle = useAnimatedStyle(() => ({
        opacity: interpolate(enter.value, [0, 0.3, 1], [0, 0.5, 1]),
        transform: [
            { perspective: 800 },
            { translateY: interpolate(enter.value, [0, 1], [20, 0]) },
            { scale: interpolate(enter.value, [0, 1], [0.9, 1]) },
        ],
    }));

    const cardStyle = useAnimatedStyle(() => ({
        opacity: interpolate(cardEnter.value, [0, 0.3, 1], [0, 0.6, 1]),
        transform: [
            { perspective: 800 },
            { translateY: interpolate(cardEnter.value, [0, 1], [18, 0]) },
            { rotateX: `${interpolate(cardEnter.value, [0, 1], [6, 0])}deg` },
        ],
    }));

    const menuStyle = useAnimatedStyle(() => ({
        opacity: interpolate(menuEnter.value, [0, 0.3, 1], [0, 0.6, 1]),
        transform: [
            { translateY: interpolate(menuEnter.value, [0, 1], [16, 0]) },
        ],
    }));

    useEffect(() => {
        const fetchProfile = async () => {
            if (!token) { setIsLoading(false); return; }
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

    const handleSaveProfile = async () => {
        try {
            if (!profile) return;
            setIsLoading(true);
            const updated = await profileService.updateMyProfile(profile);
            setProfile(updated || profile);
            Alert.alert('Thành công', 'Đã cập nhật thông tin cá nhân.');
        } catch (error: any) {
            Alert.alert('Lỗi', error?.message || 'Không thể cập nhật hồ sơ.');
        } finally {
            setIsLoading(false);
        }
    };

    const copyAddress = async () => {
        const addr = userData.walletAddress || userData.address;
        if (addr) {
            await Clipboard.setStringAsync(addr);
            Alert.alert('Đã sao chép', 'Địa chỉ ví đã được sao chép.');
        }
    };

    if (isLoading) return <LoadingSpinner message="Đang tải thông tin cá nhân..." />;

    const userData = { ...(user || {}), ...(profile || {}) };
    const truncateAddress = (addr?: string) => (addr ? `${addr.substring(0, 10)}...${addr.slice(-6)}` : '0x000...');

    const genderDisplay =
        userData.gender === 'MALE' || userData.gender === 'male' ? 'Nam'
        : userData.gender === 'FEMALE' || userData.gender === 'female' ? 'Nữ'
        : userData.gender ? 'Khác' : 'Chưa rõ';

    const MenuItem = ({ icon: Icon, label, onPress, destructive = false }: {
        icon?: any; label: string; onPress?: () => void; destructive?: boolean;
    }) => (
        <Pressable onPress={onPress} style={({ pressed }) => [s.menuItem, pressed && { backgroundColor: EHR_SURFACE_LOW }]}>
            <XStack style={{ alignItems: 'center', flex: 1 }}>
                {Icon ? <Icon size={18} color={destructive ? '#DC2626' : EHR_ON_SURFACE_VARIANT} style={{ marginRight: 12 }} /> : null}
                <Text style={[s.menuLabel, destructive && { color: '#DC2626', fontWeight: '700' }]}>{label}</Text>
            </XStack>
            {destructive ? (
                <LogOut size={18} color="#DC2626" />
            ) : (
                <ChevronRight size={16} color={EHR_OUTLINE_VARIANT} />
            )}
        </Pressable>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['right', 'left']}>
            <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                <RoleSwitcher />
                <View style={{ height: 16 }} />

                {/* ── Avatar section ── */}
                <Animated.View style={avatarStyle}>
                    <YStack style={s.avatarSection}>
                        <View style={s.avatarCircle}>
                            <User size={40} color={EHR_PRIMARY} />
                        </View>
                        <Text style={s.userName}>{userData.fullName || 'Chưa cập nhật tên'}</Text>

                        <Pressable onPress={() => setAddressModalOpen(true)} style={s.addressRow}>
                            <Wallet size={12} color={EHR_ON_SURFACE_VARIANT} />
                            <Text style={s.addressText}>
                                {truncateAddress(userData.walletAddress || userData.address)}
                            </Text>
                            <QrCode size={12} color={EHR_PRIMARY} />
                        </Pressable>

                        <View style={s.verifiedBadge}>
                            <Shield size={12} color={EHR_PRIMARY} />
                            <Text style={s.verifiedText}>Blockchain Verified</Text>
                        </View>
                    </YStack>
                </Animated.View>

                {/* ── Health info card ── */}
                <Animated.View style={cardStyle}>
                    <View style={s.healthCard}>
                        <XStack style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={s.cardTitle}>Thông tin sức khoẻ</Text>
                            <Pressable onPress={() => navigation.navigate('EditProfile')} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Edit3 size={13} color={EHR_PRIMARY} />
                                <Text style={s.editLink}>Sửa</Text>
                            </Pressable>
                        </XStack>

                        <XStack style={{ flexWrap: 'wrap' }}>
                            {/* Blood type */}
                            <YStack style={s.healthItem}>
                                <View style={[s.healthIcon, { backgroundColor: EHR_SECONDARY_CONTAINER }]}>
                                    <Droplets size={16} color={EHR_SECONDARY} />
                                </View>
                                <Text style={s.healthLabel}>Nhóm máu</Text>
                                <Text style={s.healthValue}>{userData.bloodType || 'Chưa rõ'}</Text>
                            </YStack>

                            {/* Gender */}
                            <YStack style={s.healthItem}>
                                <View style={[s.healthIcon, { backgroundColor: EHR_PRIMARY_FIXED }]}>
                                    <User size={16} color={EHR_PRIMARY} />
                                </View>
                                <Text style={s.healthLabel}>Giới tính</Text>
                                <Text style={s.healthValue}>{genderDisplay}</Text>
                            </YStack>

                            {/* Birth year */}
                            <YStack style={s.healthItem}>
                                <View style={[s.healthIcon, { backgroundColor: EHR_SURFACE_LOW }]}>
                                    <Calendar size={16} color={EHR_PRIMARY} />
                                </View>
                                <Text style={s.healthLabel}>Năm sinh</Text>
                                <Text style={s.healthValue}>
                                    {userData.dateOfBirth
                                        ? new Date(userData.dateOfBirth).getFullYear()
                                        : userData.DOB || 'Chưa rõ'}
                                </Text>
                            </YStack>
                        </XStack>

                        <View style={s.divider} />
                        <Text style={s.healthLabel}>Dị ứng và ghi chú</Text>
                        <Text style={s.allergyText}>
                            {userData.allergies || 'Không có ghi nhận dị ứng y tế đặc biệt.'}
                        </Text>
                    </View>
                </Animated.View>

                {/* ── Menu items ── */}
                <Animated.View style={menuStyle}>
                    <View style={s.menuCard}>
                        <MenuItem icon={QrCode} label="Địa chỉ của tôi (QR)" onPress={() => setAddressModalOpen(true)} />
                        <MenuItem icon={Settings} label="Cài đặt và ví" onPress={() => navigation.navigate('Settings')} />
                        <MenuItem icon={Edit3} label="Chỉnh sửa hồ sơ" onPress={() => navigation.navigate('EditProfile')} />
                        <MenuItem icon={Shield} label="Quản lý bảo mật" onPress={() => navigation.navigate('Settings')} />
                        <MenuItem icon={UserCheck} label="Ủy quyền" onPress={() => navigation.navigate('Delegation')} />
                        <MenuItem icon={Siren} label="Quyền khẩn cấp" onPress={() => navigation.navigate('EmergencyAccessLog')} />
                        <MenuItem icon={Info} label="Về ứng dụng" onPress={() => Alert.alert('EHR Chain', 'Hệ thống lưu trữ hồ sơ bệnh án phi tập trung.\nPhiên bản: 1.0.0-beta\nMạng: Arbitrum Sepolia')} />
                        <MenuItem label="Đăng xuất" onPress={handleLogout} destructive />
                    </View>
                </Animated.View>
            </ScrollView>

            <MyAddressModal
                visible={addressModalOpen}
                onClose={() => setAddressModalOpen(false)}
                address={userData.walletAddress || userData.address}
                displayName={userData.fullName}
                role={userData.role || user?.role}
            />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    scrollContent: { padding: 20, paddingBottom: 100 },
    // Avatar
    avatarSection: { alignItems: 'center', marginBottom: 24 },
    avatarCircle: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: EHR_PRIMARY_FIXED,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
        shadowColor: EHR_SHADOW,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 3,
    },
    userName: {
        fontSize: 22,
        fontWeight: '800',
        color: EHR_ON_SURFACE,
        marginBottom: 8,
    },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: EHR_SURFACE_LOW,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        marginBottom: 10,
    },
    addressText: {
        fontSize: 12,
        fontFamily: 'monospace',
        color: EHR_ON_SURFACE_VARIANT,
    },
    verifiedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: EHR_PRIMARY_FIXED,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    verifiedText: {
        fontSize: 10,
        fontWeight: '700',
        color: EHR_PRIMARY,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    // Health card
    healthCard: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderColor: EHR_OUTLINE_VARIANT,
        borderWidth: 1,
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        shadowColor: EHR_SHADOW,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 2,
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
    },
    editLink: {
        fontSize: 13,
        fontWeight: '600',
        color: EHR_PRIMARY,
        marginLeft: 4,
    },
    healthItem: {
        width: '33.33%',
        alignItems: 'center',
        marginBottom: 14,
    },
    healthIcon: {
        width: 42,
        height: 42,
        borderRadius: 21,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    healthLabel: {
        fontSize: 10,
        color: EHR_ON_SURFACE_VARIANT,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 2,
    },
    healthValue: {
        fontSize: 15,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
    },
    divider: {
        height: 1,
        backgroundColor: EHR_OUTLINE_VARIANT,
        marginVertical: 14,
    },
    allergyText: {
        fontSize: 13,
        color: EHR_ON_SURFACE_VARIANT,
        lineHeight: 20,
        marginTop: 4,
    },
    // Menu
    menuCard: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderColor: EHR_OUTLINE_VARIANT,
        borderWidth: 1,
        borderRadius: 20,
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        borderBottomColor: `${EHR_OUTLINE_VARIANT}60`,
    },
    menuLabel: {
        fontSize: 15,
        fontWeight: '500',
        color: EHR_ON_SURFACE,
    },
});
