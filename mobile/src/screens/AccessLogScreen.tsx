import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Shield, User, FileText, Clock, XCircle } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import consentService from '../services/consent.service';
import useAuthStore from '../store/authStore';
import {
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
} from '../constants/uiColors';

type ConsentItem = {
    id?: string;
    cidHash?: string;
    createdAt?: string;
    status?: string;
    active?: boolean;
    granteeAddress?: string;
    recipientAddress?: string;
};

const truncateAddr = (addr?: string) => (addr ? `${addr.substring(0, 10)}...${addr.slice(-6)}` : '???');

const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dateStr;
    }
};

const ConsentRenderItem = React.memo(({
    item,
    revokingId,
    onRevoke,
}: {
    item: ConsentItem;
    revokingId: string | null;
    onRevoke: (c: ConsentItem) => void;
}) => {
    const grantee = item.granteeAddress || item.recipientAddress;
    const consentId = item.id || item.cidHash || '';
    const isActive = item.active !== false && item.status !== 'revoked';
    const isRevoking = revokingId === consentId;

    return (
        <View
            style={{
                backgroundColor: '#FFFFFF',
                borderColor: isActive ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                borderWidth: 1,
                borderRadius: 20,
                padding: 14,
                marginBottom: 12,
            }}
        >
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <YStack style={{ flex: 1, paddingRight: 12 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <User size={14} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                        <Text fontSize="$4" fontWeight="700" color="$color12">{truncateAddr(grantee)}</Text>
                    </XStack>
                    {item.cidHash ? (
                        <XStack style={{ alignItems: 'center' }}>
                            <FileText size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                            <Text fontSize="$2" color="$color10" numberOfLines={1}>{item.cidHash.substring(0, 20)}...</Text>
                        </XStack>
                    ) : null}
                </YStack>

                <View style={{ backgroundColor: isActive ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <Text fontSize="$2" fontWeight="700" style={{ color: isActive ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}>
                        {isActive ? 'Đang hoạt động' : 'Đã thu hồi'}
                    </Text>
                </View>
            </XStack>

            {item.createdAt ? (
                <XStack style={{ alignItems: 'center', marginBottom: isActive ? 10 : 0 }}>
                    <Clock size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 4 }} />
                    <Text fontSize="$2" color="$color9">Cập nhật: {formatDate(item.createdAt)}</Text>
                </XStack>
            ) : null}

            {isActive ? (
                <Button
                    size="$3"
                    variant="outlined"
                    borderColor="$red6"
                    pressStyle={{ background: '$red3' }}
                    icon={<XCircle size={15} color="#DC2626" />}
                    onPress={() => onRevoke(item)}
                    disabled={isRevoking}
                    opacity={isRevoking ? 0.5 : 1}
                >
                    <Text color="$red10" fontWeight="500">{isRevoking ? 'Đang thu hồi...' : 'Thu hồi quyền'}</Text>
                </Button>
            ) : null}
        </View>
    );
});

export default function AccessLogScreen() {
    const { token } = useAuthStore();
    const [consents, setConsents] = useState<ConsentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const fetchConsents = useCallback(async () => {
        try {
            const data = await consentService.getMyGrantedConsents();
            const list = Array.isArray(data) ? data : data?.consents || [];
            setConsents(list);
        } catch (err) {
            console.error('Failed to fetch consents:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchConsents();
    }, [token, fetchConsents]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchConsents();
    }, [fetchConsents]);

    const handleRevoke = useCallback((consent: ConsentItem) => {
        Alert.alert('Thu hồi quyền truy cập', 'Bạn có chắc muốn thu hồi quyền xem hồ sơ của địa chỉ này?', [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Thu hồi',
                style: 'destructive',
                onPress: async () => {
                    const id = consent.id || consent.cidHash || '';
                    setRevokingId(id);
                    try {
                        await consentService.revokeConsent(consent, consent.cidHash);
                        Alert.alert('Thành công', 'Đã thu hồi quyền truy cập.');
                        fetchConsents();
                    } catch (e: any) {
                        Alert.alert('Lỗi', e?.message || 'Không thể thu hồi. Vui lòng thử lại.');
                    } finally {
                        setRevokingId(null);
                    }
                },
            },
        ]);
    }, [fetchConsents]);

    if (isLoading && !isRefreshing) return <LoadingSpinner message="Đang tải nhật ký truy cập..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['right', 'left']}>
            <YStack style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                <Text fontSize="$7" fontWeight="800" color="$color12">Nhật ký truy cập</Text>
                <Text fontSize="$3" color="$color10" style={{ marginTop: 2 }}>
                    Quản lý các quyền đã chia sẻ cho bác sĩ
                </Text>
            </YStack>
            {consents.length === 0 ? (
                <EmptyState
                    icon={Shield}
                    title="Chưa có quyền truy cập"
                    description="Khi bạn chia sẻ hồ sơ cho bác sĩ, danh sách quyền sẽ hiển thị tại đây."
                />
            ) : (
                <FlatList
                    data={consents}
                    keyExtractor={(item, idx) => item.id || item.cidHash || `consent-${idx}`}
                    renderItem={({ item }) => <ConsentRenderItem item={item} revokingId={revokingId} onRevoke={handleRevoke} />}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[EHR_PRIMARY]} />}
                    ListHeaderComponent={
                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Text fontSize="$3" color="$color10">{consents.length} quyền truy cập</Text>
                            <Text fontSize="$3" fontWeight="700" style={{ color: EHR_PRIMARY }}>
                                {consents.filter((c) => c.active !== false && c.status !== 'revoked').length} đang hoạt động
                            </Text>
                        </XStack>
                    }
                />
            )}
        </SafeAreaView>
    );
}





