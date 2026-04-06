import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { View, Text } from 'tamagui';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    withDelay,
    withSpring,
    Easing,
    interpolate,
} from 'react-native-reanimated';
import {
    EHR_ON_SURFACE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
} from '../constants/uiColors';

interface LoadingSpinnerProps {
    message?: string;
    fullScreen?: boolean;
    size?: 'small' | 'medium' | 'large';
}

const DOT_SIZE = { small: 8, medium: 10, large: 12 };
const DOT_COLORS = [EHR_PRIMARY, EHR_PRIMARY_CONTAINER, EHR_PRIMARY_FIXED];

function AnimatedDot({ index, dotSize }: { index: number; dotSize: number }) {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withDelay(
            index * 180,
            withRepeat(
                withSequence(
                    withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }),
                    withTiming(0, { duration: 400, easing: Easing.in(Easing.cubic) })
                ),
                -1,
                false
            )
        );
    }, []);

    const style = useAnimatedStyle(() => ({
        transform: [
            { translateY: interpolate(progress.value, [0, 1], [0, -14]) },
            { scale: interpolate(progress.value, [0, 0.5, 1], [1, 1.3, 1]) },
        ],
        opacity: interpolate(progress.value, [0, 0.5, 1], [0.5, 1, 0.5]),
    }));

    return (
        <Animated.View
            style={[
                style,
                {
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: DOT_COLORS[index % DOT_COLORS.length],
                    marginHorizontal: 5,
                },
            ]}
        />
    );
}

export default function LoadingSpinner({
    message = 'Đang tải dữ liệu...',
    fullScreen = true,
    size = 'large',
}: LoadingSpinnerProps) {
    const dotSize = DOT_SIZE[size];

    const textEnter = useSharedValue(0);
    useEffect(() => {
        textEnter.value = withSpring(1, { damping: 18, stiffness: 120, mass: 0.8 });
    }, []);

    const textPulse = useSharedValue(0);
    useEffect(() => {
        textPulse.value = withRepeat(
            withSequence(
                withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
                withTiming(0.6, { duration: 1200, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const textStyle = useAnimatedStyle(() => ({
        opacity: textPulse.value,
        transform: [
            { translateY: interpolate(textEnter.value, [0, 1], [12, 0]) },
        ],
    }));

    return (
        <View style={[s.container, fullScreen && s.fullScreen]}>
            <Animated.View style={s.dotsRow}>
                {[0, 1, 2].map((i) => (
                    <AnimatedDot key={i} index={i} dotSize={dotSize} />
                ))}
            </Animated.View>
            <Animated.View style={textStyle}>
                <Text style={s.message}>{message}</Text>
            </Animated.View>
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    fullScreen: {
        flex: 1,
        backgroundColor: EHR_SURFACE,
    },
    dotsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    message: {
        fontSize: 15,
        fontWeight: '500',
        color: EHR_ON_SURFACE_VARIANT,
    },
});
