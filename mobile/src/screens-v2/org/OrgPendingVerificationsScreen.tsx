// OrgPendingVerificationsScreen v2 — port from screens/org. Approve/reject
// doctor CCHN verification. On approve → on-chain verifyDoctor call (biometric
// gated). Wiring preserved bit-for-bit.

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Clock, Check, X, Award } from 'lucide-react-native';

import LoadingSpinner from '../../components/LoadingSpinner';
import orgService from '../../services/org.service';
import verificationService from '../../services/verification.service';
import useAuthStore from '../../store/authStore';
import walletActionService from '../../services/walletAction.service';
import { ACCESS_CONTROL_ABI } from '../../abi/contractABI';
import ViCard from '../../components-v2/ViCard';
import ViButton from '../../components-v2/ViButton';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const ACCESS_CONTROL_ADDRESS = process.env.EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS as `0x${string}`;

type PendingItem = {
    id: string;
    fullName?: string;
    doctorAddress?: string;
    address?: string;
    walletAddress?: string;
    specialty?: string;
    requestedAt?: string;
    createdAt?: string;
};

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???');

function PendingRow({
    item,
    processing,
    onApprove,
    onReject,
}: {
    item: PendingItem;
    processing: boolean;
    onApprove: (i: PendingItem) => void;
    onReject: (i: PendingItem) => void;
}) {
    const palette = useEhrPalette();
    return (
        <ViCard padding={14} style={{ marginBottom: 10 }}>
            <XStack style={{ alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <View
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: `${palette.EHR_WARNING}1A`,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Clock size={18} color={palette.EHR_WARNING} />
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
                        {item.fullName || 'Bác sĩ'}
                    </Text>
                    {item.specialty ? (
                        <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_OUTLINE, marginTop: 2 }}>
                            {item.specialty}
                        </Text>
                    ) : null}
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: palette.EHR_OUTLINE, marginTop: 3 }}>
                        {truncate(item.doctorAddress || item.address || item.walletAddress)}
                    </Text>
                    <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE, marginTop: 3 }}>
                        Yêu cầu: {new Date(item.requestedAt || item.createdAt || Date.now()).toLocaleDateString('vi-VN')}
                    </Text>
                </YStack>
            </XStack>
            <XStack style={{ gap: 8 }}>
                <View style={{ flex: 1 }}>
                    <ViButton
                        variant="ghost"
                        full
                        size="sm"
                        onPress={() => onReject(item)}
                        disabled={processing}
                        leftIcon={<X size={14} color={palette.EHR_OUTLINE} />}
                    >
                        Từ chối
                    </ViButton>
                </View>
                <View style={{ flex: 1 }}>
                    <ViButton
                        variant="cinnabar"
                        full
                        size="sm"
                        loading={processing}
                        onPress={() => onApprove(item)}
                        leftIcon={processing ? undefined : <Check size={14} color="#FAF7F1" />}
                    >
                        Xác thực
                    </ViButton>
                </View>
            </XStack>
        </ViCard>
    );
}

