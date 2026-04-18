import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shield, User, FileText, Clock, XCircle, Network, ArrowRight, Layers } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import consentService from '../services/consent.service';
import useAuthStore from '../store/authStore';
import { useDelegationAccessLogs, type DelegationAccessLogRow } from '../hooks/queries/useDelegations';
import { formatExpiry, formatDate, getExpiryUrgency } from '../utils/dateFormatting';
import {
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
} from '../constants/uiColors';

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

const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 10)}...${addr.slice(-6)}` : '???');

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
        // Keep the latest expiresAt (root consent expiry)
        if (it.expiresAt) {
            if (!existing.latestExpiresAt || new Date(it.expiresAt).getTime() > new Date(existing.latestExpiresAt).getTime()) {
                existing.latestExpiresAt = it.expiresAt;
            }
        }
        // Keep the earliest createdAt
        if (it.createdAt && (!existing.firstCreatedAt || new Date(it.createdAt).getTime() < new Date(existing.firstCreatedAt).getTime())) {
            existing.firstCreatedAt = it.createdAt;
        }
        // Prefer row whose cidHash === rootCidHash as revokeTarget (patient revokes root)
        if ((it.cidHash || '').toLowerCase() === root) {
            existing.revokeTarget = it;
        }
        // Group status: active if any version active, otherwise expired wins over revoked.
        if (active) existing.status = 'active';
        else if (expired && existing.status !== 'active') existing.status = 'expired';
    }
    return Array.from(map.values());
}

const GroupRenderItem = React.memo(({
    group,
    revokingKeys,
    onRevoke,
}: {
    group: GroupedConsent;
    revokingKeys: Set<string>;
    onRevoke: (g: GroupedConsent) => void;
}) => {
    const isActive = group.status === 'active';
    const isRevoking = revokingKeys.has(group.groupKey);
    const statusLabel = group.status === 'revoked' ? 'Đã thu hồi' : group.status === 'expired' ? 'Đã hết hạn' : 'Đang hoạt động';
    const urgency = getExpiryUrgency(group.latestExpiresAt);
    const expiryColor = urgency === 'urgent' ? '#DC2626' : urgency === 'soon' ? '#B45309' : EHR_ON_SURFACE_VARIANT;

    return (
        <View
            style={{
                backgroundColor: '#FFFFFF',
                borderColor: isActive ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                borderWidth: 1,
                borderRadius: 20,
                padding: 14,
                marginBottom: 12,
            }}
        >
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <YStack style={{ flex: 1, paddingRight: 12 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <User size={14} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                        <Text fontSize="$4" fontWeight="700" color="$color12">{truncateAddr(group.grantee)}</Text>
                    </XStack>
                    <XStack style={{ alignItems: 'center', marginBottom: 2 }}>
                        <Layers size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                        <Text fontSize="$2" color="$color10">
                            {group.versionCount === 1
                                ? '1 hồ sơ'
                                : `Hồ sơ gốc + ${group.versionCount - 1} phiên bản`}
                            {group.revokedCount > 0 ? ` (${group.revokedCount} đã thu hồi)` : ''}
                        </Text>
                    </XStack>
                    <XStack style={{ alignItems: 'center' }}>
                        <FileText size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                        <Text fontSize="$2" color="$color10" numberOfLines={1}>
                            {group.rootCidHash.substring(0, 20)}...
                        </Text>
                    </XStack>
                </YStack>

                <View style={{ backgroundColor: isActive ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <Text fontSize="$2" fontWeight="700" style={{ color: isActive ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}>
                        {statusLabel}
                    </Text>
                </View>
            </XStack>

            {group.firstCreatedAt ? (
                <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                    <Clock size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 4 }} />
                    <Text fontSize="$2" color="$color9">Chia sẻ: {formatDate(group.firstCreatedAt)}</Text>
                </XStack>
            ) : null}
            <XStack style={{ alignItems: 'center', marginBottom: isActive ? 10 : 0 }}>
                <Clock size={12} color={expiryColor} style={{ marginRight: 4 }} />
                <Text fontSize="$2" style={{ color: expiryColor }} fontWeight={urgency === 'urgent' ? '700' : '500'}>
                    Hết hạn: {formatExpiry(group.latestExpiresAt)}
                </Text>
            </XStack>

            {isActive ? (
                <Button
                    size="$3"
                    variant="outlined"
                    borderColor="$red6"
                    pressStyle={{ background: '$red3' }}
                    icon={<XCircle size={15} color="#DC2626" />}
                    onPress={() => onRevoke(group)}
                    disabled={isRevoking}
                    opacity={isRevoking ? 0.5 : 1}
                >
                    <Text color="$red10" fontWeight="500">
                        {isRevoking
                            ? 'Đang thu hồi...'
                            : group.versionCount > 1
                                ? 'Thu hồi toàn bộ'
                                : 'Thu hồi quyền'}
                    </Text>
                </Button>
            ) : null}
        </View>
    );
});

// ============ DELEGATION LOG ITEM ============

const DelegationLogItem = React.memo(({ item }: { item: DelegationAccessLogRow }) => {
    return (
        <View
            style={{
                backgroundColor: '#FFFFFF',
                borderColor: EHR_OUTLINE_VARIANT,
                borderWidth: 1,
                borderRadius: 20,
                padding: 14,
                marginBottom: 12,
            }}
        >
            <XStack style={{ alignItems: 'center', marginBottom: 10 }}>
                <Network size={14} color={EHR_PRIMARY} style={{ marginRight: 6 }} />
                <Text fontSize="$3" fontWeight="700" style={{ color: EHR_PRIMARY }}>
                    Cấp quyền qua chuỗi uỷ quyền
                </Text>
            </XStack>

            <XStack style={{ alignItems: 'center', marginBottom: 8 }}>
                <YStack style={{ flex: 1 }}>
                    <Text fontSize="$2" color="$color10">Bác sĩ uỷ quyền (cấp tiếp)</Text>
                    <Text fontSize="$3" fontWeight="700" color="$color12">{truncateAddr(item.byDelegatee)}</Text>
                </YStack>
                <ArrowRight size={16} color={EHR_ON_SURFACE_VARIANT} style={{ marginHorizontal: 8 }} />
                <YStack style={{ flex: 1 }}>
                    <Text fontSize="$2" color="$color10">Bác sĩ nhận</Text>
                    <Text fontSize="$3" fontWeight="700" color="$color12">{truncateAddr(item.newGrantee)}</Text>
                </YStack>
            </XStack>

            <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                <FileText size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                <Text fontSize="$2" color="$color10" numberOfLines={1}>Hồ sơ: {item.rootCidHash.substring(0, 24)}...</Text>
            </XStack>
            <XStack style={{ alignItems: 'center' }}>
                <Clock size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                <Text fontSize="$2" color="$color9">{formatDate(item.createdAt)}</Text>
            </XStack>
        </View>
    );
});

// ============ TAB SWITCHER ============

type TabId = 'direct' | 'delegated';

function TabSwitcher({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
    const tabs: { id: TabId; label: string }[] = [
        { id: 'direct', label: 'Trực tiếp' },
        { id: 'delegated', label: 'Qua uỷ quyền' },
    ];
    return (
        <XStack style={{ paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
            {tabs.map((t) => {
                const isActive = active === t.id;
                return (
                    <Pressable key={t.id} onPress={() => onChange(t.id)} style={{ flex: 1 }}>
                        <View
                            style={{
                                paddingVertical: 10,
                                borderRadius: 12,
                                alignItems: 'center',
                                backgroundColor: isActive ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW,
                                borderWidth: 1.5,
                                borderColor: isActive ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                            }}
                        >
                            <Text fontSize="$3" fontWeight={isActive ? '800' : '600'} style={{ color: isActive ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}>
                                {t.label}
                            </Text>
                        </View>
                    </Pressable>
                );
            })}
        </XStack>
    );
}

// ============ MAIN SCREEN ============

export default function AccessLogScreen() {
    const { token } = useAuthStore();
    const [tab, setTab] = useState<TabId>('direct');
    const [consents, setConsents] = useState<ConsentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [revokingKeys, setRevokingKeys] = useState<Set<string>>(new Set());

    // Tab 2: delegation audit log
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

    useEffect(() => {
        if (token) fetchConsents();
    }, [token, fetchConsents]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        if (tab === 'direct') {
            fetchConsents();
        } else {
            delegationLogsQuery.refetch().finally(() => setIsRefreshing(false));
        }
    }, [tab, fetchConsents, delegationLogsQuery]);

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

    const groupedConsents = useMemo(() => groupConsents(consents), [consents]);
    const activeGroupCount = useMemo(
        () => groupedConsents.filter((g) => g.status === 'active').length,
        [groupedConsents]
    );

    const initialLoading = tab === 'direct' ? (isLoading && !isRefreshing) : delegationLogsQuery.isLoading;
    if (initialLoading) return <LoadingSpinner message="Đang tải nhật ký truy cập..." />;

    const delegationLogs = delegationLogsQuery.data || [];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['right', 'left']}>
            <YStack style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                <Text fontSize="$7" fontWeight="800" color="$color12">Nhật ký truy cập</Text>
                <Text fontSize="$3" color="$color10" style={{ marginTop: 2 }}>
                    Quản lý các quyền truy cập hồ sơ của bạn
                </Text>
            </YStack>

            <TabSwitcher active={tab} onChange={setTab} />

            {tab === 'direct' ? (
                groupedConsents.length === 0 ? (
                    <EmptyState
                        icon={Shield}
                        title="Chưa có quyền truy cập"
                        description="Khi bạn chia sẻ hồ sơ cho bác sĩ, danh sách quyền sẽ hiển thị tại đây."
                    />
                ) : (
                    <FlatList
                        data={groupedConsents}
                        keyExtractor={(g) => g.groupKey}
                        renderItem={({ item }) => <GroupRenderItem group={item} revokingKeys={revokingKeys} onRevoke={handleRevoke} />}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[EHR_PRIMARY]} />}
                        ListHeaderComponent={
                            <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <Text fontSize="$3" color="$color10">{groupedConsents.length} quyền truy cập</Text>
                                <Text fontSize="$3" fontWeight="700" style={{ color: EHR_PRIMARY }}>
                                    {activeGroupCount} đang hoạt động
                                </Text>
                            </XStack>
                        }
                    />
                )
            ) : (
                delegationLogs.length === 0 ? (
                    <EmptyState
                        icon={Network}
                        title="Chưa có cấp quyền qua uỷ quyền"
                        description="Khi một bác sĩ trong chuỗi uỷ quyền cấp truy cập hồ sơ của bạn cho bác sĩ khác, lịch sử sẽ hiển thị tại đây."
                    />
                ) : (
                    <FlatList
                        data={delegationLogs}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => <DelegationLogItem item={item} />}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                        refreshControl={<RefreshControl refreshing={isRefreshing || delegationLogsQuery.isFetching} onRefresh={handleRefresh} colors={[EHR_PRIMARY]} />}
                        ListHeaderComponent={
                            <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <Text fontSize="$3" color="$color10">{delegationLogs.length} bản ghi</Text>
                                <Text fontSize="$2" color="$color9">Audit on-chain</Text>
                            </XStack>
                        }
                    />
                )
            )}
        </SafeAreaView>
    );
}
