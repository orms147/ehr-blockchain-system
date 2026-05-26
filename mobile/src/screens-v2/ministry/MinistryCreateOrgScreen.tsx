// MinistryCreateOrgScreen — Wave D per viehp-ministry-org-actions §1.1.
//
// Ministry tạo tổ chức y tế mới on-chain. Flow:
//   1. Nhập tên + 2 wallet address (primary + backup admin)
//   2. Validate: tên ≥ 2 char, 2 ví đều hợp lệ + khác nhau
//   3. Sticky footer "Phát giao dịch" enabled khi đủ điều kiện
//   4. Submit → biometric → writeContract createOrganization → wait receipt
//   5. Parse OrganizationCreated event → extract orgId
//   6. POST /api/admin/confirm-org-creation để sync DB
//   7. Alert success → navigation.goBack()
//
// Per design: no license upload step (thesis demo). Backend schema đã loosen
// licenseCid optional. Production should add upload step.

import React, { useMemo, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { createPublicClient, http, parseEventLogs, parseGwei } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

import orgService from '../../services/org.service';
import walletActionService from '../../services/walletAction.service';
import { gateOrThrow } from '../../utils/biometricGate';
import { ACCESS_CONTROL_ABI } from '../../abi/contractABI';
import { useEhrPalette } from '../../constants/uiColors';
import useAuthStore from '../../store/authStore';
import {
    PageHeader,
    SectionLabel,
    StickyFooter,
    FormShell,
} from '../../components-v2/FormPrimitives';

const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

const ACCESS_CONTROL_ADDRESS = process.env.EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS as `0x${string}`;
const ARBITRUM_RPC = process.env.EXPO_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(ARBITRUM_RPC, { retryCount: 0 }),
});

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const isValidAddress = (a: string) => {
    const trimmed = a.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return false;
    if (trimmed.toLowerCase() === ZERO_ADDRESS) return false;
    return true;
};

