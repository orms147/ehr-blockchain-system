import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';
import { ArrowLeft, Clock, Hospital, Siren, User } from 'lucide-react-native';

import emergencyService from '../../services/emergency.service';
import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import useAuthStore from '../../store/authStore';
import {
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../../constants/uiColors';

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

const formatDateTime = (s?: string | null) => {
    if (!s) return '';
    try {
        return new Date(s).toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return s;
    }
};

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

export default function DoctorActiveEmergenciesScreen({ navigation }: any) {
    const { token } = useAuthStore();
    const [items, setItems] = useState<EmergencyItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const data = await emergencyService.getActiveEmergencies();
            setItems(data?.emergencies || []);
        } catch (err: any) {
            console.warn('Failed to fetch active emergencies', err?.message || err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchData();
    }, [token, fetchData]);

    const handleRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    if (loading && !refreshing) return <LoadingSpinner message="Đang tải quyền khẩn cấp..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <XStack style={s.header}>
                <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
                    <ArrowLeft size={20} color={EHR_ON_SURFACE} />
                </Pressable>
                <YStack style={{ flex: 1, marginLeft: 8 }}>
                    <Text fontSize="$6" fontWeight="800" color="$color12">Quyền khẩn cấp của tôi</Text>
                    <Text fontSize="$2" color="$color10">Các bệnh nhân tôi đang có quyền truy cập 24h</Text>
                </YStack>
            </XStack>

            {items.length === 0 ? (
                <EmptyState
                    icon={Siren}
                    title="Không có quyền khẩn cấp"
                    description="Khi bạn tạo yêu cầu truy cập khẩn cấp, các quyền đang hoạt động sẽ hiển thị tại đây."
                />
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[EHR_PRIMARY]} />}
                    renderItem={({ item }) => {
                        const remaining = remainingHours(item.expiresAt);
                        return (
                            <View style={s.card}>
                                <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <XStack style={{ alignItems: 'center', flex: 1 }}>
                                        <View style={s.iconWrap}>
                                            <User size={16} color="#B91C1C" />
                                        </View>
                                        <YStack style={{ flex: 1 }}>
                                            <Text fontSize="$3" fontWeight="800" color="$color12">{truncateAddr(item.patientAddress)}</Text>
                                            <Text fontSize="$2" color="$color10">{TYPE_LABELS[item.emergencyType] || item.emergencyType}</Text>
                                        </YStack>
                                    </XStack>
                                    <View style={s.timeBadge}>
                                        <Text fontSize="$1" fontWeight="800" style={{ color: '#B91C1C' }}>
                                            ~{remaining}h
                                        </Text>
                                    </View>
                                </XStack>

                                <View style={s.reasonBlock}>
                                    <Text fontSize="$2" color="$color10" style={{ marginBottom: 4 }}>Lý do</Text>
                                    <Text fontSize="$3" color="$color12">{item.reason}</Text>
                                </View>

                                {item.location ? (
                                    <XStack style={{ alignItems: 'center', marginTop: 8 }}>
                                        <Hospital size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                                        <Text fontSize="$2" color="$color10">{item.location}</Text>
                                    </XStack>
                                ) : null}

                                <XStack style={{ alignItems: 'center', marginTop: 8 }}>
                                    <Clock size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 6 }} />
                                    <Text fontSize="$2" color="$color10">Hết hạn: {formatDateTime(item.expiresAt)}</Text>
                                </XStack>
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
    timeBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: '#FEE2E2',
    },
    reasonBlock: {
        backgroundColor: EHR_SURFACE_LOW,
        borderRadius: 10,
        padding: 10,
    },
});
