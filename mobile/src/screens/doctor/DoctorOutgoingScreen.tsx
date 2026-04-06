import React, { useState, useEffect } from 'react';
import { FlatList, Pressable, RefreshControl, Alert, StyleSheet } from 'react-native';
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
import pendingUpdateService from '../../services/pendingUpdate.service';
import ipfsService from '../../services/ipfs.service';
import walletActionService from '../../services/walletAction.service';
import { useOutgoingPendingUpdates, useClaimPendingUpdate } from '../../hooks/queries/usePendingUpdates';
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
};

type PendingUpdateItem = {
    id: string;
    patientAddress: string;
    parentCidHash: string;
    encryptedContent: string;
    title?: string;
    recordType?: string;
    createdAt: string;
    status: string;
};

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

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return ''; }
};

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
            </View>
        </AnimatedCardWrapper>
    );
});

/* ── Pending update card ── */
const PendingUpdateCard = React.memo(({
    item,
    index,
    isClaiming,
    onClaim,
}: {
    item: PendingUpdateItem;
    index: number;
    isClaiming: boolean;
    onClaim: (u: PendingUpdateItem) => void;
}) => {
    const cfg = getStatusConfig(item.status);
    const isApproved = item.status === 'approved';

    return (
        <AnimatedCardWrapper index={index}>
            <View style={[s.updateCard, isApproved && s.updateCardApproved]}>
                <XStack style={s.cardTop}>
                    <View style={s.updateIconWrap}>
                        <FilePlus2 size={18} color={EHR_TERTIARY} />
                    </View>
                    <YStack style={{ flex: 1 }}>
                        <Text style={s.cardTitle}>
                            {item.title || 'Cập nhật hồ sơ'}
                        </Text>
                        <Text style={s.cardDate}>
                            BN: {truncateAddr(item.patientAddress)} {' \u2022 '} {formatDate(item.createdAt)}
                        </Text>
                    </YStack>
                    <View style={[s.statusChip, { backgroundColor: cfg.bg }]}>
                        <cfg.Icon size={11} color={cfg.color} />
                        <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                </XStack>

                {isApproved ? (
                    <Pressable
                        onPress={() => onClaim(item)}
                        disabled={isClaiming}
                        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                    >
                        <LinearGradient
                            colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={s.claimBtn}
                        >
                            {isClaiming ? (
                                <Text style={s.claimBtnText}>Đang xác nhận...</Text>
                            ) : (
                                <>
                                    <Upload size={14} color={EHR_ON_PRIMARY} />
                                    <Text style={s.claimBtnText}>Xác nhận on-chain</Text>
                                    <ArrowUpRight size={14} color={EHR_ON_PRIMARY} />
                                </>
                            )}
                        </LinearGradient>
                    </Pressable>
                ) : null}
            </View>
        </AnimatedCardWrapper>
    );
});

