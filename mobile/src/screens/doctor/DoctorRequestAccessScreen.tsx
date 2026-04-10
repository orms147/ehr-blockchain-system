import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, User, FileText, AlertCircle, CheckCircle, QrCode } from 'lucide-react-native';
import { YStack, XStack, Text, Button, Input, TextArea, View } from 'tamagui';

import api from '../../services/api';
import walletActionService from '../../services/walletAction.service';
import { createPublicClient, http, parseEventLogs, parseGwei } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import QrAddressScanner from '../../components/QrAddressScanner';

const EHR_SYSTEM_ADDRESS = process.env.EXPO_PUBLIC_EHR_SYSTEM_ADDRESS as `0x${string}`;
const ARBITRUM_RPC = 'https://sepolia-rollup.arbitrum.io/rpc';

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
    transport: http(ARBITRUM_RPC),
});
import {
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE_LOW,
} from '../../constants/uiColors';

// Must match EHRSystemSecure.RequestType enum:
//   0 = DirectAccess:      includeUpdates=true, allowDelegate=false
//   1 = FullDelegation:    bulk delegate ALL patient records
//   2 = RecordDelegation:  includeUpdates=true, allowDelegate=true (per-record)
const REQUEST_TYPES = [
    { value: 0, label: 'Đọc & cập nhật', description: 'Xem hồ sơ + xem bản cập nhật mới. Không chia sẻ lại.' },
    { value: 2, label: 'Đọc & ủy quyền lại', description: 'Xem hồ sơ + có thể chia sẻ cho bác sĩ khác.' },
    { value: 1, label: 'Ủy quyền toàn bộ', description: 'Quyền truy cập mọi hồ sơ. Dùng cho người giám hộ.' },
];

