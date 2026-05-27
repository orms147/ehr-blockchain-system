// DoctorRequestAccessScreen v3 — text-rhythm editorial form per
// viehp-doctor-forms-v2.html §1 + spec Q5.
//
// Layout:
//   PageHeader (eyebrow + title + subtitle)
//   SectionLabel "Bệnh nhân" · bắt buộc
//     HexRow (wallet address input with QR scan)
//     PatientIdentityInline minimal (name · gender · age · ViEH ID — NO CCCD)
//   SectionLabel "Hồ sơ cụ thể" trailing "Để trống = toàn bộ hồ sơ"
//     HexRow (CID input — disabled when scope=full)
//   SectionLabel "Loại quyền"
//     3 PickerRow (rw / rsh / full)
//   SectionLabel "Thời hạn truy cập" trailing "Theo chuẩn pháp lý y tế"
//     5 TimePresetRow (24h / 7d / 30d / 90d / custom) + custom input
//   Editorial note about 17s pre-approve
//   Reason textarea
//   StickyFooter: "Ký và gửi yêu cầu" (ink) · "Nháp" (ghost) · hint about gas
//
// ALL on-chain business logic preserved bit-for-bit from previous version:
//   - 3 request types: DirectAccess(0) / FullDelegation(1) / RecordDelegation(2)
//   - Wallet pre-check (no self-request) + isPatient role check on-chain
//   - CID requirements per type (zero hash for FullDelegation, required else)
//   - biometric gateOrThrow before writeContract
//   - 17s auto-confirmAccessRequest as requester (Step B pre-pay)
//   - POST /api/requests/create mirror to DB

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { CheckCircle, QrCode } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';
import { createPublicClient, http, parseEventLogs, parseGwei } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

import api from '../../services/api';
import walletActionService from '../../services/walletAction.service';
import { withRpcRetry, formatChainError } from '../../utils/rpcRetry';
import { gateOrThrow } from '../../utils/biometricGate';
import QrAddressScanner from '../../components/QrAddressScanner';
import PatientIdentityInline from '../../components/PatientIdentityInline';
import { useEhrPalette } from '../../constants/uiColors';
import {
    PageHeader,
    SectionLabel,
    PickerRow,
    TimePresetRow,
    StickyFooter,
    FormShell,
} from '../../components-v2/FormPrimitives';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

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

// Scope mapping: spec id → on-chain reqType uint8
type ScopeId = 'rw' | 'rsh' | 'full';
const SCOPE_OPTS: { id: ScopeId; reqType: number; name: string; sub: string; allow: string; deny: string | null }[] = [
    {
        id: 'rw',
        reqType: 0,
        name: 'Đọc và cập nhật hồ sơ',
        sub: 'Xem nội dung và ghi phiên bản mới khi bệnh nhân tái khám.',
        allow: 'đọc · ghi mới',
        deny: 'uỷ quyền tiếp',
    },
    {
        id: 'rsh',
        reqType: 2,
        name: 'Đọc và chia sẻ lại',
        sub: 'Cho phép chia sẻ cho đồng nghiệp cùng hội chẩn.',
        allow: 'đọc · chia sẻ lại',
        deny: 'ghi phiên bản mới',
    },
    {
        id: 'full',
        reqType: 1,
        name: 'Uỷ quyền toàn bộ hồ sơ',
        sub: 'Mọi hồ sơ hiện có và sắp tới. Chỉ dùng với bác sĩ điều trị chính.',
        allow: 'mọi quyền',
        deny: null,
    },
];

