import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl, Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FileText, Users, Clock3, Loader2, CheckCircle, Clock } from 'lucide-react-native';
import { YStack, XStack, Text, View, Button } from 'tamagui';
import { parseGwei } from 'viem';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDelay,
    interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import SharedRecordCard from '../../components/SharedRecordCard';
import RoleSwitcher from '../../components/RoleSwitcher';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import AnimatedSection from '../../components/AnimatedSection';
import keyShareService from '../../services/keyShare.service';
import requestService from '../../services/request.service';
import walletActionService from '../../services/walletAction.service';
import useAuthStore from '../../store/authStore';
import {
    EHR_ON_PRIMARY,
    EHR_ON_PRIMARY_CONTAINER,
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
    EHR_SURFACE_CONTAINER,
    EHR_SURFACE_HIGH,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../../constants/uiColors';

const SPRING = { damping: 18, stiffness: 120, mass: 0.8 };

const EHR_SYSTEM_ADDRESS = process.env.EXPO_PUBLIC_EHR_SYSTEM_ADDRESS as `0x${string}`;

const EHR_SYSTEM_ABI = [
    {
        type: 'function',
        name: 'confirmAccessRequestWithSignature',
        inputs: [
            { name: 'reqId', type: 'bytes32' },
            { name: 'deadline', type: 'uint256' },
            { name: 'signature', type: 'bytes' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;

type SharedRecord = {
    id?: string;
    cidHash?: string;
    createdAt?: string;
    status?: string;
    active?: boolean;
    parentCidHash?: string;
    senderAddress?: string;
    versionCount?: number;
    record?: { ownerAddress?: string; title?: string; recordType?: string };
};

type PendingClaim = {
    requestId: string;
    patientAddress: string;
    createdAt: string;
    signature: string;
    signatureDeadline: string;
};

export default function DoctorDashboardScreen() {
    const navigation = useNavigation<any>();
    const { token } = useAuthStore();
    const [sharedRecords, setSharedRecords] = useState<SharedRecord[]>([]);
    const [pendingClaims, setPendingClaims] = useState<PendingClaim[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [claimingId, setClaimingId] = useState<string | null>(null);

    const headerEnter = useSharedValue(0);
    useEffect(() => {
        headerEnter.value = withSpring(1, SPRING);
    }, []);
    const headerStyle = useAnimatedStyle(() => ({
        opacity: interpolate(headerEnter.value, [0, 0.3, 1], [0, 0.6, 1]),
        transform: [{ translateY: interpolate(headerEnter.value, [0, 1], [16, 0]) }],
    }));

    const fetchSharedRecords = useCallback(async () => {
        try {
            const records: SharedRecord[] = await keyShareService.getReceivedKeys();
            const uniqueMap = new Map<string, SharedRecord>();
            (records || []).forEach((r) => { if (r?.cidHash) uniqueMap.set(r.cidHash, r); });
            const distinct = Array.from(uniqueMap.values());
            const activeList = distinct.filter((r) => r.active !== false && r.status !== 'awaiting_claim');
            const activeParentCids = new Set(
                activeList.map((r) => r.parentCidHash?.toLowerCase()).filter(Boolean) as string[]
            );
            const latestActive = activeList.filter((r) => !activeParentCids.has(r.cidHash?.toLowerCase() || ''));
            const processed = latestActive.map((record) => {
                let count = 1;
                let current = record;
                const visited = new Set([record.cidHash]);
                while (current.parentCidHash && uniqueMap.has(current.parentCidHash)) {
                    if (visited.has(current.parentCidHash)) break;
                    count += 1;
                    current = uniqueMap.get(current.parentCidHash) as SharedRecord;
                    visited.add(current.cidHash);
                }
                return { ...record, versionCount: count };
            });
            processed.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            setSharedRecords(processed);
        } catch (err) {
            console.error('Failed to fetch shared records:', err);
        }
    }, []);

    const fetchPendingClaims = useCallback(async () => {
        try {
            const response = await requestService.getSignedRequests();
            const claims = response?.requests || [];
            setPendingClaims(claims);
        } catch (err) {
            console.error('Failed to fetch pending claims:', err);
        }
    }, []);

    const fetchAll = useCallback(async () => {
        await Promise.all([fetchSharedRecords(), fetchPendingClaims()]);
        setIsLoading(false);
        setIsRefreshing(false);
    }, [fetchSharedRecords, fetchPendingClaims]);

    useEffect(() => {
        if (token) fetchAll();
    }, [token, fetchAll]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchAll();
    }, [fetchAll]);

    const isClaimExpired = (claim: PendingClaim) => {
        if (!claim.signatureDeadline) return false;
        return Date.now() > Number(claim.signatureDeadline) * 1000;
    };

    const getClaimTimeLeft = (claim: PendingClaim) => {
        if (!claim.signatureDeadline) return '';
        const diffMs = Number(claim.signatureDeadline) * 1000 - Date.now();
        if (diffMs <= 0) return 'Hết hạn';
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 0) return `Còn ${hours}h ${mins}p`;
        return `Còn ${mins} phút`;
    };

    const handleClaim = async (claim: PendingClaim) => {
        if (isClaimExpired(claim)) {
            Alert.alert('Phê duyệt đã hết hạn', 'Bệnh nhân đã ký hơn 24 giờ trước. Vui lòng yêu cầu bệnh nhân phê duyệt lại.');
            return;
        }
        setClaimingId(claim.requestId);
        try {
            const { walletClient } = await walletActionService.getWalletContext();
            const txHash = await walletClient.writeContract({
                address: EHR_SYSTEM_ADDRESS,
                abi: EHR_SYSTEM_ABI,
                functionName: 'confirmAccessRequestWithSignature',
                args: [claim.requestId as `0x${string}`, BigInt(claim.signatureDeadline), claim.signature as `0x${string}`],
                gas: BigInt(300000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });
            await requestService.markClaimed(claim.requestId, txHash);
            Alert.alert('Đã nhận quyền truy cập!', 'Hồ sơ sẽ xuất hiện trong danh sách bên dưới.');
            fetchAll();
        } catch (err: any) {
            const msg = String(err?.message || '');
            if (msg.includes('insufficient funds') || msg.includes('Insufficient')) {
                Alert.alert('Không đủ tiền phí giao dịch', 'Ví của bạn không đủ ETH để thực hiện. Vào mục Cá nhân → Nạp ETH để nạp thêm.');
            } else if (msg.includes('ApprovalTooSoon') || msg.includes('0x3d693ada')) {
                Alert.alert('Vui lòng chờ thêm', 'Hệ thống cần xử lý yêu cầu trước đó. Hãy thử lại sau 15-30 giây.');
            } else if (msg.includes('deadline') || msg.includes('expired') || msg.includes('InvalidSignature') || msg.includes('0x8baa579f')) {
                Alert.alert('Phê duyệt đã hết hạn', 'Bệnh nhân đã ký hơn 24 giờ trước. Vui lòng yêu cầu bệnh nhân phê duyệt lại.');
            } else if (msg.includes('eth_sendTransaction')) {
                Alert.alert('Lỗi kết nối ví', 'Không thể gửi giao dịch. Vui lòng đăng xuất và đăng nhập lại.');
            } else if (msg.includes('network') || msg.includes('rpc') || msg.includes('fetch')) {
                Alert.alert('Lỗi kết nối mạng', 'Không thể kết nối đến hệ thống blockchain. Vui lòng kiểm tra kết nối internet và thử lại.');
            } else {
                Alert.alert('Không thể nhận quyền truy cập', 'Đã xảy ra lỗi. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.');
            }
            console.error('Claim error:', err);
        } finally {
            setClaimingId(null);
        }
    };

    const handleViewRecord = (record: SharedRecord) => {
        if (!record?.cidHash) { Alert.alert('Không mở được hồ sơ', 'Thiếu mã hồ sơ (cidHash).'); return; }
        const displayDate = record?.createdAt ? new Date(record.createdAt).toLocaleDateString('vi-VN') : '';
        const patientAddress = record?.record?.ownerAddress || record?.senderAddress || '';
        navigation.navigate('RecordDetail', {
            record: {
                cidHash: record.cidHash,
                title: record?.record?.title || 'Hồ sơ được chia sẻ',
                type: record?.record?.recordType || 'shared_record',
                date: displayDate,
                createdAt: record?.createdAt ? new Date(record.createdAt).toISOString() : null,
                createdByDisplay: patientAddress ? `BN. ${patientAddress.substring(0, 8)}...${patientAddress.slice(-4)}` : 'Bệnh nhân',
            },
        });
    };

    const handleCreateUpdate = (record: SharedRecord) => {
        const patientAddress = record?.record?.ownerAddress || record?.senderAddress || '';
        if (!record?.cidHash || !patientAddress) { Alert.alert('Lỗi', 'Thiếu thông tin hồ sơ hoặc bệnh nhân.'); return; }
        navigation.navigate('DoctorCreateUpdate', { parentCidHash: record.cidHash, patientAddress });
    };

    const uniquePatients = new Set(
        sharedRecords.map((r) => (r.record?.ownerAddress || r.senderAddress)?.toLowerCase()).filter(Boolean)
    ).size;
    const pendingCount = sharedRecords.filter((r) => r.status === 'pending').length;
    const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 8)}...${addr.slice(-4)}` : '???');

    if (isLoading) return <LoadingSpinner message="Đang tải hồ sơ bác sĩ..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <FlatList
                contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[EHR_PRIMARY]} />}
                data={sharedRecords}
                keyExtractor={(item, idx) => item.id || item.cidHash || `shared-${idx}`}
                renderItem={({ item, index }) => (
                    <AnimatedSection delay={index * 50}>
                        <SharedRecordCard record={item} onView={handleViewRecord} onCreateUpdate={handleCreateUpdate} />
                    </AnimatedSection>
                )}
                ListHeaderComponent={
                    <Animated.View style={headerStyle}>
                        {/* Header */}
                        <XStack style={s.headerRow}>
                            <YStack style={{ flex: 1, marginRight: 12 }}>
                                <Text style={s.headerLabel}>Trung tâm Điều hành</Text>
                                <Text style={s.headerTitle}>Bác sĩ Dashboard</Text>
                                <Text style={s.headerSub}>Quản lý quyền truy cập và hồ sơ lâm sàng.</Text>
                            </YStack>
                            <RoleSwitcher />
                        </XStack>

                        {/* Stat cards */}
                        <XStack style={s.statRow}>
                            <View style={s.statCard}>
                                <View style={[s.statIcon, { backgroundColor: EHR_PRIMARY_FIXED }]}>
                                    <Users size={18} color={EHR_PRIMARY} />
                                </View>
                                <Text style={s.statValue}>{uniquePatients}</Text>
                                <Text style={s.statLabel}>Bệnh nhân</Text>
                            </View>
                            <View style={s.statCard}>
                                <View style={[s.statIcon, { backgroundColor: EHR_PRIMARY_FIXED }]}>
                                    <FileText size={18} color={EHR_PRIMARY} />
                                </View>
                                <Text style={s.statValue}>{sharedRecords.length}</Text>
                                <Text style={s.statLabel}>Hồ sơ</Text>
                            </View>
                            <View style={s.statCard}>
                                <View style={[s.statIcon, { backgroundColor: EHR_SECONDARY_CONTAINER }]}>
                                    <Clock3 size={18} color={EHR_SECONDARY} />
                                </View>
                                <Text style={s.statValue}>{pendingCount}</Text>
                                <Text style={s.statLabel}>Chờ xem</Text>
                            </View>
                        </XStack>

                        {/* Pending Claims */}
                        {pendingClaims.length > 0 && (
                            <View style={{ marginBottom: 24 }}>
                                <XStack style={s.sectionHeader}>
                                    <Text style={s.sectionTitle}>Chờ nhận truy cập</Text>
                                    <View style={s.countBadge}>
                                        <Text style={s.countText}>{pendingClaims.length} Mới</Text>
                                    </View>
                                </XStack>

                                {pendingClaims.map((claim) => {
                                    const isClaiming = claimingId === claim.requestId;
                                    const expired = isClaimExpired(claim);
                                    const timeLeft = getClaimTimeLeft(claim);

                                    if (expired) {
                                        // Expired claim - muted card
                                        return (
                                            <View key={claim.requestId} style={s.expiredCard}>
                                                <XStack style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                                    <YStack style={{ opacity: 0.6, flex: 1 }}>
                                                        <Text style={s.expiredId}>BN: {truncateAddr(claim.patientAddress)}</Text>
                                                        <Text style={s.expiredDate}>{new Date(claim.createdAt).toLocaleDateString('vi-VN')}</Text>
                                                    </YStack>
                                                    <View style={s.expiredBadge}>
                                                        <Text style={s.expiredBadgeText}>Hết hạn</Text>
                                                    </View>
                                                </XStack>
                                                <Pressable style={s.expiredBtn} disabled>
                                                    <Text style={s.expiredBtnText}>Đã đóng yêu cầu</Text>
                                                </Pressable>
                                            </View>
                                        );
                                    }

                                    // Active claim - gradient card
                                    return (
                                        <View key={claim.requestId} style={s.claimCardWrap}>
                                            <LinearGradient
                                                colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={s.claimGradient}
                                            >
                                                <XStack style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                                                    <YStack style={{ flex: 1 }}>
                                                        <Text style={s.claimPatient}>{truncateAddr(claim.patientAddress)}</Text>
                                                        <Text style={s.claimDate}>{new Date(claim.createdAt).toLocaleDateString('vi-VN')}</Text>
                                                    </YStack>
                                                    <View style={s.timeBadge}>
                                                        <Clock size={12} color={EHR_ON_PRIMARY} />
                                                        <Text style={s.timeText}>{timeLeft}</Text>
                                                    </View>
                                                </XStack>

                                                <Pressable
                                                    style={s.claimBtn}
                                                    onPress={() => handleClaim(claim)}
                                                    disabled={isClaiming}
                                                >
                                                    {isClaiming ? (
                                                        <Loader2 size={16} color={EHR_PRIMARY} />
                                                    ) : (
                                                        <CheckCircle size={16} color={EHR_PRIMARY} />
                                                    )}
                                                    <Text style={s.claimBtnText}>
                                                        {isClaiming ? 'Đang xử lý...' : 'Nhận truy cập'}
                                                    </Text>
                                                </Pressable>
                                            </LinearGradient>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {/* Shared records header */}
                        <Text style={s.sectionTitle}>Hồ sơ đã nhận ({sharedRecords.length})</Text>
                        <View style={{ height: 12 }} />
                    </Animated.View>
                }
                ListEmptyComponent={
                    <EmptyState
                        icon={FileText}
                        message="Chưa có hồ sơ nào"
                        subMessage="Khi bệnh nhân chia sẻ hồ sơ cho bạn, chúng sẽ hiển thị tại đây."
                    />
                }
                showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    // Header
    headerRow: {
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    headerLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: EHR_ON_SURFACE_VARIANT,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: EHR_ON_SURFACE,
        letterSpacing: -0.5,
    },
    headerSub: {
        fontSize: 13,
        color: EHR_ON_SURFACE_VARIANT,
        marginTop: 4,
    },
    // Stat cards
    statRow: {
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 24,
    },
    statCard: {
        flex: 1,
        backgroundColor: EHR_SURFACE_LOWEST,
        borderRadius: 16,
        padding: 14,
        alignItems: 'center',
        shadowColor: EHR_SHADOW,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 10,
        elevation: 2,
    },
    statIcon: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
        marginBottom: 2,
    },
    statLabel: {
        fontSize: 11,
        color: EHR_ON_SURFACE_VARIANT,
    },
    // Section
    sectionHeader: {
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
        letterSpacing: -0.3,
    },
    countBadge: {
        backgroundColor: EHR_SECONDARY_CONTAINER,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    countText: {
        fontSize: 11,
        fontWeight: '700',
        color: EHR_SECONDARY,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    // Active claim (gradient)
    claimCardWrap: {
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: `${EHR_PRIMARY}33`,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 4,
    },
    claimGradient: {
        padding: 20,
    },
    claimPatient: {
        fontSize: 17,
        fontWeight: '700',
        color: EHR_ON_PRIMARY,
    },
    claimDate: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 2,
    },
    timeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    timeText: {
        fontSize: 11,
        fontWeight: '700',
        color: EHR_ON_PRIMARY,
    },
    claimBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: EHR_ON_PRIMARY,
        borderRadius: 12,
        paddingVertical: 14,
    },
    claimBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: EHR_PRIMARY,
    },
    // Expired claim
    expiredCard: {
        backgroundColor: EHR_SURFACE_LOW,
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: EHR_OUTLINE_VARIANT,
    },
    expiredId: {
        fontSize: 15,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
    },
    expiredDate: {
        fontSize: 11,
        color: EHR_ON_SURFACE_VARIANT,
        marginTop: 2,
    },
    expiredBadge: {
        backgroundColor: `${EHR_OUTLINE_VARIANT}40`,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    expiredBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: EHR_ON_SURFACE_VARIANT,
    },
    expiredBtn: {
        backgroundColor: EHR_SURFACE_HIGH,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    expiredBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: `${EHR_ON_SURFACE_VARIANT}60`,
    },
});
