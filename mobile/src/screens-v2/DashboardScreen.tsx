// DashboardScreen v2 — port of .design-bundle/project/screens-patient.jsx
// HomeScreen. Editorial hero + cinnabar pending card + hairline stats +
// text-rhythm record list. Cinnabar reserved for the "Cần chữ ký" moment.
//
// Service wiring is preserved bit-for-bit from screens/DashboardScreen.tsx:
//   - useRecords / useRequests / quota query
//   - RoleSwitcher (multi-role users still need the toggle)
//   - Navigation routes: Records, Requests, RecordDetail, CreateRecord
// Visual layer is the only thing that changes.

import React, { useMemo } from 'react';
import { ScrollView, ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import useAuthStore from '../store/authStore';
import useRecords from '../hooks/useRecords';
import useRequests from '../hooks/useRequests';
import RoleSwitcher from '../components/RoleSwitcher';
import {
    EHR_SURFACE,
    EHR_SURFACE_LOWEST,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE,
    EHR_OUTLINE_VARIANT,
    EHR_OUTLINE_SOFT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_TERTIARY,
    EHR_SECONDARY,
    EHR_WARNING,
} from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SERIF_MEDIUM = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const truncateAddr = (addr?: string) =>
    addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}`.toUpperCase() : '0X00…0000';

const VI_WEEKDAY = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const VI_MONTH_SHORT = ['Một', 'Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'Tám', 'Chín', 'Mười', 'M.Một', 'M.Hai'];

function formatViDate(d: Date) {
    return `${VI_WEEKDAY[d.getDay()]} · ${d.getDate()} · ${VI_MONTH_SHORT[d.getMonth()]} · ${d.getFullYear()}`;
}

function firstName(fullName?: string) {
    if (!fullName) return 'Bạn';
    const parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1] || fullName;
}

export default function DashboardScreen({ navigation }: any) {
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const { records, isLoading: recordsLoading } = useRecords();
    const { requests, isLoading: requestsLoading } = useRequests();
    const { data: quota, refetch: refetchQuota } = useQuery({
        queryKey: ['relayer', 'quota'],
        queryFn: () => api.get('/api/relayer/quota'),
        staleTime: 30_000,
    });
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    const handleRefresh = React.useCallback(async () => {
        setIsRefreshing(true);
        try {
            await Promise.all([
                refetchQuota(),
                queryClient.invalidateQueries({ queryKey: ['records'] }),
                queryClient.invalidateQueries({ queryKey: ['requests'] }),
            ]);
        } finally {
            setIsRefreshing(false);
        }
    }, [refetchQuota, queryClient]);

    const signaturesRemaining = quota?.signaturesRemaining ?? null;
    const signaturesLimit = quota?.signaturesLimit ?? 100;
    const signaturesUsed =
        signaturesRemaining != null ? Math.max(0, signaturesLimit - signaturesRemaining) : 0;
    const quotaPct = signaturesLimit > 0 ? Math.min(1, signaturesUsed / signaturesLimit) : 0;

    const recentRecords = (records || []).slice(0, 3);
    const pendingCount = (requests || []).length;
    const totalRecords = (records || []).length;
    const sharedCount = (records || []).filter(
        (r: any) => r.sharedWith?.length > 0 || r.status === 'shared'
    ).length;

    const today = useMemo(() => new Date(), []);

    const handleRecordPress = (record: any) => {
        const serializableRecord = {
            ...record,
            createdAt:
                record?.createdAt instanceof Date
                    ? record.createdAt.toISOString()
                    : record?.createdAt || null,
        };
        navigation.navigate('RecordDetail', { record: serializableRecord });
    };

    const handleCreateRecord = () => navigation.navigate('CreateRecord');
    const handleOpenRequests = () => navigation.navigate('Requests');
    const handleOpenRecords = () => navigation.navigate('Records');
    const handleOpenPermissions = () => navigation.navigate('AccessLog');

    const topRequest = (requests || [])[0] as any | undefined;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <ScrollView
                contentContainerStyle={{ paddingBottom: 80 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        colors={[EHR_PRIMARY]}
                        tintColor={EHR_ON_SURFACE_VARIANT}
                    />
                }
            >
                {/* ───────── HERO ───────── */}
                <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 30, position: 'relative' }}>
                    {/* Decorative seal ring */}
                    <View
                        pointerEvents="none"
                        style={{
                            position: 'absolute',
                            right: -34,
                            top: 28,
                            width: 220,
                            height: 220,
                            borderRadius: 110,
                            borderWidth: 1,
                            borderColor: EHR_PRIMARY,
                            opacity: 0.1,
                        }}
                    />

                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 11,
                                color: EHR_OUTLINE,
                                letterSpacing: 1.6,
                                textTransform: 'uppercase',
                            }}
                        >
                            {formatViDate(today)}
                        </Text>
                        <View
                            style={{
                                paddingHorizontal: 7,
                                paddingVertical: 3,
                                borderWidth: 0.5,
                                borderColor: EHR_OUTLINE_SOFT,
                                borderRadius: 4,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: 9.5,
                                    color: EHR_OUTLINE,
                                    letterSpacing: 1.2,
                                }}
                            >
                                VN · {truncateAddr(user?.walletAddress || (user as any)?.address)}
                            </Text>
                        </View>
                    </XStack>

                    <XStack style={{ marginTop: 22, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <YStack style={{ flex: 1 }}>
                            <Text
                                style={{
                                    fontFamily: SERIF,
                                    fontSize: 44,
                                    fontWeight: '400',
                                    color: EHR_ON_SURFACE,
                                    letterSpacing: -1.2,
                                    lineHeight: 44,
                                }}
                            >
                                Chào,
                            </Text>
                            <XStack style={{ alignItems: 'baseline', gap: 10, marginTop: 2 }}>
                                <Text
                                    style={{
                                        fontFamily: SERIF_ITALIC,
                                        fontStyle: 'italic',
                                        fontSize: 44,
                                        color: EHR_PRIMARY,
                                        letterSpacing: -1.2,
                                        lineHeight: 48,
                                    }}
                                >
                                    {firstName(user?.fullName)}
                                </Text>
                                <Text
                                    style={{
                                        fontFamily: SERIF,
                                        fontSize: 28,
                                        color: EHR_ON_SURFACE,
                                        lineHeight: 32,
                                    }}
                                >
                                    .
                                </Text>
                            </XStack>
                        </YStack>
                        <RoleSwitcher />
                    </XStack>

                    {pendingCount > 0 ? (
                        <Text
                            style={{
                                marginTop: 16,
                                fontFamily: SANS,
                                fontSize: 14.5,
                                lineHeight: 22,
                                color: EHR_ON_SURFACE_VARIANT,
                                maxWidth: 290,
                            }}
                        >
                            Có{' '}
                            <Text
                                onPress={handleOpenRequests}
                                style={{
                                    color: EHR_PRIMARY,
                                    fontFamily: SANS_SEMI,
                                    fontWeight: '600',
                                }}
                            >
                                {pendingCount} yêu cầu
                            </Text>{' '}
                            đang chờ chữ ký.
                        </Text>
                    ) : (
                        <Text
                            style={{
                                marginTop: 16,
                                fontFamily: SANS,
                                fontSize: 14.5,
                                lineHeight: 22,
                                color: EHR_ON_SURFACE_VARIANT,
                                maxWidth: 290,
                            }}
                        >
                            Không có yêu cầu nào đang chờ. Hồ sơ của bạn luôn được mã hoá đầu cuối.
                        </Text>
                    )}
                </View>

                {/* ───────── PENDING — cinnabar paper (legal-action moment) ───────── */}
                {pendingCount > 0 ? (
                    <View style={{ paddingHorizontal: 18, marginTop: -18, marginBottom: 26 }}>
                        <Pressable
                            onPress={handleOpenRequests}
                            style={({ pressed }) => ({
                                borderRadius: 18,
                                overflow: 'hidden',
                                transform: [{ scale: pressed ? 0.985 : 1 }],
                            })}
                        >
                            <LinearGradient
                                colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={{ padding: 20 }}
                            >
                                {/* seal ring decoration */}
                                <View
                                    pointerEvents="none"
                                    style={{
                                        position: 'absolute',
                                        right: -22,
                                        bottom: -22,
                                        width: 130,
                                        height: 130,
                                        borderWidth: 1.5,
                                        borderColor: 'rgba(250,247,241,0.22)',
                                        borderRadius: 65,
                                    }}
                                />
                                <XStack style={{ alignItems: 'center', gap: 8 }}>
                                    <View
                                        style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: 3,
                                            backgroundColor: '#FAF7F1',
                                        }}
                                    />
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 10.5,
                                            fontWeight: '700',
                                            letterSpacing: 1.6,
                                            color: 'rgba(250,247,241,0.95)',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Cần chữ ký
                                    </Text>
                                </XStack>
                                <Text
                                    style={{
                                        marginTop: 14,
                                        fontFamily: SERIF_MEDIUM,
                                        fontSize: 21,
                                        lineHeight: 27,
                                        color: '#FAF7F1',
                                        letterSpacing: -0.3,
                                        maxWidth: 260,
                                    }}
                                >
                                    {pendingCount === 1
                                        ? 'Một bác sĩ muốn xem hồ sơ của bạn'
                                        : `${pendingCount} bác sĩ muốn xem hồ sơ của bạn`}
                                </Text>
                                {topRequest?.doctorName || topRequest?.organizationName ? (
                                    <Text
                                        style={{
                                            marginTop: 8,
                                            fontFamily: SANS,
                                            fontSize: 12.5,
                                            color: 'rgba(250,247,241,0.78)',
                                            maxWidth: 240,
                                            lineHeight: 18,
                                        }}
                                    >
                                        {[topRequest.doctorName, topRequest.organizationName]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </Text>
                                ) : null}
                                <View
                                    style={{
                                        marginTop: 16,
                                        alignSelf: 'flex-start',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                                        paddingHorizontal: 12,
                                        paddingVertical: 7,
                                        backgroundColor: 'rgba(250,247,241,0.18)',
                                        borderRadius: 999,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 12,
                                            color: '#FAF7F1',
                                            fontWeight: '600',
                                        }}
                                    >
                                        Mở để duyệt →
                                    </Text>
                                </View>
                                {requestsLoading ? (
                                    <View style={{ position: 'absolute', top: 20, right: 20 }}>
                                        <ActivityIndicator size="small" color="#FAF7F1" />
                                    </View>
                                ) : null}
                            </LinearGradient>
                        </Pressable>
                    </View>
                ) : null}

                {/* ───────── STATS — 3 columns, hairline borders ───────── */}
                <View style={{ paddingHorizontal: 22, marginBottom: 30 }}>
                    <XStack
                        style={{
                            borderTopWidth: 0.5,
                            borderBottomWidth: 0.5,
                            borderColor: EHR_OUTLINE_SOFT,
                        }}
                    >
                        <HomeStat
                            value={recordsLoading ? '—' : String(totalRecords)}
                            label="Hồ sơ"
                            onPress={handleOpenRecords}
                            accent={EHR_TERTIARY}
                        />
                        <HomeStat
                            value={recordsLoading ? '—' : String(sharedCount)}
                            label="Đã chia sẻ"
                            onPress={handleOpenPermissions}
                            accent={pendingCount > 0 ? EHR_WARNING : EHR_PRIMARY}
                            divider
                        />
                        <HomeStat
                            value={requestsLoading ? '—' : String(pendingCount)}
                            label="Yêu cầu"
                            onPress={handleOpenRequests}
                            accent={EHR_SECONDARY}
                            divider
                            mono
                        />
                    </XStack>
                </View>

                {/* ───────── RECENT — text-rhythm list ───────── */}
                <View style={{ paddingHorizontal: 22, marginBottom: 22 }}>
                    <XStack
                        style={{
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            marginBottom: 14,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 22,
                                color: EHR_ON_SURFACE,
                                letterSpacing: -0.3,
                            }}
                        >
                            Hồ sơ gần đây
                        </Text>
                        <XStack style={{ alignItems: 'center', gap: 14 }}>
                            <Pressable onPress={handleCreateRecord}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 12,
                                        color: EHR_ON_SURFACE_VARIANT,
                                        fontWeight: '600',
                                    }}
                                >
                                    + Tạo hồ sơ
                                </Text>
                            </Pressable>
                            <Pressable onPress={handleOpenRecords}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 12,
                                        color: EHR_PRIMARY,
                                        fontWeight: '600',
                                    }}
                                >
                                    Tất cả →
                                </Text>
                            </Pressable>
                        </XStack>
                    </XStack>

                    {recordsLoading ? (
                        <View
                            style={{
                                paddingVertical: 36,
                                alignItems: 'center',
                                borderWidth: 0.5,
                                borderColor: EHR_OUTLINE_SOFT,
                                borderRadius: 14,
                            }}
                        >
                            <ActivityIndicator size="small" color={EHR_ON_SURFACE_VARIANT} />
                            <Text
                                style={{
                                    marginTop: 10,
                                    fontFamily: SANS,
                                    fontSize: 12,
                                    color: EHR_ON_SURFACE_VARIANT,
                                }}
                            >
                                Đang tải hồ sơ…
                            </Text>
                        </View>
                    ) : recentRecords.length === 0 ? (
                        <EmptyRecords onCreate={handleCreateRecord} />
                    ) : (
                        <YStack>
                            {recentRecords.map((record: any) => (
                                <RecordRow
                                    key={record.cidHash || record.id}
                                    record={record}
                                    onPress={() => handleRecordPress(record)}
                                />
                            ))}
                        </YStack>
                    )}
                </View>

                {/* ───────── QUOTA — small ink line, jade progress ───────── */}
                <View style={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 24 }}>
                    <XStack
                        style={{
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 8,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 10.5,
                                color: EHR_OUTLINE,
                                letterSpacing: 1.4,
                                textTransform: 'uppercase',
                                fontWeight: '700',
                            }}
                        >
                            Chữ ký · tháng này
                        </Text>
                        <Text
                            style={{
                                fontFamily: 'monospace',
                                fontSize: 11,
                                color: EHR_TERTIARY,
                            }}
                        >
                            {signaturesUsed}{' '}
                            <Text style={{ color: EHR_OUTLINE }}>/ {signaturesLimit}</Text>
                        </Text>
                    </XStack>
                    <View
                        style={{
                            height: 2,
                            backgroundColor: EHR_OUTLINE_SOFT,
                            borderRadius: 1,
                            overflow: 'hidden',
                        }}
                    >
                        <View
                            style={{
                                width: `${quotaPct * 100}%`,
                                height: '100%',
                                backgroundColor: EHR_TERTIARY,
                            }}
                        />
                    </View>
                    {quota?.message ? (
                        <Text
                            style={{
                                marginTop: 8,
                                fontFamily: SANS,
                                fontSize: 11,
                                color: EHR_OUTLINE,
                            }}
                        >
                            {quota.message}
                        </Text>
                    ) : null}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

// ───────── HomeStat (3-col hairline grid item) ─────────
function HomeStat({
    value,
    label,
    onPress,
    accent,
    divider,
    mono,
}: {
    value: string;
    label: string;
    onPress: () => void;
    accent: string;
    divider?: boolean;
    mono?: boolean;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 14,
                paddingLeft: divider ? 14 : 4,
                paddingRight: 4,
                borderLeftWidth: divider ? 0.5 : 0,
                borderColor: EHR_OUTLINE_SOFT,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <XStack style={{ alignItems: 'baseline', gap: 6 }}>
                <View
                    style={{
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: accent,
                        marginRight: 2,
                    }}
                />
                <Text
                    style={{
                        fontFamily: mono ? 'monospace' : SERIF_MEDIUM,
                        fontSize: mono ? 24 : 28,
                        color: EHR_ON_SURFACE,
                        letterSpacing: -0.5,
                    }}
                >
                    {value}
                </Text>
            </XStack>
            <Text
                style={{
                    marginTop: 6,
                    fontFamily: SANS_SEMI,
                    fontSize: 11,
                    color: EHR_OUTLINE,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    fontWeight: '600',
                }}
            >
                {label}
            </Text>
        </Pressable>
    );
}

// ───────── RecordRow (text-rhythm list item) ─────────
function RecordRow({ record, onPress }: { record: any; onPress: () => void }) {
    const date = parseDateParts(record?.date, record?.createdAt);

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 14,
                paddingVertical: 12,
                borderBottomWidth: 0.5,
                borderColor: EHR_OUTLINE_SOFT,
                opacity: pressed ? 0.6 : 1,
            })}
        >
            <View style={{ width: 42, alignItems: 'flex-end', marginTop: 4 }}>
                <Text
                    style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: EHR_OUTLINE,
                        letterSpacing: 0.4,
                    }}
                >
                    {date.day}
                </Text>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 13,
                        color: EHR_ON_SURFACE_VARIANT,
                    }}
                >
                    {date.month}
                </Text>
            </View>
            <View
                style={{
                    width: 1,
                    alignSelf: 'stretch',
                    backgroundColor: EHR_OUTLINE_SOFT,
                    marginTop: 2,
                }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                    style={{
                        fontFamily: SANS_MEDIUM,
                        fontSize: 15,
                        color: EHR_ON_SURFACE,
                        letterSpacing: -0.1,
                        fontWeight: '500',
                    }}
                    numberOfLines={2}
                >
                    {record.title || record.recordType || 'Hồ sơ'}
                </Text>
                <Text
                    style={{
                        marginTop: 3,
                        fontFamily: SANS,
                        fontSize: 12.5,
                        color: EHR_ON_SURFACE_VARIANT,
                    }}
                    numberOfLines={1}
                >
                    {record.createdByDisplay || 'Bạn'}
                    {record.type ? ` · ${record.type}` : ''}
                </Text>
                {record.syncStatus && record.syncStatus !== 'confirmed' ? (
                    <Text
                        style={{
                            marginTop: 6,
                            fontFamily: SANS,
                            fontSize: 11,
                            color: EHR_WARNING,
                        }}
                    >
                        Đang đồng bộ on-chain…
                    </Text>
                ) : null}
            </View>
        </Pressable>
    );
}

function parseDateParts(viDate?: string, isoDate?: string) {
    // useRecords already produced viDate = "DD/MM/YYYY"
    if (viDate && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(viDate)) {
        const [day, month] = viDate.split('/');
        return { day, month: VI_MONTH_SHORT[Number(month) - 1] || month };
    }
    if (isoDate) {
        const d = new Date(isoDate);
        if (!Number.isNaN(d.getTime())) {
            return { day: String(d.getDate()).padStart(2, '0'), month: VI_MONTH_SHORT[d.getMonth()] };
        }
    }
    return { day: '—', month: '—' };
}

function EmptyRecords({ onCreate }: { onCreate: () => void }) {
    return (
        <View
            style={{
                paddingVertical: 28,
                paddingHorizontal: 20,
                borderWidth: 0.5,
                borderColor: EHR_OUTLINE_SOFT,
                borderRadius: 14,
                backgroundColor: EHR_SURFACE_LOWEST,
            }}
        >
            <Text
                style={{
                    fontFamily: SERIF,
                    fontSize: 18,
                    color: EHR_ON_SURFACE,
                    letterSpacing: -0.2,
                    lineHeight: 24,
                }}
            >
                Chưa có hồ sơ nào.
            </Text>
            <Text
                style={{
                    marginTop: 8,
                    fontFamily: SANS,
                    fontSize: 13,
                    color: EHR_ON_SURFACE_VARIANT,
                    lineHeight: 20,
                }}
            >
                Tạo hồ sơ đầu tiên để bắt đầu lưu trữ dữ liệu y tế được mã hoá trên blockchain.
            </Text>
            <Pressable
                onPress={onCreate}
                style={({ pressed }) => ({
                    marginTop: 14,
                    alignSelf: 'flex-start',
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderWidth: 0.75,
                    borderColor: EHR_OUTLINE_VARIANT,
                    borderRadius: 12,
                    opacity: pressed ? 0.7 : 1,
                })}
            >
                <Text
                    style={{
                        fontFamily: SANS_SEMI,
                        fontSize: 13,
                        color: EHR_ON_SURFACE,
                        fontWeight: '600',
                    }}
                >
                    + Tạo hồ sơ
                </Text>
            </Pressable>
        </View>
    );
}
