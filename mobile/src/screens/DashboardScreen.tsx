import React, { useEffect } from 'react';
import { ScrollView, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileText, Bell, ChevronRight, FilePlus2, Activity, Share2, Wallet } from 'lucide-react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDelay,
    interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import RecordCard from '../components/RecordCard';
import RoleSwitcher from '../components/RoleSwitcher';
import EmptyState from '../components/EmptyState';
import useAuthStore from '../store/authStore';
import useRecords from '../hooks/useRecords';
import useRequests from '../hooks/useRequests';
import {
    EHR_ON_PRIMARY,
    EHR_ON_PRIMARY_CONTAINER,
    EHR_ON_SECONDARY_CONTAINER,
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
    EHR_SURFACE_CONTAINER,
    EHR_SURFACE_HIGH,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

const SPRING = { damping: 18, stiffness: 120, mass: 0.8 };
const PRESS_SPRING = { damping: 14, stiffness: 200 };

// ── Animated wrapper: 3D entrance + press feedback ──
function MetricCard3D({
    children,
    onPress,
    delay = 0,
}: {
    children: React.ReactNode;
    onPress: () => void;
    delay?: number;
}) {
    const enter = useSharedValue(0);
    const pressVal = useSharedValue(0);

    useEffect(() => {
        enter.value = withDelay(delay, withSpring(1, SPRING));
    }, []);

    const enterStyle = useAnimatedStyle(() => ({
        opacity: interpolate(enter.value, [0, 0.3, 1], [0, 0.5, 1]),
        transform: [
            { perspective: 800 },
            { translateY: interpolate(enter.value, [0, 1], [28, 0]) },
            { scale: interpolate(enter.value, [0, 1], [0.93, 1]) },
            { rotateX: `${interpolate(enter.value, [0, 1], [12, 0])}deg` },
        ],
    }));

    const pressStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 1000 },
            { scale: interpolate(pressVal.value, [0, 1], [1, 0.96]) },
            { rotateX: `${interpolate(pressVal.value, [0, 1], [0, 3])}deg` },
        ],
    }));

    return (
        <Animated.View style={[{ flex: 1 }, enterStyle]}>
            <Pressable
                style={{ flex: 1 }}
                onPress={onPress}
                onPressIn={() => { pressVal.value = withSpring(1, PRESS_SPRING); }}
                onPressOut={() => { pressVal.value = withSpring(0, PRESS_SPRING); }}
            >
                <Animated.View style={pressStyle}>{children}</Animated.View>
            </Pressable>
        </Animated.View>
    );
}

function AnimatedCTA({
    children,
    onPress,
    delay = 0,
}: {
    children: React.ReactNode;
    onPress: () => void;
    delay?: number;
}) {
    const enter = useSharedValue(0);
    const pressVal = useSharedValue(0);

    useEffect(() => {
        enter.value = withDelay(delay, withSpring(1, SPRING));
    }, []);

    const enterStyle = useAnimatedStyle(() => ({
        opacity: interpolate(enter.value, [0, 0.4, 1], [0, 0.6, 1]),
        transform: [
            { perspective: 800 },
            { translateY: interpolate(enter.value, [0, 1], [20, 0]) },
            { scale: interpolate(enter.value, [0, 1], [0.95, 1]) },
        ],
    }));

    const pressStyle = useAnimatedStyle(() => ({
        transform: [{ scale: interpolate(pressVal.value, [0, 1], [1, 0.97]) }],
    }));

    return (
        <Animated.View style={enterStyle}>
            <Pressable
                onPress={onPress}
                onPressIn={() => { pressVal.value = withSpring(1, PRESS_SPRING); }}
                onPressOut={() => { pressVal.value = withSpring(0, PRESS_SPRING); }}
            >
                <Animated.View style={pressStyle}>{children}</Animated.View>
            </Pressable>
        </Animated.View>
    );
}

// ── Truncate wallet address ──
const truncateAddr = (addr?: string) =>
    addr ? `${addr.substring(0, 6)}...${addr.slice(-4)}` : '0x000...';

