// ConsentSheet — Wave L per screens-patient.jsx:876 (Claude Design).
//
// Patient approval/reject ceremony as bottom-sheet modal.
// 3 phases driven by parent state:
//   idle    → KV summary + 2 buttons (Ký đồng ý / Từ chối)
//   signing → ViInkFill progress bar + breathing status text
//   done    → CinnabarSeal animation (cinnabar circle + checkmark)
//
// Replaces the inline Alert flow in RequestsScreen with a proper ceremony.
// On done phase, parent auto-closes after ~1.4s and triggers list refresh.

import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { Check } from 'lucide-react-native';

import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

export type ConsentPhase = 'idle' | 'signing' | 'done';

export interface ConsentRequest {
    recipientName: string;
    recipientOrg?: string | null;
    recordTitle?: string | null;
    scopeLabel?: string;
    expiryLabel?: string;
    reason?: string | null;
}

export interface ConsentSheetProps {
    open: boolean;
    request: ConsentRequest | null;
    phase: ConsentPhase;
    /**
     * Intent quyết định button nào prominent (cinnabar primary, vị trí trên):
     * - 'approve' (default): "Ký đồng ý" prominent — user bấm "Mở để ký" trên row
     * - 'reject': "Từ chối" prominent — user bấm "Từ chối" trên row
     * Tránh user vào reject mode mà thấy "Ký đồng ý" nổi bật → bấm nhầm.
     */
    intent?: 'approve' | 'reject';
    /** Caller controls primary action — fires when user taps "Ký đồng ý" */
    onApprove: () => void;
    /** Caller controls reject action — fires when user taps "Từ chối" */
    onReject: () => void;
    /** Fires when user dismisses (only allowed during idle phase) */
    onClose: () => void;
}

