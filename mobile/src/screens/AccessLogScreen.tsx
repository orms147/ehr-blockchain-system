import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shield, User, FileText, Clock, XCircle } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import consentService from '../services/consent.service';
import useAuthStore from '../store/authStore';

type ConsentItem = {
    id?: string;
    cidHash?: string;
    createdAt?: string;
    status?: string;
    active?: boolean;
    granteeAddress?: string;
    recipientAddress?: string;
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
    const isActive = item.active !== false && item.status !== 'revoked';
    const isRevoking = revokingId === consentId;

    return (
        <View
            background="$background"
            borderColor={isActive ? '$green6' : '$borderColor'}
            style={{ borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 12 }}
        >
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <YStack style={{ flex: 1, paddingRight: 12 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <User size={14} color="#64748B" style={{ marginRight: 6 }} />
                        <Text fontSize="$4" fontWeight="700" color="$color12">{truncateAddr(grantee)}</Text>
                    </XStack>
                    {item.cidHash ? (
                        <XStack style={{ alignItems: 'center' }}>
                            <FileText size={12} color="#64748B" style={{ marginRight: 6 }} />
                            <Text fontSize="$2" color="$color10" numberOfLines={1}>{item.cidHash.substring(0, 20)}...</Text>
                        </XStack>
                    ) : null}
                </YStack>

                <View style={{ backgroundColor: isActive ? '#dcfce7' : '#e5e7eb', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <Text fontSize="$2" fontWeight="700" style={{ color: isActive ? '#166534' : '#4b5563' }}>
                        {isActive ? 'Dang hoat dong' : 'Da thu hoi'}
                    </Text>
                </View>
            </XStack>

            {item.createdAt ? (
                <XStack style={{ alignItems: 'center', marginBottom: isActive ? 10 : 0 }}>
                    <Clock size={12} color="#94A3B8" style={{ marginRight: 4 }} />
                    <Text fontSize="$2" color="$color9">Cap ngay: {formatDate(item.createdAt)}</Text>
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
                    <Text color="$red10" fontWeight="500">{isRevoking ? 'Dang thu hoi...' : 'Thu hoi quyen'}</Text>
                </Button>
            ) : null}
        </View>
    );
});

export default function AccessLogScreen() {
    const { token } = useAuthStore();
    const [consents, setConsents] = useState<ConsentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);

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
        fetchConsents();
    }, [fetchConsents]);

    const handleRevoke = useCallback((consent: ConsentItem) => {
        Alert.alert('Thu hoi quyen truy cap', 'Ban co chac muon thu hoi quyen xem ho so cua dia chi nay?', [
            { text: 'Huy', style: 'cancel' },
            {
                text: 'Thu hoi',
                style: 'destructive',
                onPress: async () => {
                    const id = consent.id || consent.cidHash || '';
                    setRevokingId(id);
                    try {
                        await consentService.revokeConsent(consent, consent.cidHash);
                        Alert.alert('Thanh cong', 'Da thu hoi quyen truy cap.');
                        fetchConsents();
                    } catch (e: any) {
                        Alert.alert('Loi', e?.message || 'Khong the thu hoi. Vui long thu lai.');
                    } finally {
                        setRevokingId(null);
                    }
                },
            },
        ]);
    }, [fetchConsents]);

    if (isLoading && !isRefreshing) return <LoadingSpinner message="Dang tai nhat ky truy cap..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['right', 'left']}>
            <YStack style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                <Text fontSize="$7" fontWeight="800" color="$color12">Nhat ky truy cap</Text>
                <Text fontSize="$3" color="$color10" style={{ marginTop: 2 }}>
                    Quan ly cac quyen da chia se cho bac si
                </Text>
            </YStack>
            {consents.length === 0 ? (
                <EmptyState
                    icon={Shield}
                    title="Chua co quyen truy cap"
                    description="Khi ban chia se ho so cho bac si, danh sach quyen se hien thi tai day."
                />
            ) : (
                <FlatList
                    data={consents}
                    keyExtractor={(item, idx) => item.id || item.cidHash || `consent-${idx}`}
                    renderItem={({ item }) => <ConsentRenderItem item={item} revokingId={revokingId} onRevoke={handleRevoke} />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#2563eb']} />}
                    ListHeaderComponent={
                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Text fontSize="$3" color="$color10">{consents.length} quyen truy cap</Text>
                            <Text fontSize="$3" fontWeight="700" color="$green10">
                                {consents.filter((c) => c.active !== false && c.status !== 'revoked').length} dang hoat dong
                            </Text>
                        </XStack>
                    }
                />
            )}
        </SafeAreaView>
    );
}


