import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import consentService from '../services/consent.service';
import accessLogService from '../services/accessLog.service';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FilePlus2, Search, ChevronRight } from 'lucide-react-native';
import { Text, View, XStack, YStack } from 'tamagui';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDelay,
    interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import RecordCard from '../components/RecordCard';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import useRecords from '../hooks/useRecords';
import {
    EHR_ERROR,
    EHR_ERROR_CONTAINER,
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_PRIMARY_FIXED_DIM,
    EHR_SECONDARY,
    EHR_SHADOW,
    EHR_SURFACE,
    EHR_SURFACE_CONTAINER,
    EHR_SURFACE_HIGH,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

const SPRING = { damping: 18, stiffness: 120, mass: 0.8 };

const FILTER_OPTIONS = [
    { key: 'all', label: 'Tất cả' },
    { key: 'shared', label: 'Đã chia sẻ' },
    { key: 'activity', label: 'Hoạt động' },
] as const;

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    CREATE_RECORD: { label: 'Tạo hồ sơ', color: '#16A34A' },
    UPDATE_RECORD: { label: 'Cập nhật hồ sơ', color: '#0284C7' },
    SHARE_KEY: { label: 'Chia sẻ hồ sơ', color: '#7C3AED' },
    REVOKE_CONSENT: { label: 'Thu hồi truy cập', color: '#DC2626' },
    DECRYPT: { label: 'Giải mã hồ sơ', color: '#0F766E' },
    READ: { label: 'Đọc hồ sơ', color: '#475569' },
    REQUEST_ACCESS: { label: 'Yêu cầu truy cập', color: '#9333EA' },
    APPROVE_REQUEST: { label: 'Phê duyệt yêu cầu', color: '#16A34A' },
};

const formatActivityDate = (s?: string) => {
    if (!s) return '';
    try {
        return new Date(s).toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return s; }
};

type FilterKey = (typeof FILTER_OPTIONS)[number]['key'];

