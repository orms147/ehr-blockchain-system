// RecordsScreen v2 — port of .design-bundle/project/screens-patient.jsx
// RecordsScreen. Serif "Hồ sơ" hero + filter pill chips + text-rhythm record
// rows (same RecordCard component). "Đã chia sẻ" + "Hoạt động" filters
// preserved from existing wiring.
//
// Service wiring preserved exactly:
//   - useRecords (TanStack Query with focus refresh + localRecordRetry)
//   - consentService.getMyGrantedConsents → sharedCidSet for "Đã chia sẻ" filter
//   - accessLogService.getAccessLogs → activity feed
//   - navigation.navigate('RecordDetail', { record }) / 'CreateRecord'

import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack } from 'tamagui';

import consentService from '../services/consent.service';
import accessLogService from '../services/accessLog.service';
import RecordCard from '../components/RecordCard';
import LoadingSpinner from '../components/LoadingSpinner';
import useRecords from '../hooks/useRecords';
import ViCard from '../components-v2/ViCard';
import {
    EHR_SURFACE,
    EHR_SURFACE_LOWEST,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE,
    EHR_OUTLINE_SOFT,
    EHR_PRIMARY,
    EHR_TERTIARY,
    EHR_SECONDARY,
    EHR_DANGER,
    EHR_WARNING,
} from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const FILTER_OPTIONS = [
    { key: 'all', label: 'Tất cả' },
    { key: 'shared', label: 'Đã chia sẻ' },
    { key: 'activity', label: 'Hoạt động' },
] as const;

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    CREATE_RECORD: { label: 'Tạo hồ sơ', color: EHR_TERTIARY },
    UPDATE_RECORD: { label: 'Cập nhật hồ sơ', color: EHR_SECONDARY },
    SHARE_KEY: { label: 'Chia sẻ hồ sơ', color: EHR_PRIMARY },
    REVOKE_CONSENT: { label: 'Thu hồi truy cập', color: EHR_DANGER },
    DECRYPT: { label: 'Giải mã hồ sơ', color: EHR_TERTIARY },
    READ: { label: 'Đọc hồ sơ', color: EHR_OUTLINE },
    REQUEST_ACCESS: { label: 'Yêu cầu truy cập', color: EHR_WARNING },
    APPROVE_REQUEST: { label: 'Phê duyệt yêu cầu', color: EHR_TERTIARY },
};

const formatActivityDate = (s?: string) => {
    if (!s) return '';
    try {
        return new Date(s).toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return s;
    }
};

type FilterKey = (typeof FILTER_OPTIONS)[number]['key'];

