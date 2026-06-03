// ViSealLogo — squircle "con dấu son" với chữ V serif + nhịp tim ngọc bích.
//
// Hướng C của bộ nhận diện ViEH (chốt 2026-06-03): kết hợp 2 hình tượng
//   1. Con dấu son (chu sa) trên giấy gạo — thẩm quyền hồ sơ y tế
//   2. Nhịp ECG ngọc bích — biểu tượng y khoa
//
// Render qua react-native-svg + expo-linear-gradient để giữ độ nét ở mọi kích thước.
// CSS gốc trong ViEH App Logo.html (concept "pulse"):
//   - bg: linear-gradient(157deg, #DB6346 0%, #D45A3F 42%, #B84628 100%)
//   - glow overlay: radial-gradient(120% 80% at 28% 8%, rgba(255,255,255,0.28))
//   - frame: inset 8.5%, border 1.4px rgba(255,255,255,0.30), radius 17%
//   - glyph: Fraunces 600, color #FAF7F1, font-size 78px @ 128px container
//   - pulse: viewBox 128x20, stroke #CFE3D6 2.4px, opacity 0.92, bottom 19%
//     path: M10 12 H44 L52 4 L62 16 L70 12 H118

import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'tamagui';

const SERIF_SEMI = 'Fraunces_600SemiBold';

export interface ViSealLogoProps {
    size?: number;
    /** Bỏ pulse line khi size quá nhỏ (<28px) để giữ rõ ràng. Mặc định auto theo size. */
    showPulse?: boolean;
    /** Bỏ inner frame border khi size rất nhỏ (<24px). Mặc định auto. */
    showFrame?: boolean;
}

const CINNABAR_TOP = '#DB6346';
const CINNABAR_MID = '#D45A3F';
const CINNABAR_DEEP = '#B84628';
const PAPER = '#FAF7F1';
const PULSE_JADE = '#CFE3D6';

export default function ViSealLogo({ size = 64, showPulse, showFrame }: ViSealLogoProps) {
    // Mặc định auto: pulse hiển thị khi size >= 28, frame khi size >= 24.
    const renderPulse = showPulse ?? size >= 28;
    const renderFrame = showFrame ?? size >= 24;

    // Squircle radius = 22.5% theo iOS app icon radius ratio.
    const radius = Math.round(size * 0.225);
    // Frame inset 8.5%, radius 17%.
    const frameInset = Math.round(size * 0.085);
    const frameSize = size - frameInset * 2;
    const frameRadius = Math.round(size * 0.17);
    const frameBorder = Math.max(1, size * 0.011);
    // Glyph chữ V — Fraunces 600, line-height 0.8, kích cỡ 61% container (78/128).
    const glyphSize = Math.round(size * 0.61);
    // Pulse SVG đặt ở đáy: bottom 19% container.
    const pulseBottom = Math.round(size * 0.19);
    const pulseWidth = size;
    const pulseHeight = Math.round(size * 0.156); // 20/128 ratio
    const pulseStroke = Math.max(1, size * 0.019); // 2.4/128 ratio

    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: radius,
                overflow: 'hidden',
                position: 'relative',
                // Shadow nhẹ để tạo độ "in dấu" — chỉ hiện ở size lớn.
                ...(size >= 48
                    ? {
                          shadowColor: '#000',
                          shadowOpacity: 0.35,
                          shadowOffset: { width: 0, height: Math.round(size * 0.14) },
                          shadowRadius: Math.round(size * 0.31),
                          elevation: 8,
                      }
                    : null),
            }}
        >
            {/* Cinnabar gradient base */}
            <LinearGradient
                colors={[CINNABAR_TOP, CINNABAR_MID, CINNABAR_DEEP]}
                locations={[0, 0.42, 1]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ ...absoluteFill }}
            />
            {/* Glow radial overlay (top-left) */}
            <Svg
                width={size}
                height={size}
                style={{ position: 'absolute', top: 0, left: 0 }}
            >
                <Defs>
                    <RadialGradient
                        id="sealGlow"
                        cx="28%"
                        cy="8%"
                        rx="60%"
                        ry="40%"
                    >
                        <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.28} />
                        <Stop offset="55%" stopColor="#FFFFFF" stopOpacity={0} />
                    </RadialGradient>
                </Defs>
                <Rect x={0} y={0} width={size} height={size} fill="url(#sealGlow)" />
            </Svg>

            {/* Inner frame border (khung dấu triện) */}
            {renderFrame ? (
                <View
                    style={{
                        position: 'absolute',
                        top: frameInset,
                        left: frameInset,
                        width: frameSize,
                        height: frameSize,
                        borderRadius: frameRadius,
                        borderWidth: frameBorder,
                        borderColor: 'rgba(255,255,255,0.30)',
                    }}
                    pointerEvents="none"
                />
            ) : null}

            {/* Chữ V serif */}
            <View
                style={{
                    ...absoluteFill,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
                pointerEvents="none"
            >
                <Text
                    style={{
                        fontFamily: SERIF_SEMI,
                        fontSize: glyphSize,
                        color: PAPER,
                        lineHeight: glyphSize * 0.85,
                        fontWeight: '600',
                        includeFontPadding: false,
                        textAlignVertical: 'center',
                        // Tinh chỉnh optical: nhích lên một chút để cân với pulse phía dưới.
                        marginTop: renderPulse ? -Math.round(size * 0.06) : 0,
                    }}
                >
                    V
                </Text>
            </View>

            {/* ECG pulse line ngọc bích */}
            {renderPulse ? (
                <Svg
                    width={pulseWidth}
                    height={pulseHeight}
                    viewBox="0 0 128 20"
                    preserveAspectRatio="none"
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: pulseBottom,
                    }}
                >
                    <Path
                        d="M10 12 H44 L52 4 L62 16 L70 12 H118"
                        stroke={PULSE_JADE}
                        strokeWidth={pulseStroke}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        opacity={0.92}
                    />
                </Svg>
            ) : null}
        </View>
    );
}

const absoluteFill = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
};
