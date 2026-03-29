import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Check, X, Clock, User } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import useRequests from '../hooks/useRequests';
import requestService from '../services/request.service';
import authService from '../services/auth.service';
import { getOrCreateEncryptionKeypair, encryptForRecipient } from '../services/nacl-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import walletActionService from '../services/walletAction.service';

type RequestItem = {
    id?: string;
    requestId?: string;
    requesterAddress?: string;
    requestType?: number;
    createdAt?: string;
    recordTitle?: string;
    cidHash?: string;
    status?: 'pending' | 'approved' | 'rejected' | string;
};

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected';

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return dateStr;
    }
};

const getRequestTypeLabel = (reqType?: number) => {
    switch (reqType) {
        case 0: return 'Chi xem';
        case 1: return 'Toan quyen';
        case 2: return 'Khan cap';
        default: return 'Khong ro';
    }
};

const getStatusLabel = (status?: string) => {
    switch (String(status || 'pending').toLowerCase()) {
        case 'approved': return 'Da duyet';
        case 'rejected': return 'Da tu choi';
        default: return 'Cho duyet';
    }
};

const getStatusColor = (status?: string) => {
    switch (String(status || 'pending').toLowerCase()) {
        case 'approved': return { bg: '#DCFCE7', text: '#166534' };
        case 'rejected': return { bg: '#FEE2E2', text: '#B91C1C' };
        default: return { bg: '#FEF3C7', text: '#92400E' };
    }
};

const RequestRenderItem = React.memo(({
    item,
    onApprove,
    onArchive,
}: {
    item: RequestItem;
    onApprove: (r: RequestItem) => void;
    onArchive: (r: RequestItem) => void;
}) => {
    const normalizedStatus = (item.status || 'pending').toLowerCase();
    const statusStyle = getStatusColor(normalizedStatus);
    const isPending = normalizedStatus === 'pending';

    return (
        <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <YStack style={{ flex: 1, paddingRight: 10 }}>
                    <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 4 }}>Yeu cau truy cap ho so</Text>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <User size={14} color="#64748B" style={{ marginRight: 4 }} />
                        <Text fontSize="$3" color="$color10" numberOfLines={1}>
                            {item.requesterAddress ? `${item.requesterAddress.substring(0, 8)}...${item.requesterAddress.slice(-4)}` : 'Khong ro'}
                        </Text>
                    </XStack>
                    {item.recordTitle ? <Text fontSize="$3" color="olive">Ho so: {item.recordTitle}</Text> : null}
                </YStack>
                <View style={{ backgroundColor: statusStyle.bg, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <Text style={{ color: statusStyle.text, fontSize: 12, fontWeight: '700' }}>{getStatusLabel(normalizedStatus)}</Text>
                </View>
            </XStack>

            <XStack style={{ alignItems: 'center', marginBottom: isPending ? 12 : 0 }}>
                <View background="$color3" style={{ borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, marginRight: 8 }}>
                    <Text fontSize="$2" color="$color11">{getRequestTypeLabel(item.requestType)}</Text>
                </View>
                <XStack style={{ alignItems: 'center' }}>
                    <Clock size={12} color="#64748B" style={{ marginRight: 4 }} />
                    <Text fontSize="$2" color="$color9">{formatDate(item.createdAt)}</Text>
                </XStack>
            </XStack>

            {isPending ? (
                <XStack style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <Button size="$3" variant="outlined" borderColor="$borderColor" pressStyle={{ background: '$color3' }} icon={<X size={15} color="#6B7280" />} onPress={() => onArchive(item)}>
                        <Text color="$color11" fontWeight="500">An</Text>
                    </Button>
                    <Button size="$3" background="olive" pressStyle={{ background: 'olive' }} icon={<Check size={15} color="white" />} onPress={() => onApprove(item)}>
                        <Text color="white" fontWeight="500">Chap nhan</Text>
                    </Button>
                </XStack>
            ) : null}
        </View>
    );
});

