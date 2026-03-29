import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, Clock, CheckCircle, XCircle, User } from 'lucide-react-native';
import { XStack, YStack, Text, View } from 'tamagui';

import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';

type RequestItem = {
    id?: string;
    requestId?: string;
    patientAddress?: string;
    createdAt?: string;
    cidHash?: string;
    status?: string;
};

const getStatusConfig = (status?: string) => {
    switch (status?.toLowerCase()) {
        case 'approved':
        case 'completed':
            return { label: 'Da duyet', color: '#166534', bg: '#dcfce7', Icon: CheckCircle };
        case 'rejected':
            return { label: 'Bi tu choi', color: '#991b1b', bg: '#fee2e2', Icon: XCircle };
        case 'expired':
            return { label: 'Het han', color: '#374151', bg: '#e5e7eb', Icon: Clock };
        default:
            return { label: 'Dang cho', color: '#92400e', bg: '#fef3c7', Icon: Clock };
    }
};

const OutgoingRequestItem = React.memo(({ item }: { item: RequestItem }) => {
    const cfg = getStatusConfig(item.status);
    const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 8)}...${addr.slice(-4)}` : '???');

    return (
        <View
            background="$background"
            borderColor="$borderColor"
            style={{ borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 12 }}
        >
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <YStack style={{ flex: 1, paddingRight: 12 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <User size={14} color="#64748B" style={{ marginRight: 6 }} />
                        <Text fontSize="$4" fontWeight="700" color="$color12">
                            Benh nhan: {truncateAddr(item.patientAddress)}
                        </Text>
                    </XStack>
                    <Text fontSize="$2" color="$color9">
                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString('vi-VN') : ''}
                    </Text>
                </YStack>

                <View style={{ backgroundColor: cfg.bg, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <XStack style={{ alignItems: 'center' }}>
                        <cfg.Icon size={12} color={cfg.color} style={{ marginRight: 4 }} />
                        <Text fontSize="$2" fontWeight="700" style={{ color: cfg.color }}>
                            {cfg.label}
                        </Text>
                    </XStack>
                </View>
            </XStack>

            {item.cidHash ? (
                <Text fontSize="$2" color="$color9" numberOfLines={1}>
                    CID: {item.cidHash}
                </Text>
            ) : null}
        </View>
    );
});

export default function DoctorOutgoingScreen() {
    const { token } = useAuthStore();
    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchOutgoing = useCallback(async () => {
        try {
            const data = await api.get('/api/requests/outgoing');
            const normalized = Array.isArray(data) ? data : data?.requests || [];
            setRequests(normalized);
        } catch (err) {
            console.error('Failed to fetch outgoing:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchOutgoing();
    }, [token, fetchOutgoing]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchOutgoing();
    }, [fetchOutgoing]);

    if (isLoading && !isRefreshing) return <LoadingSpinner message="Dang tai yeu cau da gui..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['right', 'left']}>
            <YStack style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                <Text fontSize="$7" fontWeight="800" color="$color12">Yeu cau da gui</Text>
                <Text fontSize="$3" color="$color10" style={{ marginTop: 2 }}>
                    Theo doi trang thai cac yeu cau truy cap ho so
                </Text>
            </YStack>
            {requests.length === 0 ? (
                <EmptyState
                    icon={Send}
                    title="Chua gui yeu cau nao"
                    description="Khi ban yeu cau truy cap ho so benh nhan, lich su se hien thi tai day."
                />
            ) : (
                <FlatList
                    data={requests}
                    keyExtractor={(item, idx) => item.id?.toString() || item.requestId || `req-${idx}`}
                    renderItem={({ item }) => <OutgoingRequestItem item={item} />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#14b8a6']} />}
                    ListHeaderComponent={<Text fontSize="$3" color="$color10" style={{ marginBottom: 12 }}>{requests.length} yeu cau da gui</Text>}
                />
            )}
        </SafeAreaView>
    );
}

