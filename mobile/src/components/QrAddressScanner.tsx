import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';
import { CameraOff, X } from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import {
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
} from '../constants/uiColors';

type ScanMode = 'address' | 'cidHash';

type Props = {
    visible: boolean;
    onClose: () => void;
    onScanned: (value: string, raw: string) => void;
    mode?: ScanMode; // default 'address'
    title?: string;
    subtitle?: string;
};

const ADDRESS_RE = /0x[a-fA-F0-9]{40}\b/;
const CIDHASH_RE = /0x[a-fA-F0-9]{64}\b/;

function parseFromQr(data: string, mode: ScanMode): string | null {
    if (!data) return null;
    // cidHash must be matched first because addresses are a substring of bytes32
    if (mode === 'cidHash') {
        const m = data.match(CIDHASH_RE);
        return m ? m[0] : null;
    }
    const m = data.match(ADDRESS_RE);
    return m ? m[0] : null;
}

export default function QrAddressScanner({ visible, onClose, onScanned, mode = 'address', title, subtitle }: Props) {
    const [permission, requestPermission] = useCameraPermissions();
    const [handled, setHandled] = useState(false);

    useEffect(() => {
        if (visible) setHandled(false);
    }, [visible]);

    useEffect(() => {
        if (visible && permission && !permission.granted && permission.canAskAgain) {
            requestPermission();
        }
    }, [visible, permission]);

    const handleBarcode = (result: { data: string }) => {
        if (handled) return;
        const value = parseFromQr(result.data, mode);
        if (!value) return;
        setHandled(true);
        onScanned(value, result.data);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                {permission?.granted ? (
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={handleBarcode}
                    />
                ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: EHR_SURFACE }}>
                        <CameraOff size={48} color={EHR_ON_SURFACE_VARIANT} />
                        <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginTop: 16, textAlign: 'center' }}>
                            Cần quyền camera
                        </Text>
                        <Text fontSize="$3" color="$color10" style={{ marginTop: 8, textAlign: 'center' }}>
                            Hãy cho phép ứng dụng dùng camera để quét mã QR địa chỉ.
                        </Text>
                        {permission?.canAskAgain ? (
                            <Pressable onPress={requestPermission} style={{ marginTop: 20 }}>
                                <View style={{ backgroundColor: EHR_PRIMARY, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 }}>
                                    <Text fontSize="$3" fontWeight="800" style={{ color: '#fff' }}>Cấp quyền</Text>
                                </View>
                            </Pressable>
                        ) : (
                            <Text fontSize="$2" color="$color9" style={{ marginTop: 12, textAlign: 'center' }}>
                                Vui lòng mở cài đặt ứng dụng để bật lại quyền camera.
                            </Text>
                        )}
                    </View>
                )}

                {/* Overlay */}
                <View
                    pointerEvents="box-none"
                    style={{
                        ...StyleSheet.absoluteFillObject,
                        justifyContent: 'space-between',
                    }}
                >
                    <XStack style={{ paddingTop: 52, paddingHorizontal: 20, alignItems: 'center' }}>
                        <YStack style={{ flex: 1 }}>
                            <Text fontSize="$6" fontWeight="800" style={{ color: '#fff' }}>{title || 'Quét mã QR'}</Text>
                            <Text fontSize="$2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                                {subtitle || (mode === 'cidHash' ? 'Hướng camera vào QR mã CID hồ sơ' : 'Hướng camera vào mã QR địa chỉ của bệnh nhân')}
                            </Text>
                        </YStack>
                        <Pressable onPress={onClose} style={{ padding: 10, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                            <X size={20} color="#fff" />
                        </Pressable>
                    </XStack>

                    <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                        <View
                            style={{
                                width: 260,
                                height: 260,
                                borderRadius: 28,
                                borderWidth: 3,
                                borderColor: EHR_PRIMARY,
                                backgroundColor: 'transparent',
                            }}
                        />
                    </View>

                    <View style={{ padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' }}>
                        <Text fontSize="$2" style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>
                            App sẽ tự đóng khi phát hiện mã hợp lệ.
                        </Text>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
