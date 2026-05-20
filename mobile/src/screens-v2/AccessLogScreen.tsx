// AccessLogScreen v2 — port of .design-bundle/project/screens-patient.jsx
// PermissionsScreen + AuditScreen (delegated tab from new event source).
// 3-tab structure preserved (Trực tiếp / Mọi người / Qua uỷ quyền) —
// each gets the design's serif heading, filter chips, ViCard rows with
// KV layout, ViStatusChip / ViModeChip, source badge.
//
// Wiring preserved bit-for-bit:
//   - consentService.getMyGrantedConsents (tab 1)
//   - consentService.getAllActiveGrantees (tab 2)
//   - useDelegationAccessLogs('patient') (tab 3)
//   - consentService.revokeConsent — biometric-gated via relayer
//   - Group consents by (grantee, rootCidHash) tuple

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, Alert, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';

import LoadingSpinner from '../components/LoadingSpinner';
import consentService from '../services/consent.service';
import useAuthStore from '../store/authStore';
import UserChip from '../components/UserChip';
import RecordChip from '../components/RecordChip';
import { useDelegationAccessLogs, type DelegationAccessLogRow } from '../hooks/queries/useDelegations';
import { formatExpiry, formatDate, getExpiryUrgency } from '../utils/dateFormatting';
import ViCard from '../components-v2/ViCard';
import ViButton from '../components-v2/ViButton';
import { ViSectionLabel, ViStatusChip, ViSourceChip } from '../components-v2/ViChips';
import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type ConsentItem = {
    id?: string;
    cidHash?: string;
    rootCidHash?: string;
    parentCidHash?: string | null;
    createdAt?: string;
    status?: string;
    active?: boolean;
    granteeAddress?: string;
    recipientAddress?: string;
    expiresAt?: string | null;
};

type GroupedConsent = {
    groupKey: string;
    grantee: string;
    rootCidHash: string;
    versionCount: number;
    activeCount: number;
    revokedCount: number;
    latestExpiresAt?: string | null;
    firstCreatedAt?: string;
    status: 'active' | 'expired' | 'revoked';
    revokeTarget: ConsentItem;
};

const isExpired = (c: ConsentItem) => {
    if (!c.expiresAt) return false;
    try {
        return new Date(c.expiresAt).getTime() < Date.now();
    } catch { return false; }
};

const isRevokedRow = (c: ConsentItem) => c.active === false || c.status === 'revoked';

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???');

function groupConsents(items: ConsentItem[]): GroupedConsent[] {
    const map = new Map<string, GroupedConsent>();
    for (const it of items) {
        const grantee = (it.granteeAddress || it.recipientAddress || '').toLowerCase();
        const root = (it.rootCidHash || it.cidHash || '').toLowerCase();
        if (!grantee || !root) continue;
        const groupKey = `${grantee}:${root}`;
        const revoked = isRevokedRow(it);
        const expired = !revoked && isExpired(it);
        const active = !revoked && !expired;

        const existing = map.get(groupKey);
        if (!existing) {
            map.set(groupKey, {
                groupKey,
                grantee,
                rootCidHash: root,
                versionCount: 1,
                activeCount: active ? 1 : 0,
                revokedCount: revoked ? 1 : 0,
                latestExpiresAt: it.expiresAt || null,
                firstCreatedAt: it.createdAt,
                status: revoked ? 'revoked' : expired ? 'expired' : 'active',
                revokeTarget: it,
            });
            continue;
        }
        existing.versionCount += 1;
        if (active) existing.activeCount += 1;
        if (revoked) existing.revokedCount += 1;
        if (it.expiresAt) {
            if (!existing.latestExpiresAt || new Date(it.expiresAt).getTime() > new Date(existing.latestExpiresAt).getTime()) {
                existing.latestExpiresAt = it.expiresAt;
            }
        }
        if (it.createdAt && (!existing.firstCreatedAt || new Date(it.createdAt).getTime() < new Date(existing.firstCreatedAt).getTime())) {
            existing.firstCreatedAt = it.createdAt;
        }
        if ((it.cidHash || '').toLowerCase() === root) {
            existing.revokeTarget = it;
        }
        if (active) existing.status = 'active';
        else if (expired && existing.status !== 'active') existing.status = 'expired';
    }
    return Array.from(map.values());
}