export default function RecordsScreen({ navigation }: any) {
    const { records, isLoading, isRefreshing, error, refresh } = useRecords();
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

    const { data: sentShares } = useQuery({
        queryKey: ['keyShares', 'sent'],
        queryFn: () => consentService.getMyGrantedConsents(),
        staleTime: 30_000,
    });

    const sharedCidSet = useMemo(() => {
        const s = new Set<string>();
        (sentShares || []).forEach((ks: any) => {
            const status = String(ks?.status || '').toLowerCase();
            if (status === 'revoked' || status === 'expired') return;
            if (ks?.cidHash) s.add(String(ks.cidHash).toLowerCase());
        });
        return s;
    }, [sentShares]);

    const { data: activityLogs } = useQuery({
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
            return (cid && sharedCidSet.has(cid)) || (parent && sharedCidSet.has(parent));
        }
        if (activeFilter === 'activity') return false;
        return !r.archived;
    });

    const isActivityView = activeFilter === 'activity';

    const handleRecordPress = (record: any) => {
        const serializableRecord = {
            ...record,
            createdAt:
                record?.createdAt instanceof Date
                    ? record.createdAt.toISOString()
                    : record?.createdAt || null,
        };
        navigation.navigate('RecordDetail', { record: serializableRecord });
    };

    const handleCreateRecord = () => navigation.navigate('CreateRecord');

    if (isLoading && !isRefreshing) {
        return <LoadingSpinner message="Đang tải danh sách hồ sơ..." />;
    }

    const dataList = isActivityView ? (activityLogs || []) : filteredRecords;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['right', 'left']}>
            <FlashList
                data={dataList}
                keyExtractor={(item: any, idx) =>
                    isActivityView ? (item.id || `log-${idx}`) : (item.cidHash || `record-${idx}`)
                }
                renderItem={({ item }) => {
                    if (isActivityView) {
                        const meta =
                            ACTION_LABELS[item.action] || { label: item.action || 'Hoạt động', color: EHR_OUTLINE };
                        return (
                            <ViCard padding={14} style={{ marginBottom: 10 }}>
                                <View
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: 0,
                                        bottom: 0,
                                        width: 3,
                                        backgroundColor: meta.color,
                                        borderTopLeftRadius: 14,
                                        borderBottomLeftRadius: 14,
                                    }}
                                />
                                <XStack
                                    style={{
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: 4,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 13.5,
                                            fontWeight: '700',
                                            color: meta.color,
                                        }}
                                    >
                                        {meta.label}
                                    </Text>
                                    <Text
                                        style={{
                                            fontFamily: SANS,
                                            fontSize: 11,
                                            color: EHR_OUTLINE,
                                        }}
                                    >
                                        {formatActivityDate(item.createdAt)}
                                    </Text>
                                </XStack>
                                {item.cidHash ? (
                                    <Text
                                        style={{
                                            fontFamily: 'monospace',
                                            fontSize: 11,
                                            color: EHR_OUTLINE,
                                        }}
                                        numberOfLines={1}
                                    >
                                        CID: {String(item.cidHash).slice(0, 18)}…
                                    </Text>
                                ) : null}
                                {item.consentVerified === false ? (
                                    <Text
                                        style={{
                                            marginTop: 2,
                                            fontFamily: SANS,
                                            fontSize: 11,
                                            color: EHR_DANGER,
                                        }}
                                    >
                                        Truy cập bị từ chối
                                    </Text>
                                ) : null}
                            </ViCard>
                        );
                    }
                    return <RecordCard record={item} onPress={handleRecordPress} />;
                }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 80 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={refresh}
                        tintColor={EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListHeaderComponent={
                    <View style={{ marginBottom: 6 }}>
                        {error ? (
                            <View
                                style={{
                                    marginBottom: 14,
                                    paddingVertical: 10,
                                    paddingHorizontal: 14,
                                    borderRadius: 12,
                                    backgroundColor: `${EHR_DANGER}1A`,
                                    borderWidth: 0.5,
                                    borderColor: EHR_DANGER,
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: SANS,
                                        fontSize: 12.5,
                                        color: EHR_DANGER,
                                        textAlign: 'center',
                                    }}
                                >
                                    {error}
                                </Text>
                            </View>
                        ) : null}

                        {/* Hero */}
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 28,
                                color: EHR_ON_SURFACE,
                                letterSpacing: -0.5,
                                lineHeight: 32,
                            }}
                        >
                            Hồ sơ
                        </Text>
                        <Text
                            style={{
                                marginTop: 4,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: EHR_ON_SURFACE_VARIANT,
                            }}
                        >
                            {records.length} hồ sơ
                            {sharedCidSet.size > 0 ? ` · ${sharedCidSet.size} đã chia sẻ` : ''}
                        </Text>

                        {/* Filter pills */}
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 14, marginBottom: 4 }}>
                            {FILTER_OPTIONS.map((f) => {
                                const active = activeFilter === f.key;
                                return (
                                    <Pressable
                                        key={f.key}
                                        onPress={() => setActiveFilter(f.key)}
                                        style={({ pressed }) => ({
                                            paddingHorizontal: 14,
                                            paddingVertical: 7,
                                            borderRadius: 999,
                                            borderWidth: 0.5,
                                            borderColor: active ? EHR_ON_SURFACE : EHR_OUTLINE_SOFT,
                                            backgroundColor: active ? EHR_ON_SURFACE : 'transparent',
                                            opacity: pressed ? 0.7 : 1,
                                        })}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: SANS_MEDIUM,
                                                fontSize: 12.5,
                                                color: active ? EHR_SURFACE : EHR_ON_SURFACE_VARIANT,
                                                fontWeight: '600',
                                            }}
                                        >
                                            {f.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {/* Tạo hồ sơ tile (small, no big cinnabar gradient — design's "+ Tạo hồ sơ" link pattern) */}
                        <Pressable
                            onPress={handleCreateRecord}
                            style={({ pressed }) => ({
                                marginTop: 12,
                                paddingVertical: 11,
                                paddingHorizontal: 14,
                                borderRadius: 12,
                                borderWidth: 0.75,
                                borderColor: EHR_OUTLINE_SOFT,
                                backgroundColor: EHR_SURFACE_LOWEST,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 16,
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 13.5,
                                    color: EHR_ON_SURFACE,
                                    fontWeight: '600',
                                }}
                            >
                                + Tạo hồ sơ mới
                            </Text>
                            <Text
                                style={{
                                    fontFamily: SANS,
                                    fontSize: 11.5,
                                    color: EHR_OUTLINE,
                                }}
                            >
                                Mã hoá + IPFS + on-chain
                            </Text>
                        </Pressable>
                    </View>
                }
                ListEmptyComponent={
                    <View style={{ paddingHorizontal: 22, paddingTop: 30, alignItems: 'center' }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 18,
                                color: EHR_ON_SURFACE,
                                textAlign: 'center',
                            }}
                        >
                            {isActivityView ? 'Chưa có hoạt động' : 'Chưa có hồ sơ'}
                        </Text>
                        <Text
                            style={{
                                marginTop: 8,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: EHR_OUTLINE,
                                textAlign: 'center',
                                lineHeight: 19,
                                maxWidth: 280,
                            }}
                        >
                            {isActivityView
                                ? 'Khi bạn tạo/chia sẻ hồ sơ, hoạt động sẽ ghi lại tại đây.'
                                : 'Tạo hồ sơ đầu tiên để bắt đầu lưu trữ dữ liệu y tế trên blockchain.'}
                        </Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
}
