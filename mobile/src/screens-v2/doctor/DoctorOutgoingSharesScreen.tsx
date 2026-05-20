// DoctorOutgoingSharesScreen v2 — G.12.m text-rhythm row per Claude Design
// `viehp-doctor-extras.html#L262-317` OutgoingShareRow:
//
// Row anatomy:
//   Title (ink bold 14.5pt)
//   của <patient> (secondary 12pt)
//   Trao cho ↗ BS. X · BV Y  (mono caps "Trao cho" + arrow + recipient resolved)
//   ● status-color  "Còn Nd" / "Sắp hết · còn Nd" / "Đã thu hồi · DD" / "Hết hạn · DD"  · mode  [Thu hồi cinnabar outline pill if live]
//   ─────────────  bottom hairline
//   Dead rows: opacity 0.58
//
// Filter chips: Đang mở / Hết hạn / Đã thu hồi / Tất cả (with counts)
// Footer legal note about on-chain trail.
//
// Wiring preserved:
//   - keyShareService.getSentKeys + revokeKey
//   - Dedupe by (rootCidHash, recipient) tuple
//   - UserChip resolution for recipient name + hospital

import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { Share2 } from 'lucide-react-native';

import keyShareService from '../../services/keyShare.service';
import { useUserProfile } from '../../components/UserChip';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

type SentShare = {
    id: string;
    cidHash: string;
    senderAddress: string;
    recipientAddress: string;
    status: string;
    allowDelegate?: boolean;
    expiresAt?: string | null;
    createdAt?: string;
    revokedAt?: string | null;
    parentCidHash?: string | null;
    rootCidHash?: string;
    record?: { cidHash?: string; parentCidHash?: string | null; title?: string; ownerAddress?: string };
    recipient?: { walletAddress?: string };
};

const truncate = (addr: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '?');

