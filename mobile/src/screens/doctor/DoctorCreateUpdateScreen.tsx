import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, TextInput, type KeyboardTypeOptions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
    Activity,
    FilePlus2,
    HeartPulse,
    ImagePlus,
    Pill,
    Plus,
    Stethoscope,
    TestTubeDiagonal,
    Thermometer,
    Trash2,
    X,
    type LucideIcon,
} from 'lucide-react-native';
import { Button, Text, View, XStack, YStack } from 'tamagui';

import Icd10Picker from '../../components/Icd10Picker';
import type { Icd10Code } from '../../constants/icd10';
import { encryptData, generateAESKey } from '../../services/crypto';
import pendingUpdateService from '../../services/pendingUpdate.service';
import useAuthStore from '../../store/authStore';
import {
    EHR_ERROR,
    EHR_ERROR_CONTAINER,
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SECONDARY,
    EHR_SECONDARY_CONTAINER,
    EHR_SURFACE,
    EHR_SURFACE_HIGH,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
    EHR_TERTIARY,
    EHR_TERTIARY_FIXED,
} from '../../constants/uiColors';

type RecordTypeOption = {
    key: string;
    label: string;
    icon: LucideIcon;
    tint: string;
    bg: string;
};

type SelectedImage = {
    uri: string;
    base64: string;
    mimeType: string;
    fileName: string;
    width?: number;
    height?: number;
    fileSize?: number | null;
};

const RECORD_TYPES: RecordTypeOption[] = [
    { key: 'checkup', label: 'Khám tổng quát', icon: Stethoscope, tint: EHR_PRIMARY, bg: EHR_PRIMARY_FIXED },
    { key: 'lab_result', label: 'Xét nghiệm', icon: TestTubeDiagonal, tint: EHR_TERTIARY, bg: EHR_TERTIARY_FIXED },
    { key: 'prescription', label: 'Đơn thuốc', icon: Pill, tint: EHR_SECONDARY, bg: EHR_SECONDARY_CONTAINER },
    { key: 'vital_signs', label: 'Chỉ số sinh tồn', icon: HeartPulse, tint: EHR_PRIMARY, bg: EHR_SURFACE_HIGH },
];

function normalizeBase64(data: string) {
    return data.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '').trim();
}

function splitLines(value: string): string[] {
    return value.split(/\r?\n|;/).map((s: string) => s.trim()).filter(Boolean);
}

