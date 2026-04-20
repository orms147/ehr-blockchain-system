import React, { useState, useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, Alert, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from '../../services/auth.service';
import keyShareService from '../../services/keyShare.service';
import { encryptForRecipient, getOrCreateEncryptionKeypair } from '../../services/nacl-crypto';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Send, Clock, CheckCircle, XCircle, User, FilePlus2,
    Upload, ShieldCheck, ChevronRight, ArrowUpRight,
} from 'lucide-react-native';
import { XStack, YStack, Text, View, Button } from 'tamagui';
import { keccak256, toBytes, parseGwei } from 'viem';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDelay,
    interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';

import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import useAuthStore from '../../store/authStore';
import api from '../../services/api';
// pendingUpdate service + hooks removed 2026-04-19 — doctor updates are direct on-chain.
import ipfsService from '../../services/ipfs.service';
import walletActionService from '../../services/walletAction.service';
import {
    EHR_ERROR,
    EHR_ERROR_CONTAINER,
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SECONDARY,
    EHR_SECONDARY_CONTAINER,
    EHR_SHADOW,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
    EHR_TERTIARY,
    EHR_TERTIARY_FIXED,
} from '../../constants/uiColors';
import { formatDate, formatExpiry, getExpiryUrgency } from '../../utils/dateFormatting';

const RECORD_REGISTRY_ADDRESS = process.env.EXPO_PUBLIC_RECORD_REGISTRY_ADDRESS as `0x${string}`;

