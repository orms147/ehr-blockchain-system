import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, User, FileText, ShieldOff } from 'lucide-react-native';
import { XStack, YStack, Text, View } from 'tamagui';

import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import useAuthStore from '../../store/authStore';
import keyShareService from '../../services/keyShare.service';
import { formatDate, formatExpiry } from '../../utils/dateFormatting';

type ExpiredItem = {
    id?: string;
    cidHash?: string;
    createdAt?: string;
    expiresAt?: string;
    senderAddress?: string;
    active?: boolean;
    record?: { ownerAddress?: string };
};

const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 8)}...${addr.slice(-4)}` : '???');

const ExpiredRecordItem = React.memo(({ item }: { item: ExpiredItem }) => {
    const ownerAddr = item.record?.ownerAddress || item.senderAddress;

    return (
        <View
            background="$background"
            borderColor="$borderColor"
            style={{ borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12, opacity: 0.8 }}
        >
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <YStack style={{ flex: 1, paddingRight: 12 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <User size={14} color="#64748B" style={{ marginRight: 6 }} />
                        <Text fontSize="$3" fontWeight="500" color="$color10">BN: {truncateAddr(ownerAddr)}</Text>
                    </XStack>
                    {item.cidHash ? (
                        <XStack style={{ alignItems: 'center' }}>
                            <FileText size={12} color="#64748B" style={{ marginRight: 6 }} />
                            <Text fontSize="$2" color="$color9" numberOfLines={1}>
                                {item.cidHash.substring(0, 24)}...
                            </Text>
                        </XStack>
                    ) : null}
                </YStack>

                <View style={{ backgroundColor: '#e5e7eb', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <XStack style={{ alignItems: 'center' }}>
                        <ShieldOff size={11} color="#4b5563" style={{ marginRight: 4 }} />
                        <Text fontSize="$2" fontWeight="700" style={{ color: '#4b5563' }}>Hết hạn</Text>
                    </XStack>
                </View>
            </XStack>

            <XStack style={{ alignItems: 'center', marginTop: 4 }}>
                <Clock size={12} color="#94A3B8" style={{ marginRight: 4 }} />
                <Text fontSize="$2" color="$color9">Chia sẻ: {formatDate(item.createdAt)}</Text>
                {item.expiresAt ? (
                    <Text fontSize="$2" style={{ color: '#b91c1c', marginLeft: 12 }}>Hết hạn: {formatExpiry(item.expiresAt)}</Text>
                ) : null}
            </XStack>
        </View>
    );
});

export default function DoctorExpiredRecordsScreen() {
    const { token } = useAuthStore();
    const [expiredRecords, setExpiredRecords] = useState<ExpiredItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchExpired = useCallback(async () => {
        try {
            const records = await keyShareService.getReceivedKeys();
            const expired = (records || []).filter((r: ExpiredItem) => r.active === false);
            expired.sort((a: ExpiredItem, b: ExpiredItem) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            setExpiredRecords(expired);
        } catch (err) {
            console.error('Failed to fetch expired records:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchExpired();
    }, [token, fetchExpired]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchExpired();
    }, [fetchExpired]);

    if (isLoading) return <LoadingSpinner message="Đang tải hồ sơ hết hạn..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAF3' }} edges={['right', 'left']}>
            <YStack style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                <Text fontSize="$7" fontWeight="800" color="$color12">Hồ sơ hết hạn</Text>
                <Text fontSize="$3" color="$color10" style={{ marginTop: 2 }}>
                    Danh sách quyền truy cập đã hết hạn hoặc bị thu hồi
                </Text>
            </YStack>
            {expiredRecords.length === 0 ? (
                <EmptyState
                    icon={Clock}
                    title="Không có hồ sơ hết hạn"
                    description="Các hồ sơ đã hết hạn hoặc bị thu hồi sẽ hiển thị tại đây."
                />
            ) : (
                <FlatList
                    data={expiredRecords}
                    keyExtractor={(item, index) => item.id?.toString() || item.cidHash || `expired-${index}`}
                    renderItem={({ item }) => <ExpiredRecordItem item={item} />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#14b8a6']} />}
                    ListHeaderComponent={
                        <Text fontSize="$3" color="$color10" style={{ marginBottom: 12 }}>
                            {expiredRecords.length} hồ sơ đã hết hạn / bị thu hồi
                        </Text>
                    }
                />
            )}
        </SafeAreaView>
    );
}






