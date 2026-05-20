// DoctorRequestAccessScreen v2 — port of .design-bundle/project/screens-doctor.jsx
// RequestAccessScreen. Doctor gửi yêu cầu truy cập hồ sơ bệnh nhân, ON-CHAIN
// (EHRSystemSecure.requestAccess) + auto-confirm as requester after 17s
// (MIN_APPROVAL_DELAY) để claim flow tức thì khi patient duyệt.
//
// ALL business logic preserved bit-for-bit:
//   - 3 request types: DirectAccess(0) / FullDelegation(1) / RecordDelegation(2)
//   - Wallet pre-check (no self-request) + isPatient role check on-chain
//   - CID requirements per type (zero hash for FullDelegation, required else)
//   - biometric gateOrThrow before writeContract
//   - waitForTransactionReceipt + parseEventLogs (with 3 fallbacks for reqId)
//   - POST /api/requests/create mirror to DB
//   - 17s setTimeout auto-confirmAccessRequest as requester (Step B pre-pay)
//   - viem publicClient (createPublicClient on Arbitrum Sepolia)

import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, User, FileText, AlertCircle, CheckCircle, QrCode } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import { createPublicClient, http, parseEventLogs, parseGwei } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

import api from '../../services/api';
import walletActionService from '../../services/walletAction.service';
import { withRpcRetry, formatChainError } from '../../utils/rpcRetry';
import QrAddressScanner from '../../components/QrAddressScanner';
import ViCard from '../../components-v2/ViCard';
import ViButton from '../../components-v2/ViButton';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const EHR_SYSTEM_ADDRESS = process.env.EXPO_PUBLIC_EHR_SYSTEM_ADDRESS as `0x${string}`;
const ARBITRUM_RPC = process.env.EXPO_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';

const REQUEST_ACCESS_ABI = [
    {
        type: 'function',
        name: 'requestAccess',
        inputs: [
            { name: 'patient', type: 'address' },
            { name: 'rootCidHash', type: 'bytes32' },
            { name: 'reqType', type: 'uint8' },
            { name: 'encKeyHash', type: 'bytes32' },
            { name: 'consentDurationHours', type: 'uint40' },
            { name: 'validForHours', type: 'uint40' },
        ],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'function',
        name: 'confirmAccessRequest',
        inputs: [{ name: 'reqId', type: 'bytes32' }],
        outputs: [],
        stateMutability: 'nonpayable',
    },
    {
        type: 'event',
        name: 'AccessRequested',
        inputs: [
            { indexed: true, name: 'reqId', type: 'bytes32' },
            { indexed: true, name: 'requester', type: 'address' },
            { indexed: true, name: 'patient', type: 'address' },
            { indexed: false, name: 'rootCidHash', type: 'bytes32' },
            { indexed: false, name: 'reqType', type: 'uint8' },
            { indexed: false, name: 'expiry', type: 'uint40' },
        ],
    },
] as const;

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(ARBITRUM_RPC, { retryCount: 0 }),
});

const REQUEST_TYPES = [
    { value: 0, label: 'Đọc & cập nhật', description: 'Xem hồ sơ + bản cập nhật. Không chia sẻ lại.' },
    { value: 2, label: 'Đọc & uỷ quyền lại', description: 'Xem + có thể chia sẻ cho bác sĩ khác.' },
    { value: 1, label: 'Uỷ quyền toàn bộ', description: 'Truy cập MỌI hồ sơ. Người giám hộ.' },
];

const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

