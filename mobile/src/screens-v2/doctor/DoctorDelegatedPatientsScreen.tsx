// DoctorDelegatedPatientsScreen v2 — port of screens/doctor.
// Full Delegate CHAIN topology — patients đã trao toàn quyền cho doctor.
// Doctor có thể: xem records, re-share record qua delegation, sub-delegate.
//
// ALL business logic preserved bit-for-bit:
//   - useDelegatedToMe / useSubDelegate TanStack hooks
//   - recordService.getDelegatedPatientRecords
//   - delegationService.grantUsingDelegation (msg.sender = doctor)
//   - 3 pre-checks: local AES, recipient pubkey, doctor verification, canAccess
//     overwrite warning (Option B downgrade guard)
//   - NaCl seal + KeyShare write for new grantee
//   - SubDelegateModal: "full remaining" auto-duration option

import React, { useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Switch,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import {
    ChevronRight,
    FileText,
    Info,
    Send,
    Shield,
    Stethoscope,
    Users,
    X,
} from 'lucide-react-native';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

import LoadingSpinner from '../../components/LoadingSpinner';
import UserChip from '../../components/UserChip';
import localRecordStore from '../../services/localRecordStore';
import api from '../../services/api';
import recordService from '../../services/record.service';
import delegationService from '../../services/delegation.service';
import authService from '../../services/auth.service';
import keyShareService from '../../services/keyShare.service';
import walletActionService from '../../services/walletAction.service';
import { encryptForRecipient, getOrCreateEncryptionKeypair } from '../../services/nacl-crypto';
import { computeEncKeyHash } from '../../utils/eip712';
import {
    useDelegatedToMe,
    useSubDelegate,
    type DelegationRow,
} from '../../hooks/queries/useDelegations';
import ViCard from '../../components-v2/ViCard';
import ViButton from '../../components-v2/ViButton';
import { ViStatusChip } from '../../components-v2/ViChips';
import {
    EHR_SURFACE,
    EHR_SURFACE_LOWEST,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE,
    EHR_OUTLINE_SOFT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_TERTIARY,
    EHR_WARNING,
} from '../../constants/uiColors';
import { formatDate as formatDateShared, formatExpiry } from '../../utils/dateFormatting';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type PatientRecord = {
    id: string;
    cidHash: string;
    ownerAddress: string;
    title: string | null;
    description: string | null;
    recordType: string | null;
    createdAt: string;
};

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const truncate = (addr?: string | null) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???';

const formatDate = (s?: string | null) => formatDateShared(s);

// ───────────────────────────────────────────────────────────────────
//  ShareRecordModal — verbatim business logic
// ───────────────────────────────────────────────────────────────────
function ShareRecordModal({
    visible,
    record,
    patientAddress,
    onClose,
    onDone,
}: {
    visible: boolean;
    record: PatientRecord | null;
    patientAddress: string;
    onClose: () => void;
    onDone: () => void;
}) {
    const [newGrantee, setNewGrantee] = useState('');
    const [days, setDays] = useState('30');
    const [submitting, setSubmitting] = useState(false);

    const reset = () => {
        setNewGrantee('');
        setDays('30');
    };

    const handleSubmit = async () => {
        if (!record) return;
        const grantee = newGrantee.trim().toLowerCase();
        if (!ADDRESS_RE.test(grantee)) {
            Alert.alert('Địa chỉ không hợp lệ', 'Nhập địa chỉ ví bác sĩ 0x...');
            return;
        }
        const d = parseInt(days, 10);
        if (!Number.isFinite(d) || d < 1 || d > 1825) {
            Alert.alert('Thời hạn không hợp lệ', '1 - 1825 ngày.');
            return;
        }
        const expireAtSeconds = Math.floor(Date.now() / 1000) + d * 86400;

        setSubmitting(true);
        try {
            const local = await localRecordStore.getKey(record.cidHash);
            if (!local?.cid || !local?.aesKey) {
                Alert.alert(
                    'Chưa có khoá giải mã',
                    'Bạn chưa có khoá giải mã hồ sơ này. Hãy yêu cầu bệnh nhân chia sẻ khoá hồ sơ trước khi có thể uỷ quyền cho bác sĩ khác.',
                );
                setSubmitting(false);
                return;
            }

            let recipientPubKey: string | null = null;
            try {
                const k = await authService.getEncryptionKey(grantee);
                recipientPubKey = k?.encryptionPublicKey || null;
            } catch {}
            if (!recipientPubKey) {
                Alert.alert(
                    'Người nhận chưa đăng ký',
                    'Địa chỉ này chưa đăng nhập vào hệ thống EHR hoặc chưa tạo khoá mã hoá. Yêu cầu họ đăng nhập app trước.',
                );
                setSubmitting(false);
                return;
            }

            try {
                const roleCtx: any = await api.get(`/api/relayer/grant-context?grantee=${grantee}`);
                if (roleCtx?.isDoctor && !roleCtx?.isVerifiedDoctor) {
                    const confirmed = await new Promise<boolean>((resolve) => {
                        Alert.alert(
                            'Bác sĩ chưa xác minh',
                            'Bác sĩ này chưa được tổ chức y tế xác minh on-chain. Hồ sơ sẽ CHỈ ĐỌC ĐƯỢC sau khi họ được xác minh.\n\nBạn có muốn tiếp tục?',
                            [
                                { text: 'Huỷ', style: 'cancel', onPress: () => resolve(false) },
                                { text: 'Vẫn chia sẻ', style: 'destructive', onPress: () => resolve(true) },
                            ],
                            { cancelable: true, onDismiss: () => resolve(false) },
                        );
                    });
                    if (!confirmed) {
                        setSubmitting(false);
                        return;
                    }
                }
            } catch {}

            try {
                const pc = createPublicClient({
                    chain: arbitrumSepolia,
                    transport: http(process.env.EXPO_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'),
                });
                const CONSENT_ADDR = process.env.EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS as `0x${string}`;
                const alreadyHas = await pc.readContract({
                    address: CONSENT_ADDR,
                    abi: [{
                        name: 'canAccess',
                        type: 'function',
                        stateMutability: 'view',
                        inputs: [
                            { name: 'p', type: 'address' },
                            { name: 'g', type: 'address' },
                            { name: 'c', type: 'bytes32' },
                        ],
                        outputs: [{ type: 'bool' }],
                    }],
                    functionName: 'canAccess',
                    args: [patientAddress as `0x${string}`, grantee as `0x${string}`, record.cidHash as `0x${string}`],
                });
                if (alreadyHas) {
                    Alert.alert(
                        'Bác sĩ đã có quyền',
                        'Bác sĩ này đã có quyền truy cập hồ sơ này. Chia sẻ sẽ GHI ĐÈ quyền cũ.\n\nĐể thay đổi quyền, bệnh nhân nên thu hồi quyền cũ trước.',
                        [{ text: 'Đã hiểu' }],
                    );
                    setSubmitting(false);
                    return;
                }
            } catch {}

            const encKeyHash = computeEncKeyHash(local.aesKey);
            const result = await delegationService.grantUsingDelegation({
                patientAddress,
                newGrantee: grantee,
                rootCidHash: record.cidHash,
                encKeyHash,
                expireAtSeconds,
                allowDelegate: false,
            });

            try {
                const { walletClient, address: myAddress } = await walletActionService.getWalletContext();
                const myKeypair = await getOrCreateEncryptionKeypair(walletClient, myAddress);
                const payload = JSON.stringify({ cid: local.cid, aesKey: local.aesKey });
                const encryptedPayload = encryptForRecipient(payload, recipientPubKey, myKeypair.secretKey);
                await keyShareService.shareKey({
                    cidHash: record.cidHash,
                    recipientAddress: grantee,
                    encryptedPayload,
                    senderPublicKey: myKeypair.publicKey,
                    expiresAt: expireAtSeconds > 0 ? new Date(expireAtSeconds * 1000).toISOString() : null,
                    allowDelegate: false,
                });
            } catch (keyShareErr: any) {
                Alert.alert(
                    'Cảnh báo',
                    `Đã cấp quyền on-chain (tx: ${result.txHash.slice(0, 14)}…) nhưng KHÔNG tạo được bản mã hoá khoá cho bác sĩ mới. Họ sẽ thấy consent nhưng KHÔNG giải mã được. Lỗi: ${keyShareErr?.message || keyShareErr}`,
                );
                reset();
                onDone();
                return;
            }

            Alert.alert(
                'Cấp quyền thành công',
                `Bác sĩ ${truncate(grantee)} đã có quyền truy cập hồ sơ này (${d} ngày).\n\nTx: ${result.txHash.slice(0, 14)}…`,
            );
            reset();
            onDone();
        } catch (err: any) {
            Alert.alert('Thất bại', err?.message || 'Không thể mint consent.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            >
                <View
                    style={{
                        backgroundColor: EHR_SURFACE_LOWEST,
                        borderTopLeftRadius: 22,
                        borderTopRightRadius: 22,
                        padding: 22,
                        paddingBottom: 36,
                        maxHeight: '92%',
                    }}
                >
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 20,
                                color: EHR_ON_SURFACE,
                                letterSpacing: -0.3,
                            }}
                        >
                            Cấp qua uỷ quyền
                        </Text>
                        <Pressable
                            onPress={() => {
                                reset();
                                onClose();
                            }}
                            hitSlop={8}
                        >
                            <X size={18} color={EHR_OUTLINE} />
                        </Pressable>
                    </XStack>

                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        {record ? (
                            <View
                                style={{
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    backgroundColor: EHR_PRIMARY_FIXED,
                                    borderRadius: 12,
                                    marginBottom: 16,
                                }}
                            >
                                <XStack style={{ alignItems: 'center', gap: 8 }}>
                                    <FileText size={14} color={EHR_PRIMARY} />
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 13.5,
                                            color: EHR_PRIMARY,
                                            fontWeight: '700',
                                            flex: 1,
                                        }}
                                        numberOfLines={1}
                                    >
                                        {record.title || 'Hồ sơ y tế'}
                                    </Text>
                                </XStack>
                                <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 11.5, color: EHR_PRIMARY }}>
                                    {record.recordType || 'medical_record'}
                                </Text>
                                <Text style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 10.5, color: EHR_PRIMARY }}>
                                    cidHash: {record.cidHash.slice(0, 16)}…
                                </Text>
                            </View>
                        ) : null}

                        <FieldLabel>Địa chỉ ví bác sĩ nhận</FieldLabel>
                        <TextInput
                            style={inputStyle}
                            placeholder="0x..."
                            placeholderTextColor={EHR_OUTLINE}
                            value={newGrantee}
                            onChangeText={setNewGrantee}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <View style={{ height: 14 }} />
                        <FieldLabel>Thời hạn (ngày)</FieldLabel>
                        <TextInput
                            style={inputStyle}
                            placeholder="30"
                            placeholderTextColor={EHR_OUTLINE}
                            value={days}
                            onChangeText={setDays}
                            keyboardType="number-pad"
                        />
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: EHR_OUTLINE, marginTop: 4 }}>
                            Sẽ bị cắt về thời hạn uỷ quyền gốc nếu lớn hơn.
                        </Text>

                        <View
                            style={{
                                marginTop: 14,
                                padding: 12,
                                backgroundColor: `${EHR_WARNING}1A`,
                                borderRadius: 10,
                                borderWidth: 0.5,
                                borderColor: `${EHR_WARNING}50`,
                                flexDirection: 'row',
                                gap: 6,
                            }}
                        >
                            <Info size={13} color={EHR_WARNING} style={{ marginTop: 1 }} />
                            <Text
                                style={{
                                    flex: 1,
                                    fontFamily: SANS,
                                    fontSize: 11.5,
                                    color: EHR_ON_SURFACE,
                                    lineHeight: 16,
                                }}
                            >
                                Cấp consent on-chain + tạo KeyShare NaCl cho bác sĩ nhận. Họ sẽ giải mã được ngay.
                            </Text>
                        </View>

                        <View style={{ height: 18 }} />
                        <ViButton variant="cinnabar" full loading={submitting} onPress={handleSubmit}>
                            {submitting ? 'Đang ký…' : 'Ký & Cấp on-chain'}
                        </ViButton>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ───────────────────────────────────────────────────────────────────
