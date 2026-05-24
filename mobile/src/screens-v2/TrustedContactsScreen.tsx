// TrustedContactsScreen v2 — port of .design-bundle/project/screens-emergency.jsx
// TrustedContactsScreen. Cinnabar hero warning (this is the legal-action
// surface — pre-shares keys to family) + tile rows + 2 primary CTAs +
// CCCD enrol modal.
//
// Wiring preserved exactly:
//   - useQuery trustedContacts/me + invalidate on mutation
//   - trustedContactService.addContact / removeContact (calls EIP-712
//     signTrustedContactPermit which gates biometric MFA)
//   - PUT /api/profile/me/national-id (CCCD opt-in flow)
//   - QrAddressScanner component for QR-based address paste
//   - All Alert.alert prompts and error mapping (NATIONAL_ID_TAKEN)

import React, { useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { Heart, ScanLine, IdCard } from 'lucide-react-native';

import api from '../services/api';
import trustedContactService from '../services/trustedContact.service';
import QrAddressScanner from '../components/QrAddressScanner';
import ViButton from '../components-v2/ViButton';
import ViCard from '../components-v2/ViCard';
import { ViSectionLabel } from '../components-v2/ViChips';
import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type Contact = {
    contactAddress: string;
    label?: string | null;
    fullName?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    setAt?: string;
};

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '');

/**
 * relationTone — map label string to color token per polish pack §3 A·2.
 * Falls back to muted/slate for unknown labels.
 */
function relationTone(label: string | null | undefined, palette: any): string {
    if (!label) return palette.EHR_TEXT_MUTED;
    const l = label.toLowerCase().trim();
    if (l.includes('vợ') || l.includes('chồng') || l === 'spouse') return palette.EHR_CINNABAR_DEEP;
    if (l.includes('cha') || l.includes('mẹ') || l.includes('bố') || l === 'parent') return palette.EHR_CLAY;
    if (l.includes('con') || l === 'child') return palette.EHR_TERTIARY;
    if (l.includes('anh') || l.includes('chị') || l.includes('em') || l === 'sibling') return palette.EHR_OUTLINE;
    return palette.EHR_TEXT_MUTED;
}

