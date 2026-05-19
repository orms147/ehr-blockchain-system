// DoctorOutgoingScreen v2 — port of .design-bundle/project/screens-extras.jsx
// DoctorOutgoingScreen. Doctor xem trạng thái yêu cầu truy cập đã gửi.
//
// Wiring preserved:
//   - /api/requests/outgoing via api.get
//   - useQuery TanStack invalidation

import React from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Send, Clock, CheckCircle, XCircle, ShieldCheck } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import LoadingSpinner from '../../components/LoadingSpinner';
import UserChip from '../../components/UserChip';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';
import ViCard from '../../components-v2/ViCard';
import {
    EHR_SURFACE,
    EHR_SURFACE_LOWEST,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE,
    EHR_OUTLINE_SOFT,
    EHR_PRIMARY,
    EHR_TERTIARY,
    EHR_WARNING,
    EHR_DANGER,
} from '../../constants/uiColors';
import { formatDate, formatExpiry, getExpiryUrgency } from '../../utils/dateFormatting';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type RequestItem = {
    id?: string;
    requestId?: string;
    patientAddress?: string;
    createdAt?: string;
    cidHash?: string;
    status?: string;
    deadline?: string;
};

function getStatusConfig(status?: string) {
    switch (status?.toLowerCase()) {
        case 'approved':
        case 'completed':
            return { label: 'Đã duyệt', color: EHR_TERTIARY, Icon: CheckCircle };
        case 'rejected':
            return { label: 'Bị từ chối', color: EHR_DANGER, Icon: XCircle };
        case 'expired':
            return { label: 'Hết hạn', color: EHR_OUTLINE, Icon: Clock };
        case 'claimed':
            return { label: 'Đã xác nhận', color: EHR_TERTIARY, Icon: CheckCircle };
        default:
            return { label: 'Đang chờ', color: EHR_WARNING, Icon: Clock };
    }
}

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???');

function OutgoingRow({ item }: { item: RequestItem }) {
    const cfg = getStatusConfig(item.status);
    return (
        <ViCard padding={14} style={{ marginBottom: 10 }}>
            <XStack style={{ alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                <View style={{ flex: 1 }}>
                    {/* G.2 — patient wallet → UserChip (no expanded, single line for tight row) */}
                    <UserChip address={item.patientAddress} showAddress={false} />
                    <Text style={{ fontFamily: SANS, fontSize: 11.5, color: EHR_OUTLINE, marginTop: 4 }}>
                        {formatDate(item.createdAt)}
                    </Text>
                </View>
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: `${cfg.color}1A`,
                    }}
                >
                    <cfg.Icon size={10} color={cfg.color} />
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 10.5,
                            color: cfg.color,
                            fontWeight: '700',
                            letterSpacing: 0.3,
                        }}
                    >
                        {cfg.label}
                    </Text>
                </View>
            </XStack>
            {item.cidHash ? (
                <XStack
                    style={{
                        alignItems: 'center',
                        gap: 4,
                        marginTop: 10,
                        paddingTop: 10,
                        borderTopWidth: 0.5,
                        borderColor: EHR_OUTLINE_SOFT,
                    }}
                >
                    <ShieldCheck size={11} color={EHR_PRIMARY} />
                    <Text
                        style={{ fontFamily: 'monospace', fontSize: 11, color: EHR_OUTLINE }}
                        numberOfLines={1}
                    >
                        CID: {item.cidHash.slice(0, 22)}…
                    </Text>
                </XStack>
            ) : null}
            {item.deadline && item.status === 'pending' ? (() => {
                const urgency = getExpiryUrgency(item.deadline);
                const urgent = urgency === 'urgent' || urgency === 'soon';
                const color = urgency === 'expired' ? EHR_DANGER : urgent ? EHR_WARNING : EHR_OUTLINE;
                return (
                    <XStack style={{ alignItems: 'center', gap: 4, marginTop: 6 }}>
                        <Clock size={10} color={color} />
                        <Text
                            style={{
                                fontFamily: SANS_MEDIUM,
                                fontSize: 11,
                                color,
                                fontWeight: urgent ? '700' : '500',
                            }}
                        >
                            BN duyệt trước: {formatExpiry(item.deadline)}
                        </Text>
                    </XStack>
                );
            })() : null}
        </ViCard>
    );
}

export default function DoctorOutgoingScreen() {
    const { token } = useAuthStore();

    const requestsQuery = useQuery({
        queryKey: ['requests', 'outgoing'],
        queryFn: async () => {
            const reqData = await api.get('/api/requests/outgoing');
            return (Array.isArray(reqData) ? reqData : reqData?.requests || []) as RequestItem[];
        },
        enabled: !!token,
    });

    const requests = requestsQuery.data ?? [];
    const isLoading = requestsQuery.isLoading && !requestsQuery.data;
    const isRefreshing = requestsQuery.isFetching;

    const handleRefresh = () => {
        requestsQuery.refetch();
    };

    if (isLoading && !isRefreshing) return <LoadingSpinner message="Đang tải yêu cầu đã gửi..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['right', 'left']}>
            {requests.length === 0 ? (
                <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 26,
                            color: EHR_ON_SURFACE,
                            letterSpacing: -0.4,
                            lineHeight: 30,
                        }}
                    >
                        Yêu cầu đã gửi
                    </Text>
                    <Text
                        style={{
                            marginTop: 4,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: EHR_ON_SURFACE_VARIANT,
                        }}
                    >
                        Theo dõi trạng thái các yêu cầu truy cập bạn đã gửi.
                    </Text>
                    <View style={{ paddingTop: 40, alignItems: 'center' }}>
                        <Send size={28} color={EHR_OUTLINE} />
                        <Text
                            style={{
                                marginTop: 12,
                                fontFamily: SERIF,
                                fontSize: 18,
                                color: EHR_ON_SURFACE,
                                textAlign: 'center',
                            }}
                        >
                            Chưa gửi yêu cầu nào
                        </Text>
                        <Text
                            style={{
                                marginTop: 8,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: EHR_OUTLINE,
                                textAlign: 'center',
                                lineHeight: 19,
                                maxWidth: 280,
                            }}
                        >
                            Khi bạn yêu cầu truy cập hồ sơ bệnh nhân, lịch sử sẽ hiển thị tại đây.
                        </Text>
                    </View>
                </View>
            ) : (
                <FlatList
                    data={requests}
                    keyExtractor={(item, idx) => item.id?.toString() || item.requestId || `req-${idx}`}
                    renderItem={({ item }) => <OutgoingRow item={item} />}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={handleRefresh}
                            tintColor={EHR_ON_SURFACE_VARIANT}
                        />
                    }
                    ListHeaderComponent={
                        <View style={{ paddingTop: 14, marginBottom: 14 }}>
                            <Text
                                style={{
                                    fontFamily: SERIF,
                                    fontSize: 26,
                                    color: EHR_ON_SURFACE,
                                    letterSpacing: -0.4,
                                    lineHeight: 30,
                                }}
                            >
                                Yêu cầu đã gửi
                            </Text>
                            <Text
                                style={{
                                    marginTop: 4,
                                    fontFamily: SANS,
                                    fontSize: 13,
                                    color: EHR_ON_SURFACE_VARIANT,
                                    marginBottom: 12,
                                }}
                            >
                                {requests.length} yêu cầu · theo dõi trạng thái duyệt.
                            </Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

void EHR_SURFACE_LOWEST;
