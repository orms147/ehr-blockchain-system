// CreateRecordScreen v3 — text-rhythm editorial form per
// viehp-doctor-forms-v2.html §2 + spec Q1 (RECORD_TYPES trimmed to 5).
//
// Patient self-declares a record. Two modes:
//   - Nhanh: title + image + free-text note
//   - Đầy đủ: full medical form (ICD-10 + vitals from VITAL_SPECS + Rx per TT 04/2022)
//
// Layout:
//   PageHeader eyebrow="Bệnh nhân tự khai" title="Ghi lại đợt khám của bạn"
//   Optional restore-draft banner (useDraft hook)
//   Mode switch (Nhanh / Đầy đủ)
//   SectionLabel "Loại hồ sơ" — horizontal scroll chips (canonical 5 types)
//   SectionLabel "Thông tin" — title + description fields
//   [Đầy đủ only] ICD-10 picker rows
//   SectionLabel "Ảnh đính kèm"
//   [Đầy đủ only] SectionLabel "Dấu hiệu sinh tồn" — VITAL_SPECS rows with flagVital()
//   [Đầy đủ only] SectionLabel "Đơn thuốc" — Rx fields
//   StickyFooter "Lưu hồ sơ" hint="Mã hoá end-to-end · IPFS · băm trên chuỗi"
//
// ALL business logic preserved from previous version — only UI restyled.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Text, XStack, YStack } from 'tamagui';
import { keccak256, toBytes } from 'viem';
import { ImagePlus, Plus, Stethoscope, Trash2, X } from 'lucide-react-native';

import Icd10Picker from '../components/Icd10Picker';
import type { Icd10Code } from '../constants/icd10';
import { encryptData, generateAESKey } from '../services/crypto';
import ipfsService from '../services/ipfs.service';
import recordService from '../services/record.service';
import keyShareService from '../services/keyShare.service';
import { RECORD_REGISTRY_ABI } from '../abi/contractABI';
import { withSelfPayFallback } from '../utils/selfPayFallback';
import walletActionService from '../services/walletAction.service';
import { gateOrThrow } from '../utils/biometricGate';
import { getOrCreateEncryptionKeypair, encryptForRecipient } from '../services/nacl-crypto';
import { normalizeBase64 } from '../utils/base64';
import { friendlyPickerError } from '../utils/friendlyError';
import localRecordStore from '../services/localRecordStore';
import { autoPreShareNewRecord } from '../services/trustedContact.service';
import useAuthStore from '../store/authStore';
import useDraft from '../hooks/useDraft';
import { useEhrPalette } from '../constants/uiColors';
import { RECORD_TYPES, resolveRecordType, type RecordTypeKey } from '../constants/recordTypes';
import { VITAL_SPECS, flagVital, flagBp, abnormalNote, computeBmi, type VitalStatus } from '../constants/vitals';
import {
    type Drug,
    emptyDrug,
    validateDrug,
    drugSummary,
} from '../constants/drugs';
import {
    type Vaccination,
    emptyShot,
    validateShot,
} from '../constants/vaccines';
import RxCard from '../components-v2/RxCard';
import VaccCard from '../components-v2/VaccCard';
import {
    PageHeader,
    SectionLabel,
    StickyFooter,
    FormShell,
} from '../components-v2/FormPrimitives';

const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

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
    // C1 plan §15 (TT 26/2025) — đơn thuốc multi-drug. Drug[] thay vì 7
    // trường flat. Backward compat: nếu draft cũ có medication string, migrate
    // sang 1 Drug đầu list ở loader (xem useDraft initializer).
    drugs: Drug[];
    // C2 plan §15 (TT 13/2026) — vaccinations multi-shot, hiện khi recordType='vacc'.
    vaccinations: Vaccination[];
    heartRate: string;
    systolic: string;
    diastolic: string;
    temperature: string;
    respRate: string;
    spo2: string;
    weight: string;
    height: string;
    notes: string;
    simpleMode: boolean;
};

type BuildPayloadInput = DraftState & {
    recordTypeLabel: string;
    attachment?: SelectedImage | null;
};

const INITIAL_DRAFT: DraftState = {
    title: '',
    description: '',
    recordType: 'general',
    icd10Codes: [],
    diagnosisNote: '',
    drugs: [],
    vaccinations: [],
    heartRate: '',
    systolic: '',
    diastolic: '',
    temperature: '',
    respRate: '',
    spo2: '',
    weight: '',
    height: '',
    notes: '',
    simpleMode: true,
};