//  SubDelegateModal
// ───────────────────────────────────────────────────────────────────
function SubDelegateModal({
    visible,
    patientAddress,
    parentExpiresAt,
    onClose,
}: {
    visible: boolean;
    patientAddress: string;
    parentExpiresAt: string;
    onClose: () => void;
}) {
    const subDelegateMutation = useSubDelegate();
    const [subDelegatee, setSubDelegatee] = useState('');
    const [days, setDays] = useState('30');
    const [useFullRemaining, setUseFullRemaining] = useState(false);
    const [allowFurther, setAllowFurther] = useState(false);

    const parentExpiryMs = parentExpiresAt ? new Date(parentExpiresAt).getTime() : 0;
    const remainingMs = Math.max(0, parentExpiryMs - Date.now());
    const remainingDays = Math.floor(remainingMs / (24 * 3600 * 1000));
    const remainingHours = Math.floor((remainingMs % (24 * 3600 * 1000)) / (3600 * 1000));
    const remainingLabel = remainingDays > 0
        ? `${remainingDays} ngày ${remainingHours}h`
        : `${remainingHours} giờ`;
    const remainingTooShort = remainingMs < 3600 * 1000;

    const reset = () => {
        setSubDelegatee('');
        setDays('30');
        setUseFullRemaining(false);
        setAllowFurther(false);
    };

    const handleSubmit = async () => {
        const addr = subDelegatee.trim().toLowerCase();
        if (!ADDRESS_RE.test(addr)) {
            Alert.alert('Địa chỉ không hợp lệ', 'Nhập địa chỉ ví bác sĩ 0x...');
            return;
        }
        let d: number;
        if (useFullRemaining) {
            d = Math.max(1, remainingDays + 1);
        } else {
            d = parseInt(days, 10);
            if (!Number.isFinite(d) || d < 1 || d > 1825) {
                Alert.alert('Thời hạn không hợp lệ', '1 - 1825 ngày.');
                return;
            }
        }
        if (remainingTooShort) {
            Alert.alert(
                'Thời hạn quá ngắn',
                `Uỷ quyền của bạn chỉ còn ${remainingLabel}. Bác sĩ nhận có thể không kịp sử dụng.`,
            );
        }
        try {
            const result = await subDelegateMutation.mutateAsync({
                patientAddress,
                subDelegatee: addr,
                durationDays: d,
                allowFurther,
            });
            Alert.alert(
                'Đã uỷ quyền tiếp',
                `Bác sĩ ${truncate(addr)} nhận được uỷ quyền tiếp.\n\nTx: ${result.txHash.slice(0, 14)}…`,
            );
            reset();
            onClose();
        } catch (err: any) {
            Alert.alert('Thất bại', err?.message || 'Không thể uỷ quyền tiếp.');
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            >
                <View
                    style={{
                        backgroundColor: EHR_SURFACE_LOWEST,
                        borderTopLeftRadius: 22,
                        borderTopRightRadius: 22,
                        padding: 22,
                        paddingBottom: 36,
                        maxHeight: '92%',
                    }}
                >
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <Text
                            style={{
                                fontFamily: SERIF,
                                fontSize: 20,
                                color: EHR_ON_SURFACE,
                                letterSpacing: -0.3,
                            }}
                        >
                            Uỷ quyền tiếp
                        </Text>
                        <Pressable
                            onPress={() => {
                                reset();
                                onClose();
                            }}
                            hitSlop={8}
                        >
                            <X size={18} color={EHR_OUTLINE} />
                        </Pressable>
                    </XStack>

                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        <FieldLabel>Địa chỉ ví bác sĩ nhận</FieldLabel>
                        <TextInput
                            style={inputStyle}
                            placeholder="0x..."
                            placeholderTextColor={EHR_OUTLINE}
                            value={subDelegatee}
                            onChangeText={setSubDelegatee}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <View style={{ height: 14 }} />
                        <FieldLabel>Thời hạn</FieldLabel>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                            <Pressable onPress={() => setUseFullRemaining(true)}>
                                <View
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 6,
                                        borderRadius: 999,
                                        borderWidth: 0.5,
                                        borderColor: useFullRemaining ? EHR_PRIMARY : EHR_OUTLINE_SOFT,
                                        backgroundColor: useFullRemaining ? EHR_PRIMARY_FIXED : EHR_SURFACE,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_MEDIUM,
                                            fontSize: 12,
                                            color: useFullRemaining ? EHR_PRIMARY : EHR_OUTLINE,
                                            fontWeight: useFullRemaining ? '700' : '500',
                                        }}
                                    >
                                        Toàn bộ ({remainingLabel})
                                    </Text>
                                </View>
                            </Pressable>
                            {[7, 30, 90].map((preset) => {
                                const active = !useFullRemaining && days === String(preset);
                                return (
                                    <Pressable
                                        key={preset}
                                        onPress={() => {
                                            setUseFullRemaining(false);
                                            setDays(String(preset));
                                        }}
                                    >
                                        <View
                                            style={{
                                                paddingHorizontal: 12,
                                                paddingVertical: 6,
                                                borderRadius: 999,
                                                borderWidth: 0.5,
                                                borderColor: active ? EHR_PRIMARY : EHR_OUTLINE_SOFT,
                                                backgroundColor: active ? EHR_PRIMARY_FIXED : EHR_SURFACE,
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    fontFamily: SANS_MEDIUM,
                                                    fontSize: 12,
                                                    color: active ? EHR_PRIMARY : EHR_OUTLINE,
                                                    fontWeight: active ? '700' : '500',
                                                }}
                                            >
                                                {preset} ngày
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>

                        {!useFullRemaining ? (
                            <TextInput
                                style={inputStyle}
                                placeholder="Nhập số ngày"
                                placeholderTextColor={EHR_OUTLINE}
                                value={days}
                                onChangeText={(t) => setDays(t.replace(/[^0-9]/g, ''))}
                                keyboardType="number-pad"
                            />
                        ) : null}

                        <Text style={{ fontFamily: SANS, fontSize: 11, color: EHR_OUTLINE, marginTop: 6, lineHeight: 16 }}>
                            Contract tự động cắt về thời hạn uỷ quyền gốc nếu lớn hơn.
                            {remainingTooShort ? '\n⚠️ Thời hạn còn lại dưới 1 giờ — bác sĩ nhận có thể không kịp sử dụng.' : ''}
                        </Text>

                        <XStack
                            style={{
                                marginTop: 14,
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                backgroundColor: EHR_SURFACE,
                                borderWidth: 0.5,
                                borderColor: EHR_OUTLINE_SOFT,
                                borderRadius: 12,
                                alignItems: 'center',
                            }}
                        >
                            <YStack style={{ flex: 1, paddingRight: 12 }}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 13.5,
                                        color: EHR_ON_SURFACE,
                                        fontWeight: '600',
                                    }}
                                >
                                    Cho phép uỷ quyền tiếp tầng 3
                                </Text>
                                <Text
                                    style={{
                                        marginTop: 2,
                                        fontFamily: SANS,
                                        fontSize: 11.5,
                                        color: EHR_OUTLINE,
                                        lineHeight: 16,
                                    }}
                                >
                                    Bác sĩ nhận có thể tạo uỷ quyền tiếp xuống dưới.
                                </Text>
                            </YStack>
                            <Switch
                                value={allowFurther}
                                onValueChange={setAllowFurther}
                                trackColor={{ false: EHR_OUTLINE_VARIANT, true: EHR_PRIMARY }}
                                thumbColor="#FAF7F1"
                            />
                        </XStack>

                        <View style={{ height: 18 }} />
                        <ViButton
                            variant="cinnabar"
                            full
                            loading={subDelegateMutation.isPending}
                            onPress={handleSubmit}
                        >
                            {subDelegateMutation.isPending ? 'Đang ký…' : 'Ký & Uỷ quyền tiếp'}
                        </ViButton>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ───────────────────────────────────────────────────────────────────
//  PatientRecordsDrawer
// ───────────────────────────────────────────────────────────────────
function PatientRecordsDrawer({
    patient,
    onClose,
}: {
    patient: DelegationRow | null;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [shareTarget, setShareTarget] = useState<PatientRecord | null>(null);
    const [subOpen, setSubOpen] = useState(false);

    const enabled = !!patient;
    const { data, isLoading, refetch, isFetching } = useQuery<{
        delegation: DelegationRow;
        records: PatientRecord[];
    }>({
        queryKey: ['delegatedPatientRecords', patient?.patientAddress],
        queryFn: () => recordService.getDelegatedPatientRecords(patient!.patientAddress),
        enabled,
    });

    const records = data?.records || [];

    const renderRecord = ({ item }: { item: PatientRecord }) => (
        <Pressable onPress={() => setShareTarget(item)}>
            <ViCard padding={14} style={{ marginBottom: 10 }}>
                <XStack style={{ alignItems: 'center', gap: 10 }}>
                    <FileText size={18} color={EHR_PRIMARY} />
                    <YStack style={{ flex: 1 }}>
                        <Text
                            style={{
                                fontFamily: SANS_MEDIUM,
                                fontSize: 14,
                                color: EHR_ON_SURFACE,
                                fontWeight: '600',
                            }}
                            numberOfLines={1}
                        >
                            {item.title || 'Hồ sơ y tế'}
                        </Text>
                        <Text
                            style={{
                                marginTop: 2,
                                fontFamily: SANS,
                                fontSize: 11.5,
                                color: EHR_OUTLINE,
                            }}
                        >
                            {item.recordType || 'medical_record'} · {formatDate(item.createdAt)}
                        </Text>
                    </YStack>
                    <Send size={14} color={EHR_OUTLINE} />
                </XStack>
            </ViCard>
        </Pressable>
    );

    return (
        <Modal visible={enabled} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
                <XStack
                    style={{
                        padding: 16,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottomWidth: 0.5,
                        borderColor: EHR_OUTLINE_SOFT,
                    }}
                >
                    <View style={{ flex: 1 }}>
                        {patient ? (
                            <UserChip address={patient.patientAddress} expanded showAddress={false} />
                        ) : null}
                        <Text
                            style={{
                                marginTop: 6,
                                fontFamily: SANS,
                                fontSize: 11.5,
                                color: EHR_OUTLINE,
                            }}
                        >
                            Hết hạn: {patient ? formatExpiry(patient.expiresAt) : ''}
                            {patient?.allowSubDelegate ? ' · uỷ quyền tiếp được' : ''}
                        </Text>
                    </View>
                    <Pressable onPress={onClose} hitSlop={8}>
                        <X size={20} color={EHR_OUTLINE} />
                    </Pressable>
                </XStack>

                {patient?.allowSubDelegate ? (
                    <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                        <ViButton
                            variant="primary"
                            full
                            onPress={() => setSubOpen(true)}
                            leftIcon={<Users size={14} color={EHR_SURFACE} />}
                        >
                            Uỷ quyền tiếp cho bác sĩ khác
                        </ViButton>
                    </View>
                ) : null}

                {isLoading ? (
                    <LoadingSpinner message="Đang tải hồ sơ bệnh nhân..." />
                ) : (
                    <FlatList
                        data={records}
                        keyExtractor={(r) => r.id}
                        contentContainerStyle={{ padding: 20 }}
                        renderItem={renderRecord}
                        refreshControl={
                            <RefreshControl
                                refreshing={isFetching && !isLoading}
                                onRefresh={() => refetch()}
                                tintColor={EHR_ON_SURFACE_VARIANT}
                            />
                        }
                        ListEmptyComponent={
                            <View style={{ paddingTop: 30, alignItems: 'center' }}>
                                <FileText size={28} color={EHR_OUTLINE} />
                                <Text
                                    style={{
                                        marginTop: 12,
                                        fontFamily: SERIF,
                                        fontSize: 18,
                                        color: EHR_ON_SURFACE,
                                        textAlign: 'center',
                                    }}
                                >
                                    Chưa có hồ sơ
                                </Text>
                                <Text
                                    style={{
                                        marginTop: 8,
                                        fontFamily: SANS,
                                        fontSize: 13,
                                        color: EHR_OUTLINE,
                                        textAlign: 'center',
                                        maxWidth: 280,
                                    }}
                                >
                                    Bệnh nhân này chưa có hồ sơ y tế nào.
                                </Text>
                            </View>
                        }
                    />
                )}

                <ShareRecordModal
                    visible={!!shareTarget}
                    record={shareTarget}
                    patientAddress={patient?.patientAddress || ''}
                    onClose={() => setShareTarget(null)}
                    onDone={() => {
                        setShareTarget(null);
                        queryClient.invalidateQueries({ queryKey: ['delegatedPatientRecords'] });
                    }}
                />

                {patient ? (
                    <SubDelegateModal
                        visible={subOpen}
                        patientAddress={patient.patientAddress}
                        parentExpiresAt={patient.expiresAt}
                        onClose={() => setSubOpen(false)}
                    />
                ) : null}
            </SafeAreaView>
        </Modal>
    );
}

// ───────────────────────────────────────────────────────────────────
//  Main screen
// ───────────────────────────────────────────────────────────────────
export default function DoctorDelegatedPatientsScreen() {
    const { data: delegations = [], isLoading, isFetching, refetch } = useDelegatedToMe();
    const [selected, setSelected] = useState<DelegationRow | null>(null);

    const renderItem = ({ item }: { item: DelegationRow }) => {
        const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date();
        return (
            <Pressable
                onPress={() => !isExpired && setSelected(item)}
                disabled={!!isExpired}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
                <ViCard padding={16} style={{ marginBottom: 10, opacity: isExpired ? 0.6 : 1 }}>
                    <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                        <View style={{ flex: 1 }}>
                            {/* G.2 — patient wallet → UserChip resolves real name + nationalId tag */}
                            <UserChip address={item.patientAddress} expanded showAddress={false} />
                            <Text style={{ fontFamily: SANS, fontSize: 12, color: EHR_OUTLINE, marginTop: 6 }}>
                                {item.chainDepth === 1
                                    ? 'Uỷ quyền trực tiếp từ bệnh nhân'
                                    : `Chuỗi uỷ quyền cấp ${item.chainDepth}`}
                                {item.allowSubDelegate ? ' · uỷ quyền tiếp được' : ''}
                            </Text>
                            {item.parentDelegator ? (
                                <View style={{ marginTop: 6 }}>
                                    <Text style={{ fontFamily: SANS, fontSize: 11, color: EHR_OUTLINE, marginBottom: 3 }}>
                                        Uỷ quyền từ bác sĩ:
                                    </Text>
                                    <UserChip address={item.parentDelegator} showAddress={false} size="sm" interactive={false} />
                                </View>
                            ) : null}
                            <Text style={{ fontFamily: SANS, fontSize: 11, color: EHR_OUTLINE, marginTop: 3 }}>
                                Hết hạn: {formatExpiry(item.expiresAt)}
                            </Text>
                            {item.scopeNote ? (
                                <Text
                                    style={{ fontFamily: SANS, fontSize: 11, color: EHR_OUTLINE, marginTop: 3 }}
                                    numberOfLines={2}
                                >
                                    Phạm vi: {item.scopeNote}
                                </Text>
                            ) : null}
                        </View>
                        <ViStatusChip status={isExpired ? 'expired' : 'active'} />
                    </XStack>
                    {!isExpired ? (
                        <XStack style={{ alignItems: 'center', marginTop: 10, justifyContent: 'flex-end', gap: 4 }}>
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 12,
                                    color: EHR_PRIMARY,
                                    fontWeight: '600',
                                }}
                            >
                                Xem hồ sơ
                            </Text>
                            <ChevronRight size={14} color={EHR_PRIMARY} />
                        </XStack>
                    ) : null}
                </ViCard>
            </Pressable>
        );
    };

    if (isLoading) {
        return <LoadingSpinner message="Đang tải danh sách bệnh nhân..." />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 }}>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 26,
                        color: EHR_ON_SURFACE,
                        letterSpacing: -0.4,
                        lineHeight: 30,
                    }}
                >
                    Bệnh nhân uỷ quyền
                </Text>
                <Text
                    style={{
                        marginTop: 4,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: EHR_ON_SURFACE_VARIANT,
                        lineHeight: 19,
                    }}
                >
                    Bệnh nhân đã trao bạn toàn quyền chia sẻ hồ sơ thay họ.
                </Text>
            </View>

            <View
                style={{
                    marginHorizontal: 20,
                    marginBottom: 12,
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                    backgroundColor: `${EHR_TERTIARY}1A`,
                    borderRadius: 12,
                    borderWidth: 0.5,
                    borderColor: `${EHR_TERTIARY}50`,
                    flexDirection: 'row',
                    gap: 8,
                }}
            >
                <Shield size={14} color={EHR_TERTIARY} style={{ marginTop: 2 }} />
                <Text
                    style={{
                        flex: 1,
                        fontFamily: SANS,
                        fontSize: 11.5,
                        color: EHR_ON_SURFACE,
                        lineHeight: 17,
                    }}
                >
                    Mỗi truy cập sẽ kiểm tra epoch on-chain. Bệnh nhân hoặc bác sĩ cấp trên thu hồi → các consent bạn đã cấp tự bị vô hiệu.
                </Text>
            </View>

            <FlatList
                data={delegations}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isFetching && !isLoading}
                        onRefresh={() => refetch()}
                        tintColor={EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListEmptyComponent={
                    <View style={{ paddingTop: 30, alignItems: 'center' }}>
                        <Users size={28} color={EHR_OUTLINE} />
                        <Text
                            style={{
                                marginTop: 12,
                                fontFamily: SERIF,
                                fontSize: 18,
                                color: EHR_ON_SURFACE,
                                textAlign: 'center',
                            }}
                        >
                            Chưa có uỷ quyền
                        </Text>
                        <Text
                            style={{
                                marginTop: 8,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: EHR_OUTLINE,
                                textAlign: 'center',
                                maxWidth: 280,
                                lineHeight: 19,
                            }}
                        >
                            Bạn chưa nhận được uỷ quyền từ bệnh nhân nào.
                        </Text>
                    </View>
                }
                renderItem={renderItem}
            />

            <PatientRecordsDrawer patient={selected} onClose={() => setSelected(null)} />
        </SafeAreaView>
    );
}

const inputStyle = {
    borderWidth: 0.5,
    borderColor: EHR_OUTLINE_SOFT,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: EHR_ON_SURFACE,
    backgroundColor: EHR_SURFACE,
    fontFamily: SANS,
    fontSize: 14,
};

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <Text
            style={{
                fontFamily: SANS_SEMI,
                fontSize: 11.5,
                color: EHR_OUTLINE,
                marginBottom: 6,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                fontWeight: '600',
            }}
        >
            {children}
        </Text>
    );
}