type TimePresetId = '24h' | '7d' | '30d' | '90d' | 'custom';
const TIME_PRESETS: { id: TimePresetId; label: string; sub: string; hours: number | null }[] = [
    { id: '24h', label: '24 giờ', sub: 'Khẩn cấp · 1 ca', hours: 24 },
    { id: '7d', label: '7 ngày', sub: 'Khám đợt · 1 lần', hours: 7 * 24 },
    { id: '30d', label: '30 ngày', sub: 'Theo dõi · 1 tháng', hours: 30 * 24 },
    { id: '90d', label: '90 ngày', sub: 'Bệnh mạn tính · 1 quý', hours: 90 * 24 },
    { id: 'custom', label: 'Tuỳ chỉnh', sub: 'Nhập số ngày', hours: null },
];

const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);
const isValidCidHash = (h: string) => /^0x[a-fA-F0-9]{64}$/.test(h);

export default function DoctorRequestAccessScreen() {
    const palette = useEhrPalette();
    const route = useRoute<any>();

    const [patientAddress, setPatientAddress] = useState('');
    const [cidHash, setCidHash] = useState('');

    // Pre-fill từ "Yêu cầu lại" của DoctorExpiredRecords (route params).
    // Tab cũng được điều hướng thường (không có params) — chỉ apply khi có.
    useEffect(() => {
        const paramAddr = route.params?.patientAddress;
        const paramCid = route.params?.cidHash;
        if (paramAddr && typeof paramAddr === 'string') {
            setPatientAddress(paramAddr);
        }
        if (paramCid && typeof paramCid === 'string') {
            setCidHash(paramCid);
        }
    }, [route.params?.patientAddress, route.params?.cidHash]);
    const [scope, setScope] = useState<ScopeId>('rw');
    const [tp, setTp] = useState<TimePresetId>('7d');
    const [customDays, setCustomDays] = useState('');
    const [reason, setReason] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [cidScannerOpen, setCidScannerOpen] = useState(false);

    const selectedScope = useMemo(
        () => SCOPE_OPTS.find((s) => s.id === scope) || SCOPE_OPTS[0],
        [scope],
    );
    const selectedReqType = selectedScope.reqType;

    const durationHours = useMemo(() => {
        const preset = TIME_PRESETS.find((p) => p.id === tp);
        if (preset?.hours != null) return preset.hours;
        const n = parseInt(customDays.replace(/[^0-9]/g, ''), 10);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return Math.min(n, 365) * 24;
    }, [tp, customDays]);

    const addressLooksValid = patientAddress.length === 0 || isValidAddress(patientAddress.trim());
    const cidLooksValid = selectedReqType === 1 || cidHash.length === 0 || isValidCidHash(cidHash.trim());

    const canSubmit =
        isValidAddress(patientAddress.trim()) &&
        (selectedReqType === 1 || isValidCidHash(cidHash.trim())) &&
        durationHours > 0 &&
        !isSubmitting;

    const handleSubmit = async () => {
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
        if (selectedReqType !== 1 && !isValidCidHash(trimmedCid)) {
            Alert.alert('Mã hồ sơ không hợp lệ', 'Vui lòng nhập đúng định dạng mã hồ sơ.');
            return;
        }

        if (durationHours <= 0) {
            Alert.alert('Thời hạn không hợp lệ', 'Vui lòng chọn hoặc nhập thời hạn truy cập.');
            return;
        }

        setIsSubmitting(true);
        try {
            const zeroHash = `0x${'0'.repeat(64)}` as `0x${string}`;
            const normalizedCidHash = (selectedReqType === 1 ? zeroHash : trimmedCid) as `0x${string}`;
            const targetPatient = patientAddress.trim().toLowerCase() as `0x${string}`;

            const { walletClient } = await walletActionService.getWalletContext();
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
                    selectedReqType,
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
                requestType: selectedReqType,
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
            setScope('rw');
            setTp('7d');
            setCustomDays('');
            setReason('');
        } catch (error: any) {
            // Dump ALL useful error fields in 1 log so LogBox/Alert dễ đọc
            const dump = {
                name: error?.name,
                message: error?.message,
                shortMessage: error?.shortMessage,
                code: error?.code,
                details: error?.details,
                metaMessages: error?.metaMessages,
                cause: error?.cause?.message || String(error?.cause),
                stack: error?.stack?.split('\n').slice(0, 3).join(' | '),
            };
            console.error('[DoctorRequestAccess] FULL DUMP:', JSON.stringify(dump, null, 2));
            const msg = formatChainError(error, 'Không thể gửi yêu cầu. Vui lòng thử lại.');
            Alert.alert(
                'Lỗi',
                `${msg}\n\n— DEBUG —\n${error?.shortMessage || error?.message || JSON.stringify(dump).slice(0, 200)}`,
            );
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
                    <Pressable
                        onPress={() => setIsSuccess(false)}
                        style={({ pressed }) => ({
                            marginTop: 24,
                            paddingVertical: 14,
                            paddingHorizontal: 28,
                            backgroundColor: palette.EHR_ON_SURFACE,
                            borderRadius: 12,
                            opacity: pressed ? 0.85 : 1,
                        })}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 14,
                                color: palette.EHR_SURFACE,
                                fontWeight: '700',
                            }}
                        >
                            Tạo yêu cầu mới
                        </Text>
                    </Pressable>
                </YStack>
            </SafeAreaView>
        );
    }

    const footer = (
        <StickyFooter
            primary="Ký và gửi yêu cầu"
            hint="Yêu cầu được ghi nhận vĩnh viễn · bạn trả phí · tự duyệt sau 17 giây"
            primaryLoading={isSubmitting}
            primaryDisabled={!canSubmit}
            onPrimary={handleSubmit}
        />
    );

    return (
        <FormShell footer={footer}>
            <PageHeader
                eyebrow="Truy cập hồ sơ bệnh nhân"
                title="Gửi yêu cầu xem hồ sơ"
                subtitle="Bệnh nhân nhận thông báo và ký xác nhận từ phía họ. Bạn không tự cấp quyền cho mình được."
            />

            {/* PATIENT */}
            <SectionLabel required>Bệnh nhân</SectionLabel>
            <HexInputRow
                value={patientAddress}
                onChangeText={setPatientAddress}
                placeholder="0x… địa chỉ ví bệnh nhân"
                invalid={!addressLooksValid}
                onQrPress={() => setScannerOpen(true)}
            />
            {isValidAddress(patientAddress.trim()) ? (
                <View style={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 10 }}>
                    <PatientIdentityInline
                        address={patientAddress.trim().toLowerCase()}
                        detailLevel="minimal"
                    />
                </View>
            ) : null}

            {/* CID */}
            <SectionLabel trailing={selectedReqType === 1 ? 'Không cần cho uỷ quyền toàn bộ' : 'Để trống = toàn bộ chuỗi'}>
                Hồ sơ cụ thể
            </SectionLabel>
            <HexInputRow
                value={selectedReqType === 1 ? '' : cidHash}
                onChangeText={setCidHash}
                placeholder="Quét QR hoặc dán mã hồ sơ"
                invalid={!cidLooksValid}
                disabled={selectedReqType === 1}
                onQrPress={() => setCidScannerOpen(true)}
                mono
            />

            {/* SCOPE */}
            <SectionLabel>Loại quyền</SectionLabel>
            {SCOPE_OPTS.map((o, i) => (
                <PickerRow
                    key={o.id}
                    name={o.name}
                    sub={o.sub}
                    allow={o.allow}
                    deny={o.deny}
                    selected={scope === o.id}
                    last={i === SCOPE_OPTS.length - 1}
                    onPress={() => setScope(o.id)}
                />
            ))}

            {/* TIME */}
            <SectionLabel trailing="Theo chuẩn pháp lý y tế">Thời hạn truy cập</SectionLabel>
            {TIME_PRESETS.map((p, i) => (
                <TimePresetRow
                    key={p.id}
                    label={p.label}
                    sub={p.sub}
                    selected={tp === p.id}
                    last={i === TIME_PRESETS.length - 1}
                    onPress={() => setTp(p.id)}
                />
            ))}
            {tp === 'custom' ? (
                <View style={{ paddingHorizontal: 22, paddingTop: 10, paddingBottom: 6 }}>
                    <TextInput
                        value={customDays}
                        onChangeText={(t) => setCustomDays(t.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        placeholder="Nhập số ngày (1–365)"
                        placeholderTextColor={palette.EHR_TEXT_MUTED}
                        style={{
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            borderRadius: 10,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            fontFamily: MONO,
                            fontSize: 14,
                            color: palette.EHR_ON_SURFACE,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                        }}
                    />
                </View>
            ) : null}

            {/* Editorial note */}
            <View
                style={{
                    paddingHorizontal: 22,
                    paddingTop: 14,
                    paddingBottom: 18,
                    flexDirection: 'row',
                    gap: 9,
                }}
            >
                <View
                    style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: palette.EHR_CINNABAR_DEEP,
                        marginTop: 6,
                    }}
                />
                <Text
                    style={{
                        flex: 1,
                        fontFamily: SANS,
                        fontSize: 12,
                        color: palette.EHR_TEXT_MUTED,
                        lineHeight: 19,
                    }}
                >
                    Trong giai đoạn thử nghiệm, yêu cầu tự động pre-approve sau 17 giây nếu bệnh nhân không thao tác. Sẽ tắt khi triển khai chính thức.
                </Text>
            </View>

            {/* REASON (optional) */}
            <SectionLabel>Lý do (tuỳ chọn)</SectionLabel>
            <View style={{ paddingHorizontal: 22, paddingBottom: 22 }}>
                <TextInput
                    value={reason}
                    onChangeText={setReason}
                    placeholder="VD: Khám định kỳ tháng 5…"
                    placeholderTextColor={palette.EHR_TEXT_MUTED}
                    multiline
                    textAlignVertical="top"
                    style={{
                        minHeight: 80,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_SOFT,
                        borderRadius: 10,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                        color: palette.EHR_ON_SURFACE,
                        fontFamily: SANS,
                        fontSize: 14,
                    }}
                />
            </View>

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
                title="Quét mã hồ sơ"
                subtitle="Hướng camera vào QR mã hồ sơ"
                onScanned={(cid) => {
                    setCidHash(cid.toLowerCase());
                    setCidScannerOpen(false);
                }}
            />
        </FormShell>
    );
}