function toSerializableRecord(record: Record<string, any>) {
    const createdAtIso = record?.createdAt
        ? new Date(record.createdAt).toISOString()
        : new Date().toISOString();
    return { ...record, createdAt: createdAtIso };
}

function buildCreateRecordErrorMessage(submitError: any): string {
    const code = submitError?.code || submitError?.data?.code;
    if (code === 'QUOTA_EXHAUSTED') return 'Đã hết lượt lưu miễn phí trong tháng. Vui lòng thử lại sau.';
    if (code === 'PATIENT_NOT_REGISTERED') return 'Tài khoản chưa được đăng ký. Vui lòng đăng nhập lại rồi tạo hồ sơ lại.';
    if (code === 'SPONSOR_NOT_AUTHORIZED' || code === 'RELAYER_NOT_AUTHORIZED') return 'Hệ thống chưa được cấp quyền. Vui lòng liên hệ quản trị viên.';
    if (code === 'RELAYER_NOT_CONFIGURED') return 'Hệ thống chưa sẵn sàng. Vui lòng liên hệ quản trị viên.';
    if (code === 'RECORD_EXISTS') return 'Hồ sơ này đã tồn tại trong hệ thống. Vui lòng làm mới danh sách hồ sơ.';
    if (code === 'CID_RESERVED') return 'Mã hồ sơ này đang được dùng bởi một lượt khác. Vui lòng tạo lại hồ sơ mới.';
    if (code === 'MAX_CHILDREN_REACHED') return 'Bản ghi gốc đã đạt giới hạn số phiên bản. Hãy tạo hồ sơ gốc mới.';
    if (submitError?.status === 429) return 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.';
    return submitError?.message || 'Không thể tạo hồ sơ mới';
}

function splitLines(value: string): string[] {
    return value.split(/\r?\n|;/).map((item) => item.trim()).filter(Boolean);
}

function cleanNumber(value: string): string {
    return value.trim();
}

