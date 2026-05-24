// MinistryDashboardScreen v2 — port from screens/ministry. Bộ Y tế dashboard:
// tổ chức list + pending applications + system smart contracts overview.

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Text, XStack, YStack } from 'tamagui';
import {
    Building2,
    Clock,
    Check,
    X,
    Landmark,
    ShieldCheck,
    Hourglass,
    Plus,
} from 'lucide-react-native';

import RoleSwitcher from '../../components/RoleSwitcher';
import LoadingSpinner from '../../components/LoadingSpinner';
import orgService from '../../services/org.service';
import useAuthStore from '../../store/authStore';
import ViCard from '../../components-v2/ViCard';
import ViButton from '../../components-v2/ViButton';
import { ViStatusChip } from '../../components-v2/ViChips';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

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

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???');

export default function MinistryDashboardScreen() {
    const palette = useEhrPalette();
    const navigation = useNavigation<any>();
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

    const handleApprove = (app: PendingApp) => {
        Alert.alert('Duyệt tổ chức', `Bạn có muốn duyệt "${app.orgName}"?`, [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Duyệt',
                onPress: async () => {
                    try {
                        await orgService.approveApplication(app.id);
                        Alert.alert('Thành công', 'Đã duyệt tổ chức.');
                        fetchData();
                    } catch {
                        Alert.alert('Lỗi', 'Không thể duyệt.');
                    }
                },
            },
        ]);
    };

    const handleReject = (app: PendingApp) => {
        Alert.alert('Từ chối tổ chức', `Bạn có muốn từ chối "${app.orgName}"?`, [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Từ chối',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await orgService.rejectApplication(app.id, 'Từ chối qua Mobile');
                        Alert.alert('Đã từ chối', 'Đơn đăng ký đã bị từ chối.');
                        fetchData();
                    } catch {
                        Alert.alert('Lỗi', 'Không thể từ chối.');
                    }
                },
            },
        ]);
    };

    if (isLoading) return <LoadingSpinner message="Đang tải dữ liệu Bộ Y tế..." />;

    const verifiedCount = organizations.filter((o) => o.verified || o.isVerified).length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top']}>
            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80, paddingTop: 14 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={() => {
                            setIsRefreshing(true);
                            fetchData();
                        }}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <YStack style={{ flex: 1, marginRight: 12 }}>
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 11,
                                color: palette.EHR_PRIMARY,
                                letterSpacing: 1.2,
                                textTransform: 'uppercase',
                                fontWeight: '600',
                                marginBottom: 4,
                            }}
                        >
                            Bộ Y tế
                        </Text>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 26,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.4,
                                lineHeight: 30,
                            }}
                        >
                            Quản lý EHR
                        </Text>
                    </YStack>
                    <RoleSwitcher />
                </XStack>

                {/* G.5 — inline hairline stats (no ViCard wrap) */}
                <View
                    style={{
                        marginBottom: 16,
                        borderTopWidth: 0.5,
                        borderBottomWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_VARIANT,
                    }}
                >
                    <XStack>
                        <StatTile
                            icon={<Landmark size={16} color={palette.EHR_PRIMARY} />}
                            value={organizations.length}
                            label="Tổ chức"
                            tint={palette.EHR_PRIMARY}
                        />
                        <View style={{ width: 0.5, alignSelf: 'stretch', backgroundColor: palette.EHR_OUTLINE_SOFT }} />
                        <StatTile
                            icon={<ShieldCheck size={16} color={palette.EHR_TERTIARY} />}
                            value={verifiedCount}
                            label="Đã duyệt"
                            tint={palette.EHR_TERTIARY}
                        />
                        <View style={{ width: 0.5, alignSelf: 'stretch', backgroundColor: palette.EHR_OUTLINE_SOFT }} />
                        <StatTile
                            icon={<Hourglass size={16} color={palette.EHR_WARNING} />}
                            value={pendingApps.length}
                            label="Chờ duyệt"
                            tint={palette.EHR_WARNING}
                        />
                    </XStack>
                </View>

                {/* Tab switcher */}
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                    {(['orgs', 'pending', 'system'] as const).map((key) => {
                        const isActive = activeTab === key;
                        const label =
                            key === 'orgs' ? `Tổ chức (${organizations.length})`
                                : key === 'pending' ? `Chờ duyệt (${pendingApps.length})`
                                    : 'Smart Contracts';
                        return (
                            <View key={key} style={{ flex: 1 }}>
                                <ViButton
                                    variant={isActive ? 'primary' : 'ghost'}
                                    full
                                    size="sm"
                                    onPress={() => setActiveTab(key)}
                                >
                                    {label}
                                </ViButton>
                            </View>
                        );
                    })}
                </View>

                {activeTab === 'orgs' ? (
                    <>
                        {/* Wave D — CTA to create new org on-chain */}
                        <Pressable
                            onPress={() => navigation.navigate('MinistryCreateOrg')}
                            style={({ pressed }) => ({
                                marginBottom: 14,
                                paddingVertical: 13,
                                paddingHorizontal: 14,
                                borderRadius: 12,
                                backgroundColor: palette.EHR_ON_SURFACE,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                opacity: pressed ? 0.85 : 1,
                            })}
                        >
                            <Plus size={16} color={palette.EHR_SURFACE} strokeWidth={2.4} />
                            <Text style={{ fontFamily: SANS_SEMI, fontSize: 14, color: palette.EHR_SURFACE, fontWeight: '700', letterSpacing: 0.1 }}>
                                Tạo cơ sở y tế mới
                            </Text>
                        </Pressable>

                        {organizations.length === 0 ? (
                            <View style={{ paddingTop: 20, alignItems: 'center' }}>
                                <Building2 size={26} color={palette.EHR_TEXT_MUTED} />
                                <Text style={{ marginTop: 10, fontFamily: SANS, fontSize: 13, color: palette.EHR_TEXT_MUTED }}>
                                    Chưa có tổ chức nào đăng ký.
                                </Text>
                            </View>
                        ) : (
                        organizations.map((org) => (
                            <ViCard key={org.id || org.address || org.name} padding={14} style={{ marginBottom: 10 }}>
                                <XStack style={{ alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                    <View
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 18,
                                            backgroundColor: `${palette.EHR_PRIMARY}1A`,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Building2 size={16} color={palette.EHR_PRIMARY} />
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
                                            {org.name || org.orgName || 'Tổ chức'}
                                        </Text>
                                        <Text style={{ fontFamily: 'monospace', fontSize: 11, color: palette.EHR_TEXT_MUTED, marginTop: 2 }}>
                                            {truncate(org.address)}
                                        </Text>
                                    </YStack>
                                    <ViStatusChip status="verified" />
                                </XStack>
                                <Text style={{ fontFamily: SANS, fontSize: 11.5, color: palette.EHR_TEXT_MUTED }}>
                                    {org.orgType === 'hospital' ? 'Bệnh viện' : 'Phòng khám'} · {org.doctorCount || 0} bác sĩ
                                </Text>
                            </ViCard>
                        ))
                        )}
                    </>
                ) : null}

                {activeTab === 'pending' ? (
                    pendingApps.length === 0 ? (
                        <View style={{ paddingTop: 20, alignItems: 'center' }}>
                            <Clock size={26} color={palette.EHR_TEXT_MUTED} />
                            <Text style={{ marginTop: 10, fontFamily: SANS, fontSize: 13, color: palette.EHR_TEXT_MUTED }}>
                                Không có đơn chờ.
                            </Text>
                        </View>
                    ) : (
                        pendingApps.map((app) => (
                            <ViCard key={app.id} padding={14} style={{ marginBottom: 10 }}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 14.5,
                                        color: palette.EHR_ON_SURFACE,
                                        fontWeight: '700',
                                    }}
                                >
                                    {app.orgName || 'Tổ chức'}
                                </Text>
                                <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 12, color: palette.EHR_TEXT_MUTED }}>
                                    {app.orgType === 'hospital' ? 'Bệnh viện' : 'Phòng khám'} ·{' '}
                                    <Text style={{ fontFamily: 'monospace' }}>
                                        {truncate(app.applicantAddress || app.address)}
                                    </Text>
                                </Text>
                                <Text style={{ marginTop: 3, fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                                    Ngày nộp:{' '}
                                    {app.createdAt ? new Date(app.createdAt).toLocaleDateString('vi-VN') : ''}
                                </Text>
                                <XStack style={{ marginTop: 12, gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                        <ViButton
                                            variant="ghost"
                                            full
                                            size="sm"
                                            onPress={() => handleReject(app)}
                                            leftIcon={<X size={14} color={palette.EHR_TEXT_MUTED} />}
                                        >
                                            Từ chối
                                        </ViButton>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <ViButton
                                            variant="cinnabar"
                                            full
                                            size="sm"
                                            onPress={() => handleApprove(app)}
                                            leftIcon={<Check size={14} color="#FAF7F1" />}
                                        >
                                            Duyệt
                                        </ViButton>
                                    </View>
                                </XStack>
                            </ViCard>
                        ))
                    )
                ) : null}

                {activeTab === 'system' ? (
                    <ViCard padding={16}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 17,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                                marginBottom: 12,
                            }}
                        >
                            Smart Contracts (Arbitrum Sepolia)
                        </Text>
                        {['AccessControl', 'RecordRegistry', 'ConsentLedger', 'DoctorUpdate', 'EHRSystemSecure'].map((name) => (
                            <XStack
                                key={name}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                    borderRadius: 10,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    marginBottom: 8,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: 'monospace',
                                        fontSize: 13,
                                        color: palette.EHR_ON_SURFACE,
                                    }}
                                >
                                    {name}
                                </Text>
                                <View
                                    style={{
                                        paddingHorizontal: 8,
                                        paddingVertical: 3,
                                        borderRadius: 999,
                                        backgroundColor: `${palette.EHR_TERTIARY}1A`,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 10,
                                            color: palette.EHR_TERTIARY,
                                            fontWeight: '700',
                                            letterSpacing: 0.3,
                                        }}
                                    >
                                        Active
                                    </Text>
                                </View>
                            </XStack>
                        ))}
                    </ViCard>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

function StatTile({
    icon, value, label, tint,
}: {
    icon: React.ReactNode;
    value: number;
    label: string;
    tint: string;
}) {
    const palette = useEhrPalette();
    // G.5 — inline cell, 14×14 padding meets 60pt min touch target. No card wrap.
    void tint;
    return (
        <YStack style={{ flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14 }}>
            {icon}
            <Text
                style={{
                    marginTop: 6,
                    fontFamily: SERIF,
                    fontSize: 22,
                    color: palette.EHR_ON_SURFACE,
                    letterSpacing: -0.3,
                }}
            >
                {value}
            </Text>
            <Text
                style={{
                    marginTop: 2,
                    fontFamily: SANS_SEMI,
                    fontSize: 10,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    fontWeight: '600',
                }}
            >
                {label}
            </Text>
        </YStack>
    );
}
