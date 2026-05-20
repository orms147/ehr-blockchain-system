// DoctorExpiredRecordsScreen v2 — G.12.m text-rhythm row per Claude Design
// `viehp-doctor-extras.html#L386-505` ExpiredRow:
//
// Row anatomy:
//   [28px lock glyph circle]   Strike-through title (ink2 + line-through 0.5px muted)
//                              của <patient> · CCCD-mono
//                              ● status-color (cinnabar if earlyRevoke, muted else) + label + mono "DD·MM · cách đây Xd"
//                              [Yêu cầu lại ink pill] [Audit log ghost pill]
//   ─────────────────────────  bottom hairline
//
// Density stat at top: serif 22pt count + uppercase "hồ sơ · 12 tháng gần đây"
// Footer note: "Lịch sử lưu trữ 24 tháng. Sau đó chỉ còn lại bản ghi audit..."
//
// Wiring: keyShareService.getReceivedKeys filter active=false. Cinnabar
// reserved for earlyRevoke status only (patient revoked before expiry).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';

import LoadingSpinner from '../../components/LoadingSpinner';
import useAuthStore from '../../store/authStore';
import keyShareService from '../../services/keyShare.service';
import { useUserProfile } from '../../components/UserChip';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

type ExpiredItem = {
    id?: string;
    cidHash?: string;
    createdAt?: string;
    expiresAt?: string | null;
    revokedAt?: string | null;
    status?: string;
    senderAddress?: string;
    active?: boolean;
    record?: { ownerAddress?: string; title?: string };
};

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???');

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

function daysSince(iso?: string | null): number | null {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (ms <= 0) return 0;
    return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function isEarlyRevoke(item: ExpiredItem): boolean {
    // Early revoke = patient revoked BEFORE the natural expiry date.
    const status = String(item.status || '').toLowerCase();
    if (status !== 'revoked' && status !== 'rejected') return false;
    if (!item.revokedAt || !item.expiresAt) return false;
    return new Date(item.revokedAt).getTime() < new Date(item.expiresAt).getTime();
}

function LockGlyph({ color }: { color: string }) {
    return (
        <View
            style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                borderWidth: 0.5,
                borderColor: color,
                backgroundColor: 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Text
                style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    color: color,
                    fontWeight: '700',
                }}
            >
                ⌬
            </Text>
        </View>
    );
}

function ExpiredRow({
    item,
    last,
    onRequestAgain,
    onAuditLog,
}: {
    item: ExpiredItem;
    last: boolean;
    onRequestAgain: () => void;
    onAuditLog: () => void;
}) {
    const palette = useEhrPalette();
    const ownerAddr = item.record?.ownerAddress || item.senderAddress;
    const { data: patientProfile } = useUserProfile(ownerAddr);

    const earlyRevoke = isEarlyRevoke(item);
    const dotColor = earlyRevoke ? palette.EHR_PRIMARY : palette.EHR_TEXT_MUTED;
    const statusLabel = earlyRevoke ? 'Bị thu hồi sớm' : 'Hết hạn';
    const expiredOn = earlyRevoke ? item.revokedAt : item.expiresAt;
    const daysAgo = daysSince(expiredOn);
    const title = item.record?.title || `Hồ sơ ${truncate(item.cidHash)}`;
    const patientName = patientProfile?.fullName || (ownerAddr ? truncate(ownerAddr) : '—');

    return (
        <View
            style={{
                paddingHorizontal: 22,
                paddingVertical: 16,
                borderBottomWidth: last ? 0 : 0.5,
                borderColor: palette.EHR_OUTLINE_VARIANT,
            }}
        >
            {/* Locked + title */}
            <XStack style={{ alignItems: 'flex-start', gap: 12 }}>
                <LockGlyph color={palette.EHR_TEXT_MUTED} />
                <YStack style={{ flex: 1, minWidth: 0 }}>
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 14.5,
                            fontWeight: '600',
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            textDecorationLine: 'line-through',
                            textDecorationColor: palette.EHR_TEXT_MUTED,
                        }}
                        numberOfLines={1}
                    >
                        {title}
                    </Text>
                    <Text
                        style={{
                            fontSize: 12,
                            color: palette.EHR_TEXT_MUTED,
                            marginTop: 2,
                            fontFamily: SANS,
                        }}
                        numberOfLines={1}
                    >
                        của <Text style={{ color: palette.EHR_ON_SURFACE_VARIANT }}>{patientName}</Text>
                        {ownerAddr ? (
                            <>
                                <Text> · </Text>
                                <Text style={{ fontFamily: MONO, fontSize: 10.5 }}>{truncate(ownerAddr)}</Text>
                            </>
                        ) : null}
                    </Text>
                </YStack>
            </XStack>

            {/* Reason line */}
            <XStack style={{ marginTop: 10, marginLeft: 40, alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <XStack style={{ alignItems: 'center', gap: 5 }}>
                    <View
                        style={{
                            width: 5,
                            height: 5,
                            borderRadius: 3,
                            backgroundColor: dotColor,
                        }}
                    />
                    <Text
                        style={{
                            fontFamily: SANS_MEDIUM,
                            fontSize: 11,
                            color: dotColor,
                            fontWeight: '500',
                        }}
                    >
                        {statusLabel}
                    </Text>
                </XStack>
                <Text style={{ fontFamily: MONO, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                    {formatVnDate(expiredOn)}
                    {daysAgo !== null ? ` · cách đây ${daysAgo}d` : ''}
                </Text>
            </XStack>

            {/* Action row */}
            <XStack style={{ marginTop: 12, marginLeft: 40, gap: 8, alignItems: 'center' }}>
                <Pressable
                    onPress={onRequestAgain}
                    style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: palette.EHR_ON_SURFACE,
                        opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 11.5,
                            color: palette.EHR_SURFACE,
                            fontWeight: '600',
                        }}
                    >
                        Yêu cầu lại
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onAuditLog}
                    style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE,
                        backgroundColor: 'transparent',
                        opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <Text
                        style={{
                            fontFamily: SANS_MEDIUM,
                            fontSize: 11.5,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            fontWeight: '500',
                        }}
                    >
                        Audit log
                    </Text>
                </Pressable>
            </XStack>
        </View>
    );
}

