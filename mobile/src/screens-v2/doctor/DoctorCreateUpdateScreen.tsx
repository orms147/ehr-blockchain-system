// DoctorCreateUpdateScreen v2 — port of .design-bundle/project/screens-doctor.jsx
// CreateRecordScreen. Doctor ghi entry mới HOẶC update version cho bệnh nhân —
// flow on-chain trực tiếp (no patient approval per 2026-04-19 medical episode
// model: doctor documentation is authoritative, patient có quyền xem + đính
// chính nhưng không gate từng entry).
//
// ALL business logic preserved bit-for-bit:
//   - S12.A precheck: patient must have registered NaCl pubkey BEFORE IPFS
//     upload (else KeyShare can't be sealed → silent lockout)
//   - DoctorUpdate.addRecordByDoctor(cidHash, parent, type, patient, encKeyHash, 0)
//   - biometric gateOrThrow before writeContract
//   - getOrCreateEncryptionKeypair + NaCl seal {cid, aesKey} to patient + doctor
//   - recordService.saveOnly mirror to backend
//   - Cascade KeyShare to every existing recipient of parent chain (update mode)
//   - localRecordStore.setKey for instant local decrypt
//   - queryClient.invalidateQueries for both doctor + patient lists
//   - isMountedRef guard against late-arriving Alert callbacks

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Text, XStack, YStack } from 'tamagui';
import { keccak256, parseGwei, toBytes } from 'viem';
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

import Icd10Picker from '../../components/Icd10Picker';
import type { Icd10Code } from '../../constants/icd10';
import { encryptData, generateAESKey } from '../../services/crypto';
import { encryptForRecipient, getOrCreateEncryptionKeypair } from '../../services/nacl-crypto';
import ipfsService from '../../services/ipfs.service';
import walletActionService from '../../services/walletAction.service';
import keyShareService from '../../services/keyShare.service';
import authService from '../../services/auth.service';
import recordService from '../../services/record.service';
import { DOCTOR_UPDATE_ABI } from '../../abi/contractABI';
import { formatChainError } from '../../utils/rpcRetry';
import { normalizeBase64 } from '../../utils/base64';
import localRecordStore from '../../services/localRecordStore';
import useAuthStore from '../../store/authStore';
import ViCard from '../../components-v2/ViCard';
import ViButton from '../../components-v2/ViButton';
import { ViSectionLabel } from '../../components-v2/ViChips';
import { useEhrPalette, DARK } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const DOCTOR_UPDATE_ADDRESS = process.env.EXPO_PUBLIC_DOCTOR_UPDATE_ADDRESS as `0x${string}`;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

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

// Tints reference DARK at module load (visual hints only).
const RECORD_TYPES: RecordTypeOption[] = [
    { key: 'checkup', label: 'Khám tổng quát', icon: Stethoscope, tint: DARK.EHR_PRIMARY },
    { key: 'lab_result', label: 'Xét nghiệm', icon: TestTubeDiagonal, tint: DARK.EHR_TERTIARY },
    { key: 'prescription', label: 'Đơn thuốc', icon: Pill, tint: DARK.EHR_SECONDARY },
    { key: 'vital_signs', label: 'Chỉ số sinh tồn', icon: HeartPulse, tint: DARK.EHR_PRIMARY },
];

function splitLines(value: string): string[] {
    return value.split(/\r?\n|;/).map((s: string) => s.trim()).filter(Boolean);
}

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : '???');

