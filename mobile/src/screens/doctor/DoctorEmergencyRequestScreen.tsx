import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack } from 'tamagui';
import {
    AlertTriangle,
    ArrowLeft,
    HeartPulse,
    Hospital,
    Hourglass,
    QrCode,
    ScanLine,
    Send,
    Siren,
} from 'lucide-react-native';

import emergencyService from '../../services/emergency.service';
import QrAddressScanner from '../../components/QrAddressScanner';
import {
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../../constants/uiColors';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

type EmergencyType = 'medical' | 'accident' | 'critical';

const TYPE_OPTIONS: { value: EmergencyType; label: string; icon: any }[] = [
    { value: 'medical', label: 'Y tế', icon: HeartPulse },
    { value: 'accident', label: 'Tai nạn', icon: Siren },
    { value: 'critical', label: 'Nguy kịch', icon: AlertTriangle },
];

const DURATION_OPTIONS = [12, 24, 48];

export default function DoctorEmergencyRequestScreen({ navigation }: any) {
    const [patientAddress, setPatientAddress] = useState('');
    const [reason, setReason] = useState('');
    const [emergencyType, setEmergencyType] = useState<EmergencyType>('medical');
    const [location, setLocation] = useState('');
    const [durationHours, setDurationHours] = useState(24);
    const [submitting, setSubmitting] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);

    const handleSubmit = async () => {
        const addr = patientAddress.trim().toLowerCase();
        if (!ADDRESS_RE.test(addr)) {
            Alert.alert('Địa chỉ không hợp lệ', 'Nhập địa chỉ ví bệnh nhân (0x...).');
            return;
        }
        if (reason.trim().length < 10) {
            Alert.alert('Lý do quá ngắn', 'Nhập lý do khẩn cấp (tối thiểu 10 ký tự).');
            return;
        }

        Alert.alert(
            'Xác nhận yêu cầu khẩn cấp',
            `Bạn sắp tạo quyền truy cập khẩn cấp ${durationHours} giờ vào hồ sơ của bệnh nhân ${addr.substring(0, 10)}...${addr.slice(-6)}.\n\nHành động này sẽ được ghi audit và bệnh nhân có thể thu hồi sớm.`,
            [
                { text: 'Huỷ', style: 'cancel' },
                {
                    text: 'Tạo yêu cầu',
                    style: 'destructive',
                    onPress: async () => {
                        setSubmitting(true);
                        try {
                            await emergencyService.requestEmergencyAccess(addr, reason.trim(), {
                                emergencyType,
                                location: location.trim() || undefined,
                                durationHours,
                            });
                            Alert.alert(
                                'Đã tạo quyền khẩn cấp',
                                `Quyền truy cập ${durationHours} giờ đã được kích hoạt.`,
                                [{ text: 'OK', onPress: () => navigation.goBack() }],
                            );
                        } catch (err: any) {
                            Alert.alert('Lỗi', err?.data?.error || err?.message || 'Không thể tạo yêu cầu.');
                        } finally {
                            setSubmitting(false);
                        }
                    },
                },
            ],
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <XStack style={s.header}>
                <Pressable onPress={() => navigation.goBack()} style={s.backBtn}>
                    <ArrowLeft size={20} color={EHR_ON_SURFACE} />
                </Pressable>
                <YStack style={{ flex: 1, marginLeft: 8 }}>
                    <Text fontSize="$6" fontWeight="800" color="$color12">Yêu cầu truy cập khẩn cấp</Text>
                    <Text fontSize="$2" color="$color10">Quyền tạm thời 1-48 giờ</Text>
                </YStack>
            </XStack>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
                {/* Warning banner */}
                <View style={s.warningBanner}>
                    <AlertTriangle size={18} color="#B91C1C" />
                    <Text fontSize="$2" style={{ flex: 1, color: '#7F1D1D', marginLeft: 8 }}>
                        Yêu cầu khẩn cấp được ghi audit on-chain. Lạm dụng có thể bị huỷ xác minh bác sĩ. Chỉ dùng khi bệnh nhân không thể tự cấp quyền.
                    </Text>
                </View>

                {/* Patient address */}
                <Text fontSize="$3" fontWeight="700" color="$color12" style={{ marginBottom: 8, marginTop: 8 }}>
                    Địa chỉ ví bệnh nhân
                </Text>
                <XStack style={{ gap: 8, marginBottom: 16 }}>
                    <TextInput
                        value={patientAddress}
                        onChangeText={setPatientAddress}
                        placeholder="0x..."
                        placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={[s.input, { flex: 1 }]}
                    />
                    <Pressable onPress={() => setScannerOpen(true)} style={s.qrBtn}>
                        <ScanLine size={18} color={EHR_PRIMARY} />
                    </Pressable>
                </XStack>

                {/* Emergency type */}
                <Text fontSize="$3" fontWeight="700" color="$color12" style={{ marginBottom: 8 }}>
                    Loại khẩn cấp
                </Text>
                <XStack style={{ gap: 8, marginBottom: 16 }}>
                    {TYPE_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const active = emergencyType === opt.value;
                        return (
                            <Pressable key={opt.value} onPress={() => setEmergencyType(opt.value)} style={{ flex: 1 }}>
                                <View
                                    style={[
                                        s.typeChip,
                                        active && { backgroundColor: EHR_PRIMARY_FIXED, borderColor: EHR_PRIMARY },
                                    ]}
                                >
                                    <Icon size={18} color={active ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT} />
                                    <Text
                                        fontSize="$2"
                                        fontWeight={active ? '800' : '600'}
                                        style={{ marginTop: 4, color: active ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}
                                    >
                                        {opt.label}
                                    </Text>
                                </View>
                            </Pressable>
                        );
                    })}
                </XStack>

                {/* Duration */}
                <Text fontSize="$3" fontWeight="700" color="$color12" style={{ marginBottom: 8 }}>
                    Thời hạn
                </Text>
                <XStack style={{ gap: 8, marginBottom: 16 }}>
                    {DURATION_OPTIONS.map((h) => {
                        const active = durationHours === h;
                        return (
                            <Pressable key={h} onPress={() => setDurationHours(h)} style={{ flex: 1 }}>
                                <View
                                    style={[
                                        s.chipPill,
                                        active && { backgroundColor: EHR_PRIMARY_FIXED, borderColor: EHR_PRIMARY },
                                    ]}
                                >
                                    <Hourglass size={14} color={active ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT} />
                                    <Text
                                        fontSize="$3"
                                        fontWeight={active ? '800' : '600'}
                                        style={{ color: active ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT, marginLeft: 6 }}
                                    >
                                        {h}h
                                    </Text>
                                </View>
                            </Pressable>
                        );
                    })}
                </XStack>

                {/* Reason */}
                <Text fontSize="$3" fontWeight="700" color="$color12" style={{ marginBottom: 8 }}>
                    Lý do khẩn cấp <Text fontSize="$2" color="$color10">(10-500 ký tự)</Text>
                </Text>
                <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="VD: Bệnh nhân nhập viện cấp cứu sau tai nạn giao thông, cần xem lịch sử dị ứng và bệnh nền..."
                    placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                    multiline
                    numberOfLines={4}
                    maxLength={500}
                    style={[s.input, { minHeight: 100, textAlignVertical: 'top', marginBottom: 4 }]}
                />
                <Text fontSize="$1" color="$color9" style={{ marginBottom: 16, textAlign: 'right' }}>
                    {reason.length} / 500
                </Text>

                {/* Location (optional) */}
                <Text fontSize="$3" fontWeight="700" color="$color12" style={{ marginBottom: 8 }}>
                    Địa điểm <Text fontSize="$2" color="$color10">(tuỳ chọn)</Text>
                </Text>
                <XStack style={{ alignItems: 'center', marginBottom: 24 }}>
                    <Hospital size={16} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 8 }} />
                    <TextInput
                        value={location}
                        onChangeText={setLocation}
                        placeholder="VD: Bệnh viện Bạch Mai, Khoa Cấp cứu"
                        placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                        style={[s.input, { flex: 1 }]}
                    />
                </XStack>

                {/* Submit */}
                <Pressable onPress={submitting ? undefined : handleSubmit} disabled={submitting}>
                    <View style={[s.submitBtn, submitting && { opacity: 0.6 }]}>
                        {submitting ? <ActivityIndicator size="small" color={EHR_ON_PRIMARY} /> : <Send size={16} color={EHR_ON_PRIMARY} />}
                        <Text fontSize="$4" fontWeight="800" style={{ color: EHR_ON_PRIMARY, marginLeft: 8 }}>
                            {submitting ? 'Đang gửi...' : 'Tạo yêu cầu khẩn cấp'}
                        </Text>
                    </View>
                </Pressable>
            </ScrollView>

            <QrAddressScanner
                visible={scannerOpen}
                mode="address"
                title="Quét mã QR bệnh nhân"
                onClose={() => setScannerOpen(false)}
                onScanned={(value) => {
                    setPatientAddress(value);
                    setScannerOpen(false);
                }}
            />
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    header: {
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: EHR_OUTLINE_VARIANT,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: EHR_SURFACE_LOW,
        alignItems: 'center',
        justifyContent: 'center',
    },
    warningBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FEF2F2',
        borderColor: '#FCA5A5',
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        marginBottom: 16,
    },
    input: {
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: EHR_ON_SURFACE,
        backgroundColor: EHR_SURFACE_LOWEST,
    },
    qrBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: EHR_PRIMARY_FIXED,
        alignItems: 'center',
        justifyContent: 'center',
    },
    typeChip: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: EHR_OUTLINE_VARIANT,
        backgroundColor: EHR_SURFACE_LOWEST,
    },
    chipPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: EHR_OUTLINE_VARIANT,
        backgroundColor: EHR_SURFACE_LOWEST,
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#DC2626',
        borderRadius: 14,
        paddingVertical: 16,
    },
});
