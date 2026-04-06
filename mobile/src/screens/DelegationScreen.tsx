import React, { useState } from 'react';
import { FlatList, RefreshControl, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserPlus, Users, XCircle, Shield, Info } from 'lucide-react-native';
import { YStack, XStack, Text, View } from 'tamagui';

import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import { useMyDelegates, useRevokeDelegation } from '../hooks/queries/useDelegations';
import {
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
    EHR_SECONDARY,
    EHR_SECONDARY_CONTAINER,
} from '../constants/uiColors';

type DelegationItem = {
    id: string;
    patientAddress: string;
    delegateAddress: string;
    delegationType?: string;
    status?: string;
    createdAt?: string;
};

const truncateAddr = (addr?: string) =>
    addr ? `${addr.substring(0, 8)}...${addr.slice(-6)}` : '???';

const formatDate = (s?: string) => {
    if (!s) return '';
    try {
        return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return s;
    }
};

const DelegationCard = React.memo(({
    item,
    revoking,
    onRevoke,
}: {
    item: DelegationItem;
    revoking: boolean;
    onRevoke: (item: DelegationItem) => void;
}) => (
    <View
        style={{
            backgroundColor: EHR_SURFACE_LOWEST,
            borderColor: EHR_OUTLINE_VARIANT,
            borderWidth: 1,
            borderRadius: 20,
            padding: 16,
            marginBottom: 12,
        }}
    >
        <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <YStack style={{ flex: 1, paddingRight: 12 }}>
                <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                    <Shield size={14} color={EHR_PRIMARY} style={{ marginRight: 6 }} />
                    <Text fontSize="$4" fontWeight="700" color="$color12">
                        {truncateAddr(item.delegateAddress)}
                    </Text>
                </XStack>
                <Text fontSize="$2" color="$color10">
                    {item.delegationType === 'full' ? 'Toàn quyền' : item.delegationType || 'Ủy quyền'}
                </Text>
                {item.createdAt ? (
                    <Text fontSize="$1" color="$color9" marginTop="$1">
                        Tạo: {formatDate(item.createdAt)}
                    </Text>
                ) : null}
            </YStack>

            <View
                style={{
                    backgroundColor: EHR_PRIMARY_FIXED,
                    borderRadius: 10,
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                }}
            >
                <Text fontSize="$1" fontWeight="700" color={EHR_PRIMARY}>
                    HOẠT ĐỘNG
                </Text>
            </View>
        </XStack>

        <Pressable
            onPress={() => onRevoke(item)}
            disabled={revoking}
            style={{
                backgroundColor: revoking ? EHR_SURFACE_LOW : EHR_SECONDARY_CONTAINER,
                borderRadius: 12,
                paddingVertical: 10,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                marginTop: 4,
            }}
        >
            <XCircle size={16} color={EHR_SECONDARY} style={{ marginRight: 6 }} />
            <Text fontSize="$3" fontWeight="600" color={EHR_SECONDARY}>
                {revoking ? 'Đang thu hồi...' : 'Thu hồi ủy quyền'}
            </Text>
        </Pressable>
    </View>
));

export default function DelegationScreen() {
    const { data: delegations, isLoading, isFetching, refetch } = useMyDelegates();
    const revokeMutation = useRevokeDelegation();
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const handleRevoke = (item: DelegationItem) => {
        Alert.alert(
            'Thu hồi ủy quyền',
            `Bạn chắc chắn muốn thu hồi quyền của ${truncateAddr(item.delegateAddress)}?`,
            [
                { text: 'Huỷ', style: 'cancel' },
                {
                    text: 'Thu hồi',
                    style: 'destructive',
                    onPress: async () => {
                        setRevokingId(item.id);
                        try {
                            await revokeMutation.mutateAsync(item.id);
                            Alert.alert('Đã thu hồi', 'Ủy quyền đã được thu hồi thành công.');
                        } catch (err: any) {
                            Alert.alert('Lỗi', err?.message || 'Không thể thu hồi ủy quyền.');
                        } finally {
                            setRevokingId(null);
                        }
                    },
                },
            ]
        );
    };

    if (isLoading) {
        return <LoadingSpinner message="Đang tải danh sách ủy quyền..." />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <YStack style={{ padding: 20, paddingBottom: 12 }}>
                <Text fontSize={26} fontWeight="800" color={EHR_ON_SURFACE} letterSpacing={-0.5}>
                    Ủy quyền
                </Text>
                <Text fontSize="$3" color={EHR_ON_SURFACE_VARIANT} marginTop="$1">
                    Quản lý người được phép truy cập hồ sơ thay bạn (gia đình, người thân).
                </Text>
            </YStack>

            <View
                style={{
                    marginHorizontal: 20,
                    marginBottom: 12,
                    backgroundColor: EHR_SECONDARY_CONTAINER,
                    borderRadius: 16,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                }}
            >
                <Info size={16} color={EHR_SECONDARY} style={{ marginRight: 8, marginTop: 2 }} />
                <Text fontSize="$2" color={EHR_SECONDARY} flex={1} lineHeight={18}>
                    Việc tạo ủy quyền mới yêu cầu giao dịch on-chain với ví. Tính năng này sẽ
                    được bổ sung trong bản cập nhật tiếp theo.
                </Text>
            </View>

            <FlatList
                data={(delegations || []) as DelegationItem[]}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isFetching && !isLoading}
                        onRefresh={() => refetch()}
                        tintColor={EHR_PRIMARY}
                    />
                }
                ListEmptyComponent={
                    <View style={{ paddingTop: 40 }}>
                        <EmptyState
                            icon={Users}
                            title="Chưa có ủy quyền nào"
                            description="Bạn chưa ủy quyền cho ai truy cập hồ sơ y tế."
                        />
                    </View>
                }
                renderItem={({ item }) => (
                    <DelegationCard
                        item={item}
                        revoking={revokingId === item.id}
                        onRevoke={handleRevoke}
                    />
                )}
            />
        </SafeAreaView>
    );
}
