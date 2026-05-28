// TrustedContactsScreen — patient manages their on-chain Trusted Contact list.
// Replaces the old Emergency Access flow (S18, 2026-05-04).

import React, { useState } from 'react';
import { Alert, FlatList, Modal, RefreshControl, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { YStack, XStack, Text, View, Button } from 'tamagui';
import { Heart, Plus, Trash2, ScanLine, ShieldCheck, Info, IdCard } from 'lucide-react-native';

import api from '../services/api';
import trustedContactService from '../services/trustedContact.service';
import { friendlyBackendError } from '../utils/friendlyError';
import QrAddressScanner from '../components/QrAddressScanner';
import {
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
    EHR_OUTLINE_VARIANT,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_ON_PRIMARY,
    EHR_ERROR,
    EHR_ERROR_CONTAINER,
} from '../constants/uiColors';

type Contact = {
    contactAddress: string;
    label?: string | null;
    fullName?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    setAt?: string;
};

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '');

export default function TrustedContactsScreen() {
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
                `Đã chia sẻ khoá ${result.preShareWritten} hồ sơ. Người thân có thể truy cập hồ sơ y tế của bạn ngay khi đăng nhập app của họ.`,
            );
            resetAddModal();
        } catch (err: any) {
            Alert.alert('Lỗi', friendlyBackendError(err, 'Không thể thêm Người thân tin cậy.'));
        } finally {
            setAdding(false);
        }
    };

    const handleRemove = (item: Contact) => {
        Alert.alert(
            'Thu hồi Người thân tin cậy',
            `${item.fullName || truncate(item.contactAddress)} sẽ KHÔNG còn truy cập được hồ sơ y tế của bạn.\n\nLưu ý: thu hồi xảy ra trên blockchain (gas miễn phí qua quota), và backend sẽ tự động xoá khoá đã pre-share.`,
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
                            Alert.alert('Lỗi', friendlyBackendError(err, 'Không thể thu hồi quyền.'));
                        } finally {
                            setRemovingAddr(null);
                        }
                    },
                },
            ]
        );
    };

    const renderItem = ({ item }: { item: Contact }) => (
        <View style={{
            backgroundColor: EHR_SURFACE_LOW,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: EHR_OUTLINE_VARIANT,
            padding: 14,
            marginBottom: 12,
        }}>
            <XStack style={{ alignItems: 'center', marginBottom: 6 }}>
                <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: EHR_PRIMARY_FIXED,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                }}>
                    <Heart size={18} color={EHR_PRIMARY} />
                </View>
                <YStack style={{ flex: 1 }}>
                    <Text fontWeight="700" fontSize="$4" color="$color12">
                        {item.fullName || truncate(item.contactAddress)}
                    </Text>
                    {item.label ? (
                        <Text fontSize="$2" color="$color10">{item.label}</Text>
                    ) : null}
                </YStack>
            </XStack>
            <Text style={{ fontSize: 11, color: EHR_ON_SURFACE_VARIANT, marginBottom: 8 }}>
                {item.contactAddress}
            </Text>
            <Button
                size="$3"
                backgroundColor={EHR_ERROR_CONTAINER}
                color={EHR_ERROR}
                icon={<Trash2 size={14} color={EHR_ERROR} />}
                disabled={removingAddr === item.contactAddress}
                onPress={() => handleRemove(item)}
            >
                {removingAddr === item.contactAddress ? 'Đang thu hồi…' : 'Thu hồi'}
            </Button>
        </View>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }}>
            <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
            >
                <YStack style={{ marginBottom: 12 }}>
                    <Text fontSize="$7" fontWeight="800" color="$color12">Người thân tin cậy</Text>
                    <Text fontSize="$3" color="$color10" style={{ marginTop: 4, lineHeight: 20 }}>
                        Chia sẻ khoá hồ sơ y tế cho người thân để họ giúp bạn trong tình huống khẩn cấp (ví dụ khi bạn không thể tự ký).
                    </Text>
                </YStack>

                <View style={{
                    backgroundColor: EHR_PRIMARY_FIXED,
                    borderColor: EHR_PRIMARY,
                    borderWidth: 1,
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 16,
                }}>
                    <XStack style={{ alignItems: 'flex-start' }}>
                        <Info size={16} color={EHR_PRIMARY} />
                        <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 18, color: EHR_PRIMARY }}>
                            Khi bạn thêm 1 người thân, app sẽ tự động mã hoá toàn bộ hồ sơ hiện có cho ví của họ (chỉ họ mới giải mã được). Hồ sơ mới sau đó cũng tự chia sẻ. Bạn có thể thu hồi bất cứ lúc nào.
                        </Text>
                    </XStack>
                </View>

                <Button
                    size="$4"
                    backgroundColor={EHR_PRIMARY}
                    color={EHR_ON_PRIMARY}
                    icon={<Plus size={16} color={EHR_ON_PRIMARY} />}
                    onPress={() => setAddOpen(true)}
                    style={{ marginBottom: 12 }}
                >
                    <Text color={EHR_ON_PRIMARY} fontWeight="700">Thêm Người thân tin cậy</Text>
                </Button>

                <Button
                    size="$4"
                    variant="outlined"
                    borderColor={EHR_OUTLINE_VARIANT}
                    icon={<IdCard size={16} color={EHR_PRIMARY} />}
                    onPress={() => setCccdOpen(true)}
                    style={{ marginBottom: 16 }}
                >
                    <Text fontWeight="700" style={{ color: EHR_PRIMARY }}>Đăng ký Mã định danh khẩn cấp</Text>
                </Button>

                {isLoading ? (
                    <Text style={{ color: EHR_ON_SURFACE_VARIANT, textAlign: 'center', padding: 20 }}>Đang tải…</Text>
                ) : contacts.length === 0 ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                        <ShieldCheck size={32} color={EHR_ON_SURFACE_VARIANT} />
                        <Text style={{ color: EHR_ON_SURFACE_VARIANT, textAlign: 'center', marginTop: 8 }}>
                            Bạn chưa có Người thân tin cậy nào.
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={contacts}
                        keyExtractor={(item) => item.contactAddress}
                        renderItem={renderItem}
                        scrollEnabled={false}
                    />
                )}
            </ScrollView>

            <Modal visible={addOpen} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={{
                        backgroundColor: EHR_SURFACE_LOWEST,
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        padding: 20,
                        paddingBottom: 40,
                    }}>
                        <Text fontSize="$6" fontWeight="800" color="$color12" style={{ marginBottom: 14 }}>Thêm Người thân</Text>

                        <Text style={{ color: EHR_ON_SURFACE_VARIANT, fontSize: 12, marginBottom: 4 }}>Địa chỉ ví</Text>
                        <XStack style={{ alignItems: 'center', marginBottom: 12 }}>
                            <TextInput
                                value={contactInput}
                                onChangeText={setContactInput}
                                placeholder="0x..."
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={{
                                    flex: 1,
                                    borderWidth: 1,
                                    borderColor: EHR_OUTLINE_VARIANT,
                                    borderRadius: 10,
                                    padding: 12,
                                    color: EHR_ON_SURFACE,
                                    backgroundColor: EHR_SURFACE_LOW,
                                }}
                            />
                            <Button
                                size="$3"
                                marginLeft={8}
                                icon={<ScanLine size={16} color={EHR_PRIMARY} />}
                                backgroundColor={EHR_PRIMARY_FIXED}
                                color={EHR_PRIMARY}
                                onPress={() => setScannerOpen(true)}
                            >
                                QR
                            </Button>
                        </XStack>

                        <Text style={{ color: EHR_ON_SURFACE_VARIANT, fontSize: 12, marginBottom: 4 }}>Nhãn (tuỳ chọn — Vợ, Con trai...)</Text>
                        <TextInput
                            value={labelInput}
                            onChangeText={setLabelInput}
                            placeholder="Vợ"
                            maxLength={120}
                            style={{
                                borderWidth: 1,
                                borderColor: EHR_OUTLINE_VARIANT,
                                borderRadius: 10,
                                padding: 12,
                                color: EHR_ON_SURFACE,
                                backgroundColor: EHR_SURFACE_LOW,
                                marginBottom: 16,
                            }}
                        />

                        <XStack style={{ gap: 8 }}>
                            <Button
                                size="$4"
                                flex={1}
                                variant="outlined"
                                borderColor={EHR_OUTLINE_VARIANT}
                                onPress={resetAddModal}
                                disabled={adding}
                            >
                                <Text>Huỷ</Text>
                            </Button>
                            <Button
                                size="$4"
                                flex={1}
                                backgroundColor={EHR_PRIMARY}
                                color={EHR_ON_PRIMARY}
                                onPress={handleAdd}
                                disabled={adding}
                            >
                                <Text color={EHR_ON_PRIMARY} fontWeight="700">
                                    {adding ? 'Đang chia sẻ khoá…' : 'Thêm'}
                                </Text>
                            </Button>
                        </XStack>
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

            <Modal visible={cccdOpen} animationType="slide" transparent>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <View style={{
                        backgroundColor: EHR_SURFACE_LOWEST,
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        padding: 20,
                        paddingBottom: 40,
                    }}>
                        <Text fontSize="$6" fontWeight="800" color="$color12" style={{ marginBottom: 8 }}>
                            Mã định danh khẩn cấp
                        </Text>
                        <Text fontSize="$3" color="$color10" style={{ lineHeight: 20, marginBottom: 14 }}>
                            App sẽ tính keccak256(CCCD) và lưu hash này. Bác sĩ cấp cứu nhập CCCD trên thẻ vật lý của bạn → app của họ tính cùng hash → tra cứu được địa chỉ ví của bạn. Số CCCD gốc KHÔNG bao giờ rời thiết bị này.
                        </Text>

                        <Text style={{ color: EHR_ON_SURFACE_VARIANT, fontSize: 12, marginBottom: 4 }}>Số CCCD/CMND (9-12 chữ số)</Text>
                        <TextInput
                            value={cccdInput}
                            onChangeText={setCccdInput}
                            placeholder="012345678901"
                            keyboardType="number-pad"
                            maxLength={12}
                            secureTextEntry
                            style={{
                                borderWidth: 1,
                                borderColor: EHR_OUTLINE_VARIANT,
                                borderRadius: 10,
                                padding: 12,
                                color: EHR_ON_SURFACE,
                                backgroundColor: EHR_SURFACE_LOW,
                                marginBottom: 16,
                            }}
                        />

                        <XStack style={{ gap: 8 }}>
                            <Button
                                size="$4"
                                flex={1}
                                variant="outlined"
                                borderColor={EHR_OUTLINE_VARIANT}
                                onPress={async () => {
                                    try {
                                        setCccdSaving(true);
                                        await api.put('/api/profile/me/national-id', { nationalId: null });
                                        Alert.alert('Đã huỷ đăng ký Mã định danh khẩn cấp.');
                                        setCccdOpen(false);
                                        setCccdInput('');
                                    } catch (err: any) {
                                        Alert.alert('Lỗi', friendlyBackendError(err, 'Không thể huỷ đăng ký.'));
                                    } finally {
                                        setCccdSaving(false);
                                    }
                                }}
                                disabled={cccdSaving}
                            >
                                <Text>Huỷ đăng ký</Text>
                            </Button>
                            <Button
                                size="$4"
                                flex={1}
                                backgroundColor={EHR_PRIMARY}
                                color={EHR_ON_PRIMARY}
                                onPress={async () => {
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
                                            // BACKEND_CODE_MAP có entry sẵn cho NATIONAL_ID_TAKEN
                                            Alert.alert('CCCD đã tồn tại', friendlyBackendError(err));
                                        } else {
                                            Alert.alert('Lỗi', friendlyBackendError(err, 'Không thể lưu CCCD.'));
                                        }
                                    } finally {
                                        setCccdSaving(false);
                                    }
                                }}
                                disabled={cccdSaving}
                            >
                                <Text color={EHR_ON_PRIMARY} fontWeight="700">
                                    {cccdSaving ? 'Đang lưu…' : 'Lưu'}
                                </Text>
                            </Button>
                        </XStack>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
