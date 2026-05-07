// ViButton — primary CTA primitive for the redesign port (Tầng 3).
//
// Source: .design-bundle/project/ui.jsx ViButton.
// Variants:
//   primary    — paper-on-ink (or ink-on-paper for light mode). The default
//                CTA — "Bắt đầu", "Tiếp tục", "Lưu".
//   cinnabar   — cinnabar fill. RESERVED for legal-action moments (sign
//                consent, add Trusted Contact, call emergency contact). Don't
//                use as a generic CTA.
//   ghost      — outlined, transparent. Secondary action ("Huỷ", "Quay lại").
//   danger     — outlined danger color. Destructive action ("Thu hồi").
//
// Sizes: sm (compact, used in row actions) / md (default) / lg (full-width
// primary CTAs).

import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Text } from 'tamagui';
import {
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_ON_SURFACE,
    EHR_SURFACE,
    EHR_OUTLINE_VARIANT,
    EHR_DANGER,
} from '../constants/uiColors';

export type ViButtonVariant = 'primary' | 'cinnabar' | 'ghost' | 'danger';
export type ViButtonSize = 'sm' | 'md' | 'lg';

export interface ViButtonProps {
    children: React.ReactNode;
    onPress?: () => void;
    variant?: ViButtonVariant;
    size?: ViButtonSize;
    full?: boolean;
    disabled?: boolean;
    loading?: boolean;
    leftIcon?: React.ReactNode;
}

const sizeMap: Record<ViButtonSize, { padY: number; padX: number; font: number }> = {
    sm: { padY: 8, padX: 14, font: 13 },
    md: { padY: 13, padX: 18, font: 15 },
    lg: { padY: 16, padX: 20, font: 16 },
};

export default function ViButton({
    children,
    onPress,
    variant = 'primary',
    size = 'md',
    full = false,
    disabled = false,
    loading = false,
    leftIcon,
}: ViButtonProps) {
    const s = sizeMap[size];

    // Color schemes match .design-bundle/project/ui.jsx — primary is the
    // "ink/paper inverse" pattern (high-contrast neutral), cinnabar is the
    // hot accent reserved for legal-action moments.
    const styles = {
        primary: { bg: EHR_ON_SURFACE, fg: EHR_SURFACE, border: 'transparent' },
        cinnabar: { bg: EHR_PRIMARY, fg: '#FEFBF5', border: 'transparent' },
        ghost: { bg: 'transparent', fg: EHR_ON_SURFACE, border: EHR_OUTLINE_VARIANT },
        danger: { bg: 'transparent', fg: EHR_DANGER, border: EHR_OUTLINE_VARIANT },
    }[variant];

    const isDisabled = disabled || loading;

    return (
        <Pressable
            onPress={onPress}
            disabled={isDisabled}
            style={({ pressed }) => ({
                width: full ? '100%' : 'auto',
                paddingVertical: s.padY,
                paddingHorizontal: s.padX,
                backgroundColor: styles.bg,
                borderColor: styles.border === 'transparent' ? 'transparent' : styles.border,
                borderWidth: 0.75,
                borderRadius: 12,
                opacity: isDisabled ? 0.4 : pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
            })}
        >
            {loading ? (
                <ActivityIndicator size="small" color={styles.fg} />
            ) : (
                <>
                    {leftIcon ? <View style={{ marginRight: 0 }}>{leftIcon}</View> : null}
                    <Text
                        style={{
                            color: styles.fg,
                            fontSize: s.font,
                            fontWeight: '600',
                            letterSpacing: 0.1,
                        }}
                    >
                        {children}
                    </Text>
                </>
            )}
        </Pressable>
    );
}
