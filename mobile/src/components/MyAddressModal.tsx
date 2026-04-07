import React from 'react';
import { Alert, Modal, Pressable, Share } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';
import { Copy, Share2, Wallet, X } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';

import {
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

type Props = {
    visible: boolean;
    onClose: () => void;
    address?: string | null;
    displayName?: string | null;
    role?: 'patient' | 'doctor' | string;
};

export default function MyAddressModal({ visible, onClose, address, displayName, role }: Props) {
    const addr = address || '';
    // Deep link giúp scan sang app khác tự điền địa chỉ
    const deepLink = addr ? `erhsystem://u/${addr}` : '';
    // Nội dung encode trong QR: ưu tiên deep link để scanner nhận dạng được
    const qrValue = deepLink || addr || 'empty';

    const roleLabel = role === 'doctor' ? 'Bác sĩ' : role === 'patient' ? 'Bệnh nhân' : 'Người dùng';

    const copyAddress = async () => {
        if (!addr) return;
        await Clipboard.setStringAsync(addr);
        Alert.alert('Đã sao chép', 'Địa chỉ đã được sao chép vào clipboard.');
    };

    const shareAddress = async () => {
        if (!addr) return;
        try {
            await Share.share({
                message: `${displayName || roleLabel} trên Sổ sức khoẻ\n\nĐịa chỉ: ${addr}\n\nMở link này để kết nối nhanh: ${deepLink}`,
            });
        } catch (e) {
            // user cancelled
        }
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
            <View style={{ flex: 1, backgroundColor: EHR_SURFACE, paddingTop: 48 }}>
                <XStack style={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 }}>
                    <YStack style={{ flex: 1 }}>
                        <Text fontSize="$6" fontWeight="800" color="$color12">Địa chỉ của tôi</Text>
                        <Text fontSize="$2" color="$color10">Đưa mã này cho người cần kết nối với bạn</Text>
                    </YStack>
                    <Pressable onPress={onClose} style={{ padding: 10, borderRadius: 14, backgroundColor: EHR_SURFACE_LOW }}>
                        <X size={20} color={EHR_ON_SURFACE} />
                    </Pressable>
                </XStack>

                <View style={{ alignItems: 'center', marginTop: 20 }}>
                    <View
                        style={{
                            padding: 20,
                            backgroundColor: '#fff',
                            borderRadius: 28,
                            borderWidth: 1,
                            borderColor: EHR_OUTLINE_VARIANT,
                        }}
                    >
                        <QRCode
                            value={qrValue}
                            size={240}
                            backgroundColor="#fff"
                            color="#000"
                        />
                    </View>

                    <View
                        style={{
                            marginTop: 20,
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 999,
                            backgroundColor: EHR_PRIMARY_FIXED,
                        }}
                    >
                        <XStack style={{ alignItems: 'center', gap: 8 }}>
                            <Wallet size={14} color={EHR_PRIMARY} />
                            <Text fontSize="$2" fontWeight="800" style={{ color: EHR_PRIMARY, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                                {roleLabel}
                            </Text>
                        </XStack>
                    </View>

                    {displayName ? (
                        <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginTop: 12 }}>
                            {displayName}
                        </Text>
                    ) : null}
                </View>

                <View style={{ padding: 20, marginTop: 12 }}>
                    <View
                        style={{
                            backgroundColor: EHR_SURFACE_LOWEST,
                            borderColor: EHR_OUTLINE_VARIANT,
                            borderWidth: 1,
                            borderRadius: 18,
                            padding: 14,
                            marginBottom: 14,
                        }}
                    >
                        <Text fontSize="$1" style={{ color: EHR_ON_SURFACE_VARIANT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                            Địa chỉ đầy đủ
                        </Text>
                        <Text fontSize="$3" style={{ color: EHR_ON_SURFACE, fontFamily: 'monospace' }}>
                            {addr || '—'}
                        </Text>
                    </View>

                    <XStack style={{ gap: 10 }}>
                        <Pressable onPress={copyAddress} style={{ flex: 1 }}>
                            <View
                                style={{
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: EHR_OUTLINE_VARIANT,
                                    backgroundColor: EHR_SURFACE_LOW,
                                    padding: 14,
                                }}
                            >
                                <XStack style={{ alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <Copy size={16} color={EHR_PRIMARY} />
                                    <Text fontSize="$3" fontWeight="700" color="$color12">Sao chép</Text>
                                </XStack>
                            </View>
                        </Pressable>
                        <Pressable onPress={shareAddress} style={{ flex: 1 }}>
                            <View
                                style={{
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: EHR_PRIMARY,
                                    backgroundColor: EHR_PRIMARY,
                                    padding: 14,
                                }}
                            >
                                <XStack style={{ alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <Share2 size={16} color="#fff" />
                                    <Text fontSize="$3" fontWeight="700" style={{ color: '#fff' }}>Chia sẻ</Text>
                                </XStack>
                            </View>
                        </Pressable>
                    </XStack>

                    <Text fontSize="$2" color="$color10" style={{ marginTop: 14, textAlign: 'center' }}>
                        Đưa cho bác sĩ / người quen quét mã để họ nhập đúng địa chỉ của bạn mà không sợ sai.
                    </Text>
                </View>
            </View>
        </Modal>
    );
}