export default function RequestsScreen() {
    const { requests, isLoading, isRefreshing, refresh } = useRequests();
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

    const normalizedRequests = useMemo(() => {
        return (requests || []).map((r: RequestItem) => ({
            ...r,
            status: String(r.status || 'pending').toLowerCase(),
        }));
    }, [requests]);

    const counts = useMemo(() => ({
        all: normalizedRequests.length,
        pending: normalizedRequests.filter((r) => r.status === 'pending').length,
        approved: normalizedRequests.filter((r) => r.status === 'approved').length,
        rejected: normalizedRequests.filter((r) => r.status === 'rejected').length,
    }), [normalizedRequests]);

    const filteredRequests = useMemo(() => {
        if (activeFilter === 'all') return normalizedRequests;
        return normalizedRequests.filter((r) => r.status === activeFilter);
    }, [activeFilter, normalizedRequests]);

    const handleApprove = useCallback(async (request: RequestItem) => {
        try {
            const { walletClient, address } = await walletActionService.getWalletContext();

            const reqId = request.requestId || request.id;
            if (!reqId) throw new Error('Missing request id');

            const { typedData, deadline } = await requestService.getApprovalMessage(reqId);

            const signature = await walletActionService.signTypedData(walletClient, {
                domain: typedData.domain,
                types: typedData.types,
                primaryType: typedData.primaryType,
                message: typedData.message,
            });

            let encryptedKeyPayload: string | null = null;
            let senderPublicKey: string | null = null;

            try {
                const myKeypair = await getOrCreateEncryptionKeypair(walletClient, address);
                senderPublicKey = myKeypair.publicKey;

                const docKeyRes = await authService.getEncryptionKey(request.requesterAddress);
                const doctorPubKey = docKeyRes?.encryptionPublicKey;

                const localRecordsStr = await AsyncStorage.getItem('ehr_local_records');
                const localRecords = localRecordsStr ? JSON.parse(localRecordsStr) : {};
                const localRecord = localRecords[request.cidHash || ''];

                if (localRecord && doctorPubKey) {
                    const keyPayload = JSON.stringify({ cid: localRecord.cid, aesKey: localRecord.aesKey });
                    encryptedKeyPayload = encryptForRecipient(keyPayload, doctorPubKey, myKeypair.secretKey);
                }
            } catch (err) {
                console.warn('Key sharing encryption step failed/skipped:', err);
            }

            await (requestService as any).approveWithSignature(
                reqId,
                signature,
                deadline,
                encryptedKeyPayload || undefined,
                request.cidHash || undefined,
                senderPublicKey || undefined
            );

            Alert.alert('Thanh cong', 'Da phe duyet va cap quyen truy cap.');
            refresh();
        } catch (error) {
            console.error(error);
            Alert.alert('Loi', 'Khong the phe duyet yeu cau.');
        }
    }, [refresh]);

    const handleArchive = useCallback((request: RequestItem) => {
        Alert.alert('An yeu cau', 'Ban co chac chan muon an yeu cau nay?', [
            { text: 'Huy', style: 'cancel' },
            {
                text: 'An',
                style: 'destructive',
                onPress: async () => {
                    try {
                        const reqId = request.requestId || request.id;
                        if (!reqId) throw new Error('Missing request id');
                        await requestService.archiveRequest(reqId);
                        refresh();
                    } catch (e) {
                        console.error(e);
                        Alert.alert('Loi', 'Khong the an yeu cau.');
                    }
                },
            },
        ]);
    }, [refresh]);

    if (isLoading && !isRefreshing) {
        return <LoadingSpinner message="Dang tai danh sach yeu cau..." />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['right', 'left']}>
            <YStack style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                <Text fontSize="$7" fontWeight="800" color="$color12">Yeu cau truy cap</Text>
                <Text fontSize="$3" color="$color10" style={{ marginTop: 2, marginBottom: 10 }}>
                    Quan ly quyen xem ho so tu bac si
                </Text>
                <XStack style={{ gap: 8, flexWrap: 'wrap' }}>
                    {([
                        ['all', 'Tat ca'],
                        ['pending', 'Cho duyet'],
                        ['approved', 'Da duyet'],
                        ['rejected', 'Da tu choi'],
                    ] as [FilterKey, string][]).map(([key, label]) => {
                        const active = key === activeFilter;
                        return (
                            <Button
                                key={key}
                                size="$2"
                                background={active ? 'olive' : '$color3'}
                                borderColor={active ? 'olive' : '$borderColor'}
                                borderWidth={1}
                                pressStyle={{ opacity: 0.85 }}
                                onPress={() => setActiveFilter(key)}
                            >
                                <Text color={active ? 'white' : '$color11'} fontWeight="700">
                                    {label} ({counts[key]})
                                </Text>
                            </Button>
                        );
                    })}
                </XStack>
            </YStack>

            {filteredRequests.length === 0 ? (
                <EmptyState
                    icon={Bell}
                    message="Khong co yeu cau nao"
                    subMessage={activeFilter === 'all' ? 'Khi bac si yeu cau truy cap ho so, yeu cau se hien thi o day.' : 'Khong co yeu cau o nhom trang thai nay.'}
                />
            ) : (
                <FlatList
                    data={filteredRequests}
                    keyExtractor={(item: any, index) => item.id?.toString() || item.requestId || item.cidHash || `request-${index}`}
                    renderItem={({ item }) => <RequestRenderItem item={item} onApprove={handleApprove} onArchive={handleArchive} />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} colors={['#2563eb']} />}
                    ListHeaderComponent={
                        <YStack style={{ marginBottom: 10 }}>
                            <Text fontSize="$3" color="$color10">{filteredRequests.length} yeu cau</Text>
                        </YStack>
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}



