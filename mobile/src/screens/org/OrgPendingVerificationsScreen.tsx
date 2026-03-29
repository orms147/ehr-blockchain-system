import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, Check, X, Award } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import orgService from '../../services/org.service';
import verificationService from '../../services/verification.service';
import useAuthStore from '../../store/authStore';

type PendingItem = {
    id: string;
    fullName?: string;
    doctorAddress?: string;
    address?: string;
    walletAddress?: string;
    specialty?: string;
    requestedAt?: string;
    createdAt?: string;
};

const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 10)}...${addr.slice(-6)}` : '???');

const PendingVerificationItem = React.memo(({
    item,
    processingId,
    onApprove,
    onReject,
}: {
    item: PendingItem;
    processingId: string | null;
    onApprove: (i: PendingItem) => void;
    onReject: (i: PendingItem) => void;
}) => {
    const isProcessing = processingId === item.id;

    return (
        <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <XStack style={{ alignItems: 'center', marginBottom: 12 }}>
                <View background="$color3" style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={22} color="#475569" />
                </View>
                <YStack style={{ flex: 1 }}>
                    <Text fontSize="$4" fontWeight="700" color="$color12">{item.fullName || 'Bac si'}</Text>
                    {item.specialty ? <Text fontSize="$3" color="$color10">{item.specialty}</Text> : null}
                    <Text fontSize="$2" color="$color9" style={{ marginTop: 4 }}>
                        {truncateAddr(item.doctorAddress || item.address || item.walletAddress)}
                    </Text>
                    <Text fontSize="$2" color="$color9" style={{ marginTop: 4 }}>
                        Yeu cau: {new Date(item.requestedAt || item.createdAt || Date.now()).toLocaleDateString('vi-VN')}
                    </Text>
                </YStack>
            </XStack>

            <XStack style={{ gap: 8 }}>
                <Button
                    flex={1}
                    background="$green9"
                    pressStyle={{ background: '$green10' }}
                    icon={<Check size={16} color="white" />}
                    onPress={() => onApprove(item)}
                    disabled={isProcessing}
                    opacity={isProcessing ? 0.5 : 1}
                >
                    <Text color="white" fontWeight="700">Xac thuc</Text>
                </Button>
                <Button
                    flex={1}
                    variant="outlined"
                    borderColor="$red6"
                    pressStyle={{ background: '$red3' }}
                    icon={<X size={16} color="#DC2626" />}
                    onPress={() => onReject(item)}
                    disabled={isProcessing}
                    opacity={isProcessing ? 0.5 : 1}
                >
                    <Text color="$red10" fontWeight="700">Tu choi</Text>
                </Button>
            </XStack>
        </View>
    );
});

export default function OrgPendingVerificationsScreen() {
    const { token } = useAuthStore();
    const [pending, setPending] = useState<PendingItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const orgRes = await orgService.getMyOrg();
            if (orgRes?.hasOrg && orgRes.organization) {
                const pendingRes = await verificationService.getPendingVerifications();
                const list = Array.isArray(pendingRes) ? pendingRes : pendingRes?.requests || [];
                setPending(list);
            } else {
                setPending([]);
            }
        } catch (err) {
            console.error('Failed to fetch pending verifications:', err);
            setPending([]);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchData();
    }, [token, fetchData]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchData();
    }, [fetchData]);

    const handleApprove = useCallback((item: PendingItem) => {
        Alert.alert('Xac thuc bac si', `Ban co muon xac thuc "${item.fullName || item.doctorAddress}"?`, [
            { text: 'Huy', style: 'cancel' },
            {
                text: 'Xac thuc',
                onPress: async () => {
                    setProcessingId(item.id);
                    try {
                        await verificationService.approveVerification(item.id);
                        Alert.alert('Thanh cong', 'Bac si da duoc xac thuc.');
                        fetchData();
                    } catch {
                        Alert.alert('Loi', 'Khong the xac thuc bac si.');
                    } finally {
                        setProcessingId(null);
                    }
                },
            },
        ]);
    }, [fetchData]);

    const handleReject = useCallback((item: PendingItem) => {
        Alert.alert('Tu choi xac thuc', `Ban co muon tu choi "${item.fullName || item.doctorAddress}"?`, [
            { text: 'Huy', style: 'cancel' },
            {
                text: 'Tu choi',
                style: 'destructive',
                onPress: async () => {
                    setProcessingId(item.id);
                    try {
                        await verificationService.rejectVerification(item.id, 'Tu choi qua Mobile');
                        Alert.alert('Da tu choi', 'Yeu cau xac thuc da bi tu choi.');
                        fetchData();
                    } catch {
                        Alert.alert('Loi', 'Khong the tu choi.');
                    } finally {
                        setProcessingId(null);
                    }
                },
            },
        ]);
    }, [fetchData]);

    if (isLoading && !isRefreshing) return <LoadingSpinner message="Dang tai yeu cau xac thuc..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['right', 'left']}>
            <YStack style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                <Text fontSize="$7" fontWeight="800" color="$color12">Cho xac thuc</Text>
                <Text fontSize="$3" color="$color10" style={{ marginTop: 2 }}>
                    Duyet hoac tu choi yeu cau xac thuc bac si
                </Text>
            </YStack>
            {pending.length === 0 ? (
                <EmptyState
                    icon={Award}
                    title="Khong co yeu cau xac thuc"
                    description="Khi bac si yeu cau xac thuc trong to chuc, ho se hien thi tai day."
                />
            ) : (
                <FlatList
                    data={pending}
                    keyExtractor={(item, idx) => item.id?.toString() || item.doctorAddress || idx.toString()}
                    renderItem={({ item }) => (
                        <PendingVerificationItem
                            item={item}
                            processingId={processingId}
                            onApprove={handleApprove}
                            onReject={handleReject}
                        />
                    )}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#7c3aed']} />}
                    ListHeaderComponent={<Text fontSize="$3" color="$color10" style={{ marginBottom: 12 }}>{pending.length} yeu cau dang cho</Text>}
                />
            )}
        </SafeAreaView>
    );
}


