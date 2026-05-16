// ReceiptStandaloneScreen v2 — port of .design-bundle/project/screens-extras2.jsx
// ReceiptStandaloneScreen. Stand-alone "biên nhận đã ký" — opened from the
// consent ceremony confirm step OR from a row in AccessLog. Reads the
// consent receipt from route.params.receipt; gracefully degrades on missing
// fields.
//
// Wiring:
//   - Linking.openURL to Arbiscan Sepolia for tx hash
//   - navigation.goBack() / navigation.navigate('AccessLog') as the close path
//   - revoke callback can be wired by parent (passed via route.params.onRevoke
//     as a function name — not a function ref, since RN nav doesn't support
//     serialising functions). For now revoke routes back to AccessLog.

import React from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Text, XStack, YStack } from 'tamagui';
import { ChevronLeft, ExternalLink } from 'lucide-react-native';

import ViButton from '../components-v2/ViButton';
import ViWordmark from '../components-v2/ViWordmark';
import { ViModeChip } from '../components-v2/ViChips';
import {
    EHR_SURFACE,
    EHR_SURFACE_LOWEST,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE,
    EHR_OUTLINE_SOFT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
} from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SERIF_MEDIUM = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type Receipt = {
    id?: string;
    recipient?: string;
    recipientAddress?: string;
    org?: string;
    record?: string;
    recordTitle?: string;
    version?: string;
    mode?: 'read-update' | 'read-delegate' | string;
    signedAt?: string;
    grantedAt?: string;
    expiresAt?: string;
    txHash?: string;
};

type Params = { receipt?: Receipt };

const truncate = (s?: string, head = 6, tail = 4) =>
    s ? `${s.slice(0, head)}…${s.slice(-tail)}` : '';

function formatViDateTime(value?: string) {
    if (!value) return '—';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return value;
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}·${pad(d.getMonth() + 1)}·${d.getFullYear()}`;
    } catch {
        return value;
    }
}

function formatViDate(value?: string) {
    if (!value) return '—';
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return value;
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}·${pad(d.getMonth() + 1)}·${d.getFullYear()}`;
    } catch {
        return value;
    }
}

