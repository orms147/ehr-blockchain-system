import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { FileX, Loader2 } from 'lucide-react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withSequence,
    withTiming,
    withSpring,
    withDelay,
    interpolate,
    Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

interface EmptyStateProps {
    message?: string;
    subMessage?: string;
    icon?: any;
    title?: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    isLoading?: boolean;
}

const SPRING = { damping: 18, stiffness: 120, mass: 0.8 };

export default function EmptyState({
    message,
    subMessage,
    icon,
    title,
    description,
    actionLabel,
    onAction,
    isLoading = false,
}: EmptyStateProps) {
    const heading = title || message || 'Không có dữ liệu';
    const body = description || subMessage;

    const iconFloat = useSharedValue(0);
    const enterProgress = useSharedValue(0);
    const textEnter = useSharedValue(0);

    useEffect(() => {
        enterProgress.value = withSpring(1, SPRING);
        textEnter.value = withDelay(150, withSpring(1, SPRING));
        iconFloat.value = withDelay(
            600,
            withRepeat(
                withSequence(
                    withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
                    withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.ease) })
                ),
                -1,
                true
            )
        );
    }, []);

    const iconContainerStyle = useAnimatedStyle(() => {
        const translateY = interpolate(iconFloat.value, [0, 1], [0, -10]);
        const scale = interpolate(enterProgress.value, [0, 1], [0.5, 1]);
        const opacity = interpolate(enterProgress.value, [0, 0.5, 1], [0, 0.7, 1]);
        const rotateX = `${interpolate(enterProgress.value, [0, 1], [12, 0])}deg`;

        return {
            transform: [
                { perspective: 800 },
                { translateY },
                { rotateX },
                { scale },
            ],
            opacity,
        };
    });

    const textStyle = useAnimatedStyle(() => {
        const translateY = interpolate(textEnter.value, [0, 1], [20, 0]);
        const opacity = interpolate(textEnter.value, [0, 0.5, 1], [0, 0.5, 1]);
        return { transform: [{ translateY }], opacity };
    });

    const renderIcon = () => {
        if (!icon) return <FileX size={36} color={EHR_ON_SURFACE_VARIANT} />;
        if (React.isValidElement(icon)) return icon;
        const isComponentType =
            typeof icon === 'function'
            || (typeof icon === 'object' && icon !== null && 'render' in icon);
        if (isComponentType) {
            const IconComponent = icon as React.ElementType;
            return <IconComponent size={36} color={EHR_ON_SURFACE_VARIANT} />;
        }
        return <FileX size={36} color={EHR_ON_SURFACE_VARIANT} />;
    };

    return (
        <YStack flex={1} style={s.container}>
            <Animated.View style={iconContainerStyle}>
                <View style={s.iconCircle}>
                    {renderIcon()}
                </View>
            </Animated.View>

            <Animated.View style={textStyle}>
                <Text style={s.heading}>{heading}</Text>
                {body ? <Text style={s.body}>{body}</Text> : null}

                {actionLabel && onAction ? (
                    <Pressable
                        onPress={onAction}
                        disabled={isLoading}
                        style={({ pressed }) => [
                            s.ctaWrap,
                            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                            isLoading && { opacity: 0.6 },
                        ]}
                    >
                        <LinearGradient
                            colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={s.ctaGradient}
                        >
                            {isLoading ? <Loader2 size={16} color={EHR_ON_PRIMARY} /> : null}
                            <Text style={s.ctaText}>{actionLabel}</Text>
                        </LinearGradient>
                    </Pressable>
                ) : null}
            </Animated.View>
        </YStack>
    );
}

const s = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
        paddingHorizontal: 32,
    },
    iconCircle: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: EHR_PRIMARY_FIXED,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    heading: {
        fontSize: 18,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
        textAlign: 'center',
        marginBottom: 8,
    },
    body: {
        fontSize: 14,
        color: EHR_ON_SURFACE_VARIANT,
        textAlign: 'center',
        lineHeight: 21,
    },
    ctaWrap: {
        marginTop: 20,
        alignSelf: 'center',
        borderRadius: 14,
        overflow: 'hidden',
    },
    ctaGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 14,
    },
    ctaText: {
        fontSize: 15,
        fontWeight: '700',
        color: EHR_ON_PRIMARY,
    },
});
