// CreateRecordScreen v2 — port of .design-bundle/project/screens-extras.jsx
// PatientCreateRecordScreen. Patient tự tạo hồ sơ với 2 mode: Đơn giản (chụp
// ảnh + ghi chú) và Chi tiết (full medical form: ICD-10, vital signs, đơn
// thuốc per TT 04/2022 + TT 46/2018). Cinnabar reserved for the final
// "Tạo hồ sơ" CTA (legal-action: register on-chain).
//
// ALL handler logic preserved bit-for-bit from screens/CreateRecordScreen.tsx:
//   - buildPayload (meta + summary + notes + observations + diagnoses +
//     prescriptions + image attachment)
//   - generateAESKey + encryptData + ipfsService.uploadEncrypted
//   - createRecord (on-chain via relayer)
//   - localRecordStore for retry recovery
//   - autoPreShareNewRecord (Trusted Contact S18) fire-and-forget
//   - SELF-KEYSHARE backup to backend so patient can recover on reinstall
//   - Update mode: cascade new AES to all existing recipients of parent chain
//   - error code mapping (QUOTA_EXHAUSTED / RECORD_EXISTS / etc.)
//   - isMountedRef so late-arriving upload doesn't pop MainTabs

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Text, XStack, YStack } from 'tamagui';
import { keccak256, toBytes } from 'viem';
import {
    Activity,
    FilePlus2,
    HeartPulse,
    ImagePlus,
    Pill,
    Plus,
    Stethoscope,
    TestTubeDiagonal,
    Trash2,
    X,
    type LucideIcon,
} from 'lucide-react-native';

