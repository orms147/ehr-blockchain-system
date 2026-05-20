// HexRow — display wallet address / cidHash with mono truncation + tap-to-expand
// bottom sheet showing full value in 16-char chunks + copy + QR (G.12.c).
//
// Design ref: `mobile/.design-bundle/project/ui.jsx#L286-L304` HexRow + L322+ HexFullSheet.
//
// Visual:
//   ┌──────────────────────────────────────────┐
//   │ LABEL (uppercase 10.5pt)                 │
//   │ 0xABCD…1234 (mono 13pt)             [📋] │
//   └──────────────────────────────────────────┘
//   Border 0.5px soft outline. Tap → sheet with full value + copy + optional QR.

import React, { useState } from 'react';
import { Modal, Pressable, View, Alert } from 'react-native';
import { XStack, YStack, Text } from 'tamagui';
import { Copy, X, QrCode as QrCodeIcon } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';

import { useEhrPalette } from '../constants/uiColors';

const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const SERIF = 'Fraunces_400Regular';
const MONO = 'monospace';

interface HexRowProps {
    label?: string;
    value: string;
    head?: number;
    tail?: number;
    /** Show QR button in sheet (default: true) */
    showQr?: boolean;
    /** Optional title for sheet (default: same as label) */
    sheetTitle?: string;
}

export function truncateHex(s: string | null | undefined, head = 6, tail = 4): string {
    if (!s) return '';
    if (s.length <= head + tail + 1) return s;
    return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export default function HexRow({
    label,
    value,
    head = 6,
    tail = 4,
    showQr = true,
    sheetTitle,
}: HexRowProps) {
    const palette = useEhrPalette();
    const [sheetOpen, setSheetOpen] = useState(false);

    return (
        <>
            <Pressable
                onPress={() => setSheetOpen(true)}
                style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_VARIANT,
                    borderRadius: 10,
                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                    opacity: pressed ? 0.6 : 1,
                })}
            >
                <YStack style={{ flex: 1, minWidth: 0 }}>
                    {label ? (
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 10.5,
                                color: palette.EHR_OUTLINE,
                                letterSpacing: 0.4,
                                textTransform: 'uppercase',
                                fontWeight: '600',
                            }}
                        >
                            {label}
                        </Text>
                    ) : null}
                    <Text
                        style={{
                            marginTop: label ? 3 : 0,
                            fontFamily: MONO,
                            fontSize: 13,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: 0.2,
                        }}
                        numberOfLines={1}
                    >
                        {truncateHex(value, head, tail)}
                    </Text>
                </YStack>
                <Copy size={14} color={palette.EHR_OUTLINE} />
            </Pressable>

            <HexFullSheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title={sheetTitle || label || 'Mã đầy đủ'}
                value={value}
                showQr={showQr}
            />
        </>
    );
}

interface HexFullSheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    value: string;
    showQr: boolean;
}

function HexFullSheet({ open, onClose, title, value, showQr }: HexFullSheetProps) {
    const palette = useEhrPalette();
    const [copied, setCopied] = useState(false);
    const [qrVisible, setQrVisible] = useState(false);

    // Break value into 16-char chunks for legibility
    const chunks: string[] = [];
    if (value) {
        for (let i = 0; i < value.length; i += 16) {
            chunks.push(value.slice(i, i + 16));
        }
    }

    const handleCopy = async () => {
        try {
            await Clipboard.setStringAsync(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err: any) {
            Alert.alert('Lỗi', 'Không sao chép được vào clipboard.');
        }
    };

    return (
        <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
            <Pressable
                onPress={onClose}
                style={{ flex: 1, backgroundColor: 'rgba(8,8,12,0.7)', justifyContent: 'flex-end' }}
            >
                <Pressable
                    onPress={(e) => e.stopPropagation()}
                    style={{
                        backgroundColor: palette.EHR_SURFACE_HIGH,
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        paddingHorizontal: 22,
                        paddingTop: 14,
                        paddingBottom: 28,
                    }}
                >
                    {/* Handle */}
                    <View style={{ alignItems: 'center', marginBottom: 12 }}>
                        <View
                            style={{
                                width: 40,
                                height: 4,
                                borderRadius: 2,
                                backgroundColor: palette.EHR_OUTLINE,
                            }}
                        />
                    </View>

                    {/* Header */}
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 18,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.3,
                            }}
                        >
                            {title}
                        </Text>
                        <Pressable onPress={onClose} hitSlop={8}>
                            <X size={18} color={palette.EHR_OUTLINE} />
                        </Pressable>
                    </XStack>

                    {/* Toggle: full value vs QR */}
                    {qrVisible ? (
                        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                            <View
                                style={{
                                    padding: 16,
                                    backgroundColor: '#FFFFFF',
                                    borderRadius: 12,
                                }}
                            >
                                <QRCode value={value} size={200} backgroundColor="#FFFFFF" />
                            </View>
                            <Text
                                style={{
                                    marginTop: 14,
                                    fontFamily: SANS,
                                    fontSize: 11,
                                    color: palette.EHR_OUTLINE,
                                    textAlign: 'center',
                                }}
                            >
                                Quét mã QR để chia sẻ địa chỉ.
                            </Text>
                        </View>
                    ) : (
                        <View
                            style={{
                                paddingVertical: 16,
                                paddingHorizontal: 14,
                                borderRadius: 10,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_VARIANT,
                                backgroundColor: palette.EHR_SURFACE_LOWEST,
                                marginBottom: 16,
                            }}
                        >
                            {chunks.map((chunk, i) => (
                                <Text
                                    key={i}
                                    style={{
                                        fontFamily: MONO,
                                        fontSize: 14,
                                        color: palette.EHR_ON_SURFACE,
                                        letterSpacing: 0.3,
                                        lineHeight: 22,
                                    }}
                                >
                                    {chunk}
                                </Text>
                            ))}
                        </View>
                    )}

                    {/* Actions */}
                    <XStack style={{ gap: 10 }}>
                        <Pressable
                            onPress={handleCopy}
                            style={({ pressed }) => ({
                                flex: 1,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                paddingVertical: 12,
                                borderRadius: 10,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE,
                                backgroundColor: palette.EHR_SURFACE,
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Copy size={14} color={palette.EHR_ON_SURFACE} />
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 13,
                                    color: palette.EHR_ON_SURFACE,
                                    fontWeight: '600',
                                }}
                            >
                                {copied ? 'Đã chép!' : 'Sao chép'}
                            </Text>
                        </Pressable>
                        {showQr ? (
                            <Pressable
                                onPress={() => setQrVisible(!qrVisible)}
                                style={({ pressed }) => ({
                                    flex: 1,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    paddingVertical: 12,
                                    borderRadius: 10,
                                    backgroundColor: qrVisible ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE,
                                    opacity: pressed ? 0.8 : 1,
                                })}
                            >
                                <QrCodeIcon size={14} color={palette.EHR_SURFACE} />
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 13,
                                        color: palette.EHR_SURFACE,
                                        fontWeight: '600',
                                    }}
                                >
                                    {qrVisible ? 'Ẩn QR' : 'Hiện QR'}
                                </Text>
                            </Pressable>
                        ) : null}
                    </XStack>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
