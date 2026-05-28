import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';
import { ShieldCheck, X } from 'lucide-react-native';
import { useEhrPalette } from '../constants/uiColors';

type Props = {
    visible: boolean;
    patientLabel: string; // fallback "BN 0x8af0...bd0f" — dùng khi không có name
    patientName?: string | null; // tên đầy đủ resolved từ UserChip lookup
    recordTitle?: string | null;
    recordCreatedAt?: string | null; // ISO date string
    onConfirm: () => void;
    onCancel: () => void;
};

function formatVnDateShort(iso?: string | null): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
        return '';
    }
}

const TERMS = [
    'Truy cập này chỉ phục vụ mục đích y tế hợp pháp.',
    'Tôi sẽ không tiết lộ thông tin cho bên thứ ba trái phép.',
    'Mọi hành động được ghi log on-chain và có thể bị kiểm toán bất kỳ lúc nào.',
    'Tôi chịu trách nhiệm pháp lý nếu sử dụng sai mục đích.',
];

export default function LiabilityConfirmModal({
    visible,
    patientLabel,
    patientName,
    recordTitle,
    recordCreatedAt,
    onConfirm,
    onCancel,
}: Props) {
    const palette = useEhrPalette();
    const s = StyleSheet.create({
        overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
        card: { backgroundColor: palette.EHR_SURFACE_LOWEST, borderRadius: 20, padding: 20 },
        patientBadge: { backgroundColor: palette.EHR_PRIMARY_FIXED, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
        bullet: { width: 20, height: 20, borderRadius: 10, backgroundColor: palette.EHR_PRIMARY_FIXED, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
        checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: palette.EHR_SURFACE_LOW, borderRadius: 12, borderWidth: 1, borderColor: palette.EHR_OUTLINE_VARIANT },
        checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: palette.EHR_OUTLINE_VARIANT, alignItems: 'center', justifyContent: 'center' },
        checkboxChecked: { backgroundColor: palette.EHR_PRIMARY, borderColor: palette.EHR_PRIMARY },
        btn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
        btnCancel: { backgroundColor: palette.EHR_SURFACE_LOW },
        btnConfirm: { backgroundColor: palette.EHR_PRIMARY },
    });
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
                            <ShieldCheck size={22} color={palette.EHR_PRIMARY} />
                            <Text fontSize={17} fontWeight="800" color="$color12">
                                Xác nhận trách nhiệm
                            </Text>
                        </XStack>
                        <Pressable onPress={handleClose} style={{ padding: 4 }}>
                            <X size={18} color={palette.EHR_ON_SURFACE_VARIANT} />
                        </Pressable>
                    </XStack>

                    {/* Patient + record info — B2.2 enhancement: doctor cần biết
                        rõ ai/hồ sơ gì trước khi accept liability. */}
                    <View style={s.patientBadge}>
                        <Text fontSize={12} color={palette.EHR_ON_SURFACE_VARIANT}>
                            BỆNH NHÂN
                        </Text>
                        <Text fontSize={15} fontWeight="700" color="$color12" style={{ marginTop: 2 }}>
                            {patientName ? `BN. ${patientName}` : patientLabel}
                        </Text>
                        {patientName && patientLabel ? (
                            <Text fontSize={11} color={palette.EHR_TEXT_MUTED} style={{ fontFamily: 'monospace', marginTop: 2 }}>
                                {patientLabel}
                            </Text>
                        ) : null}
                        {recordTitle || recordCreatedAt ? (
                            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderColor: palette.EHR_OUTLINE_VARIANT }}>
                                {recordTitle ? (
                                    <Text fontSize={13} color="$color12" fontWeight="600">
                                        {recordTitle}
                                    </Text>
                                ) : null}
                                {recordCreatedAt ? (
                                    <Text fontSize={11} color={palette.EHR_ON_SURFACE_VARIANT} style={{ marginTop: 2 }}>
                                        Ngày tạo · {formatVnDateShort(recordCreatedAt)}
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}
                    </View>

                    {/* Terms */}
                    <YStack style={{ gap: 10, marginTop: 14, marginBottom: 18 }}>
                        {TERMS.map((term, idx) => (
                            <XStack key={idx} style={{ gap: 8, alignItems: 'flex-start' }}>
                                <View style={s.bullet}>
                                    <Text style={{ fontSize: 10, color: palette.EHR_PRIMARY, fontWeight: '800' }}>{idx + 1}</Text>
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
                            <Text fontSize={14} fontWeight="700" color={palette.EHR_ON_SURFACE_VARIANT}>Huỷ</Text>
                        </Pressable>
                        <Pressable
                            onPress={checked ? handleConfirm : undefined}
                            disabled={!checked}
                            style={[s.btn, s.btnConfirm, !checked && { opacity: 0.4 }]}
                        >
                            <Text fontSize={14} fontWeight="700" color={palette.EHR_ON_PRIMARY}>
                                Đồng ý nhận hồ sơ
                            </Text>
                        </Pressable>
                    </XStack>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

