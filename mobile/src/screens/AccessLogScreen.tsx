import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shield, User, FileText, Clock, XCircle, Network, ArrowRight } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import consentService from '../services/consent.service';
import useAuthStore from '../store/authStore';
import { useDelegationAccessLogs, type DelegationAccessLogRow } from '../hooks/queries/useDelegations';
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
    createdAt?: string;
    status?: string;
    active?: boolean;
    granteeAddress?: string;
    recipientAddress?: string;
    expiresAt?: string | null;
};

const isExpired = (c: ConsentItem) => {
    if (!c.expiresAt) return false;
    try {
        return new Date(c.expiresAt).getTime() < Date.now();
    } catch { return false; }
};

const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 10)}...${addr.slice(-6)}` : '???');

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr;
    }
};

const ConsentRenderItem = React.memo(({
    item,
    revokingId,
    onRevoke,
}: {
    item: ConsentItem;
    revokingId: string | null;
    onRevoke: (c: ConsentItem) => void;
}) => {
    const grantee = item.granteeAddress || item.recipientAddress;
    const consentId = item.id || item.cidHash || '';
    const expired = isExpired(item);
    const isRevoked = item.active === false || item.status === 'revoked';
    const isActive = !isRevoked && !expired;
    const isRevoking = revokingId === consentId;
    const statusLabel = isRevoked ? 'Đã thu hồi' : expired ? 'Đã hết hạn' : 'Đang hoạt động';

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
                        <Text fontSize="$4" fontWeight="700" color="$color12">{truncateAddr(grantee)}</Text>
                    </XStack>
                    {item.cidHash ? (
                        <XStack style={{ alignItems: 'center' }}>
                            <FileText size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                            <Text fontSize="$2" color="$color10" numberOfLines={1}>{item.cidHash.substring(0, 20)}...</Text>
                        </XStack>
                    ) : null}
                </YStack>

                <View style={{ backgroundColor: isActive ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <Text fontSize="$2" fontWeight="700" style={{ color: isActive ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}>
                        {statusLabel}
                    </Text>
                </View>
            </XStack>

            {item.createdAt ? (
                <XStack style={{ alignItems: 'center', marginBottom: isActive ? 10 : 0 }}>
                    <Clock size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 4 }} />
                    <Text fontSize="$2" color="$color9">Cập nhật: {formatDate(item.createdAt)}</Text>
                </XStack>
            ) : null}

            {isActive ? (
                <Button
                    size="$3"
                    variant="outlined"
                    borderColor="$red6"
                    pressStyle={{ background: '$red3' }}
                    icon={<XCircle size={15} color="#DC2626" />}
                    onPress={() => onRevoke(item)}
                    disabled={isRevoking}
                    opacity={isRevoking ? 0.5 : 1}
                >
                    <Text color="$red10" fontWeight="500">{isRevoking ? 'Đang thu hồi...' : 'Thu hồi quyền'}</Text>
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
    const [revokingId, setRevokingId] = useState<string | null>(null);

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

    const handleRevoke = useCallback((consent: ConsentItem) => {
        Alert.alert('Thu hồi quyền truy cập', 'Bạn có chắc muốn thu hồi quyền xem hồ sơ của địa chỉ này?', [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Thu hồi',
                style: 'destructive',
                onPress: async () => {
                    const id = consent.id || consent.cidHash || '';
                    setRevokingId(id);
                    try {
                        await consentService.revokeConsent(consent, consent.cidHash);
                        Alert.alert('Thành công', 'Đã thu hồi quyền truy cập.');
                        fetchConsents();
                    } catch (e: any) {
                        Alert.alert('Lỗi', e?.message || 'Không thể thu hồi. Vui lòng thử lại.');
                    } finally {
                        setRevokingId(null);
                    }
                },
            },
        ]);
    }, [fetchConsents]);

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
                consents.length === 0 ? (
                    <EmptyState
                        icon={Shield}
                        title="Chưa có quyền truy cập"
                        description="Khi bạn chia sẻ hồ sơ cho bác sĩ, danh sách quyền sẽ hiển thị tại đây."
                    />
                ) : (
                    <FlatList
                        data={consents}
                        keyExtractor={(item, idx) => item.id || item.cidHash || `consent-${idx}`}
                        renderItem={({ item }) => <ConsentRenderItem item={item} revokingId={revokingId} onRevoke={handleRevoke} />}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[EHR_PRIMARY]} />}
                        ListHeaderComponent={
                            <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <Text fontSize="$3" color="$color10">{consents.length} quyền truy cập</Text>
                                <Text fontSize="$3" fontWeight="700" style={{ color: EHR_PRIMARY }}>
                                    {consents.filter((c) => c.active !== false && c.status !== 'revoked' && !isExpired(c)).length} đang hoạt động
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





