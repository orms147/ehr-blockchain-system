import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { FileText, ChevronRight, Activity, Stethoscope, FileSearch, ShieldCheck } from 'lucide-react-native';
import { XStack, YStack, Text, View } from 'tamagui';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    interpolate,
} from 'react-native-reanimated';
import {
    EHR_ERROR,
    EHR_ERROR_CONTAINER,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_SECONDARY,
    EHR_SHADOW,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
    EHR_TERTIARY,
} from '../constants/uiColors';
import { formatDate as formatDateShared } from '../utils/dateFormatting';

interface RecordCardProps {
    record: any;
    onPress?: (record: any) => void;
}

const PRESS_SPRING = { damping: 15, stiffness: 200, mass: 0.6 };
const MOUNT_SPRING = { damping: 18, stiffness: 120, mass: 0.8 };

export default function RecordCard({ record, onPress }: RecordCardProps) {
    const mountProgress = useSharedValue(0);
    const pressScale = useSharedValue(1);
    const pressRotateY = useSharedValue(0);
    const elevation = useSharedValue(0);

    useEffect(() => {
        mountProgress.value = withSpring(1, MOUNT_SPRING);
    }, []);

    const handlePressIn = () => {
        pressScale.value = withSpring(0.97, PRESS_SPRING);
        pressRotateY.value = withSpring(-1.5, PRESS_SPRING);
        elevation.value = withTiming(8, { duration: 150 });
    };

    const handlePressOut = () => {
        pressScale.value = withSpring(1, PRESS_SPRING);
        pressRotateY.value = withSpring(0, PRESS_SPRING);
        elevation.value = withTiming(0, { duration: 200 });
    };

    const mountStyle = useAnimatedStyle(() => ({
        opacity: interpolate(mountProgress.value, [0, 0.3, 1], [0, 0.5, 1]),
        transform: [
            { perspective: 1000 },
            { translateY: interpolate(mountProgress.value, [0, 1], [14, 0]) },
            { rotateX: `${interpolate(mountProgress.value, [0, 1], [8, 0])}deg` },
        ],
    }));

    const pressStyle = useAnimatedStyle(() => ({
        transform: [
            { perspective: 1000 },
            { scale: pressScale.value },
            { rotateY: `${pressRotateY.value}deg` },
        ],
        shadowRadius: interpolate(elevation.value, [0, 8], [12, 20]),
        shadowOpacity: interpolate(elevation.value, [0, 8], [0.04, 0.1]),
        shadowOffset: {
            width: 0,
            height: interpolate(elevation.value, [0, 8], [4, 12]),
        },
    }));

    const getIcon = () => {
        const type = typeof record?.type === 'string' ? record.type.toLowerCase() : '';
        if (type.includes('lab') || type.includes('xet nghiem') || type.includes('xét nghiệm'))
            return { Icon: Activity, color: EHR_TERTIARY, bg: `${EHR_TERTIARY}15` };
        if (type.includes('checkup') || type.includes('khám') || type.includes('kham'))
            return { Icon: Stethoscope, color: EHR_PRIMARY, bg: `${EHR_PRIMARY}15` };
        if (type.includes('x-ray') || type.includes('x-quang'))
            return { Icon: FileSearch, color: EHR_SECONDARY, bg: `${EHR_SECONDARY}15` };
        return { Icon: FileText, color: EHR_PRIMARY, bg: EHR_SURFACE_LOW };
    };

    const { Icon, color: iconColor, bg: iconBg } = getIcon();

    const statusChip = (() => {
        if (record?.syncStatus === 'failed')
            return { label: 'Lỗi', bg: EHR_ERROR_CONTAINER, color: EHR_ERROR };
        if (record?.syncStatus === 'pending')
            return { label: 'Đang đồng bộ', bg: EHR_SURFACE_LOW, color: EHR_PRIMARY };
        return null;
    })();

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        // If already in dd/mm/yyyy form, pass through unchanged (legacy data).
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(dateStr)) return dateStr;
        return formatDateShared(dateStr);
    };

    return (
        <Animated.View style={mountStyle}>
            <Pressable onPress={() => onPress?.(record)} onPressIn={handlePressIn} onPressOut={handlePressOut}>
                <Animated.View style={[pressStyle, { shadowColor: EHR_SHADOW }]}>
                    <View style={s.card}>
                        <XStack style={s.row}>
                            {/* Icon */}
                            <View style={[s.iconWrap, { backgroundColor: iconBg }]}>
                                <Icon size={22} color={iconColor} />
                            </View>

                            {/* Content */}
                            <YStack style={{ flex: 1 }}>
                                <Text style={s.title} numberOfLines={1}>
                                    {record?.title || record?.type || 'Hồ sơ y tế'}
                                </Text>
                                <XStack style={s.metaRow}>
                                    {statusChip ? (
                                        <View style={[s.chip, { backgroundColor: statusChip.bg }]}>
                                            <Text style={[s.chipText, { color: statusChip.color }]}>{statusChip.label}</Text>
                                        </View>
                                    ) : (
                                        <XStack style={s.verifiedBadge}>
                                            <ShieldCheck size={10} color={EHR_PRIMARY} />
                                            <Text style={s.verifiedText}>Đã xác minh</Text>
                                        </XStack>
                                    )}
                                    <Text style={s.date}>
                                        {formatDate(record?.date || record?.createdAt)}
                                    </Text>
                                </XStack>
                            </YStack>

                            {/* Arrow */}
                            <ChevronRight color={`${EHR_OUTLINE_VARIANT}`} size={18} />
                        </XStack>
                    </View>
                </Animated.View>
            </Pressable>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    card: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderRadius: 16,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: `${EHR_OUTLINE_VARIANT}60`,
    },
    row: {
        alignItems: 'center',
        gap: 14,
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
        marginBottom: 4,
    },
    metaRow: {
        alignItems: 'center',
        gap: 8,
    },
    chip: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
    },
    chipText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    verifiedBadge: {
        alignItems: 'center',
        gap: 3,
        backgroundColor: `${EHR_PRIMARY}10`,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    verifiedText: {
        fontSize: 9,
        fontWeight: '700',
        color: EHR_PRIMARY,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    date: {
        fontSize: 11,
        color: `${EHR_ON_SURFACE_VARIANT}99`,
    },
});
