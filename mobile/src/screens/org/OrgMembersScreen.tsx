import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Search, Shield, Clock } from 'lucide-react-native';
import { YStack, XStack, Text, View, Input } from 'tamagui';

import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import orgService from '../../services/org.service';
import useAuthStore from '../../store/authStore';

type Member = {
    id?: string;
    address?: string;
    walletAddress?: string;
    fullName?: string;
    specialty?: string;
    verified?: boolean;
    isVerified?: boolean;
};

const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 10)}...${addr.slice(-6)}` : '???');

const MemberItem = React.memo(({ item }: { item: Member }) => {
    const isVerified = item.verified || item.isVerified;

    return (
        <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <XStack style={{ alignItems: 'center' }}>
                <View background="$teal3" style={{ width: 48, height: 48, borderRadius: 24, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={20} color="#0F766E" />
                </View>
                <YStack style={{ flex: 1 }}>
                    <Text fontSize="$4" fontWeight="700" color="$color12">{item.fullName || 'Bac si'}</Text>
                    {item.specialty ? <Text fontSize="$3" color="$color10">{item.specialty}</Text> : null}
                    <Text fontSize="$2" color="$color9" style={{ marginTop: 4 }}>{truncateAddr(item.address || item.walletAddress)}</Text>
                </YStack>
                <View style={{ backgroundColor: isVerified ? '#dcfce7' : '#fef3c7', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <XStack style={{ alignItems: 'center' }}>
                        {isVerified ? <Shield size={12} color="#15803d" style={{ marginRight: 4 }} /> : <Clock size={12} color="#b45309" style={{ marginRight: 4 }} />}
                        <Text fontSize="$2" style={{ color: isVerified ? '#166534' : '#92400e', fontWeight: '700' }}>
                            {isVerified ? 'Da xac thuc' : 'Cho xac thuc'}
                        </Text>
                    </XStack>
                </View>
            </XStack>
        </View>
    );
});

export default function OrgMembersScreen() {
    const { token } = useAuthStore();
    const [members, setMembers] = useState<Member[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const orgRes = await orgService.getMyOrg();
            if (orgRes?.hasOrg && orgRes.organization) {
                const membersRes = await orgService.getOrgMembers(orgRes.organization.id);
                const list = Array.isArray(membersRes) ? membersRes : membersRes?.members || [];
                setMembers(list);
            } else {
                setMembers([]);
            }
        } catch (err) {
            console.error('Failed to fetch members:', err);
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

    const filteredMembers = members.filter((m) => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        return (
            (m.fullName || '').toLowerCase().includes(term) ||
            (m.specialty || '').toLowerCase().includes(term) ||
            (m.address || m.walletAddress || '').toLowerCase().includes(term)
        );
    });

    if (isLoading) return <LoadingSpinner message="Dang tai danh sach thanh vien..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['right', 'left']}>
            <YStack style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 }}>
                <Text fontSize="$7" fontWeight="800" color="$color12" style={{ marginBottom: 2 }}>
                    Thanh vien to chuc
                </Text>
                <Text fontSize="$3" color="$color10" style={{ marginBottom: 10 }}>
                    Tim kiem va theo doi trang thai xac thuc bac si
                </Text>
                <XStack background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center' }}>
                    <Search size={16} color="#64748B" style={{ marginRight: 8 }} />
                    <Input
                        flex={1}
                        unstyled
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder="Tim kiem bac si..."
                        style={{ paddingVertical: 12 }}
                    />
                </XStack>
            </YStack>

            {filteredMembers.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title={searchTerm ? 'Khong tim thay ket qua' : 'Chua co thanh vien nao'}
                    description={searchTerm ? 'Thu tim voi tu khoa khac.' : 'Cac bac si trong to chuc se hien thi tai day.'}
                />
            ) : (
                <FlatList
                    data={filteredMembers}
                    keyExtractor={(item, idx) => item.id || item.address || item.walletAddress || idx.toString()}
                    renderItem={({ item }) => <MemberItem item={item} />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#7c3aed']} />}
                    ListHeaderComponent={
                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Text fontSize="$3" color="$color10">{filteredMembers.length} bac si</Text>
                            <Text fontSize="$3" fontWeight="700" color="$green10">
                                {filteredMembers.filter((m) => m.verified || m.isVerified).length} da xac thuc
                            </Text>
                        </XStack>
                    }
                />
            )}
        </SafeAreaView>
    );
}

