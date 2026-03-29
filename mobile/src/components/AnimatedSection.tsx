import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

type AnimatedSectionProps = {
    children: React.ReactNode;
    delay?: number;
    distance?: number;
};

export default function AnimatedSection({ children, delay = 0, distance = 14 }: AnimatedSectionProps) {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(anim, {
            toValue: 1,
            duration: 420,
            delay,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [anim, delay]);

    return (
        <Animated.View
            style={{
                opacity: anim,
                transform: [
                    {
                        translateY: anim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [distance, 0],
                        }),
                    },
                ],
            }}
        >
            {children}
        </Animated.View>
    );
}
