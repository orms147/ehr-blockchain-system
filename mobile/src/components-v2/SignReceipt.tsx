// SignReceipt — Wave O per screens-patient.jsx:1076 (Claude Design).
//
// Final ceremony screen shown after PendingChainOverlay completes. Renders
// as a paper-textured receipt with:
//   - ViWordmark + receipt ID
//   - Serif title "Biên nhận chữ ký đồng ý" / "Biên nhận từ chối"
//   - KV summary rows (signer, recipient, record, scope, validity, time)
//   - Signature area: serif italic name + cinnabar seal stamp
//   - Footer note + "Xong" CTA
//
// Pattern: full-screen Modal with paper-grain background. User taps "Xong"
// → onDone closes + parent refreshes list.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'tamagui';
import { Check, X as XIcon } from 'lucide-react-native';

import { useEhrPalette } from '../constants/uiColors';
import ViWordmark from './ViWordmark';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

export interface SignReceiptData {
    /** "approve" (default) renders "Biên nhận chữ ký đồng ý"; "reject" renders "Biên nhận từ chối" */
    action?: 'approve' | 'reject';
    signerName?: string | null;
    recipientName?: string | null;
    recipientOrg?: string | null;
    recordTitle?: string | null;
    scopeLabel?: string | null;
    validityLabel?: string | null;
    /** ISO datetime of the signing — default: now() */
    signedAt?: string;
    /** Short tx hash for audit row */
    txHashShort?: string | null;
}

export interface SignReceiptProps {
    visible: boolean;
    data: SignReceiptData | null;
    onDone: () => void;
}

function formatReceiptId(): string {
    const d = new Date();
    return `VN-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatSignedAt(iso?: string): string {
    const d = iso ? new Date(iso) : new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}·${mm}·${yy} · ${hh}:${min}`;
}