const RECORD_REGISTRY_ABI = [
    {
        type: 'function',
        name: 'addRecordByDoctor',
        inputs: [
            { name: 'cidHash', type: 'bytes32' },
            { name: 'parentCidHash', type: 'bytes32' },
            { name: 'recordTypeHash', type: 'bytes32' },
            { name: 'patient', type: 'address' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;

type RequestItem = {
    id?: string;
    requestId?: string;
    patientAddress?: string;
    createdAt?: string;
    cidHash?: string;
    status?: string;
    deadline?: string;
};

// PendingUpdateItem type removed 2026-04-19 — doctor updates are direct on-chain.

const SPRING = { damping: 18, stiffness: 120, mass: 0.8 };

const getStatusConfig = (status?: string) => {
    switch (status?.toLowerCase()) {
        case 'approved':
        case 'completed':
            return { label: 'Đã duyệt', color: '#166534', bg: '#dcfce7', Icon: CheckCircle };
        case 'rejected':
            return { label: 'Bị từ chối', color: EHR_ERROR, bg: EHR_ERROR_CONTAINER, Icon: XCircle };
        case 'expired':
            return { label: 'Hết hạn', color: EHR_ON_SURFACE_VARIANT, bg: EHR_SURFACE_LOW, Icon: Clock };
        case 'claimed':
            return { label: 'Đã xác nhận', color: '#166534', bg: '#dcfce7', Icon: CheckCircle };
        default:
            return { label: 'Đang chờ', color: '#92400e', bg: '#fef3c7', Icon: Clock };
    }
};

const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 8)}...${addr.slice(-4)}` : '???');


/* ── Animated card wrapper ── */
function AnimatedCardWrapper({ index, children }: { index: number; children: React.ReactNode }) {
    const enter = useSharedValue(0);
    useEffect(() => {
        enter.value = withDelay(index * 80, withSpring(1, SPRING));
    }, []);

    const style = useAnimatedStyle(() => ({
        opacity: interpolate(enter.value, [0, 0.3, 1], [0, 0.5, 1]),
        transform: [
            { perspective: 800 },
            { translateY: interpolate(enter.value, [0, 1], [16, 0]) },
            { scale: interpolate(enter.value, [0, 1], [0.96, 1]) },
            { rotateX: `${interpolate(enter.value, [0, 1], [6, 0])}deg` },
        ],
    }));

    return <Animated.View style={style}>{children}</Animated.View>;
}

/* ── Outgoing request card ── */
const OutgoingRequestCard = React.memo(({ item, index }: { item: RequestItem; index: number }) => {
    const cfg = getStatusConfig(item.status);
    return (
        <AnimatedCardWrapper index={index}>
            <View style={s.requestCard}>
                <XStack style={s.cardTop}>
                    <View style={s.requestIconWrap}>
                        <Send size={18} color={EHR_SECONDARY} />
                    </View>
                    <YStack style={{ flex: 1 }}>
                        <Text style={s.cardTitle}>
                            BN: {truncateAddr(item.patientAddress)}
                        </Text>
                        <Text style={s.cardDate}>
                            {formatDate(item.createdAt)}
                        </Text>
                    </YStack>
                    <View style={[s.statusChip, { backgroundColor: cfg.bg }]}>
                        <cfg.Icon size={11} color={cfg.color} />
                        <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                </XStack>
                {item.cidHash ? (
                    <XStack style={s.cidRow}>
                        <ShieldCheck size={10} color={EHR_PRIMARY} />
                        <Text style={s.cidText} numberOfLines={1}>
                            CID: {item.cidHash.substring(0, 24)}...
                        </Text>
                    </XStack>
                ) : null}
                {item.deadline && item.status === 'pending' ? (() => {
                    const urgency = getExpiryUrgency(item.deadline);
                    const urgent = urgency === 'urgent' || urgency === 'soon';
                    const color = urgency === 'expired' ? EHR_ERROR : urgent ? '#B45309' : EHR_ON_SURFACE_VARIANT;
                    return (
                        <XStack style={{ alignItems: 'center', gap: 4, marginTop: 6 }}>
                            <Clock size={10} color={color} />
                            <Text style={{ fontSize: 11, color, fontWeight: urgent ? '700' : '500' }}>
                                BN duyệt trước: {formatExpiry(item.deadline)}
                            </Text>
                        </XStack>
                    );
                })() : null}
            </View>
        </AnimatedCardWrapper>
    );
});

/* PendingUpdateCard removed 2026-04-19 — doctor updates are direct on-chain. */

/* ── Main screen ── */
export default function DoctorOutgoingScreen() {
    const { token } = useAuthStore();

    // Outgoing access requests — kept on direct API call (no dedicated service method).
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

    const headerEnter = useSharedValue(0);
    useEffect(() => {
        headerEnter.value = withSpring(1, SPRING);
    }, []);

    const headerStyle = useAnimatedStyle(() => ({
        opacity: interpolate(headerEnter.value, [0, 0.3, 1], [0, 0.6, 1]),
        transform: [
            { translateY: interpolate(headerEnter.value, [0, 1], [16, 0]) },
        ],
    }));

    const handleRefresh = () => {
        requestsQuery.refetch();
    };

    // handleClaimUpdate removed 2026-04-19 — doctor updates are now direct
    // on-chain via DoctorCreateUpdateScreen.handleSubmit.

    if (isLoading && !isRefreshing) return <LoadingSpinner message="Đang tải yêu cầu đã gửi..." />;

    const allItems: { type: 'request'; data: any }[] = [
        ...requests.map((r) => ({ type: 'request' as const, data: r })),
    ];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['right', 'left']}>
            {allItems.length === 0 ? (
                <EmptyState
                    icon={Send}
                    title="Chưa gửi yêu cầu nào"
                    description="Khi bạn yêu cầu truy cập hoặc cập nhật hồ sơ, lịch sử sẽ hiển thị tại đây."
                />
            ) : (
                <FlatList
                    data={allItems}
                    keyExtractor={(item, idx) =>
                        item.data.id?.toString() || item.data.requestId || `req-${idx}`
                    }
                    renderItem={({ item, index }) => (
                        <OutgoingRequestCard item={item.data} index={index} />
                    )}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={handleRefresh}
                            colors={[EHR_PRIMARY]}
                        />
                    }
                    ListHeaderComponent={
                        <Animated.View style={headerStyle}>
                            <Text style={s.screenTitle}>Yêu cầu đã gửi</Text>
                            <Text style={s.screenSubtitle}>
                                Theo dõi trạng thái các yêu cầu truy cập bạn đã gửi
                            </Text>

                            <XStack style={s.statsRow}>
                                <View style={s.statCard}>
                                    <Text style={[s.statValue, { color: EHR_SECONDARY }]}>{requests.length}</Text>
                                    <Text style={s.statLabel}>Yêu cầu</Text>
                                </View>
                            </XStack>
                        </Animated.View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    screenTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: EHR_ON_SURFACE,
        letterSpacing: -0.5,
    },
    screenSubtitle: {
        fontSize: 13,
        color: EHR_ON_SURFACE_VARIANT,
        marginTop: 2,
        marginBottom: 16,
    },
    statsRow: {
        gap: 10,
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        backgroundColor: EHR_SURFACE_LOWEST,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${EHR_OUTLINE_VARIANT}60`,
        paddingVertical: 14,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 22,
        fontWeight: '800',
        color: EHR_PRIMARY,
    },
    statLabel: {
        fontSize: 11,
        color: EHR_ON_SURFACE_VARIANT,
        marginTop: 2,
        fontWeight: '500',
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: EHR_PRIMARY_FIXED,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: `${EHR_PRIMARY}20`,
        padding: 12,
        marginBottom: 16,
    },
    infoBannerText: {
        flex: 1,
        fontSize: 12,
        color: EHR_PRIMARY,
        fontWeight: '600',
        lineHeight: 18,
    },
    /* Request card */
    requestCard: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: `${EHR_OUTLINE_VARIANT}60`,
        padding: 16,
        marginBottom: 12,
        shadowColor: EHR_SHADOW,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 2,
    },
    requestIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: EHR_SECONDARY_CONTAINER,
        alignItems: 'center',
        justifyContent: 'center',
    },
    /* Update card */
    updateCard: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: `${EHR_OUTLINE_VARIANT}60`,
        padding: 16,
        marginBottom: 12,
        shadowColor: EHR_SHADOW,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 2,
    },
    updateCardApproved: {
        borderColor: `${EHR_PRIMARY}30`,
        borderWidth: 1.5,
    },
    updateIconWrap: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: EHR_TERTIARY_FIXED,
        alignItems: 'center',
        justifyContent: 'center',
    },
    /* Shared card parts */
    cardTop: {
        alignItems: 'center',
        gap: 12,
        marginBottom: 4,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
    },
    cardDate: {
        fontSize: 12,
        color: EHR_ON_SURFACE_VARIANT,
        marginTop: 2,
    },
    statusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 8,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    cidRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: `${EHR_OUTLINE_VARIANT}40`,
    },
    cidText: {
        fontSize: 11,
        color: EHR_ON_SURFACE_VARIANT,
        fontFamily: 'monospace',
        flex: 1,
    },
    /* Claim button */
    claimBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 12,
        paddingVertical: 12,
        marginTop: 12,
    },
    claimBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: EHR_ON_PRIMARY,
    },
});
