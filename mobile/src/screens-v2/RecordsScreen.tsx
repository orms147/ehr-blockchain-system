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

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { SlidersHorizontal, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import consentService from '../services/consent.service';
import RecordCard from '../components/RecordCard';
import LoadingSpinner from '../components/LoadingSpinner';
import useRecords from '../hooks/useRecords';
import ViCard from '../components-v2/ViCard';
import ViButton from '../components-v2/ViButton';
import { useEhrPalette, DARK } from '../constants/uiColors';
import { resolveRecordType } from '../constants/recordTypes';

// Dead branch (G.6 isActivityView=false) — keep map referencing DARK constants
// to compile. Will be ripped when activity view is fully removed.
const ACTION_LABELS_FALLBACK: Record<string, { label: string; color: string }> = {
    CREATE_RECORD: { label: 'Tạo hồ sơ', color: DARK.EHR_TERTIARY },
    UPDATE_RECORD: { label: 'Cập nhật hồ sơ', color: DARK.EHR_SECONDARY },
    SHARE_KEY: { label: 'Chia sẻ hồ sơ', color: DARK.EHR_PRIMARY },
    REVOKE_CONSENT: { label: 'Thu hồi truy cập', color: DARK.EHR_DANGER },
    DECRYPT: { label: 'Giải mã hồ sơ', color: DARK.EHR_TERTIARY },
    READ: { label: 'Đọc hồ sơ', color: DARK.EHR_OUTLINE },
    REQUEST_ACCESS: { label: 'Yêu cầu truy cập', color: DARK.EHR_WARNING },
    APPROVE_REQUEST: { label: 'Phê duyệt yêu cầu', color: DARK.EHR_TERTIARY },
};

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

// G.12 — record.type filter chips trimmed to canonical 5 (general/lab/imaging/rx/vacc)
// per viehp-doctor-forms-spec.html Q1. vital_signs dropped (it's a section, not a type).
const TYPE_FILTER_OPTIONS = [
    { key: 'all', label: 'Tất cả' },
    { key: 'general', label: 'Khám' },
    { key: 'lab', label: 'Xét nghiệm' },
    { key: 'imaging', label: 'Hình ảnh' },
    { key: 'rx', label: 'Đơn thuốc' },
    { key: 'vacc', label: 'Tiêm chủng' },
] as const;

type TypeFilterKey = (typeof TYPE_FILTER_OPTIONS)[number]['key'];

// G.6 — advanced filter axes (bottom sheet)
type StatusFilter = 'all' | 'mine' | 'shared' | 'expired';
type TimeFilter = 'all' | '30d' | '90d' | '12mo';

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'mine', label: 'Chỉ tôi' },
    { key: 'shared', label: 'Đã chia sẻ' },
    { key: 'expired', label: 'Đã hết hạn' },
];
const TIME_OPTIONS: { key: TimeFilter; label: string }[] = [
    { key: 'all', label: 'Mọi lúc' },
    { key: '30d', label: '30 ngày' },
    { key: '90d', label: '90 ngày' },
    { key: '12mo', label: '12 tháng' },
];

const FILTER_STORAGE_KEY = 'records.filter';

const ACTION_LABELS = ACTION_LABELS_FALLBACK;

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

