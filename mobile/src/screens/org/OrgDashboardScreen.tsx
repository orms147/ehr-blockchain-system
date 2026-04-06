import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2, Users, Shield, Clock } from 'lucide-react-native';
import { YStack, XStack, Text, View } from 'tamagui';

import RoleSwitcher from '../../components/RoleSwitcher';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import AnimatedSection from '../../components/AnimatedSection';
import orgService from '../../services/org.service';
import useAuthStore from '../../store/authStore';

type Org = {
    id: string;
    name?: string;
    address?: string;
    orgType?: string;
};

type Member = {
    id?: string;
    address?: string;
    walletAddress?: string;
    fullName?: string;
    verified?: boolean;
    isVerified?: boolean;
};

type Application = {
    id: string;
    status?: string;
    orgName?: string;
    createdAt?: string;
    contactEmail?: string;
};

const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 10)}...${addr.slice(-6)}` : '???');

export default function OrgDashboardScreen() {
    const { token } = useAuthStore();
    const [org, setOrg] = useState<Org | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [application, setApplication] = useState<Application | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchOrgData = useCallback(async () => {
        try {
            const orgRes = await orgService.getMyOrg();
            if (orgRes?.hasOrg && orgRes.organization) {
                setOrg(orgRes.organization);
                const membersRes = await orgService.getOrgMembers(orgRes.organization.id);
                const list = Array.isArray(membersRes) ? membersRes : membersRes?.members || [];
                setMembers(list);
                setApplication(null);
            } else {
                setOrg(null);
                const appRes = await orgService.getMyApplication();
                if (appRes?.hasApplication) setApplication(appRes.application);
            }
        } catch (err) {
            console.error('Failed to fetch org data:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchOrgData();
    }, [token, fetchOrgData]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchOrgData();
    }, [fetchOrgData]);

    if (isLoading) return <LoadingSpinner message="Đang tải thông tin tổ chức..." />;

    if (!org && application && application.status === 'PENDING') {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAF3' }} edges={['top']}>
                <YStack style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
                    <AnimatedSection>
                        <XStack style={{ width: '100%', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <Text fontSize="$6" fontWeight="700" color="$color12">Tổ chức</Text>
                            <RoleSwitcher />
                        </XStack>

                        <View background="$color2" borderColor="$color4" style={{ borderWidth: 1, borderRadius: 12, padding: 20, width: '100%' }}>
                            <XStack style={{ alignItems: 'center', marginBottom: 12 }}>
                                <Clock size={22} color="#475569" />
                                <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginLeft: 8 }}>
                                    Đơn đang chờ duyệt
                                </Text>
                            </XStack>
                            <Text fontSize="$4" color="$color10" style={{ marginBottom: 12 }}>
                                Đơn đăng ký "{application.orgName || 'Tổ chức'}" đang được xem xét.
                            </Text>
                            <Text fontSize="$3" color="$color10">Ngày nộp: {application.createdAt ? new Date(application.createdAt).toLocaleDateString('vi-VN') : ''}</Text>
                            <Text fontSize="$3" color="$color10">Email: {application.contactEmail || '-'}</Text>
                        </View>
                    </AnimatedSection>
                </YStack>
            </SafeAreaView>
        );
    }

    if (!org) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAF3' }} edges={['top']}>
                <YStack style={{ flex: 1, padding: 20 }}>
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Text fontSize="$6" fontWeight="700" color="$color12">Tổ chức</Text>
                        <RoleSwitcher />
                    </XStack>
                    <YStack style={{ flex: 1, justifyContent: 'center' }}>
                        <EmptyState
                            icon={Building2}
                            title="Chưa thuộc tổ chức nào"
                            description="Tài khoản này chưa được đăng ký là Tổ chức Y tế."
                        />
                    </YStack>
                </YStack>
            </SafeAreaView>
        );
    }

    const verifiedCount = members.filter((m) => m.verified || m.isVerified).length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAF3' }} edges={['top']}>
            <FlatList
                contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#7c3aed']} />}
                data={members}
                keyExtractor={(item, index) => item.id || item.address || item.walletAddress || index.toString()}
                renderItem={({ item, index }) => {
                    const isVerified = item.verified || item.isVerified;
                    return (
                        <AnimatedSection delay={index * 45}>
                            <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 }}>
                                <XStack style={{ alignItems: 'center' }}>
                                    <View background="$teal3" style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                                        <Users size={18} color="#0F766E" />
                                    </View>
                                    <YStack style={{ flex: 1 }}>
                                        <Text fontSize="$4" fontWeight="700" color="$color12">{item.fullName || 'Bác sĩ'}</Text>
                                        <Text fontSize="$2" color="$color10">{truncateAddr(item.address || item.walletAddress)}</Text>
                                    </YStack>
                                    <View style={{ backgroundColor: isVerified ? '#dcfce7' : '#fef3c7', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }}>
                                        <Text fontSize="$2" style={{ color: isVerified ? '#166534' : '#92400e', fontWeight: '700' }}>
                                            {isVerified ? 'Verified' : 'Pending'}
                                        </Text>
                                    </View>
                                </XStack>
                            </View>
                        </AnimatedSection>
                    );
                }}
                ListHeaderComponent={
                    <AnimatedSection>
                        <YStack style={{ marginBottom: 14 }}>
                            <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <YStack style={{ flex: 1, marginRight: 12 }}>
                                    <Text fontSize="$2" fontWeight="600" color="$purple9" style={{ marginBottom: 2, textTransform: 'uppercase' }}>
                                        Bảng điều khiển Tổ chức
                                    </Text>
                                    <Text fontSize="$7" fontWeight="700" color="$color12">{org.name || 'Tổ chức'}</Text>
                                </YStack>
                                <RoleSwitcher />
                            </XStack>

                            <View background="$color2" borderColor="$color4" style={{ borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                                <XStack style={{ alignItems: 'center', marginBottom: 8 }}>
                                    <Building2 size={24} color="#475569" />
                                    <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginLeft: 8 }}>{org.name || 'Tổ chức'}</Text>
                                </XStack>
                                <Text fontSize="$2" color="$color10">Loại: {org.orgType === 'hospital' ? 'Bệnh viện' : 'Phòng khám'}</Text>
                                <Text fontSize="$2" color="$color10">Ví: {truncateAddr(org.address)}</Text>
                            </View>

                            <XStack style={{ gap: 10, marginBottom: 16 }}>
                                <View background="$background" borderColor="$borderColor" style={{ flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                                    <Users size={20} color="#7C3AED" />
                                    <Text fontSize="$7" fontWeight="700" color="$color12" style={{ marginTop: 6 }}>{members.length}</Text>
                                    <Text fontSize="$2" color="$color10">Thành viên</Text>
                                </View>
                                <View background="$background" borderColor="$borderColor" style={{ flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                                    <Shield size={20} color="#16A34A" />
                                    <Text fontSize="$7" fontWeight="700" color="$color12" style={{ marginTop: 6 }}>{verifiedCount}</Text>
                                    <Text fontSize="$2" color="$color10">Đã xác thực</Text>
                                </View>
                            </XStack>

                            <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 10 }}>Danh sách Bác sĩ</Text>
                        </YStack>
                    </AnimatedSection>
                }
                ListEmptyComponent={
                    <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 10, padding: 20, alignItems: 'center' }}>
                        <Users size={30} color="#64748B" />
                        <Text color="$color10" style={{ marginTop: 8 }}>Chưa có thành viên nào</Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
}