// ─────────── KV row (design pattern) ───────────
function KV({ label, value }: { label: string; value: React.ReactNode }) {
    const palette = useEhrPalette();
    return (
        <XStack style={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <Text
                style={{
                    fontFamily: SANS_SEMI,
                    fontSize: 11.5,
                    color: palette.EHR_OUTLINE,
                    letterSpacing: 0.3,
                    textTransform: 'uppercase',
                    fontWeight: '600',
                    flexShrink: 0,
                }}
            >
                {label}
            </Text>
            {typeof value === 'string' ? (
                <Text
                    style={{
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE,
                        textAlign: 'right',
                        flex: 1,
                    }}
                    numberOfLines={1}
                >
                    {value}
                </Text>
            ) : (
                <View style={{ flex: 1, alignItems: 'flex-end' }}>{value}</View>
            )}
        </XStack>
    );
}

// ─────────── Direct group card ───────────
const GroupCard = React.memo(function GroupCard({
    group,
    revokingKeys,
    onRevoke,
}: {
    group: GroupedConsent;
    revokingKeys: Set<string>;
    onRevoke: (g: GroupedConsent) => void;
}) {
    const palette = useEhrPalette();
    const isActive = group.status === 'active';
    const isRevoking = revokingKeys.has(group.groupKey);
    const urgency = getExpiryUrgency(group.latestExpiresAt);
    const statusToken = group.status === 'revoked' ? 'revoked' : group.status === 'expired' ? 'expired' : urgency === 'urgent' || urgency === 'soon' ? 'expiring' : 'active';

    return (
        <ViCard padding={16} style={{ marginBottom: 10 }}>
            {/* G.2 — resolve grantee wallet → name + specialty + hospital + verified badge */}
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                    <UserChip address={group.grantee} expanded showAddress={false} />
                </View>
                <ViStatusChip status={statusToken} />
            </XStack>
            <Text
                style={{
                    fontFamily: SANS,
                    fontSize: 12.5,
                    color: palette.EHR_OUTLINE,
                }}
                numberOfLines={1}
            >
                {group.versionCount === 1
                    ? '1 phiên bản hồ sơ'
                    : `Hồ sơ gốc + ${group.versionCount - 1} phiên bản`}
                {group.revokedCount > 0 ? ` (${group.revokedCount} đã thu hồi)` : ''}
            </Text>

            <View
                style={{
                    marginTop: 12,
                    paddingVertical: 10,
                    borderTopWidth: 0.5,
                    borderBottomWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                    borderStyle: 'dashed',
                    gap: 6,
                }}
            >
                <KV label="Hồ sơ" value={<RecordChip cidHash={group.rootCidHash} />} />
                {group.firstCreatedAt ? <KV label="Chia sẻ" value={formatDate(group.firstCreatedAt)} /> : null}
                <KV label="Hết hạn" value={formatExpiry(group.latestExpiresAt)} />
            </View>

            {isActive ? (
                <XStack style={{ marginTop: 12, gap: 8 }}>
                    <View style={{ flex: 1 }}>
                        <ViButton
                            variant="danger"
                            full
                            size="sm"
                            loading={isRevoking}
                            onPress={() => onRevoke(group)}
                        >
                            {isRevoking ? 'Đang thu hồi…' : (group.versionCount > 1 ? 'Thu hồi toàn bộ' : 'Thu hồi')}
                        </ViButton>
                    </View>
                </XStack>
            ) : null}
        </ViCard>
    );
});

// ─────────── All-grantees row card ───────────
type GranteeRow = {
    granteeAddress: string;
    cidHash: string;
    recordTitle?: string | null;
    recordType?: string | null;
    grantedAt?: string;
    expiresAt?: string;
    source: { type: 'direct' } | { type: 'via-delegate'; byDelegatee: string };
};

function AllGranteeCard({
    item,
    isRevoking,
    onRevoke,
}: {
    item: GranteeRow;
    isRevoking: boolean;
    onRevoke: (g: GranteeRow) => void;
}) {
    const palette = useEhrPalette();
    return (
        <ViCard padding={14} style={{ marginBottom: 10 }}>
            <XStack style={{ alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                    <UserChip address={item.granteeAddress} expanded showAddress={false} />
                </View>
                <ViSourceChip source={item.source.type === 'direct' ? 'direct' : 'via-delegate'} />
            </XStack>
            <View style={{ marginVertical: 4 }}>
                <RecordChip cidHash={item.cidHash} fallbackTitle={item.recordTitle ?? undefined} />
            </View>
            {item.source.type === 'via-delegate' ? (
                <XStack style={{ alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <Text
                        style={{
                            fontFamily: SANS,
                            fontSize: 12,
                            color: palette.EHR_OUTLINE,
                        }}
                    >
                        Cấp bởi:
                    </Text>
                    <View style={{ flex: 1 }}>
                        <UserChip
                            address={item.source.byDelegatee}
                            size="sm"
                            showAddress={false}
                            interactive={false}
                        />
                    </View>
                </XStack>
            ) : null}
            {item.expiresAt ? (
                <Text
                    style={{
                        marginTop: 6,
                        fontFamily: SANS,
                        fontSize: 12,
                        color: palette.EHR_OUTLINE,
                    }}
                >
                    Hết hạn:{' '}
                    {new Date(item.expiresAt).toLocaleString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </Text>
            ) : null}
            <View style={{ marginTop: 12 }}>
                <ViButton
                    variant="danger"
                    full
                    size="sm"
                    loading={isRevoking}
                    onPress={() => onRevoke(item)}
                >
                    {isRevoking ? 'Đang thu hồi…' : 'Thu hồi quyền'}
                </ViButton>
            </View>
        </ViCard>
    );
}

// ─────────── Delegation log row (audit-style) ───────────
function DelegationLogItem({ item }: { item: DelegationAccessLogRow }) {
    const palette = useEhrPalette();
    return (
        <ViCard padding={14} style={{ marginBottom: 10 }}>
            <XStack style={{ alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <View
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: palette.EHR_PRIMARY,
                    }}
                />
                <Text
                    style={{
                        fontFamily: SANS_SEMI,
                        fontSize: 11,
                        color: palette.EHR_PRIMARY,
                        letterSpacing: 1.2,
                        textTransform: 'uppercase',
                        fontWeight: '700',
                    }}
                >
                    Cấp quyền qua chuỗi uỷ quyền
                </Text>
            </XStack>
            <XStack style={{ alignItems: 'center', marginTop: 4 }}>
                <YStack style={{ flex: 1 }}>
                    <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE }}>
                        Người uỷ quyền
                    </Text>
                    <Text style={{ fontFamily: 'monospace', fontSize: 12.5, color: palette.EHR_ON_SURFACE }}>
                        {truncate(item.byDelegatee)}
                    </Text>
                </YStack>
                <Text
                    style={{
                        fontFamily: SANS_MEDIUM,
                        fontSize: 14,
                        color: palette.EHR_OUTLINE,
                        marginHorizontal: 8,
                    }}
                >
                    →
                </Text>
                <YStack style={{ flex: 1 }}>
                    <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE }}>
                        Người nhận
                    </Text>
                    <Text style={{ fontFamily: 'monospace', fontSize: 12.5, color: palette.EHR_ON_SURFACE }}>
                        {truncate(item.newGrantee)}
                    </Text>
                </YStack>
            </XStack>
            <View
                style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTopWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                    borderStyle: 'dashed',
                }}
            >
                <Text
                    style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_OUTLINE }}
                    numberOfLines={1}
                >
                    Hồ sơ: {item.rootCidHash.slice(0, 24)}…
                </Text>
                <Text
                    style={{ marginTop: 3, fontFamily: SANS, fontSize: 12, color: palette.EHR_OUTLINE }}
                >
                    {formatDate(item.createdAt)}
                </Text>
            </View>
        </ViCard>
    );
}

