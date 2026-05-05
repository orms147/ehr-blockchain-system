// DoctorOutgoingSharesScreen — D's outgoing per-record delegate-shares.
//
// Lists every KeyShare row where the doctor is the SENDER (i.e. doctor used
// `grantUsingRecordDelegation` to re-share a record they have delegate access
// to, to another doctor). Self-share rows are excluded server-side.
//
// "Thu hồi" calls DELETE /api/key-share/:id (sender-revoke). This flips the
// row to status='revoked' + clears encryptedPayload, so the recipient's
// `/api/key-share/record/:cidHash` lookup returns 404 and they can no longer
// decrypt. Note: on-chain Consent is NOT revoked (only the patient can call
// revokeConsent on chain) — but without the encrypted payload from the DB
// the recipient cannot derive the AES key, so DB-level revoke is sufficient
// for off-chain access termination.

import React, { useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { YStack, XStack, Text, View, Button } from 'tamagui';
import { ShieldOff, Share2, FileText, Clock } from 'lucide-react-native';

import keyShareService from '../../services/keyShare.service';
import {
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_OUTLINE_VARIANT,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_ERROR,
    EHR_ERROR_CONTAINER,
} from '../../constants/uiColors';

type SentShare = {
    id: string;
    cidHash: string;
    senderAddress: string;
    recipientAddress: string;
    status: string;
    allowDelegate?: boolean;
    expiresAt?: string | null;
    createdAt?: string;
    parentCidHash?: string | null;
    rootCidHash?: string;
    record?: { cidHash?: string; parentCidHash?: string | null; title?: string };
    recipient?: { walletAddress?: string };
};

const truncate = (addr: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '?');

const formatExpiry = (iso?: string | null) => {
    if (!iso) return 'Vĩnh viễn';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '?';
    return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const isInactive = (s: SentShare) => {
    const status = (s.status || '').toLowerCase();
    if (status === 'revoked' || status === 'rejected' || status === 'expired') return true;
    if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) return true;
    return false;
};

export default function DoctorOutgoingSharesScreen() {
    const queryClient = useQueryClient();
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const { data = [], isLoading, refetch, isRefetching } = useQuery<SentShare[]>({
        queryKey: ['doctor', 'outgoingShares'],
        queryFn: () => keyShareService.getSentKeys(),
        refetchInterval: 15_000,
    });

    // Dedupe by (rootCidHash, recipient) so each chain shows exactly one row
    // per recipient — D shared V1, V2, V3 of same chain to D1 → 1 entry, not 3.
    // Pick newest createdAt as the representative; revoke status of newest
    // reflects whole chain (cascade revoke updates all versions together).
    const grouped = useMemo(() => {
        const byKey = new Map<string, SentShare>();
        for (const s of data) {
            const root = (s.rootCidHash || s.cidHash || '').toLowerCase();
            const recipient = (s.recipient?.walletAddress || s.recipientAddress || '').toLowerCase();
            const key = `${root}|${recipient}`;
            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, s);
                continue;
            }
            const sTs = new Date(s.createdAt || 0).getTime();
            const eTs = new Date(existing.createdAt || 0).getTime();
            if (sTs > eTs) byKey.set(key, s);
        }
        return Array.from(byKey.values());
    }, [data]);

    const { active, inactive } = useMemo(() => {
        const a: SentShare[] = [];
        const i: SentShare[] = [];
        for (const s of grouped) {
            (isInactive(s) ? i : a).push(s);
        }
        return { active: a, inactive: i };
    }, [grouped]);

    const handleRevoke = (item: SentShare) => {
        const recipient = item.recipient?.walletAddress || item.recipientAddress;
        Alert.alert(
            'Thu hồi quyền truy cập',
            `Bác sĩ ${truncate(recipient)} sẽ KHÔNG còn đọc được hồ sơ "${item.record?.title || truncate(item.cidHash)}".\n\n` +
            'Lưu ý: thu hồi tức thì ở mức ứng dụng (xoá khoá chia sẻ). Quyền on-chain do bệnh nhân quản lý.',
            [
                { text: 'Huỷ', style: 'cancel' },
                {
                    text: 'Thu hồi',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setRevokingId(item.id);
                            await keyShareService.revokeKey(item.id);
                            await queryClient.invalidateQueries({ queryKey: ['doctor', 'outgoingShares'] });
                            await queryClient.invalidateQueries({ queryKey: ['doctor', 'sharedRecords'] });
                            Alert.alert('Đã thu hồi', 'Bác sĩ này không còn truy cập được hồ sơ.');
                        } catch (err: any) {
                            const msg = err?.data?.message || err?.message || 'Không thể thu hồi.';
                            Alert.alert('Lỗi', msg);
                        } finally {
                            setRevokingId(null);
                        }
                    },
                },
            ]
        );
    };

    const renderItem = ({ item }: { item: SentShare }) => {
        const inactiveRow = isInactive(item);
        const recipient = item.recipient?.walletAddress || item.recipientAddress;
        const title = item.record?.title || `Hồ sơ ${truncate(item.cidHash)}`;
        return (
            <View style={[styles.card, inactiveRow && styles.cardInactive]}>
                <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <XStack style={{ alignItems: 'center', flex: 1, gap: 8 }}>
                        <FileText size={16} color={EHR_PRIMARY} />
                        <Text fontWeight="700" fontSize="$4" color="$color12" numberOfLines={1} style={{ flex: 1 }}>
                            {title}
                        </Text>
                    </XStack>
                    {item.allowDelegate ? (
                        <View style={styles.tagDelegate}>
                            <Share2 size={11} color={EHR_PRIMARY} />
                            <Text style={styles.tagDelegateText}>Có thể chia sẻ lại</Text>
                        </View>
                    ) : null}
                </XStack>

                <Text style={styles.kvLabel}>Người nhận</Text>
                <Text style={styles.kvValue}>{truncate(recipient)}</Text>

                <XStack style={{ gap: 16, marginTop: 6 }}>
                    <YStack style={{ flex: 1 }}>
                        <Text style={styles.kvLabel}>Hết hạn</Text>
                        <XStack style={{ alignItems: 'center', gap: 4 }}>
                            <Clock size={12} color={EHR_ON_SURFACE_VARIANT} />
                            <Text style={styles.kvValue}>{formatExpiry(item.expiresAt)}</Text>
                        </XStack>
                    </YStack>
                    <YStack style={{ flex: 1 }}>
                        <Text style={styles.kvLabel}>Trạng thái</Text>
                        <Text style={[styles.kvValue, inactiveRow && { color: EHR_ERROR }]}>
                            {(() => {
                                const s = String(item.status || '').toLowerCase();
                                if (s === 'revoked') return 'Đã thu hồi (cascade từ bệnh nhân hoặc do bạn)';
                                if (s === 'rejected') return 'Bác sĩ từ chối';
                                if (s === 'expired') return 'Hết hạn';
                                if (item.expiresAt && new Date(item.expiresAt).getTime() < Date.now()) return 'Hết hạn';
                                return 'Đang hoạt động';
                            })()}
                        </Text>
                    </YStack>
                </XStack>

                {!inactiveRow ? (
                    <Button
                        size="$3"
                        backgroundColor={EHR_ERROR_CONTAINER}
                        color={EHR_ERROR}
                        marginTop={12}
                        icon={<ShieldOff size={16} color={EHR_ERROR} />}
                        disabled={revokingId === item.id}
                        onPress={() => handleRevoke(item)}
                    >
                        {revokingId === item.id ? 'Đang thu hồi…' : 'Thu hồi quyền'}
                    </Button>
                ) : null}
            </View>
        );
    };

    const list = [...active, ...inactive];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }}>
            <YStack padding={16} gap={4}>
                <Text fontSize="$6" fontWeight="800" color="$color12">Hồ sơ đã chia sẻ lại</Text>
                <Text fontSize="$3" color="$color10">
                    Danh sách hồ sơ bạn đã uỷ quyền cho bác sĩ khác. Bấm "Thu hồi" để chấm dứt quyền truy cập.
                </Text>
            </YStack>

            <FlatList
                data={list}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
                ListEmptyComponent={
                    <View style={styles.empty}>
                        <Text style={{ color: EHR_ON_SURFACE_VARIANT, textAlign: 'center' }}>
                            {isLoading ? 'Đang tải…' : 'Bạn chưa chia sẻ hồ sơ nào cho bác sĩ khác.'}
                        </Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: EHR_SURFACE_LOW,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        padding: 14,
        marginBottom: 12,
    },
    cardInactive: {
        opacity: 0.6,
    },
    kvLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: EHR_ON_SURFACE_VARIANT,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginTop: 6,
    },
    kvValue: {
        fontSize: 13,
        color: EHR_ON_SURFACE,
        fontWeight: '600',
    },
    tagDelegate: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: EHR_PRIMARY_FIXED,
        borderColor: EHR_PRIMARY,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    tagDelegateText: {
        fontSize: 10,
        fontWeight: '700',
        color: EHR_PRIMARY,
    },
    empty: {
        padding: 32,
        alignItems: 'center',
    },
});