export default function ConsentSheet({
    open, request, phase, intent = 'approve', onApprove, onReject, onClose,
}: ConsentSheetProps) {
    const palette = useEhrPalette();

    if (!request) return null;

    const canDismiss = phase === 'idle';

    return (
        <Modal
            visible={open}
            transparent
            animationType="slide"
            onRequestClose={canDismiss ? onClose : undefined}
        >
            <Pressable
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
                onPress={canDismiss ? onClose : undefined}
            >
                <Pressable
                    onPress={(e) => e.stopPropagation()}
                    style={{
                        backgroundColor: palette.EHR_SURFACE,
                        borderTopLeftRadius: 22,
                        borderTopRightRadius: 22,
                        maxHeight: '92%',
                        borderTopWidth: 0.5,
                        borderTopColor: palette.EHR_OUTLINE_SOFT,
                    }}
                >
                    {/* Drag handle */}
                    <View
                        style={{
                            width: 36,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: palette.EHR_OUTLINE_SOFT,
                            alignSelf: 'center',
                            marginTop: 12,
                            marginBottom: 14,
                        }}
                    />

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                            {/* Eyebrow */}
                            <Text
                                style={{
                                    fontFamily: MONO,
                                    fontSize: 11,
                                    color: palette.EHR_CINNABAR_DEEP,
                                    letterSpacing: 1.4,
                                    textTransform: 'uppercase',
                                    fontWeight: '700',
                                }}
                            >
                                Cần chữ ký của bạn
                            </Text>

                            {/* Serif italic title */}
                            <Text
                                style={{
                                    marginTop: 8,
                                    fontFamily: SERIF,
                                    fontSize: 22,
                                    color: palette.EHR_ON_SURFACE,
                                    fontWeight: '500',
                                    letterSpacing: -0.2,
                                    lineHeight: 28,
                                }}
                            >
                                Cho phép{' '}
                                <Text style={{ fontFamily: SERIF_ITALIC, fontStyle: 'italic' }}>
                                    {request.recipientName}
                                </Text>
                                {' '}xem hồ sơ của bạn?
                            </Text>

                            {/* KV CARD */}
                            <View
                                style={{
                                    marginTop: 18,
                                    paddingVertical: 14,
                                    paddingHorizontal: 16,
                                    borderRadius: 12,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    gap: 10,
                                }}
                            >
                                <KV label="Người được phép" value={
                                    request.recipientOrg
                                        ? `${request.recipientName} · ${request.recipientOrg}`
                                        : request.recipientName
                                } />
                                {request.recordTitle ? <KV label="Hồ sơ" value={request.recordTitle} /> : null}
                                {request.scopeLabel ? <KV label="Phạm vi" value={request.scopeLabel} /> : null}
                                {request.expiryLabel ? <KV label="Có hiệu lực" value={request.expiryLabel} /> : null}
                                <KV label="Lý do" value={request.reason || '—'} />
                            </View>

                            {/* Editorial note */}
                            <View
                                style={{
                                    marginTop: 14,
                                    paddingVertical: 10,
                                    paddingHorizontal: 14,
                                    borderLeftWidth: 1.5,
                                    borderLeftColor: palette.EHR_OUTLINE_SOFT,
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: SANS,
                                        fontSize: 11.5,
                                        color: palette.EHR_TEXT_MUTED,
                                        lineHeight: 18,
                                    }}
                                >
                                    Bạn có thể thu hồi quyền này bất cứ lúc nào trong mục{' '}
                                    <Text style={{ color: palette.EHR_ON_SURFACE_VARIANT, fontFamily: SANS_SEMI }}>
                                        Quyền truy cập
                                    </Text>
                                    . Mọi lần xem của bác sĩ đều được ghi lại trong nhật ký.
                                </Text>
                            </View>

                            {/* PHASE-dependent footer.
                                Intent='reject' → "Từ chối" prominent ở vị trí trên + màu danger;
                                "Đồng ý" ghost ở dưới. Tránh user bấm nhầm approve khi muốn reject. */}
                            {phase === 'idle' ? (
                                <View style={{ marginTop: 18, gap: 10 }}>
                                    {intent === 'reject' ? (
                                        <>
                                            <Pressable
                                                onPress={onReject}
                                                style={({ pressed }) => ({
                                                    paddingVertical: 16,
                                                    borderRadius: 12,
                                                    backgroundColor: palette.EHR_CINNABAR_DEEP,
                                                    alignItems: 'center',
                                                    opacity: pressed ? 0.85 : 1,
                                                })}
                                            >
                                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 15, fontWeight: '700', color: '#FBF8F1', letterSpacing: 0.1 }}>
                                                    Xác nhận từ chối
                                                </Text>
                                            </Pressable>
                                            <Pressable
                                                onPress={onApprove}
                                                style={({ pressed }) => ({
                                                    paddingVertical: 14,
                                                    borderRadius: 12,
                                                    borderWidth: 0.5,
                                                    borderColor: palette.EHR_OUTLINE,
                                                    alignItems: 'center',
                                                    opacity: pressed ? 0.7 : 1,
                                                })}
                                            >
                                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 14, fontWeight: '600', color: palette.EHR_ON_SURFACE }}>
                                                    Ký đồng ý
                                                </Text>
                                            </Pressable>
                                        </>
                                    ) : (
                                        <>
                                            <Pressable
                                                onPress={onApprove}
                                                style={({ pressed }) => ({
                                                    paddingVertical: 16,
                                                    borderRadius: 12,
                                                    backgroundColor: palette.EHR_CINNABAR_DEEP,
                                                    alignItems: 'center',
                                                    opacity: pressed ? 0.85 : 1,
                                                })}
                                            >
                                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 15, fontWeight: '700', color: '#FBF8F1', letterSpacing: 0.1 }}>
                                                    Ký đồng ý
                                                </Text>
                                            </Pressable>
                                            <Pressable
                                                onPress={onReject}
                                                style={({ pressed }) => ({
                                                    paddingVertical: 14,
                                                    borderRadius: 12,
                                                    borderWidth: 0.5,
                                                    borderColor: palette.EHR_OUTLINE,
                                                    alignItems: 'center',
                                                    opacity: pressed ? 0.7 : 1,
                                                })}
                                            >
                                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 14, fontWeight: '600', color: palette.EHR_ON_SURFACE }}>
                                                    Từ chối
                                                </Text>
                                            </Pressable>
                                        </>
                                    )}
                                </View>
                            ) : null}

                            {phase === 'signing' ? <SigningPhase palette={palette} /> : null}

                            {phase === 'done' ? <DonePhase palette={palette} /> : null}
                        </View>
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
    const palette = useEhrPalette();
    return (
        <XStack style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <Text
                style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                    flexShrink: 0,
                }}
            >
                {label}
            </Text>
            {typeof value === 'string' ? (
                <Text
                    style={{
                        flex: 1,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE,
                        textAlign: 'right',
                        lineHeight: 19,
                    }}
                    numberOfLines={3}
                >
                    {value}
                </Text>
            ) : (
                <View style={{ flex: 1, alignItems: 'flex-end' }}>{value}</View>
            )}
        </XStack>
    );
}

