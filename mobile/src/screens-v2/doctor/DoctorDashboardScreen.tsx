// DoctorDashboardScreen v2 — port of .design-bundle/project/screens-doctor.jsx
// DoctorHomeScreen. Editorial hero (serif "Chào, BS. X." italic cinnabar) +
// verification badge + stats strip + 2x2 quick actions + pending claims with
// cinnabar gradient + shared records list (reuses SharedRecordCard).
//
// Business logic preserved bit-for-bit:
//   - keyShareService.getReceivedKeys + chain root grouping
//   - requestService.getSignedRequests (pending claims polling)
//   - 2-step on-chain confirmAccessRequestWithSignature + confirmAccessRequest
//     with biometric gate + 17s MIN_APPROVAL_DELAY retry + TooSoon fallback
//   - consentService.fetchGrantContext → isVerifiedDoctor gate before view
//   - recordService.getRecordChain BRANCH guard before doctor-create-update
//   - runKeyShareHealer on focus
//   - LiabilityConfirmModal flow for first-time view + claim
//
// Visual change: drop legacy gradient hero + 3D press anims + lavender/amber
// /sky/red brand soup → unified cinnabar + ink + jade per design.

import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, RefreshControl, Alert, Pressable, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
    FileText,
    Users,
    FilePlus2,
    Share2,
    Siren,
    Network,
    AlertTriangle,
    CheckCircle,
    Clock,
    ShieldCheck,
} from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { parseGwei } from 'viem';

