// DoctorExpiredRecordsScreen v2 — list of expired/revoked KeyShares for
// doctor. Read-only view; doctor sees what access they no longer have.
//
// Wiring: keyShareService.getReceivedKeys filter active=false.

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Clock, User, FileText, ShieldOff } from 'lucide-react-native';

import LoadingSpinner from '../../components/LoadingSpinner';
import useAuthStore from '../../store/authStore';
import keyShareService from '../../services/keyShare.service';
import ViCard from '../../components-v2/ViCard';
import { formatDate, formatExpiry } from '../../utils/dateFormatting';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type ExpiredItem = {
    id?: string;
    cidHash?: string;
    createdAt?: string;
    expiresAt?: string;
    senderAddress?: string;
    active?: boolean;
    record?: { ownerAddress?: string };
};

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???');

function ExpiredRow({ item }: { item: ExpiredItem }) {
    const palette = useEhrPalette();
    const ownerAddr = item.record?.ownerAddress || item.senderAddress;
    return (
        <ViCard padding={14} style={{ marginBottom: 10, opacity: 0.75 }}>
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                <YStack style={{ flex: 1, paddingRight: 10 }}>
                    <XStack style={{ alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <User size={13} color={palette.EHR_TEXT_MUTED} />
                        <Text
                            style={{
                                fontFamily: 'monospace',
                                fontSize: 12,
                                color: palette.EHR_TEXT_MUTED,
                            }}
                        >
                            BN: {truncate(ownerAddr)}
                        </Text>
                    </XStack>
                    {item.cidHash ? (
                        <XStack style={{ alignItems: 'center', gap: 6 }}>
                            <FileText size={11} color={palette.EHR_TEXT_MUTED} />
                            <Text
                                style={{ fontFamily: 'monospace', fontSize: 11, color: palette.EHR_TEXT_MUTED }}
                                numberOfLines={1}
                            >
                                {item.cidHash.slice(0, 22)}…
                            </Text>
                        </XStack>
                    ) : null}
                </YStack>
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: `${palette.EHR_OUTLINE}1A`,
                    }}
                >
                    <ShieldOff size={11} color={palette.EHR_TEXT_MUTED} />
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 10.5,
                            color: palette.EHR_TEXT_MUTED,
                            fontWeight: '700',
                            letterSpacing: 0.3,
                        }}
                    >
                        Hết hạn
                    </Text>
                </View>
            </XStack>
            <XStack style={{ alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Clock size={11} color={palette.EHR_TEXT_MUTED} />
                <Text style={{ fontFamily: SANS, fontSize: 11.5, color: palette.EHR_TEXT_MUTED }}>
                    Chia sẻ: {formatDate(item.createdAt)}
                </Text>
                {item.expiresAt ? (
                    <Text style={{ fontFamily: SANS, fontSize: 11.5, color: palette.EHR_DANGER, marginLeft: 10 }}>
                        Hết: {formatExpiry(item.expiresAt)}
                    </Text>
                ) : null}
            </XStack>
        </ViCard>
    );
}

export default function DoctorExpiredRecordsScreen() {
    const palette = useEhrPalette();
    const { token } = useAuthStore();
    const [expiredRecords, setExpiredRecords] = useState<ExpiredItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchExpired = useCallback(async () => {
        try {
            const records = await keyShareService.getReceivedKeys();
            const expired = (records || []).filter((r: ExpiredItem) => r.active === false);
            expired.sort(
                (a: ExpiredItem, b: ExpiredItem) =>
                    new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
            );
            setExpiredRecords(expired);
        } catch (err) {
            console.error('Failed to fetch expired records:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (token) fetchExpired();
    }, [token, fetchExpired]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchExpired();
    }, [fetchExpired]);

    if (isLoading) return <LoadingSpinner message="Đang tải hồ sơ hết hạn..." />;

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
                    Hồ sơ hết hạn
                </Text>
                <Text
                    style={{
                        marginTop: 4,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                    }}
                >
                    Quyền truy cập đã hết hạn hoặc bị thu hồi.
                </Text>
            </View>

            {expiredRecords.length === 0 ? (
                <View style={{ paddingHorizontal: 22, paddingTop: 30, alignItems: 'center' }}>
                    <Clock size={28} color={palette.EHR_TEXT_MUTED} />
                    <Text
                        style={{
                            marginTop: 12,
                            fontFamily: SERIF,
                            fontSize: 18,
                            color: palette.EHR_ON_SURFACE,
                            textAlign: 'center',
                        }}
                    >
                        Không có hồ sơ hết hạn
                    </Text>
                    <Text
                        style={{
                            marginTop: 8,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: palette.EHR_TEXT_MUTED,
                            textAlign: 'center',
                            maxWidth: 280,
                            lineHeight: 19,
                        }}
                    >
                        Các hồ sơ đã hết hạn hoặc bị thu hồi sẽ hiển thị tại đây.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={expiredRecords}
                    keyExtractor={(item, index) => item.id?.toString() || item.cidHash || `expired-${index}`}
                    renderItem={({ item }) => <ExpiredRow item={item} />}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={handleRefresh}
                            tintColor={palette.EHR_ON_SURFACE_VARIANT}
                        />
                    }
                    ListHeaderComponent={
                        <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_TEXT_MUTED, marginBottom: 12 }}>
                            {expiredRecords.length} hồ sơ đã hết hạn / bị thu hồi
                        </Text>
                    }
                />
            )}
        </SafeAreaView>
    );
}

void SANS_MEDIUM;