export default function RecordsScreen({ navigation }: any) {
    const palette = useEhrPalette();
    const { records, isLoading, isRefreshing, error, refresh } = useRecords();

    // Primary axis: record.type
    const [typeFilter, setTypeFilter] = useState<TypeFilterKey>('all');
    // Advanced axes (in bottom sheet)
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
    const [filterSheetOpen, setFilterSheetOpen] = useState(false);
    const [draftStatus, setDraftStatus] = useState<StatusFilter>('all');
    const [draftTime, setDraftTime] = useState<TimeFilter>('all');

    // Hydrate advanced filter state from AsyncStorage (per design §filter step 2)
    useEffect(() => {
        AsyncStorage.getItem(FILTER_STORAGE_KEY)
            .then((raw) => {
                if (!raw) return;
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed?.status) setStatusFilter(parsed.status);
                    if (parsed?.time) setTimeFilter(parsed.time);
                } catch {
                    // ignore
                }
            })
            .catch(() => {});
    }, []);

    const persistFilters = (status: StatusFilter, time: TimeFilter) => {
        AsyncStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ status, time })).catch(() => {});
    };

    const openSheet = () => {
        setDraftStatus(statusFilter);
        setDraftTime(timeFilter);
        setFilterSheetOpen(true);
    };
    const applyDraft = () => {
        setStatusFilter(draftStatus);
        setTimeFilter(draftTime);
        persistFilters(draftStatus, draftTime);
        setFilterSheetOpen(false);
    };
    const resetDraft = () => {
        setDraftStatus('all');
        setDraftTime('all');
    };
    const advancedActiveCount =
        (statusFilter !== 'all' ? 1 : 0) + (timeFilter !== 'all' ? 1 : 0);

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

    const expiredCidSet = useMemo(() => {
        const s = new Set<string>();
        const now = Date.now();
        (sentShares || []).forEach((ks: any) => {
            const exp = ks?.expireAt ? new Date(ks.expireAt).getTime() : null;
            if (exp && exp < now && ks?.cidHash) s.add(String(ks.cidHash).toLowerCase());
        });
        return s;
    }, [sentShares]);

    const timeThresholdMs = useMemo(() => {
        const now = Date.now();
        if (timeFilter === '30d') return now - 30 * 24 * 60 * 60 * 1000;
        if (timeFilter === '90d') return now - 90 * 24 * 60 * 60 * 1000;
        if (timeFilter === '12mo') return now - 365 * 24 * 60 * 60 * 1000;
        return null;
    }, [timeFilter]);

    const filteredRecords = records.filter((r: any) => {
        if (r.archived) return false;

        // Type axis — resolve legacy keys (checkup, lab_result, etc) to canonical
        if (typeFilter !== 'all') {
            const rType = String(r.recordType || r.type || '').toLowerCase();
            if (resolveRecordType(rType).key !== typeFilter) return false;
        }

        // Status axis
        const cid = String(r.cidHash || '').toLowerCase();
        const parent = String(r.parentCidHash || '').toLowerCase();
        const isShared = (cid && sharedCidSet.has(cid)) || (parent && sharedCidSet.has(parent));
        const isExpired = (cid && expiredCidSet.has(cid)) || (parent && expiredCidSet.has(parent));
        if (statusFilter === 'mine' && isShared) return false;
        if (statusFilter === 'shared' && !isShared) return false;
        if (statusFilter === 'expired' && !isExpired) return false;

        // Time axis (createdAt)
        if (timeThresholdMs && r.createdAt) {
            const created = new Date(r.createdAt).getTime();
            if (created < timeThresholdMs) return false;
        }

        return true;
    });

    const isActivityView = false; // moved to AccessLog/Quyền tab per canonical structure
    const activityLogs: any[] = [];

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
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            <FlashList
                data={dataList}
                keyExtractor={(item: any, idx) =>
                    isActivityView ? (item.id || `log-${idx}`) : (item.cidHash || `record-${idx}`)
                }
                renderItem={({ item }) => {
                    if (isActivityView) {
                        const meta =
                            ACTION_LABELS[item.action] || { label: item.action || 'Hoạt động', color: palette.EHR_TEXT_MUTED };
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
                                            color: palette.EHR_TEXT_MUTED,
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
                                            color: palette.EHR_TEXT_MUTED,
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
                                            color: palette.EHR_DANGER,
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
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
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
                                    backgroundColor: `${palette.EHR_DANGER}1A`,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_DANGER,
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: SANS,
                                        fontSize: 12.5,
                                        color: palette.EHR_DANGER,
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
                                color: palette.EHR_ON_SURFACE,
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
                                color: palette.EHR_ON_SURFACE_VARIANT,
                            }}
                        >
                            {records.length} hồ sơ
                            {sharedCidSet.size > 0 ? ` · ${sharedCidSet.size} đã chia sẻ` : ''}
                        </Text>

                        {/* G.6 — type chips (horizontal scroll) + advanced filter icon */}
                        <XStack style={{ alignItems: 'center', marginTop: 14, marginBottom: 4, gap: 8 }}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 6, paddingRight: 8 }}
                                style={{ flex: 1 }}
                            >
                                {TYPE_FILTER_OPTIONS.map((f) => {
                                    const active = typeFilter === f.key;
                                    return (
                                        <Pressable
                                            key={f.key}
                                            onPress={() => setTypeFilter(f.key)}
                                            style={({ pressed }) => ({
                                                paddingHorizontal: 13,
                                                paddingVertical: 7,
                                                borderRadius: 999,
                                                borderWidth: 0.5,
                                                borderColor: active ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE_SOFT,
                                                backgroundColor: active ? palette.EHR_ON_SURFACE : 'transparent',
                                                opacity: pressed ? 0.7 : 1,
                                            })}
                                        >
                                            <Text
                                                style={{
                                                    fontFamily: SANS_MEDIUM,
                                                    fontSize: 12,
                                                    color: active ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE_VARIANT,
                                                    fontWeight: '600',
                                                }}
                                            >
                                                {f.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                            <Pressable
                                onPress={openSheet}
                                style={({ pressed }) => ({
                                    width: 36,
                                    height: 36,
                                    borderRadius: 999,
                                    borderWidth: 0.5,
                                    borderColor: advancedActiveCount > 0 ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                    backgroundColor: advancedActiveCount > 0 ? `${palette.EHR_PRIMARY}1A` : 'transparent',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: pressed ? 0.7 : 1,
                                })}
                                hitSlop={6}
                                accessibilityLabel="Lọc nâng cao"
                            >
                                <SlidersHorizontal
                                    size={16}
                                    color={advancedActiveCount > 0 ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE_VARIANT}
                                />
                                {advancedActiveCount > 0 ? (
                                    <View
                                        style={{
                                            position: 'absolute',
                                            top: 4,
                                            right: 4,
                                            width: 6,
                                            height: 6,
                                            borderRadius: 3,
                                            backgroundColor: palette.EHR_PRIMARY,
                                        }}
                                    />
                                ) : null}
                            </Pressable>
                        </XStack>

                        {/* Tạo hồ sơ tile (small, no big cinnabar gradient — design's "+ Tạo hồ sơ" link pattern) */}
                        <Pressable
                            onPress={handleCreateRecord}
                            style={({ pressed }) => ({
                                marginTop: 12,
                                paddingVertical: 11,
                                paddingHorizontal: 14,
                                borderRadius: 12,
                                borderWidth: 0.75,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                backgroundColor: palette.EHR_SURFACE_LOWEST,
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
                                    color: palette.EHR_ON_SURFACE,
                                    fontWeight: '600',
                                }}
                            >
                                + Tạo hồ sơ mới
                            </Text>
                            <Text
                                style={{
                                    fontFamily: SANS,
                                    fontSize: 11.5,
                                    color: palette.EHR_TEXT_MUTED,
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
                                color: palette.EHR_ON_SURFACE,
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
                                color: palette.EHR_TEXT_MUTED,
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

            {/* G.6 — Advanced filter bottom sheet */}
            <Modal
                visible={filterSheetOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setFilterSheetOpen(false)}
            >
                <Pressable
                    onPress={() => setFilterSheetOpen(false)}
                    style={{ flex: 1, backgroundColor: 'rgba(8,8,12,0.7)', justifyContent: 'flex-end' }}
                >
                    <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: palette.EHR_SURFACE_HIGH,
                            borderTopLeftRadius: 20,
                            borderTopRightRadius: 20,
                            paddingBottom: 28,
                            maxHeight: '70%',
                        }}
                    >
                        {/* drag handle */}
                        <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
                            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: palette.EHR_OUTLINE }} />
                        </View>

                        {/* header */}
                        <XStack style={{ alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 18 }}>
                            <Text
                                style={{
                                    fontFamily: SERIF,
                                    fontSize: 20,
                                    color: palette.EHR_ON_SURFACE,
                                    letterSpacing: -0.3,
                                }}
                            >
                                Bộ lọc
                            </Text>
                            <Pressable onPress={resetDraft} hitSlop={8}>
                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 12, color: palette.EHR_ON_SURFACE_VARIANT, fontWeight: '600' }}>
                                    Đặt lại
                                </Text>
                            </Pressable>
                        </XStack>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Trạng thái */}
                            <View style={{ paddingHorizontal: 22, paddingBottom: 22 }}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 10,
                                        color: palette.EHR_TEXT_MUTED,
                                        letterSpacing: 1.2,
                                        textTransform: 'uppercase',
                                        fontWeight: '700',
                                        marginBottom: 10,
                                    }}
                                >
                                    Trạng thái
                                </Text>
                                <XStack style={{ flexWrap: 'wrap', gap: 6 }}>
                                    {STATUS_OPTIONS.map((opt) => {
                                        const active = draftStatus === opt.key;
                                        return (
                                            <Pressable
                                                key={opt.key}
                                                onPress={() => setDraftStatus(opt.key)}
                                                style={({ pressed }) => ({
                                                    paddingHorizontal: 13,
                                                    paddingVertical: 7,
                                                    borderRadius: 999,
                                                    borderWidth: 0.5,
                                                    borderColor: active ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE_VARIANT,
                                                    backgroundColor: active ? palette.EHR_ON_SURFACE : 'transparent',
                                                    opacity: pressed ? 0.7 : 1,
                                                })}
                                            >
                                                <Text
                                                    style={{
                                                        fontFamily: SANS_MEDIUM,
                                                        fontSize: 12,
                                                        color: active ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE_VARIANT,
                                                        fontWeight: '600',
                                                    }}
                                                >
                                                    {opt.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </XStack>
                            </View>

                            {/* Thời gian */}
                            <View style={{ paddingHorizontal: 22, paddingBottom: 22 }}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 10,
                                        color: palette.EHR_TEXT_MUTED,
                                        letterSpacing: 1.2,
                                        textTransform: 'uppercase',
                                        fontWeight: '700',
                                        marginBottom: 10,
                                    }}
                                >
                                    Thời gian
                                </Text>
                                <XStack style={{ flexWrap: 'wrap', gap: 6 }}>
                                    {TIME_OPTIONS.map((opt) => {
                                        const active = draftTime === opt.key;
                                        return (
                                            <Pressable
                                                key={opt.key}
                                                onPress={() => setDraftTime(opt.key)}
                                                style={({ pressed }) => ({
                                                    paddingHorizontal: 13,
                                                    paddingVertical: 7,
                                                    borderRadius: 999,
                                                    borderWidth: 0.5,
                                                    borderColor: active ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE_VARIANT,
                                                    backgroundColor: active ? palette.EHR_ON_SURFACE : 'transparent',
                                                    opacity: pressed ? 0.7 : 1,
                                                })}
                                            >
                                                <Text
                                                    style={{
                                                        fontFamily: SANS_MEDIUM,
                                                        fontSize: 12,
                                                        color: active ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE_VARIANT,
                                                        fontWeight: '600',
                                                    }}
                                                >
                                                    {opt.label}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </XStack>
                            </View>
                        </ScrollView>

                        {/* Footer */}
                        <XStack style={{ gap: 10, paddingHorizontal: 22, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: palette.EHR_OUTLINE_VARIANT }}>
                            <View style={{ flex: 1 }}>
                                <ViButton variant="ghost" full onPress={() => setFilterSheetOpen(false)}>
                                    Đóng
                                </ViButton>
                            </View>
                            <View style={{ flex: 2 }}>
                                <ViButton variant="primary" full onPress={applyDraft}>
                                    Áp dụng
                                </ViButton>
                            </View>
                        </XStack>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}