// ─────────── TabSwitcher ───────────
type TabId = 'direct' | 'all' | 'delegated';

function TabSwitcher({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
    const palette = useEhrPalette();
    const tabs: { id: TabId; label: string }[] = [
        { id: 'direct', label: 'Trực tiếp' },
        { id: 'all', label: 'Mọi người' },
        { id: 'delegated', label: 'Qua uỷ quyền' },
    ];
    return (
        <XStack style={{ paddingHorizontal: 20, marginBottom: 12, gap: 6 }}>
            {tabs.map((t) => {
                const isActive = active === t.id;
                return (
                    <Pressable key={t.id} onPress={() => onChange(t.id)} style={{ flex: 1 }}>
                        <View
                            style={{
                                paddingVertical: 8,
                                borderRadius: 999,
                                alignItems: 'center',
                                backgroundColor: isActive ? palette.EHR_ON_SURFACE : 'transparent',
                                borderWidth: 0.5,
                                borderColor: isActive ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE_SOFT,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_MEDIUM,
                                    fontSize: 12.5,
                                    color: isActive ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE_VARIANT,
                                    fontWeight: '600',
                                }}
                            >
                                {t.label}
                            </Text>
                        </View>
                    </Pressable>
                );
            })}
        </XStack>
    );
}

// ─────────── Empty state (inline) ───────────
function Empty({ title, description }: { title: string; description: string }) {
    const palette = useEhrPalette();
    return (
        <View style={{ paddingHorizontal: 20, paddingTop: 40, alignItems: 'center' }}>
            <Text
                style={{
                    fontFamily: SERIF,
                    fontSize: 20,
                    color: palette.EHR_ON_SURFACE,
                    textAlign: 'center',
                    letterSpacing: -0.2,
                }}
            >
                {title}
            </Text>
            <Text
                style={{
                    marginTop: 10,
                    fontFamily: SANS,
                    fontSize: 13.5,
                    color: palette.EHR_ON_SURFACE_VARIANT,
                    textAlign: 'center',
                    lineHeight: 20,
                    maxWidth: 280,
                }}
            >
                {description}
            </Text>
        </View>
    );
}

// ============ MAIN SCREEN ============

export default function AccessLogScreen() {
    const palette = useEhrPalette();
    const { token } = useAuthStore();
    const [tab, setTab] = useState<TabId>('direct');
    const [consents, setConsents] = useState<ConsentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [revokingKeys, setRevokingKeys] = useState<Set<string>>(new Set());

    const [allGrantees, setAllGrantees] = useState<GranteeRow[]>([]);
    const [isLoadingAll, setIsLoadingAll] = useState(false);

    const delegationLogsQuery = useDelegationAccessLogs('patient', !!token);

    const fetchConsents = useCallback(async () => {
        try {
            const data = await consentService.getMyGrantedConsents();
            const list = Array.isArray(data) ? data : data?.consents || [];
            setConsents(list);
        } catch (err) {
            console.error('Failed to fetch consents:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    const fetchAllGrantees = useCallback(async () => {
        setIsLoadingAll(true);
        try {
            const data = await consentService.getAllActiveGrantees();
            setAllGrantees(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch all grantees:', err);
        } finally {
            setIsLoadingAll(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchConsents();
    }, [token, fetchConsents]);

    useEffect(() => {
        if (token && tab === 'all') fetchAllGrantees();
    }, [token, tab, fetchAllGrantees]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        if (tab === 'direct') {
            fetchConsents();
        } else if (tab === 'all') {
            fetchAllGrantees();
        } else {
            delegationLogsQuery.refetch().finally(() => setIsRefreshing(false));
        }
    }, [tab, fetchConsents, fetchAllGrantees, delegationLogsQuery]);

    const handleRevoke = useCallback((group: GroupedConsent) => {
        const title = group.versionCount > 1 ? 'Thu hồi toàn bộ phiên bản' : 'Thu hồi quyền truy cập';
        const message = group.versionCount > 1
            ? `Bạn có chắc muốn thu hồi quyền xem hồ sơ (gồm ${group.versionCount} phiên bản) của địa chỉ này?`
            : 'Bạn có chắc muốn thu hồi quyền xem hồ sơ của địa chỉ này?';
        Alert.alert(title, message, [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Thu hồi',
                style: 'destructive',
                onPress: async () => {
                    const key = group.groupKey;
                    setRevokingKeys((prev) => new Set(prev).add(key));
                    try {
                        await consentService.revokeConsent(group.revokeTarget, group.revokeTarget.cidHash);
                        Alert.alert('Thành công', 'Đã thu hồi quyền truy cập.');
                        fetchConsents();
                    } catch (e: any) {
                        Alert.alert('Lỗi', e?.message || 'Không thể thu hồi. Vui lòng thử lại.');
                    } finally {
                        setRevokingKeys((prev) => { const next = new Set(prev); next.delete(key); return next; });
                    }
                },
            },
        ]);
    }, [fetchConsents]);

    const handleRevokeGrantee = useCallback((g: GranteeRow) => {
        const sourceText = g.source.type === 'direct'
            ? 'Bạn cấp trực tiếp'
            : `Bác sĩ ${truncate(g.source.byDelegatee)} cấp qua uỷ quyền`;
        Alert.alert(
            'Thu hồi quyền',
            `Thu hồi quyền của ${truncate(g.granteeAddress)} cho hồ sơ "${g.recordTitle || g.cidHash.slice(0, 10) + '…'}"?\n\n` +
            `Nguồn: ${sourceText}\n\n` +
            'Đây là thao tác on-chain, sẽ trừ 1 lượt chữ ký miễn phí.',
            [
                { text: 'Huỷ', style: 'cancel' },
                {
                    text: 'Thu hồi',
                    style: 'destructive',
                    onPress: async () => {
                        const key = `${g.granteeAddress}|${g.cidHash}`;
                        setRevokingKeys((prev) => new Set(prev).add(key));
                        try {
                            await consentService.revokeConsent(
                                {
                                    granteeAddress: g.granteeAddress,
                                    recipientAddress: g.granteeAddress,
                                    cidHash: g.cidHash,
                                },
                                g.cidHash,
                            );
                            Alert.alert('Thành công', 'Đã thu hồi quyền on-chain.');
                            fetchAllGrantees();
                            fetchConsents();
                        } catch (err: any) {
                            const msg = err?.data?.message || err?.message || 'Không thể thu hồi.';
                            Alert.alert('Lỗi', msg);
                        } finally {
                            setRevokingKeys((prev) => {
                                const next = new Set(prev);
                                next.delete(key);
                                return next;
                            });
                        }
                    },
                },
            ],
        );
    }, [fetchAllGrantees, fetchConsents]);

    const groupedConsents = useMemo(() => groupConsents(consents), [consents]);
    const activeGroupCount = useMemo(
        () => groupedConsents.filter((g) => g.status === 'active').length,
        [groupedConsents],
    );

    const initialLoading = tab === 'direct'
        ? (isLoading && !isRefreshing)
        : tab === 'all'
            ? (isLoadingAll && !isRefreshing)
            : delegationLogsQuery.isLoading;
    if (initialLoading) return <LoadingSpinner message="Đang tải nhật ký truy cập..." />;

    const delegationLogs = delegationLogsQuery.data || [];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            {/* Hero header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 }}>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 26,
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.3,
                        lineHeight: 30,
                    }}
                >
                    Quyền truy cập
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
                    Quản lý quyền xem hồ sơ. Thu hồi bất cứ lúc nào.
                </Text>
            </View>

            <TabSwitcher active={tab} onChange={setTab} />

            {tab === 'direct' ? (
                groupedConsents.length === 0 ? (
                    <Empty
                        title="Chưa có quyền truy cập"
                        description="Khi bạn chia sẻ hồ sơ cho bác sĩ, danh sách sẽ hiển thị tại đây."
                    />
                ) : (
                    <FlatList
                        data={groupedConsents}
                        keyExtractor={(g) => g.groupKey}
                        renderItem={({ item }) => (
                            <GroupCard group={item} revokingKeys={revokingKeys} onRevoke={handleRevoke} />
                        )}
                        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                        refreshControl={
                            <RefreshControl
                                refreshing={isRefreshing}
                                onRefresh={handleRefresh}
                                tintColor={palette.EHR_ON_SURFACE_VARIANT}
                            />
                        }
                        ListHeaderComponent={
                            <XStack
                                style={{
                                    alignItems: 'baseline',
                                    justifyContent: 'space-between',
                                    marginBottom: 12,
                                }}
                            >
                                <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_OUTLINE }}>
                                    {groupedConsents.length} quyền
                                </Text>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 12.5,
                                        color: palette.EHR_TERTIARY,
                                        fontWeight: '600',
                                    }}
                                >
                                    {activeGroupCount} đang hoạt động
                                </Text>
                            </XStack>
                        }
                    />
                )
            ) : tab === 'all' ? (
                allGrantees.length === 0 ? (
                    <Empty
                        title="Chưa có ai có quyền"
                        description="Danh sách hiển thị tất cả người đang giữ quyền (cả trực tiếp và qua uỷ quyền)."
                    />
                ) : (
                    <FlatList
                        data={allGrantees}
                        keyExtractor={(g) => `${g.granteeAddress}|${g.cidHash}`}
                        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                        refreshControl={
                            <RefreshControl
                                refreshing={isRefreshing}
                                onRefresh={handleRefresh}
                                tintColor={palette.EHR_ON_SURFACE_VARIANT}
                            />
                        }
                        renderItem={({ item }) => {
                            const key = `${item.granteeAddress}|${item.cidHash}`;
                            return (
                                <AllGranteeCard
                                    item={item}
                                    isRevoking={revokingKeys.has(key)}
                                    onRevoke={handleRevokeGrantee}
                                />
                            );
                        }}
                        ListHeaderComponent={
                            <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_OUTLINE, marginBottom: 12 }}>
                                {allGrantees.length} người đang có quyền
                            </Text>
                        }
                    />
                )
            ) : (
                delegationLogs.length === 0 ? (
                    <Empty
                        title="Chưa có cấp quyền qua uỷ quyền"
                        description="Khi bác sĩ trong chuỗi uỷ quyền cấp truy cập hồ sơ của bạn cho bác sĩ khác, lịch sử sẽ hiển thị tại đây."
                    />
                ) : (
                    <FlatList
                        data={delegationLogs}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => <DelegationLogItem item={item} />}
                        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                        refreshControl={
                            <RefreshControl
                                refreshing={isRefreshing || delegationLogsQuery.isFetching}
                                onRefresh={handleRefresh}
                                tintColor={palette.EHR_ON_SURFACE_VARIANT}
                            />
                        }
                        ListHeaderComponent={
                            <XStack
                                style={{
                                    alignItems: 'baseline',
                                    justifyContent: 'space-between',
                                    marginBottom: 12,
                                }}
                            >
                                <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_OUTLINE }}>
                                    {delegationLogs.length} bản ghi
                                </Text>
                                <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE }}>
                                    Audit on-chain
                                </Text>
                            </XStack>
                        }
                    />
                )
            )}
        </SafeAreaView>
    );
}

void ViSectionLabel;
