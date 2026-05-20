// OrgDashboardScreen v2 — port of screens/org. Org admin view: name + stats +
// member list. If no org, shows pending-app message or empty state.

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Building2, Users, Shield, Clock } from 'lucide-react-native';

import RoleSwitcher from '../../components/RoleSwitcher';
import LoadingSpinner from '../../components/LoadingSpinner';
import orgService from '../../services/org.service';
import useAuthStore from '../../store/authStore';
import ViCard from '../../components-v2/ViCard';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???');

type Org = { id: string; name?: string; address?: string; orgType?: string };
type Member = {
    id?: string;
    address?: string;
    walletAddress?: string;
    fullName?: string;
    verified?: boolean;
    isVerified?: boolean;
};
type Application = { id: string; status?: string; orgName?: string; createdAt?: string; contactEmail?: string };

export default function OrgDashboardScreen() {
    const palette = useEhrPalette();
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
            <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top']}>
                <View style={{ flex: 1, padding: 20 }}>
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 24,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.3,
                            }}
                        >
                            Tổ chức
                        </Text>
                        <RoleSwitcher />
                    </XStack>
                    <ViCard padding={18}>
                        <XStack style={{ alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <Clock size={20} color={palette.EHR_WARNING} />
                            <Text
                                style={{
                                    fontFamily: SERIF,
                                    fontSize: 17,
                                    color: palette.EHR_ON_SURFACE,
                                    letterSpacing: -0.2,
                                }}
                            >
                                Đơn đang chờ duyệt
                            </Text>
                        </XStack>
                        <Text style={{ fontFamily: SANS, fontSize: 14, color: palette.EHR_ON_SURFACE_VARIANT, marginBottom: 8, lineHeight: 20 }}>
                            Đơn đăng ký "{application.orgName || 'Tổ chức'}" đang được Bộ Y tế xem xét.
                        </Text>
                        <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_TEXT_MUTED }}>
                            Ngày nộp:{' '}
                            {application.createdAt
                                ? new Date(application.createdAt).toLocaleDateString('vi-VN')
                                : ''}
                        </Text>
                        <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_TEXT_MUTED }}>
                            Email: {application.contactEmail || '—'}
                        </Text>
                    </ViCard>
                </View>
            </SafeAreaView>
        );
    }

    if (!org) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top']}>
                <View style={{ flex: 1, padding: 20 }}>
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Text style={{ fontFamily: SERIF, fontSize: 24, color: palette.EHR_ON_SURFACE, letterSpacing: -0.3 }}>
                            Tổ chức
                        </Text>
                        <RoleSwitcher />
                    </XStack>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Building2 size={28} color={palette.EHR_TEXT_MUTED} />
                        <Text
                            style={{
                                marginTop: 12,
                                fontFamily: SERIF,
                                fontSize: 18,
                                color: palette.EHR_ON_SURFACE,
                                textAlign: 'center',
                            }}
                        >
                            Chưa thuộc tổ chức nào
                        </Text>
                        <Text
                            style={{
                                marginTop: 8,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_TEXT_MUTED,
                                textAlign: 'center',
                                maxWidth: 280,
                                lineHeight: 19,
                            }}
                        >
                            Tài khoản này chưa được đăng ký là Tổ chức Y tế.
                        </Text>
                    </View>
                </View>
            </SafeAreaView>
        );
    }

    const verifiedCount = members.filter((m) => m.verified || m.isVerified).length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top']}>
            <FlatList
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                data={members}
                keyExtractor={(item, index) => item.id || item.address || item.walletAddress || index.toString()}
                renderItem={({ item }) => {
                    const isVerified = item.verified || item.isVerified;
                    return (
                        <ViCard padding={14} style={{ marginBottom: 8 }}>
                            <XStack style={{ alignItems: 'center', gap: 10 }}>
                                <View
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 18,
                                        backgroundColor: `${palette.EHR_TERTIARY}1A`,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Users size={16} color={palette.EHR_TERTIARY} />
                                </View>
                                <YStack style={{ flex: 1 }}>
                                    <Text
                                        style={{
                                            fontFamily: SANS_MEDIUM,
                                            fontSize: 14,
                                            color: palette.EHR_ON_SURFACE,
                                            fontWeight: '700',
                                        }}
                                    >
                                        {item.fullName || 'Bác sĩ'}
                                    </Text>
                                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: palette.EHR_TEXT_MUTED, marginTop: 2 }}>
                                        {truncate(item.address || item.walletAddress)}
                                    </Text>
                                </YStack>
                                <View
                                    style={{
                                        paddingHorizontal: 8,
                                        paddingVertical: 3,
                                        borderRadius: 999,
                                        backgroundColor: isVerified ? `${palette.EHR_TERTIARY}1A` : `${palette.EHR_WARNING}1A`,
                                    }}
                                >
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
                }}
                ListHeaderComponent={
                    <View style={{ paddingTop: 14 }}>
                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
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
                                    Tổ chức
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
                                    {org.name || 'Tổ chức'}
                                </Text>
                            </YStack>
                            <RoleSwitcher />
                        </XStack>

                        <ViCard padding={14} style={{ marginBottom: 14 }}>
                            <XStack style={{ alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <Building2 size={20} color={palette.EHR_PRIMARY} />
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 14.5,
                                        color: palette.EHR_ON_SURFACE,
                                        fontWeight: '700',
                                    }}
                                >
                                    {org.name || 'Tổ chức'}
                                </Text>
                            </XStack>
                            <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_TEXT_MUTED }}>
                                Loại: {org.orgType === 'hospital' ? 'Bệnh viện' : 'Phòng khám'}
                            </Text>
                            <Text style={{ fontFamily: 'monospace', fontSize: 11, color: palette.EHR_TEXT_MUTED, marginTop: 3 }}>
                                Ví: {truncate(org.address)}
                            </Text>
                        </ViCard>

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
                                <StatTile icon={<Users size={16} color={palette.EHR_PRIMARY} />} value={members.length} label="Thành viên" tint={palette.EHR_PRIMARY} />
                                <View style={{ width: 0.5, alignSelf: 'stretch', backgroundColor: palette.EHR_OUTLINE_SOFT }} />
                                <StatTile icon={<Shield size={16} color={palette.EHR_TERTIARY} />} value={verifiedCount} label="Đã xác thực" tint={palette.EHR_TERTIARY} />
                            </XStack>
                        </View>

                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 17,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                                marginBottom: 10,
                            }}
                        >
                            Danh sách Bác sĩ
                        </Text>
                    </View>
                }
                ListEmptyComponent={
                    <View style={{ paddingTop: 24, alignItems: 'center' }}>
                        <Users size={26} color={palette.EHR_TEXT_MUTED} />
                        <Text
                            style={{
                                marginTop: 10,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_TEXT_MUTED,
                            }}
                        >
                            Chưa có thành viên nào
                        </Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
            />
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
                    fontSize: 24,
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
                    fontSize: 10.5,
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