export default function RecordsScreen({ navigation }: any) {
    const { records, isLoading, isRefreshing, error, refresh } = useRecords();
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

    const headerEnter = useSharedValue(0);
    useEffect(() => {
        headerEnter.value = withSpring(1, SPRING);
    }, []);

    const headerStyle = useAnimatedStyle(() => ({
        opacity: interpolate(headerEnter.value, [0, 0.3, 1], [0, 0.6, 1]),
        transform: [
            { translateY: interpolate(headerEnter.value, [0, 1], [16, 0]) },
        ],
    }));

    const { data: sentShares } = useQuery({
        queryKey: ['keyShares', 'sent'],
        queryFn: () => consentService.getMyGrantedConsents(),
        // Always fetch so the "Đã chia sẻ" count is fresh; cheap.
        staleTime: 30_000,
    });

    const sharedCidSet = useMemo(() => {
        const s = new Set<string>();
        (sentShares || []).forEach((ks: any) => {
            // Only count active (not revoked/expired) shares
            const status = String(ks?.status || '').toLowerCase();
            if (status === 'revoked' || status === 'expired') return;
            if (ks?.cidHash) s.add(String(ks.cidHash).toLowerCase());
        });
        return s;
    }, [sentShares]);

    const { data: activityLogs, isLoading: activityLoading } = useQuery({
        queryKey: ['accessLogs', 'myActivity'],
        queryFn: () => accessLogService.getAccessLogs(),
        enabled: activeFilter === 'activity',
        staleTime: 30_000,
    });

    const filteredRecords = records.filter((r: any) => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'shared') {
            const cid = String(r.cidHash || '').toLowerCase();
            const parent = String(r.parentCidHash || '').toLowerCase();
            // Match this version OR its parent (consent on parent cascades via includeUpdates)
            return (cid && sharedCidSet.has(cid)) || (parent && sharedCidSet.has(parent));
        }
        if (activeFilter === 'activity') return false; // activity uses its own list
        return !r.archived;
    });

    const isActivityView = activeFilter === 'activity';

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

    if (isLoading && !isRefreshing) {
        return <LoadingSpinner message="Đang tải danh sách hồ sơ..." />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['right', 'left']}>
            {error && !isLoading ? (
                <View style={s.errorBanner}>
                    <Text fontSize="$3" style={{ textAlign: 'center', color: EHR_ERROR }}>{error}</Text>
                </View>
            ) : null}

            {records.length === 0 && !error ? (
                <EmptyState
                    title="Chưa có hồ sơ y tế"
                    description="Hãy tạo hồ sơ đầu tiên để bắt đầu lưu trữ dữ liệu sức khoẻ trên blockchain."
                    actionLabel="Tạo hồ sơ đầu tiên"
                    onAction={handleCreateRecord}
                />
            ) : (
                <FlatList
                    data={isActivityView ? (activityLogs || []) : filteredRecords}
                    keyExtractor={(item: any, idx) =>
                        isActivityView ? (item.id || `log-${idx}`) : (item.cidHash || `record-${idx}`)
                    }
                    renderItem={({ item }) => {
                        if (isActivityView) {
                            const meta = ACTION_LABELS[item.action] || { label: item.action || 'Hoạt động', color: '#475569' };
                            return (
                                <View style={{
                                    backgroundColor: EHR_SURFACE_LOWEST,
                                    borderRadius: 14,
                                    padding: 14,
                                    marginBottom: 10,
                                    borderLeftWidth: 4,
                                    borderLeftColor: meta.color,
                                    borderWidth: 1,
                                    borderColor: EHR_OUTLINE_VARIANT,
                                }}>
                                    <XStack style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: meta.color }}>{meta.label}</Text>
                                        <Text style={{ fontSize: 11, color: EHR_ON_SURFACE_VARIANT }}>{formatActivityDate(item.createdAt)}</Text>
                                    </XStack>
                                    {item.cidHash ? (
                                        <Text style={{ fontSize: 11, color: EHR_ON_SURFACE_VARIANT }} numberOfLines={1}>
                                            CID: {String(item.cidHash).slice(0, 18)}…
                                        </Text>
                                    ) : null}
                                    {item.consentVerified === false ? (
                                        <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>Truy cập bị từ chối</Text>
                                    ) : null}
                                </View>
                            );
                        }
                        return <RecordCard record={item} onPress={handleRecordPress} />;
                    }}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} colors={[EHR_PRIMARY]} />}
                    ListHeaderComponent={
                        <Animated.View style={headerStyle}>
                            {/* Title + count */}
                            <XStack style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
                                <Text style={s.title}>Hồ sơ y tế</Text>
                                <Pressable onPress={() => navigation.navigate('Records')} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={s.seeAll}>Xem tất cả</Text>
                                </Pressable>
                            </XStack>
                            <Text style={s.subtitle}>
                                Tổng cộng {records.length} hồ sơ
                            </Text>

                            {/* Filter chips */}
                            <XStack style={s.filterRow}>
                                {FILTER_OPTIONS.map((f) => {
                                    const active = activeFilter === f.key;
                                    return (
                                        <Pressable
                                            key={f.key}
                                            onPress={() => setActiveFilter(f.key)}
                                            style={[s.filterChip, active && s.filterChipActive]}
                                        >
                                            <Text style={[s.filterText, active && s.filterTextActive]}>{f.label}</Text>
                                        </Pressable>
                                    );
                                })}
                            </XStack>

                            {/* Create CTA */}
                            <Pressable onPress={handleCreateRecord}>
                                <View style={s.ctaWrap}>
                                    <LinearGradient
                                        colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={s.ctaGradient}
                                    >
                                        <XStack style={{ alignItems: 'center', flex: 1 }}>
                                            <View style={s.ctaIcon}>
                                                <FilePlus2 size={22} color={EHR_ON_PRIMARY} />
                                            </View>
                                            <YStack style={{ flex: 1 }}>
                                                <Text style={s.ctaTitle}>Tạo hồ sơ mới</Text>
                                                <Text style={s.ctaSub}>
                                                    Nhập nội dung, mã hoá, upload IPFS và đăng ký lên blockchain.
                                                </Text>
                                            </YStack>
                                        </XStack>
                                        <ChevronRight size={16} color={EHR_ON_PRIMARY} />
                                    </LinearGradient>
                                </View>
                            </Pressable>

                            {/* Info tip */}
                            <View style={s.infoTip}>
                                <Text style={s.infoText}>
                                    Kéo xuống để làm mới. Nhấn vào thẻ để xem chi tiết hồ sơ.
                                </Text>
                            </View>
                        </Animated.View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    errorBanner: {
        marginHorizontal: 16,
        marginTop: 16,
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
        backgroundColor: EHR_ERROR_CONTAINER,
        borderColor: EHR_OUTLINE_VARIANT,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: EHR_ON_SURFACE,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 13,
        color: EHR_ON_SURFACE_VARIANT,
        marginBottom: 16,
    },
    seeAll: {
        fontSize: 13,
        fontWeight: '600',
        color: EHR_SECONDARY,
    },
    // Filter chips
    filterRow: {
        gap: 8,
        marginBottom: 16,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: EHR_SURFACE_LOWEST,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
    },
    filterChipActive: {
        backgroundColor: EHR_PRIMARY,
        borderColor: EHR_PRIMARY,
    },
    filterText: {
        fontSize: 13,
        fontWeight: '600',
        color: EHR_ON_SURFACE_VARIANT,
    },
    filterTextActive: {
        color: EHR_ON_PRIMARY,
    },
    // CTA
    ctaWrap: {
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: `${EHR_PRIMARY}33`,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 3,
    },
    ctaGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    ctaIcon: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    ctaTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: EHR_ON_PRIMARY,
    },
    ctaSub: {
        fontSize: 11,
        color: EHR_ON_PRIMARY,
        opacity: 0.9,
        marginTop: 2,
    },
    // Info tip
    infoTip: {
        backgroundColor: EHR_PRIMARY_FIXED,
        borderColor: EHR_PRIMARY_FIXED_DIM,
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        marginBottom: 12,
    },
    infoText: {
        fontSize: 12,
        color: EHR_PRIMARY,
        lineHeight: 18,
    },
});
