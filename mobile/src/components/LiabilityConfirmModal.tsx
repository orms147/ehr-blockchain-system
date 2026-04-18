import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';
import { ShieldCheck, X } from 'lucide-react-native';
import {
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

type Props = {
    visible: boolean;
    patientLabel: string; // e.g. "BN 0x8af0...bd0f"
    onConfirm: () => void;
    onCancel: () => void;
};

const TERMS = [
    'Truy cập này chỉ phục vụ mục đích y tế hợp pháp.',
    'Tôi sẽ không tiết lộ thông tin cho bên thứ ba trái phép.',
    'Mọi hành động được ghi log on-chain và có thể bị kiểm toán bất kỳ lúc nào.',
    'Tôi chịu trách nhiệm pháp lý nếu sử dụng sai mục đích.',
];

export default function LiabilityConfirmModal({ visible, patientLabel, onConfirm, onCancel }: Props) {
    const [checked, setChecked] = useState(false);

    const handleClose = () => {
        setChecked(false);
        onCancel();
    };

    const handleConfirm = () => {
        setChecked(false);
        onConfirm();
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
            <Pressable style={s.overlay} onPress={handleClose}>
                <Pressable onPress={(e) => e.stopPropagation()} style={s.card}>
                    {/* Header */}
                    <XStack style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <XStack style={{ alignItems: 'center', gap: 8 }}>
                            <ShieldCheck size={22} color={EHR_PRIMARY} />
                            <Text fontSize={17} fontWeight="800" color="$color12">
                                Xác nhận trách nhiệm
                            </Text>
                        </XStack>
                        <Pressable onPress={handleClose} style={{ padding: 4 }}>
                            <X size={18} color={EHR_ON_SURFACE_VARIANT} />
                        </Pressable>
                    </XStack>

                    {/* Patient info */}
                    <View style={s.patientBadge}>
                        <Text fontSize={13} color={EHR_ON_SURFACE_VARIANT}>
                            Hồ sơ bệnh nhân: <Text fontWeight="700" color="$color12">{patientLabel}</Text>
                        </Text>
                    </View>

                    {/* Terms */}
                    <YStack style={{ gap: 10, marginTop: 14, marginBottom: 18 }}>
                        {TERMS.map((term, idx) => (
                            <XStack key={idx} style={{ gap: 8, alignItems: 'flex-start' }}>
                                <View style={s.bullet}>
                                    <Text style={{ fontSize: 10, color: EHR_PRIMARY, fontWeight: '800' }}>{idx + 1}</Text>
                                </View>
                                <Text fontSize={13} color="$color11" style={{ flex: 1, lineHeight: 19 }}>
                                    {term}
                                </Text>
                            </XStack>
                        ))}
                    </YStack>

                    {/* Checkbox */}
                    <Pressable onPress={() => setChecked(!checked)} style={s.checkboxRow}>
                        <View style={[s.checkbox, checked && s.checkboxChecked]}>
                            {checked ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text> : null}
                        </View>
                        <Text fontSize={13} fontWeight="600" color="$color12" style={{ flex: 1 }}>
                            Tôi đã đọc kỹ và đồng ý với các điều khoản trên
                        </Text>
                    </Pressable>

                    {/* Actions */}
                    <XStack style={{ gap: 10, marginTop: 16 }}>
                        <Pressable onPress={handleClose} style={[s.btn, s.btnCancel]}>
                            <Text fontSize={14} fontWeight="700" color={EHR_ON_SURFACE_VARIANT}>Huỷ</Text>
                        </Pressable>
                        <Pressable
                            onPress={checked ? handleConfirm : undefined}
                            disabled={!checked}
                            style={[s.btn, s.btnConfirm, !checked && { opacity: 0.4 }]}
                        >
                            <Text fontSize={14} fontWeight="700" color={EHR_ON_PRIMARY}>
                                Xác nhận truy cập
                            </Text>
                        </Pressable>
                    </XStack>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderRadius: 20,
        padding: 20,
    },
    patientBadge: {
        backgroundColor: EHR_PRIMARY_FIXED,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    bullet: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: EHR_PRIMARY_FIXED,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        backgroundColor: EHR_SURFACE_LOW,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: EHR_OUTLINE_VARIANT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: EHR_PRIMARY,
        borderColor: EHR_PRIMARY,
    },
    btn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    btnCancel: {
        backgroundColor: EHR_SURFACE_LOW,
    },
    btnConfirm: {
        backgroundColor: EHR_PRIMARY,
    },
});
