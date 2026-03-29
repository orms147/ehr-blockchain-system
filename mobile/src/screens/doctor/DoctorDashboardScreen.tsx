import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileText, Users, Clock3 } from 'lucide-react-native';
import { YStack, XStack, Text, View } from 'tamagui';

import SharedRecordCard from '../../components/SharedRecordCard';
import RoleSwitcher from '../../components/RoleSwitcher';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import AnimatedSection from '../../components/AnimatedSection';
import keyShareService from '../../services/keyShare.service';
import useAuthStore from '../../store/authStore';

type SharedRecord = {
    id?: string;
    cidHash?: string;
    createdAt?: string;
    status?: string;
    active?: boolean;
    parentCidHash?: string;
    senderAddress?: string;
    versionCount?: number;
    record?: { ownerAddress?: string };
};

export default function DoctorDashboardScreen() {
    const { token } = useAuthStore();
    const [sharedRecords, setSharedRecords] = useState<SharedRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchSharedRecords = useCallback(async () => {
        try {
            const records: SharedRecord[] = await keyShareService.getReceivedKeys();

            const uniqueMap = new Map<string, SharedRecord>();
            (records || []).forEach((r) => {
                if (r?.cidHash) uniqueMap.set(r.cidHash, r);
            });
            const distinct = Array.from(uniqueMap.values());

            const activeList = distinct.filter((r) => r.active !== false);
            const activeParentCids = new Set(
                activeList.map((r) => r.parentCidHash?.toLowerCase()).filter(Boolean) as string[]
            );
            const latestActive = activeList.filter((r) => !activeParentCids.has(r.cidHash?.toLowerCase() || ''));

            const processed = latestActive.map((record) => {
                let count = 1;
                let current = record;
                const visited = new Set([record.cidHash]);
                while (current.parentCidHash && uniqueMap.has(current.parentCidHash)) {
                    if (visited.has(current.parentCidHash)) break;
                    count += 1;
                    current = uniqueMap.get(current.parentCidHash) as SharedRecord;
                    visited.add(current.cidHash);
                }
                return { ...record, versionCount: count };
            });

            processed.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            setSharedRecords(processed);
        } catch (err) {
            console.error('Failed to fetch shared records:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchSharedRecords();
    }, [token, fetchSharedRecords]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchSharedRecords();
    }, [fetchSharedRecords]);

    const handleViewRecord = (record: SharedRecord) => {
        Alert.alert(
            'Tinh nang dang phat trien',
            `Giai ma AES-GCM tren Mobile can NaCl key exchange.\n\nCID: ${(record.cidHash || '').substring(0, 20)}...`,
            [{ text: 'Da hieu' }]
        );
    };

    const uniquePatients = new Set(
        sharedRecords.map((r) => (r.record?.ownerAddress || r.senderAddress)?.toLowerCase()).filter(Boolean)
    ).size;
    const pendingCount = sharedRecords.filter((r) => r.status === 'pending').length;

    if (isLoading) return <LoadingSpinner message="Dang tai ho so bac si..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['top']}>
            <FlatList
                contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#14b8a6']} />}
                data={sharedRecords}
                keyExtractor={(item, idx) => item.id || item.cidHash || `shared-${idx}`}
                renderItem={({ item, index }) => (
                    <AnimatedSection delay={index * 50}>
                        <SharedRecordCard record={item} onView={handleViewRecord} />
                    </AnimatedSection>
                )}
                ListHeaderComponent={
                    <AnimatedSection>
                        <YStack style={{ marginBottom: 16 }}>
                            <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                                <YStack style={{ flex: 1, marginRight: 12 }}>
                                    <Text fontSize="$2" fontWeight="600" color="$teal9" style={{ textTransform: 'uppercase', marginBottom: 2 }}>
                                        Bang dieu khien Bac si
                                    </Text>
                                    <Text fontSize="$7" fontWeight="700" color="$color12">Ho so duoc chia se</Text>
                                </YStack>
                                <RoleSwitcher />
                            </XStack>

                            <XStack style={{ justifyContent: 'space-between', gap: 8, marginBottom: 20 }}>
                                <View background="$background" borderColor="$borderColor" style={{ flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                                    <Users size={18} color="#0F766E" />
                                    <Text fontSize="$6" fontWeight="700" color="$color11" style={{ marginTop: 6 }}>{uniquePatients}</Text>
                                    <Text fontSize="$2" color="$color10" style={{ marginTop: 4 }}>Benh nhan</Text>
                                </View>
                                <View background="$background" borderColor="$borderColor" style={{ flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                                    <FileText size={18} color="#0F766E" />
                                    <Text fontSize="$6" fontWeight="700" color="$color11" style={{ marginTop: 6 }}>{sharedRecords.length}</Text>
                                    <Text fontSize="$2" color="$color10" style={{ marginTop: 4 }}>Ho so</Text>
                                </View>
                                <View background="$background" borderColor="$borderColor" style={{ flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                                    <Clock3 size={18} color="#0F766E" />
                                    <Text fontSize="$6" fontWeight="700" color="$color11" style={{ marginTop: 6 }}>{pendingCount}</Text>
                                    <Text fontSize="$2" color="$color10" style={{ marginTop: 4 }}>Cho xem</Text>
                                </View>
                            </XStack>

                            <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 12 }}>
                                Ho so duoc chia se ({sharedRecords.length})
                            </Text>
                        </YStack>
                    </AnimatedSection>
                }
                ListEmptyComponent={
                    <EmptyState
                        icon={FileText}
                        message="Chua co ho so nao"
                        subMessage="Khi benh nhan chia se ho so cho ban, chung se hien thi tai day."
                    />
                }
                showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
}