export default function MinistryCreateOrgScreen({ navigation }: any) {
    const palette = useEhrPalette();
    const { user } = useAuthStore();
    const ministryAddr = (user?.walletAddress || '').toLowerCase();

    const [name, setName] = useState('');
    const [primaryAdmin, setPrimaryAdmin] = useState('');
    const [backupAdmin, setBackupAdmin] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const primaryValid = primaryAdmin.length === 0 || isValidAddress(primaryAdmin);
    const backupValid = backupAdmin.length === 0 || isValidAddress(backupAdmin);
    const walletsDifferent = primaryAdmin.trim().toLowerCase() !== backupAdmin.trim().toLowerCase();
    // Audit P1 — Ministry không được tự đặt mình làm admin org mới (vai trò xung đột:
    // Ministry là governance layer, không phải vận hành cơ sở). Same với backup wallet.
    const primaryIsMinistry = ministryAddr && primaryAdmin.trim().toLowerCase() === ministryAddr;
    const backupIsMinistry = ministryAddr && backupAdmin.trim().toLowerCase() === ministryAddr;

    const canSubmit = useMemo(() => {
        return (
            name.trim().length >= 2 &&
            isValidAddress(primaryAdmin) &&
            isValidAddress(backupAdmin) &&
            walletsDifferent &&
            !primaryIsMinistry &&
            !backupIsMinistry &&
            !isSubmitting
        );
    }, [name, primaryAdmin, backupAdmin, walletsDifferent, primaryIsMinistry, backupIsMinistry, isSubmitting]);

    const footerHint = useMemo(() => {
        if (isSubmitting) return 'Đừng đóng app · chờ 8–14 giây';
        if (!name.trim()) return 'Cần điền tên cơ sở và 2 ví quản trị';
        if (primaryAdmin.trim().toLowerCase() === ZERO_ADDRESS) return 'Ví chính không thể là 0x000…';
        if (!isValidAddress(primaryAdmin)) return 'Ví quản trị chính chưa hợp lệ';
        if (backupAdmin.trim().toLowerCase() === ZERO_ADDRESS) return 'Ví dự phòng không thể là 0x000…';
        if (!isValidAddress(backupAdmin)) return 'Ví dự phòng chưa hợp lệ';
        if (!walletsDifferent) return 'Hai ví phải khác nhau';
        if (primaryIsMinistry) return 'Bạn (Ministry) không thể tự làm admin cơ sở mới';
        if (backupIsMinistry) return 'Ví dự phòng không thể là chính ví Ministry';
        return 'Ký bằng FaceID · gas trả từ ví Ministry';
    }, [isSubmitting, name, primaryAdmin, backupAdmin, walletsDifferent, primaryIsMinistry, backupIsMinistry]);

    const handleSubmit = async () => {
        if (!canSubmit) return;
        if (!ACCESS_CONTROL_ADDRESS) {
            Alert.alert('Thiếu cấu hình', 'EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS chưa được đặt.');
            return;
        }

        setIsSubmitting(true);
        try {
            const { walletClient, account } = await walletActionService.getWalletContext();
            await gateOrThrow('Xác thực để tạo tổ chức y tế mới');

            const trimmedName = name.trim();
            const primary = primaryAdmin.trim().toLowerCase() as `0x${string}`;
            const backup = backupAdmin.trim().toLowerCase() as `0x${string}`;

            const txHash = await walletClient.writeContract({
                account,
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'createOrganization',
                args: [trimmedName, primary, backup],
                gas: BigInt(500000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
            const events = parseEventLogs({
                abi: ACCESS_CONTROL_ABI,
                eventName: 'OrganizationCreated',
                logs: receipt.logs,
            });
            const orgId = (events[0] as any)?.args?.orgId;
            if (orgId == null) {
                Alert.alert(
                    'Tx confirmed but event missing',
                    'Tx đã ghi on-chain nhưng không parse được OrganizationCreated event. Vui lòng kiểm tra trên Arbiscan.',
                );
                return;
            }

            await orgService.confirmOrgCreation({
                orgId,
                name: trimmedName,
                primaryAdmin: primary,
                backupAdmin: backup,
                txHash,
            });

            Alert.alert(
                'Đã tạo cơ sở',
                `Cơ sở "${trimmedName}" đã được ghi on-chain (orgId: ${String(orgId)}). Cả 2 admin wallet đã có quyền quản trị.`,
                [{ text: 'OK', onPress: () => navigation?.goBack?.() }],
            );
        } catch (error: any) {
            const msg = String(error?.message || '');
            if (msg.includes('NotMinistry')) {
                Alert.alert('Không có quyền on-chain', 'Ví này không phải Ministry.');
            } else if (msg.includes('insufficient funds')) {
                Alert.alert('Không đủ ETH', 'Ví Ministry không đủ ETH để trả phí gas.');
            } else {
                Alert.alert('Lỗi', msg || 'Không thể tạo cơ sở. Vui lòng thử lại.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const footer = (
        <StickyFooter
            primary={isSubmitting ? 'Đang phát giao dịch…' : 'Phát giao dịch'}
            hint={footerHint}
            primaryLoading={isSubmitting}
            primaryDisabled={!canSubmit}
            onPrimary={handleSubmit}
        />
    );

    return (
        <FormShell footer={footer}>
            <PageHeader
                eyebrow="createOrganization(name, primaryAdmin, backupAdmin)"
                title="Đăng ký cơ sở y tế mới"
                subtitle="Cơ sở sẽ được ghi on-chain và nhận trạng thái đã xác minh ngay. Sau đó quản trị viên có thể bắt đầu xác minh bác sĩ."
            />

            {/* TÊN CƠ SỞ */}
            <SectionLabel required>Tên cơ sở</SectionLabel>
            <View style={{ paddingHorizontal: 22, paddingBottom: 4 }}>
                <TextInput
                    value={name}
                    onChangeText={(t) => setName(t.slice(0, 120))}
                    placeholder="Ví dụ: Bệnh viện Bạch Mai"
                    placeholderTextColor={palette.EHR_TEXT_MUTED}
                    style={{
                        minHeight: 46,
                        borderRadius: 10,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_SOFT,
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        color: palette.EHR_ON_SURFACE,
                        fontFamily: SANS,
                        fontSize: 14.5,
                    }}
                />
                <Text
                    style={{
                        marginTop: 4,
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: palette.EHR_TEXT_MUTED,
                        textAlign: 'right',
                        letterSpacing: 0.4,
                    }}
                >
                    {name.length} / 120
                </Text>
            </View>

            {/* VÍ CHÍNH */}
            <SectionLabel required trailing="Ký mọi tx của cơ sở">Ví quản trị chính</SectionLabel>
            <HexInputRow
                value={primaryAdmin}
                onChangeText={setPrimaryAdmin}
                placeholder="0x… (40 ký tự hex)"
                invalid={!primaryValid}
            />

            {/* VÍ BACKUP */}
            <SectionLabel required trailing="Khôi phục khi mất ví chính">Ví quản trị dự phòng</SectionLabel>
            <HexInputRow
                value={backupAdmin}
                onChangeText={setBackupAdmin}
                placeholder="0x… khác với ví chính"
                invalid={!backupValid || (backupAdmin.length > 0 && !walletsDifferent)}
            />

            {/* HINT */}
            <View
                style={{
                    paddingHorizontal: 22,
                    paddingTop: 14,
                    paddingBottom: 24,
                    flexDirection: 'row',
                    gap: 9,
                }}
            >
                <View
                    style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: walletsDifferent && primaryValid && backupValid && primaryAdmin && backupAdmin
                            ? palette.EHR_TERTIARY
                            : palette.EHR_WARNING,
                        marginTop: 6,
                    }}
                />
                <Text
                    style={{
                        flex: 1,
                        fontFamily: SANS,
                        fontSize: 12,
                        color: palette.EHR_TEXT_MUTED,
                        lineHeight: 18,
                    }}
                >
                    {primaryAdmin && backupAdmin && walletsDifferent && primaryValid && backupValid
                        ? 'Hai ví hợp lệ, khác nhau. Sẵn sàng phát giao dịch.'
                        : 'Hai ví phải khác nhau. Backup wallet dùng cho recovery nếu ví chính mất quyền truy cập.'}
                </Text>
            </View>
        </FormShell>
    );
}

function HexInputRow({
    value,
    onChangeText,
    placeholder,
    invalid,
}: {
    value: string;
    onChangeText: (t: string) => void;
    placeholder: string;
    invalid?: boolean;
}) {
    const palette = useEhrPalette();
    const borderColor = invalid ? palette.EHR_DANGER : palette.EHR_OUTLINE_SOFT;
    return (
        <View style={{ paddingHorizontal: 22, paddingBottom: 4 }}>
            <View
                style={{
                    minHeight: 52,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    borderWidth: 0.5,
                    borderColor,
                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                    flexDirection: 'row',
                    alignItems: 'center',
                }}
            >
                <TextInput
                    value={value}
                    onChangeText={onChangeText}
                    placeholder={placeholder}
                    placeholderTextColor={palette.EHR_TEXT_MUTED}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{
                        flex: 1,
                        paddingVertical: 4,
                        color: palette.EHR_ON_SURFACE,
                        fontFamily: MONO,
                        fontSize: 13.5,
                        letterSpacing: 0.2,
                        fontWeight: '500',
                    }}
                />
            </View>
        </View>
    );
}

void XStack;
void YStack;
void Pressable;
void SANS_SEMI;