import Icd10Picker from '../components/Icd10Picker';
import type { Icd10Code } from '../constants/icd10';
import { encryptData, generateAESKey } from '../services/crypto';
import ipfsService from '../services/ipfs.service';
import recordService from '../services/record.service';
import keyShareService from '../services/keyShare.service';
import walletActionService from '../services/walletAction.service';
import { getOrCreateEncryptionKeypair, encryptForRecipient } from '../services/nacl-crypto';
import { normalizeBase64 } from '../utils/base64';
import localRecordStore from '../services/localRecordStore';
import { autoPreShareNewRecord } from '../services/trustedContact.service';
import useAuthStore from '../store/authStore';
import ViCard from '../components-v2/ViCard';
import ViButton from '../components-v2/ViButton';
import { ViSectionLabel } from '../components-v2/ViChips';
import { useEhrPalette, DARK } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type RecordTypeOption = {
    key: string;
    label: string;
    icon: LucideIcon;
    tint: string;
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

// Tints reference DARK at module load (used as visual hints only — actual
// JSX uses palette refs inside components for theme reactivity).
const RECORD_TYPES: RecordTypeOption[] = [
    { key: 'checkup', label: 'Khám tổng quát', icon: Stethoscope, tint: DARK.EHR_PRIMARY },
    { key: 'lab_result', label: 'Xét nghiệm', icon: TestTubeDiagonal, tint: DARK.EHR_TERTIARY },
    { key: 'prescription', label: 'Đơn thuốc', icon: Pill, tint: DARK.EHR_SECONDARY },
    { key: 'vital_signs', label: 'Chỉ số sinh tồn', icon: HeartPulse, tint: DARK.EHR_PRIMARY },
];

function toSerializableRecord(record: Record<string, any>) {
    const createdAtIso = record?.createdAt
        ? new Date(record.createdAt).toISOString()
        : new Date().toISOString();
    return { ...record, createdAt: createdAtIso };
}

function buildCreateRecordErrorMessage(submitError: any): string {
    const code = submitError?.code || submitError?.data?.code;
    if (code === 'QUOTA_EXHAUSTED') return 'Đã hết quota upload miễn phí. Hãy kết nối ví có ETH hoặc thử lại sau.';
    if (code === 'PATIENT_NOT_REGISTERED') return 'Tài khoản chưa được đăng ký patient on-chain. Thử đăng nhập lại rồi tạo hồ sơ lại.';
    if (code === 'SPONSOR_NOT_AUTHORIZED' || code === 'RELAYER_NOT_AUTHORIZED') return 'Hệ thống sponsor chưa được cấp quyền trên smart contract. Cần cập nhật backend contract config.';
    if (code === 'RELAYER_NOT_CONFIGURED') return 'Backend chưa cấu hình SPONSOR_PRIVATE_KEY hoặc RPC URL.';
    if (code === 'RECORD_EXISTS') return 'Hồ sơ này đã tồn tại trên blockchain. Vui lòng làm mới danh sách hồ sơ.';
    if (code === 'CID_RESERVED') return 'CID này đang được dùng bởi một lượt upload khác. Vui lòng tạo lại hồ sơ mới.';
    if (code === 'MAX_CHILDREN_REACHED') return 'Bản ghi gốc đã đạt giới hạn số phiên bản. Hãy tạo hồ sơ gốc mới.';
    if (submitError?.status === 429) return 'Backend đang bị giới hạn tài nguyên tạm thời. Vui lòng thử lại sau ít phút.';
    return submitError?.message || 'Không thể tạo hồ sơ mới';
}

function splitLines(value: string): string[] {
    return value.split(/\r?\n|;/).map((item: string) => item.trim()).filter(Boolean);
}

function cleanNumber(value: string): string {
    const trimmed = value.trim();
    return trimmed ? trimmed : '';
}

function buildPayload(input: BuildPayloadInput) {
    const {
        title, description, recordTypeLabel, icd10Codes, diagnosisNote, medication, dosage,
        frequency, route, quantity, duration, instruction, heartRate, systolic, diastolic,
        temperature, respRate, spo2, weight, height, notes, attachment,
    } = input;
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
        if (h > 0 && w > 0) observations.bmi = (w / (h * h)).toFixed(1);
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
    const palette = useEhrPalette();
    const { user } = useAuthStore();
    const recordApi: any = recordService;
    const isMountedRef = useRef(true);
    useEffect(() => () => { isMountedRef.current = false; }, []);
    const parentCidHash: string | null = navRoute?.params?.parentCidHash || null;
    const initialTitle: string = navRoute?.params?.initialTitle || '';
    const initialRecordType: string | null = navRoute?.params?.initialRecordType || null;
    const isUpdateMode = Boolean(parentCidHash);

    const [title, setTitle] = useState(initialTitle);
    const [description, setDescription] = useState('');
    const [recordType, setRecordType] = useState(
        (initialRecordType && RECORD_TYPES.find((r) => r.key === initialRecordType)?.key) || RECORD_TYPES[0].key,
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
        () => RECORD_TYPES.find((item) => item.key === recordType) || RECORD_TYPES[0],
        [recordType],
    );

    const pickImage = async () => {
        try {
            setIsPickingImage(true);
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                Alert.alert('Thiếu quyền truy cập ảnh', 'Vui lòng cấp quyền thư viện ảnh để đính kèm ảnh vào hồ sơ.');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.5,
                base64: true,
                exif: false,
            });
            if (result.canceled || !result.assets?.length) return;
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
        } else if (!description.trim() && !diagnosisNote.trim() && icd10Codes.length === 0
            && !notes.trim() && !medication.trim() && !selectedImage) {
            Alert.alert('Thiếu nội dung', 'Hãy nhập nội dung hoặc đính kèm ít nhất một ảnh cho hồ sơ.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        let cidHashForRecovery: string | null = null;
        let localDraft: any = null;

        try {
            const payload = buildPayload({
                title, description, recordTypeLabel: selectedType.label, icd10Codes, diagnosisNote,
                medication, dosage, frequency, route, quantity, duration, instruction,
                heartRate: cleanNumber(heartRate), systolic: cleanNumber(systolic),
                diastolic: cleanNumber(diastolic), temperature: cleanNumber(temperature),
                respRate: cleanNumber(respRate), spo2: cleanNumber(spo2),
                weight: cleanNumber(weight), height: cleanNumber(height),
                notes, attachment: selectedImage,
            });

            const aesKey = await generateAESKey();
            const encryptedData = await encryptData(payload, aesKey);
            const { cid } = await ipfsService.uploadEncrypted({
                encryptedData,
                metadata: { title: title.trim(), recordType },
            });

            const cidHash = keccak256(toBytes(cid));
            const recordTypeHash = keccak256(toBytes(recordType));
            const nowIso = new Date().toISOString();

            cidHashForRecovery = cidHash;
            localDraft = {
                cid, aesKey,
                title: title.trim(),
                recordType, recordTypeHash,
                parentCidHash,
                description: description.trim(),
                createdAt: nowIso,
                createdBy: user?.walletAddress || null,
                ownerAddress: user?.walletAddress || null,
                createdByDisplay: 'Bạn',
                syncStatus: 'pending',
                syncError: null,
                hasImage: Boolean(selectedImage),
            };
            await localRecordStore.setKey(cidHash, localDraft);

            const created = await recordApi.createRecord(
                cidHash, recordTypeHash, parentCidHash,
                title.trim(), description.trim() || null, recordType,
            );

            await localRecordStore.setKey(cidHash, {
                ...localDraft,
                createdAt: created?.createdAt || nowIso,
                confirmedAt: created?.confirmedAt || nowIso,
                syncStatus: created?.syncStatus || 'confirmed',
                syncError: null,
                txHash: created?.txHash || null,
                recordId: created?.id || null,
            });

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

            autoPreShareNewRecord({
                cidHash, cid, aesKey,
                patientAddress: user?.walletAddress || '',
            }).catch((err) => console.warn('Trusted Contact pre-share failed (non-fatal):', err));

            try {
                const { walletClient: selfWc, address: selfAddr } = await walletActionService.getWalletContext();
                const selfKeypair = await getOrCreateEncryptionKeypair(selfWc, selfAddr);
                const selfPayload = JSON.stringify({ cid, aesKey });
                const selfEncrypted = encryptForRecipient(selfPayload, selfKeypair.publicKey, selfKeypair.secretKey);
                await keyShareService.shareKey({
                    cidHash,
                    recipientAddress: selfAddr.toLowerCase(),
                    encryptedPayload: selfEncrypted,
                    senderPublicKey: selfKeypair.publicKey,
                    expiresAt: null,
                });
            } catch (selfErr) {
                console.warn('Self-KeyShare backup failed (non-fatal):', selfErr);
            }

            if (isUpdateMode && parentCidHash) {
                try {
                    const recipients: Array<{ walletAddress: string; encryptionPublicKey: string }> =
                        await keyShareService.getRecordRecipients(parentCidHash);
                    if (Array.isArray(recipients) && recipients.length > 0) {
                        const { walletClient, address: myAddress } = await walletActionService.getWalletContext();
                        const myKeypair = await getOrCreateEncryptionKeypair(walletClient, myAddress);
                        const payload2 = JSON.stringify({ cid, aesKey });
                        for (const r of recipients) {
                            if (!r?.walletAddress || !r?.encryptionPublicKey) continue;
                            if (r.walletAddress.toLowerCase() === String(myAddress).toLowerCase()) continue;
                            try {
                                const encryptedPayload = encryptForRecipient(payload2, r.encryptionPublicKey, myKeypair.secretKey);
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

            if (!isMountedRef.current) return;

            Alert.alert(
                isUpdateMode ? 'Cập nhật hồ sơ thành công' : 'Tạo hồ sơ thành công',
                isUpdateMode
                    ? 'Phiên bản mới đã được mã hoá, lưu IPFS và liên kết với hồ sơ gốc.'
                    : 'Hồ sơ mới đã được mã hoá, lưu IPFS và đăng ký lên hệ thống.',
            );
            if (navigation.canGoBack?.()) {
                navigation.replace('RecordDetail', { record: toSerializableRecord(record) });
            }
        } catch (submitError: any) {
            const message = buildCreateRecordErrorMessage(submitError);
            if (!isMountedRef.current) return;
            setError(message);
            if (cidHashForRecovery && localDraft) {
                try {
                    await localRecordStore.setKey(cidHashForRecovery, {
                        ...localDraft,
                        syncStatus: 'failed',
                        syncError: message,
                        failedAt: new Date().toISOString(),
                    });
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
                        {
                            text: 'Mở chi tiết',
                            onPress: () => {
                                if (navigation.canGoBack?.()) {
                                    navigation.replace('RecordDetail', { record: toSerializableRecord(offlineRecord) });
                                }
                            },
                        },
                        { text: 'Đóng', style: 'cancel' },
                    ],
                );
            } else {
                Alert.alert('Tạo hồ sơ thất bại', message);
            }
        } finally {
            if (isMountedRef.current) setIsSubmitting(false);
        }
    };

    const renderInput = (
        label: string,
        value: string,
        onChangeText: (text: string) => void,
        options: { multiline?: boolean; placeholder?: string; keyboardType?: KeyboardTypeOptions } = {},
    ) => (
        <YStack style={{ marginBottom: 12 }}>
            <Text style={{ fontFamily: SANS_SEMI, fontSize: 12, color: palette.EHR_OUTLINE, marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: '600' }}>
                {label}
            </Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={options.placeholder || ''}
                placeholderTextColor={palette.EHR_OUTLINE}
                keyboardType={options.keyboardType}
                multiline={options.multiline}
                textAlignVertical={options.multiline ? 'top' : 'center'}
                style={{
                    minHeight: options.multiline ? 90 : 48,
                    borderRadius: 12,
                    borderWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                    backgroundColor: palette.EHR_SURFACE,
                    paddingHorizontal: 14,
                    paddingVertical: options.multiline ? 12 : 0,
                    color: palette.EHR_ON_SURFACE,
                    fontFamily: SANS,
                    fontSize: 14,
                }}
            />
        </YStack>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['left', 'right', 'bottom']}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 36 }} showsVerticalScrollIndicator={false}>
                {/* Hero */}
                <View style={{ marginBottom: 18 }}>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 28,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.5,
                            lineHeight: 32,
                        }}
                    >
                        {isUpdateMode ? 'Cập nhật hồ sơ' : 'Tạo hồ sơ mới'}
                    </Text>
                    <Text
                        style={{
                            marginTop: 6,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 19,
                        }}
                    >
                        {isUpdateMode
                            ? 'Phiên bản mới liên kết hồ sơ gốc — bên đã chia sẻ vẫn truy cập được.'
                            : 'Tự khai báo hồ sơ y tế. Mã hoá đầu cuối + đăng ký on-chain.'}
                    </Text>
                </View>

                {/* Self-khai banner (clay) — design pattern: warm clay accent for "tự khai" data */}
                {!isUpdateMode ? (
                    <View
                        style={{
                            marginBottom: 16,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            borderRadius: 12,
                            backgroundColor: `${palette.EHR_SECONDARY}1A`,
                            borderWidth: 0.5,
                            borderColor: `${palette.EHR_SECONDARY}50`,
                            flexDirection: 'row',
                            gap: 10,
                        }}
                    >
                        <View
                            style={{
                                width: 4,
                                alignSelf: 'stretch',
                                backgroundColor: palette.EHR_SECONDARY,
                                borderRadius: 2,
                            }}
                        />
                        <Text
                            style={{
                                flex: 1,
                                fontFamily: SANS,
                                fontSize: 12,
                                color: palette.EHR_ON_SURFACE,
                                lineHeight: 18,
                            }}
                        >
                            Đây là{' '}
                            <Text style={{ fontFamily: SANS_SEMI, color: palette.EHR_SECONDARY, fontWeight: '700' }}>
                                hồ sơ tự khai
                            </Text>
                            . Khác với hồ sơ do bác sĩ tạo, nội dung này chưa được xác minh bởi tổ chức y tế.
                        </Text>
                    </View>
                ) : null}

                {/* Mode switch */}
                <XStack style={{ gap: 8, marginBottom: 16 }}>
                    <Pressable style={{ flex: 1 }} onPress={() => setSimpleMode(true)}>
                        <View
                            style={{
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                borderRadius: 12,
                                borderWidth: simpleMode ? 1.5 : 0.5,
                                borderColor: simpleMode ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                backgroundColor: simpleMode ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE_LOWEST,
                            }}
                        >
                            <XStack style={{ alignItems: 'center', gap: 10 }}>
                                <ImagePlus size={18} color={simpleMode ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE_VARIANT} />
                                <YStack style={{ flex: 1 }}>
                                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 13.5, color: simpleMode ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE, fontWeight: '700' }}>
                                        Nhanh
                                    </Text>
                                    <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE }}>
                                        Tiêu đề + ảnh
                                    </Text>
                                </YStack>
                            </XStack>
                        </View>
                    </Pressable>
                    <Pressable style={{ flex: 1 }} onPress={() => setSimpleMode(false)}>
                        <View
                            style={{
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                borderRadius: 12,
                                borderWidth: !simpleMode ? 1.5 : 0.5,
                                borderColor: !simpleMode ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                backgroundColor: !simpleMode ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE_LOWEST,
                            }}
                        >
                            <XStack style={{ alignItems: 'center', gap: 10 }}>
                                <Stethoscope size={18} color={!simpleMode ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE_VARIANT} />
                                <YStack style={{ flex: 1 }}>
                                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 13.5, color: !simpleMode ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE, fontWeight: '700' }}>
                                        Đầy đủ
                                    </Text>
                                    <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE }}>
                                        Toàn bộ trường (ICD-10, Rx…)
                                    </Text>
                                </YStack>
                            </XStack>
                        </View>
                    </Pressable>
                </XStack>

                {/* Record type selector — only in detail mode */}
                {!simpleMode ? (
                    <YStack style={{ marginBottom: 18 }}>
                        <ViSectionLabel>Loại hồ sơ</ViSectionLabel>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 }}>
                            {RECORD_TYPES.map((type) => {
                                const Icon = type.icon;
                                const active = type.key === recordType;
                                return (
                                    <Pressable key={type.key} onPress={() => setRecordType(type.key)}>
                                        <View
                                            style={{
                                                paddingVertical: 10,
                                                paddingHorizontal: 14,
                                                borderRadius: 14,
                                                borderWidth: active ? 1.5 : 0.5,
                                                borderColor: active ? type.tint : palette.EHR_OUTLINE_SOFT,
                                                backgroundColor: active ? `${type.tint}1A` : palette.EHR_SURFACE_LOWEST,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}
                                        >
                                            <Icon size={14} color={active ? type.tint : palette.EHR_OUTLINE} />
                                            <Text
                                                style={{
                                                    fontFamily: SANS_MEDIUM,
                                                    fontSize: 12.5,
                                                    color: active ? type.tint : palette.EHR_ON_SURFACE_VARIANT,
                                                    fontWeight: '600',
                                                }}
                                            >
                                                {type.label}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </YStack>
                ) : null}

                {/* Content card */}
                <ViCard padding={16} style={{ marginBottom: 14 }}>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 17,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.2,
                            marginBottom: 12,
                        }}
                    >
                        {simpleMode ? 'Thông tin hồ sơ' : 'Nội dung chính'}
                    </Text>
                    {renderInput('Tiêu đề', title, setTitle, {
                        placeholder: simpleMode
                            ? 'Ví dụ: Ảnh đơn thuốc tháng 3'
                            : 'Ví dụ: Khám tổng quát tháng 3/2026',
                    })}
                    {renderInput(simpleMode ? 'Ghi chú' : 'Mô tả ngắn', description, setDescription, {
                        placeholder: simpleMode
                            ? 'Ghi chú thêm về ảnh/giấy tờ này (tuỳ chọn)'
                            : 'Tóm tắt nhanh kết quả hoặc mục đích buổi khám',
                        multiline: true,
                    })}

                    {!simpleMode ? (
                        <YStack style={{ marginBottom: 12 }}>
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 12,
                                    color: palette.EHR_OUTLINE,
                                    marginBottom: 6,
                                    letterSpacing: 0.3,
                                    textTransform: 'uppercase',
                                    fontWeight: '600',
                                }}
                            >
                                Chẩn đoán (ICD-10)
                            </Text>
                            {icd10Codes.length > 0 ? (
                                <YStack style={{ gap: 6, marginBottom: 8 }}>
                                    {icd10Codes.map((item) => (
                                        <XStack
                                            key={item.code}
                                            style={{
                                                alignItems: 'center',
                                                gap: 10,
                                                paddingVertical: 8,
                                                paddingHorizontal: 10,
                                                borderRadius: 10,
                                                backgroundColor: palette.EHR_PRIMARY_FIXED,
                                            }}
                                        >
                                            <View
                                                style={{
                                                    minWidth: 50,
                                                    paddingHorizontal: 6,
                                                    paddingVertical: 2,
                                                    borderRadius: 6,
                                                    backgroundColor: palette.EHR_PRIMARY,
                                                    alignItems: 'center',
                                                }}
                                            >
                                                <Text style={{ fontFamily: 'monospace', fontSize: 11, color: '#FAF7F1', fontWeight: '700' }}>
                                                    {item.code}
                                                </Text>
                                            </View>
                                            <Text style={{ flex: 1, fontFamily: SANS, fontSize: 12.5, color: palette.EHR_ON_SURFACE }}>
                                                {item.name}
                                            </Text>
                                            <Pressable onPress={() => setIcd10Codes((prev) => prev.filter((c) => c.code !== item.code))}>
                                                <X size={16} color={palette.EHR_DANGER} />
                                            </Pressable>
                                        </XStack>
                                    ))}
                                </YStack>
                            ) : null}
                            <Pressable onPress={() => setIcd10PickerOpen(true)}>
                                <View
                                    style={{
                                        paddingVertical: 10,
                                        borderRadius: 12,
                                        borderWidth: 0.75,
                                        borderStyle: 'dashed',
                                        borderColor: palette.EHR_PRIMARY,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 8,
                                    }}
                                >
                                    <Plus size={14} color={palette.EHR_PRIMARY} />
                                    <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 12.5, color: palette.EHR_PRIMARY, fontWeight: '600' }}>
                                        {icd10Codes.length > 0 ? 'Thêm mã ICD-10 khác' : 'Chọn mã ICD-10'}
                                    </Text>
                                </View>
                            </Pressable>
                        </YStack>
                    ) : null}

                    {!simpleMode ? renderInput('Ghi chú chẩn đoán', diagnosisNote, setDiagnosisNote, { placeholder: 'Mô tả thêm nếu không có trong ICD-10', multiline: true }) : null}
                    {!simpleMode ? renderInput('Ghi chú thêm', notes, setNotes, { placeholder: 'Chi tiết bổ sung, lịch tái khám…', multiline: true }) : null}
                </ViCard>

                {/* Image attachment */}
                <ViCard padding={16} style={{ marginBottom: 14 }}>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 17,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.2,
                            marginBottom: 12,
                        }}
                    >
                        Ảnh đính kèm (tuỳ chọn)
                    </Text>
                    {selectedImage ? (
                        <View style={{ marginBottom: 10 }}>
                            <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: palette.EHR_OUTLINE_SOFT }}>
                                <Image
                                    source={{ uri: selectedImage.uri }}
                                    style={{ width: '100%', height: 200, backgroundColor: palette.EHR_SURFACE }}
                                    resizeMode="cover"
                                />
                            </View>
                            <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE }}>
                                {selectedImage.fileName}
                            </Text>
                        </View>
                    ) : null}
                    <XStack style={{ gap: 8 }}>
                        <View style={{ flex: 1 }}>
                            <ViButton
                                variant="ghost"
                                full
                                size="sm"
                                onPress={pickImage}
                                loading={isPickingImage}
                                leftIcon={<ImagePlus size={14} color={palette.EHR_ON_SURFACE} />}
                            >
                                {selectedImage ? 'Chọn ảnh khác' : (isPickingImage ? 'Đang mở…' : 'Chọn ảnh')}
                            </ViButton>
                        </View>
                        {selectedImage ? (
                            <ViButton
                                variant="danger"
                                size="sm"
                                onPress={() => setSelectedImage(null)}
                                leftIcon={<Trash2 size={14} color={palette.EHR_DANGER} />}
                            >
                                Xoá
                            </ViButton>
                        ) : null}
                    </XStack>
                    <Text style={{ marginTop: 8, fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE, lineHeight: 16 }}>
                        Ảnh sẽ được mã hoá cùng nội dung trước khi upload lên IPFS.
                    </Text>
                </ViCard>

                {/* Vital signs (detail mode) */}
                {!simpleMode ? (
                    <ViCard padding={16} style={{ marginBottom: 14 }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 17,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                                marginBottom: 4,
                            }}
                        >
                            Dấu hiệu sinh tồn
                        </Text>
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE, marginBottom: 12 }}>
                            Theo chuẩn bệnh án điện tử (TT 46/2018/TT-BYT)
                        </Text>
                        <XStack style={{ gap: 10 }}>
                            <View style={{ flex: 1 }}>{renderInput('Mạch (bpm)', heartRate, setHeartRate, { placeholder: '72', keyboardType: 'numeric' })}</View>
                            <View style={{ flex: 1 }}>{renderInput('Nhịp thở', respRate, setRespRate, { placeholder: '18', keyboardType: 'numeric' })}</View>
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
                            <View style={{ flex: 1 }}>{renderInput('Chiều cao (cm)', height, setHeight, { placeholder: '165', keyboardType: 'numeric' })}</View>
                        </XStack>
                        <XStack style={{ alignItems: 'center', gap: 6, marginTop: -4 }}>
                            <Activity size={13} color={palette.EHR_OUTLINE} />
                            <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE }}>
                                BMI được tính tự động từ cân nặng và chiều cao.
                            </Text>
                        </XStack>
                    </ViCard>
                ) : null}

                {/* Prescription (detail mode) */}
                {!simpleMode ? (
                    <ViCard padding={16} style={{ marginBottom: 14 }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 17,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                                marginBottom: 4,
                            }}
                        >
                            Đơn thuốc
                        </Text>
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE, marginBottom: 12 }}>
                            Theo chuẩn đơn thuốc điện tử (TT 04/2022/TT-BYT)
                        </Text>
                        {renderInput('Tên thuốc / hoạt chất', medication, setMedication, { placeholder: 'Paracetamol 500mg' })}
                        <XStack style={{ gap: 10 }}>
                            <View style={{ flex: 1 }}>{renderInput('Hàm lượng / Liều', dosage, setDosage, { placeholder: '1 viên' })}</View>
                            <View style={{ flex: 1 }}>{renderInput('Đường dùng', route, setRoute, { placeholder: 'Uống / Tiêm' })}</View>
                        </XStack>
                        <XStack style={{ gap: 10 }}>
                            <View style={{ flex: 1 }}>{renderInput('Số lần / ngày', frequency, setFrequency, { placeholder: '2 lần/ngày' })}</View>
                            <View style={{ flex: 1 }}>{renderInput('Số ngày dùng', duration, setDuration, { placeholder: '5 ngày' })}</View>
                        </XStack>
                        {renderInput('Số lượng kê', quantity, setQuantity, { placeholder: '10 viên' })}
                        {renderInput('Lời dặn bác sĩ', instruction, setInstruction, { placeholder: 'Uống sau ăn, tránh rượu bia…', multiline: true })}
                        <XStack style={{ alignItems: 'flex-start', gap: 6, marginTop: -4 }}>
                            <Pill size={13} color={palette.EHR_OUTLINE} style={{ marginTop: 2 }} />
                            <Text style={{ flex: 1, fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE, lineHeight: 16 }}>
                                Nếu để trống, hồ sơ vẫn được tạo mà không có đơn thuốc.
                            </Text>
                        </XStack>
                    </ViCard>
                ) : null}

                {error ? (
                    <View
                        style={{
                            padding: 12,
                            borderRadius: 12,
                            backgroundColor: `${palette.EHR_DANGER}14`,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_DANGER,
                            marginBottom: 14,
                        }}
                    >
                        <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_DANGER, lineHeight: 18 }}>
                            {error}
                        </Text>
                    </View>
                ) : null}

                <ViButton
                    variant="cinnabar"
                    full
                    size="lg"
                    loading={isSubmitting}
                    onPress={handleSubmit}
                    leftIcon={isSubmitting ? undefined : <FilePlus2 size={16} color="#FAF7F1" />}
                >
                    {isSubmitting
                        ? (isUpdateMode ? 'Đang cập nhật…' : 'Đang tạo hồ sơ…')
                        : (isUpdateMode ? 'Cập nhật hồ sơ' : 'Tạo hồ sơ mới')}
                </ViButton>
                <Text
                    style={{
                        marginTop: 10,
                        textAlign: 'center',
                        fontFamily: SANS,
                        fontSize: 11,
                        color: palette.EHR_OUTLINE,
                        lineHeight: 16,
                    }}
                >
                    Sau khi tạo, bạn có thể mở chi tiết để giải mã nội dung. Khoá AES được lưu local + backup tự share lên server.
                </Text>
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