// HexInputRow — TextInput shaped like the design's HexRow (mono, larger touch
// target, QR button on right). Inline because it carries the input handlers;
// pure-display HexRow is in components/HexRow.tsx.
function HexInputRow({
    value,
    onChangeText,
    placeholder,
    invalid,
    disabled,
    onQrPress,
    mono = true,
}: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    invalid?: boolean;
    disabled?: boolean;
    onQrPress?: () => void;
    mono?: boolean;
}) {
    const palette = useEhrPalette();
    const borderColor = invalid
        ? palette.EHR_DANGER
        : palette.EHR_OUTLINE_SOFT;
    return (
        <View style={{ paddingHorizontal: 22, paddingBottom: 4 }}>
            <View
                style={{
                    minHeight: 52,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                    borderWidth: 0.5,
                    borderColor,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    opacity: disabled ? 0.5 : 1,
                }}
            >
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={palette.EHR_TEXT_MUTED}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!disabled}
                    style={{
                        flex: 1,
                        paddingVertical: 4,
                        color: palette.EHR_ON_SURFACE,
                        fontFamily: mono ? MONO : SANS,
                        fontSize: 13.5,
                        letterSpacing: mono ? 0.2 : 0,
                        fontWeight: '500',
                    }}
                />
                {onQrPress ? (
                    <Pressable onPress={disabled ? undefined : onQrPress} hitSlop={8} disabled={disabled}>
                        <QrCode size={20} color={palette.EHR_ON_SURFACE} />
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}
