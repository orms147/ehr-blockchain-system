import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, Check, X, Award } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import orgService from '../../services/org.service';
import verificationService from '../../services/verification.service';
import useAuthStore from '../../store/authStore';
import walletActionService from '../../services/walletAction.service';
import { ACCESS_CONTROL_ABI } from '../../abi/contractABI';

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

const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 10)}...${addr.slice(-6)}` : '???');

const PendingVerificationItem = React.memo(({
    item,
    processingId,
    onApprove,
    onReject,
}: {
    item: PendingItem;
    processingId: string | null;
    onApprove: (i: PendingItem) => void;
    onReject: (i: PendingItem) => void;
}) => {
    const isProcessing = processingId === item.id;

    return (
        <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <XStack style={{ alignItems: 'center', marginBottom: 12 }}>
                <View background="$color3" style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={22} color="#475569" />
                </View>
                <YStack style={{ flex: 1 }}>
                    <Text fontSize="$4" fontWeight="700" color="$color12">{item.fullName || 'Bác sĩ'}</Text>
                    {item.specialty ? <Text fontSize="$3" color="$color10">{item.specialty}</Text> : null}
                    <Text fontSize="$2" color="$color9" style={{ marginTop: 4 }}>
                        {truncateAddr(item.doctorAddress || item.address || item.walletAddress)}
                    </Text>
                    <Text fontSize="$2" color="$color9" style={{ marginTop: 4 }}>
                        Yêu cầu: {new Date(item.requestedAt || item.createdAt || Date.now()).toLocaleDateString('vi-VN')}
                    </Text>
                </YStack>
            </XStack>

            <XStack style={{ gap: 8 }}>
                <Button
                    flex={1}
                    background="$green9"
                    pressStyle={{ background: '$green10' }}
                    icon={<Check size={16} color="white" />}
                    onPress={() => onApprove(item)}
                    disabled={isProcessing}
                    opacity={isProcessing ? 0.5 : 1}
                >
                    <Text color="white" fontWeight="700">Xác thực</Text>
                </Button>
                <Button
                    flex={1}
                    variant="outlined"
                    borderColor="$red6"
                    pressStyle={{ background: '$red3' }}
                    icon={<X size={16} color="#DC2626" />}
                    onPress={() => onReject(item)}
                    disabled={isProcessing}
                    opacity={isProcessing ? 0.5 : 1}
                >
                    <Text color="$red10" fontWeight="700">Từ chối</Text>
                </Button>
            </XStack>
        </View>
    );
});

export default function OrgPendingVerificationsScreen() {
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

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchData();
    }, [fetchData]);

    const handleApprove = useCallback((item: PendingItem) => {
        Alert.alert('Xác thực bác sĩ', `Bạn có muốn xác thực "${item.fullName || item.doctorAddress}"?`, [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Xác thực',
                onPress: async () => {
                    setProcessingId(item.id);
                    try {
                        // 1. Flip the off-chain request to approved and get the
                        //    on-chain call args back from backend.
                        const res: any = await verificationService.approveVerification(item.id);
                        const contractCall = res?.contractCall;
                        if (!contractCall?.args?.[0]) {
                            Alert.alert('Thành công (off-chain)', 'Đã duyệt nhưng không có dữ liệu on-chain.');
                            fetchData();
                            return;
                        }

                        // 2. Submit verifyDoctor on-chain so ConsentLedger.canAccess
                        //    returns true for this doctor on subsequent key-share requests.
                        if (!ACCESS_CONTROL_ADDRESS) {
                            Alert.alert('Thiếu cấu hình', 'EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS chưa được đặt trong env.');
                            return;
                        }
                        const { walletClient, account } = await walletActionService.getWalletContext();
                        const [doctorAddr, credential] = contractCall.args;
                        const txHash = await walletClient.writeContract({
                            account,
                            address: ACCESS_CONTROL_ADDRESS,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'verifyDoctor',
                            args: [doctorAddr, credential || 'VERIFIED'],
                        });
                        Alert.alert('Thành công', `Đã xác thực on-chain.\nTx: ${String(txHash).substring(0, 12)}...`);
                        fetchData();
                    } catch (e: any) {
                        const msg = String(e?.message || '');
                        if (msg.includes('NotAuthorized') || msg.includes('NotVerifiedOrg')) {
                            Alert.alert('Không có quyền on-chain', 'Ví này không phải admin tổ chức đã được xác minh. Kiểm tra lại tổ chức của bạn.');
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
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAF3' }} edges={['right', 'left']}>
            <YStack style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                <Text fontSize="$7" fontWeight="800" color="$color12">Chờ xác thực</Text>
                <Text fontSize="$3" color="$color10" style={{ marginTop: 2 }}>
                    Duyệt hoặc từ chối yêu cầu xác thực bác sĩ
                </Text>
            </YStack>
            {pending.length === 0 ? (
                <EmptyState
                    icon={Award}
                    title="Không có yêu cầu xác thực"
                    description="Khi bác sĩ yêu cầu xác thực trong tổ chức, họ sẽ hiển thị tại đây."
                />
            ) : (
                <FlatList
                    data={pending}
                    keyExtractor={(item, idx) => item.id?.toString() || item.doctorAddress || idx.toString()}
                    renderItem={({ item }) => (
                        <PendingVerificationItem
                            item={item}
                            processingId={processingId}
                            onApprove={handleApprove}
                            onReject={handleReject}
                        />
                    )}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={['#7c3aed']} />}
                    ListHeaderComponent={<Text fontSize="$3" color="$color10" style={{ marginBottom: 12 }}>{pending.length} yêu cầu đang chờ</Text>}
                />
            )}
        </SafeAreaView>
    );
}








