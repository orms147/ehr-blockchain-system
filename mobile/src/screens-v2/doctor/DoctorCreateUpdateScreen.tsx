// DoctorCreateUpdateScreen v3 — text-rhythm editorial form per
// viehp-doctor-forms-v2.html §3 + §4 + spec Q1/Q3 (RECORD_TYPES trimmed to 5,
// versionNote textarea on update mode).
//
// Two flows in one screen:
//   • Create new root (no parentCidHash): eyebrow "Bác sĩ ghi hồ sơ mới"
//   • Update version (parentCidHash set):  eyebrow "Bác sĩ cập nhật phiên bản"
//     + read-only parent headboard ("Đang sửa v?" badge + parent title/patient)
//     + versionNote textarea ("Lý do cập nhật") — persisted to RecordMetadata
//
// ALL business logic preserved bit-for-bit:
//   - S12.A precheck: patient must have registered NaCl pubkey BEFORE IPFS
//   - DoctorUpdate.addRecordByDoctor(cidHash, parent, type, patient, encKeyHash, 0)
//   - biometric gateOrThrow before writeContract
//   - getOrCreateEncryptionKeypair + NaCl seal {cid, aesKey} to patient + doctor
//   - recordService.saveOnly mirror to backend (now with versionNote)
//   - Cascade KeyShare to every existing recipient of parent chain (update mode)
//   - localRecordStore.setKey for instant local decrypt
//   - queryClient.invalidateQueries for both doctor + patient lists
//   - isMountedRef guard against late-arriving Alert callbacks

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Text, XStack, YStack } from 'tamagui';
import { keccak256, parseGwei, toBytes } from 'viem';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react-native';

import Icd10Picker from '../../components/Icd10Picker';
import PatientIdentityInline from '../../components/PatientIdentityInline';
import { useRecordMeta } from '../../components/RecordChip';
import type { Icd10Code } from '../../constants/icd10';
import { encryptData, generateAESKey } from '../../services/crypto';
import { encryptForRecipient, getOrCreateEncryptionKeypair } from '../../services/nacl-crypto';
import ipfsService from '../../services/ipfs.service';
import walletActionService from '../../services/walletAction.service';
import { gateOrThrow } from '../../utils/biometricGate';
import keyShareService from '../../services/keyShare.service';
import authService from '../../services/auth.service';
import recordService from '../../services/record.service';
import { DOCTOR_UPDATE_ABI } from '../../abi/contractABI';
import { formatChainError } from '../../utils/rpcRetry';
import { normalizeBase64 } from '../../utils/base64';
import localRecordStore from '../../services/localRecordStore';
import useAuthStore from '../../store/authStore';
import useDraft from '../../hooks/useDraft';
import { useEhrPalette } from '../../constants/uiColors';
import { RECORD_TYPES, resolveRecordType, type RecordTypeKey } from '../../constants/recordTypes';
import { VITAL_SPECS, flagVital, flagBp, abnormalNote, type VitalStatus } from '../../constants/vitals';
import {
    PageHeader,
    SectionLabel,
    StickyFooter,
    FormShell,
} from '../../components-v2/FormPrimitives';

const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

const DOCTOR_UPDATE_ADDRESS = process.env.EXPO_PUBLIC_DOCTOR_UPDATE_ADDRESS as `0x${string}`;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

type SelectedImage = {
    uri: string;
    base64: string;
    mimeType: string;
    fileName: string;
    width?: number;
    height?: number;
    fileSize?: number | null;
};

type DraftState = {
    title: string;
    description: string;
    recordType: RecordTypeKey;
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
    heightCm: string;
    notes: string;
    versionNote: string;
};

const INITIAL_DRAFT: DraftState = {
    title: '',
    description: '',
    recordType: 'general',
    icd10Codes: [],
    diagnosisNote: '',
    medication: '',
    dosage: '',
    frequency: '',
    route: '',
    quantity: '',
    duration: '',
    instruction: '',
    heartRate: '',
    systolic: '',
    diastolic: '',
    temperature: '',
    respRate: '',
    spo2: '',
    weight: '',
    heightCm: '',
    notes: '',
    versionNote: '',
};

