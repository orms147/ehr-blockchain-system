import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';
import {
    AlertTriangle,
    ArrowLeft,
    Clock,
    Hospital,
    Siren,
    Stethoscope,
    XCircle,
} from 'lucide-react-native';

import emergencyService from '../services/emergency.service';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import useAuthStore from '../store/authStore';
import {
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';
import { formatDateTime as formatDateTimeShared, formatExpiry } from '../utils/dateFormatting';

type EmergencyItem = {
    id: string;
    doctorAddress: string;
    patientAddress: string;
    cidHash: string | null;
    reason: string;
    emergencyType: string;
    location: string | null;
    status: string;
    expiresAt: string;
    createdAt: string;
};

const truncateAddr = (addr?: string | null) =>
    addr ? `${addr.substring(0, 8)}...${addr.slice(-6)}` : '???';

const formatDateTime = (s?: string | null) => formatDateTimeShared(s);

const remainingHours = (expiresAt?: string) => {
    if (!expiresAt) return 0;
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60)));
};

const TYPE_LABELS: Record<string, string> = {
    medical: 'Y tế',
    accident: 'Tai nạn',
    critical: 'Nguy kịch',
};

export default function EmergencyAccessLogScreen({ navigation }: any) {
    const { user, token } = useAuthStore();
    const [items, setItems] = useState<EmergencyItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const myAddress = (user?.walletAddress || user?.address || '').toLowerCase();

    const fetchData = useCallback(async () => {
        if (!myAddress) {
            setLoading(false);
            return;
        }
        try {
            const data = await emergencyService.getPatientEmergencies(myAddress);
            const list = data?.emergencies || [];
            setItems(list);
        } catch (err: any) {
            console.warn('Failed to fetch emergencies', err?.message || err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [myAddress]);

    useEffect(() => {
        if (token) fetchData();
    }, [token, fetchData]);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    const handleRevoke = useCallback((item: EmergencyItem) => {
        Alert.alert(
            'Thu hồi quyền khẩn cấp',
            `Thu hồi quyền truy cập của bác sĩ ${truncateAddr(item.doctorAddress)}?`,
            [
                { text: 'Huỷ', style: 'cancel' },
                {
                    text: 'Thu hồi',
                    style: 'destructive',
                    onPress: async () => {
                        setRevokingId(item.id);
                        try {
                            await emergencyService.revokeEmergency(item.id);
                            Alert.alert('Đã thu hồi', 'Quyền khẩn cấp đã bị thu hồi.');
                            fetchData();
                        } catch (err: any) {
                            Alert.alert('Lỗi', err?.data?.error || err?.message || 'Không thể thu hồi.');
                        } finally {
                            setRevokingId(null);
                        }
                    },
                },
            ],
        );
    }, [fetchData]);

    if (loading && !refreshing) return <LoadingSpinner message="Đang tải quyền khẩn cấp..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <XStack style={s.header}>
                <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
                    <ArrowLeft size={20} color={EHR_ON_SURFACE} />
                </Pressable>
                <YStack style={{ flex: 1, marginLeft: 8 }}>
                    <Text fontSize="$6" fontWeight="800" color="$color12">Quyền khẩn cấp</Text>
                    <Text fontSize="$2" color="$color10">Bác sĩ có quyền 24h vào hồ sơ của bạn</Text>
                </YStack>
            </XStack>

            {items.length === 0 ? (
                <EmptyState
                    icon={Siren}
                    title="Chưa có quyền khẩn cấp"
                    description="Khi bác sĩ tạo quyền truy cập khẩn cấp vào hồ sơ của bạn, danh sách sẽ hiển thị tại đây."
                />
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[EHR_PRIMARY]} />}
                    renderItem={({ item }) => {
                        const isActive = item.status === 'active' && new Date(item.expiresAt).getTime() > Date.now();
                        const isRevoked = item.status === 'revoked';
                        const expired = !isActive && !isRevoked;
                        const remaining = remainingHours(item.expiresAt);
                        const isRevoking = revokingId === item.id;
                        return (
                            <View style={[s.card, !isActive && { opacity: 0.7 }]}>
                                {/* Header row */}
                                <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <XStack style={{ alignItems: 'center', flex: 1 }}>
                                        <View style={s.iconWrap}>
                                            <AlertTriangle size={16} color="#B91C1C" />
                                        </View>
                                        <YStack style={{ flex: 1 }}>
                                            <Text fontSize="$3" fontWeight="800" color="$color12">
                                                {TYPE_LABELS[item.emergencyType] || item.emergencyType}
                                            </Text>
                                            <XStack style={{ alignItems: 'center', marginTop: 2 }}>
                                                <Stethoscope size={11} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 4 }} />
                                                <Text fontSize="$2" color="$color10">{truncateAddr(item.doctorAddress)}</Text>
                                            </XStack>
                                        </YStack>
                                    </XStack>
                                    <View
                                        style={[
                                            s.statusBadge,
                                            {
                                                backgroundColor: isActive ? '#FEE2E2' : EHR_SURFACE_LOW,
                                            },
                                        ]}
                                    >
                                        <Text
                                            fontSize="$1"
                                            fontWeight="800"
                                            style={{ color: isActive ? '#B91C1C' : EHR_ON_SURFACE_VARIANT }}
                                        >
                                            {isRevoked ? 'ĐÃ THU HỒI' : expired ? 'HẾT HẠN' : 'ĐANG HOẠT ĐỘNG'}
                                        </Text>
                                    </View>
                                </XStack>

                                {/* Reason */}
                                <View style={s.reasonBlock}>
                                    <Text fontSize="$2" color="$color10" style={{ marginBottom: 4 }}>Lý do</Text>
                                    <Text fontSize="$3" color="$color12">{item.reason}</Text>
                                </View>

                                {/* Location */}
                                {item.location ? (
                                    <XStack style={{ alignItems: 'center', marginTop: 8 }}>
                                        <Hospital size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                                        <Text fontSize="$2" color="$color10">{item.location}</Text>
                                    </XStack>
                                ) : null}

                                {/* Time */}
                                <XStack style={{ alignItems: 'center', marginTop: 8 }}>
                                    <Clock size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                                    <Text fontSize="$2" color="$color10">
                                        Tạo: {formatDateTime(item.createdAt)}
                                    </Text>
                                </XStack>
                                {isActive ? (
                                    <Text fontSize="$2" fontWeight="700" style={{ color: '#B91C1C', marginTop: 4 }}>
                                        Còn ~{remaining} giờ
                                    </Text>
                                ) : (
                                    <Text fontSize="$2" color="$color9" style={{ marginTop: 4 }}>
                                        Hết hạn: {formatExpiry(item.expiresAt)}
                                    </Text>
                                )}

                                {/* Revoke button */}
                                {isActive ? (
                                    <Pressable
                                        onPress={() => handleRevoke(item)}
                                        disabled={isRevoking}
                                        style={[s.revokeBtn, isRevoking && { opacity: 0.5 }]}
                                    >
                                        <XCircle size={14} color="#DC2626" />
                                        <Text fontSize="$3" fontWeight="700" style={{ color: '#DC2626', marginLeft: 6 }}>
                                            {isRevoking ? 'Đang thu hồi...' : 'Thu hồi sớm'}
                                        </Text>
                                    </Pressable>
                                ) : null}
                            </View>
                        );
                    }}
                />
            )}
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    header: {
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: EHR_OUTLINE_VARIANT,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: EHR_SURFACE_LOW,
        alignItems: 'center',
        justifyContent: 'center',
    },
    card: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderColor: EHR_OUTLINE_VARIANT,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
    },
    iconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
    },
    reasonBlock: {
        backgroundColor: EHR_SURFACE_LOW,
        borderRadius: 10,
        padding: 10,
        marginTop: 4,
    },
    revokeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: '#FCA5A5',
        backgroundColor: '#FEF2F2',
    },
});