function buildPayload(input: BuildPayloadInput) {
    const {
        title, description, recordTypeLabel, icd10Codes, diagnosisNote, drugs, vaccinations,
        heartRate, systolic, diastolic, temperature, respRate, spo2, weight, height,
        notes, attachment,
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
    // Multi-drug per TT 26/2025 §17 — array of Drug, mỗi item đầy đủ 9 trường
    // hoặc tối thiểu medication+strength+dose+freq+duration+route. Filter ra
    // drug rỗng (medication trống) để không persist garbage.
    const prescriptions = (drugs || [])
        .filter((d) => (d.medication || '').trim())
        .map((d) => ({
            medication: d.medication.trim(),
            brandName: d.brandName?.trim() || undefined,
            strength: d.strength.trim(),
            quantity: d.quantity.trim(),
            quantityUnit: d.quantityUnit,
            dosage: `${d.doseAmount.trim()} ${d.doseUnit}`,
            frequency: `${d.timesPerDay.trim()} lần/ngày`,
            durationDays: d.durationDays.trim(),
            route: d.route,
            timing: d.timing || undefined,
            instruction: d.instruction?.trim() || undefined,
        }));
    const normalizedImage = attachment?.base64 ? normalizeBase64(attachment.base64) : null;
    // C2 plan §15 — vaccinations payload (TT 13/2026). Filter shot rỗng.
    const vaccinationsOut = (vaccinations || [])
        .filter((s) => (s.vaccineName || '').trim())
        .map((s) => ({
            vaccineName: s.vaccineName.trim(),
            antigens: s.antigens || undefined,
            lotNumber: s.lotNumber.trim(),
            expirationDate: s.expirationDate,
            administeredAt: s.administeredAt,
            site: s.site,
            doseNumber: s.doseNumber || undefined,
            administrator: s.administrator || undefined,
            facility: s.facility || undefined,
            adverseReaction: s.adverseReaction?.trim() || undefined,
        }));

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
        vaccinations: vaccinationsOut.length ? vaccinationsOut : undefined,
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

function draftIsMeaningful(d: DraftState): boolean {
    return Boolean(
        d.title.trim() ||
        d.description.trim() ||
        d.diagnosisNote.trim() ||
        (d.drugs?.some?.((dr) => (dr.medication || '').trim())) ||
        (d.vaccinations?.some?.((v) => (v.vaccineName || '').trim())) ||
        d.notes.trim() ||
        d.icd10Codes.length > 0 ||
        d.heartRate ||
        d.systolic ||
        d.diastolic ||
        d.temperature ||
        d.spo2 ||
        d.respRate ||
        d.weight ||
        d.height,
    );
}

export default function CreateRecordScreen({ navigation, route: navRoute }: any) {
    const palette = useEhrPalette();
    const { user } = useAuthStore();
    const recordApi: any = recordService;
    const RECORD_REGISTRY_ADDRESS = process.env.EXPO_PUBLIC_RECORD_REGISTRY_ADDRESS as `0x${string}`;
    const ZERO_HASH = ('0x' + '0'.repeat(64)) as `0x${string}`;
    const isMountedRef = useRef(true);
    useEffect(() => () => { isMountedRef.current = false; }, []);

    const parentCidHash: string | null = navRoute?.params?.parentCidHash || null;
    const initialTitle: string = navRoute?.params?.initialTitle || '';
    const initialRecordTypeRaw: string | null = navRoute?.params?.initialRecordType || null;
    const initialRecordType = initialRecordTypeRaw
        ? resolveRecordType(initialRecordTypeRaw).key
        : 'general';
    const isUpdateMode = Boolean(parentCidHash);

    const draftScreenId = isUpdateMode ? 'createRecord.update' : 'createRecord.new';
    const draftPatientKey = parentCidHash ? `parent.${parentCidHash}` : 'new';
    const draftInitial = useMemo<DraftState>(
        () => ({ ...INITIAL_DRAFT, title: initialTitle, recordType: initialRecordType }),
        [initialTitle, initialRecordType],
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
            const msg = friendlyPickerError(pickError, 'Không thể mở thư viện ảnh.');
            if (msg) Alert.alert('Lỗi chọn ảnh', msg);
        } finally {
            setIsPickingImage(false);
        }
    };

    const handleSubmit = async () => {
        if (!draft.title.trim()) {
            Alert.alert('Thiếu tiêu đề', 'Hãy nhập tiêu đề hồ sơ trước khi tạo.');
            return;
        }
        if (draft.simpleMode) {
            if (!selectedImage && !draft.description.trim()) {
                Alert.alert('Thiếu nội dung', 'Hãy chụp/chọn ảnh hoặc viết ghi chú cho hồ sơ.');
                return;
            }
        } else if (!draft.description.trim() && !draft.diagnosisNote.trim() && draft.icd10Codes.length === 0
            && !draft.notes.trim()
            && !(draft.drugs?.some?.((d) => (d.medication || '').trim()))
            && !selectedImage) {
            Alert.alert('Thiếu nội dung', 'Hãy nhập nội dung hoặc đính kèm ít nhất một ảnh cho hồ sơ.');
            return;
        }
        // Validate drugs (TT 26/2025 §17). Drug có medication trống = skip
        // (filter ra ở buildPayload). Drug có medication thì validate đủ 5
        // required + max 30 ngày.
        const drugErrors = (draft.drugs || [])
            .filter((d) => (d.medication || '').trim())
            .flatMap(validateDrug);
        if (drugErrors.length > 0) {
            Alert.alert(
                'Đơn thuốc chưa đầy đủ',
                `Còn ${drugErrors.length} lỗi cần sửa trong đơn thuốc. Bấm "Đơn thuốc" trên section để xem.`,
            );
            return;
        }
        // Validate vaccinations (TT 13/2026) — hard errors block submit
        const vaccErrors = (draft.vaccinations || [])
            .filter((v) => (v.vaccineName || '').trim())
            .flatMap(validateShot)
            .filter((e) => e.severity === 'hard');
        if (vaccErrors.length > 0) {
            Alert.alert(
                'Tiêm chủng chưa đầy đủ',
                `Còn ${vaccErrors.length} lỗi cần sửa trong mục tiêm chủng.`,
            );
            return;
        }

        setIsSubmitting(true);
        setError(null);

        let cidHashForRecovery: string | null = null;
        let localDraft: any = null;

        try {
            const payload = buildPayload({
                ...draft,
                recordTypeLabel: selectedTypeSpec.label,
                heartRate: cleanNumber(draft.heartRate),
                systolic: cleanNumber(draft.systolic),
                diastolic: cleanNumber(draft.diastolic),
                temperature: cleanNumber(draft.temperature),
                respRate: cleanNumber(draft.respRate),
                spo2: cleanNumber(draft.spo2),
                weight: cleanNumber(draft.weight),
                height: cleanNumber(draft.height),
                attachment: selectedImage,
            });

            // Sinh trắc trước khi tạo hồ sơ — đồng nhất với luồng bác sĩ + TT 13/2025 Đ3
            // (xác nhận chủ ý bằng sinh trắc). Máy không có/chưa đăng ký vân tay (vd emulator)
            // sẽ tự bỏ qua (graceful degrade trong requireBiometric).
            await gateOrThrow('Xác thực để tạo hồ sơ y tế mới');
            const aesKey = await generateAESKey();
            const encryptedData = await encryptData(payload, aesKey);
            const { cid } = await ipfsService.uploadEncrypted({
                encryptedData,
                metadata: { title: draft.title.trim(), recordType: draft.recordType },
            });

            const cidHash = keccak256(toBytes(cid));
            const recordTypeHash = keccak256(toBytes(draft.recordType));
            const nowIso = new Date().toISOString();

            cidHashForRecovery = cidHash;
            localDraft = {
                cid, aesKey,
                title: draft.title.trim(),
                recordType: draft.recordType, recordTypeHash,
                parentCidHash,
                description: draft.description.trim(),
                createdAt: nowIso,
                createdBy: user?.walletAddress || null,
                ownerAddress: user?.walletAddress || null,
                createdByDisplay: 'Bạn',
                syncStatus: 'pending',
                syncError: null,
                hasImage: Boolean(selectedImage),
            };
            await localRecordStore.setKey(cidHash, localDraft);

            // Upload via relayer (sponsored) — or, if the 100 free signatures are
            // used up, self-pay: the patient submits RecordRegistry.addRecord
            // directly, then mirrors the metadata via save-only (no relayer), the
            // same pattern the doctor self-pay flow uses.
            const uploadFb = await withSelfPayFallback(
                () => recordApi.createRecord(
                    cidHash, recordTypeHash, parentCidHash,
                    draft.title.trim(), draft.description.trim() || null, draft.recordType,
                ),
                {
                    address: RECORD_REGISTRY_ADDRESS,
                    abi: RECORD_REGISTRY_ABI,
                    functionName: 'addRecord',
                    args: [cidHash, parentCidHash || ZERO_HASH, recordTypeHash],
                },
            );
            const created = uploadFb.selfPaid
                ? await recordApi.saveOnly({
                      cidHash,
                      recordTypeHash,
                      ownerAddress: user?.walletAddress,
                      title: draft.title.trim(),
                      description: draft.description.trim() || null,
                      recordType: draft.recordType,
                      parentCidHash: parentCidHash || null,
                      txHash: uploadFb.txHash,
                  })
                : uploadFb.relayerResult;

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
                title: draft.title.trim(),
                type: draft.recordType,
                description: draft.description.trim() || null,
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

            // Wipe draft on successful submit
            await clear();

            if (!isMountedRef.current) return;

            Alert.alert(
                isUpdateMode ? 'Cập nhật hồ sơ thành công' : 'Tạo hồ sơ thành công',
                isUpdateMode
                    ? 'Phiên bản mới đã được mã hoá, lưu trữ an toàn và liên kết với hồ sơ gốc.'
                    : 'Hồ sơ mới đã được mã hoá và đăng ký lên hệ thống.',
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
                    title: draft.title.trim(),
                    type: draft.recordType,
                    description: draft.description.trim() || null,
                    date: new Date().toLocaleDateString('vi-VN'),
                    createdAt: new Date().toISOString(),
                    createdBy: user?.walletAddress,
                    createdByDisplay: 'Bạn',
                    ownerAddress: user?.walletAddress,
                };
                Alert.alert(
                    'Lưu tạm thời thất bại',
                    `${message}\n\nDữ liệu đã được lưu trên máy, bạn có thể mở chi tiết để xem/giải mã và thử lại sau.`,
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
            primary={isUpdateMode ? 'Cập nhật hồ sơ' : 'Lưu hồ sơ'}
            hint="Mã hoá đầu-cuối · Lưu trữ an toàn"
            primaryLoading={isSubmitting}
            onPrimary={handleSubmit}
        />
    );

    const bp = flagBp(draft.systolic, draft.diastolic);

    return (
        <FormShell footer={footer} saveStatusLabel={saveStatusLabel}>
            <PageHeader
                eyebrow={isUpdateMode ? 'Bệnh nhân tự cập nhật' : 'Bệnh nhân tự khai'}
                title={isUpdateMode ? 'Cập nhật phiên bản mới' : 'Ghi lại đợt khám của bạn'}
                subtitle={isUpdateMode
                    ? 'Phiên bản mới liên kết hồ sơ gốc — bên đã chia sẻ vẫn truy cập được.'
                    : 'Hồ sơ này có thể chia sẻ cho bác sĩ về sau. Không thay thế chẩn đoán y tế chính thức.'}
            />

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
                        Phát hiện hồ sơ tự lưu chưa hoàn tất. Khôi phục để tiếp tục, hoặc bỏ qua để bắt đầu mới.
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

            {/* Tự-khai banner — only on create, not update */}
            {!isUpdateMode ? (
                <View
                    style={{
                        marginHorizontal: 22,
                        marginBottom: 14,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 10,
                        backgroundColor: `${palette.EHR_CLAY}1A`,
                        borderWidth: 0.5,
                        borderColor: `${palette.EHR_CLAY}50`,
                        flexDirection: 'row',
                        gap: 10,
                    }}
                >
                    <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: palette.EHR_CLAY, borderRadius: 2 }} />
                    <Text style={{ flex: 1, fontFamily: SANS, fontSize: 12, color: palette.EHR_ON_SURFACE, lineHeight: 18 }}>
                        Đây là{' '}
                        <Text style={{ fontFamily: SANS_SEMI, color: palette.EHR_CLAY, fontWeight: '700' }}>hồ sơ tự khai</Text>
                        . Khác với hồ sơ do bác sĩ tạo, nội dung này chưa được xác minh bởi tổ chức y tế.
                    </Text>
                </View>
            ) : null}

            {/* Mode switch */}
            <View style={{ paddingHorizontal: 22, marginBottom: 18 }}>
                <XStack style={{ gap: 8 }}>
                    {([
                        { id: true, label: 'Nhanh', sub: 'Tiêu đề + ảnh' },
                        { id: false, label: 'Đầy đủ', sub: 'Vitals · Rx · ICD-10' },
                    ] as const).map((m) => {
                        const active = draft.simpleMode === m.id;
                        return (
                            <Pressable
                                key={String(m.id)}
                                onPress={() => set('simpleMode', m.id)}
                                style={({ pressed }) => ({
                                    flex: 1,
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    borderRadius: 10,
                                    borderWidth: active ? 1.25 : 0.5,
                                    borderColor: active ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE_SOFT,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    opacity: pressed ? 0.85 : 1,
                                })}
                            >
                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 14, color: palette.EHR_ON_SURFACE, fontWeight: '700' }}>
                                    {m.label}
                                </Text>
                                <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, marginTop: 2 }}>
                                    {m.sub}
                                </Text>
                            </Pressable>
                        );
                    })}
                </XStack>
            </View>

            {/* TYPE — horizontal scroll chips (canonical 5) */}
            <SectionLabel>Loại hồ sơ</SectionLabel>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 16, gap: 8 }}
            >
                {RECORD_TYPES.map((type) => {
                    const active = type.key === draft.recordType;
                    const Icon = type.icon;
                    return (
                        <Pressable
                            key={type.key}
                            onPress={() => set('recordType', type.key)}
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
                                opacity: pressed ? 0.85 : 1,
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

            {/* CONTENT */}
            <SectionLabel required>Thông tin</SectionLabel>
            <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                {renderFieldLabel('Tiêu đề')}
                {renderInput(draft.title, (v) => set('title', v), {
                    placeholder: draft.simpleMode
                        ? 'Ví dụ: Ảnh đơn thuốc tháng 3'
                        : 'Ví dụ: Khám tổng quát tháng 3/2026',
                })}
                {renderFieldLabel(draft.simpleMode ? 'Ghi chú' : 'Mô tả ngắn')}
                {renderInput(draft.description, (v) => set('description', v), {
                    placeholder: draft.simpleMode
                        ? 'Ghi chú thêm về ảnh/giấy tờ này (tuỳ chọn)'
                        : 'Tóm tắt nhanh kết quả hoặc mục đích buổi khám',
                    multiline: true,
                })}

                {!draft.simpleMode ? (
                    <>
                        {renderFieldLabel('Chẩn đoán (ICD-10)')}
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
                                    {draft.icd10Codes.length > 0 ? 'Thêm mã ICD-10 khác' : 'Chọn mã ICD-10'}
                                </Text>
                            </View>
                        </Pressable>

                        {renderFieldLabel('Ghi chú chẩn đoán')}
                        {renderInput(draft.diagnosisNote, (v) => set('diagnosisNote', v), {
                            placeholder: 'Mô tả thêm nếu không có trong ICD-10',
                            multiline: true,
                        })}

                        {renderFieldLabel('Ghi chú thêm')}
                        {renderInput(draft.notes, (v) => set('notes', v), {
                            placeholder: 'Chi tiết bổ sung, lịch tái khám…',
                            multiline: true,
                        })}
                    </>
                ) : null}
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

            {/* VITALS (detail mode only) */}
            {!draft.simpleMode ? (
                <>
                    <SectionLabel trailing="Theo TT 46/2018/TT-BYT">Dấu hiệu sinh tồn</SectionLabel>
                    <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                        {VITAL_SPECS.map((spec) => {
                            // BP combo: render systolic + diastolic in a single row
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
                            if (spec.id === 'bpDiastolic') return null; // rendered above
                            const status: VitalStatus = flagVital(spec, (draft as any)[spec.id === 'hr' ? 'heartRate' : spec.id === 'temp' ? 'temperature' : spec.id === 'rr' ? 'respRate' : spec.id]);
                            const fieldKey = spec.id === 'hr' ? 'heartRate'
                                : spec.id === 'temp' ? 'temperature'
                                : spec.id === 'rr' ? 'respRate'
                                : spec.id;
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
                                        value={(draft as any)[fieldKey]}
                                        onChangeText={(v) => set(fieldKey as any, v)}
                                        placeholder={spec.placeholder || ''}
                                        width={88}
                                    />
                                </VitalRow>
                            );
                        })}
                        {/* BMI computed realtime từ weight + height (TT 32/2023
                            Chương X yêu cầu BMI cho mọi khám). Không phải input
                            riêng — tính từ vitals đã nhập. */}
                        {(() => {
                            const bmi = computeBmi(draft.weight, draft.height);
                            if (bmi.value === null) return null;
                            const color =
                                bmi.category === 'normal' ? palette.EHR_TERTIARY
                                    : bmi.category === 'underweight' ? palette.EHR_WARNING
                                        : palette.EHR_DANGER;
                            return (
                                <XStack
                                    style={{
                                        marginTop: 8,
                                        paddingHorizontal: 12,
                                        paddingVertical: 10,
                                        borderRadius: 10,
                                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                                        borderWidth: 0.5,
                                        borderColor: palette.EHR_OUTLINE_SOFT,
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 12.5, color: palette.EHR_ON_SURFACE, fontWeight: '600' }}>
                                        BMI · {bmi.value} kg/m²
                                    </Text>
                                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 11.5, color, fontWeight: '700' }}>
                                        {bmi.label}
                                    </Text>
                                </XStack>
                            );
                        })()}
                    </View>
                </>
            ) : null}

            {/* PRESCRIPTION multi-drug — hiện khi !simpleMode VÀ recordType != 'vacc' */}
            {!draft.simpleMode && draft.recordType !== 'vacc' ? (
                <PrescriptionSection
                    drugs={draft.drugs || []}
                    onChange={(next) => set('drugs', next)}
                />
            ) : null}

            {/* VACCINATION multi-shot — hiện khi recordType='vacc' (C2 plan §15) */}
            {draft.recordType === 'vacc' ? (
                <VaccinationSection
                    shots={draft.vaccinations || []}
                    onChange={(next) => set('vaccinations', next)}
                />
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

// VitalRow — 3-col grid: [label + ref + (input ; unit)] [status note]
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

// ─────────── Prescription section (C1 multi-drug) ───────────
function PrescriptionSection({
    drugs,
    onChange,
}: {
    drugs: Drug[];
    onChange: (next: Drug[]) => void;
}) {
    const palette = useEhrPalette();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [deleteCandidate, setDeleteCandidate] = useState<Drug | null>(null);

    // Tổng lỗi để hiện trên section trail
    const totalErrors = drugs
        .filter((d) => (d.medication || '').trim())
        .flatMap(validateDrug).length;
    const drugCount = drugs.filter((d) => (d.medication || '').trim()).length;

    const handleAddDrug = () => {
        const newDrug = emptyDrug();
        onChange([...drugs, newDrug]);
        setExpandedId(newDrug.id);
    };

    const handlePatch = (id: string, patch: Partial<Drug>) => {
        onChange(drugs.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    };

    const handleDelete = (id: string) => {
        onChange(drugs.filter((d) => d.id !== id));
        if (expandedId === id) setExpandedId(null);
        setDeleteCandidate(null);
    };

    const trailLabel = totalErrors > 0
        ? `${totalErrors} lỗi`
        : drugCount > 0
            ? `${drugCount} thuốc`
            : '0 thuốc';
    const trailNode = (
        <Text
            style={{
                fontFamily: MONO,
                fontSize: 11,
                color: totalErrors > 0 ? palette.EHR_PRIMARY : palette.EHR_TEXT_MUTED,
                letterSpacing: 0.6,
                fontWeight: '700',
            }}
        >
            {trailLabel}
        </Text>
    );

    return (
        <>
            <SectionLabel trailing={trailNode}>
                Đơn thuốc · TT 26/2025/TT-BYT
            </SectionLabel>

            {drugs.length === 0 ? (
                <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                    <View
                        style={{
                            borderRadius: 14,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            paddingHorizontal: 18,
                            paddingVertical: 22,
                            alignItems: 'center',
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 13.5,
                                color: palette.EHR_ON_SURFACE,
                                fontWeight: '700',
                                marginBottom: 4,
                            }}
                        >
                            Chưa có thuốc trong đơn
                        </Text>
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 12,
                                color: palette.EHR_TEXT_MUTED,
                                textAlign: 'center',
                                lineHeight: 17,
                                marginBottom: 14,
                            }}
                        >
                            TT 26/2025 cho phép kê nhiều thuốc trong cùng một đơn.
                        </Text>
                        <Pressable
                            onPress={handleAddDrug}
                            style={({ pressed }) => ({
                                backgroundColor: palette.EHR_PRIMARY,
                                paddingHorizontal: 18,
                                paddingVertical: 11,
                                borderRadius: 999,
                                opacity: pressed ? 0.85 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 13,
                                    color: palette.EHR_SURFACE,
                                    fontWeight: '700',
                                }}
                            >
                                + Thêm thuốc đầu tiên
                            </Text>
                        </Pressable>
                    </View>
                </View>
            ) : (
                <View style={{ paddingBottom: 18 }}>
                    {drugs.map((drug, idx) => {
                        const drugErrors = validateDrug(drug);
                        return (
                            <RxCard
                                key={drug.id}
                                drug={drug}
                                index={idx + 1}
                                expanded={expandedId === drug.id}
                                errors={drugErrors}
                                onToggleExpand={() =>
                                    setExpandedId(expandedId === drug.id ? null : drug.id)
                                }
                                onChange={(patch) => handlePatch(drug.id, patch)}
                                onRequestDelete={() => setDeleteCandidate(drug)}
                            />
                        );
                    })}
                    <View style={{ paddingHorizontal: 22, paddingTop: 4 }}>
                        <Pressable
                            onPress={handleAddDrug}
                            style={({ pressed }) => ({
                                borderRadius: 12,
                                borderWidth: 0.5,
                                borderStyle: 'dashed',
                                borderColor: palette.EHR_PRIMARY,
                                paddingVertical: 11,
                                alignItems: 'center',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 13,
                                    color: palette.EHR_PRIMARY,
                                    fontWeight: '700',
                                }}
                            >
                                + Thêm thuốc
                            </Text>
                        </Pressable>
                    </View>
                </View>
            )}

            {/* Delete confirm sheet — simple Alert pattern, không cần ConfirmSheet custom */}
            {deleteCandidate ? (
                <DeleteConfirmInline
                    drug={deleteCandidate}
                    onConfirm={() => handleDelete(deleteCandidate.id)}
                    onCancel={() => setDeleteCandidate(null)}
                />
            ) : null}
        </>
    );
}

function DeleteConfirmInline({
    drug,
    onConfirm,
    onCancel,
}: {
    drug: Drug;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    useEffect(() => {
        Alert.alert(
            `Xoá ${drug.medication || 'thuốc'}?`,
            `${drug.strength ? drug.strength + ' — ' : ''}Hành động này không thể hoàn tác sau khi ký hồ sơ.`,
            [
                { text: 'Giữ lại', style: 'cancel', onPress: onCancel },
                { text: 'Xoá thuốc', style: 'destructive', onPress: onConfirm },
            ],
            { cancelable: true, onDismiss: onCancel },
        );
    }, [drug.id]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

// ─────────── Vaccination section (C2 multi-shot, TT 13/2026/TT-BYT) ───────────
function VaccinationSection({
    shots,
    onChange,
}: {
    shots: Vaccination[];
    onChange: (next: Vaccination[]) => void;
}) {
    const palette = useEhrPalette();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [deleteCandidate, setDeleteCandidate] = useState<Vaccination | null>(null);

    const allErrors = shots
        .filter((s) => (s.vaccineName || '').trim())
        .flatMap(validateShot)
        .filter((e) => e.severity === 'hard');
    const totalErrors = allErrors.length;
    const shotCount = shots.filter((s) => (s.vaccineName || '').trim()).length;

    const handleAddShot = () => {
        const next = emptyShot();
        onChange([...shots, next]);
        setExpandedId(next.id);
    };
    const handlePatch = (id: string, patch: Partial<Vaccination>) => {
        onChange(shots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    };
    const handleDelete = (id: string) => {
        onChange(shots.filter((s) => s.id !== id));
        if (expandedId === id) setExpandedId(null);
        setDeleteCandidate(null);
    };

    React.useEffect(() => {
        if (deleteCandidate) {
            Alert.alert(
                `Xoá mũi tiêm ${deleteCandidate.vaccineName || ''}?`,
                'Hành động này không thể hoàn tác sau khi ký hồ sơ.',
                [
                    { text: 'Giữ lại', style: 'cancel', onPress: () => setDeleteCandidate(null) },
                    { text: 'Xoá mũi tiêm', style: 'destructive', onPress: () => handleDelete(deleteCandidate.id) },
                ],
                { cancelable: true, onDismiss: () => setDeleteCandidate(null) },
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deleteCandidate?.id]);

    const trailLabel = totalErrors > 0 ? `${totalErrors} lỗi` : `${shotCount} mũi`;
    const trailNode = (
        <Text
            style={{
                fontFamily: MONO,
                fontSize: 11,
                color: totalErrors > 0 ? palette.EHR_PRIMARY : palette.EHR_TEXT_MUTED,
                letterSpacing: 0.6,
                fontWeight: '700',
            }}
        >
            {trailLabel}
        </Text>
    );

    return (
        <>
            <SectionLabel trailing={trailNode}>
                Tiêm chủng · TT 13/2026/TT-BYT
            </SectionLabel>

            {/* Lineage banner — TT 13/2026 thay thế VB cũ */}
            <View style={{ paddingHorizontal: 22, paddingBottom: 12 }}>
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        borderRadius: 10,
                        backgroundColor: `${palette.EHR_TERTIARY}10`,
                        borderWidth: 0.5,
                        borderColor: `${palette.EHR_TERTIARY}40`,
                    }}
                >
                    <View
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: palette.EHR_TERTIARY,
                        }}
                    />
                    <Text
                        style={{
                            fontFamily: MONO,
                            fontSize: 10.5,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            flex: 1,
                            lineHeight: 14,
                        }}
                    >
                        TT 13/2026 thay thế TT 24/2018 + 34/2018 + 05/2020 + 52/2025. HPV vào danh sách bắt buộc.
                    </Text>
                </View>
            </View>

            {shots.length === 0 ? (
                <View style={{ paddingHorizontal: 22, paddingBottom: 18 }}>
                    <View
                        style={{
                            borderRadius: 14,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            paddingHorizontal: 18,
                            paddingVertical: 22,
                            alignItems: 'center',
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 13.5,
                                color: palette.EHR_ON_SURFACE,
                                fontWeight: '700',
                                marginBottom: 4,
                            }}
                        >
                            Chưa có mũi tiêm
                        </Text>
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 12,
                                color: palette.EHR_TEXT_MUTED,
                                textAlign: 'center',
                                lineHeight: 17,
                                marginBottom: 14,
                            }}
                        >
                            1 buổi tiêm chủng có thể gồm nhiều mũi cho cùng bệnh nhân.
                        </Text>
                        <Pressable
                            onPress={handleAddShot}
                            style={({ pressed }) => ({
                                backgroundColor: palette.EHR_PRIMARY,
                                paddingHorizontal: 18,
                                paddingVertical: 11,
                                borderRadius: 999,
                                opacity: pressed ? 0.85 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 13,
                                    color: palette.EHR_SURFACE,
                                    fontWeight: '700',
                                }}
                            >
                                + Thêm mũi tiêm đầu tiên
                            </Text>
                        </Pressable>
                    </View>
                </View>
            ) : (
                <View style={{ paddingBottom: 18 }}>
                    {shots.map((shot, idx) => {
                        const shotErrors = validateShot(shot);
                        return (
                            <VaccCard
                                key={shot.id}
                                shot={shot}
                                index={idx + 1}
                                expanded={expandedId === shot.id}
                                errors={shotErrors}
                                onToggleExpand={() =>
                                    setExpandedId(expandedId === shot.id ? null : shot.id)
                                }
                                onChange={(patch) => handlePatch(shot.id, patch)}
                                onRequestDelete={() => setDeleteCandidate(shot)}
                            />
                        );
                    })}
                    <View style={{ paddingHorizontal: 22, paddingTop: 4 }}>
                        <Pressable
                            onPress={handleAddShot}
                            style={({ pressed }) => ({
                                borderRadius: 12,
                                borderWidth: 0.5,
                                borderStyle: 'dashed',
                                borderColor: palette.EHR_PRIMARY,
                                paddingVertical: 11,
                                alignItems: 'center',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 13,
                                    color: palette.EHR_PRIMARY,
                                    fontWeight: '700',
                                }}
                            >
                                + Thêm mũi tiêm
                            </Text>
                        </Pressable>
                    </View>
                </View>
            )}
        </>
    );
}