function splitLines(value: string): string[] {
    return value.split(/\r?\n|;/).map((s) => s.trim()).filter(Boolean);
}

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 8)}…${addr.slice(-4)}` : '???');

function draftIsMeaningful(d: DraftState): boolean {
    return Boolean(
        d.title.trim() ||
        d.description.trim() ||
        d.diagnosisNote.trim() ||
        d.medication.trim() ||
        d.notes.trim() ||
        d.versionNote.trim() ||
        d.icd10Codes.length > 0 ||
        d.heartRate || d.systolic || d.diastolic || d.temperature ||
        d.spo2 || d.respRate || d.weight || d.heightCm,
    );
}

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

    // Parent record metadata (only fetched in update mode) — drives the
    // read-only headboard at the top of the form.
    const { data: parentMeta } = useRecordMeta(isCreateNewRoot ? null : routeParentCidHash);

    const draftScreenId = isCreateNewRoot ? 'doctorCreate' : 'doctorUpdate';
    const draftPatientKey = isCreateNewRoot
        ? (patientAddress || 'new')
        : `parent.${routeParentCidHash}`;
    const draftInitial = useMemo<DraftState>(
        () => ({
            ...INITIAL_DRAFT,
            // In update mode, pre-fill the title with the parent's title so the
            // doctor can edit/append rather than retype from scratch.
            title: parentMeta?.title || INITIAL_DRAFT.title,
            recordType: parentMeta?.recordType
                ? (resolveRecordType(parentMeta.recordType).key)
                : INITIAL_DRAFT.recordType,
        }),
        [parentMeta?.title, parentMeta?.recordType],
    );

    const {
        draft,
        update,
        clear,
        restorable,
        applyRestore,
        dismissRestore,
        saveStatus,
        savedAtMs,
    } = useDraft<DraftState>({
        screenId: draftScreenId,
        patientKey: draftPatientKey,
        initial: draftInitial,
        isMeaningful: draftIsMeaningful,
    });

    const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
        update((prev) => ({ ...prev, [key]: value }));

    const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
    const [icd10PickerOpen, setIcd10PickerOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPickingImage, setIsPickingImage] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedTypeSpec = useMemo(
        () => RECORD_TYPES.find((t) => t.key === draft.recordType) || RECORD_TYPES[0],
        [draft.recordType],
    );

    const saveStatusLabel = useMemo(() => {
        if (saveStatus === 'saving') return 'Tự lưu…';
        if (saveStatus === 'saved' && savedAtMs) {
            const d = new Date(savedAtMs);
            return `Tự lưu · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        if (saveStatus === 'error') return 'Tự lưu lỗi';
        return undefined;
    }, [saveStatus, savedAtMs]);

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
        if (!draft.title.trim()) {
            Alert.alert('Thiếu tiêu đề', 'Hãy nhập tiêu đề hồ sơ.');
            return;
        }
        if (!draft.description.trim() && !draft.diagnosisNote.trim() && draft.icd10Codes.length === 0
            && !draft.notes.trim() && !draft.medication.trim() && !selectedImage) {
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
            if (draft.heartRate) observations.heartRate = `${draft.heartRate} bpm`;
            if (draft.systolic && draft.diastolic) observations.bloodPressure = `${draft.systolic}/${draft.diastolic} mmHg`;
            else if (draft.systolic) observations.bloodPressureSystolic = `${draft.systolic} mmHg`;
            if (draft.temperature) observations.temperature = `${draft.temperature} °C`;
            if (draft.respRate) observations.respiratoryRate = `${draft.respRate} lần/phút`;
            if (draft.spo2) observations.spo2 = `${draft.spo2} %`;
            if (draft.weight) observations.weight = `${draft.weight} kg`;
            if (draft.heightCm) observations.height = `${draft.heightCm} cm`;
            if (draft.weight && draft.heightCm) {
                const h = parseFloat(draft.heightCm) / 100;
                const w = parseFloat(draft.weight);
                if (h > 0 && w > 0) observations.bmi = (w / (h * h)).toFixed(1);
            }

            const normalizedImage = selectedImage?.base64 ? normalizeBase64(selectedImage.base64) : null;

            const payload = {
                meta: {
                    title: draft.title.trim(),
                    type: selectedTypeSpec.label,
                    description: draft.description.trim(),
                    versionNote: draft.versionNote.trim() || undefined,
                    createdAt: new Date().toISOString(),
                    createdBy: user?.walletAddress,
                    role: 'doctor',
                },
                summary: draft.description.trim(),
                notes: draft.notes.trim(),
                observations: Object.keys(observations).length ? observations : undefined,
                diagnoses: [
                    ...draft.icd10Codes.map((c) => `[${c.code}] ${c.name}`),
                    ...splitLines(draft.diagnosisNote),
                ],
                prescriptions: draft.medication ? [{
                    medication: draft.medication.trim(),
                    dosage: draft.dosage.trim() || 'Theo chỉ định',
                    frequency: draft.frequency.trim() || 'Theo hướng dẫn',
                    route: draft.route.trim() || undefined,
                    quantity: draft.quantity.trim() || undefined,
                    duration: draft.duration.trim() || undefined,
                    instruction: draft.instruction.trim() || undefined,
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
                metadata: { title: draft.title.trim(), recordType: draft.recordType },
            });

            const cidHash = keccak256(toBytes(cid));
            const recordTypeHash = keccak256(toBytes(draft.recordType || 'general'));
            const doctorEncKeyHash = keccak256(toBytes(aesKey));

            const { walletClient, address: myAddress } = await walletActionService.getWalletContext();
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
                title: draft.title.trim(),
                description: draft.description.trim() || null,
                recordType: draft.recordType,
                versionNote: draft.versionNote.trim() || null,
                parentCidHash,
                txHash,
                patientEncryptedPayload,
            });

            try {
                await localRecordStore.setKey(cidHash.toLowerCase(), {
                    cid, aesKey,
                    title: draft.title.trim(),
                    recordType: draft.recordType,
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

            // Wipe draft on successful submit
            await clear();

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
        value: string,
        onChangeText: (text: string) => void,
        options: { multiline?: boolean; placeholder?: string; keyboardType?: KeyboardTypeOptions } = {},
    ) => (
        <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={options.placeholder || ''}
            placeholderTextColor={palette.EHR_TEXT_MUTED}
            keyboardType={options.keyboardType}
            multiline={options.multiline}
            textAlignVertical={options.multiline ? 'top' : 'center'}
            style={{
                minHeight: options.multiline ? 86 : 46,
                borderRadius: 10,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE_LOWEST,
                paddingHorizontal: 14,
                paddingVertical: options.multiline ? 12 : 0,
                color: palette.EHR_ON_SURFACE,
                fontFamily: SANS,
                fontSize: 14,
            }}
        />
    );

    const renderFieldLabel = (label: string) => (
        <Text
            style={{
                fontFamily: MONO,
                fontSize: 10.5,
                color: palette.EHR_TEXT_MUTED,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontWeight: '700',
                marginBottom: 6,
                marginTop: 12,
            }}
        >
            {label}
        </Text>
    );

    const footer = (
        <StickyFooter
            primary={isCreateNewRoot ? 'Ký và ghi hồ sơ' : 'Ký và lưu phiên bản'}
            hint={isCreateNewRoot
                ? 'Băm hồ sơ ghi trên chuỗi · bạn ký phí gas'
                : 'Phiên bản cũ giữ nguyên để truy lùi · bạn ký phí gas'}
            primaryLoading={isSubmitting}
            onPrimary={handleSubmit}
        />
    );

    const bp = flagBp(draft.systolic, draft.diastolic);

    return (
        <FormShell footer={footer} saveStatusLabel={saveStatusLabel}>
            <PageHeader
                eyebrow={isCreateNewRoot ? 'Bác sĩ ghi hồ sơ mới' : 'Bác sĩ cập nhật phiên bản'}
                title={isCreateNewRoot ? 'Hồ sơ điều trị mới' : 'Cập nhật phiên bản mới'}
                subtitle={isCreateNewRoot
                    ? 'Bản ghi này sẽ là phiên bản gốc của hồ sơ. Mọi cập nhật sau sẽ nối tiếp.'
                    : 'Phiên bản cũ được giữ nguyên để truy lùi. Bệnh nhân và các bác sĩ đang có quyền nhận khoá mới.'}
            />

            {/* PARENT RECORD HEADBOARD — update mode only */}
            {!isCreateNewRoot ? (
                <View
                    style={{
                        marginHorizontal: 22,
                        marginBottom: 16,
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        borderRadius: 12,
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_SOFT,
                    }}
                >
                    <XStack style={{ alignItems: 'flex-start', gap: 12 }}>
                        <View
                            style={{
                                width: 50,
                                paddingVertical: 6,
                                borderRadius: 6,
                                backgroundColor: palette.EHR_SURFACE,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE,
                                alignItems: 'center',
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: MONO,
                                    fontSize: 9,
                                    color: palette.EHR_TEXT_MUTED,
                                    letterSpacing: 0.8,
                                    fontWeight: '700',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Đang sửa
                            </Text>
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 16,
                                    fontWeight: '700',
                                    color: palette.EHR_ON_SURFACE,
                                }}
                            >
                                v↑
                            </Text>
                        </View>
                        <YStack style={{ flex: 1, minWidth: 0 }}>
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 14.5,
                                    fontWeight: '600',
                                    color: palette.EHR_ON_SURFACE,
                                    lineHeight: 19,
                                }}
                                numberOfLines={2}
                            >
                                {parentMeta?.title || 'Hồ sơ gốc'}
                            </Text>
                            <Text
                                style={{
                                    marginTop: 4,
                                    fontFamily: SANS,
                                    fontSize: 12,
                                    color: palette.EHR_ON_SURFACE_VARIANT,
                                }}
                            >
                                Bệnh nhân:{' '}
                                <Text style={{ color: palette.EHR_ON_SURFACE, fontWeight: '500' }}>
                                    {truncate(patientAddress)}
                                </Text>
                            </Text>
                            <Text
                                style={{
                                    marginTop: 7,
                                    fontFamily: MONO,
                                    fontSize: 11,
                                    color: palette.EHR_TEXT_MUTED,
                                    letterSpacing: 0.3,
                                }}
                            >
                                {String(routeParentCidHash).slice(0, 14)}…
                            </Text>
                        </YStack>
                    </XStack>
                </View>
            ) : null}

            {/* Restore draft banner */}
            {restorable ? (
                <View
                    style={{
                        marginHorizontal: 22,
                        marginBottom: 14,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 10,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_CLAY,
                        backgroundColor: `${palette.EHR_CLAY}14`,
                    }}
                >
                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 13, color: palette.EHR_ON_SURFACE, fontWeight: '700', marginBottom: 4 }}>
                        Có bản nháp đang lưu
                    </Text>
                    <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_ON_SURFACE_VARIANT, lineHeight: 17, marginBottom: 10 }}>
                        Phát hiện bản nháp chưa hoàn tất. Khôi phục để tiếp tục, hoặc bỏ qua để bắt đầu mới.
                    </Text>
                    <XStack style={{ gap: 8 }}>
                        <Pressable
                            onPress={applyRestore}
                            style={({ pressed }) => ({
                                paddingVertical: 8,
                                paddingHorizontal: 14,
                                borderRadius: 8,
                                backgroundColor: palette.EHR_ON_SURFACE,
                                opacity: pressed ? 0.85 : 1,
                            })}
                        >
                            <Text style={{ fontFamily: SANS_SEMI, fontSize: 12, color: palette.EHR_SURFACE, fontWeight: '700' }}>
                                Khôi phục
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={dismissRestore}
                            style={({ pressed }) => ({
                                paddingVertical: 8,
                                paddingHorizontal: 14,
                                borderRadius: 8,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE,
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text style={{ fontFamily: SANS_SEMI, fontSize: 12, color: palette.EHR_ON_SURFACE, fontWeight: '600' }}>
                                Bỏ qua
                            </Text>
                        </Pressable>
                    </XStack>
                </View>
            ) : null}

            {/* PATIENT — input only when create-new without preset; full detail
                inline when known. Doctor HAS access in create mode (they're the
                one creating the record), so detailLevel="full". */}
            <SectionLabel required>Bệnh nhân</SectionLabel>
            {isCreateNewRoot && !routePatientAddress ? (
                <View style={{ paddingHorizontal: 22, paddingBottom: 4 }}>
                    <View
                        style={{
                            minHeight: 52,
                            paddingHorizontal: 14,
                            borderRadius: 10,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            flexDirection: 'row',
                            alignItems: 'center',
                        }}
                    >
                        <TextInput
                            value={patientAddressInput}
                            onChangeText={setPatientAddressInput}
                            placeholder="0x… địa chỉ ví bệnh nhân"
                            placeholderTextColor={palette.EHR_TEXT_MUTED}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{
                                flex: 1,
                                paddingVertical: 12,
                                color: palette.EHR_ON_SURFACE,
                                fontFamily: MONO,
                                fontSize: 13.5,
                                letterSpacing: 0.2,
                                fontWeight: '500',
                            }}
                        />
                    </View>
                </View>
            ) : null}
            {/^0x[a-fA-F0-9]{40}$/.test(patientAddress) ? (
                <View style={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 14 }}>
                    <PatientIdentityInline
                        address={patientAddress}
                        detailLevel="full"
                    />
                </View>
            ) : (
                <View style={{ height: 8 }} />
            )}

            {/* TYPE — horizontal scroll chips */}
            <SectionLabel trailing={isCreateNewRoot ? undefined : 'Đã khoá theo bản gốc'}>
                Loại hồ sơ
            </SectionLabel>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 16, gap: 8 }}
            >
                {RECORD_TYPES.map((type) => {
                    const active = type.key === draft.recordType;
                    const Icon = type.icon;
                    const disabled = !isCreateNewRoot;
                    return (
                        <Pressable
                            key={type.key}
                            onPress={() => !disabled && set('recordType', type.key)}
                            disabled={disabled}
                            style={({ pressed }) => ({
                                paddingVertical: 9,
                                paddingHorizontal: 16,
                                borderRadius: 999,
                                borderWidth: 0.75,
                                borderColor: active ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE_SOFT,
                                backgroundColor: active ? palette.EHR_ON_SURFACE : palette.EHR_SURFACE_LOWEST,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                opacity: disabled && !active ? 0.5 : pressed ? 0.85 : 1,
                            })}
                        >
                            <Icon size={13} color={active ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE_VARIANT} />
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 12.5,
                                    fontWeight: '600',
                                    color: active ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE,
                                    letterSpacing: 0.1,
                                }}
                            >
                                {type.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            {/* TITLE + DESCRIPTION */}
            <SectionLabel
                required
                trailing={!isCreateNewRoot ? 'Phần thay đổi trong phiên bản mới' : undefined}
            >
                Tiêu đề và mô tả
            </SectionLabel>
            <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                {renderFieldLabel('Tiêu đề')}
                {renderInput(draft.title, (v) => set('title', v), { placeholder: 'Khám tim mạch định kỳ — đợt 1/2026' })}
                {renderFieldLabel('Mô tả lâm sàng')}
                {renderInput(draft.description, (v) => set('description', v), {
                    placeholder: 'Tóm tắt kết quả khám, dấu hiệu lâm sàng, chỉ định…',
                    multiline: true,
                })}
            </View>

            {/* DIAGNOSIS ICD-10 */}
            <SectionLabel badge="ICD-10" required={isCreateNewRoot}>
                Chẩn đoán
            </SectionLabel>
            <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                {draft.icd10Codes.length > 0 ? (
                    <YStack style={{ gap: 6, marginBottom: 8 }}>
                        {draft.icd10Codes.map((item) => (
                            <XStack
                                key={item.code}
                                style={{
                                    alignItems: 'center',
                                    gap: 10,
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                    borderRadius: 8,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                }}
                            >
                                <Text style={{ fontFamily: MONO, fontSize: 12, color: palette.EHR_ON_SURFACE, fontWeight: '700' }}>
                                    {item.code}
                                </Text>
                                <Text style={{ flex: 1, fontFamily: SANS, fontSize: 12.5, color: palette.EHR_ON_SURFACE_VARIANT }}>
                                    {item.name}
                                </Text>
                                <Pressable onPress={() => set('icd10Codes', draft.icd10Codes.filter((c) => c.code !== item.code))}>
                                    <X size={14} color={palette.EHR_TEXT_MUTED} />
                                </Pressable>
                            </XStack>
                        ))}
                    </YStack>
                ) : null}
                <Pressable onPress={() => setIcd10PickerOpen(true)}>
                    <View
                        style={{
                            paddingVertical: 10,
                            borderRadius: 10,
                            borderWidth: 0.75,
                            borderStyle: 'dashed',
                            borderColor: palette.EHR_OUTLINE,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                        }}
                    >
                        <Plus size={13} color={palette.EHR_ON_SURFACE} />
                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 12.5, color: palette.EHR_ON_SURFACE, fontWeight: '600' }}>
                            {draft.icd10Codes.length > 0 ? 'Thêm chẩn đoán' : 'Chọn mã ICD-10'}
                        </Text>
                    </View>
                </Pressable>

                {renderFieldLabel('Ghi chú chẩn đoán')}
                {renderInput(draft.diagnosisNote, (v) => set('diagnosisNote', v), {
                    placeholder: 'Mô tả thêm nếu không có trong ICD-10',
                    multiline: true,
                })}
            </View>

            {/* VITALS */}
            <SectionLabel badge="TT 46/2018/TT-BYT">Sinh tồn</SectionLabel>
            <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                {VITAL_SPECS.map((spec) => {
                    if (spec.id === 'bpSystolic') {
                        return (
                            <VitalRow
                                key="bp"
                                label="Huyết áp"
                                unit="mmHg"
                                refLabel="< 140/90"
                                status={bp}
                                note={bp === 'high' ? 'Cao hơn ngưỡng' : bp === 'low' ? 'Thấp hơn ngưỡng' : null}
                            >
                                <XStack style={{ gap: 8, alignItems: 'center' }}>
                                    <VitalInput
                                        value={draft.systolic}
                                        onChangeText={(v) => set('systolic', v)}
                                        placeholder="120"
                                        width={62}
                                    />
                                    <Text style={{ color: palette.EHR_TEXT_MUTED }}>/</Text>
                                    <VitalInput
                                        value={draft.diastolic}
                                        onChangeText={(v) => set('diastolic', v)}
                                        placeholder="80"
                                        width={62}
                                    />
                                </XStack>
                            </VitalRow>
                        );
                    }
                    if (spec.id === 'bpDiastolic') return null;
                    const fieldKey = spec.id === 'hr' ? 'heartRate'
                        : spec.id === 'temp' ? 'temperature'
                        : spec.id === 'rr' ? 'respRate'
                        : spec.id === 'weight' ? 'weight'
                        : spec.id;
                    const value = (draft as any)[fieldKey] || '';
                    const status: VitalStatus = flagVital(spec, value);
                    return (
                        <VitalRow
                            key={spec.id}
                            label={spec.label}
                            unit={spec.unit}
                            refLabel={spec.refLabel}
                            status={status}
                            note={abnormalNote(spec, status)}
                        >
                            <VitalInput
                                value={value}
                                onChangeText={(v) => set(fieldKey as any, v)}
                                placeholder={spec.placeholder || ''}
                                width={88}
                            />
                        </VitalRow>
                    );
                })}
                {renderFieldLabel('Chiều cao (cm)')}
                {renderInput(draft.heightCm, (v) => set('heightCm', v), { placeholder: '165', keyboardType: 'numeric' })}
                <Text style={{ marginTop: 8, fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                    BMI tính tự động từ cân nặng và chiều cao.
                </Text>
            </View>

            {/* PRESCRIPTION */}
            <SectionLabel badge="TT 04/2022/TT-BYT">Đơn thuốc</SectionLabel>
            <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                {renderFieldLabel('Tên thuốc / hoạt chất')}
                {renderInput(draft.medication, (v) => set('medication', v), { placeholder: 'Amlodipine 5mg' })}
                <XStack style={{ gap: 10 }}>
                    <View style={{ flex: 1 }}>
                        {renderFieldLabel('Hàm lượng / Liều')}
                        {renderInput(draft.dosage, (v) => set('dosage', v), { placeholder: '1 viên' })}
                    </View>
                    <View style={{ flex: 1 }}>
                        {renderFieldLabel('Đường dùng')}
                        {renderInput(draft.route, (v) => set('route', v), { placeholder: 'Uống / Tiêm' })}
                    </View>
                </XStack>
                <XStack style={{ gap: 10 }}>
                    <View style={{ flex: 1 }}>
                        {renderFieldLabel('Số lần / ngày')}
                        {renderInput(draft.frequency, (v) => set('frequency', v), { placeholder: '1 lần/ngày' })}
                    </View>
                    <View style={{ flex: 1 }}>
                        {renderFieldLabel('Số ngày dùng')}
                        {renderInput(draft.duration, (v) => set('duration', v), { placeholder: '30 ngày' })}
                    </View>
                </XStack>
                {renderFieldLabel('Số lượng kê')}
                {renderInput(draft.quantity, (v) => set('quantity', v), { placeholder: '30 viên' })}
                {renderFieldLabel('Lời dặn bác sĩ')}
                {renderInput(draft.instruction, (v) => set('instruction', v), {
                    placeholder: 'Uống sau ăn, theo dõi HA buổi sáng…',
                    multiline: true,
                })}
            </View>

            {/* IMAGE */}
            <SectionLabel trailing="Mã hoá cùng nội dung">Ảnh đính kèm</SectionLabel>
            <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                {selectedImage ? (
                    <View style={{ marginBottom: 10 }}>
                        <View style={{ borderRadius: 10, overflow: 'hidden', borderWidth: 0.5, borderColor: palette.EHR_OUTLINE_SOFT }}>
                            <Image
                                source={{ uri: selectedImage.uri }}
                                style={{ width: '100%', height: 200, backgroundColor: palette.EHR_SURFACE }}
                                resizeMode="cover"
                            />
                        </View>
                        <Text style={{ marginTop: 6, fontFamily: MONO, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                            {selectedImage.fileName}
                        </Text>
                    </View>
                ) : null}
                <XStack style={{ gap: 8 }}>
                    <Pressable
                        onPress={pickImage}
                        disabled={isPickingImage}
                        style={({ pressed }) => ({
                            flex: 1,
                            paddingVertical: 11,
                            borderRadius: 10,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <ImagePlus size={14} color={palette.EHR_ON_SURFACE} />
                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 12.5, color: palette.EHR_ON_SURFACE, fontWeight: '600' }}>
                            {selectedImage ? 'Chọn ảnh khác' : (isPickingImage ? 'Đang mở…' : 'Chọn ảnh')}
                        </Text>
                    </Pressable>
                    {selectedImage ? (
                        <Pressable
                            onPress={() => setSelectedImage(null)}
                            style={({ pressed }) => ({
                                paddingVertical: 11,
                                paddingHorizontal: 14,
                                borderRadius: 10,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_CINNABAR_DEEP,
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Trash2 size={14} color={palette.EHR_CINNABAR_DEEP} />
                            <Text style={{ fontFamily: SANS_SEMI, fontSize: 12.5, color: palette.EHR_CINNABAR_DEEP, fontWeight: '600' }}>
                                Xoá
                            </Text>
                        </Pressable>
                    ) : null}
                </XStack>
            </View>

            {/* NOTES + VERSION NOTE (update mode only) */}
            <SectionLabel trailing="Tuỳ chọn">Ghi chú lâm sàng</SectionLabel>
            <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                {renderInput(draft.notes, (v) => set('notes', v), {
                    placeholder: 'Lịch tái khám, lưu ý lâm sàng, dặn dò bệnh nhân…',
                    multiline: true,
                })}
            </View>

            {!isCreateNewRoot ? (
                <>
                    <SectionLabel trailing="Lý do tạo phiên bản mới">Ghi chú cập nhật</SectionLabel>
                    <View style={{ paddingHorizontal: 22, paddingBottom: 22 }}>
                        <TextInput
                            value={draft.versionNote}
                            onChangeText={(v) => set('versionNote', v.slice(0, 500))}
                            placeholder="VD: Giảm liều Amlodipine từ 5mg → 2.5mg do BN đáp ứng tốt sau 3 tháng…"
                            placeholderTextColor={palette.EHR_TEXT_MUTED}
                            multiline
                            textAlignVertical="top"
                            style={{
                                minHeight: 86,
                                borderRadius: 10,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                backgroundColor: palette.EHR_SURFACE_LOWEST,
                                paddingHorizontal: 14,
                                paddingVertical: 12,
                                color: palette.EHR_ON_SURFACE,
                                fontFamily: SANS,
                                fontSize: 14,
                            }}
                        />
                        <Text
                            style={{
                                marginTop: 6,
                                fontFamily: MONO,
                                fontSize: 10.5,
                                color: palette.EHR_TEXT_MUTED,
                                textAlign: 'right',
                                letterSpacing: 0.4,
                            }}
                        >
                            {draft.versionNote.length} / 500
                        </Text>
                    </View>
                </>
            ) : null}

            {error ? (
                <View
                    style={{
                        marginHorizontal: 22,
                        marginBottom: 14,
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: `${palette.EHR_DANGER}14`,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_DANGER,
                    }}
                >
                    <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_DANGER, lineHeight: 18 }}>
                        {error}
                    </Text>
                </View>
            ) : null}

            <Icd10Picker
                visible={icd10PickerOpen}
                onClose={() => setIcd10PickerOpen(false)}
                onSelect={(item) => {
                    if (draft.icd10Codes.some((c) => c.code === item.code)) return;
                    set('icd10Codes', [...draft.icd10Codes, item]);
                }}
                selectedCodes={draft.icd10Codes.map((c) => c.code)}
            />
        </FormShell>
    );
}

// Shared VitalRow / VitalInput — same shape as in CreateRecordScreen but
// locally redefined to avoid a one-off shared util module. If a 3rd consumer
// appears, extract to components-v2/VitalRow.tsx.
function VitalRow({
    label,
    unit,
    refLabel,
    status,
    note,
    children,
}: {
    label: string;
    unit: string;
    refLabel: string;
    status: VitalStatus;
    note?: string | null;
    children: React.ReactNode;
}) {
    const palette = useEhrPalette();
    const statusColor =
        status === 'high' ? palette.EHR_CINNABAR_DEEP
        : status === 'low' ? palette.EHR_SECONDARY
        : palette.EHR_TEXT_MUTED;
    return (
        <View
            style={{
                paddingVertical: 12,
                borderBottomWidth: 0.5,
                borderBottomColor: palette.EHR_OUTLINE_SOFT,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
            }}
        >
            <YStack style={{ flex: 1 }}>
                <Text style={{ fontFamily: SANS_SEMI, fontSize: 13.5, color: palette.EHR_ON_SURFACE, fontWeight: '600' }}>
                    {label}
                </Text>
                <Text style={{ fontFamily: MONO, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, marginTop: 2, letterSpacing: 0.3 }}>
                    {refLabel} {unit}
                </Text>
                {note ? (
                    <Text style={{ fontFamily: SANS, fontSize: 11, color: statusColor, marginTop: 2 }}>
                        {note}
                    </Text>
                ) : null}
            </YStack>
            <XStack style={{ alignItems: 'center', gap: 4 }}>
                {children}
                <Text style={{ fontFamily: SANS, fontSize: 11.5, color: palette.EHR_TEXT_MUTED, marginLeft: 4, minWidth: 50 }}>
                    {unit}
                </Text>
            </XStack>
        </View>
    );
}

function VitalInput({
    value,
    onChangeText,
    placeholder,
    width = 80,
}: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    width?: number;
}) {
    const palette = useEhrPalette();
    return (
        <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={palette.EHR_TEXT_MUTED}
            keyboardType="decimal-pad"
            style={{
                width,
                minHeight: 40,
                borderRadius: 8,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE_LOWEST,
                paddingHorizontal: 10,
                color: palette.EHR_ON_SURFACE,
                fontFamily: MONO,
                fontSize: 14,
                textAlign: 'center',
            }}
        />
    );
}
