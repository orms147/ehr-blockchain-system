// ViCard — surface card primitive for the redesign port (Tầng 3).
//
// Source: .design-bundle/project/ui.jsx ViCard. Subtle border + soft press
// scale. Used everywhere a list item or info group needs to lift off the
// background.

import React from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import { useEhrPalette } from '../constants/uiColors';

export interface ViCardProps {
    children: React.ReactNode;
    onPress?: () => void;
    padding?: number;
    style?: ViewStyle;
}

export default function ViCard({
    children,
    onPress,
    padding = 16,
    style,
}: ViCardProps) {
    const palette = useEhrPalette();
    const baseStyle: ViewStyle = {
        backgroundColor: palette.EHR_SURFACE_LOWEST,
        borderColor: palette.EHR_OUTLINE_SOFT,
        borderWidth: 0.75,
        borderRadius: 14,
        padding,
        ...style,
    };

    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                style={({ pressed }) => ({
                    ...baseStyle,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                })}
            >
                {children}
            </Pressable>
        );
    }

    return <View style={baseStyle}>{children}</View>;
}
