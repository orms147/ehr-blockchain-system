import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, TextInput, type KeyboardTypeOptions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { keccak256, toBytes } from 'viem';

import { encryptData, generateAESKey } from '../services/crypto';
import ipfsService from '../services/ipfs.service';
import recordService from '../services/record.service';
import useAuthStore from '../store/authStore';
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
} from '../constants/uiColors';

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

type BuildPayloadInput = {
    title: string;
    description: string;
    recordTypeLabel: string;
    diagnosis: string;
    medication: string;
    dosage: string;
    frequency: string;
    heartRate: string;
    bloodPressure: string;
    temperature: string;
    notes: string;
    attachment?: SelectedImage | null;
};

const RECORD_TYPES: RecordTypeOption[] = [
    { key: 'checkup', label: 'Khám tổng quát', icon: Stethoscope, tint: EHR_PRIMARY, bg: EHR_PRIMARY_FIXED },
    { key: 'lab_result', label: 'Xét nghiệm', icon: TestTubeDiagonal, tint: EHR_TERTIARY, bg: EHR_TERTIARY_FIXED },
    { key: 'prescription', label: 'Đơn thuốc', icon: Pill, tint: EHR_SECONDARY, bg: EHR_SECONDARY_CONTAINER },
    { key: 'vital_signs', label: 'Chỉ số sinh tồn', icon: HeartPulse, tint: EHR_PRIMARY, bg: EHR_SURFACE_HIGH },
];

const LOCAL_RECORDS_STORAGE_KEY = 'ehr_local_records';

function toSerializableRecord(record: Record<string, any>) {
    const createdAtIso = record?.createdAt
        ? new Date(record.createdAt).toISOString()
        : new Date().toISOString();

    return {
        ...record,
        createdAt: createdAtIso,
    };
}

function normalizeBase64(data: string) {
    return data
        .replace(/^data:[^;]+;base64,/, '')
        .replace(/\s+/g, '')
        .trim();
}

function buildCreateRecordErrorMessage(submitError: any): string {
    const code = submitError?.code || submitError?.data?.code;

    if (code === 'QUOTA_EXHAUSTED') {
        return 'Đã hết quota upload miễn phí. Hãy kết nối ví có ETH hoặc thử lại sau.';
    }
    if (code === 'PATIENT_NOT_REGISTERED') {
        return 'Tài khoản chưa được đăng ký patient on-chain. Thử đăng nhập lại rồi tạo hồ sơ lại.';
    }
    if (code === 'SPONSOR_NOT_AUTHORIZED' || code === 'RELAYER_NOT_AUTHORIZED') {
        return 'Hệ thống sponsor chưa được cấp quyền trên smart contract. Cần cập nhật backend contract config.';
    }
    if (code === 'RELAYER_NOT_CONFIGURED') {
        return 'Backend chưa cấu hình SPONSOR_PRIVATE_KEY hoặc RPC URL.';
    }
    if (code === 'RECORD_EXISTS') {
        return 'Hồ sơ này đã tồn tại trên blockchain. Vui lòng làm mới danh sách hồ sơ.';
    }
    if (code === 'CID_RESERVED') {
        return 'CID này đang được dùng bởi một lượt upload khác. Vui lòng tạo lại hồ sơ mới.';
    }
    if (code === 'MAX_CHILDREN_REACHED') {
        return 'Bản ghi gốc đã đạt giới hạn số phiên bản. Hãy tạo hồ sơ gốc mới.';
    }
    if (submitError?.status === 429) {
        return 'Backend đang bị giới hạn tài nguyên tạm thời. Vui lòng thử lại sau ít phút.';
    }

    return submitError?.message || 'Không thể tạo hồ sơ mới';
}

function splitLines(value: string): string[] {
    return value
        .split(/\r?\n|;/)
        .map((item: string) => item.trim())
        .filter(Boolean);
}

function cleanNumber(value: string): string {
    const trimmed = value.trim();
    return trimmed ? trimmed : '';
}