export default function TrustedContactsScreen() {
    const palette = useEhrPalette();
    const queryClient = useQueryClient();
    const { data: contacts = [], isLoading, refetch, isRefetching } = useQuery<Contact[]>({
        queryKey: ['trustedContacts', 'me'],
        queryFn: () => trustedContactService.listMyContacts(),
    });

    const [addOpen, setAddOpen] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [contactInput, setContactInput] = useState('');
    const [labelInput, setLabelInput] = useState('');
    const [adding, setAdding] = useState(false);
    const [removingAddr, setRemovingAddr] = useState<string | null>(null);

    const [cccdOpen, setCccdOpen] = useState(false);
    const [cccdInput, setCccdInput] = useState('');
    const [cccdSaving, setCccdSaving] = useState(false);

    const resetAddModal = () => {
        setContactInput('');
        setLabelInput('');
        setAddOpen(false);
    };

    const handleAdd = async () => {
        const addr = contactInput.trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
            Alert.alert('Địa chỉ không hợp lệ', 'Vui lòng nhập địa chỉ ví hợp lệ (0x...) hoặc quét QR.');
            return;
        }
        try {
            setAdding(true);
            const result = await trustedContactService.addContact({
                contactAddress: addr,
                label: labelInput.trim().slice(0, 120),
            });
            await queryClient.invalidateQueries({ queryKey: ['trustedContacts'] });
            Alert.alert(
                'Đã thêm Người thân tin cậy',
                `Đã chia sẻ khoá ${result.preShareWritten} hồ sơ. Người thân có thể truy cập ngay khi đăng nhập app của họ.`,
            );
            resetAddModal();
        } catch (err: any) {
            const msg = err?.data?.error || err?.message || 'Không thể thêm Người thân tin cậy.';
            Alert.alert('Lỗi', msg);
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = (item: Contact) => {
        Alert.alert(
            'Thu hồi Người thân tin cậy',
            `${item.fullName || truncate(item.contactAddress)} sẽ KHÔNG còn truy cập được hồ sơ y tế của bạn.\n\nLưu ý: thu hồi xảy ra trên blockchain (gas miễn phí qua quota).`,
            [
                { text: 'Huỷ', style: 'cancel' },
                {
                    text: 'Thu hồi',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setRemovingAddr(item.contactAddress);
                            await trustedContactService.removeContact({
                                contactAddress: item.contactAddress,
                            });
                            await queryClient.invalidateQueries({ queryKey: ['trustedContacts'] });
                            Alert.alert('Đã thu hồi', 'Người thân không còn quyền truy cập hồ sơ.');
                        } catch (err: any) {
                            const msg = err?.data?.error || err?.message || 'Không thể thu hồi.';
                            Alert.alert('Lỗi', msg);
                        } finally {
                            setRemovingAddr(null);
                        }
                    },
                },
            ]
        );
    };

    const handleSaveCccd = async () => {
        if (!/^\d{9,12}$/.test(cccdInput)) {
            Alert.alert('CCCD không hợp lệ', 'Phải là 9-12 chữ số.');
            return;
        }
        try {
            setCccdSaving(true);
            await api.put('/api/profile/me/national-id', { nationalId: cccdInput });
            Alert.alert(
                'Đã đăng ký',
                'Bác sĩ cấp cứu có thể tra cứu địa chỉ ví của bạn qua CCCD.',
            );
            setCccdOpen(false);
            setCccdInput('');
        } catch (err: any) {
            const code = err?.data?.code;
            if (code === 'NATIONAL_ID_TAKEN') {
                Alert.alert('CCCD đã tồn tại', err?.data?.error);
            } else {
                Alert.alert('Lỗi', err?.data?.error || err?.message || 'Không thể lưu.');
            }
        } finally {
            setCccdSaving(false);
        }
    };

    const handleUnregisterCccd = async () => {
        try {
            setCccdSaving(true);
            await api.put('/api/profile/me/national-id', { nationalId: null });
            Alert.alert('Đã huỷ đăng ký Mã định danh khẩn cấp.');
            setCccdOpen(false);
            setCccdInput('');
        } catch (err: any) {
            Alert.alert('Lỗi', err?.data?.error || err?.message || 'Không thể huỷ.');
        } finally {
            setCccdSaving(false);
        }
    };

    const renderItem = ({ item }: { item: Contact }) => {
        const tone = relationTone(item.label, palette);
        return (
            <View
                style={{
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                    borderWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                    borderRadius: 12,
                    marginBottom: 8,
                }}
            >
                <XStack style={{ alignItems: 'center', gap: 10 }}>
                    {/* Cinnabar-tinted heart avatar — heart icon FILLED cinnabar */}
                    <View
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: `${palette.EHR_CINNABAR_DEEP}2E`,
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Heart size={18} color={palette.EHR_CINNABAR_DEEP} fill={palette.EHR_CINNABAR_DEEP} />
                    </View>
                    <YStack style={{ flex: 1, minWidth: 0 }}>
                        <XStack style={{ alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 14,
                                    color: palette.EHR_ON_SURFACE,
                                    fontWeight: '600',
                                }}
                                numberOfLines={1}
                            >
                                {item.fullName || truncate(item.contactAddress)}
                            </Text>
                            {item.label ? (
                                <View
                                    style={{
                                        paddingHorizontal: 6,
                                        paddingVertical: 2,
                                        borderRadius: 3,
                                        backgroundColor: `${tone}2E`,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontSize: 10,
                                            fontFamily: SANS_SEMI,
                                            color: tone,
                                            letterSpacing: 0.3,
                                            fontWeight: '600',
                                        }}
                                    >
                                        {item.label}
                                    </Text>
                                </View>
                            ) : null}
                        </XStack>
                        <Text
                            style={{
                                marginTop: 2,
                                fontFamily: 'monospace',
                                fontSize: 10.5,
                                color: palette.EHR_TEXT_MUTED,
                                letterSpacing: 0.2,
                            }}
                            numberOfLines={1}
                        >
                            {truncate(item.contactAddress)}
                        </Text>
                    </YStack>
                    <Pressable
                        onPress={() => handleRemove(item)}
                        disabled={removingAddr === item.contactAddress}
                        style={({ pressed }) => ({
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 6,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_CINNABAR_DEEP,
                            opacity: pressed ? 0.6 : 1,
                        })}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 11,
                                color: palette.EHR_CINNABAR_DEEP,
                                fontWeight: '600',
                                letterSpacing: 0.2,
                            }}
                        >
                            {removingAddr === item.contactAddress ? 'Đang…' : 'Thu hồi'}
                        </Text>
                    </Pressable>
                </XStack>
            </View>
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }}>
            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={refetch}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* ───────── Editorial note (paper, no cinnabar — design G.7) ───────── */}
                <View
                    style={{
                        paddingVertical: 16,
                        paddingHorizontal: 4,
                        borderTopWidth: 0.5,
                        borderBottomWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_VARIANT,
                        marginTop: 4,
                    }}
                >
                    <Text
                        style={{
                            fontFamily: SANS,
                            fontSize: 13,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 20,
                        }}
                    >
                        Khi bạn thêm người thân,{' '}
                        <Text style={{ fontFamily: SANS_SEMI, fontWeight: '600', color: palette.EHR_ON_SURFACE }}>
                            toàn bộ hồ sơ
                        </Text>{' '}
                        sẽ tự động được chia sẻ cho ví của họ. Họ có thể xem mọi lúc — kể cả khi bạn không thể ký.
                    </Text>
                </View>

                {/* ───────── List of contacts ───────── */}
                <View style={{ marginTop: 22, marginHorizontal: -20 }}>
                    <ViSectionLabel>Đang chia sẻ với ({contacts.length})</ViSectionLabel>
                </View>

                {isLoading ? (
                    <Text
                        style={{
                            color: palette.EHR_TEXT_MUTED,
                            textAlign: 'center',
                            padding: 20,
                            fontFamily: SANS,
                            fontSize: 13,
                        }}
                    >
                        Đang tải…
                    </Text>
                ) : contacts.length === 0 ? (
                    <Text
                        style={{
                            color: palette.EHR_TEXT_MUTED,
                            textAlign: 'center',
                            padding: 32,
                            fontFamily: SANS,
                            fontSize: 13.5,
                        }}
                    >
                        Chưa có người thân nào.
                    </Text>
                ) : (
                    <FlatList
                        data={contacts}
                        keyExtractor={(item) => item.contactAddress}
                        renderItem={renderItem}
                        scrollEnabled={false}
                    />
                )}

                {/* ───────── CTAs (cinnabar = legal-action) ───────── */}
                <View style={{ height: 22 }} />
                <ViButton variant="cinnabar" full onPress={() => setAddOpen(true)}>
                    + Thêm Người thân tin cậy
                </ViButton>
                <View style={{ height: 10 }} />
                <ViButton variant="ghost" full onPress={() => setCccdOpen(true)}>
                    Đăng ký Mã định danh khẩn cấp
                </ViButton>
                <Text
                    style={{
                        marginTop: 12,
                        fontFamily: SANS,
                        fontSize: 11.5,
                        color: palette.EHR_TEXT_MUTED,
                        textAlign: 'center',
                        lineHeight: 16,
                    }}
                >
                    Mã định danh khẩn cấp giúp bác sĩ tra cứu ví của bạn qua CCCD trong tình huống cấp cứu.
                </Text>
            </ScrollView>

            {/* ───────── Add Contact Modal ───────── */}
            <Modal visible={addOpen} animationType="slide" transparent>
                <View
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        justifyContent: 'flex-end',
                    }}
                >
                    <View
                        style={{
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderTopLeftRadius: 20,
                            borderTopRightRadius: 20,
                            padding: 22,
                            paddingBottom: 40,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 22,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                            }}
                        >
                            Thêm Người thân
                        </Text>
                        <Text
                            style={{
                                marginTop: 6,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 19,
                            }}
                        >
                            Quét QR ví hoặc dán địa chỉ. Sau khi ký, app tự mã hoá toàn bộ khoá hồ sơ cho ví của họ.
                        </Text>

                        <FieldLabel>Địa chỉ ví</FieldLabel>
                        <XStack style={{ alignItems: 'center', gap: 8 }}>
                            <TextInput
                                value={contactInput}
                                onChangeText={setContactInput}
                                placeholder="0x..."
                                placeholderTextColor={palette.EHR_OUTLINE}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={{
                                    flex: 1,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    borderRadius: 10,
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    color: palette.EHR_ON_SURFACE,
                                    backgroundColor: palette.EHR_SURFACE,
                                    fontFamily: 'monospace',
                                    fontSize: 13,
                                }}
                            />
                            <Pressable
                                onPress={() => setScannerOpen(true)}
                                style={({ pressed }) => ({
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    borderRadius: 10,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    backgroundColor: palette.EHR_PRIMARY_FIXED,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 6,
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <ScanLine size={16} color={palette.EHR_PRIMARY} />
                                <Text
                                    style={{
                                        fontFamily: SANS_MEDIUM,
                                        fontSize: 13,
                                        color: palette.EHR_PRIMARY,
                                    }}
                                >
                                    QR
                                </Text>
                            </Pressable>
                        </XStack>

                        <FieldLabel>Nhãn (Vợ, Con, Mẹ…)</FieldLabel>
                        <TextInput
                            value={labelInput}
                            onChangeText={setLabelInput}
                            placeholder="Vợ"
                            placeholderTextColor={palette.EHR_OUTLINE}
                            maxLength={120}
                            style={{
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                borderRadius: 10,
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                color: palette.EHR_ON_SURFACE,
                                backgroundColor: palette.EHR_SURFACE,
                                fontFamily: SANS,
                                fontSize: 14,
                            }}
                        />

                        <View style={{ height: 18 }} />
                        <XStack style={{ gap: 10 }}>
                            <View style={{ flex: 1 }}>
                                <ViButton variant="ghost" full onPress={resetAddModal} disabled={adding}>
                                    Huỷ
                                </ViButton>
                            </View>
                            <View style={{ flex: 1 }}>
                                <ViButton
                                    variant="cinnabar"
                                    full
                                    loading={adding}
                                    onPress={handleAdd}
                                >
                                    {adding ? 'Đang ký…' : 'Tiếp tục ký'}
                                </ViButton>
                            </View>
                        </XStack>
                        <Text
                            style={{
                                marginTop: 12,
                                fontFamily: SANS,
                                fontSize: 11,
                                color: palette.EHR_TEXT_MUTED,
                                textAlign: 'center',
                                lineHeight: 16,
                            }}
                        >
                            Bạn sẽ ký bằng vân tay để cấp quyền vĩnh viễn cho người này.
                        </Text>
                    </View>
                </View>
            </Modal>

            <QrAddressScanner
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScanned={(addr) => {
                    setContactInput(addr);
                    setScannerOpen(false);
                }}
            />

            {/* ───────── CCCD Modal ───────── */}
            <Modal visible={cccdOpen} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View
                        style={{
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderTopLeftRadius: 20,
                            borderTopRightRadius: 20,
                            padding: 22,
                            paddingBottom: 40,
                        }}
                    >
                        <XStack style={{ alignItems: 'center', gap: 10 }}>
                            <IdCard size={20} color={palette.EHR_PRIMARY} />
                            <Text
                                style={{
                                    fontFamily: SERIF,
                                    fontSize: 22,
                                    color: palette.EHR_ON_SURFACE,
                                    letterSpacing: -0.2,
                                }}
                            >
                                Mã định danh khẩn cấp
                            </Text>
                        </XStack>
                        <Text
                            style={{
                                marginTop: 8,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 20,
                            }}
                        >
                            App sẽ tính <Text style={{ fontFamily: 'monospace' }}>keccak256(CCCD)</Text> và chỉ lưu hash. Bác sĩ cấp cứu nhập CCCD trên thẻ vật lý → tra cứu ví. Số CCCD gốc KHÔNG rời thiết bị này.
                        </Text>

                        <FieldLabel>Số CCCD/CMND (9-12 chữ số)</FieldLabel>
                        <TextInput
                            value={cccdInput}
                            onChangeText={setCccdInput}
                            placeholder="012345678901"
                            placeholderTextColor={palette.EHR_OUTLINE}
                            keyboardType="number-pad"
                            maxLength={12}
                            secureTextEntry
                            style={{
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                borderRadius: 10,
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                color: palette.EHR_ON_SURFACE,
                                backgroundColor: palette.EHR_SURFACE,
                                fontFamily: 'monospace',
                                fontSize: 14,
                            }}
                        />

                        <View style={{ height: 18 }} />
                        <XStack style={{ gap: 10 }}>
                            <View style={{ flex: 1 }}>
                                <ViButton
                                    variant="ghost"
                                    full
                                    onPress={handleUnregisterCccd}
                                    disabled={cccdSaving}
                                >
                                    Huỷ đăng ký
                                </ViButton>
                            </View>
                            <View style={{ flex: 1 }}>
                                <ViButton
                                    variant="cinnabar"
                                    full
                                    loading={cccdSaving}
                                    onPress={handleSaveCccd}
                                >
                                    {cccdSaving ? 'Đang lưu…' : 'Lưu'}
                                </ViButton>
                            </View>
                        </XStack>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    const palette = useEhrPalette();
    return (
        <Text
            style={{
                fontFamily: SANS_SEMI,
                fontSize: 11,
                color: palette.EHR_TEXT_MUTED,
                letterSpacing: 0.4,
                fontWeight: '600',
                textTransform: 'uppercase',
                marginTop: 14,
                marginBottom: 6,
            }}
        >
            {children}
        </Text>
    );
}

// kept for backwards-compat — referenced by ViSectionLabel
