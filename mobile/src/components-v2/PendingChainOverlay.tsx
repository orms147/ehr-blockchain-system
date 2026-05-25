// PendingChainOverlay — Wave L per screens-patient.jsx:966 (Claude Design).
//
// Full-screen overlay shown AFTER ConsentSheet's done phase while we wait
// for the on-chain tx receipt to confirm. 3 stages with timing-paced
// progression, concentric ring ripples + spinning seal that settles to
// checkmark when confirmed.
//
// Pattern: parent controls `stage` (0..2). When stage hits 2 (confirmed),
// auto-fade and call onDone after a short delay.
//
// Stages:
//   0 — "Phát đi chữ ký"   (broadcasting)
//   1 — "Đang xác nhận"    (waiting receipt)
//   2 — "Đã ghi nhận"      (confirmed — seal settles to checkmark)

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, View } from 'react-native';
import { Text } from 'tamagui';
import { Check } from 'lucide-react-native';

import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

export type ChainStage = 0 | 1 | 2;

export interface PendingChainOverlayProps {
    visible: boolean;
    stage: ChainStage;
    /** "BS. Hồ Văn Sơn · BV Bạch Mai" — context line at bottom */
    contextLabel?: string;
    /** Shown when stage=2: truncated tx hash 0x... for blockchain-visible mode */
    txHashShort?: string | null;
    /** Fires after stage=2 + 800ms — parent should setVisible(false) */
    onDone?: () => void;
}

const STAGES_LABELS: Array<{ label: string; sub: string }> = [
    { label: 'Phát đi chữ ký', sub: 'Mã hoá và gửi tới mạng' },
    { label: 'Đang xác nhận', sub: 'Backend relayer broadcasts' },
    { label: 'Đã ghi nhận', sub: 'Vĩnh viễn không sửa được' },
];

export default function PendingChainOverlay({
    visible, stage, contextLabel, txHashShort, onDone,
}: PendingChainOverlayProps) {
    const palette = useEhrPalette();

    // Auto-fire onDone after stage=2 settles
    useEffect(() => {
        if (stage === 2 && onDone) {
            const t = setTimeout(onDone, 1200);
            return () => clearTimeout(t);
        }
    }, [stage, onDone]);

    const labels = useMemo(() => {
        if (stage === 2 && txHashShort) {
            return [...STAGES_LABELS.slice(0, 2), { label: 'Đã ghi nhận', sub: `Tx · ${txHashShort}` }];
        }
        return STAGES_LABELS;
    }, [stage, txHashShort]);

    return (
        <Modal visible={visible} transparent animationType="fade">
            <View
                style={{
                    flex: 1,
                    backgroundColor: palette.EHR_SURFACE,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 36,
                }}
            >
                {/* Subtle ink wash background — radial cinnabar tint */}
                <View
                    pointerEvents="none"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '60%',
                        backgroundColor: `${palette.EHR_CINNABAR_DEEP}0A`,
                    }}
                />

                {/* Seal + ripples */}
                <View style={{ width: 160, height: 160, marginBottom: 42, alignItems: 'center', justifyContent: 'center' }}>
                    {stage < 2 ? <RippleRings color={palette.EHR_CINNABAR_DEEP} /> : null}
                    <Seal stage={stage} palette={palette} />
                </View>

                {/* Stage label */}
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 22,
                        fontWeight: '500',
                        letterSpacing: -0.3,
                        color: palette.EHR_ON_SURFACE,
                        textAlign: 'center',
                        minHeight: 32,
                    }}
                >
                    {labels[stage].label}
                </Text>
                <Text
                    style={{
                        marginTop: 8,
                        fontFamily: stage === 2 && txHashShort ? MONO : SANS,
                        fontSize: 12.5,
                        color: palette.EHR_TEXT_MUTED,
                        letterSpacing: stage === 2 && txHashShort ? 0 : 0.2,
                        minHeight: 18,
                        textAlign: 'center',
                    }}
                >
                    {labels[stage].sub}
                </Text>

                {/* 3-step progress bar + context label at bottom */}
                <View
                    style={{
                        position: 'absolute',
                        bottom: 80,
                        left: 36,
                        right: 36,
                        gap: 10,
                    }}
                >
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        {[0, 1, 2].map((i) => (
                            <ProgressTick
                                key={i}
                                active={i <= stage}
                                cinnabar={palette.EHR_CINNABAR_DEEP}
                                idle={palette.EHR_OUTLINE_SOFT}
                            />
                        ))}
                    </View>
                    {contextLabel ? (
                        <Text
                            style={{
                                fontFamily: MONO,
                                fontSize: 10.5,
                                color: palette.EHR_TEXT_MUTED,
                                letterSpacing: 1.4,
                                textTransform: 'uppercase',
                                fontWeight: '700',
                                textAlign: 'center',
                            }}
                        >
                            {contextLabel}
                        </Text>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
}

function ProgressTick({ active, cinnabar, idle }: { active: boolean; cinnabar: string; idle: string }) {
    const bg = useRef(new Animated.Value(active ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(bg, {
            toValue: active ? 1 : 0,
            duration: 380,
            useNativeDriver: false,
        }).start();
    }, [active, bg]);

    const backgroundColor = bg.interpolate({
        inputRange: [0, 1],
        outputRange: [idle, cinnabar],
    });

    return (
        <Animated.View
            style={{
                flex: 1,
                height: 2,
                borderRadius: 1,
                backgroundColor,
            }}
        />
    );
}

function RippleRings({ color }: { color: string }) {
    const ring1 = useRef(new Animated.Value(0)).current;
    const ring2 = useRef(new Animated.Value(0)).current;
    const ring3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animate = (ring: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(ring, {
                        toValue: 1,
                        duration: 2200,
                        easing: Easing.out(Easing.quad),
                        useNativeDriver: true,
                    }),
                    Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
                ]),
            );
        animate(ring1, 0).start();
        animate(ring2, 700).start();
        animate(ring3, 1400).start();
    }, [ring1, ring2, ring3]);

    return (
        <>
            {[ring1, ring2, ring3].map((v, i) => {
                const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] });
                const opacity = v.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.6, 0] });
                return (
                    <Animated.View
                        key={i}
                        style={{
                            position: 'absolute',
                            width: 160,
                            height: 160,
                            borderRadius: 80,
                            borderWidth: 1,
                            borderColor: color,
                            opacity,
                            transform: [{ scale }],
                        }}
                    />
                );
            })}
        </>
    );
}