import SharedRecordCard from '../../components/SharedRecordCard';
import RoleSwitcher from '../../components/RoleSwitcher';
import LoadingSpinner from '../../components/LoadingSpinner';
import LiabilityConfirmModal from '../../components/LiabilityConfirmModal';
import { useUserProfile } from '../../components/UserChip';
import ViCard from '../../components-v2/ViCard';
import { ViSectionLabel } from '../../components-v2/ViChips';
import keyShareService from '../../services/keyShare.service';
import recordService from '../../services/record.service';
import requestService from '../../services/request.service';
import walletActionService from '../../services/walletAction.service';
import consentService from '../../services/consent.service';
import { runKeyShareHealer } from '../../services/keyShareHealer.service';
import { formatChainError } from '../../utils/rpcRetry';
import useAuthStore from '../../store/authStore';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SERIF_MEDIUM = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

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
    {
        type: 'function',
        name: 'confirmAccessRequest',
        inputs: [{ name: 'reqId', type: 'bytes32' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
] as const;

type SharedRecord = {
    id?: string;
    cidHash?: string;
    createdAt?: string;
    expiresAt?: string;
    status?: string;
    active?: boolean;
    parentCidHash?: string;
    rootCidHash?: string;
    senderAddress?: string;
    versionCount?: number;
    allowDelegate?: boolean;
    record?: { ownerAddress?: string; title?: string; recordType?: string };
};

type PendingClaim = {
    requestId: string;
    patientAddress: string;
    createdAt: string;
    signature: string;
    signatureDeadline: string;
};

const VI_WEEKDAY = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function formatViDateTop(d: Date) {
    return `${VI_WEEKDAY[d.getDay()]} · ${d.getDate()} · ${d.getMonth() + 1} · ${d.getFullYear()}`;
}

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}`.toUpperCase() : '0X00…0000');

// G.2 — resolve patient wallet → real fullName for cinnabar pending claim
// card. UserChip can't be used directly here because its built-in avatar +
// dark-mode tokens don't compose against the cinnabar gradient. Inline-only
// custom render via the same useUserProfile hook UserChip uses, so the
// resolution call is dedupe'd if the same patient appears elsewhere.
function PatientNameInline({
    address,
    style,
    fallback,
}: {
    address?: string;
    style: any;
    fallback: string;
}) {
    const { data: profile } = useUserProfile(address);
    const displayName = profile?.fullName ? `BN. ${profile.fullName}` : fallback;
    return <Text style={style}>{displayName}</Text>;
}

function firstName(fullName?: string) {
    if (!fullName) return 'Bạn';
    const parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1] || fullName;
}

export default function DoctorDashboardScreen() {
    const palette = useEhrPalette();
    const navigation = useNavigation<any>();
    const { token, user } = useAuthStore();
    const queryClient = useQueryClient();
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [isVerifiedDoctor, setIsVerifiedDoctor] = useState<boolean | null>(null);
    const [liabilityModal, setLiabilityModal] = useState<{ type: 'claim' | 'view'; data: any } | null>(null);

    const checkVerification = useCallback(() => {
        const myAddr = (user?.walletAddress || (user as any)?.address || '').toLowerCase();
        if (!myAddr || !token) return;
        consentService.fetchGrantContext(myAddr)
            .then((ctx: any) => setIsVerifiedDoctor(ctx?.isVerifiedDoctor === true))
            .catch(() => setIsVerifiedDoctor(null));
    }, [user, token]);
    useEffect(() => { checkVerification(); }, [checkVerification]);

    const sharedRecordsQuery = useQuery({
        queryKey: ['doctor', 'sharedRecords'],
        refetchInterval: 15_000,
        queryFn: async (): Promise<SharedRecord[]> => {
            const records: SharedRecord[] = await keyShareService.getReceivedKeys();
            const uniqueMap = new Map<string, SharedRecord>();
            (records || []).forEach((r) => { if (r?.cidHash) uniqueMap.set(r.cidHash, r); });
            const distinct = Array.from(uniqueMap.values());
            const visible = distinct.filter((r) => r.status !== 'awaiting_claim');
            const byRoot = new Map<string, SharedRecord>();
            for (const r of visible) {
                const root = (r.rootCidHash || r.cidHash || '').toLowerCase();
                if (!root) continue;
                const prev = byRoot.get(root);
                if (!prev) {
                    byRoot.set(root, r);
                    continue;
                }
                const rTs = new Date(r.createdAt || 0).getTime();
                const prevTs = new Date(prev.createdAt || 0).getTime();
                if (rTs > prevTs) byRoot.set(root, r);
            }
            const latest = Array.from(byRoot.values());
            const processed = latest.map((record) => {
                const root = (record.rootCidHash || record.cidHash || '').toLowerCase();
                const count = visible.filter((r) => {
                    const rRoot = (r.rootCidHash || r.cidHash || '').toLowerCase();
                    return rRoot === root;
                }).length;
                return { ...record, versionCount: count };
            });
            processed.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
            return processed;
        },
        enabled: !!token,
    });

    const pendingClaimsQuery = useQuery({
        queryKey: ['requests', 'signed'],
        refetchInterval: 15_000,
        queryFn: async () => {
            const response = await requestService.getSignedRequests();
            return (response?.requests || []) as PendingClaim[];
        },
        enabled: !!token,
    });

    useFocusEffect(
        useCallback(() => {
            if (token) {
                sharedRecordsQuery.refetch();
                pendingClaimsQuery.refetch();
                runKeyShareHealer().catch((err) => {
                    console.warn('keyShareHealer error:', err);
                });
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [token]),
    );

    const allShared = sharedRecordsQuery.data ?? [];
    const isInactive = (r: SharedRecord) => {
        const s = String(r.status || '').toLowerCase();
        if (r.active === false) return true;
        if (s === 'revoked' || s === 'expired' || s === 'rejected') return true;
        if (r.expiresAt && new Date(r.expiresAt).getTime() < Date.now()) return true;
        return false;
    };
    const activeShared = allShared.filter((r) => !isInactive(r));
    const inactiveShared = allShared.filter(isInactive);
    const sharedRecords = [...activeShared, ...inactiveShared];
    const pendingClaims = pendingClaimsQuery.data ?? [];
    const isLoading =
        (sharedRecordsQuery.isLoading || pendingClaimsQuery.isLoading) &&
        !sharedRecordsQuery.data &&
        !pendingClaimsQuery.data;
    const isRefreshing = sharedRecordsQuery.isFetching || pendingClaimsQuery.isFetching;

    const handleRefresh = () => {
        sharedRecordsQuery.refetch();
        pendingClaimsQuery.refetch();
        checkVerification();
    };

    const invalidateAll = () => {
        queryClient.invalidateQueries({ queryKey: ['doctor', 'sharedRecords'] });
        queryClient.invalidateQueries({ queryKey: ['requests', 'signed'] });
    };

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
            Alert.alert(
                'Phê duyệt đã hết hạn',
                'Bệnh nhân đã ký hơn 24 giờ trước. Vui lòng yêu cầu bệnh nhân phê duyệt lại.',
            );
            return;
        }
        const accepted = await new Promise<boolean>((resolve) => {
            setLiabilityModal({
                type: 'claim',
                data: { resolve, patientLabel: truncate(claim.patientAddress) },
            });
        });
        if (!accepted) return;
        setClaimingId(claim.requestId);
        try {
            const { gateOrThrow } = await import('../../utils/biometricGate');
            await gateOrThrow('Để xác nhận yêu cầu truy cập hồ sơ');
            const { walletClient } = await walletActionService.getWalletContext();
            const gasOpts = {
                gas: BigInt(300000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            };
            await walletClient.writeContract({
                address: EHR_SYSTEM_ADDRESS,
                abi: EHR_SYSTEM_ABI,
                functionName: 'confirmAccessRequestWithSignature',
                args: [
                    claim.requestId as `0x${string}`,
                    BigInt(claim.signatureDeadline),
                    claim.signature as `0x${string}`,
                ],
                ...gasOpts,
            });
            let txHash: string = claim.requestId;
            try {
                txHash = await walletClient.writeContract({
                    address: EHR_SYSTEM_ADDRESS,
                    abi: EHR_SYSTEM_ABI,
                    functionName: 'confirmAccessRequest',
                    args: [claim.requestId as `0x${string}`],
                    ...gasOpts,
                });
            } catch (stepBErr: any) {
                const msg = String(stepBErr?.message || '');
                if (msg.includes('TooSoon') || msg.includes('0x3d693ada')) {
                    await new Promise((r) => setTimeout(r, 17000));
                    txHash = await walletClient.writeContract({
                        address: EHR_SYSTEM_ADDRESS,
                        abi: EHR_SYSTEM_ABI,
                        functionName: 'confirmAccessRequest',
                        args: [claim.requestId as `0x${string}`],
                        ...gasOpts,
                    });
                } else {
                    console.log('Step B skipped:', msg.slice(0, 60));
                }
            }
            const claimResult: any = await requestService.markClaimed(claim.requestId, txHash);
            if (claimResult?.code === 'REVOKED_AFTER_APPROVAL') {
                Alert.alert(
                    'Bệnh nhân đã thu hồi quyền',
                    'Bệnh nhân đã phê duyệt nhưng sau đó thu hồi quyền truy cập trước khi bạn nhận. Vui lòng yêu cầu lại nếu cần xem hồ sơ.',
                );
            } else {
                Alert.alert(
                    'Đã nhận quyền truy cập!',
                    'Consent đã được mint on-chain. Hồ sơ sẽ xuất hiện trong danh sách bên dưới.',
                );
            }
            invalidateAll();
        } catch (err: any) {
            const msg = String(err?.message || '');
            if (msg.includes('eth_sendTransaction')) {
                Alert.alert('Lỗi kết nối ví', 'Không thể gửi giao dịch. Vui lòng đăng xuất và đăng nhập lại.');
            } else if (msg.includes('deadline') || msg.includes('expired') || msg.includes('0x8baa579f')) {
                Alert.alert(
                    'Phê duyệt đã hết hạn',
                    'Bệnh nhân đã ký hơn 24 giờ trước. Vui lòng yêu cầu bệnh nhân phê duyệt lại.',
                );
            } else {
                Alert.alert(
                    'Không thể nhận quyền truy cập',
                    formatChainError(err, 'Đã xảy ra lỗi. Vui lòng thử lại sau.'),
                );
            }
            console.error('Claim error:', err);
        } finally {
            setClaimingId(null);
        }
    };

    const handleViewRecord = async (record: SharedRecord) => {
        if (!record?.cidHash) {
            Alert.alert('Không mở được hồ sơ', 'Thiếu mã hồ sơ (cidHash).');
            return;
        }
        if (record?.status === 'pending') {
            const patientAddr = record?.record?.ownerAddress || record?.senderAddress || '';
            const ok = await new Promise<boolean>((resolve) => {
                setLiabilityModal({
                    type: 'view',
                    data: { resolve, patientLabel: truncate(patientAddr) },
                });
            });
            if (!ok) return;
        }
        if (isVerifiedDoctor === false) {
            Alert.alert(
                'Bác sĩ chưa xác minh',
                'Tài khoản bác sĩ của bạn chưa được tổ chức y tế xác minh on-chain.\n\n' +
                'Bạn không thể xem hồ sơ được chia sẻ cho đến khi được xác minh. ' +
                'Liên hệ tổ chức y tế của bạn để được duyệt.\n\n' +
                'Sau khi xác minh, tất cả hồ sơ đã được chia sẻ sẽ tự động mở khóa — không cần bệnh nhân chia sẻ lại.',
            );
            return;
        }
        if (record?.status === 'awaiting_claim') {
            Alert.alert(
                'Cần xác nhận on-chain',
                'Bệnh nhân đã duyệt, nhưng bạn chưa nhận quyền trên blockchain. Hãy bấm "Nhận truy cập" ở mục "Chờ nhận truy cập" phía trên trước.',
            );
            return;
        }
        if (record?.status === 'pending' && record?.id) {
            try {
                await keyShareService.claimKey(record.id);
                queryClient.invalidateQueries({ queryKey: ['doctor', 'sharedRecords'] });
            } catch (e: any) {
                console.warn('claimKey failed:', e?.message || e);
            }
        }
        const displayDate = record?.createdAt ? new Date(record.createdAt).toLocaleDateString('vi-VN') : '';
        const patientAddress = record?.record?.ownerAddress || record?.senderAddress || '';
        navigation.navigate('RecordDetail', {
            record: {
                cidHash: record.cidHash,
                title: record?.record?.title || 'Hồ sơ được chia sẻ',
                type: record?.record?.recordType || 'shared_record',
                date: displayDate,
                createdAt: record?.createdAt ? new Date(record.createdAt).toISOString() : null,
                createdByDisplay: patientAddress
                    ? `BN. ${patientAddress.substring(0, 8)}...${patientAddress.slice(-4)}`
                    : 'Bệnh nhân',
                ownerAddress: patientAddress,
                allowDelegate: (record as any)?.allowDelegate ?? false,
            },
        });
    };

    const handleCreateUpdate = async (record: SharedRecord) => {
        const patientAddress = record?.record?.ownerAddress || record?.senderAddress || '';
        if (!record?.cidHash || !patientAddress) {
            Alert.alert('Lỗi', 'Thiếu thông tin hồ sơ hoặc bệnh nhân.');
            return;
        }
        try {
            const chainRes: any = await recordService.getRecordChain(record.cidHash);
            const children = chainRes?.children || [];
            if (children.length > 0) {
                let latest = children[children.length - 1];
                let depth = 0;
                while (depth < 20) {
                    const nextChain: any = await recordService.getRecordChain(latest.cidHash);
                    const nextChildren = nextChain?.children || [];
                    if (nextChildren.length === 0) break;
                    latest = nextChildren[nextChildren.length - 1];
                    depth++;
                }
                const proceed = await new Promise<boolean>((resolve) => {
                    Alert.alert(
                        'Có phiên bản mới hơn',
                        `Hồ sơ này đã có phiên bản mới hơn (v${latest.version || depth + 2}).\n\n` +
                        'Cập nhật từ phiên bản cũ sẽ tạo NHÁNH — phiên bản mới có thể không phản ánh đúng dữ liệu lâm sàng mới nhất.\n\n' +
                        'Khuyến nghị: cập nhật từ phiên bản mới nhất.',
                        [
                            { text: 'Huỷ', style: 'cancel', onPress: () => resolve(false) },
                            { text: 'Vẫn tạo nhánh', style: 'destructive', onPress: () => resolve(true) },
                        ],
                        { cancelable: true, onDismiss: () => resolve(false) },
                    );
                });
                if (!proceed) return;
            }
        } catch {
            // non-fatal
        }
        navigation.navigate('DoctorCreateUpdate', { parentCidHash: record.cidHash, patientAddress });
    };

    const uniquePatients = new Set(
        sharedRecords
            .map((r) => (r.record?.ownerAddress || r.senderAddress)?.toLowerCase())
            .filter(Boolean),
    ).size;
    const pendingCount = sharedRecords.filter((r) => r.status === 'pending').length;

    if (isLoading) return <LoadingSpinner message="Đang tải hồ sơ bác sĩ..." />;

    const today = new Date();
    const myAddr = user?.walletAddress || (user as any)?.address || '';

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top']}>
            <FlashList
                contentContainerStyle={{ paddingBottom: 80 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                data={sharedRecords}
                keyExtractor={(item, idx) => item.id || item.cidHash || `shared-${idx}`}
                renderItem={({ item }) => (
                    <View style={{ paddingHorizontal: 22 }}>
                        <SharedRecordCard
                            record={item}
                            onView={handleViewRecord}
                            onCreateUpdate={handleCreateUpdate}
                        />
                    </View>
                )}
                ListHeaderComponent={
                    <>
                        {/* ───────── HERO ───────── */}
                        <View
                            style={{
                                paddingHorizontal: 22,
                                paddingTop: 14,
                                paddingBottom: 22,
                                position: 'relative',
                            }}
                        >
                            <View
                                pointerEvents="none"
                                style={{
                                    position: 'absolute',
                                    top: -40,
                                    right: -40,
                                    width: 220,
                                    height: 220,
                                    borderRadius: 110,
                                    backgroundColor: `${palette.EHR_PRIMARY}1F`,
                                }}
                            />
                            <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 11,
                                        color: palette.EHR_OUTLINE,
                                        letterSpacing: 1.2,
                                        textTransform: 'uppercase',
                                        fontWeight: '700',
                                    }}
                                >
                                    {formatViDateTop(today)}
                                </Text>
                                <RoleSwitcher />
                            </XStack>
                            <Text
                                style={{
                                    marginTop: 8,
                                    fontFamily: SERIF,
                                    fontSize: 32,
                                    color: palette.EHR_ON_SURFACE,
                                    letterSpacing: -0.6,
                                    lineHeight: 36,
                                }}
                            >
                                Chào,
                            </Text>
                            <XStack style={{ alignItems: 'baseline', gap: 8, marginTop: 2 }}>
                                <Text
                                    style={{
                                        fontFamily: SERIF_ITALIC,
                                        fontStyle: 'italic',
                                        fontSize: 32,
                                        color: palette.EHR_PRIMARY,
                                        letterSpacing: -0.6,
                                        lineHeight: 36,
                                    }}
                                >
                                    BS. {firstName(user?.fullName)}
                                </Text>
                                <Text
                                    style={{
                                        fontFamily: SERIF,
                                        fontSize: 24,
                                        color: palette.EHR_ON_SURFACE,
                                    }}
                                >
                                    .
                                </Text>
                            </XStack>

                            {isVerifiedDoctor === true ? (
                                <View
                                    style={{
                                        marginTop: 12,
                                        alignSelf: 'flex-start',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 999,
                                        backgroundColor: `${palette.EHR_TERTIARY}26`,
                                    }}
                                >
                                    <ShieldCheck size={12} color={palette.EHR_TERTIARY} />
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 11,
                                            color: palette.EHR_TERTIARY,
                                            letterSpacing: 0.3,
                                            fontWeight: '700',
                                        }}
                                    >
                                        Đã xác minh CCHN
                                    </Text>
                                </View>
                            ) : isVerifiedDoctor === false ? (
                                <View
                                    style={{
                                        marginTop: 12,
                                        alignSelf: 'flex-start',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 999,
                                        backgroundColor: `${palette.EHR_PRIMARY}1A`,
                                        borderWidth: 0.5,
                                        borderColor: palette.EHR_PRIMARY,
                                    }}
                                >
                                    <AlertTriangle size={12} color={palette.EHR_PRIMARY} />
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 11,
                                            color: palette.EHR_PRIMARY,
                                            fontWeight: '700',
                                            letterSpacing: 0.3,
                                        }}
                                    >
                                        Cần xác minh CCHN
                                    </Text>
                                </View>
                            ) : null}

                            <XStack
                                style={{
                                    marginTop: 12,
                                    alignItems: 'center',
                                    gap: 8,
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 10,
                                        color: palette.EHR_OUTLINE,
                                        letterSpacing: 1.2,
                                        textTransform: 'uppercase',
                                        fontWeight: '700',
                                    }}
                                >
                                    Mã bác sĩ
                                </Text>
                                <Text
                                    style={{
                                        fontFamily: 'monospace',
                                        fontSize: 12,
                                        color: palette.EHR_ON_SURFACE_VARIANT,
                                    }}
                                >
                                    {truncate(myAddr)}
                                </Text>
                            </XStack>
                        </View>

                        {/* ───────── Stats strip — inline hairline per G.5 ───────── */}
                        <View
                            style={{
                                marginHorizontal: 22,
                                marginBottom: 22,
                                borderTopWidth: 0.5,
                                borderBottomWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_VARIANT,
                            }}
                        >
                            <XStack>
                                <DocStat
                                    n={pendingClaims.length}
                                    label="Chờ nhận"
                                    accent={palette.EHR_PRIMARY}
                                />
                                <Divider />
                                <DocStat n={uniquePatients} label="Bệnh nhân" />
                                <Divider />
                                <DocStat
                                    n={sharedRecords.length}
                                    label="Hồ sơ"
                                    accent={palette.EHR_TERTIARY}
                                />
                            </XStack>
                        </View>

                        {/* ───────── Quick actions — 2x2 grid ───────── */}
                        <View style={{ paddingHorizontal: 22, marginBottom: 22 }}>
                            <XStack style={{ gap: 10, marginBottom: 10 }}>
                                <ActionTile
                                    icon={<FilePlus2 size={20} color={palette.EHR_PRIMARY} />}
                                    title="Tạo hồ sơ"
                                    sub="ghi mới cho bệnh nhân"
                                    primary
                                    onPress={() => navigation.navigate('DoctorCreateUpdate', {})}
                                />
                                <ActionTile
                                    icon={<Users size={20} color={palette.EHR_ON_SURFACE} />}
                                    title="Bệnh nhân uỷ quyền"
                                    sub="đã trao toàn quyền"
                                    onPress={() => navigation.navigate('DoctorDelegatedPatients')}
                                />
                            </XStack>
                            <XStack style={{ gap: 10 }}>
                                <ActionTile
                                    icon={<Share2 size={20} color={palette.EHR_ON_SURFACE} />}
                                    title="Đã chia sẻ lại"
                                    sub="xem + thu hồi"
                                    onPress={() => navigation.navigate('DoctorOutgoingShares')}
                                />
                                <ActionTile
                                    icon={<Siren size={20} color={palette.EHR_PRIMARY} />}
                                    title="Tra cứu cấp cứu"
                                    sub="theo CCCD bệnh nhân"
                                    warn
                                    onPress={() => navigation.navigate('EmergencyLookup')}
                                />
                            </XStack>
                        </View>

                        {/* ───────── Delegatable shortcut (legacy A→B) ───────── */}
                        <View style={{ paddingHorizontal: 22, marginBottom: 22 }}>
                            <Pressable
                                onPress={() => navigation.navigate('DoctorDelegatableRecords')}
                                style={({ pressed }) => ({
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 12,
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    borderRadius: 14,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <View
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 18,
                                        backgroundColor: `${palette.EHR_TERTIARY}26`,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Network size={18} color={palette.EHR_TERTIARY} />
                                </View>
                                <YStack style={{ flex: 1 }}>
                                    <Text
                                        style={{
                                            fontFamily: SANS_MEDIUM,
                                            fontSize: 13.5,
                                            color: palette.EHR_ON_SURFACE,
                                        }}
                                    >
                                        Hồ sơ uỷ quyền lại được
                                    </Text>
                                    <Text
                                        style={{
                                            fontFamily: SANS,
                                            fontSize: 11.5,
                                            color: palette.EHR_OUTLINE,
                                            marginTop: 2,
                                        }}
                                    >
                                        Chia sẻ lại cho bác sĩ khác (A → B)
                                    </Text>
                                </YStack>
                            </Pressable>
                        </View>

                        {/* ───────── Expired records shortcut ───────── */}
                        <View style={{ paddingHorizontal: 22, marginBottom: 22 }}>
                            <Pressable
                                onPress={() => navigation.navigate('DoctorExpiredRecords')}
                                style={({ pressed }) => ({
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 12,
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    borderRadius: 14,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <View
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 18,
                                        backgroundColor: `${palette.EHR_OUTLINE}40`,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Clock size={18} color={palette.EHR_ON_SURFACE_VARIANT} />
                                </View>
                                <YStack style={{ flex: 1 }}>
                                    <Text
                                        style={{
                                            fontFamily: SANS_MEDIUM,
                                            fontSize: 13.5,
                                            color: palette.EHR_ON_SURFACE,
                                        }}
                                    >
                                        Hồ sơ hết hạn
                                    </Text>
                                    <Text
                                        style={{
                                            fontFamily: SANS,
                                            fontSize: 11.5,
                                            color: palette.EHR_OUTLINE,
                                            marginTop: 2,
                                        }}
                                    >
                                        Xem các quyền truy cập đã hết hạn
                                    </Text>
                                </YStack>
                            </Pressable>
                        </View>

                        {/* ───────── Pending claims (cinnabar = legal action) ───────── */}
                        {pendingClaims.length > 0 ? (
                            <View style={{ marginBottom: 22 }}>
                                <ViSectionLabel trailing={`${pendingClaims.length} mới`}>
                                    Chờ nhận truy cập
                                </ViSectionLabel>
                                <View style={{ paddingHorizontal: 18, gap: 10 }}>
                                    {pendingClaims.map((claim) => {
                                        const isClaiming = claimingId === claim.requestId;
                                        const expired = isClaimExpired(claim);
                                        const timeLeft = getClaimTimeLeft(claim);
                                        if (expired) {
                                            return (
                                                <View
                                                    key={claim.requestId}
                                                    style={{
                                                        borderRadius: 14,
                                                        paddingVertical: 16,
                                                        paddingHorizontal: 18,
                                                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                                                        borderLeftWidth: 3,
                                                        borderLeftColor: palette.EHR_OUTLINE,
                                                        opacity: 0.6,
                                                    }}
                                                >
                                                    <PatientNameInline
                                                        address={claim.patientAddress}
                                                        fallback={`BN: ${truncate(claim.patientAddress)}`}
                                                        style={{
                                                            fontFamily: SANS_MEDIUM,
                                                            fontSize: 14,
                                                            color: palette.EHR_ON_SURFACE,
                                                        }}
                                                    />
                                                    <Text
                                                        style={{
                                                            marginTop: 4,
                                                            fontFamily: SANS,
                                                            fontSize: 11,
                                                            color: palette.EHR_OUTLINE,
                                                        }}
                                                    >
                                                        Yêu cầu đã hết hạn ·{' '}
                                                        {new Date(claim.createdAt).toLocaleDateString('vi-VN')}
                                                    </Text>
                                                </View>
                                            );
                                        }
                                        return (
                                            <View
                                                key={claim.requestId}
                                                style={{
                                                    borderRadius: 18,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <LinearGradient
                                                    colors={[palette.EHR_PRIMARY, palette.EHR_PRIMARY_CONTAINER]}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 1 }}
                                                    style={{ padding: 18 }}
                                                >
                                                    <XStack
                                                        style={{
                                                            justifyContent: 'space-between',
                                                            alignItems: 'flex-start',
                                                        }}
                                                    >
                                                        <YStack style={{ flex: 1 }}>
                                                            <PatientNameInline
                                                                address={claim.patientAddress}
                                                                fallback={truncate(claim.patientAddress)}
                                                                style={{
                                                                    fontFamily: SERIF_MEDIUM,
                                                                    fontSize: 17,
                                                                    color: '#FAF7F1',
                                                                    letterSpacing: -0.2,
                                                                }}
                                                            />
                                                            <Text
                                                                style={{
                                                                    marginTop: 4,
                                                                    fontFamily: SANS,
                                                                    fontSize: 11.5,
                                                                    color: 'rgba(250,247,241,0.78)',
                                                                }}
                                                            >
                                                                Ký:{' '}
                                                                {new Date(claim.createdAt).toLocaleDateString('vi-VN')}
                                                            </Text>
                                                        </YStack>
                                                        <View
                                                            style={{
                                                                flexDirection: 'row',
                                                                alignItems: 'center',
                                                                gap: 4,
                                                                backgroundColor: 'rgba(250,247,241,0.18)',
                                                                paddingHorizontal: 10,
                                                                paddingVertical: 5,
                                                                borderRadius: 999,
                                                            }}
                                                        >
                                                            <Clock size={11} color="#FAF7F1" />
                                                            <Text
                                                                style={{
                                                                    fontFamily: SANS_SEMI,
                                                                    fontSize: 11,
                                                                    color: '#FAF7F1',
                                                                    fontWeight: '700',
                                                                }}
                                                            >
                                                                {timeLeft}
                                                            </Text>
                                                        </View>
                                                    </XStack>
                                                    <Pressable
                                                        onPress={() => handleClaim(claim)}
                                                        disabled={isClaiming}
                                                        style={({ pressed }) => ({
                                                            marginTop: 16,
                                                            backgroundColor: '#FAF7F1',
                                                            borderRadius: 12,
                                                            paddingVertical: 13,
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: 8,
                                                            opacity: pressed ? 0.85 : 1,
                                                        })}
                                                    >
                                                        {isClaiming ? (
                                                            <ActivityIndicator size="small" color={palette.EHR_PRIMARY} />
                                                        ) : (
                                                            <CheckCircle size={16} color={palette.EHR_PRIMARY} />
                                                        )}
                                                        <Text
                                                            style={{
                                                                fontFamily: SANS_SEMI,
                                                                fontSize: 14,
                                                                fontWeight: '700',
                                                                color: palette.EHR_PRIMARY,
                                                            }}
                                                        >
                                                            {isClaiming ? 'Đang xác nhận (~17s)…' : 'Nhận truy cập'}
                                                        </Text>
                                                    </Pressable>
                                                </LinearGradient>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        ) : null}

                        {/* ───────── Shared records section header ───────── */}
                        <ViSectionLabel trailing={`${sharedRecords.length}`}>
                            Hồ sơ đã nhận
                        </ViSectionLabel>
                    </>
                }
                ListEmptyComponent={
                    <View style={{ paddingHorizontal: 22, paddingTop: 24, alignItems: 'center' }}>
                        <FileText size={28} color={palette.EHR_OUTLINE} />
                        <Text
                            style={{
                                marginTop: 12,
                                fontFamily: SERIF,
                                fontSize: 18,
                                color: palette.EHR_ON_SURFACE,
                                textAlign: 'center',
                            }}
                        >
                            Chưa có hồ sơ nào
                        </Text>
                        <Text
                            style={{
                                marginTop: 8,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_OUTLINE,
                                textAlign: 'center',
                                lineHeight: 19,
                                maxWidth: 260,
                            }}
                        >
                            Khi bệnh nhân chia sẻ hồ sơ cho bạn, chúng sẽ hiển thị tại đây.
                        </Text>
                    </View>
                }
                showsVerticalScrollIndicator={false}
            />
            <LiabilityConfirmModal
                visible={!!liabilityModal}
                patientLabel={liabilityModal?.data?.patientLabel || ''}
                onConfirm={() => {
                    liabilityModal?.data?.resolve?.(true);
                    setLiabilityModal(null);
                }}
                onCancel={() => {
                    liabilityModal?.data?.resolve?.(false);
                    setLiabilityModal(null);
                }}
            />
        </SafeAreaView>
    );
}

// ───────── DocStat (centered stat column inside strip) ─────────
function DocStat({ n, label, accent }: { n: number | string; label: string; accent?: string }) {
    const palette = useEhrPalette();
    // G.5 — inline cell: 14×14 padding meets 60pt min touch target.
    return (
        <YStack style={{ flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14 }}>
            <Text
                style={{
                    fontFamily: SERIF_MEDIUM,
                    fontSize: 28,
                    color: accent || palette.EHR_ON_SURFACE,
                    letterSpacing: -0.5,
                    lineHeight: 30,
                }}
            >
                {n}
            </Text>
            <Text
                style={{
                    marginTop: 6,
                    fontFamily: SANS_SEMI,
                    fontSize: 10,
                    color: palette.EHR_OUTLINE,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                }}
            >
                {label}
            </Text>
        </YStack>
    );
}

function Divider() {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                width: 0.5,
                alignSelf: 'stretch',
                backgroundColor: palette.EHR_OUTLINE_SOFT,
                marginVertical: 4,
            }}
        />
    );
}

// ───────── ActionTile (2x2 grid item) ─────────
function ActionTile({
    icon,
    title,
    sub,
    onPress,
    primary,
    warn,
}: {
    icon: React.ReactNode;
    title: string;
    sub: string;
    onPress: () => void;
    primary?: boolean;
    warn?: boolean;
}) {
    const palette = useEhrPalette();
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: 14,
                backgroundColor: primary
                    ? `${palette.EHR_PRIMARY}14`
                    : warn
                        ? `${palette.EHR_PRIMARY}0A`
                        : palette.EHR_SURFACE_LOWEST,
                borderWidth: 0.5,
                borderColor: primary || warn ? `${palette.EHR_PRIMARY}50` : palette.EHR_OUTLINE_SOFT,
                opacity: pressed ? 0.7 : 1,
                minHeight: 80,
            })}
        >
            <View
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: primary || warn ? `${palette.EHR_PRIMARY}1A` : palette.EHR_SURFACE,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                }}
            >
                {icon}
            </View>
            <Text
                style={{
                    fontFamily: SANS_SEMI,
                    fontSize: 13,
                    color: primary || warn ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE,
                    fontWeight: '600',
                }}
            >
                {title}
            </Text>
            <Text
                style={{
                    marginTop: 2,
                    fontFamily: SANS,
                    fontSize: 11,
                    color: palette.EHR_OUTLINE,
                    lineHeight: 15,
                }}
                numberOfLines={2}
            >
                {sub}
            </Text>
        </Pressable>
    );
}