function formatSealDate(iso?: string): string {
    const d = iso ? new Date(iso) : new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}·${mm}·${yy}`;
}

export default function SignReceipt({ visible, data, onDone }: SignReceiptProps) {
    const palette = useEhrPalette();
    if (!data) return null;

    const isReject = data.action === 'reject';
    const title = isReject ? 'Biên nhận từ chối' : 'Biên nhận chữ ký đồng ý';

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onDone}>
            <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top', 'bottom']}>
                {/* Top bar */}
                <View
                    style={{
                        paddingHorizontal: 20,
                        paddingVertical: 14,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <Text style={{ fontFamily: MONO, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: '700' }}>
                        Biên nhận đã ký
                    </Text>
                    <Pressable onPress={onDone} hitSlop={8}>
                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 13, color: palette.EHR_ON_SURFACE_VARIANT, fontWeight: '600' }}>
                            Đóng
                        </Text>
                    </Pressable>
                </View>

                <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
                    {/* Paper receipt */}
                    <View
                        style={{
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderRadius: 14,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            padding: 22,
                            position: 'relative',
                        }}
                    >
                        {/* Paper grain — 4 hairlines at varied positions */}
                        <PaperGrain palette={palette} />

                        {/* Receipt header */}
                        <View
                            style={{
                                paddingBottom: 14,
                                borderBottomWidth: 0.5,
                                borderBottomColor: palette.EHR_OUTLINE_SOFT,
                                flexDirection: 'row',
                                alignItems: 'baseline',
                                justifyContent: 'space-between',
                            }}
                        >
                            <ViWordmark size={18} color={palette.EHR_ON_SURFACE} />
                            <Text style={{ fontFamily: MONO, fontSize: 11, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.4 }}>
                                {formatReceiptId()}
                            </Text>
                        </View>

                        {/* Serif title */}
                        <Text
                            style={{
                                marginTop: 20,
                                fontFamily: SERIF,
                                fontSize: 19,
                                fontWeight: '500',
                                lineHeight: 26,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                            }}
                        >
                            {title}
                        </Text>

                        {/* KV rows */}
                        <View style={{ marginTop: 18, gap: 14 }}>
                            {data.signerName ? <RcptRow k="Người ký" v={data.signerName} palette={palette} /> : null}
                            {data.recipientName ? (
                                <RcptRow
                                    k="Người được phép"
                                    v={data.recipientOrg ? `${data.recipientName} · ${data.recipientOrg}` : data.recipientName}
                                    palette={palette}
                                />
                            ) : null}
                            {data.recordTitle ? <RcptRow k="Hồ sơ" v={data.recordTitle} palette={palette} /> : null}
                            {data.scopeLabel ? <RcptRow k="Phạm vi" v={data.scopeLabel} palette={palette} /> : null}
                            {data.validityLabel ? <RcptRow k="Hiệu lực" v={data.validityLabel} palette={palette} /> : null}
                            <RcptRow k="Thời điểm ký" v={formatSignedAt(data.signedAt)} mono palette={palette} />
                            {data.txHashShort ? <RcptRow k="Mã giao dịch" v={data.txHashShort} mono palette={palette} /> : null}
                        </View>

                        {/* Signature area: serif italic name + CinnabarSeal */}
                        <View
                            style={{
                                marginTop: 26,
                                paddingTop: 20,
                                borderTopWidth: 0.5,
                                borderStyle: 'dashed',
                                borderTopColor: palette.EHR_OUTLINE_SOFT,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 18,
                            }}
                        >
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={{
                                        fontFamily: SERIF_ITALIC,
                                        fontStyle: 'italic',
                                        fontSize: 22,
                                        fontWeight: '500',
                                        color: palette.EHR_ON_SURFACE,
                                        letterSpacing: -0.3,
                                    }}
                                >
                                    {data.signerName || 'Chủ tài khoản'}
                                </Text>
                                <Text
                                    style={{
                                        marginTop: 6,
                                        paddingTop: 4,
                                        borderTopWidth: 0.5,
                                        borderTopColor: palette.EHR_OUTLINE_SOFT,
                                        fontFamily: MONO,
                                        fontSize: 10,
                                        color: palette.EHR_TEXT_MUTED,
                                        letterSpacing: 0.3,
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    chữ ký điện tử
                                </Text>
                            </View>
                            <CinnabarSeal
                                palette={palette}
                                dateLabel={formatSealDate(data.signedAt)}
                                action={data.action}
                            />
                        </View>
                    </View>

                    {/* Footer note */}
                    <Text
                        style={{
                            marginTop: 16,
                            fontFamily: SANS,
                            fontSize: 11.5,
                            color: palette.EHR_TEXT_MUTED,
                            lineHeight: 18,
                            textAlign: 'center',
                            paddingHorizontal: 12,
                        }}
                    >
                        Bản biên nhận này được lưu trong nhật ký. Bạn có thể xem hoặc thu hồi quyền này bất cứ lúc nào.
                    </Text>
                </ScrollView>

                {/* Done CTA */}
                <View style={{ paddingHorizontal: 20, paddingBottom: 16, paddingTop: 6 }}>
                    <Pressable
                        onPress={onDone}
                        style={({ pressed }) => ({
                            paddingVertical: 16,
                            borderRadius: 12,
                            backgroundColor: palette.EHR_ON_SURFACE,
                            alignItems: 'center',
                            opacity: pressed ? 0.85 : 1,
                        })}
                    >
                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 15, fontWeight: '700', color: palette.EHR_SURFACE, letterSpacing: 0.1 }}>
                            Xong
                        </Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        </Modal>
    );
}

function RcptRow({ k, v, mono, palette }: { k: string; v: string; mono?: boolean; palette: any }) {
    return (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 14 }}>
            <Text
                style={{
                    width: 92,
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                }}
            >
                {k}
            </Text>
            <Text
                style={{
                    flex: 1,
                    fontFamily: mono ? MONO : SANS,
                    fontSize: 13.5,
                    color: palette.EHR_ON_SURFACE,
                    lineHeight: 19,
                    fontWeight: mono ? '600' : '400',
                }}
            >
                {v}
            </Text>
        </View>
    );
}

// Paper-grain texture overlay — pseudo-watermark via thin horizontal lines
function PaperGrain({ palette }: { palette: any }) {
    const lineColor = `${palette.EHR_ON_SURFACE_VARIANT}0F`;
    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                opacity: 0.55,
            }}
        >
            {Array.from({ length: 12 }).map((_, i) => (
                <View
                    key={i}
                    style={{
                        height: 1,
                        backgroundColor: lineColor,
                        marginTop: i === 0 ? 30 : 27,
                    }}
                />
            ))}
        </View>
    );
}

// CinnabarSeal — animated stamp-in cinnabar circle with date label.
// `action='reject'` → X icon (từ chối); mặc định / 'approve' → Check icon.
function CinnabarSeal({
    palette,
    dateLabel,
    action,
}: {
    palette: any;
    dateLabel: string;
    action?: 'approve' | 'reject';
}) {
    const scale = useRef(new Animated.Value(0.5)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const rotate = useRef(new Animated.Value(-12)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(scale, { toValue: 1, tension: 130, friction: 7, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
            Animated.spring(rotate, { toValue: -8, tension: 100, friction: 10, useNativeDriver: true }),
        ]).start();
    }, [scale, opacity, rotate]);

    const rotateInterpolated = rotate.interpolate({ inputRange: [-12, -8], outputRange: ['-12deg', '-8deg'] });

    return (
        <Animated.View
            style={{
                width: 78,
                height: 78,
                borderRadius: 39,
                borderWidth: 2.5,
                borderColor: palette.EHR_CINNABAR_DEEP,
                alignItems: 'center',
                justifyContent: 'center',
                transform: [{ scale }, { rotate: rotateInterpolated }],
                opacity,
                backgroundColor: `${palette.EHR_CINNABAR_DEEP}14`,
            }}
        >
            {action === 'reject' ? (
                <XIcon size={28} color={palette.EHR_CINNABAR_DEEP} strokeWidth={2.8} />
            ) : (
                <Check size={28} color={palette.EHR_CINNABAR_DEEP} strokeWidth={2.8} />
            )}
            <Text
                style={{
                    marginTop: 1,
                    fontFamily: MONO,
                    fontSize: 8.5,
                    color: palette.EHR_CINNABAR_DEEP,
                    letterSpacing: 0.4,
                    fontWeight: '700',
                }}
            >
                {dateLabel}
            </Text>
        </Animated.View>
    );
}