export default function DoctorExpiredRecordsScreen({ navigation }: any) {
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

    const handleRequestAgain = (item: ExpiredItem) => {
        const ownerAddr = item.record?.ownerAddress || item.senderAddress;
        if (!ownerAddr) {
            Alert.alert('Lỗi', 'Không xác định được bệnh nhân.');
            return;
        }
        if (navigation?.navigate) {
            navigation.navigate('RequestAccess', { patientAddress: ownerAddr, cidHash: item.cidHash });
        } else {
            Alert.alert('Yêu cầu lại', 'Mở màn "Yêu cầu" để gửi request mới.');
        }
    };

    const handleAuditLog = (item: ExpiredItem) => {
        Alert.alert(
            'Audit log',
            `CID: ${item.cidHash?.slice(0, 24)}…\nThời điểm hết hạn: ${formatVnDate(item.expiresAt)}\n\nFull audit log sẽ hiển thị on-chain events liên quan.`,
        );
    };

    if (isLoading) return <LoadingSpinner message="Đang tải hồ sơ hết hạn..." />;

    const count = expiredRecords.length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            <FlatList
                data={expiredRecords}
                keyExtractor={(item, index) => item.id?.toString() || item.cidHash || `expired-${index}`}
                contentContainerStyle={{ paddingBottom: 32 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
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
                                Lưu trữ · Chỉ đọc lịch sử
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
                                Hồ sơ{' '}
                                <Text style={{ fontFamily: SERIF_ITALIC, fontStyle: 'italic', color: palette.EHR_PRIMARY }}>
                                    đã hết hạn.
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
                                Bạn không còn quyền xem nội dung. Để truy cập lại, gửi yêu cầu mới và chờ bệnh nhân ký đồng ý.
                            </Text>
                        </View>

                        {/* Density stat */}
                        {count > 0 ? (
                            <XStack style={{ paddingHorizontal: 22, paddingBottom: 18, alignItems: 'baseline', gap: 8 }}>
                                <Text
                                    style={{
                                        fontFamily: SERIF,
                                        fontSize: 22,
                                        fontWeight: '500',
                                        color: palette.EHR_ON_SURFACE,
                                        letterSpacing: -0.4,
                                    }}
                                >
                                    {count}
                                </Text>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 11,
                                        color: palette.EHR_TEXT_MUTED,
                                        letterSpacing: 0.6,
                                        textTransform: 'uppercase',
                                        fontWeight: '700',
                                    }}
                                >
                                    hồ sơ · 12 tháng gần đây
                                </Text>
                            </XStack>
                        ) : null}
                    </>
                }
                renderItem={({ item, index }) => (
                    <ExpiredRow
                        item={item}
                        last={index === expiredRecords.length - 1}
                        onRequestAgain={() => handleRequestAgain(item)}
                        onAuditLog={() => handleAuditLog(item)}
                    />
                )}
                ListEmptyComponent={
                    <View style={{ paddingHorizontal: 30, paddingTop: 80, alignItems: 'center' }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 19,
                                fontWeight: '500',
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                            }}
                        >
                            Không có hồ sơ nào hết hạn
                        </Text>
                        <Text
                            style={{
                                marginTop: 10,
                                fontFamily: SANS,
                                fontSize: 12.5,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 19,
                                maxWidth: 240,
                                textAlign: 'center',
                            }}
                        >
                            Tất cả các quyền truy cập đã cấp cho bạn trong 12 tháng vẫn đang hiệu lực hoặc đã được bệnh nhân gia hạn.
                        </Text>
                        <Text
                            style={{
                                marginTop: 26,
                                fontFamily: MONO,
                                fontSize: 10,
                                color: palette.EHR_TEXT_MUTED,
                                letterSpacing: 0.8,
                                textTransform: 'uppercase',
                            }}
                        >
                            — Mọi quyền hiện đang mở —
                        </Text>
                    </View>
                }
                ListFooterComponent={
                    count > 0 ? (
                        <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
                            <Text
                                style={{
                                    fontFamily: SANS,
                                    fontSize: 11,
                                    color: palette.EHR_TEXT_MUTED,
                                    lineHeight: 17,
                                }}
                            >
                                Lịch sử lưu trữ 24 tháng. Sau đó chỉ còn lại bản ghi audit (hash + thời điểm), không có metadata bệnh nhân.
                            </Text>
                        </View>
                    ) : null
                }
            />
        </SafeAreaView>
    );
}