function buildPayload({
    title,
    description,
    recordTypeLabel,
    diagnosis,
    medication,
    dosage,
    frequency,
    heartRate,
    bloodPressure,
    temperature,
    notes,
    attachment,
}: BuildPayloadInput) {
    const observations: Record<string, string> = {};

    if (heartRate) observations.heartRate = `${heartRate} bpm`;
    if (bloodPressure) observations.bloodPressure = bloodPressure;
    if (temperature) observations.temperature = `${temperature} C`;

    const diagnoses = splitLines(diagnosis);
    const prescriptions = medication
        ? [{
            medication: medication.trim(),
            dosage: dosage.trim() || 'Theo chỉ định',
            frequency: frequency.trim() || 'Theo hướng dẫn',
        }]
        : [];

    const normalizedImage = attachment?.base64 ? normalizeBase64(attachment.base64) : null;

    return {
        meta: {
            title: title.trim(),
            type: recordTypeLabel,
            description: description.trim(),
            createdAt: new Date().toISOString(),
        },
        summary: description.trim(),
        notes: notes.trim(),
        observations: Object.keys(observations).length ? observations : undefined,
        diagnoses,
        prescriptions,
        ...(normalizedImage
            ? {
                imageData: normalizedImage,
                imageContentType: attachment?.mimeType || 'image/jpeg',
                attachment: {
                    fileName: attachment?.fileName || `record-image-${Date.now()}.jpg`,
                    contentType: attachment?.mimeType || 'image/jpeg',
                    data: normalizedImage,
                    width: attachment?.width,
                    height: attachment?.height,
                    size: attachment?.fileSize ?? null,
                },
            }
            : {}),
    };
}