export default function DoctorRequestAccessScreen() {
    const palette = useEhrPalette();
    const [patientAddress, setPatientAddress] = useState('');
    const [cidHash, setCidHash] = useState('');
    const [selectedType, setSelectedType] = useState(0);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [cidScannerOpen, setCidScannerOpen] = useState(false);
    const [durationHours, setDurationHours] = useState<number>(0);
    const [customDurationOpen, setCustomDurationOpen] = useState(false);
    const [customDurationValue, setCustomDurationValue] = useState('');
    const [customDurationUnit, setCustomDurationUnit] = useState<'minutes' | 'hours' | 'days'>('days');

    const handleSubmit = async () => {
        if (!patientAddress.trim()) {
            Alert.alert('Thiếu thông tin', 'Vui lòng nhập địa chỉ ví bệnh nhân.');
            return;
        }
        if (!isValidAddress(patientAddress.trim())) {
            Alert.alert('Địa chỉ không hợp lệ', 'Địa chỉ ví phải bắt đầu bằng 0x và có 42 ký tự.');
            return;
        }

        const { address: myAddr } = await walletActionService.getWalletContext();
        if (patientAddress.trim().toLowerCase() === myAddr?.toLowerCase()) {
            Alert.alert('Không thể tự yêu cầu', 'Bạn không thể yêu cầu truy cập hồ sơ của chính mình.');
            return;
        }

        try {
            const targetAddr = patientAddress.trim().toLowerCase();
            const isPatient = await withRpcRetry(() => publicClient.readContract({
                address: (process.env.EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS || '') as `0x${string}`,
                abi: [{
                    name: 'isPatient',
                    type: 'function',
                    stateMutability: 'view',
                    inputs: [{ name: 'account', type: 'address' }],
                    outputs: [{ type: 'bool' }],
                }],
                functionName: 'isPatient',
                args: [targetAddr as `0x${string}`],
            }));
            if (!isPatient) {
                Alert.alert(
                    'Không phải bệnh nhân',
                    'Địa chỉ này chưa đăng ký vai trò bệnh nhân trong hệ thống.',
                );
                return;
            }
        } catch {}

        const trimmedCid = cidHash.trim();
        if (selectedType !== 1) {
            if (!trimmedCid) {
                Alert.alert(
                    'Thiếu CID hồ sơ',
                    'Loại yêu cầu này cần CID cụ thể. Nhập hoặc quét CID trên màn hình bệnh nhân.',
                );
                return;
            }
            if (!/^0x[a-fA-F0-9]{64}$/.test(trimmedCid)) {
                Alert.alert('CID không hợp lệ', 'CID Hash phải bắt đầu bằng 0x và có đúng 64 ký tự hex.');
                return;
            }
        }

        setIsSubmitting(true);
        try {
            const zeroHash = `0x${'0'.repeat(64)}` as `0x${string}`;
            const normalizedCidHash = (selectedType === 1 ? zeroHash : trimmedCid) as `0x${string}`;
            const targetPatient = patientAddress.trim().toLowerCase() as `0x${string}`;

            const { walletClient } = await walletActionService.getWalletContext();
            const { gateOrThrow } = await import('../../utils/biometricGate');
            await gateOrThrow('Để gửi yêu cầu truy cập hồ sơ');

            const onChainHours = Math.max(1, Math.ceil(durationHours));
            const consentDurationHours = BigInt(onChainHours);
            const validForHours = BigInt(24);

            const txHash = await walletClient.writeContract({
                address: EHR_SYSTEM_ADDRESS,
                abi: REQUEST_ACCESS_ABI,
                functionName: 'requestAccess',
                args: [
                    targetPatient,
                    normalizedCidHash,
                    selectedType,
                    zeroHash,
                    consentDurationHours,
                    validForHours,
                ],
                gas: BigInt(400000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            const events = parseEventLogs({
                abi: REQUEST_ACCESS_ABI,
                eventName: 'AccessRequested',
                logs: receipt.logs,
            });
            let onChainReqId = (events[0] as any)?.args?.reqId as string | undefined;

            if (!onChainReqId) {
                for (const l of receipt.logs) {
                    if (l.topics && l.topics.length >= 2) {
                        onChainReqId = l.topics[1] as string;
                        break;
                    }
                }
            }
            if (!onChainReqId) {
                await new Promise((r) => setTimeout(r, 3000));
                try {
                    const retryReceipt = await publicClient.getTransactionReceipt({ hash: txHash });
                    for (const l of (retryReceipt.logs || [])) {
                        if (l.topics && l.topics.length >= 2) {
                            onChainReqId = l.topics[1] as string;
                            break;
                        }
                    }
                } catch {}
            }
            if (!onChainReqId) {
                console.warn('[Request] Could not extract reqId from logs, using txHash as fallback');
                onChainReqId = txHash;
            }

            await api.post('/api/requests/create', {
                patientAddress: targetPatient,
                cidHash: normalizedCidHash,
                requestType: selectedType,
                durationDays: Math.max(1, Math.ceil(durationHours / 24)),
                durationHours,
                validForHours: Number(validForHours),
                txHash,
                onChainReqId,
                reason: reason.trim() || undefined,
            });

            if (onChainReqId) {
                setTimeout(async () => {
                    try {
                        const { walletClient: wc } = await walletActionService.getWalletContext();
                        await wc.writeContract({
                            address: EHR_SYSTEM_ADDRESS,
                            abi: REQUEST_ACCESS_ABI,
                            functionName: 'confirmAccessRequest',
                            args: [onChainReqId as `0x${string}`],
                            gas: BigInt(200000),
                            maxFeePerGas: parseGwei('1.0'),
                            maxPriorityFeePerGas: parseGwei('0.1'),
                        });
                        console.log('[Request] Auto-approved as requester:', onChainReqId.slice(0, 14));
                    } catch (e: any) {
                        console.warn('[Request] Auto-approve failed (will retry at claim):', e?.message?.slice(0, 60));
                    }
                }, 17000);
            }

            setIsSuccess(true);
            setPatientAddress('');
            setCidHash('');
            setSelectedType(0);
            setReason('');
        } catch (error: any) {
            Alert.alert('Lỗi', formatChainError(error, 'Không thể gửi yêu cầu. Vui lòng thử lại.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
                <YStack style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <View
                        style={{
                            width: 80,
                            height: 80,
                            borderRadius: 40,
                            backgroundColor: `${palette.EHR_TERTIARY}26`,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 20,
                        }}
                    >
                        <CheckCircle size={40} color={palette.EHR_TERTIARY} />
                    </View>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 24,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.3,
                            marginBottom: 8,
                            textAlign: 'center',
                        }}
                    >
                        Đã gửi yêu cầu
                    </Text>
                    <Text
                        style={{
                            fontFamily: SANS,
                            fontSize: 14,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            textAlign: 'center',
                            lineHeight: 21,
                            maxWidth: 320,
                        }}
                    >
                        Yêu cầu đã được gửi tới bệnh nhân. Họ sẽ nhận thông báo và phê duyệt hoặc từ chối.
                    </Text>
                    <View style={{ marginTop: 24, width: '100%', maxWidth: 280 }}>
                        <ViButton variant="primary" full onPress={() => setIsSuccess(false)}>
                            Tạo yêu cầu mới
                        </ViButton>
                    </View>
                </YStack>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Hero */}
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 26,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.4,
                            lineHeight: 30,
                            marginBottom: 4,
                        }}
                    >
                        Yêu cầu truy cập
                    </Text>
                    <Text
                        style={{
                            fontFamily: SANS,
                            fontSize: 13,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 19,
                            marginBottom: 18,
                        }}
                    >
                        Bệnh nhân sẽ nhận thông báo và phê duyệt hoặc từ chối.
                    </Text>

                    {/* Info banner */}
                    <View
                        style={{
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            borderRadius: 12,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            marginBottom: 18,
                            flexDirection: 'row',
                            gap: 10,
                        }}
                    >
                        <AlertCircle size={16} color={palette.EHR_TEXT_MUTED} style={{ marginTop: 2 }} />
                        <Text
                            style={{
                                flex: 1,
                                fontFamily: SANS,
                                fontSize: 12.5,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 18,
                            }}
                        >
                            Yêu cầu được ghi on-chain (bạn ký gas). Tự động pre-approve sau 17s để patient duyệt claim tức thì.
                        </Text>
                    </View>

                    {/* Patient address */}
                    <FieldLabel error={patientAddress.length > 0 && !isValidAddress(patientAddress)}>
                        Địa chỉ ví bệnh nhân *
                    </FieldLabel>
                    <View
                        style={{
                            borderWidth: 0.75,
                            borderColor:
                                patientAddress.length > 0 && !isValidAddress(patientAddress)
                                    ? palette.EHR_DANGER
                                    : palette.EHR_OUTLINE_SOFT,
                            borderRadius: 12,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            marginBottom: 6,
                        }}
                    >
                        <User size={15} color={palette.EHR_TEXT_MUTED} />
                        <TextInput
                            value={patientAddress}
                            onChangeText={setPatientAddress}
                            placeholder="0x..."
                            placeholderTextColor={palette.EHR_OUTLINE}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{
                                flex: 1,
                                paddingVertical: 12,
                                paddingHorizontal: 10,
                                color: palette.EHR_ON_SURFACE,
                                fontFamily: 'monospace',
                                fontSize: 13,
                            }}
                        />
                        <Pressable onPress={() => setScannerOpen(true)} hitSlop={8}>
                            <QrCode size={18} color={palette.EHR_PRIMARY} />
                        </Pressable>
                    </View>
                    <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, marginBottom: 14 }}>
                        Bấm biểu tượng QR để quét từ điện thoại bệnh nhân.
                    </Text>

                    {/* CID Hash */}
                    <FieldLabel>
                        CID Hash {selectedType !== 1 ? '*' : '(không cần cho Uỷ quyền toàn bộ)'}
                    </FieldLabel>
                    <View
                        style={{
                            borderWidth: 0.75,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            borderRadius: 12,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            marginBottom: 6,
                            opacity: selectedType === 1 ? 0.5 : 1,
                        }}
                    >
                        <FileText size={15} color={palette.EHR_TEXT_MUTED} />
                        <TextInput
                            value={selectedType === 1 ? '' : cidHash}
                            onChangeText={setCidHash}
                            editable={selectedType !== 1}
                            placeholder={
                                selectedType === 1
                                    ? 'Không cần cho uỷ quyền toàn bộ'
                                    : 'Nhập hoặc quét CID'
                            }
                            placeholderTextColor={palette.EHR_OUTLINE}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{
                                flex: 1,
                                paddingVertical: 12,
                                paddingHorizontal: 10,
                                color: palette.EHR_ON_SURFACE,
                                fontFamily: 'monospace',
                                fontSize: 12,
                            }}
                        />
                        <Pressable
                            onPress={selectedType === 1 ? undefined : () => setCidScannerOpen(true)}
                            hitSlop={8}
                            disabled={selectedType === 1}
                        >
                            <QrCode size={18} color={palette.EHR_PRIMARY} />
                        </Pressable>
                    </View>
                    <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, marginBottom: 18 }}>
                        {selectedType === 1
                            ? 'Uỷ quyền toàn bộ áp dụng mọi hồ sơ — không chọn CID cụ thể.'
                            : 'Bấm QR để quét mã CID trên màn hình bệnh nhân.'}
                    </Text>

                    {/* Request type */}
                    <FieldLabel>Loại yêu cầu</FieldLabel>
                    <YStack style={{ gap: 8, marginBottom: 18 }}>
                        {REQUEST_TYPES.map((type) => {
                            const isActive = selectedType === type.value;
                            return (
                                <Pressable
                                    key={type.value}
                                    onPress={() => setSelectedType(type.value)}
                                    style={({ pressed }) => ({
                                        paddingVertical: 12,
                                        paddingHorizontal: 14,
                                        borderRadius: 12,
                                        borderWidth: isActive ? 1.5 : 0.5,
                                        borderColor: isActive ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                        backgroundColor: isActive ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE_LOWEST,
                                        opacity: pressed ? 0.7 : 1,
                                    })}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 14,
                                            color: isActive ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE,
                                            fontWeight: '700',
                                        }}
                                    >
                                        {type.label}
                                    </Text>
                                    <Text
                                        style={{
                                            marginTop: 3,
                                            fontFamily: SANS,
                                            fontSize: 11.5,
                                            color: isActive ? palette.EHR_PRIMARY : palette.EHR_OUTLINE,
                                            lineHeight: 16,
                                        }}
                                    >
                                        {type.description}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </YStack>

                    {/* Duration */}
                    <FieldLabel>Thời hạn truy cập</FieldLabel>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {[
                            { label: 'Mặc định', hours: 0 },
                            { label: '5p (test)', hours: 5 / 60 },
                            { label: '10p (test)', hours: 10 / 60 },
                            { label: '1 giờ', hours: 1 },
                            { label: '24 giờ', hours: 24 },
                            { label: '7 ngày', hours: 7 * 24 },
                            { label: '30 ngày', hours: 30 * 24 },
                        ].map((opt) => {
                            const active = !customDurationOpen && durationHours === opt.hours;
                            return (
                                <Pressable
                                    key={opt.label}
                                    onPress={() => {
                                        setCustomDurationOpen(false);
                                        setDurationHours(opt.hours);
                                    }}
                                    style={({ pressed }) => ({
                                        paddingHorizontal: 12,
                                        paddingVertical: 6,
                                        borderRadius: 999,
                                        borderWidth: 0.5,
                                        borderColor: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                        backgroundColor: active ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE_LOWEST,
                                        opacity: pressed ? 0.7 : 1,
                                    })}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_MEDIUM,
                                            fontSize: 12,
                                            color: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE,
                                            fontWeight: active ? '700' : '500',
                                        }}
                                    >
                                        {opt.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                        <Pressable
                            onPress={() => setCustomDurationOpen(true)}
                            style={({ pressed }) => ({
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 999,
                                borderWidth: 0.5,
                                borderColor: customDurationOpen ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                backgroundColor: customDurationOpen ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE_LOWEST,
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_MEDIUM,
                                    fontSize: 12,
                                    color: customDurationOpen ? palette.EHR_PRIMARY : palette.EHR_OUTLINE,
                                    fontWeight: customDurationOpen ? '700' : '500',
                                }}
                            >
                                Tuỳ chỉnh
                            </Text>
                        </Pressable>
                    </View>

                    {customDurationOpen ? (
                        <YStack style={{ marginBottom: 14, gap: 8 }}>
                            <XStack style={{ gap: 6 }}>
                                {(['minutes', 'hours', 'days'] as const).map((u) => {
                                    const active = customDurationUnit === u;
                                    const label = u === 'minutes' ? 'Phút' : u === 'hours' ? 'Giờ' : 'Ngày';
                                    return (
                                        <Pressable
                                            key={u}
                                            onPress={() => setCustomDurationUnit(u)}
                                            style={({ pressed }) => ({
                                                paddingHorizontal: 10,
                                                paddingVertical: 4,
                                                borderRadius: 999,
                                                borderWidth: 0.5,
                                                borderColor: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                                backgroundColor: active ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE_LOWEST,
                                                opacity: pressed ? 0.7 : 1,
                                            })}
                                        >
                                            <Text
                                                style={{
                                                    fontFamily: SANS_MEDIUM,
                                                    fontSize: 11.5,
                                                    color: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE,
                                                    fontWeight: active ? '700' : '500',
                                                }}
                                            >
                                                {label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </XStack>
                            <TextInput
                                value={customDurationValue}
                                onChangeText={(text) => {
                                    const clean = text.replace(/[^0-9]/g, '');
                                    setCustomDurationValue(clean);
                                    const num = parseInt(clean, 10);
                                    if (!Number.isNaN(num) && num > 0) {
                                        const hrs =
                                            customDurationUnit === 'minutes' ? num / 60 :
                                                customDurationUnit === 'hours' ? num :
                                                    num * 24;
                                        if (hrs <= 365 * 24) setDurationHours(hrs);
                                    }
                                }}
                                keyboardType="number-pad"
                                placeholder={`Nhập số ${customDurationUnit === 'minutes' ? 'phút' : customDurationUnit === 'hours' ? 'giờ' : 'ngày'}`}
                                placeholderTextColor={palette.EHR_OUTLINE}
                                style={{
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    borderRadius: 10,
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                    fontFamily: SANS,
                                    fontSize: 13,
                                    color: palette.EHR_ON_SURFACE,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                }}
                            />
                            <Text style={{ fontFamily: SANS, fontSize: 10.5, color: palette.EHR_TEXT_MUTED }}>
                                Contract làm tròn lên 1 giờ tối thiểu. Lựa chọn dưới 1 giờ chỉ phục vụ test UI.
                            </Text>
                        </YStack>
                    ) : null}

                    {durationHours === 0 ? (
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, marginBottom: 14, lineHeight: 16 }}>
                            "Mặc định" = {selectedType === 1 ? '365 ngày' : '30 ngày'}. Bệnh nhân có thể thu hồi bất kỳ lúc nào.
                        </Text>
                    ) : <View style={{ height: 6 }} />}

                    {/* Reason */}
                    <FieldLabel>Lý do (tuỳ chọn)</FieldLabel>
                    <TextInput
                        value={reason}
                        onChangeText={setReason}
                        placeholder="VD: Khám định kỳ tháng 5..."
                        placeholderTextColor={palette.EHR_OUTLINE}
                        multiline
                        textAlignVertical="top"
                        style={{
                            minHeight: 90,
                            borderWidth: 0.75,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            borderRadius: 12,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            color: palette.EHR_ON_SURFACE,
                            fontFamily: SANS,
                            fontSize: 14,
                            marginBottom: 22,
                        }}
                    />

                    <ViButton
                        variant="cinnabar"
                        full
                        size="lg"
                        loading={isSubmitting}
                        onPress={handleSubmit}
                        leftIcon={isSubmitting ? undefined : <Send size={16} color="#FAF7F1" />}
                    >
                        {isSubmitting ? 'Đang gửi…' : 'Gửi yêu cầu truy cập'}
                    </ViButton>
                </ScrollView>
            </KeyboardAvoidingView>

            <QrAddressScanner
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScanned={(addr) => {
                    setPatientAddress(addr.toLowerCase());
                    setScannerOpen(false);
                }}
            />
            <QrAddressScanner
                visible={cidScannerOpen}
                onClose={() => setCidScannerOpen(false)}
                mode="cidHash"
                title="Quét mã CID"
                subtitle="Hướng camera vào QR mã CID hồ sơ"
                onScanned={(cid) => {
                    setCidHash(cid.toLowerCase());
                    setCidScannerOpen(false);
                }}
            />
        </SafeAreaView>
    );
}

function FieldLabel({ children, error }: { children: React.ReactNode; error?: boolean }) {
    const palette = useEhrPalette();
    return (
        <Text
            style={{
                fontFamily: SANS_SEMI,
                fontSize: 11.5,
                color: error ? palette.EHR_DANGER : palette.EHR_OUTLINE,
                marginBottom: 8,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                fontWeight: '600',
            }}
        >
            {children}
        </Text>
    );
}