export default function DoctorRequestAccessScreen() {
    const [patientAddress, setPatientAddress] = useState('');
    const [cidHash, setCidHash] = useState('');
    const [selectedType, setSelectedType] = useState(0);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [cidScannerOpen, setCidScannerOpen] = useState(false);
    // Duration is stored as HOURS (fractional for test chips < 1h). 0 = contract default
    // (30 days for DirectAccess, 365 days for FullDelegation).
    const [durationHours, setDurationHours] = useState<number>(0);
    const [customDurationOpen, setCustomDurationOpen] = useState(false);
    const [customDurationValue, setCustomDurationValue] = useState('');
    const [customDurationUnit, setCustomDurationUnit] = useState<'minutes' | 'hours' | 'days'>('days');

    const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

    const handleSubmit = async () => {
        if (!patientAddress.trim()) {
            Alert.alert('Thiếu thông tin', 'Vui lòng nhập địa chỉ ví bệnh nhân.');
            return;
        }
        if (!isValidAddress(patientAddress.trim())) {
            Alert.alert('Địa chỉ không hợp lệ', 'Địa chỉ ví phải bắt đầu bằng 0x và có 42 ký tự.');
            return;
        }

        setIsSubmitting(true);
        try {
            const normalizedCidHash = (cidHash.trim() || `0x${'0'.repeat(64)}`) as `0x${string}`;
            const targetPatient = patientAddress.trim().toLowerCase() as `0x${string}`;
            const zeroHash = `0x${'0'.repeat(64)}` as `0x${string}`;

            // 1. ON-CHAIN: doctor calls EHRSystemSecure.requestAccess directly (no relayer for now).
            //    Backend was previously only writing to DB — that left chain empty and made
            //    later patient ConfirmRequest sign useless.
            const { walletClient } = await walletActionService.getWalletContext();
            // Smart contract requires uint40 hours, minimum 1.
            // For < 1h test chips we floor to 1 on-chain but keep DB deadline at the test value.
            const onChainHours = Math.max(1, Math.ceil(durationHours));
            const consentDurationHours = BigInt(onChainHours);
            const validForHours = BigInt(24); // patient has 24h to approve

            const txHash = await walletClient.writeContract({
                address: EHR_SYSTEM_ADDRESS,
                abi: REQUEST_ACCESS_ABI,
                functionName: 'requestAccess',
                args: [
                    targetPatient,
                    normalizedCidHash,
                    selectedType,
                    zeroHash, // encKeyHash unknown at request time; doctor doesn't have AES key yet
                    consentDurationHours,
                    validForHours,
                ],
                gas: BigInt(400000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });

            // 2. Wait for receipt and extract reqId from AccessRequested event.
            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            const events = parseEventLogs({
                abi: REQUEST_ACCESS_ABI,
                eventName: 'AccessRequested',
                logs: receipt.logs,
            });
            const onChainReqId = (events[0] as any)?.args?.reqId as string | undefined;
            if (!onChainReqId) {
                throw new Error('Không đọc được reqId từ tx log. Hồ sơ vẫn đã được tạo on-chain — hãy thử lại.');
            }

            // 3. Notify backend to mirror the on-chain request for UI/notifications.
            await api.post('/api/requests/create', {
                patientAddress: targetPatient,
                cidHash: normalizedCidHash,
                requestType: selectedType,
                // Both fields: backend uses durationHours when present (allows < 1 day),
                // and falls back to durationDays for old clients.
                durationDays: Math.max(1, Math.ceil(durationHours / 24)),
                durationHours,
                txHash,
                onChainReqId,
            });

            setIsSuccess(true);
            setPatientAddress('');
            setCidHash('');
            setSelectedType(0);
            setReason('');
        } catch (error: any) {
            Alert.alert('Lỗi', error?.message || 'Không thể gửi yêu cầu. Vui lòng thử lại.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAF3' }} edges={['right', 'left']}>
                <YStack style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <View background="$green3" style={{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                        <CheckCircle size={40} color="#16A34A" />
                    </View>
                    <Text fontSize="$6" fontWeight="700" color="$color12" style={{ marginBottom: 8, textAlign: 'center' }}>
                        Đã gửi yêu cầu
                    </Text>
                    <Text fontSize="$4" color="$color11" style={{ textAlign: 'center', lineHeight: 22 }}>
                        Yêu cầu truy cập đã được gửi tới bệnh nhân.
                    </Text>
                    <Pressable onPress={() => setIsSuccess(false)} style={{ marginTop: 20 }}>
                        <View
                            style={{
                                backgroundColor: EHR_PRIMARY,
                                borderRadius: 14,
                                paddingVertical: 14,
                                paddingHorizontal: 24,
                                alignItems: 'center',
                            }}
                        >
                            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Tạo yêu cầu mới</Text>
                        </View>
                    </Pressable>
                </YStack>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAF3' }} edges={['right', 'left']}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
                    <View background="$color2" borderColor="$color4" style={{ borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 20 }}>
                        <XStack style={{ alignItems: 'flex-start' }}>
                            <AlertCircle size={18} color="#475569" />
                            <Text fontSize="$3" color="$color11" style={{ flex: 1, marginLeft: 10, lineHeight: 20 }}>
                                Gửi yêu cầu để truy cập hồ sơ bệnh nhân. Bệnh nhân sẽ nhận thông báo và phê duyệt hoặc từ chối.
                            </Text>
                        </XStack>
                    </View>

                    <YStack style={{ marginBottom: 16 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>
                            Địa chỉ ví bệnh nhân <Text color="$red10">*</Text>
                        </Text>
                        <XStack
                            background="$background"
                            borderColor={patientAddress.length > 0 && !isValidAddress(patientAddress) ? '$red8' : '$borderColor'}
                            style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center' }}
                        >
                            <User size={16} color="#64748B" />
                            <Input
                                flex={1}
                                unstyled
                                fontSize="$4"
                                color="$color12"
                                placeholder="0x..."
                                value={patientAddress}
                                onChangeText={setPatientAddress}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={{ paddingVertical: 12, paddingHorizontal: 12 }}
                            />
                            <Pressable onPress={() => setScannerOpen(true)} style={{ padding: 6 }}>
                                <QrCode size={20} color="#55624D" />
                            </Pressable>
                        </XStack>
                        <Text fontSize="$2" color="$color10" style={{ marginTop: 6, marginLeft: 4 }}>
                            Mẹo: bấm biểu tượng QR để quét mã từ điện thoại bệnh nhân.
                        </Text>
                        {patientAddress.length > 0 && !isValidAddress(patientAddress) ? (
                            <Text fontSize="$2" color="$red10" style={{ marginTop: 6, marginLeft: 4 }}>
                                Địa chỉ không hợp lệ
                            </Text>
                        ) : null}
                    </YStack>

                    <YStack style={{ marginBottom: 16 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>
                            CID Hash {selectedType === 1 ? '(không dùng cho ủy quyền toàn bộ)' : '(tuỳ chọn)'}
                        </Text>
                        <XStack background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center' }}>
                            <FileText size={16} color="#64748B" />
                            <Input
                                flex={1}
                                unstyled
                                fontSize="$4"
                                color="$color12"
                                placeholder="Nhập CID nếu yêu cầu"
                                value={cidHash}
                                onChangeText={setCidHash}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={{ paddingVertical: 12, paddingHorizontal: 12 }}
                            />
                            <Pressable onPress={() => setCidScannerOpen(true)} style={{ padding: 6 }}>
                                <QrCode size={20} color="#55624D" />
                            </Pressable>
                        </XStack>
                        <Text fontSize="$2" color="$color10" style={{ marginTop: 6, marginLeft: 4 }}>
                            Mẹo: bấm QR để quét mã CID hồ sơ trên màn hình bệnh nhân.
                        </Text>
                    </YStack>

                    <YStack style={{ marginBottom: 16 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>Loại yêu cầu</Text>
                        <XStack style={{ gap: 10 }}>
                            {REQUEST_TYPES.map((type) => {
                                const isActive = selectedType === type.value;
                                return (
                                    <Pressable
                                        key={type.value}
                                        onPress={() => setSelectedType(type.value)}
                                        style={{
                                            flex: 1,
                                            borderWidth: 1,
                                            borderRadius: 10,
                                            padding: 12,
                                            backgroundColor: isActive ? '#e6fffb' : '#ffffff',
                                            borderColor: isActive ? '#5eead4' : '#e2e8f0',
                                        }}
                                    >
                                        <Text fontSize="$4" fontWeight="700" color={isActive ? '$teal11' : '$color12'}>
                                            {type.label}
                                        </Text>
                                        <Text fontSize="$2" color={isActive ? '$teal10' : '$color9'} style={{ marginTop: 4 }}>
                                            {type.description}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </XStack>
                    </YStack>

                    <YStack style={{ marginBottom: 16 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>
                            Thời hạn truy cập
                        </Text>
                        <XStack style={{ flexWrap: 'wrap', gap: 8 }}>
                            {[
                                { label: 'Mặc định', hours: 0 },
                                { label: '5 phút (test)', hours: 5 / 60 },
                                { label: '10 phút (test)', hours: 10 / 60 },
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
                                    >
                                        <View
                                            style={{
                                                paddingHorizontal: 12,
                                                paddingVertical: 6,
                                                borderRadius: 20,
                                                borderWidth: 1,
                                                borderColor: active ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                                                backgroundColor: active ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW,
                                            }}
                                        >
                                            <Text
                                                fontSize={13}
                                                fontWeight={active ? '700' : '500'}
                                                style={{ color: active ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}
                                            >
                                                {opt.label}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                            <Pressable onPress={() => setCustomDurationOpen(true)}>
                                <View
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 6,
                                        borderRadius: 20,
                                        borderWidth: 1,
                                        borderColor: customDurationOpen ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                                        backgroundColor: customDurationOpen ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW,
                                    }}
                                >
                                    <Text
                                        fontSize={13}
                                        fontWeight={customDurationOpen ? '700' : '500'}
                                        style={{ color: customDurationOpen ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}
                                    >
                                        Tuỳ chỉnh
                                    </Text>
                                </View>
                            </Pressable>
                        </XStack>
                        {customDurationOpen ? (
                            <YStack style={{ marginTop: 10, gap: 8 }}>
                                <XStack style={{ gap: 6 }}>
                                    {(['minutes', 'hours', 'days'] as const).map((u) => {
                                        const active = customDurationUnit === u;
                                        const label = u === 'minutes' ? 'Phút' : u === 'hours' ? 'Giờ' : 'Ngày';
                                        return (
                                            <Pressable key={u} onPress={() => setCustomDurationUnit(u)}>
                                                <View style={{
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 4,
                                                    borderRadius: 999,
                                                    borderWidth: 1,
                                                    borderColor: active ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                                                    backgroundColor: active ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW,
                                                }}>
                                                    <Text fontSize={12} fontWeight={active ? '700' : '500'} style={{ color: active ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}>{label}</Text>
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </XStack>
                                <XStack style={{ gap: 8, alignItems: 'center' }}>
                                    <Input
                                        flex={1}
                                        fontSize="$4"
                                        color="$color12"
                                        placeholder={`Nhập số ${customDurationUnit === 'minutes' ? 'phút' : customDurationUnit === 'hours' ? 'giờ' : 'ngày'}`}
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
                                        borderColor="$borderColor"
                                    />
                                </XStack>
                                <Text fontSize="$2" color="$color10">
                                    Smart contract làm tròn lên 1 giờ tối thiểu. Các lựa chọn dưới 1 giờ chỉ phục vụ test UI.
                                </Text>
                            </YStack>
                        ) : null}
                        {durationHours === 0 ? (
                            <Text fontSize="$2" color="$color10" style={{ marginTop: 8 }}>
                                "Mặc định" = {selectedType === 1 ? '365 ngày (ủy quyền toàn bộ)' : '30 ngày (truy cập hồ sơ)'}. Bệnh nhân có thể thu hồi bất kỳ lúc nào.
                            </Text>
                        ) : null}
                    </YStack>

                    <YStack style={{ marginBottom: 24 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>Lý do (tuỳ chọn)</Text>
                        <TextArea
                            borderColor="$borderColor"
                            background="$background"
                            color="$color12"
                            placeholder="VD: Khám định kỳ..."
                            value={reason}
                            onChangeText={setReason}
                            numberOfLines={4}
                            style={{ minHeight: 100 }}
                        />
                    </YStack>

                    <Pressable onPress={isSubmitting ? undefined : handleSubmit}>
                        <View
                            style={{
                                backgroundColor: EHR_PRIMARY,
                                borderRadius: 14,
                                paddingVertical: 16,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                opacity: isSubmitting ? 0.7 : 1,
                            }}
                        >
                            {isSubmitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
                            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
                                {isSubmitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu truy cập'}
                            </Text>
                        </View>
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>

            <QrAddressScanner
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScanned={(addr) => setPatientAddress(addr.toLowerCase())}
            />
            <QrAddressScanner
                visible={cidScannerOpen}
                onClose={() => setCidScannerOpen(false)}
                mode="cidHash"
                title="Quét mã CID"
                subtitle="Hướng camera vào QR mã CID hồ sơ"
                onScanned={(cid) => setCidHash(cid.toLowerCase())}
            />
        </SafeAreaView>
    );
}













