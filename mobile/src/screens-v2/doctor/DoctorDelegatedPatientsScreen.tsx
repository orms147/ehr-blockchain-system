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
import UserChip, { useUserProfile } from '../../components/UserChip';
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
import { useEhrPalette } from '../../constants/uiColors';
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
    const palette = useEhrPalette();
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
                            'Bác sĩ này chưa được tổ chức y tế xác minh. Hồ sơ sẽ CHỈ ĐỌC ĐƯỢC sau khi họ được xác minh.\n\nBạn có muốn tiếp tục?',
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
                    `Đã cấp quyền (mã: ${result.txHash.slice(0, 14)}…) nhưng KHÔNG tạo được khoá mã hoá cho bác sĩ mới. Họ sẽ thấy quyền nhưng KHÔNG đọc được nội dung. Lỗi: ${keyShareErr?.message || keyShareErr}`,
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
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
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
                                color: palette.EHR_ON_SURFACE,
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
                            <X size={18} color={palette.EHR_TEXT_MUTED} />
                        </Pressable>
                    </XStack>

                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        {record ? (
                            <View
                                style={{
                                    paddingVertical: 12,
                                    paddingHorizontal: 14,
                                    backgroundColor: palette.EHR_PRIMARY_FIXED,
                                    borderRadius: 12,
                                    marginBottom: 16,
                                }}
                            >
                                <XStack style={{ alignItems: 'center', gap: 8 }}>
                                    <FileText size={14} color={palette.EHR_PRIMARY} />
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 13.5,
                                            color: palette.EHR_PRIMARY,
                                            fontWeight: '700',
                                            flex: 1,
                                        }}
                                        numberOfLines={1}
                                    >
                                        {record.title || 'Hồ sơ y tế'}
                                    </Text>
                                </XStack>
                                <Text style={{ marginTop: 4, fontFamily: SANS, fontSize: 11.5, color: palette.EHR_PRIMARY }}>
                                    {record.recordType || 'medical_record'}
                                </Text>
                                <Text style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 10.5, color: palette.EHR_PRIMARY }}>
                                    cidHash: {record.cidHash.slice(0, 16)}…
                                </Text>
                            </View>
                        ) : null}

                        <FieldLabel>Địa chỉ ví bác sĩ nhận</FieldLabel>
                        <TextInput
                            style={makeInputStyle(palette)}
                            placeholder="0x..."
                            placeholderTextColor={palette.EHR_OUTLINE}
                            value={newGrantee}
                            onChangeText={setNewGrantee}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <View style={{ height: 14 }} />
                        <FieldLabel>Thời hạn (ngày)</FieldLabel>
                        <TextInput
                            style={makeInputStyle(palette)}
                            placeholder="30"
                            placeholderTextColor={palette.EHR_OUTLINE}
                            value={days}
                            onChangeText={setDays}
                            keyboardType="number-pad"
                        />
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, marginTop: 4 }}>
                            Sẽ bị cắt về thời hạn uỷ quyền gốc nếu lớn hơn.
                        </Text>

                        <View
                            style={{
                                marginTop: 14,
                                padding: 12,
                                backgroundColor: `${palette.EHR_WARNING}1A`,
                                borderRadius: 10,
                                borderWidth: 0.5,
                                borderColor: `${palette.EHR_WARNING}50`,
                                flexDirection: 'row',
                                gap: 6,
                            }}
                        >
                            <Info size={13} color={palette.EHR_WARNING} style={{ marginTop: 1 }} />
                            <Text
                                style={{
                                    flex: 1,
                                    fontFamily: SANS,
                                    fontSize: 11.5,
                                    color: palette.EHR_ON_SURFACE,
                                    lineHeight: 16,
                                }}
                            >
                                Cấp quyền truy cập + tạo khoá mã hoá cho bác sĩ nhận. Họ sẽ đọc được ngay.
                            </Text>
                        </View>

                        <View style={{ height: 18 }} />
                        <ViButton variant="cinnabar" full loading={submitting} onPress={handleSubmit}>
                            {submitting ? 'Đang ký…' : 'Ký & Cấp quyền'}
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
    const palette = useEhrPalette();
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
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
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
                                color: palette.EHR_ON_SURFACE,
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
                            <X size={18} color={palette.EHR_TEXT_MUTED} />
                        </Pressable>
                    </XStack>

                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        <FieldLabel>Địa chỉ ví bác sĩ nhận</FieldLabel>
                        <TextInput
                            style={makeInputStyle(palette)}
                            placeholder="0x..."
                            placeholderTextColor={palette.EHR_OUTLINE}
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
                                        borderColor: useFullRemaining ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                        backgroundColor: useFullRemaining ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_MEDIUM,
                                            fontSize: 12,
                                            color: useFullRemaining ? palette.EHR_PRIMARY : palette.EHR_OUTLINE,
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
                                                borderColor: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                                backgroundColor: active ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE,
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    fontFamily: SANS_MEDIUM,
                                                    fontSize: 12,
                                                    color: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE,
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
                                style={makeInputStyle(palette)}
                                placeholder="Nhập số ngày"
                                placeholderTextColor={palette.EHR_OUTLINE}
                                value={days}
                                onChangeText={(t) => setDays(t.replace(/[^0-9]/g, ''))}
                                keyboardType="number-pad"
                            />
                        ) : null}

                        <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, marginTop: 6, lineHeight: 16 }}>
                            Contract tự động cắt về thời hạn uỷ quyền gốc nếu lớn hơn.
                            {remainingTooShort ? '\n⚠️ Thời hạn còn lại dưới 1 giờ — bác sĩ nhận có thể không kịp sử dụng.' : ''}
                        </Text>

                        <XStack
                            style={{
                                marginTop: 14,
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                backgroundColor: palette.EHR_SURFACE,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                borderRadius: 12,
                                alignItems: 'center',
                            }}
                        >
                            <YStack style={{ flex: 1, paddingRight: 12 }}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 13.5,
                                        color: palette.EHR_ON_SURFACE,
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
                                        color: palette.EHR_TEXT_MUTED,
                                        lineHeight: 16,
                                    }}
                                >
                                    Bác sĩ nhận có thể tạo uỷ quyền tiếp xuống dưới.
                                </Text>
                            </YStack>
                            <Switch
                                value={allowFurther}
                                onValueChange={setAllowFurther}
                                trackColor={{ false: palette.EHR_OUTLINE_VARIANT, true: palette.EHR_PRIMARY }}
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
    const palette = useEhrPalette();
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
                    <FileText size={18} color={palette.EHR_PRIMARY} />
                    <YStack style={{ flex: 1 }}>
                        <Text
                            style={{
                                fontFamily: SANS_MEDIUM,
                                fontSize: 14,
                                color: palette.EHR_ON_SURFACE,
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
                                color: palette.EHR_TEXT_MUTED,
                            }}
                        >
                            {item.recordType || 'medical_record'} · {formatDate(item.createdAt)}
                        </Text>
                    </YStack>
                    <Send size={14} color={palette.EHR_TEXT_MUTED} />
                </XStack>
            </ViCard>
        </Pressable>
    );

    return (
        <Modal visible={enabled} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top']}>
                <XStack
                    style={{
                        padding: 16,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottomWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_SOFT,
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
                                color: palette.EHR_TEXT_MUTED,
                            }}
                        >
                            Hết hạn: {patient ? formatExpiry(patient.expiresAt) : ''}
                            {patient?.allowSubDelegate ? ' · uỷ quyền tiếp được' : ''}
                        </Text>
                    </View>
                    <Pressable onPress={onClose} hitSlop={8}>
                        <X size={20} color={palette.EHR_TEXT_MUTED} />
                    </Pressable>
                </XStack>

                {patient?.allowSubDelegate ? (
                    <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
                        <ViButton
                            variant="primary"
                            full
                            onPress={() => setSubOpen(true)}
                            leftIcon={<Users size={14} color={palette.EHR_SURFACE} />}
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
                                tintColor={palette.EHR_ON_SURFACE_VARIANT}
                            />
                        }
                        ListEmptyComponent={
                            <View style={{ paddingTop: 30, alignItems: 'center' }}>
                                <FileText size={28} color={palette.EHR_TEXT_MUTED} />
                                <Text
                                    style={{
                                        marginTop: 12,
                                        fontFamily: SERIF,
                                        fontSize: 18,
                                        color: palette.EHR_ON_SURFACE,
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
                                        color: palette.EHR_TEXT_MUTED,
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
//  G.12.m — text-rhythm row helpers
// ───────────────────────────────────────────────────────────────────
function PatientAvatar({ address, palette }: { address: string; palette: ReturnType<typeof useEhrPalette> }) {
    const { data: profile } = useUserProfile(address);
    const initial = (profile?.fullName?.split(' ').slice(-1)[0]?.[0] || '?').toUpperCase();
    return (
        <View
            style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: 20,
                backgroundColor: palette.EHR_SURFACE_CONTAINER,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE,
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Text
                style={{
                    fontFamily: SERIF,
                    fontSize: 16,
                    fontWeight: '600',
                    color: palette.EHR_ON_SURFACE_VARIANT,
                }}
            >
                {initial}
            </Text>
        </View>
    );
}

function PatientName({ address, palette }: { address: string; palette: ReturnType<typeof useEhrPalette> }) {
    const { data: profile } = useUserProfile(address);
    return (
        <Text
            style={{
                fontFamily: SANS_SEMI,
                fontSize: 14.5,
                fontWeight: '600',
                color: palette.EHR_ON_SURFACE,
                flex: 1,
            }}
            numberOfLines={1}
        >
            {profile?.fullName || truncate(address)}
        </Text>
    );
}

// ───────────────────────────────────────────────────────────────────
//  Main screen
// ───────────────────────────────────────────────────────────────────
export default function DoctorDelegatedPatientsScreen() {
    const palette = useEhrPalette();
    const { data: delegations = [], isLoading, isFetching, refetch } = useDelegatedToMe();
    const [selected, setSelected] = useState<DelegationRow | null>(null);

    // G.12.m — text-rhythm row per viehp-doctor-extras.html DelegatedPatientRow.
    const renderItem = ({ item, index }: { item: DelegationRow; index: number }) => {
        const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date();
        const direct = item.chainDepth === 1;
        const isLast = index === delegations.length - 1;
        const dLeft = item.expiresAt ? Math.max(0, Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000)) : null;

        return (
            <Pressable
                onPress={() => !isExpired && setSelected(item)}
                disabled={!!isExpired}
                style={({ pressed }) => ({
                    flexDirection: 'row',
                    gap: 14,
                    paddingHorizontal: 22,
                    paddingVertical: 14,
                    borderBottomWidth: isLast ? 0 : 0.5,
                    borderColor: palette.EHR_OUTLINE_VARIANT,
                    opacity: isExpired ? 0.55 : (pressed ? 0.7 : 1),
                })}
            >
                {/* 40px serif-initial avatar */}
                <PatientAvatar address={item.patientAddress} palette={palette} />

                <YStack style={{ flex: 1, minWidth: 0 }}>
                    {/* Name row + mono "N hồ sơ" */}
                    <XStack style={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <PatientName address={item.patientAddress} palette={palette} />
                    </XStack>

                    {/* Chain depth signal — jade dot "Trực tiếp" OR cinnabar pill "↻ Qua BS. X" */}
                    <XStack style={{ marginTop: 9, alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {direct ? (
                            <XStack style={{ alignItems: 'center', gap: 5 }}>
                                <View
                                    style={{
                                        width: 5,
                                        height: 5,
                                        borderRadius: 3,
                                        backgroundColor: palette.EHR_TERTIARY,
                                    }}
                                />
                                <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 11, color: palette.EHR_TERTIARY, fontWeight: '600', letterSpacing: 0.2 }}>
                                    Trực tiếp
                                </Text>
                            </XStack>
                        ) : (
                            <View
                                style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 2,
                                    borderRadius: 4,
                                    backgroundColor: `${palette.EHR_PRIMARY}14`,
                                    borderWidth: 0.5,
                                    borderColor: `${palette.EHR_PRIMARY}40`,
                                }}
                            >
                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 10.5, color: palette.EHR_PRIMARY, fontWeight: '600', letterSpacing: 0.2 }}>
                                    ↻ Cấp {item.chainDepth}
                                </Text>
                            </View>
                        )}
                        <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: palette.EHR_TEXT_MUTED }} />
                        <Text style={{ fontFamily: 'monospace', fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                            đến {formatExpiry(item.expiresAt)}
                            {dLeft !== null ? ` · còn ${dLeft}d` : ''}
                        </Text>
                    </XStack>

                    {/* Sub-delegate affordance */}
                    {item.allowSubDelegate ? (
                        <Text
                            style={{
                                marginTop: 10,
                                fontFamily: SANS_SEMI,
                                fontSize: 10.5,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                letterSpacing: 0.3,
                                textTransform: 'uppercase',
                                fontWeight: '700',
                            }}
                        >
                            <Text style={{ color: palette.EHR_PRIMARY }}>→</Text> Có thể uỷ quyền lại
                        </Text>
                    ) : null}
                </YStack>
                <Text style={{ alignSelf: 'center', color: palette.EHR_TEXT_MUTED, fontSize: 18 }}>›</Text>
            </Pressable>
        );
    };

    if (isLoading) {
        return <LoadingSpinner message="Đang tải danh sách bệnh nhân..." />;
    }

    const totalRecords = 0; // backend doesn't aggregate per-patient record count yet
    const indirectCount = delegations.filter((d) => d.chainDepth !== 1).length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top']}>
            <FlatList
                data={delegations}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 80 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isFetching && !isLoading}
                        onRefresh={() => refetch()}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListHeaderComponent={
                    <>
                        {/* Editorial header */}
                        <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 18 }}>
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 10,
                                    color: palette.EHR_TEXT_MUTED,
                                    letterSpacing: 1.4,
                                    textTransform: 'uppercase',
                                    fontWeight: '700',
                                    marginBottom: 8,
                                }}
                            >
                                Toàn quyền · Tin cậy tuyệt đối
                            </Text>
                            <Text
                                style={{
                                    fontFamily: SERIF,
                                    fontSize: 26,
                                    color: palette.EHR_ON_SURFACE,
                                    letterSpacing: -0.4,
                                    lineHeight: 30,
                                }}
                            >
                                Bệnh nhân{' '}
                                <Text style={{ fontFamily: 'Fraunces_400Regular_Italic', fontStyle: 'italic', color: palette.EHR_PRIMARY }}>
                                    uỷ quyền.
                                </Text>
                            </Text>
                            <Text
                                style={{
                                    marginTop: 8,
                                    fontFamily: SANS,
                                    fontSize: 13,
                                    color: palette.EHR_ON_SURFACE_VARIANT,
                                    lineHeight: 19,
                                }}
                            >
                                Những người đã trao bạn toàn quyền xem và quản lý hồ sơ. Bạn có thể uỷ quyền lại cho đồng nghiệp khi được phép.
                            </Text>
                        </View>

                        {/* Stat strip per design */}
                        <View
                            style={{
                                marginHorizontal: 22,
                                marginBottom: 18,
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                backgroundColor: palette.EHR_SURFACE_CONTAINER,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_VARIANT,
                                borderRadius: 12,
                                flexDirection: 'row',
                            }}
                        >
                            <Stat n={delegations.length} label="Bệnh nhân" palette={palette} />
                            <View style={{ width: 0.5, backgroundColor: palette.EHR_OUTLINE_VARIANT }} />
                            <Stat n={totalRecords || delegations.length} label="Hồ sơ" palette={palette} />
                            <View style={{ width: 0.5, backgroundColor: palette.EHR_OUTLINE_VARIANT }} />
                            <Stat n={indirectCount} label="Qua uỷ quyền" palette={palette} warn />
                        </View>
                    </>
                }
                ListEmptyComponent={
                    <View style={{ paddingHorizontal: 30, paddingTop: 80, alignItems: 'center' }}>
                        <Users size={28} color={palette.EHR_TEXT_MUTED} />
                        <Text
                            style={{
                                marginTop: 16,
                                fontFamily: SERIF,
                                fontSize: 19,
                                fontWeight: '500',
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.2,
                            }}
                        >
                            Chưa có bệnh nhân uỷ quyền
                        </Text>
                        <Text
                            style={{
                                marginTop: 8,
                                fontFamily: SANS,
                                fontSize: 12.5,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 19,
                                maxWidth: 240,
                                textAlign: 'center',
                            }}
                        >
                            Uỷ quyền toàn bộ là quyết định nhạy cảm — bệnh nhân phải chủ động ký từ phía họ. Không có cách "yêu cầu" từ bác sĩ.
                        </Text>
                    </View>
                }
                renderItem={renderItem}
                ListFooterComponent={
                    delegations.length > 0 ? (
                        <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
                            <Text
                                style={{
                                    fontFamily: SANS,
                                    fontSize: 11,
                                    color: palette.EHR_TEXT_MUTED,
                                    lineHeight: 17,
                                }}
                            >
                                Uỷ quyền lại (sub-delegation) chỉ khả dụng khi bệnh nhân cho phép tường minh trong lúc ký đồng ý ban đầu.
                            </Text>
                        </View>
                    ) : null
                }
            />

            <PatientRecordsDrawer patient={selected} onClose={() => setSelected(null)} />
        </SafeAreaView>
    );
}

function Stat({
    n,
    label,
    palette,
    warn,
}: {
    n: number;
    label: string;
    palette: ReturnType<typeof useEhrPalette>;
    warn?: boolean;
}) {
    return (
        <View style={{ flex: 1, alignItems: 'center' }}>
            <Text
                style={{
                    fontFamily: SERIF,
                    fontSize: 26,
                    fontWeight: '500',
                    color: warn ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE,
                    lineHeight: 30,
                    letterSpacing: -0.5,
                }}
            >
                {n}
            </Text>
            <Text
                style={{
                    marginTop: 6,
                    fontSize: 9.5,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                    fontFamily: SANS_SEMI,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

const makeInputStyle = (palette: ReturnType<typeof useEhrPalette>) => ({
    borderWidth: 0.5,
    borderColor: palette.EHR_OUTLINE_SOFT,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: palette.EHR_ON_SURFACE,
    backgroundColor: palette.EHR_SURFACE,
    fontFamily: SANS,
    fontSize: 14,
});

function FieldLabel({ children }: { children: React.ReactNode }) {
    const palette = useEhrPalette();
    return (
        <Text
            style={{
                fontFamily: SANS_SEMI,
                fontSize: 11.5,
                color: palette.EHR_TEXT_MUTED,
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
