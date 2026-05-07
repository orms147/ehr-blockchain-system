// ViWordmark — brand wordmark "ViEH" for splash / login / header logos.
//
// Source: derived from .design-bundle/project/ui.jsx — the design renders
// the wordmark inline with mixed fontWeight (400 italic for "Vi", 600 for
// "EH") to evoke a serif logotype on the dark surface.

import React from 'react';
import { Text, XStack } from 'tamagui';

export interface ViWordmarkProps {
    size?: number;
    color?: string;
}

export default function ViWordmark({ size = 44, color }: ViWordmarkProps) {
    const px = (n: number) => Math.round(n);

    return (
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
    );
}
