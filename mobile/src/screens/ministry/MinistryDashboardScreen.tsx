import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2, Clock, Check, X, Landmark, ShieldCheck, Hourglass } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import RoleSwitcher from '../../components/RoleSwitcher';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import AnimatedSection from '../../components/AnimatedSection';
import orgService from '../../services/org.service';
import useAuthStore from '../../store/authStore';

type OrgItem = {
    id?: string;
    name?: string;
    orgName?: string;
    address?: string;
    orgType?: string;
    doctorCount?: number;
    verified?: boolean;
    isVerified?: boolean;
};

type PendingApp = {
    id: string;
    orgName?: string;
    orgType?: string;
    applicantAddress?: string;
    address?: string;
    createdAt?: string;
};

const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 10)}...${addr.slice(-6)}` : '???');

export default function MinistryDashboardScreen() {
    const { token } = useAuthStore();
    const [organizations, setOrganizations] = useState<OrgItem[]>([]);
    const [pendingApps, setPendingApps] = useState<PendingApp[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'orgs' | 'pending' | 'system'>('orgs');

    const fetchData = useCallback(async () => {
        try {
            const [orgsRes, pendingRes] = await Promise.all([
                orgService.getAllOrganizations().catch(() => []),
                orgService.getPendingApplications().catch(() => []),
            ]);
            setOrganizations(Array.isArray(orgsRes) ? orgsRes : orgsRes?.organizations || []);
            setPendingApps(Array.isArray(pendingRes) ? pendingRes : pendingRes?.applications || []);
        } catch (err) {
            console.error('Ministry fetch error:', err);
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

    const handleApprove = (app: PendingApp) => {
        Alert.alert('Duyet to chuc', `Ban co muon duyet "${app.orgName}"?`, [
            { text: 'Huy', style: 'cancel' },
            {
                text: 'Duyet',
                onPress: async () => {
                    try {
                        await orgService.approveApplication(app.id);
                        Alert.alert('Thanh cong', 'Da duyet to chuc.');
                        fetchData();
                    } catch {
                        Alert.alert('Loi', 'Khong the duyet.');
                    }
                },
            },
        ]);
    };

    const handleReject = (app: PendingApp) => {
        Alert.alert('Tu choi to chuc', `Ban co muon tu choi "${app.orgName}"?`, [
            { text: 'Huy', style: 'cancel' },
            {
                text: 'Tu choi',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await orgService.rejectApplication(app.id, 'Tu choi qua Mobile');
                        Alert.alert('Da tu choi', 'Don dang ky da bi tu choi.');
                        fetchData();
                    } catch {
                        Alert.alert('Loi', 'Khong the tu choi.');
                    }
                },
            },
        ]);
    };

    if (isLoading) return <LoadingSpinner message="Dang tai du lieu Bo Y te..." />;

    const verifiedCount = organizations.filter((o) => o.verified || o.isVerified).length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['top']}>
            <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#dc2626']} />}
            >
                <AnimatedSection>
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <YStack style={{ flex: 1, marginRight: 12 }}>
                            <Text fontSize="$2" fontWeight="600" color="$red9" style={{ marginBottom: 2, textTransform: 'uppercase' }}>
                                Bo Y te
                            </Text>
                            <Text fontSize="$7" fontWeight="700" color="$color12">Quan ly He thong EHR</Text>
                        </YStack>
                        <RoleSwitcher />
                    </XStack>

                    <XStack style={{ gap: 8, marginBottom: 16 }}>
                        <View background="$background" borderColor="$borderColor" style={{ flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center' }}>
                            <Landmark size={18} color="#7C3AED" />
                            <Text fontSize="$6" fontWeight="700" color="$color12">{organizations.length}</Text>
                            <Text fontSize="$2" color="$color10">To chuc</Text>
                        </View>
                        <View background="$background" borderColor="$borderColor" style={{ flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center' }}>
                            <ShieldCheck size={18} color="#16A34A" />
                            <Text fontSize="$6" fontWeight="700" color="$color12">{verifiedCount}</Text>
                            <Text fontSize="$2" color="$color10">Da duyet</Text>
                        </View>
                        <View background="$background" borderColor="$borderColor" style={{ flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center' }}>
                            <Hourglass size={18} color="#B45309" />
                            <Text fontSize="$6" fontWeight="700" color="$color12">{pendingApps.length}</Text>
                            <Text fontSize="$2" color="$color10">Cho duyet</Text>
                        </View>
                    </XStack>

                    <XStack background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 10, padding: 4, marginBottom: 16 }}>
                        {(['orgs', 'pending', 'system'] as const).map((key) => {
                            const isActive = activeTab === key;
                            const label = key === 'orgs' ? `To chuc (${organizations.length})` : key === 'pending' ? `Cho duyet (${pendingApps.length})` : 'He thong';
                            return (
                                <Button
                                    key={key}
                                    flex={1}
                                    background={isActive ? '$color3' : 'transparent'}
                                    onPress={() => setActiveTab(key)}
                                    borderWidth={0}
                                >
                                    <Text fontSize="$3" fontWeight="600" color={isActive ? '$color11' : '$color10'}>{label}</Text>
                                </Button>
                            );
                        })}
                    </XStack>
                </AnimatedSection>

                {activeTab === 'orgs' ? (
                    <YStack>
                        {organizations.length === 0 ? (
                            <EmptyState icon={Building2} title="Chua co to chuc" description="Cac to chuc y te da dang ky se hien thi tai day." />
                        ) : (
                            organizations.map((org, idx) => (
                                <AnimatedSection key={org.id || `org-${idx}`} delay={idx * 50}>
                                    <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                                        <XStack style={{ alignItems: 'center', marginBottom: 8 }}>
                                            <View background="$purple3" style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                                                <Building2 size={20} color="#7C3AED" />
                                            </View>
                                            <YStack style={{ flex: 1 }}>
                                                <Text fontSize="$5" fontWeight="700" color="$color12">{org.name || org.orgName || 'To chuc'}</Text>
                                                <Text fontSize="$2" color="$color10">{truncateAddr(org.address)}</Text>
                                            </YStack>
                                            <View style={{ backgroundColor: '#dcfce7', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 }}>
                                                <Text fontSize="$1" style={{ color: '#166534', fontWeight: '700' }}>Verified</Text>
                                            </View>
                                        </XStack>
                                        <Text fontSize="$2" color="$color9">
                                            {org.orgType === 'hospital' ? 'Benh vien' : 'Phong kham'} - {org.doctorCount || 0} bac si
                                        </Text>
                                    </View>
                                </AnimatedSection>
                            ))
                        )}
                    </YStack>
                ) : null}

                {activeTab === 'pending' ? (
                    <YStack>
                        {pendingApps.length === 0 ? (
                            <EmptyState icon={Clock} title="Khong co don cho" description="Tat ca don moi se hien thi tai day." />
                        ) : (
                            pendingApps.map((app, idx) => (
                                <AnimatedSection key={app.id || `pending-${idx}`} delay={idx * 55}>
                                    <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                                        <YStack style={{ marginBottom: 12 }}>
                                            <Text fontSize="$5" fontWeight="700" color="$color12">{app.orgName || 'To chuc'}</Text>
                                            <Text fontSize="$2" color="$color10" style={{ marginTop: 6 }}>
                                                {app.orgType === 'hospital' ? 'Benh vien' : 'Phong kham'} - {truncateAddr(app.applicantAddress || app.address)}
                                            </Text>
                                            <Text fontSize="$2" color="$color9" style={{ marginTop: 4 }}>
                                                Ngay nop: {app.createdAt ? new Date(app.createdAt).toLocaleDateString('vi-VN') : ''}
                                            </Text>
                                        </YStack>
                                        <XStack style={{ gap: 8 }}>
                                            <Button flex={1} background="$green9" pressStyle={{ background: '$green10' }} icon={<Check size={16} color="white" />} onPress={() => handleApprove(app)}>
                                                <Text color="white" fontWeight="700">Duyet</Text>
                                            </Button>
                                            <Button flex={1} variant="outlined" borderColor="$red6" pressStyle={{ background: '$red3' }} icon={<X size={16} color="#DC2626" />} onPress={() => handleReject(app)}>
                                                <Text color="$red10" fontWeight="700">Tu choi</Text>
                                            </Button>
                                        </XStack>
                                    </View>
                                </AnimatedSection>
                            ))
                        )}
                    </YStack>
                ) : null}

                {activeTab === 'system' ? (
                    <AnimatedSection>
                        <YStack>
                            <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                                <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 10 }}>Smart Contracts</Text>
                                {['AccessControl', 'RecordRegistry', 'ConsentLedger', 'DoctorUpdate', 'EHRSystemSecure'].map((name) => (
                                    <XStack key={name} background="$color2" style={{ alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                                        <Text fontSize="$3" color="$color11">{name}</Text>
                                        <View style={{ backgroundColor: '#dcfce7', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8 }}>
                                            <Text fontSize="$1" style={{ color: '#166534', fontWeight: '700' }}>Active</Text>
                                        </View>
                                    </XStack>
                                ))}
                            </View>
                        </YStack>
                    </AnimatedSection>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}