export default function DoctorCreateUpdateScreen({ navigation, route }: any) {
    const { user } = useAuthStore();
    const { parentCidHash, patientAddress } = route.params || {};

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [recordType, setRecordType] = useState(RECORD_TYPES[0].key);
    const [icd10Codes, setIcd10Codes] = useState<Icd10Code[]>([]);
    const [icd10PickerOpen, setIcd10PickerOpen] = useState(false);
    const [diagnosisNote, setDiagnosisNote] = useState('');
    const [medication, setMedication] = useState('');
    const [dosage, setDosage] = useState('');
    const [frequency, setFrequency] = useState('');
    const [route2, setRoute2] = useState('');
    const [quantity, setQuantity] = useState('');
    const [duration, setDuration] = useState('');
    const [instruction, setInstruction] = useState('');
    const [heartRate, setHeartRate] = useState('');
    const [systolic, setSystolic] = useState('');
    const [diastolic, setDiastolic] = useState('');
    const [temperature, setTemperature] = useState('');
    const [respRate, setRespRate] = useState('');
    const [spo2, setSpo2] = useState('');
    const [weight, setWeight] = useState('');
    const [heightCm, setHeightCm] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPickingImage, setIsPickingImage] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedType = useMemo<RecordTypeOption>(
        () => RECORD_TYPES.find((t: RecordTypeOption) => t.key === recordType) || RECORD_TYPES[0],
        [recordType]
    );

    const truncateAddr = (addr?: string) => addr ? `${addr.substring(0, 8)}...${addr.slice(-4)}` : '???';

    const pickImage = async () => {
        try {
            setIsPickingImage(true);
            const imagePicker = ImagePicker;
            const permission = await imagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                Alert.alert('Thiếu quyền', 'Vui lòng cấp quyền thư viện ảnh.');
                return;
            }
            const result = await imagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.5,
                base64: true,
                exif: false,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            if (!asset.base64) {
                Alert.alert('Lỗi', 'Không đọc được ảnh.');
                return;
            }
            setSelectedImage({
                uri: asset.uri,
                base64: asset.base64,
                mimeType: asset.mimeType || 'image/jpeg',
                fileName: asset.fileName || 'record-image.jpg',
                width: asset.width,
                height: asset.height,
                fileSize: asset.fileSize,
            });
        } catch (e: any) {
            Alert.alert('Lỗi chọn ảnh', e?.message || '');
        } finally {
            setIsPickingImage(false);
        }
    };

    const handleSubmit = async () => {
        if (!title.trim()) {
            Alert.alert('Thiếu tiêu đề', 'Hãy nhập tiêu đề hồ sơ.');
            return;
        }
        if (!description.trim() && !diagnosisNote.trim() && icd10Codes.length === 0 && !notes.trim() && !medication.trim() && !selectedImage) {
            Alert.alert('Thiếu nội dung', 'Hãy nhập nội dung hoặc đính kèm ảnh.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const observations: Record<string, string> = {};
            if (heartRate) observations.heartRate = `${heartRate} bpm`;
            if (systolic && diastolic) observations.bloodPressure = `${systolic}/${diastolic} mmHg`;
            else if (systolic) observations.bloodPressureSystolic = `${systolic} mmHg`;
            if (temperature) observations.temperature = `${temperature} °C`;
            if (respRate) observations.respiratoryRate = `${respRate} lần/phút`;
            if (spo2) observations.spo2 = `${spo2} %`;
            if (weight) observations.weight = `${weight} kg`;
            if (heightCm) observations.height = `${heightCm} cm`;
            if (weight && heightCm) {
                const h = parseFloat(heightCm) / 100;
                const w = parseFloat(weight);
                if (h > 0 && w > 0) observations.bmi = (w / (h * h)).toFixed(1);
            }

            const normalizedImage = selectedImage?.base64 ? normalizeBase64(selectedImage.base64) : null;

            const payload = {
                meta: {
                    title: title.trim(),
                    type: selectedType.label,
                    description: description.trim(),
                    createdAt: new Date().toISOString(),
                    createdBy: user?.walletAddress,
                    role: 'doctor',
                },
                summary: description.trim(),
                notes: notes.trim(),
                observations: Object.keys(observations).length ? observations : undefined,
                diagnoses: [
                    ...icd10Codes.map((c) => `[${c.code}] ${c.name}`),
                    ...splitLines(diagnosisNote),
                ],
                prescriptions: medication ? [{
                    medication: medication.trim(),
                    dosage: dosage.trim() || 'Theo chỉ định',
                    frequency: frequency.trim() || 'Theo hướng dẫn',
                    route: route2.trim() || undefined,
                    quantity: quantity.trim() || undefined,
                    duration: duration.trim() || undefined,
                    instruction: instruction.trim() || undefined,
                }] : [],
                ...(normalizedImage ? {
                    imageData: normalizedImage,
                    imageContentType: selectedImage?.mimeType || 'image/jpeg',
                    attachment: {
                        fileName: selectedImage?.fileName || `record-image-${Date.now()}.jpg`,
                        contentType: selectedImage?.mimeType || 'image/jpeg',
                        data: normalizedImage,
                        width: selectedImage?.width,
                        height: selectedImage?.height,
                        size: selectedImage?.fileSize ?? null,
                    },
                } : {}),
            };

            // Encrypt content
            const aesKey = await generateAESKey();
            const encryptedContent = await encryptData(payload, aesKey);

            // Submit pending update to backend
            const created: any = await pendingUpdateService.createUpdate(
                parentCidHash,
                patientAddress,
                encryptedContent,
                recordType,
                title.trim(),
            );

            // Persist AES key locally keyed by pendingUpdate.id so the claim step
            // (DoctorOutgoingScreen) can retrieve it after patient approval.
            // Without this the claim would use a placeholder key and nobody could
            // decrypt the new version.
            const pendingUpdateId = created?.pendingUpdate?.id || created?.id;
            if (pendingUpdateId) {
                try {
                    const draftsStr = await AsyncStorage.getItem('doctor_update_drafts');
                    const drafts = draftsStr ? JSON.parse(draftsStr) : {};
                    drafts[pendingUpdateId] = {
                        aesKey,
                        parentCidHash,
                        patientAddress,
                        recordType,
                        title: title.trim(),
                        createdAt: new Date().toISOString(),
                    };
                    await AsyncStorage.setItem('doctor_update_drafts', JSON.stringify(drafts));
                } catch (persistErr) {
                    console.warn('Failed to persist update draft aesKey:', persistErr);
                }
            }

            Alert.alert(
                'Đã gửi yêu cầu cập nhật',
                'Bệnh nhân sẽ nhận được thông báo và phê duyệt.',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        } catch (submitError: any) {
            const code = submitError?.code || submitError?.data?.code;
            let message = submitError?.message || 'Không thể gửi yêu cầu cập nhật';
            if (code === 'CONSENT_NOT_FOUND') {
                message = 'Bạn không có quyền truy cập hồ sơ này.';
            } else if (code === 'PENDING_UPDATE_ALREADY_PROCESSED') {
                message = 'Hồ sơ đã có bản cập nhật. Vui lòng cập nhật từ phiên bản mới nhất.';
            }
            setError(message);
            Alert.alert('Lỗi', message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderInput = (
        label: string,
        value: string,
        onChangeText: (text: string) => void,
        options: { multiline?: boolean; placeholder?: string; keyboardType?: KeyboardTypeOptions } = {}
    ) => (
        <YStack style={{ marginBottom: 14 }}>
            <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 6 }}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={options.placeholder || ''}
                placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                keyboardType={options.keyboardType}
                multiline={options.multiline}
                textAlignVertical={options.multiline ? 'top' : 'center'}
                style={{
                    minHeight: options.multiline ? 100 : 52,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: EHR_OUTLINE_VARIANT,
                    backgroundColor: EHR_SURFACE_LOWEST,
                    paddingHorizontal: 14,
                    paddingVertical: options.multiline ? 12 : 0,
                    color: EHR_ON_SURFACE,
                    fontSize: 15,
                }}
            />
        </YStack>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['left', 'right', 'bottom']}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 10 }}>
                        <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: EHR_PRIMARY_FIXED, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                            <FilePlus2 size={26} color={EHR_PRIMARY} />
                        </View>
                        <YStack style={{ flex: 1 }}>
                            <Text fontSize="$6" fontWeight="800" color="$color12">Cập nhật hồ sơ</Text>
                            <Text fontSize="$3" color="$color10">Tạo bản cập nhật cho bệnh nhân {truncateAddr(patientAddress)}</Text>
                        </YStack>
                    </XStack>
                    <View style={{ backgroundColor: EHR_SURFACE_LOW, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 16, padding: 12 }}>
                        <Text fontSize="$2" style={{ color: EHR_ON_SURFACE_VARIANT }}>
                            Nội dung sẽ được mã hoá và gửi cho bệnh nhân phê duyệt trước khi lưu lên blockchain.
                        </Text>
                    </View>
                </View>

                <Text fontSize="$4" fontWeight="800" color="$color12" style={{ marginBottom: 10 }}>Loại hồ sơ</Text>
                <XStack flexWrap="wrap" style={{ gap: 10, marginBottom: 18 }}>
                    {RECORD_TYPES.map((type: RecordTypeOption) => {
                        const Icon = type.icon;
                        const active = type.key === recordType;
                        return (
                            <Pressable key={type.key} onPress={() => setRecordType(type.key)}>
                                <View style={{
                                    borderRadius: 20, borderWidth: 1,
                                    borderColor: active ? type.tint : EHR_OUTLINE_VARIANT,
                                    backgroundColor: active ? type.bg : EHR_SURFACE_LOWEST,
                                    paddingHorizontal: 14, paddingVertical: 12, minWidth: 150,
                                }}>
                                    <XStack style={{ alignItems: 'center' }}>
                                        <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: active ? 'rgba(255,255,255,0.65)' : EHR_SURFACE_LOW, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                                            <Icon size={18} color={type.tint} />
                                        </View>
                                        <Text fontSize="$3" fontWeight="700" color="$color12">{type.label}</Text>
                                    </XStack>
                                </View>
                            </Pressable>
                        );
                    })}
                </XStack>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 14 }}>Nội dung chính</Text>
                    {renderInput('Tiêu đề', title, setTitle, { placeholder: 'Ví dụ: Kết quả xét nghiệm máu' })}
                    {renderInput('Mô tả ngắn', description, setDescription, { placeholder: 'Tóm tắt kết quả khám', multiline: true })}

                    <YStack style={{ marginBottom: 14 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 6 }}>
                            Chẩn đoán (ICD-10)
                        </Text>
                        {icd10Codes.length > 0 ? (
                            <YStack style={{ gap: 8, marginBottom: 8 }}>
                                {icd10Codes.map((item) => (
                                    <XStack
                                        key={item.code}
                                        style={{
                                            alignItems: 'center',
                                            backgroundColor: EHR_PRIMARY_FIXED,
                                            borderWidth: 1,
                                            borderColor: EHR_OUTLINE_VARIANT,
                                            borderRadius: 14,
                                            paddingHorizontal: 12,
                                            paddingVertical: 10,
                                        }}
                                    >
                                        <View style={{ minWidth: 56, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: EHR_PRIMARY, marginRight: 10, alignItems: 'center' }}>
                                            <Text fontSize="$2" fontWeight="800" style={{ color: '#fff' }}>{item.code}</Text>
                                        </View>
                                        <Text fontSize="$3" color="$color12" style={{ flex: 1 }}>{item.name}</Text>
                                        <Pressable onPress={() => setIcd10Codes((prev) => prev.filter((c) => c.code !== item.code))}>
                                            <X size={18} color={EHR_ERROR} />
                                        </Pressable>
                                    </XStack>
                                ))}
                            </YStack>
                        ) : null}
                        <Pressable onPress={() => setIcd10PickerOpen(true)}>
                            <View style={{ borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: EHR_PRIMARY, backgroundColor: EHR_SURFACE_LOW, padding: 12 }}>
                                <XStack style={{ alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <Plus size={16} color={EHR_PRIMARY} />
                                    <Text fontSize="$3" fontWeight="700" style={{ color: EHR_PRIMARY }}>
                                        {icd10Codes.length > 0 ? 'Thêm mã ICD-10 khác' : 'Chọn mã ICD-10 từ danh mục'}
                                    </Text>
                                </XStack>
                            </View>
                        </Pressable>
                    </YStack>

                    {renderInput('Ghi chú chẩn đoán', diagnosisNote, setDiagnosisNote, { placeholder: 'Mô tả thêm nếu không có trong danh mục ICD-10', multiline: true })}
                    {renderInput('Ghi chú thêm', notes, setNotes, { placeholder: 'Chi tiết bổ sung, lịch tái khám...', multiline: true })}
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 14 }}>Ảnh đính kèm (tuỳ chọn)</Text>
                    {selectedImage ? (
                        <YStack style={{ marginBottom: 12 }}>
                            <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: EHR_OUTLINE_VARIANT }}>
                                <Image source={{ uri: selectedImage.uri }} style={{ width: '100%', height: 220, backgroundColor: EHR_SURFACE_LOW }} resizeMode="cover" />
                            </View>
                            <Text fontSize="$2" color="$color10" style={{ marginTop: 8 }}>{selectedImage.fileName}</Text>
                        </YStack>
                    ) : null}
                    <XStack style={{ gap: 10 }}>
                        <Pressable onPress={pickImage} style={{ flex: 1 }} disabled={isPickingImage}>
                            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: EHR_OUTLINE_VARIANT, backgroundColor: EHR_SURFACE_LOW, padding: 12, opacity: isPickingImage ? 0.7 : 1 }}>
                                <XStack style={{ alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <ImagePlus size={16} color={EHR_PRIMARY} />
                                    <Text fontSize="$3" fontWeight="700" color="$color12">
                                        {selectedImage ? 'Chọn ảnh khác' : (isPickingImage ? 'Đang mở...' : 'Chọn ảnh')}
                                    </Text>
                                </XStack>
                            </View>
                        </Pressable>
                        {selectedImage ? (
                            <Pressable onPress={() => setSelectedImage(null)}>
                                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: EHR_OUTLINE_VARIANT, backgroundColor: EHR_SURFACE_LOW, paddingHorizontal: 14, paddingVertical: 12 }}>
                                    <XStack style={{ alignItems: 'center', gap: 8 }}>
                                        <Trash2 size={16} color={EHR_ERROR} />
                                        <Text fontSize="$3" fontWeight="700" style={{ color: EHR_ERROR }}>Xoá</Text>
                                    </XStack>
                                </View>
                            </Pressable>
                        ) : null}
                    </XStack>
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 4 }}>Dấu hiệu sinh tồn</Text>
                    <Text fontSize="$2" color="$color10" style={{ marginBottom: 12 }}>Theo chuẩn bệnh án điện tử (TT 46/2018/TT-BYT)</Text>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>{renderInput('Mạch (lần/phút)', heartRate, setHeartRate, { placeholder: '72', keyboardType: 'numeric' })}</View>
                        <View style={{ flex: 1 }}>{renderInput('Nhịp thở (lần/phút)', respRate, setRespRate, { placeholder: '18', keyboardType: 'numeric' })}</View>
                    </XStack>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>{renderInput('HA tâm thu', systolic, setSystolic, { placeholder: '120', keyboardType: 'numeric' })}</View>
                        <View style={{ flex: 1 }}>{renderInput('HA tâm trương', diastolic, setDiastolic, { placeholder: '80', keyboardType: 'numeric' })}</View>
                    </XStack>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>{renderInput('Nhiệt độ (°C)', temperature, setTemperature, { placeholder: '36.8', keyboardType: 'decimal-pad' })}</View>
                        <View style={{ flex: 1 }}>{renderInput('SpO2 (%)', spo2, setSpo2, { placeholder: '98', keyboardType: 'numeric' })}</View>
                    </XStack>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>{renderInput('Cân nặng (kg)', weight, setWeight, { placeholder: '60', keyboardType: 'decimal-pad' })}</View>
                        <View style={{ flex: 1 }}>{renderInput('Chiều cao (cm)', heightCm, setHeightCm, { placeholder: '165', keyboardType: 'numeric' })}</View>
                    </XStack>
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 4 }}>Đơn thuốc</Text>
                    <Text fontSize="$2" color="$color10" style={{ marginBottom: 12 }}>Theo chuẩn đơn thuốc điện tử (TT 04/2022/TT-BYT)</Text>
                    {renderInput('Tên thuốc / hoạt chất', medication, setMedication, { placeholder: 'Ví dụ: Paracetamol 500mg' })}
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>{renderInput('Hàm lượng / Liều', dosage, setDosage, { placeholder: '1 viên' })}</View>
                        <View style={{ flex: 1 }}>{renderInput('Đường dùng', route2, setRoute2, { placeholder: 'Uống / Tiêm / Bôi' })}</View>
                    </XStack>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>{renderInput('Số lần / ngày', frequency, setFrequency, { placeholder: '2 lần/ngày' })}</View>
                        <View style={{ flex: 1 }}>{renderInput('Số ngày dùng', duration, setDuration, { placeholder: '5 ngày' })}</View>
                    </XStack>
                    {renderInput('Số lượng kê', quantity, setQuantity, { placeholder: '10 viên' })}
                    {renderInput('Lời dặn bác sĩ', instruction, setInstruction, { placeholder: 'Uống sau ăn, tránh rượu bia...', multiline: true })}
                </View>

                {error ? (
                    <View style={{ backgroundColor: EHR_ERROR_CONTAINER, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 16 }}>
                        <Text fontSize="$3" style={{ color: EHR_ERROR }}>{error}</Text>
                    </View>
                ) : null}

                <Button
                    size="$5"
                    background={EHR_PRIMARY}
                    pressStyle={{ background: EHR_PRIMARY_CONTAINER }}
                    disabled={isSubmitting}
                    opacity={isSubmitting ? 0.7 : 1}
                    onPress={handleSubmit}
                >
                    <XStack style={{ alignItems: 'center', gap: 10 }}>
                        <FilePlus2 size={18} color={EHR_ON_PRIMARY} />
                        <Text color={EHR_ON_PRIMARY} fontWeight="800">
                            {isSubmitting ? 'Đang gửi...' : 'Gửi yêu cầu cập nhật'}
                        </Text>
                    </XStack>
                </Button>

                <XStack style={{ alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }}>
                    <Thermometer size={14} color={EHR_ON_SURFACE_VARIANT} />
                    <Text fontSize="$2" color="$color10">Bệnh nhân sẽ phê duyệt trước khi hồ sơ được lưu lên blockchain.</Text>
                </XStack>
            </ScrollView>

            <Icd10Picker
                visible={icd10PickerOpen}
                onClose={() => setIcd10PickerOpen(false)}
                onSelect={(item) => {
                    setIcd10Codes((prev) => (prev.some((c) => c.code === item.code) ? prev : [...prev, item]));
                }}
                selectedCodes={icd10Codes.map((c) => c.code)}
            />
        </SafeAreaView>
    );
}