export default function DoctorCreateUpdateScreen({ navigation, route }: any) {
    const palette = useEhrPalette();
    const { user } = useAuthStore();
    const queryClient = useQueryClient();
    const isMountedRef = useRef(true);
    useEffect(() => () => { isMountedRef.current = false; }, []);

    const { parentCidHash: routeParentCidHash, patientAddress: routePatientAddress } = route.params || {};
    const isCreateNewRoot = !routeParentCidHash;
    const [patientAddressInput, setPatientAddressInput] = useState<string>(routePatientAddress || '');
    const patientAddress = (routePatientAddress || patientAddressInput || '').trim().toLowerCase();
    const parentCidHash = routeParentCidHash || ZERO_BYTES32;

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
        () => RECORD_TYPES.find((t) => t.key === recordType) || RECORD_TYPES[0],
        [recordType],
    );

    const pickImage = async () => {
        try {
            setIsPickingImage(true);
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                Alert.alert('Thiếu quyền', 'Vui lòng cấp quyền thư viện ảnh.');
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
        if (!patientAddress || !/^0x[a-fA-F0-9]{40}$/.test(patientAddress)) {
            Alert.alert('Thiếu địa chỉ bệnh nhân', 'Hãy nhập địa chỉ ví hợp lệ của bệnh nhân (0x...).');
            return;
        }
        if (!title.trim()) {
            Alert.alert('Thiếu tiêu đề', 'Hãy nhập tiêu đề hồ sơ.');
            return;
        }
        if (!description.trim() && !diagnosisNote.trim() && icd10Codes.length === 0
            && !notes.trim() && !medication.trim() && !selectedImage) {
            Alert.alert('Thiếu nội dung', 'Hãy nhập nội dung hoặc đính kèm ảnh.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const precheck: any = await authService.getEncryptionKey(patientAddress).catch(() => null);
            if (!precheck?.encryptionPublicKey) {
                if (isMountedRef.current) setIsSubmitting(false);
                Alert.alert(
                    'Bệnh nhân chưa đăng ký khoá mã hoá',
                    'Bệnh nhân cần đăng nhập app ít nhất 1 lần để hệ thống tạo khoá mã hoá cho họ. ' +
                    'Hãy yêu cầu bệnh nhân đăng nhập, sau đó tạo lại hồ sơ.\n\n' +
                    'Nếu tạo trong tình trạng này, bệnh nhân sẽ KHÔNG thể giải mã được phiên bản này về sau.',
                );
                return;
            }
        } catch (precheckErr) {
            console.warn('Patient pubkey precheck failed:', precheckErr);
        }

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

            const aesKey = await generateAESKey();
            const encryptedContent = await encryptData(payload, aesKey);
            const { cid } = await ipfsService.uploadEncrypted({
                encryptedData: encryptedContent,
                metadata: { title: title.trim(), recordType },
            });

            const cidHash = keccak256(toBytes(cid));
            const recordTypeHash = keccak256(toBytes(recordType || 'checkup'));
            const doctorEncKeyHash = keccak256(toBytes(aesKey));

            const { walletClient, address: myAddress } = await walletActionService.getWalletContext();
            const { gateOrThrow } = await import('../../utils/biometricGate');
            await gateOrThrow('Để lưu hồ sơ y tế lên blockchain');

            const txHash = await walletClient.writeContract({
                address: DOCTOR_UPDATE_ADDRESS,
                abi: DOCTOR_UPDATE_ABI,
                functionName: 'addRecordByDoctor',
                args: [
                    cidHash,
                    parentCidHash as `0x${string}`,
                    recordTypeHash,
                    patientAddress as `0x${string}`,
                    doctorEncKeyHash,
                    0,
                ],
                gas: BigInt(600000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });

            const myKeypair = await getOrCreateEncryptionKeypair(walletClient, myAddress);
            const payloadJson = JSON.stringify({ cid, aesKey });
            const patientKeyRes: any = await authService.getEncryptionKey(patientAddress).catch(() => null);
            const patientPubKey = patientKeyRes?.encryptionPublicKey || null;
            if (!patientPubKey) {
                if (isMountedRef.current) setIsSubmitting(false);
                Alert.alert(
                    'Bệnh nhân chưa đăng ký khoá mã hoá',
                    'Bệnh nhân cần đăng nhập app ít nhất 1 lần để hệ thống tạo khoá mã hoá cho họ.',
                );
                return;
            }
            const patientEncryptedPayload = encryptForRecipient(payloadJson, patientPubKey, myKeypair.secretKey);
            const doctorEncryptedPayload = encryptForRecipient(payloadJson, myKeypair.publicKey, myKeypair.secretKey);

            await (recordService.saveOnly as any)({
                cidHash,
                recordTypeHash,
                ownerAddress: patientAddress,
                encryptedPayload: doctorEncryptedPayload,
                senderPublicKey: myKeypair.publicKey,
                title: title.trim(),
                description: description.trim() || null,
                recordType,
                parentCidHash,
                txHash,
                patientEncryptedPayload,
            });

            try {
                await localRecordStore.setKey(cidHash.toLowerCase(), {
                    cid, aesKey,
                    title: title.trim(),
                    recordType,
                    parentCidHash,
                    ownerAddress: patientAddress,
                    createdBy: myAddress,
                    createdAt: new Date().toISOString(),
                    syncStatus: 'confirmed',
                    txHash,
                });
            } catch (lrErr) {
                console.warn('Failed to save local record:', lrErr);
            }

            try {
                const recipients: any = isCreateNewRoot
                    ? []
                    : await keyShareService.getRecordRecipients(parentCidHash);
                if (Array.isArray(recipients)) {
                    for (const r of recipients) {
                        const addr = String(r.walletAddress || '').toLowerCase();
                        if (!addr || addr === myAddress.toLowerCase() || addr === patientAddress.toLowerCase()) continue;
                        if (!r.encryptionPublicKey) continue;
                        try {
                            const enc = encryptForRecipient(payloadJson, r.encryptionPublicKey, myKeypair.secretKey);
                            await keyShareService.shareKey({
                                cidHash,
                                recipientAddress: addr,
                                encryptedPayload: enc,
                                senderPublicKey: myKeypair.publicKey,
                            });
                        } catch (innerErr) {
                            console.warn('Propagate share failed for', addr, innerErr);
                        }
                    }
                }
            } catch (propErr) {
                console.warn('Auto-propagation failed:', propErr);
            }

            queryClient.invalidateQueries({ queryKey: ['doctor', 'sharedRecords'] });
            queryClient.invalidateQueries({ queryKey: ['records', 'my'] });
            queryClient.invalidateQueries({ queryKey: ['records', 'chain'] });

            if (!isMountedRef.current) return;

            Alert.alert(
                isCreateNewRoot ? 'Đã tạo hồ sơ' : 'Đã cập nhật hồ sơ',
                isCreateNewRoot
                    ? 'Hồ sơ mới đã được lưu lên blockchain. Bệnh nhân sẽ thấy ngay.'
                    : 'Phiên bản mới đã được lưu lên blockchain. Bệnh nhân và các bác sĩ có quyền sẽ thấy ngay.',
                [{
                    text: 'OK',
                    onPress: () => {
                        if (navigation.canGoBack?.()) navigation.goBack();
                    },
                }],
            );
        } catch (submitError: any) {
            const message = formatChainError(submitError, 'Không thể cập nhật hồ sơ');
            if (!isMountedRef.current) return;
            setError(message);
            Alert.alert('Lỗi', message);
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
                <View style={{ marginBottom: 14 }}>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 26,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.4,
                            lineHeight: 30,
                        }}
                    >
                        {isCreateNewRoot ? 'Ghi hồ sơ mới' : 'Cập nhật hồ sơ'}
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
                        {isCreateNewRoot
                            ? (patientAddress
                                ? `Ghi entry mới cho BN ${truncate(patientAddress)}`
                                : 'Ghi entry mới cho bệnh nhân — bệnh nhân xem ngay sau khi lưu')
                            : `Phiên bản mới cho BN ${truncate(patientAddress)} — cascade cho mọi người đang có quyền`}
                    </Text>
                </View>

                {/* Patient address (only when create-new-root without preset) */}
                {isCreateNewRoot && !routePatientAddress ? (
                    <ViCard padding={14} style={{ marginBottom: 14 }}>
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 11.5,
                                color: palette.EHR_OUTLINE,
                                marginBottom: 6,
                                letterSpacing: 0.4,
                                textTransform: 'uppercase',
                                fontWeight: '600',
                            }}
                        >
                            Địa chỉ ví bệnh nhân
                        </Text>
                        <TextInput
                            value={patientAddressInput}
                            onChangeText={setPatientAddressInput}
                            placeholder="0x..."
                            placeholderTextColor={palette.EHR_OUTLINE}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{
                                fontFamily: 'monospace',
                                fontSize: 13,
                                color: palette.EHR_ON_SURFACE,
                                backgroundColor: palette.EHR_SURFACE,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                borderWidth: 0.5,
                                borderRadius: 10,
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                            }}
                        />
                    </ViCard>
                ) : null}

                {/* Record type selector */}
                <ViSectionLabel>Loại hồ sơ</ViSectionLabel>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 16 }}>
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

                {/* Content card */}
                <View style={{ marginHorizontal: -20 }}>
                    <ViSectionLabel>Nội dung</ViSectionLabel>
                </View>
                <ViCard padding={16} style={{ marginBottom: 14 }}>
                    {renderInput('Tiêu đề', title, setTitle, { placeholder: 'Khám tim mạch định kỳ' })}
                    {renderInput('Mô tả ngắn', description, setDescription, { placeholder: 'Tóm tắt kết quả khám…', multiline: true })}

                    <YStack style={{ marginBottom: 12 }}>
                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 12, color: palette.EHR_OUTLINE, marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: '600' }}>
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

                    {renderInput('Ghi chú chẩn đoán', diagnosisNote, setDiagnosisNote, { placeholder: 'Mô tả thêm nếu không có trong ICD-10', multiline: true })}
                    {renderInput('Ghi chú thêm', notes, setNotes, { placeholder: 'Lịch tái khám, lưu ý lâm sàng…', multiline: true })}
                </ViCard>

                {/* Image attachment */}
                <View style={{ marginHorizontal: -20 }}>
                    <ViSectionLabel>Ảnh đính kèm (tuỳ chọn)</ViSectionLabel>
                </View>
                <ViCard padding={16} style={{ marginBottom: 14 }}>
                    {selectedImage ? (
                        <View style={{ marginBottom: 10 }}>
                            <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 0.5, borderColor: palette.EHR_OUTLINE_SOFT }}>
                                <Image
                                    source={{ uri: selectedImage.uri }}
                                    style={{ width: '100%', height: 200, backgroundColor: palette.EHR_SURFACE }}
                                    resizeMode="cover"
                                />
                            </View>
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
                </ViCard>

                {/* Vital signs */}
                <View style={{ marginHorizontal: -20 }}>
                    <ViSectionLabel trailing="TT 46/2018/TT-BYT">Dấu hiệu sinh tồn</ViSectionLabel>
                </View>
                <ViCard padding={16} style={{ marginBottom: 14 }}>
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
                        <View style={{ flex: 1 }}>{renderInput('Chiều cao (cm)', heightCm, setHeightCm, { placeholder: '165', keyboardType: 'numeric' })}</View>
                    </XStack>
                    <XStack style={{ alignItems: 'center', gap: 6, marginTop: -4 }}>
                        <Activity size={13} color={palette.EHR_OUTLINE} />
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE }}>
                            BMI được tính tự động.
                        </Text>
                    </XStack>
                </ViCard>

                {/* Prescription */}
                <View style={{ marginHorizontal: -20 }}>
                    <ViSectionLabel trailing="TT 04/2022/TT-BYT">Đơn thuốc</ViSectionLabel>
                </View>
                <ViCard padding={16} style={{ marginBottom: 14 }}>
                    {renderInput('Tên thuốc / hoạt chất', medication, setMedication, { placeholder: 'Paracetamol 500mg' })}
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>{renderInput('Hàm lượng / Liều', dosage, setDosage, { placeholder: '1 viên' })}</View>
                        <View style={{ flex: 1 }}>{renderInput('Đường dùng', route2, setRoute2, { placeholder: 'Uống / Tiêm' })}</View>
                    </XStack>
                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>{renderInput('Số lần / ngày', frequency, setFrequency, { placeholder: '2 lần/ngày' })}</View>
                        <View style={{ flex: 1 }}>{renderInput('Số ngày dùng', duration, setDuration, { placeholder: '5 ngày' })}</View>
                    </XStack>
                    {renderInput('Số lượng kê', quantity, setQuantity, { placeholder: '10 viên' })}
                    {renderInput('Lời dặn bác sĩ', instruction, setInstruction, { placeholder: 'Uống sau ăn, tránh rượu bia…', multiline: true })}
                </ViCard>

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
                        ? (isCreateNewRoot ? 'Đang lưu…' : 'Đang cập nhật…')
                        : (isCreateNewRoot ? 'Lưu hồ sơ on-chain' : 'Cập nhật hồ sơ on-chain')}
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
                    Hồ sơ được mã hoá đầu cuối + lưu IPFS + đăng ký on-chain. Cascade key cho mọi người đang có quyền.
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

