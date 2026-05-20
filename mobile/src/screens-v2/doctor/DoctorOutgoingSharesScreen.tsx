// DoctorOutgoingSharesScreen v2 — port of screens/doctor.
// Doctor xem hồ sơ đã re-share cho bác sĩ khác + revoke.
//
// Wiring preserved:
//   - keyShareService.getSentKeys + revokeKey
//   - Dedupe by (rootCidHash, recipient) tuple
//   - Cascade revoke flips DB encryptedPayload to null (DB-level off-chain)

import React, { useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { ShieldOff, Share2, FileText, Clock } from 'lucide-react-native';

import keyShareService from '../../services/keyShare.service';
import UserChip from '../../components/UserChip';
import ViCard from '../../components-v2/ViCard';
import ViButton from '../../components-v2/ViButton';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

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
    return d.toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
};

const isInactive = (s: SentShare) => {
    const status = (s.status || '').toLowerCase();
    if (status === 'revoked' || status === 'rejected' || status === 'expired') return true;
    if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) return true;
    return false;
};

export default function DoctorOutgoingSharesScreen() {
    const palette = useEhrPalette();
    const queryClient = useQueryClient();
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const { data = [], isLoading, refetch, isRefetching } = useQuery<SentShare[]>({
        queryKey: ['doctor', 'outgoingShares'],
        queryFn: () => keyShareService.getSentKeys(),
        refetchInterval: 15_000,
    });

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
            ],
        );
    };

    const renderItem = ({ item }: { item: SentShare }) => {
        const inactiveRow = isInactive(item);
        const recipient = item.recipient?.walletAddress || item.recipientAddress;
        const title = item.record?.title || `Hồ sơ ${truncate(item.cidHash)}`;
        return (
            <ViCard padding={14} style={{ marginBottom: 10, opacity: inactiveRow ? 0.65 : 1 }}>
                <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                    <XStack style={{ alignItems: 'center', flex: 1, gap: 8 }}>
                        <FileText size={14} color={palette.EHR_PRIMARY} />
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 14,
                                color: palette.EHR_ON_SURFACE,
                                fontWeight: '700',
                                flex: 1,
                            }}
                            numberOfLines={1}
                        >
                            {title}
                        </Text>
                    </XStack>
                    {item.allowDelegate ? (
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 999,
                                backgroundColor: palette.EHR_PRIMARY_FIXED,
                            }}
                        >
                            <Share2 size={10} color={palette.EHR_PRIMARY} />
                            <Text style={{ fontFamily: SANS_SEMI, fontSize: 10, color: palette.EHR_PRIMARY, fontWeight: '700' }}>
                                Chia sẻ lại
                            </Text>
                        </View>
                    ) : null}
                </XStack>

                <YStack style={{ marginVertical: 4 }}>
                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.4, textTransform: 'uppercase' as const, fontWeight: '600' as const, marginBottom: 2 }}>Người nhận</Text>
                    <View style={{ marginTop: 4 }}>
                        {/* G.2 — recipient wallet → UserChip resolves name + role + verified */}
                        <UserChip address={recipient} showAddress={false} expanded interactive={false} />
                    </View>
                </YStack>
                <XStack style={{ gap: 14, marginTop: 8 }}>
                    <YStack style={{ flex: 1 }}>
                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.4, textTransform: 'uppercase' as const, fontWeight: '600' as const, marginBottom: 2 }}>Hết hạn</Text>
                        <XStack style={{ alignItems: 'center', gap: 4 }}>
                            <Clock size={11} color={palette.EHR_TEXT_MUTED} />
                            <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 12.5, color: palette.EHR_ON_SURFACE, fontWeight: '600' as const }}>{formatExpiry(item.expiresAt)}</Text>
                        </XStack>
                    </YStack>
                    <YStack style={{ flex: 1 }}>
                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.4, textTransform: 'uppercase' as const, fontWeight: '600' as const, marginBottom: 2 }}>Trạng thái</Text>
                        <Text
                            style={[
                                { fontFamily: SANS_MEDIUM, fontSize: 12.5, color: palette.EHR_ON_SURFACE, fontWeight: '600' as const },
                                inactiveRow ? { color: palette.EHR_DANGER } : null,
                            ]}
                        >
                            {(() => {
                                const s = String(item.status || '').toLowerCase();
                                if (s === 'revoked') return 'Đã thu hồi';
                                if (s === 'rejected') return 'BS từ chối';
                                if (s === 'expired') return 'Hết hạn';
                                if (item.expiresAt && new Date(item.expiresAt).getTime() < Date.now()) return 'Hết hạn';
                                return 'Đang hoạt động';
                            })()}
                        </Text>
                    </YStack>
                </XStack>

                {!inactiveRow ? (
                    <View style={{ marginTop: 12 }}>
                        <ViButton
                            variant="danger"
                            full
                            size="sm"
                            loading={revokingId === item.id}
                            onPress={() => handleRevoke(item)}
                            leftIcon={<ShieldOff size={14} color={palette.EHR_DANGER} />}
                        >
                            {revokingId === item.id ? 'Đang thu hồi…' : 'Thu hồi quyền'}
                        </ViButton>
                    </View>
                ) : null}
            </ViCard>
        );
    };

    const list = [...active, ...inactive];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }}>
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
                    Đã chia sẻ lại
                </Text>
                <Text
                    style={{
                        marginTop: 4,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        lineHeight: 19,
                    }}
                >
                    Hồ sơ bạn đã uỷ quyền cho bác sĩ khác. Bấm "Thu hồi" để chấm dứt.
                </Text>
            </View>

            <FlatList
                data={list}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={refetch}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListEmptyComponent={
                    <View style={{ paddingTop: 30, alignItems: 'center' }}>
                        <Share2 size={28} color={palette.EHR_TEXT_MUTED} />
                        <Text
                            style={{
                                marginTop: 12,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_TEXT_MUTED,
                                textAlign: 'center',
                                maxWidth: 280,
                                lineHeight: 19,
                            }}
                        >
                            {isLoading ? 'Đang tải…' : 'Bạn chưa chia sẻ hồ sơ nào cho bác sĩ khác.'}
                        </Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    const palette = useEhrPalette();
    const kvLabelStyle = {
        fontFamily: SANS_SEMI,
        fontSize: 10.5,
        color: palette.EHR_TEXT_MUTED,
        letterSpacing: 0.4,
        textTransform: 'uppercase' as const,
        fontWeight: '600' as const,
        marginBottom: 2,
    };
    const kvValueStyle = {
        fontFamily: SANS_MEDIUM,
        fontSize: 12.5,
        color: palette.EHR_ON_SURFACE,
        fontWeight: '600' as const,
    };
    return (
        <YStack>
            <Text style={{ fontFamily: SANS_SEMI, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.4, textTransform: 'uppercase' as const, fontWeight: '600' as const, marginBottom: 2 }}>{label}</Text>
            <Text style={[kvValueStyle, mono ? { fontFamily: 'monospace', fontSize: 12 } : null]}>
                {value}
            </Text>
        </YStack>
    );
}