export default function OrgPendingVerificationsScreen() {
    const palette = useEhrPalette();
    const { token } = useAuthStore();
    const [pending, setPending] = useState<PendingItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const orgRes = await orgService.getMyOrg();
            if (orgRes?.hasOrg && orgRes.organization) {
                const pendingRes = await verificationService.getPendingVerifications();
                const list = Array.isArray(pendingRes) ? pendingRes : pendingRes?.requests || [];
                setPending(list);
            } else {
                setPending([]);
            }
        } catch (err) {
            console.error('Failed to fetch pending verifications:', err);
            setPending([]);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchData();
    }, [token, fetchData]);

    const handleApprove = useCallback((item: PendingItem) => {
        Alert.alert('Xác thực bác sĩ', `Bạn có muốn xác thực "${item.fullName || item.doctorAddress}"?`, [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Xác thực',
                onPress: async () => {
                    setProcessingId(item.id);
                    try {
                        const res: any = await verificationService.approveVerification(item.id);
                        const contractCall = res?.contractCall;
                        if (!contractCall?.args?.[0]) {
                            Alert.alert('Thành công (off-chain)', 'Đã duyệt nhưng không có dữ liệu on-chain.');
                            fetchData();
                            return;
                        }
                        if (!ACCESS_CONTROL_ADDRESS) {
                            Alert.alert('Thiếu cấu hình', 'EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS chưa được đặt.');
                            return;
                        }
                        const { walletClient, account } = await walletActionService.getWalletContext();
                        const { gateOrThrow } = await import('../../utils/biometricGate');
                        await gateOrThrow('Để xác thực bác sĩ on-chain');
                        const [doctorAddr, credential] = contractCall.args;
                        const txHash = await walletClient.writeContract({
                            account,
                            address: ACCESS_CONTROL_ADDRESS,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'verifyDoctor',
                            args: [doctorAddr, credential || 'VERIFIED'],
                        });
                        Alert.alert('Thành công', `Đã xác thực on-chain.\nTx: ${String(txHash).slice(0, 14)}…`);
                        fetchData();
                    } catch (e: any) {
                        const msg = String(e?.message || '');
                        if (msg.includes('NotAuthorized') || msg.includes('NotVerifiedOrg')) {
                            Alert.alert(
                                'Không có quyền on-chain',
                                'Ví này không phải admin tổ chức đã được xác minh.',
                            );
                        } else if (msg.includes('insufficient funds')) {
                            Alert.alert('Không đủ ETH', 'Ví của bạn không đủ ETH để trả phí giao dịch.');
                        } else {
                            Alert.alert('Lỗi', msg || 'Không thể xác thực bác sĩ.');
                        }
                    } finally {
                        setProcessingId(null);
                    }
                },
            },
        ]);
    }, [fetchData]);

    const handleReject = useCallback((item: PendingItem) => {
        Alert.alert('Từ chối xác thực', `Bạn có muốn từ chối "${item.fullName || item.doctorAddress}"?`, [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Từ chối',
                style: 'destructive',
                onPress: async () => {
                    setProcessingId(item.id);
                    try {
                        await verificationService.rejectVerification(item.id, 'Từ chối qua Mobile');
                        Alert.alert('Đã từ chối', 'Yêu cầu xác thực đã bị từ chối.');
                        fetchData();
                    } catch {
                        Alert.alert('Lỗi', 'Không thể từ chối.');
                    } finally {
                        setProcessingId(null);
                    }
                },
            },
        ]);
    }, [fetchData]);

    if (isLoading && !isRefreshing) return <LoadingSpinner message="Đang tải yêu cầu xác thực..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 }}>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 26,
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.4,
                        lineHeight: 30,
                    }}
                >
                    Chờ xác thực
                </Text>
                <Text
                    style={{
                        marginTop: 4,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                    }}
                >
                    {pending.length} yêu cầu CCHN — duyệt hoặc từ chối.
                </Text>
            </View>

            {pending.length === 0 ? (
                <View style={{ paddingHorizontal: 22, paddingTop: 30, alignItems: 'center' }}>
                    <Award size={28} color={palette.EHR_OUTLINE} />
                    <Text
                        style={{
                            marginTop: 12,
                            fontFamily: SERIF,
                            fontSize: 18,
                            color: palette.EHR_ON_SURFACE,
                            textAlign: 'center',
                        }}
                    >
                        Không có yêu cầu xác thực
                    </Text>
                    <Text
                        style={{
                            marginTop: 8,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: palette.EHR_OUTLINE,
                            textAlign: 'center',
                            maxWidth: 280,
                            lineHeight: 19,
                        }}
                    >
                        Khi bác sĩ yêu cầu xác thực trong tổ chức, họ sẽ hiển thị tại đây.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={pending}
                    keyExtractor={(item, idx) => item.id?.toString() || item.doctorAddress || idx.toString()}
                    renderItem={({ item }) => (
                        <PendingRow
                            item={item}
                            processing={processingId === item.id}
                            onApprove={handleApprove}
                            onReject={handleReject}
                        />
                    )}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={fetchData}
                            tintColor={palette.EHR_ON_SURFACE_VARIANT}
                        />
                    }
                />
            )}
        </SafeAreaView>
    );
}

