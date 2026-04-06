import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, TextInput, type KeyboardTypeOptions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Activity,
    FilePlus2,
    HeartPulse,
    ImagePlus,
    Pill,
    Stethoscope,
    TestTubeDiagonal,
    Thermometer,
    Trash2,
    type LucideIcon,
} from 'lucide-react-native';
import { Button, Text, View, XStack, YStack } from 'tamagui';

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
    const [diagnosis, setDiagnosis] = useState('');
    const [medication, setMedication] = useState('');
    const [dosage, setDosage] = useState('');
    const [frequency, setFrequency] = useState('');
    const [heartRate, setHeartRate] = useState('');
    const [bloodPressure, setBloodPressure] = useState('');
    const [temperature, setTemperature] = useState('');
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
            let imagePicker: typeof import('expo-image-picker') | null = null;
            try {
                imagePicker = await import('expo-image-picker');
            } catch {
                Alert.alert('Thiếu module', 'Cần build lại app với expo-image-picker.');
                return;
            }
            const permission = await imagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                Alert.alert('Thiếu quyền', 'Vui lòng cấp quyền thư viện ảnh.');
                return;
            }
            const result = await imagePicker.launchImageLibraryAsync({
                mediaTypes: imagePicker.MediaTypeOptions.Images,
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
        if (!description.trim() && !diagnosis.trim() && !notes.trim() && !medication.trim() && !selectedImage) {
            Alert.alert('Thiếu nội dung', 'Hãy nhập nội dung hoặc đính kèm ảnh.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const observations: Record<string, string> = {};
            if (heartRate) observations.heartRate = `${heartRate} bpm`;
            if (bloodPressure) observations.bloodPressure = bloodPressure;
            if (temperature) observations.temperature = `${temperature} C`;

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
                diagnoses: splitLines(diagnosis),
                prescriptions: medication ? [{
                    medication: medication.trim(),
                    dosage: dosage.trim() || 'Theo chỉ định',
                    frequency: frequency.trim() || 'Theo hướng dẫn',
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
            await pendingUpdateService.createUpdate(
                parentCidHash,
                patientAddress,
                encryptedContent,
                recordType,
                title.trim(),
            );

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
                    {renderInput('Chẩn đoán', diagnosis, setDiagnosis, { placeholder: 'Mỗi dòng một chẩn đoán', multiline: true })}
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
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 14 }}>Chỉ số cơ bản</Text>
                    <XStack style={{ gap: 10, marginBottom: 8 }}>
                        <View style={{ flex: 1 }}>{renderInput('Nhịp tim', heartRate, setHeartRate, { placeholder: '72', keyboardType: 'numeric' })}</View>
                        <View style={{ flex: 1 }}>{renderInput('Huyết áp', bloodPressure, setBloodPressure, { placeholder: '120/80' })}</View>
                    </XStack>
                    {renderInput('Nhiệt độ', temperature, setTemperature, { placeholder: '36.8', keyboardType: 'decimal-pad' })}
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 14 }}>Đơn thuốc / can thiệp</Text>
                    {renderInput('Thuốc hoặc can thiệp', medication, setMedication, { placeholder: 'Ví dụ: Paracetamol 500mg' })}
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>{renderInput('Liều dùng', dosage, setDosage, { placeholder: '1 viên' })}</View>
                        <View style={{ flex: 1 }}>{renderInput('Tần suất', frequency, setFrequency, { placeholder: '2 lần/ngày' })}</View>
                    </XStack>
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
        </SafeAreaView>
    );
}
