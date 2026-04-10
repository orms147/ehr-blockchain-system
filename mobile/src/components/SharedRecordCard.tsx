import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { FileText, Eye, Clock, FilePlus2, ShieldCheck, Lock } from 'lucide-react-native';
import { XStack, YStack, Text, Button, View } from 'tamagui';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    interpolate,
} from 'react-native-reanimated';
import {
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SECONDARY,
    EHR_SECONDARY_CONTAINER,
    EHR_SHADOW,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
    EHR_TERTIARY,
} from '../constants/uiColors';

interface SharedRecordCardProps {
    record: any;
    onView?: (record: any) => void;
    onCreateUpdate?: (record: any) => void;
}

const PRESS_SPRING = { damping: 15, stiffness: 200, mass: 0.6 };
const MOUNT_SPRING = { damping: 18, stiffness: 120, mass: 0.8 };

export default function SharedRecordCard({ record, onView, onCreateUpdate }: SharedRecordCardProps) {
    const isPending = record?.status === 'pending';
    const statusLower = String(record?.status || '').toLowerCase();
    const isRevoked = statusLower === 'revoked' || statusLower === 'rejected';
    const isExpiredByTime = !!record?.expiresAt && new Date(record.expiresAt).getTime() < Date.now();
    const isExpired = statusLower === 'expired' || isExpiredByTime;
    const isInactive = record?.active === false || isRevoked || isExpired;
    // Read-only share: patient explicitly granted "Chỉ đọc". Hide all
    // update affordances. `includeUpdates === undefined` means legacy data
    // from before the field was added, default to allowed (true).
    const isReadOnly = record?.includeUpdates === false;
    const truncateAddr = (addr: string) => (addr ? `${addr.substring(0, 8)}...${addr.slice(-4)}` : '???');

    const mountProgress = useSharedValue(0);
    const pressScale = useSharedValue(1);
    const pressRotate = useSharedValue(0);

    useEffect(() => {
        mountProgress.value = withSpring(1, MOUNT_SPRING);
    }, []);

    const handlePressIn = () => {
        pressScale.value = withSpring(0.97, PRESS_SPRING);
        pressRotate.value = withSpring(-1.2, PRESS_SPRING);
    };

    const handlePressOut = () => {
        pressScale.value = withSpring(1, PRESS_SPRING);
        pressRotate.value = withSpring(0, PRESS_SPRING);
    };

    const mountStyle = useAnimatedStyle(() => ({
        opacity: interpolate(mountProgress.value, [0, 0.3, 1], [0, 0.5, 1]),
        transform: [
            { perspective: 800 },
            { translateY: interpolate(mountProgress.value, [0, 1], [16, 0]) },
            { scale: interpolate(mountProgress.value, [0, 1], [0.96, 1]) },
            { rotateX: `${interpolate(mountProgress.value, [0, 1], [6, 0])}deg` },
        ],
    }));

    const pressStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 1000 },
            { scale: pressScale.value },
            { rotateY: `${pressRotate.value}deg` },
        ],
    }));

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { return ''; }
    };

    const iconColors = [
        { bg: `${EHR_PRIMARY}15`, color: EHR_PRIMARY },
        { bg: `${EHR_SECONDARY}15`, color: EHR_SECONDARY },
        { bg: `${EHR_TERTIARY}15`, color: EHR_TERTIARY },
    ];
    // Deterministic color based on cidHash
    const colorIdx = record?.cidHash ? record.cidHash.charCodeAt(4) % 3 : 0;
    const { bg: iconBg, color: iconColor } = iconColors[colorIdx];

    return (
        <Animated.View style={mountStyle}>
            <Pressable onPress={() => onView?.(record)} onPressIn={handlePressIn} onPressOut={handlePressOut}>
                <Animated.View style={pressStyle}>
                    <View style={[s.card, isInactive && s.cardInactive]}>
                        {/* Top row: icon + info + status */}
                        <XStack style={s.topRow}>
                            <View style={[s.iconWrap, { backgroundColor: iconBg }]}>
                                <FileText size={20} color={iconColor} />
                            </View>

                            <YStack style={{ flex: 1 }}>
                                <Text style={s.title} numberOfLines={1}>
                                    {record?.record?.title || (record?.cidHash ? `CID: ${record.cidHash.substring(0, 16)}...` : 'N/A')}
                                </Text>
                                <Text style={s.subtitle}>
                                    BN: {truncateAddr(record?.record?.ownerAddress || record?.senderAddress)}
                                </Text>
                            </YStack>

                            <YStack style={s.rightInfo}>
                                {isRevoked ? (
                                    <View style={s.statusBadgeRevoked}>
                                        <Text style={s.statusBadgeText}>Đã thu hồi</Text>
                                    </View>
                                ) : isExpired ? (
                                    <View style={s.statusBadgeExpired}>
                                        <Text style={s.statusBadgeText}>Hết hạn</Text>
                                    </View>
                                ) : (
                                    <XStack style={s.verifiedBadge}>
                                        <ShieldCheck size={10} color={EHR_PRIMARY} />
                                        <Text style={s.verifiedText}>Đã xác minh</Text>
                                    </XStack>
                                )}
                                <Text style={s.dateText}>
                                    {formatDate(record?.createdAt)}
                                </Text>
                            </YStack>
                        </XStack>

                        {/* Meta row: time + version + expiry */}
                        {(record?.versionCount > 1 || record?.expiresAt) && (
                            <XStack style={s.metaRow}>
                                {record?.versionCount > 1 ? (
                                    <View style={s.versionBadge}>
                                        <Text style={s.versionText}>v{record.versionCount}</Text>
                                    </View>
                                ) : null}
                                {record?.expiresAt ? (
                                    <XStack style={s.expiryBadge}>
                                        <Clock size={10} color={EHR_ON_SURFACE_VARIANT} />
                                        <Text style={s.expiryText}>
                                            HH: {new Date(record.expiresAt).toLocaleDateString('vi-VN')}
                                        </Text>
                                    </XStack>
                                ) : null}
                            </XStack>
                        )}

                        {/* Action buttons */}
                        <XStack style={{ gap: 10, marginTop: 14 }}>
                            <Button
                                flex={1}
                                size="$3"
                                background={isInactive ? EHR_SURFACE_LOW : EHR_PRIMARY}
                                pressStyle={{ background: isInactive ? EHR_SURFACE_LOW : EHR_PRIMARY_CONTAINER }}
                                icon={<Eye size={15} color={isInactive ? EHR_ON_SURFACE_VARIANT : EHR_ON_PRIMARY} />}
                                onPress={isInactive ? undefined : () => onView?.(record)}
                                disabled={isInactive}
                                style={{ borderRadius: 12, opacity: isInactive ? 0.6 : 1 }}
                            >
                                <Text color={isInactive ? EHR_ON_SURFACE_VARIANT : EHR_ON_PRIMARY} fontWeight="700" fontSize="$3">
                                    {isRevoked ? 'Đã thu hồi' : isExpired ? 'Hết hạn' : isPending ? 'Nhận và xem' : 'Xem hồ sơ'}
                                </Text>
                            </Button>

                            {!isInactive && !isReadOnly && onCreateUpdate ? (
                                <Button
                                    size="$3"
                                    variant="outlined"
                                    borderColor={EHR_OUTLINE_VARIANT}
                                    pressStyle={{ background: EHR_SURFACE_LOW }}
                                    icon={<FilePlus2 size={15} color={EHR_TERTIARY} />}
                                    onPress={() => onCreateUpdate(record)}
                                    style={{ borderRadius: 12 }}
                                >
                                    <Text fontWeight="700" style={{ color: EHR_TERTIARY }} fontSize="$3">
                                        Cập nhật
                                    </Text>
                                </Button>
                            ) : null}
                            {!isInactive && isReadOnly ? (
                                <XStack style={s.readOnlyBadge}>
                                    <Lock size={12} color={EHR_ON_SURFACE_VARIANT} />
                                    <Text style={s.readOnlyText}>Chỉ đọc</Text>
                                </XStack>
                            ) : null}
                        </XStack>
                    </View>
                </Animated.View>
            </Pressable>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    cardInactive: {
        opacity: 0.7,
        borderLeftWidth: 4,
        borderLeftColor: EHR_OUTLINE_VARIANT,
    },
    statusBadgeRevoked: {
        backgroundColor: '#fde0e0',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    statusBadgeExpired: {
        backgroundColor: `${EHR_OUTLINE_VARIANT}40`,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    statusBadgeText: {
        fontSize: 9,
        fontWeight: '700',
        color: EHR_ON_SURFACE_VARIANT,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    card: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: EHR_SHADOW,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 16,
        elevation: 2,
    },
    topRow: {
        alignItems: 'center',
        gap: 12,
    },
    iconWrap: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
        lineHeight: 20,
    },
    subtitle: {
        fontSize: 12,
        color: EHR_ON_SURFACE_VARIANT,
        marginTop: 2,
    },
    rightInfo: {
        alignItems: 'flex-end',
        gap: 4,
    },
    verifiedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    verifiedText: {
        fontSize: 9,
        fontWeight: '700',
        color: EHR_PRIMARY,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    dateText: {
        fontSize: 10,
        color: EHR_ON_SURFACE_VARIANT,
    },
    metaRow: {
        marginTop: 10,
        gap: 8,
        alignItems: 'center',
    },
    versionBadge: {
        backgroundColor: EHR_PRIMARY_FIXED,
        borderRadius: 6,
        paddingVertical: 3,
        paddingHorizontal: 8,
    },
    versionText: {
        fontSize: 11,
        color: EHR_PRIMARY,
        fontWeight: '600',
    },
    expiryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: EHR_SURFACE_LOW,
        borderRadius: 6,
        paddingVertical: 3,
        paddingHorizontal: 8,
    },
    expiryText: {
        fontSize: 11,
        color: EHR_ON_SURFACE_VARIANT,
    },
    readOnlyBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        backgroundColor: EHR_SURFACE_LOW,
    },
    readOnlyText: {
        fontSize: 12,
        fontWeight: '700',
        color: EHR_ON_SURFACE_VARIANT,
    },
});