export default function ReceiptStandaloneScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<RouteProp<Record<string, Params>, string>>();
    const receipt: Receipt = route?.params?.receipt || {};

    const recipientLabel =
        receipt.recipient || (receipt.recipientAddress ? truncate(receipt.recipientAddress, 8, 6) : 'Bác sĩ');
    const recordLabel = receipt.recordTitle || receipt.record || 'Hồ sơ y tế';
    const txHash = receipt.txHash || '';
    const txShort = txHash ? `${txHash.slice(0, 6)}…${txHash.slice(-4)}` : '—';

    const openTxOnArbiscan = () => {
        if (!txHash) {
            Alert.alert('Không có Tx hash', 'Biên nhận này không có mã giao dịch on-chain.');
            return;
        }
        Linking.openURL(`https://sepolia.arbiscan.io/tx/${txHash}`);
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {/* TopBar */}
                <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 10 }}>
                    <Pressable
                        onPress={() => navigation.goBack()}
                        style={({ pressed }) => ({
                            alignSelf: 'flex-start',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingVertical: 6,
                            paddingRight: 10,
                            opacity: pressed ? 0.5 : 1,
                        })}
                    >
                        <ChevronLeft size={18} color={EHR_ON_SURFACE_VARIANT} />
                        <Text style={{ fontFamily: SANS, fontSize: 13, color: EHR_ON_SURFACE_VARIANT }}>
                            Quay lại
                        </Text>
                    </Pressable>
                </View>

                {/* Hero serif quote */}
                <View style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 18 }}>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 19,
                            color: EHR_ON_SURFACE,
                            lineHeight: 28,
                            letterSpacing: -0.2,
                        }}
                    >
                        <Text style={{ color: EHR_PRIMARY, fontFamily: SERIF_MEDIUM }}>“</Text>
                        Bạn đã đồng ý vào lúc{' '}
                        <Text style={{ fontFamily: 'monospace', fontSize: 16 }}>
                            {formatViDateTime(receipt.signedAt || receipt.grantedAt)}
                        </Text>
                        <Text style={{ color: EHR_PRIMARY, fontFamily: SERIF_MEDIUM }}>”</Text>
                    </Text>
                </View>

                {/* Paper card */}
                <View style={{ paddingHorizontal: 20 }}>
                    <View
                        style={{
                            position: 'relative',
                            backgroundColor: EHR_SURFACE_LOWEST,
                            borderRadius: 14,
                            borderWidth: 0.5,
                            borderColor: EHR_OUTLINE_SOFT,
                            paddingVertical: 24,
                            paddingHorizontal: 22,
                        }}
                    >
                        {/* Cinnabar seal stamp */}
                        <View
                            style={{
                                position: 'absolute',
                                top: 14,
                                right: 14,
                                width: 64,
                                height: 64,
                                borderRadius: 32,
                                borderWidth: 1.5,
                                borderColor: EHR_PRIMARY,
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: 0.85,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: SERIF_MEDIUM,
                                    fontSize: 11,
                                    color: EHR_PRIMARY,
                                    letterSpacing: 0.4,
                                    textTransform: 'uppercase',
                                }}
                            >
                                Đã ký
                            </Text>
                            <Text
                                style={{
                                    marginTop: 2,
                                    fontFamily: 'monospace',
                                    fontSize: 10,
                                    color: EHR_PRIMARY,
                                }}
                            >
                                {formatViDate(receipt.signedAt || receipt.grantedAt)}
                            </Text>
                        </View>

                        <View style={{ paddingRight: 80 }}>
                            <ViWordmark size={18} color={EHR_ON_SURFACE} />
                            <Text
                                style={{
                                    marginTop: 4,
                                    fontFamily: SANS_SEMI,
                                    fontSize: 10.5,
                                    color: EHR_OUTLINE,
                                    letterSpacing: 0.4,
                                    textTransform: 'uppercase',
                                    fontWeight: '600',
                                }}
                            >
                                Biên nhận đã ký · {receipt.id || `VN-${Date.now().toString(36).slice(-8)}`}
                            </Text>
                        </View>

                        <YStack style={{ marginTop: 20, gap: 14 }}>
                            <KVRow k="Người được cấp">
                                <YStack>
                                    <Text
                                        style={{
                                            fontFamily: SANS_MEDIUM,
                                            fontSize: 14,
                                            color: EHR_ON_SURFACE,
                                            fontWeight: '500',
                                        }}
                                    >
                                        {recipientLabel}
                                    </Text>
                                    {receipt.org ? (
                                        <Text
                                            style={{
                                                marginTop: 2,
                                                fontFamily: SANS,
                                                fontSize: 12,
                                                color: EHR_OUTLINE,
                                            }}
                                        >
                                            {receipt.org}
                                        </Text>
                                    ) : null}
                                </YStack>
                            </KVRow>
                            <KVRow k="Hồ sơ">
                                <Text
                                    style={{
                                        fontFamily: SANS_MEDIUM,
                                        fontSize: 13.5,
                                        color: EHR_ON_SURFACE,
                                    }}
                                >
                                    {recordLabel}
                                    {receipt.version ? `  ${receipt.version}` : ''}
                                </Text>
                            </KVRow>
                            <KVRow k="Phạm vi">
                                <ViModeChip mode={(receipt.mode as any) || 'read-update'} />
                            </KVRow>
                            <KVRow k="Có hiệu lực">
                                <Text
                                    style={{
                                        fontFamily: 'monospace',
                                        fontSize: 12.5,
                                        color: EHR_ON_SURFACE,
                                    }}
                                >
                                    {formatViDate(receipt.grantedAt)} → {formatViDate(receipt.expiresAt)}
                                </Text>
                            </KVRow>
                            <KVRow k="Tx on-chain">
                                <Pressable onPress={openTxOnArbiscan}>
                                    <XStack style={{ alignItems: 'center', gap: 6 }}>
                                        <Text
                                            style={{
                                                fontFamily: 'monospace',
                                                fontSize: 12.5,
                                                color: EHR_ON_SURFACE_VARIANT,
                                                textDecorationLine: 'underline',
                                                textDecorationStyle: 'dotted',
                                            }}
                                        >
                                            {txShort}
                                        </Text>
                                        <ExternalLink size={11} color={EHR_OUTLINE} />
                                    </XStack>
                                </Pressable>
                            </KVRow>
                        </YStack>
                    </View>

                    {/* Footer hint */}
                    <View
                        style={{
                            marginTop: 18,
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderRadius: 12,
                            borderWidth: 0.5,
                            borderColor: EHR_OUTLINE_SOFT,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 11.5,
                                color: EHR_OUTLINE,
                                lineHeight: 17,
                            }}
                        >
                            Biên nhận này được lưu vĩnh viễn trên nhật ký on-chain. Bạn có thể thu hồi quyền bất cứ lúc nào ở mục Quyền truy cập.
                        </Text>
                    </View>

                    {/* CTAs */}
                    <XStack style={{ marginTop: 16, gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            <ViButton
                                variant="ghost"
                                full
                                onPress={() => {
                                    try {
                                        navigation.navigate('AccessLog');
                                    } catch {
                                        navigation.goBack();
                                    }
                                }}
                            >
                                Thu hồi
                            </ViButton>
                        </View>
                        <View style={{ flex: 1 }}>
                            <ViButton variant="primary" full onPress={() => navigation.goBack()}>
                                Xong
                            </ViButton>
                        </View>
                    </XStack>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

function KVRow({ k, children }: { k: string; children: React.ReactNode }) {
    return (
        <XStack style={{ alignItems: 'baseline', gap: 14 }}>
            <Text
                style={{
                    width: 100,
                    fontFamily: SANS_SEMI,
                    fontSize: 10.5,
                    color: EHR_OUTLINE,
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    fontWeight: '600',
                }}
            >
                {k}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        </XStack>
    );
}

void EHR_PRIMARY_CONTAINER;
