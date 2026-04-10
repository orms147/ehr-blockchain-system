import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, TextInput, type KeyboardTypeOptions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { keccak256, toBytes } from 'viem';

import Icd10Picker from '../components/Icd10Picker';
import type { Icd10Code } from '../constants/icd10';
import { encryptData, generateAESKey } from '../services/crypto';
import ipfsService from '../services/ipfs.service';
import recordService from '../services/record.service';
import keyShareService from '../services/keyShare.service';
import walletActionService from '../services/walletAction.service';
import { getOrCreateEncryptionKeypair, encryptForRecipient } from '../services/nacl-crypto';
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
    icd10Codes: Icd10Code[];
    diagnosisNote: string;
    medication: string;
    dosage: string;
    frequency: string;
    route: string;
    quantity: string;
    duration: string;
    instruction: string;
    heartRate: string;
    systolic: string;
    diastolic: string;
    temperature: string;
    respRate: string;
    spo2: string;
    weight: string;
    height: string;
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
    icd10Codes,
    diagnosisNote,
    medication,
    dosage,
    frequency,
    route,
    quantity,
    duration,
    instruction,
    heartRate,
    systolic,
    diastolic,
    temperature,
    respRate,
    spo2,
    weight,
    height,
    notes,
    attachment,
}: BuildPayloadInput) {
    const observations: Record<string, string> = {};

    if (heartRate) observations.heartRate = `${heartRate} bpm`;
    if (systolic && diastolic) observations.bloodPressure = `${systolic}/${diastolic} mmHg`;
    else if (systolic) observations.bloodPressureSystolic = `${systolic} mmHg`;
    if (temperature) observations.temperature = `${temperature} °C`;
    if (respRate) observations.respiratoryRate = `${respRate} lần/phút`;
    if (spo2) observations.spo2 = `${spo2} %`;
    if (weight) observations.weight = `${weight} kg`;
    if (height) observations.height = `${height} cm`;
    if (weight && height) {
        const h = parseFloat(height) / 100;
        const w = parseFloat(weight);
        if (h > 0 && w > 0) {
            observations.bmi = (w / (h * h)).toFixed(1);
        }
    }

    const diagnoses = [
        ...icd10Codes.map((c) => `[${c.code}] ${c.name}`),
        ...splitLines(diagnosisNote),
    ];
    const prescriptions = medication
        ? [{
            medication: medication.trim(),
            dosage: dosage.trim() || 'Theo chỉ định',
            frequency: frequency.trim() || 'Theo hướng dẫn',
            route: route.trim() || undefined,
            quantity: quantity.trim() || undefined,
            duration: duration.trim() || undefined,
            instruction: instruction.trim() || undefined,
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

export default function CreateRecordScreen({ navigation, route: navRoute }: any) {
    const { user } = useAuthStore();
    const recordApi: any = recordService;
    const parentCidHash: string | null = navRoute?.params?.parentCidHash || null;
    const initialTitle: string = navRoute?.params?.initialTitle || '';
    const initialRecordType: string | null = navRoute?.params?.initialRecordType || null;
    const isUpdateMode = Boolean(parentCidHash);

    const [title, setTitle] = useState(initialTitle);
    const [description, setDescription] = useState('');
    const [recordType, setRecordType] = useState(
        (initialRecordType && RECORD_TYPES.find((r) => r.key === initialRecordType)?.key) || RECORD_TYPES[0].key
    );
    const [icd10Codes, setIcd10Codes] = useState<Icd10Code[]>([]);
    const [icd10PickerOpen, setIcd10PickerOpen] = useState(false);
    const [diagnosisNote, setDiagnosisNote] = useState('');
    const [medication, setMedication] = useState('');
    const [dosage, setDosage] = useState('');
    const [frequency, setFrequency] = useState('');
    const [route, setRoute] = useState('');
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
    const [height, setHeight] = useState('');
    const [notes, setNotes] = useState('');
    const [simpleMode, setSimpleMode] = useState(true);
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

            const imagePicker = ImagePicker;

            const permission = await imagePicker.requestMediaLibraryPermissionsAsync();

            if (!permission.granted) {
                Alert.alert('Thiếu quyền truy cập ảnh', 'Vui lòng cấp quyền thư viện ảnh để đính kèm ảnh vào hồ sơ.');
                return;
            }

            const result = await imagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
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

        if (simpleMode) {
            if (!selectedImage && !description.trim()) {
                Alert.alert('Thiếu nội dung', 'Hãy chụp/chọn ảnh hoặc viết ghi chú cho hồ sơ.');
                return;
            }
        } else if (!description.trim() && !diagnosisNote.trim() && icd10Codes.length === 0 && !notes.trim() && !medication.trim() && !selectedImage) {
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
                icd10Codes,
                diagnosisNote,
                medication,
                dosage,
                frequency,
                route,
                quantity,
                duration,
                instruction,
                heartRate: cleanNumber(heartRate),
                systolic: cleanNumber(systolic),
                diastolic: cleanNumber(diastolic),
                temperature: cleanNumber(temperature),
                respRate: cleanNumber(respRate),
                spo2: cleanNumber(spo2),
                weight: cleanNumber(weight),
                height: cleanNumber(height),
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
                parentCidHash: parentCidHash,
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
                parentCidHash,
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

            // AUTO-SYNC: when creating a new version, propagate the new AES key to
            // every existing recipient of the chain so all doctors who previously had
            // access can immediately decrypt the new version without re-requesting.
            if (isUpdateMode && parentCidHash) {
                try {
                    const recipients: Array<{ walletAddress: string; encryptionPublicKey: string }> =
                        await keyShareService.getRecordRecipients(parentCidHash);
                    if (Array.isArray(recipients) && recipients.length > 0) {
                        const { walletClient, address: myAddress } = await walletActionService.getWalletContext();
                        const myKeypair = await getOrCreateEncryptionKeypair(walletClient, myAddress);
                        const payload = JSON.stringify({ cid, aesKey });
                        for (const r of recipients) {
                            if (!r?.walletAddress || !r?.encryptionPublicKey) continue;
                            if (r.walletAddress.toLowerCase() === String(myAddress).toLowerCase()) continue;
                            try {
                                const encryptedPayload = encryptForRecipient(payload, r.encryptionPublicKey, myKeypair.secretKey);
                                await keyShareService.shareKey({
                                    cidHash,
                                    recipientAddress: r.walletAddress.toLowerCase(),
                                    encryptedPayload,
                                    senderPublicKey: myKeypair.publicKey,
                                    expiresAt: null,
                                    allowDelegate: false,
                                });
                            } catch (propErr) {
                                console.warn('Propagate keyShare failed for', r.walletAddress, propErr);
                            }
                        }
                    }
                } catch (propErr) {
                    console.warn('Recipient propagation skipped:', propErr);
                }
            }

            Alert.alert(
                isUpdateMode ? 'Cập nhật hồ sơ thành công' : 'Tạo hồ sơ thành công',
                isUpdateMode
                    ? 'Phiên bản mới đã được mã hoá, lưu IPFS và liên kết với hồ sơ gốc.'
                    : 'Hồ sơ mới đã được mã hoá, lưu IPFS và đăng ký lên hệ thống.'
            );
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
                            <Text fontSize="$6" fontWeight="800" color="$color12">{isUpdateMode ? 'Cập nhật hồ sơ' : 'Tạo hồ sơ mới'}</Text>
                            <Text fontSize="$3" color="$color10">
                                {isUpdateMode
                                    ? 'Tạo phiên bản mới liên kết với hồ sơ gốc. Các bên đã được chia sẻ vẫn truy cập được.'
                                    : 'Nhập thông tin, mã hoá và đưa lên hệ thống cho bạn.'}
                            </Text>
                        </YStack>
                    </XStack>
                    <View style={{ backgroundColor: EHR_SURFACE_LOW, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 16, padding: 12 }}>
                        <Text fontSize="$2" style={{ color: EHR_ON_SURFACE_VARIANT }}>
                            Thông tin của bạn sẽ được mã hoá trước khi lưu. Chỉ bạn mới có thể xem lại.
                        </Text>
                    </View>
                </View>

                <XStack style={{ gap: 10, marginBottom: 16 }}>
                    <Pressable style={{ flex: 1 }} onPress={() => setSimpleMode(true)}>
                        <View style={{
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: simpleMode ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                            backgroundColor: simpleMode ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOWEST,
                            padding: 14,
                        }}>
                            <XStack style={{ alignItems: 'center', gap: 10 }}>
                                <ImagePlus size={20} color={EHR_PRIMARY} />
                                <YStack style={{ flex: 1 }}>
                                    <Text fontSize="$3" fontWeight="800" color="$color12">Đơn giản</Text>
                                    <Text fontSize="$1" color="$color10">Chụp ảnh & ghi chú</Text>
                                </YStack>
                            </XStack>
                        </View>
                    </Pressable>
                    <Pressable style={{ flex: 1 }} onPress={() => setSimpleMode(false)}>
                        <View style={{
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: !simpleMode ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                            backgroundColor: !simpleMode ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOWEST,
                            padding: 14,
                        }}>
                            <XStack style={{ alignItems: 'center', gap: 10 }}>
                                <Stethoscope size={20} color={EHR_PRIMARY} />
                                <YStack style={{ flex: 1 }}>
                                    <Text fontSize="$3" fontWeight="800" color="$color12">Chi tiết</Text>
                                    <Text fontSize="$1" color="$color10">Chuẩn y tế đầy đủ</Text>
                                </YStack>
                            </XStack>
                        </View>
                    </Pressable>
                </XStack>

                {!simpleMode && <Text fontSize="$4" fontWeight="800" color="$color12" style={{ marginBottom: 10 }}>Loại hồ sơ</Text>}
                {!simpleMode && <XStack flexWrap="wrap" style={{ gap: 10, marginBottom: 18 }}>
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
                </XStack>}

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 14 }}>
                        {simpleMode ? 'Thông tin hồ sơ' : 'Nội dung chính'}
                    </Text>
                    {renderInput('Tiêu đề', title, setTitle, { placeholder: simpleMode ? 'Ví dụ: Ảnh đơn thuốc tháng 3' : 'Ví dụ: Khám tổng quát tháng 3/2026' })}
                    {renderInput(simpleMode ? 'Ghi chú' : 'Mô tả ngắn', description, setDescription, { placeholder: simpleMode ? 'Ghi chú thêm về ảnh/giấy tờ này (tuỳ chọn)' : 'Tóm tắt nhanh kết quả hoặc mục đích buổi khám', multiline: true })}

                    {!simpleMode && <YStack style={{ marginBottom: 14 }}>
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
                    </YStack>}

                    {!simpleMode && renderInput('Ghi chú chẩn đoán', diagnosisNote, setDiagnosisNote, { placeholder: 'Mô tả thêm về chẩn đoán nếu không có trong danh mục ICD-10', multiline: true })}
                    {!simpleMode && renderInput('Ghi chú thêm', notes, setNotes, { placeholder: 'Chi tiết bổ sung, lưu ý, lịch hẹn tái khám...', multiline: true })}
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

                {!simpleMode && <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 4 }}>Dấu hiệu sinh tồn</Text>
                    <Text fontSize="$2" color="$color10" style={{ marginBottom: 12 }}>Theo chuẩn bệnh án điện tử (TT 46/2018/TT-BYT)</Text>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            {renderInput('Mạch (lần/phút)', heartRate, setHeartRate, { placeholder: '72', keyboardType: 'numeric' })}
                        </View>
                        <View style={{ flex: 1 }}>
                            {renderInput('Nhịp thở (lần/phút)', respRate, setRespRate, { placeholder: '18', keyboardType: 'numeric' })}
                        </View>
                    </XStack>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            {renderInput('HA tâm thu', systolic, setSystolic, { placeholder: '120', keyboardType: 'numeric' })}
                        </View>
                        <View style={{ flex: 1 }}>
                            {renderInput('HA tâm trương', diastolic, setDiastolic, { placeholder: '80', keyboardType: 'numeric' })}
                        </View>
                    </XStack>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            {renderInput('Nhiệt độ (°C)', temperature, setTemperature, { placeholder: '36.8', keyboardType: 'decimal-pad' })}
                        </View>
                        <View style={{ flex: 1 }}>
                            {renderInput('SpO2 (%)', spo2, setSpo2, { placeholder: '98', keyboardType: 'numeric' })}
                        </View>
                    </XStack>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            {renderInput('Cân nặng (kg)', weight, setWeight, { placeholder: '60', keyboardType: 'decimal-pad' })}
                        </View>
                        <View style={{ flex: 1 }}>
                            {renderInput('Chiều cao (cm)', height, setHeight, { placeholder: '165', keyboardType: 'numeric' })}
                        </View>
                    </XStack>
                    <XStack style={{ alignItems: 'center', gap: 8, marginTop: -4 }}>
                        <Activity size={16} color={EHR_ON_SURFACE_VARIANT} />
                        <Text fontSize="$2" color="$color10">BMI được tính tự động từ cân nặng và chiều cao.</Text>
                    </XStack>
                </View>}

                {!simpleMode && <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 26, padding: 18, marginBottom: 16 }}>
                    <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 4 }}>Đơn thuốc</Text>
                    <Text fontSize="$2" color="$color10" style={{ marginBottom: 12 }}>Theo chuẩn đơn thuốc điện tử (TT 04/2022/TT-BYT)</Text>
                    {renderInput('Tên thuốc / hoạt chất', medication, setMedication, { placeholder: 'Ví dụ: Paracetamol 500mg' })}
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            {renderInput('Hàm lượng / Liều', dosage, setDosage, { placeholder: '1 viên' })}
                        </View>
                        <View style={{ flex: 1 }}>
                            {renderInput('Đường dùng', route, setRoute, { placeholder: 'Uống / Tiêm / Bôi' })}
                        </View>
                    </XStack>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            {renderInput('Số lần / ngày', frequency, setFrequency, { placeholder: '2 lần/ngày' })}
                        </View>
                        <View style={{ flex: 1 }}>
                            {renderInput('Số ngày dùng', duration, setDuration, { placeholder: '5 ngày' })}
                        </View>
                    </XStack>
                    {renderInput('Số lượng kê', quantity, setQuantity, { placeholder: '10 viên' })}
                    {renderInput('Lời dặn bác sĩ', instruction, setInstruction, { placeholder: 'Uống sau ăn, tránh rượu bia...', multiline: true })}
                    <XStack style={{ alignItems: 'flex-start', gap: 8, marginTop: -4 }}>
                        <Pill size={16} color={EHR_ON_SURFACE_VARIANT} style={{ marginTop: 2 }} />
                        <Text fontSize="$2" color="$color10" style={{ flex: 1, flexShrink: 1 }}>
                            Nếu để trống, hồ sơ vẫn được tạo mà không có mục đơn thuốc.
                        </Text>
                    </XStack>
                </View>}

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
                        {isSubmitting ? <ActivityIndicator size="small" color={EHR_ON_PRIMARY} /> : <FilePlus2 size={18} color={EHR_ON_PRIMARY} />}
                        <Text color={EHR_ON_PRIMARY} fontWeight="800">{isSubmitting ? (isUpdateMode ? 'Đang cập nhật...' : 'Đang tạo hồ sơ...') : (isUpdateMode ? 'Cập nhật hồ sơ' : 'Tạo hồ sơ mới')}</Text>
                    </XStack>
                </Button>

                <XStack style={{ alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }}>
                    <Thermometer size={14} color={EHR_ON_SURFACE_VARIANT} />
                    <Text fontSize="$2" color="$color10">Sau khi tạo xong, bạn có thể mở ngay màn chi tiết để giải mã nội dung.</Text>
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





