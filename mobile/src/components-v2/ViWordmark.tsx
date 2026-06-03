// ViWordmark — brand wordmark "ViEH" cho splash / login / header.
//
// Có 2 chế độ:
//   - Mặc định (text-only): chữ "ViEH" mixed Fraunces italic + bold
//   - withSeal=true: prepend ViSealLogo (hướng C — dấu son + nhịp) bên trái
//
// Khi prop withSeal bật, size áp dụng cho TEXT (seal sẽ scale theo ratio
// 0.85 * size để cân quang học với baseline chữ).

import React from 'react';
import { Text, XStack } from 'tamagui';
import ViSealLogo from './ViSealLogo';

export interface ViWordmarkProps {
    size?: number;
    color?: string;
    withSeal?: boolean;
    /** Tuỳ biến gap giữa seal và text. Mặc định = size * 0.18 */
    sealGap?: number;
}

export default function ViWordmark({
    size = 44,
    color,
    withSeal = false,
    sealGap,
}: ViWordmarkProps) {
    const px = (n: number) => Math.round(n);
    const sealSize = Math.round(size * 1.05);
    const gap = sealGap ?? Math.round(size * 0.32);

    return (
        <XStack style={{ alignItems: 'center' }}>
            {withSeal ? (
                <XStack style={{ marginRight: gap, alignItems: 'center' }}>
                    <ViSealLogo size={sealSize} />
                </XStack>
            ) : null}
            <XStack style={{ alignItems: 'baseline' }}>
                <Text
                    style={{
                        fontFamily: 'Fraunces_400Regular_Italic',
                        fontSize: px(size * 1.0),
                        color,
                        fontStyle: 'italic',
                        letterSpacing: -0.5,
                    }}
                >
                    Vi
                </Text>
                <Text
                    style={{
                        fontFamily: 'Fraunces_700Bold',
                        fontSize: px(size * 1.0),
                        color,
                        letterSpacing: -0.5,
                    }}
                >
                    EH
                </Text>
            </XStack>
        </XStack>
    );
}