function SigningPhase({ palette }: { palette: any }) {
    // Animated progress bar — sweep cinnabar fill across track (no actual
    // progress data, just visual feedback that work is in progress).
    const progress = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
        // 1.5s sweep loop
        Animated.loop(
            Animated.sequence([
                Animated.timing(progress, { toValue: 1, duration: 1500, useNativeDriver: false }),
                Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: false }),
            ]),
        ).start();
        // Breathing text opacity
        Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.5, duration: 800, useNativeDriver: true }),
            ]),
        ).start();
    }, [progress, opacity]);

    const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

    return (
        <View style={{ marginTop: 26, alignItems: 'center' }}>
            <View
                style={{
                    width: '100%',
                    height: 3,
                    borderRadius: 1.5,
                    backgroundColor: palette.EHR_OUTLINE_SOFT,
                    overflow: 'hidden',
                }}
            >
                <Animated.View
                    style={{
                        width,
                        height: 3,
                        backgroundColor: palette.EHR_CINNABAR_DEEP,
                        borderRadius: 1.5,
                    }}
                />
            </View>
            <Animated.Text
                style={{
                    marginTop: 14,
                    fontFamily: SANS,
                    fontSize: 13,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 0.3,
                    opacity,
                }}
            >
                Đang chuẩn bị chữ ký…
            </Animated.Text>
        </View>
    );
}

function DonePhase({ palette }: { palette: any }) {
    // CinnabarSeal — cinnabar circle "stamps" in with spring scale + check
    // draws after. Subtle pulse glow ring underneath.
    const scale = useRef(new Animated.Value(0.4)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const checkScale = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(scale, { toValue: 1, tension: 140, friction: 8, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]).start();
        Animated.sequence([
            Animated.delay(180),
            Animated.spring(checkScale, { toValue: 1, tension: 160, friction: 7, useNativeDriver: true }),
        ]).start();
    }, [scale, opacity, checkScale]);

    return (
        <View style={{ marginTop: 26, alignItems: 'center', justifyContent: 'center', height: 130 }}>
            {/* Halo glow */}
            <Animated.View
                style={{
                    position: 'absolute',
                    width: 110,
                    height: 110,
                    borderRadius: 55,
                    backgroundColor: palette.EHR_CINNABAR_DEEP,
                    opacity: 0.12,
                    transform: [{ scale }],
                }}
            />
            {/* Seal circle */}
            <Animated.View
                style={{
                    width: 74,
                    height: 74,
                    borderRadius: 37,
                    backgroundColor: palette.EHR_CINNABAR_DEEP,
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ scale }],
                    opacity,
                    shadowColor: palette.EHR_CINNABAR_DEEP,
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.4,
                    shadowRadius: 16,
                    elevation: 8,
                }}
            >
                <Animated.View style={{ transform: [{ scale: checkScale }] }}>
                    <Check size={36} color="#FBF8F1" strokeWidth={2.6} />
                </Animated.View>
            </Animated.View>

            <Text
                style={{
                    position: 'absolute',
                    bottom: 0,
                    fontFamily: SERIF_ITALIC,
                    fontStyle: 'italic',
                    fontSize: 15,
                    color: palette.EHR_ON_SURFACE_VARIANT,
                    letterSpacing: -0.1,
                }}
            >
                Đã ký
            </Text>
        </View>
    );
}

void YStack;