export default function DashboardScreen({ navigation }: any) {
    const { user } = useAuthStore();
    const { records, isLoading: recordsLoading } = useRecords();
    const { requests, isLoading: requestsLoading } = useRequests();

    const recentRecords = (records || []).slice(0, 3);
    const pendingCount = requests.length;
    const totalRecords = records.length;
    // count records that have been shared
    const sharedCount = (records || []).filter((r: any) => r.sharedWith?.length > 0 || r.status === 'shared').length;

    const headerEnter = useSharedValue(0);
    const listEnter = useSharedValue(0);

    useEffect(() => {
        headerEnter.value = withSpring(1, SPRING);
        listEnter.value = withDelay(350, withSpring(1, SPRING));
    }, []);

    const headerStyle = useAnimatedStyle(() => ({
        opacity: interpolate(headerEnter.value, [0, 0.3, 1], [0, 0.6, 1]),
        transform: [{ translateY: interpolate(headerEnter.value, [0, 1], [16, 0]) }],
    }));

    const listStyle = useAnimatedStyle(() => ({
        opacity: interpolate(listEnter.value, [0, 0.3, 1], [0, 0.5, 1]),
        transform: [{ translateY: interpolate(listEnter.value, [0, 1], [22, 0]) }],
    }));

    const handleRecordPress = (record: any) => {
        const serializableRecord = {
            ...record,
            createdAt: record?.createdAt instanceof Date ? record.createdAt.toISOString() : record?.createdAt || null,
        };
        navigation.navigate('RecordDetail', { record: serializableRecord });
    };

    const handleCreateRecord = () => {
        navigation.navigate('CreateRecord');
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
                {/* ── Header: greeting + wallet badge ── */}
                <Animated.View style={headerStyle}>
                    <XStack style={s.headerRow}>
                        <YStack style={{ flex: 1, marginRight: 12 }}>
                            <Text style={s.greeting}>
                                Xin chào, {user?.fullName || 'Bệnh nhân'}
                            </Text>
                            <XStack style={s.walletBadge}>
                                <Wallet size={12} color={EHR_SECONDARY} />
                                <Text style={s.walletAddr}>
                                    {truncateAddr(user?.walletAddress || user?.address)}
                                </Text>
                                <View style={s.chainPill}>
                                    <Text style={s.chainText}>Arbitrum</Text>
                                </View>
                            </XStack>
                        </YStack>
                        <RoleSwitcher />
                    </XStack>
                </Animated.View>

                {/* ── 3D Metric Cards (2‑column grid) ── */}
                <XStack style={{ gap: 12, marginBottom: 20 }}>
                    <MetricCard3D onPress={() => navigation.navigate('Records')} delay={80}>
                        <View style={s.metricCard}>
                            <XStack style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <View style={s.metricIcon}>
                                    <FileText size={20} color={EHR_PRIMARY} />
                                </View>
                                <Text style={s.metricLabel}>Hồ sơ</Text>
                            </XStack>
                            {recordsLoading ? (
                                <ActivityIndicator size="small" color={EHR_PRIMARY} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
                            ) : (
                                <Text style={s.metricValue}>{totalRecords}</Text>
                            )}
                        </View>
                    </MetricCard3D>

                    <MetricCard3D onPress={() => navigation.navigate('Records')} delay={160}>
                        <View style={s.metricCard}>
                            <XStack style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <View style={[s.metricIcon, { backgroundColor: EHR_SURFACE_LOW }]}>
                                    <Share2 size={20} color={EHR_SECONDARY} />
                                </View>
                                <Text style={s.metricLabel}>Chia sẻ</Text>
                            </XStack>
                            {recordsLoading ? (
                                <ActivityIndicator size="small" color={EHR_SECONDARY} style={{ marginTop: 12, alignSelf: 'flex-start' }} />
                            ) : (
                                <Text style={s.metricValue}>{sharedCount}</Text>
                            )}
                        </View>
                    </MetricCard3D>
                </XStack>

                {/* ── Pending requests wide card ── */}
                <MetricCard3D onPress={() => navigation.navigate('Requests')} delay={240}>
                    <View style={s.pendingCard}>
                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                            <XStack style={{ alignItems: 'center', flex: 1 }}>
                                <View style={s.pendingIcon}>
                                    <Bell size={20} color={EHR_ON_SECONDARY_CONTAINER} />
                                </View>
                                <Text style={s.pendingLabel}>Yêu cầu chờ xác nhận</Text>
                            </XStack>
                            {requestsLoading ? (
                                <ActivityIndicator size="small" color={EHR_SECONDARY} />
                            ) : (
                                <Text style={s.pendingValue}>{pendingCount}</Text>
                            )}
                        </XStack>
                    </View>
                </MetricCard3D>

                {/* ── Create Record CTA ── */}
                <AnimatedCTA onPress={handleCreateRecord} delay={320}>
                    <View style={s.ctaWrap}>
                        <LinearGradient
                            colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={s.ctaGradient}
                        >
                            <XStack style={{ alignItems: 'center', flex: 1, marginRight: 12 }}>
                                <View style={s.ctaIcon}>
                                    <FilePlus2 size={22} color={EHR_ON_PRIMARY} />
                                </View>
                                <YStack style={{ flex: 1 }}>
                                    <Text style={s.ctaTitle}>Tạo hồ sơ mới</Text>
                                    <Text style={s.ctaSubtitle}>
                                        Thêm hồ sơ mã hoá, lưu IPFS và đăng ký lên blockchain.
                                    </Text>
                                </YStack>
                            </XStack>
                            <ChevronRight size={18} color={EHR_ON_PRIMARY} />
                        </LinearGradient>
                    </View>
                </AnimatedCTA>

                {/* ── Recent Records ── */}
                <Animated.View style={listStyle}>
                    <XStack style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>Hồ sơ gần đây</Text>
                        <Pressable onPress={() => navigation.navigate('Records')} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={s.seeAll}>Xem tất cả</Text>
                            <ChevronRight size={14} color={EHR_SECONDARY} />
                        </Pressable>
                    </XStack>

                    {recordsLoading ? (
                        <View style={s.loadingCard}>
                            <ActivityIndicator size="large" color={EHR_PRIMARY} style={{ marginBottom: 12 }} />
                            <Text color="$color10">Đang tải hồ sơ...</Text>
                        </View>
                    ) : recentRecords.length === 0 ? (
                        <View style={s.emptyWrap}>
                            <EmptyState
                                icon={Activity}
                                title="Chưa có hồ sơ nào"
                                description="Tạo hồ sơ đầu tiên để bắt đầu lưu trữ dữ liệu y tế trên blockchain."
                                actionLabel="Tạo hồ sơ"
                                onAction={handleCreateRecord}
                            />
                        </View>
                    ) : (
                        <YStack>
                            {recentRecords.map((record: any) => (
                                <RecordCard key={record.cidHash} record={record} onPress={handleRecordPress} />
                            ))}
                        </YStack>
                    )}

                    {/* ── Pending requests banner ── */}
                    {pendingCount > 0 ? (
                        <AnimatedCTA onPress={() => navigation.navigate('Requests')} delay={0}>
                            <View style={{ marginTop: 24 }}>
                                <Text style={s.sectionTitle}>Yêu cầu đang chờ xử lý</Text>
                                <View style={s.requestBanner}>
                                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                                        <XStack style={{ alignItems: 'center', flex: 1 }}>
                                            <View style={s.requestBannerIcon}>
                                                <Bell size={18} color={EHR_SECONDARY} />
                                            </View>
                                            <YStack style={{ flex: 1 }}>
                                                <Text style={s.requestBannerTitle}>{pendingCount} yêu cầu truy cập mới</Text>
                                                <Text style={s.requestBannerSub}>Bác sĩ đang chờ duyệt quyền xem hồ sơ</Text>
                                            </YStack>
                                        </XStack>
                                        <ChevronRight size={18} color={EHR_SECONDARY} />
                                    </XStack>
                                </View>
                            </View>
                        </AnimatedCTA>
                    ) : null}

                    {/* ── Decorative trust banner ── */}
                    <View style={s.trustBanner}>
                        <LinearGradient
                            colors={[EHR_PRIMARY, 'transparent']}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={s.trustGradient}
                        >
                            <Text style={s.trustText}>
                                Dữ liệu của bạn được mã hóa đầu cuối và lưu trữ an toàn trên Blockchain.
                            </Text>
                        </LinearGradient>
                    </View>
                </Animated.View>
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
    },
    // Header
    headerRow: {
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    greeting: {
        fontSize: 28,
        fontWeight: '800',
        color: EHR_ON_SURFACE,
        letterSpacing: -0.5,
        marginBottom: 6,
    },
    walletBadge: {
        alignItems: 'center',
        gap: 6,
        backgroundColor: EHR_SURFACE_LOW,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
    },
    walletAddr: {
        fontSize: 11,
        fontWeight: '500',
        color: EHR_ON_SURFACE_VARIANT,
        fontFamily: 'monospace',
    },
    chainPill: {
        backgroundColor: `${EHR_PRIMARY}18`,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    chainText: {
        fontSize: 9,
        fontWeight: '700',
        color: EHR_PRIMARY,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    // Metric cards
    metricCard: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderRadius: 20,
        padding: 20,
        shadowColor: EHR_SHADOW,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 20,
        elevation: 3,
    },
    metricIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: EHR_PRIMARY_FIXED,
        alignItems: 'center',
        justifyContent: 'center',
    },
    metricLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: `${EHR_ON_SURFACE_VARIANT}99`,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
    },
    metricValue: {
        fontSize: 38,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
        marginTop: 10,
        letterSpacing: -1,
    },
    // Pending wide card
    pendingCard: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        shadowColor: EHR_SHADOW,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 20,
        elevation: 3,
    },
    pendingIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: EHR_SECONDARY_CONTAINER,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    pendingLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
        flex: 1,
    },
    pendingValue: {
        fontSize: 30,
        fontWeight: '700',
        color: EHR_SECONDARY,
        letterSpacing: -1,
    },
    // CTA
    ctaWrap: {
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 28,
        shadowColor: `${EHR_PRIMARY}33`,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 20,
        elevation: 4,
    },
    ctaGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
    },
    ctaIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    ctaTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: EHR_ON_PRIMARY,
        marginBottom: 2,
    },
    ctaSubtitle: {
        fontSize: 12,
        color: EHR_ON_PRIMARY,
        opacity: 0.9,
        lineHeight: 17,
    },
    // Section header
    sectionHeader: {
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
        marginBottom: 10,
    },
    seeAll: {
        fontSize: 13,
        fontWeight: '600',
        color: EHR_SECONDARY,
        marginRight: 4,
    },
    // Loading / empty
    loadingCard: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderColor: EHR_OUTLINE_VARIANT,
        borderWidth: 1,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
    },
    emptyWrap: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderColor: EHR_OUTLINE_VARIANT,
        borderWidth: 1,
        borderRadius: 20,
        padding: 6,
    },
    // Request banner
    requestBanner: {
        backgroundColor: EHR_SECONDARY_CONTAINER,
        borderRadius: 20,
        padding: 16,
    },
    requestBannerIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    requestBannerTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: EHR_ON_SECONDARY_CONTAINER,
    },
    requestBannerSub: {
        fontSize: 12,
        color: EHR_ON_SECONDARY_CONTAINER,
        marginTop: 2,
    },
    // Trust banner
    trustBanner: {
        marginTop: 28,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: EHR_SURFACE_CONTAINER,
        height: 100,
    },
    trustGradient: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    trustText: {
        fontSize: 14,
        fontWeight: '700',
        color: EHR_ON_PRIMARY,
        maxWidth: 220,
        lineHeight: 20,
    },
});