export default function CreateRecordScreen({ navigation }: any) {
    const { user } = useAuthStore();
    const recordApi: any = recordService;

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
        () => RECORD_TYPES.find((item: RecordTypeOption) => item.key === recordType) || RECORD_TYPES[0],
        [recordType]
    );

    const pickImage = async () => {
        try {
            setIsPickingImage(true);

            let imagePicker: typeof import('expo-image-picker') | null = null;
            try {
                imagePicker = await import('expo-image-picker');
            } catch {
                Alert.alert(
                    'Thiếu module native',
                    'Ứng dụng hiện tại chưa có expo-image-picker. Hãy build lại bằng npm run android:dev rồi mở lại app.'
                );
                return;
            }

            const permission = await imagePicker.requestMediaLibraryPermissionsAsync();

            if (!permission.granted) {
                Alert.alert('Thiếu quyền truy cập ảnh', 'Vui lòng cấp quyền thư viện ảnh để đính kèm ảnh vào hồ sơ.');
                return;
            }

            const result = await imagePicker.launchImageLibraryAsync({
                mediaTypes: imagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.5,
                base64: true,
                exif: false,
            });

            if (result.canceled || !result.assets?.length) {
                return;
            }

            const asset = result.assets[0];
            if (!asset.base64) {
                Alert.alert('Không đọc được ảnh', 'Ảnh được chọn không có dữ liệu base64. Vui lòng thử ảnh khác.');
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
        } catch (pickError: any) {
            Alert.alert('Lỗi chọn ảnh', pickError?.message || 'Không thể mở thư viện ảnh.');
        } finally {
            setIsPickingImage(false);
        }
    };

    const clearImage = () => {
        setSelectedImage(null);
    };

    const handleSubmit = async () => {
        if (!title.trim()) {
            Alert.alert('Thiếu tiêu đề', 'Hãy nhập tiêu đề hồ sơ trước khi tạo.');
            return;
        }

        if (!description.trim() && !diagnosis.trim() && !notes.trim() && !medication.trim() && !selectedImage) {
            Alert.alert('Thiếu nội dung', 'Hãy nhập nội dung hoặc đính kèm ít nhất một ảnh cho hồ sơ.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        let cidHashForRecovery: string | null = null;
        let localDraft: any = null;

        try {
            const payload = buildPayload({
                title,
                description,
                recordTypeLabel: selectedType.label,
                diagnosis,
                medication,
                dosage,
                frequency,
                heartRate: cleanNumber(heartRate),
                bloodPressure: cleanNumber(bloodPressure),
                temperature: cleanNumber(temperature),
                notes,
                attachment: selectedImage,
            });

            const aesKey = await generateAESKey();
            const encryptedData = await encryptData(payload, aesKey);
            const { cid } = await ipfsService.uploadEncrypted({
                encryptedData,
                metadata: {
                    title: title.trim(),
                    recordType,
                },
            });

            const cidHash = keccak256(toBytes(cid));
            const recordTypeHash = keccak256(toBytes(recordType));
            const nowIso = new Date().toISOString();

            cidHashForRecovery = cidHash;
            localDraft = {
                cid,
                aesKey,
                title: title.trim(),
                recordType,
                recordTypeHash,
                parentCidHash: null,
                description: description.trim(),
                createdAt: nowIso,
                createdBy: user?.walletAddress || null,
                ownerAddress: user?.walletAddress || null,
                createdByDisplay: 'Bạn',
                syncStatus: 'pending',
                syncError: null,
                hasImage: Boolean(selectedImage),
            };

            const localRecordsStr = await AsyncStorage.getItem(LOCAL_RECORDS_STORAGE_KEY);
            const localRecords = localRecordsStr ? JSON.parse(localRecordsStr) : {};
            localRecords[cidHash] = {
                ...(localRecords[cidHash] || {}),
                ...localDraft,
            };
            await AsyncStorage.setItem(LOCAL_RECORDS_STORAGE_KEY, JSON.stringify(localRecords));

            const created = await recordApi.createRecord(
                cidHash,
                recordTypeHash,
                null,
                title.trim(),
                description.trim() || null,
                recordType
            );

            const refreshedLocalRecordsStr = await AsyncStorage.getItem(LOCAL_RECORDS_STORAGE_KEY);
            const refreshedLocalRecords = refreshedLocalRecordsStr ? JSON.parse(refreshedLocalRecordsStr) : {};
            refreshedLocalRecords[cidHash] = {
                ...(refreshedLocalRecords[cidHash] || {}),
                ...localDraft,
                createdAt: created?.createdAt || nowIso,
                confirmedAt: created?.confirmedAt || nowIso,
                syncStatus: created?.syncStatus || 'confirmed',
                syncError: null,
                txHash: created?.txHash || null,
                recordId: created?.id || null,
            };
            await AsyncStorage.setItem(LOCAL_RECORDS_STORAGE_KEY, JSON.stringify(refreshedLocalRecords));

            const record = {
                id: created?.id,
                cidHash,
                title: title.trim(),
                type: recordType,
                description: description.trim() || null,
                date: new Date(created?.createdAt || Date.now()).toLocaleDateString('vi-VN'),
                createdAt: new Date(created?.createdAt || Date.now()).toISOString(),
                createdBy: user?.walletAddress,
                createdByDisplay: 'Bạn',
                ownerAddress: user?.walletAddress,
            };

            Alert.alert('Tạo hồ sơ thành công', 'Hồ sơ mới đã được mã hoá, lưu IPFS và đăng ký lên hệ thống.');
            navigation.replace('RecordDetail', { record: toSerializableRecord(record) });
        } catch (submitError: any) {
            const message = buildCreateRecordErrorMessage(submitError);
            setError(message);

            if (cidHashForRecovery && localDraft) {
                try {
                    const localRecordsStr = await AsyncStorage.getItem(LOCAL_RECORDS_STORAGE_KEY);
                    const localRecords = localRecordsStr ? JSON.parse(localRecordsStr) : {};
                    localRecords[cidHashForRecovery] = {
                        ...(localRecords[cidHashForRecovery] || {}),
                        ...localDraft,
                        syncStatus: 'failed',
                        syncError: message,
                        failedAt: new Date().toISOString(),
                    };
                    await AsyncStorage.setItem(LOCAL_RECORDS_STORAGE_KEY, JSON.stringify(localRecords));
                } catch (storageError) {
                    console.warn('Không thể lưu trạng thái retry local:', storageError);
                }

                const offlineRecord = {
                    cidHash: cidHashForRecovery,
                    title: title.trim(),
                    type: recordType,
                    description: description.trim() || null,
                    date: new Date().toLocaleDateString('vi-VN'),
                    createdAt: new Date().toISOString(),
                    createdBy: user?.walletAddress,
                    createdByDisplay: 'Bạn',
                    ownerAddress: user?.walletAddress,
                };

                Alert.alert(
                    'On-chain tạm thời thất bại',
                    `${message}\n\nDữ liệu đã được lưu local, bạn có thể mở chi tiết để xem/giải mã và thử lại sau.`,
                    [
                        { text: 'Mở chi tiết', onPress: () => navigation.replace('RecordDetail', { record: toSerializableRecord(offlineRecord) }) },
                        { text: 'Đóng', style: 'cancel' },
                    ]
                );
            } else {
                Alert.alert('Tạo hồ sơ thất bại', message);
            }
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
            <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 6 }}>
                {label}
            </Text>
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
                            <Text fontSize="$6" fontWeight="800" color="$color12">Tạo hồ sơ mới</Text>
                            <Text fontSize="$3" color="$color10">Nhập thông tin, mã hoá và đưa lên hệ thống cho bạn.</Text>
                        </YStack>
                    </XStack>
                    <View style={{ backgroundColor: EHR_SURFACE_LOW, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 16, padding: 12 }}>
                        <Text fontSize="$2" style={{ color: EHR_ON_SURFACE_VARIANT }}>
                            Luồng tạo hồ sơ: nhập nội dung, mã hoá AES, upload IPFS, rồi đăng ký cidHash qua backend/on-chain.
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
                                <View
                                    style={{
                                        borderRadius: 20,
                                        borderWidth: 1,
                                        borderColor: active ? type.tint : EHR_OUTLINE_VARIANT,
                                        backgroundColor: active ? type.bg : EHR_SURFACE_LOWEST,
                                        paddingHorizontal: 14,
                                        paddingVertical: 12,
                                        minWidth: 150,
                                    }}
                                >
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
                    {renderInput('Tiêu đề', title, setTitle, { placeholder: 'Ví dụ: Khám tổng quát tháng 3/2026' })}
                    {renderInput('Mô tả ngắn', description, setDescription, { placeholder: 'Tóm tắt nhanh kết quả hoặc mục đích buổi khám', multiline: true })}
                    {renderInput('Chẩn đoán', diagnosis, setDiagnosis, { placeholder: 'Mỗi dòng một chẩn đoán, hoặc ngăn cách bằng dấu chấm phẩy', multiline: true })}
                    {renderInput('Ghi chú thêm', notes, setNotes, { placeholder: 'Chi tiết bổ sung, lưu ý, lịch hẹn tái khám...', multiline: true })}
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 14 }}>Ảnh đính kèm (tuỳ chọn)</Text>

                    {selectedImage ? (
                        <YStack style={{ marginBottom: 12 }}>
                            <View style={{ borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: EHR_OUTLINE_VARIANT }}>
                                <Image
                                    source={{ uri: selectedImage.uri }}
                                    style={{ width: '100%', height: 220, backgroundColor: EHR_SURFACE_LOW }}
                                    resizeMode="cover"
                                />
                            </View>
                            <Text fontSize="$2" color="$color10" style={{ marginTop: 8 }}>
                                {selectedImage.fileName}
                            </Text>
                        </YStack>
                    ) : null}

                    <XStack style={{ gap: 10 }}>
                        <Pressable onPress={pickImage} style={{ flex: 1 }} disabled={isPickingImage}>
                            <View
                                style={{
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: EHR_OUTLINE_VARIANT,
                                    backgroundColor: EHR_SURFACE_LOW,
                                    padding: 12,
                                    opacity: isPickingImage ? 0.7 : 1,
                                }}
                            >
                                <XStack style={{ alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <ImagePlus size={16} color={EHR_PRIMARY} />
                                    <Text fontSize="$3" fontWeight="700" color="$color12">
                                        {selectedImage ? 'Chọn ảnh khác' : (isPickingImage ? 'Đang mở thư viện...' : 'Chọn ảnh')}
                                    </Text>
                                </XStack>
                            </View>
                        </Pressable>

                        {selectedImage ? (
                            <Pressable onPress={clearImage}>
                                <View
                                    style={{
                                        borderRadius: 16,
                                        borderWidth: 1,
                                        borderColor: EHR_OUTLINE_VARIANT,
                                        backgroundColor: EHR_SURFACE_LOW,
                                        paddingHorizontal: 14,
                                        paddingVertical: 12,
                                    }}
                                >
                                    <XStack style={{ alignItems: 'center', gap: 8 }}>
                                        <Trash2 size={16} color={EHR_ERROR} />
                                        <Text fontSize="$3" fontWeight="700" style={{ color: EHR_ERROR }}>
                                            Xoá
                                        </Text>
                                    </XStack>
                                </View>
                            </Pressable>
                        ) : null}
                    </XStack>

                    <Text fontSize="$2" color="$color10" style={{ marginTop: 8 }}>
                        Ảnh sẽ được mã hoá cùng nội dung hồ sơ trước khi upload lên IPFS.
                    </Text>
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 14 }}>Chỉ số cơ bản</Text>
                    <XStack style={{ gap: 10, marginBottom: 8 }}>
                        <View style={{ flex: 1 }}>
                            {renderInput('Nhịp tim', heartRate, setHeartRate, { placeholder: '72', keyboardType: 'numeric' })}
                        </View>
                        <View style={{ flex: 1 }}>
                            {renderInput('Huyết áp', bloodPressure, setBloodPressure, { placeholder: '120/80' })}
                        </View>
                    </XStack>
                    <View style={{ marginTop: -6 }}>
                        {renderInput('Nhiệt độ', temperature, setTemperature, { placeholder: '36.8', keyboardType: 'decimal-pad' })}
                    </View>
                    <XStack style={{ alignItems: 'center', gap: 8, marginTop: -4 }}>
                        <Activity size={16} color={EHR_ON_SURFACE_VARIANT} />
                        <Text fontSize="$2" color="$color10">Chỉ số này sẽ xuất hiện trong màn chi tiết sau khi giải mã.</Text>
                    </XStack>
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 14 }}>Đơn thuốc / can thiệp</Text>
                    {renderInput('Thuốc hoặc can thiệp', medication, setMedication, { placeholder: 'Ví dụ: Paracetamol 500mg' })}
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            {renderInput('Liều dùng', dosage, setDosage, { placeholder: '1 viên' })}
                        </View>
                        <View style={{ flex: 1 }}>
                            {renderInput('Tần suất', frequency, setFrequency, { placeholder: '2 lần/ngày' })}
                        </View>
                    </XStack>
                    <XStack style={{ alignItems: 'center', gap: 8, marginTop: -4 }}>
                        <Pill size={16} color={EHR_ON_SURFACE_VARIANT} />
                        <Text fontSize="$2" color="$color10">Nếu để trống, hồ sơ vẫn được tạo mà không có mục đơn thuốc.</Text>
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
                        <Text color={EHR_ON_PRIMARY} fontWeight="800">{isSubmitting ? 'Đang tạo hồ sơ...' : 'Tạo hồ sơ mới'}</Text>
                    </XStack>
                </Button>

                <XStack style={{ alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }}>
                    <Thermometer size={14} color={EHR_ON_SURFACE_VARIANT} />
                    <Text fontSize="$2" color="$color10">Sau khi tạo xong, bạn có thể mở ngay màn chi tiết để giải mã nội dung.</Text>
                </XStack>
            </ScrollView>
        </SafeAreaView>
    );
}





