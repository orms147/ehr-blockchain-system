import React, { useEffect } from 'react';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withDelay,
    withSpring,
    withTiming,
    Easing,
    interpolate,
} from 'react-native-reanimated';

type AnimatedSectionProps = {
    children: React.ReactNode;
    delay?: number;
    distance?: number;
    /** 3D entrance: subtle rotateX perspective tilt */
    tilt?: boolean;
};

const SPRING_CONFIG = {
    damping: 18,
    stiffness: 120,
    mass: 0.8,
};

export default function AnimatedSection({
    children,
    delay = 0,
    distance = 18,
    tilt = true,
}: AnimatedSectionProps) {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withDelay(
            delay,
            withSpring(1, SPRING_CONFIG)
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
        const translateY = interpolate(progress.value, [0, 1], [distance, 0]);
        const opacity = interpolate(progress.value, [0, 0.4, 1], [0, 0.6, 1]);
        const scale = interpolate(progress.value, [0, 1], [0.97, 1]);
        const rotateX = tilt
            ? `${interpolate(progress.value, [0, 1], [6, 0])}deg`
            : '0deg';

        return {
            opacity,
            transform: [
                { perspective: 800 },
                { translateY },
                { scale },
                { rotateX },
            ],
        };
    });

    return (
        <Animated.View style={animatedStyle}>
            {children}
        </Animated.View>
    );
}