function formatVnDate(iso?: string | null): string {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}·${mm}·${d.getFullYear()}`;
    } catch {
        return '—';
    }
}

function daysLeft(iso?: string | null): number | null {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

type ShareStatus = 'active' | 'expired' | 'revoked';
function classify(s: SentShare): ShareStatus {
    const status = (s.status || '').toLowerCase();
    if (status === 'revoked' || status === 'rejected') return 'revoked';
    if (status === 'expired') return 'expired';
    if (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()) return 'expired';
    return 'active';
}

export default function DoctorOutgoingSharesScreen() {
    const palette = useEhrPalette();
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<ShareStatus | 'all'>('active');
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

    const counts = useMemo(() => {
        const c = { all: grouped.length, active: 0, expired: 0, revoked: 0 };
        for (const s of grouped) {
            const cls = classify(s);
            c[cls] += 1;
        }
        return c;
    }, [grouped]);

    const filtered = useMemo(() => {
        if (filter === 'all') return grouped;
        return grouped.filter((s) => classify(s) === filter);
    }, [grouped, filter]);

    const handleRevoke = (item: SentShare) => {
        const recipient = item.recipient?.walletAddress || item.recipientAddress;
        Alert.alert(
            'Thu hồi quyền truy cập',
            `Bác sĩ ${truncate(recipient)} sẽ KHÔNG còn đọc được hồ sơ.\n\nLưu ý: thu hồi tức thì ở mức ứng dụng.`,
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

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }}>
            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 32 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={refetch}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListHeaderComponent={
                    <>
                        {/* Editorial header */}
                        <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 18 }}>
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 10,
                                    color: palette.EHR_TEXT_MUTED,
                                    letterSpacing: 1.4,
                                    textTransform: 'uppercase',
                                    fontWeight: '700',
                                    marginBottom: 8,
                                }}
                            >
                                Uỷ quyền · Hồ sơ ↗ đồng nghiệp
                            </Text>
                            <Text
                                style={{
                                    fontFamily: SERIF,
                                    fontSize: 26,
                                    color: palette.EHR_ON_SURFACE,
                                    letterSpacing: -0.4,
                                    lineHeight: 30,
                                }}
                            >
                                Hồ sơ đã{' '}
                                <Text style={{ fontFamily: SERIF_ITALIC, fontStyle: 'italic', color: palette.EHR_PRIMARY }}>
                                    chia sẻ lại.
                                </Text>
                            </Text>
                            <Text
                                style={{
                                    marginTop: 8,
                                    fontFamily: SANS,
                                    fontSize: 13,
                                    color: palette.EHR_ON_SURFACE_VARIANT,
                                    lineHeight: 19,
                                }}
                            >
                                Các hồ sơ bạn được uỷ quyền và đã chuyển tiếp cho bác sĩ khác. Bạn có thể thu hồi sớm bất kỳ lúc nào.
                            </Text>
                        </View>

                        {/* Filter chips */}
                        <FilterChips
                            value={filter}
                            onChange={setFilter}
                            options={[
                                ['active', `Đang mở (${counts.active})`],
                                ['expired', `Hết hạn (${counts.expired})`],
                                ['revoked', `Đã thu hồi (${counts.revoked})`],
                                ['all', `Tất cả (${counts.all})`],
                            ]}
                        />
                    </>
                }
                renderItem={({ item, index }) => (
                    <OutgoingShareRow
                        item={item}
                        last={index === filtered.length - 1}
                        revoking={revokingId === item.id}
                        onRevoke={() => handleRevoke(item)}
                    />
                )}
                ListEmptyComponent={
                    <View style={{ paddingHorizontal: 30, paddingTop: 60, alignItems: 'center' }}>
                        <Share2 size={28} color={palette.EHR_TEXT_MUTED} />
                        <Text
                            style={{
                                marginTop: 14,
                                fontFamily: SERIF,
                                fontSize: 18,
                                color: palette.EHR_ON_SURFACE,
                                textAlign: 'center',
                            }}
                        >
                            {isLoading ? 'Đang tải…' : 'Chưa có hồ sơ chia sẻ lại'}
                        </Text>
                        <Text
                            style={{
                                marginTop: 10,
                                fontFamily: SANS,
                                fontSize: 12.5,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                textAlign: 'center',
                                lineHeight: 19,
                                maxWidth: 280,
                            }}
                        >
                            Khi bạn uỷ quyền lại hồ sơ cho đồng nghiệp, danh sách sẽ hiển thị tại đây.
                        </Text>
                    </View>
                }
                ListFooterComponent={
                    filtered.length > 0 ? (
                        <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
                            <Text
                                style={{
                                    fontFamily: SANS,
                                    fontSize: 11,
                                    color: palette.EHR_TEXT_MUTED,
                                    lineHeight: 17,
                                }}
                            >
                                Mỗi lần chia sẻ lại đều ghi sổ on-chain. Bệnh nhân thấy toàn bộ chuỗi:{' '}
                                <Text style={{ color: palette.EHR_ON_SURFACE_VARIANT }}>
                                    bệnh nhân → bạn → người nhận
                                </Text>
                                .
                            </Text>
                        </View>
                    ) : null
                }
            />
        </SafeAreaView>
    );
}

// ──────── Filter chip row ────────
function FilterChips({
    value,
    onChange,
    options,
}: {
    value: ShareStatus | 'all';
    onChange: (v: ShareStatus | 'all') => void;
    options: [ShareStatus | 'all', string][];
}) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                paddingHorizontal: 22,
                paddingBottom: 18,
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
            }}
        >
            {options.map(([key, label]) => {
                const active = value === key;
                return (
                    <Pressable
                        key={key}
                        onPress={() => onChange(key)}
                        style={({ pressed }) => ({
                            paddingHorizontal: 13,
                            paddingVertical: 7,
                            borderRadius: 999,
                            borderWidth: 0.5,
                            borderColor: active ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE,
                            backgroundColor: active ? palette.EHR_ON_SURFACE : 'transparent',
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_MEDIUM,
                                fontSize: 12,
                                color: active ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE_VARIANT,
                                fontWeight: '600',
                            }}
                        >
                            {label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

// ──────── Outgoing share row ────────
function OutgoingShareRow({
    item,
    last,
    revoking,
    onRevoke,
}: {
    item: SentShare;
    last: boolean;
    revoking: boolean;
    onRevoke: () => void;
}) {
    const palette = useEhrPalette();
    const recipient = item.recipient?.walletAddress || item.recipientAddress;
    const patientAddress = item.record?.ownerAddress;
    const { data: recipientProfile } = useUserProfile(recipient);
    const { data: patientProfile } = useUserProfile(patientAddress);

    const status = classify(item);
    const isLive = status === 'active';
    const isRevoked = status === 'revoked';

    const dLeft = daysLeft(item.expiresAt);
    const statusColor = isLive
        ? (dLeft !== null && dLeft < 14 ? palette.EHR_WARNING : palette.EHR_TERTIARY)
        : isRevoked
            ? palette.EHR_PRIMARY
            : palette.EHR_TEXT_MUTED;
    const statusLabel = isLive
        ? (dLeft !== null && dLeft < 14 ? `Sắp hết · còn ${dLeft} ngày` : `Còn ${dLeft ?? '∞'} ngày`)
        : isRevoked
            ? `Đã thu hồi · ${formatVnDate(item.revokedAt)}`
            : `Hết hạn · ${formatVnDate(item.expiresAt)}`;

    const title = item.record?.title || `Hồ sơ ${truncate(item.cidHash)}`;
    const patientName = patientProfile?.fullName || (patientAddress ? truncate(patientAddress) : '—');
    const recipientName = recipientProfile?.fullName
        ? `BS. ${recipientProfile.fullName}`
        : truncate(recipient);
    const recipientOrg = recipientProfile?.doctorProfile?.hospitalName || null;
    const mode = item.allowDelegate ? 'Đọc · Uỷ quyền' : 'Đọc · Cập nhật';

    return (
        <View
            style={{
                paddingHorizontal: 22,
                paddingVertical: 16,
                borderBottomWidth: last ? 0 : 0.5,
                borderColor: palette.EHR_OUTLINE_VARIANT,
                opacity: isLive ? 1 : 0.58,
            }}
        >
            {/* Title */}
            <Text
                style={{
                    fontFamily: SANS_SEMI,
                    fontSize: 14.5,
                    fontWeight: '700',
                    color: palette.EHR_ON_SURFACE,
                    letterSpacing: -0.1,
                }}
                numberOfLines={1}
            >
                {title}
            </Text>

            {/* Patient */}
            <Text
                style={{
                    fontSize: 12,
                    color: palette.EHR_ON_SURFACE_VARIANT,
                    marginTop: 2,
                    fontFamily: SANS,
                }}
                numberOfLines={1}
            >
                của <Text style={{ color: palette.EHR_ON_SURFACE }}>{patientName}</Text>
            </Text>

            {/* Chain arrow line */}
            <XStack style={{ marginTop: 10, alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        letterSpacing: 1,
                        color: palette.EHR_TEXT_MUTED,
                        textTransform: 'uppercase',
                        fontWeight: '700',
                    }}
                >
                    Trao cho
                </Text>
                <Text style={{ color: palette.EHR_ON_SURFACE_VARIANT, fontSize: 12 }}>↗</Text>
                <Text
                    style={{
                        color: palette.EHR_ON_SURFACE,
                        fontSize: 12.5,
                        fontFamily: SANS_MEDIUM,
                        fontWeight: '500',
                    }}
                >
                    {recipientName}
                </Text>
                {recipientOrg ? (
                    <>
                        <Text style={{ color: palette.EHR_TEXT_MUTED }}>·</Text>
                        <Text style={{ color: palette.EHR_TEXT_MUTED, fontSize: 11.5, fontFamily: SANS }}>
                            {recipientOrg}
                        </Text>
                    </>
                ) : null}
            </XStack>

            {/* Meta strip */}
            <XStack style={{ marginTop: 10, alignItems: 'center', gap: 12 }}>
                <XStack style={{ alignItems: 'center', gap: 5 }}>
                    <View
                        style={{
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: statusColor,
                        }}
                    />
                    <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 11, color: statusColor, fontWeight: '500' }}>
                        {statusLabel}
                    </Text>
                </XStack>
                <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: palette.EHR_TEXT_MUTED }} />
                <Text style={{ fontFamily: MONO, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>{mode}</Text>
                <View style={{ flex: 1 }} />
                {isLive ? (
                    <Pressable
                        onPress={onRevoke}
                        disabled={revoking}
                        style={({ pressed }) => ({
                            paddingHorizontal: 11,
                            paddingVertical: 5,
                            borderRadius: 999,
                            borderWidth: 0.5,
                            borderColor: `${palette.EHR_PRIMARY}80`,
                            opacity: pressed ? 0.6 : revoking ? 0.4 : 1,
                        })}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 11.5,
                                color: palette.EHR_PRIMARY,
                                fontWeight: '600',
                                letterSpacing: 0.2,
                            }}
                        >
                            {revoking ? 'Đang thu hồi…' : 'Thu hồi'}
                        </Text>
                    </Pressable>
                ) : null}
            </XStack>
        </View>
    );
}