/* ── Main screen ── */
export default function DoctorOutgoingScreen() {
    const { token } = useAuthStore();
    const [claimingId, setClaimingId] = useState<string | null>(null);

    // Outgoing access requests — kept on direct API call (no dedicated service method).
    const requestsQuery = useQuery({
        queryKey: ['requests', 'outgoing'],
        queryFn: async () => {
            const reqData = await api.get('/api/requests/outgoing');
            return (Array.isArray(reqData) ? reqData : reqData?.requests || []) as RequestItem[];
        },
        enabled: !!token,
    });

    // Outgoing pending updates via shared hook
    const pendingUpdatesQuery = useOutgoingPendingUpdates(!!token);
    const claimMutation = useClaimPendingUpdate();

    const requests = requestsQuery.data ?? [];
    const pendingUpdates = (pendingUpdatesQuery.data?.updates ?? []) as PendingUpdateItem[];
    const isLoading = (requestsQuery.isLoading || pendingUpdatesQuery.isLoading) && !requestsQuery.data && !pendingUpdatesQuery.data;
    const isRefreshing = requestsQuery.isFetching || pendingUpdatesQuery.isFetching;

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
        pendingUpdatesQuery.refetch();
    };

    const handleClaimUpdate = async (update: PendingUpdateItem) => {
        if (update.status !== 'approved') {
            Alert.alert('Chưa được duyệt', 'Cần bệnh nhân phê duyệt trước.');
            return;
        }

        setClaimingId(update.id);
        try {
            const { cid } = await ipfsService.uploadEncrypted({
                encryptedData: update.encryptedContent,
                metadata: { title: update.title || 'Doctor update', recordType: update.recordType || 'checkup' },
            });

            const cidHash = keccak256(toBytes(cid));
            const recordTypeHash = keccak256(toBytes(update.recordType || 'checkup'));
            const { walletClient } = await walletActionService.getWalletContext();

            const txHash = await walletClient.writeContract({
                address: RECORD_REGISTRY_ADDRESS,
                abi: RECORD_REGISTRY_ABI,
                functionName: 'addRecordByDoctor',
                args: [
                    cidHash,
                    update.parentCidHash as `0x${string}`,
                    recordTypeHash,
                    update.patientAddress as `0x${string}`,
                ],
                gas: BigInt(400000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });

            // Use mutation so React Query auto-invalidates outgoing/approved/records lists.
            await claimMutation.mutateAsync({
                id: update.id,
                cidHash,
                txHash,
                cid,
                aesKey: 'doctor-managed',
            });

            Alert.alert('Đã xác nhận!', 'Hồ sơ đã được lưu lên blockchain.');
        } catch (err: any) {
            const msg = String(err?.message || '');
            if (msg.includes('insufficient funds') || msg.includes('Insufficient')) {
                Alert.alert(
                    'Không đủ tiền phí giao dịch',
                    'Ví của bạn không đủ ETH để thực hiện. Vào mục Cá nhân \u2192 Nạp ETH để nạp thêm.'
                );
            } else if (msg.includes('eth_sendTransaction')) {
                Alert.alert(
                    'Lỗi kết nối ví',
                    'Không thể gửi giao dịch. Vui lòng đăng xuất và đăng nhập lại.'
                );
            } else if (msg.includes('network') || msg.includes('rpc') || msg.includes('fetch')) {
                Alert.alert(
                    'Lỗi kết nối mạng',
                    'Không thể kết nối đến hệ thống blockchain. Vui lòng kiểm tra kết nối internet và thử lại.'
                );
            } else {
                Alert.alert(
                    'Không thể xác nhận hồ sơ',
                    'Đã xảy ra lỗi. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.'
                );
            }
            console.error('Claim update error:', err);
        } finally {
            setClaimingId(null);
        }
    };

    if (isLoading && !isRefreshing) return <LoadingSpinner message="Đang tải yêu cầu đã gửi..." />;

    const allItems: { type: 'update' | 'request'; data: any }[] = [
        ...pendingUpdates.map((u) => ({ type: 'update' as const, data: u })),
        ...requests.map((r) => ({ type: 'request' as const, data: r })),
    ];

    const approvedCount = pendingUpdates.filter((u) => u.status === 'approved').length;

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
                    keyExtractor={(item, idx) => {
                        if (item.type === 'update') return `update-${item.data.id}`;
                        return item.data.id?.toString() || item.data.requestId || `req-${idx}`;
                    }}
                    renderItem={({ item, index }) => {
                        if (item.type === 'update') {
                            return (
                                <PendingUpdateCard
                                    item={item.data}
                                    index={index}
                                    isClaiming={claimingId === item.data.id}
                                    onClaim={handleClaimUpdate}
                                />
                            );
                        }
                        return <OutgoingRequestCard item={item.data} index={index} />;
                    }}
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
                                Theo dõi trạng thái yêu cầu và cập nhật hồ sơ
                            </Text>

                            {/* Stats row */}
                            <XStack style={s.statsRow}>
                                <View style={s.statCard}>
                                    <Text style={s.statValue}>{pendingUpdates.length}</Text>
                                    <Text style={s.statLabel}>Cập nhật</Text>
                                </View>
                                <View style={s.statCard}>
                                    <Text style={[s.statValue, { color: EHR_TERTIARY }]}>{approvedCount}</Text>
                                    <Text style={s.statLabel}>Chờ xác nhận</Text>
                                </View>
                                <View style={s.statCard}>
                                    <Text style={[s.statValue, { color: EHR_SECONDARY }]}>{requests.length}</Text>
                                    <Text style={s.statLabel}>Yêu cầu</Text>
                                </View>
                            </XStack>

                            {approvedCount > 0 ? (
                                <View style={s.infoBanner}>
                                    <Upload size={14} color={EHR_PRIMARY} />
                                    <Text style={s.infoBannerText}>
                                        {approvedCount} cập nhật đã được duyệt, sẵn sàng xác nhận on-chain
                                    </Text>
                                </View>
                            ) : null}
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
