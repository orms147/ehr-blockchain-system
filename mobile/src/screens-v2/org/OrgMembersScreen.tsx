// OrgMembersScreen v2 — port from screens/org. Doctor list with search + Verified/Pending chip.

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Users, Search, Shield, Clock } from 'lucide-react-native';

import LoadingSpinner from '../../components/LoadingSpinner';
import orgService from '../../services/org.service';
import useAuthStore from '../../store/authStore';
import ViCard from '../../components-v2/ViCard';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type Member = {
    id?: string;
    address?: string;
    walletAddress?: string;
    fullName?: string;
    specialty?: string;
    verified?: boolean;
    isVerified?: boolean;
};

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???');

function MemberRow({ item }: { item: Member }) {
    const palette = useEhrPalette();
    const isVerified = item.verified || item.isVerified;
    return (
        <ViCard padding={14} style={{ marginBottom: 10 }}>
            <XStack style={{ alignItems: 'center', gap: 12 }}>
                <View
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: `${palette.EHR_TERTIARY}1A`,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Users size={18} color={palette.EHR_TERTIARY} />
                </View>
                <YStack style={{ flex: 1 }}>
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 14,
                            color: palette.EHR_ON_SURFACE,
                            fontWeight: '700',
                        }}
                    >
                        {item.fullName || 'Bác sĩ'}
                    </Text>
                    {item.specialty ? (
                        <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_TEXT_MUTED, marginTop: 2 }}>
                            {item.specialty}
                        </Text>
                    ) : null}
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: palette.EHR_TEXT_MUTED, marginTop: 3 }}>
                        {truncate(item.address || item.walletAddress)}
                    </Text>
                </YStack>
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: isVerified ? `${palette.EHR_TERTIARY}1A` : `${palette.EHR_WARNING}1A`,
                    }}
                >
                    {isVerified ? <Shield size={11} color={palette.EHR_TERTIARY} /> : <Clock size={11} color={palette.EHR_WARNING} />}
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 10.5,
                            color: isVerified ? palette.EHR_TERTIARY : palette.EHR_WARNING,
                            fontWeight: '700',
                            letterSpacing: 0.3,
                        }}
                    >
                        {isVerified ? 'Verified' : 'Pending'}
                    </Text>
                </View>
            </XStack>
        </ViCard>
    );
}

export default function OrgMembersScreen() {
    const palette = useEhrPalette();
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
            (m.fullName || '').toLowerCase().includes(term)
            || (m.specialty || '').toLowerCase().includes(term)
            || (m.address || m.walletAddress || '').toLowerCase().includes(term)
        );
    });

    if (isLoading) return <LoadingSpinner message="Đang tải danh sách thành viên..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 }}>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 26,
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.4,
                        lineHeight: 30,
                    }}
                >
                    Thành viên
                </Text>
                <Text
                    style={{
                        marginTop: 4,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                    }}
                >
                    {members.length} bác sĩ trong tổ chức.
                </Text>

                <View
                    style={{
                        marginTop: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_SOFT,
                        borderRadius: 12,
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                        paddingHorizontal: 12,
                    }}
                >
                    <Search size={15} color={palette.EHR_TEXT_MUTED} />
                    <TextInput
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder="Tìm bác sĩ, chuyên khoa, địa chỉ…"
                        placeholderTextColor={palette.EHR_OUTLINE}
                        style={{
                            flex: 1,
                            paddingVertical: 10,
                            color: palette.EHR_ON_SURFACE,
                            fontFamily: SANS,
                            fontSize: 13,
                        }}
                    />
                </View>
            </View>

            <FlatList
                data={filteredMembers}
                keyExtractor={(item, index) =>
                    item.id || item.address || item.walletAddress || index.toString()
                }
                renderItem={({ item }) => <MemberRow item={item} />}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListEmptyComponent={
                    <View style={{ paddingTop: 30, alignItems: 'center' }}>
                        <Users size={26} color={palette.EHR_TEXT_MUTED} />
                        <Text
                            style={{
                                marginTop: 10,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_TEXT_MUTED,
                                textAlign: 'center',
                            }}
                        >
                            {searchTerm ? 'Không tìm thấy bác sĩ nào khớp.' : 'Tổ chức chưa có thành viên.'}
                        </Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}