function Seal({ stage, palette }: { stage: ChainStage; palette: any }) {
    const spin = useRef(new Animated.Value(0)).current;
    const settleScale = useRef(new Animated.Value(1)).current;
    const checkScale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (stage < 2) {
            // Spin while broadcasting/confirming
            Animated.loop(
                Animated.timing(spin, {
                    toValue: 1,
                    duration: 2400,
                    easing: Easing.linear,
                    useNativeDriver: true,
                }),
            ).start();
        } else {
            // Settle + check draw
            spin.stopAnimation();
            Animated.sequence([
                Animated.spring(settleScale, { toValue: 1.1, tension: 130, friction: 8, useNativeDriver: true }),
                Animated.spring(settleScale, { toValue: 1, tension: 160, friction: 10, useNativeDriver: true }),
            ]).start();
            Animated.sequence([
                Animated.delay(160),
                Animated.spring(checkScale, { toValue: 1, tension: 160, friction: 7, useNativeDriver: true }),
            ]).start();
        }
    }, [stage, spin, settleScale, checkScale]);

    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

    return (
        <Animated.View
            style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: palette.EHR_CINNABAR_DEEP,
                alignItems: 'center',
                justifyContent: 'center',
                transform: stage < 2
                    ? [{ rotate }]
                    : [{ scale: settleScale }],
                shadowColor: palette.EHR_CINNABAR_DEEP,
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.45,
                shadowRadius: 20,
                elevation: 10,
            }}
        >
            {stage < 2 ? (
                // Quarter-circle arc to indicate spinning
                <View
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        borderWidth: 2.2,
                        borderColor: 'rgba(251,248,241,0.25)',
                        borderTopColor: '#FBF8F1',
                    }}
                />
            ) : (
                <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                    <Check size={36} color="#FBF8F1" strokeWidth={2.6} />
                </Animated.View>
            )}
        </Animated.View>
    );
}

void SANS_SEMI;
