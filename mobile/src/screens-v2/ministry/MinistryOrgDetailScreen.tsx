// MinistryOrgDetailScreen — Wave F per viehp-ministry-org-actions §1.3.
//
// Ministry org detail + compliance actions (Pause / Resume / Revoke).
// setOrgAdmins SKIPPED per user decision 2026-05-24 (backupAdmin handles
// 99% of recovery scenarios; defer to manual script for the rare case both
// wallets are lost).
//
// Receives route params: { orgId, name, primaryAdmin, backupAdmin, active }
// (passed from MinistryDashboard org row tap).
//
// Layout:
//   PageHeader (eyebrow "Cơ sở · org-NNNN" + serif title + subtitle)
//   2 StatePill: hoạt động (jade/warn) + xác minh (jade)
//   AdminRow × 2: Chính (primary) + Dự phòng (backup) with mono addresses
//   SectionLabel "Hành động cưỡng chế" trailing="Compliance"
//   3 ComplianceRow:
//     setOrgActive(false) — Pause (warn) → confirm modal warn (no typeword)
//     setOrgActive(true)  — Resume (muted, disabled if active)
//     revokeOrgVerification(org) — Revoke (danger) → confirm modal danger
//                                  + typeword "THU HOI" gate

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { X } from 'lucide-react-native';
import { parseGwei } from 'viem';

import walletActionService from '../../services/walletAction.service';
import { gateOrThrow } from '../../utils/biometricGate';
import { useEhrPalette } from '../../constants/uiColors';
import { ACCESS_CONTROL_ABI } from '../../abi/contractABI';

const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

const ACCESS_CONTROL_ADDRESS = process.env.EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS as `0x${string}`;

const REVOKE_TYPEWORD = 'THU HOI';

type RouteParams = {
    orgId: number | string;
    name: string;
    primaryAdmin: string;
    backupAdmin?: string | null;
    primaryAdminName?: string | null;
    backupAdminName?: string | null;
    active?: boolean;
};

const truncate = (a?: string) => (a ? `${a.slice(0, 8)}…${a.slice(-4)}` : '???');

export default function MinistryOrgDetailScreen({ route, navigation }: any) {
    const palette = useEhrPalette();
    const params: RouteParams = route?.params || {};
    const [active, setActive] = useState<boolean>(params.active !== false);
    const [confirm, setConfirm] = useState<null | 'pause' | 'resume' | 'revoke'>(null);

    const handleSetActive = async (newActive: boolean) => {
        if (!ACCESS_CONTROL_ADDRESS) {
            Alert.alert('Thiếu cấu hình', 'EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS chưa được đặt.');
            return;
        }
        try {
            const { walletClient, account } = await walletActionService.getWalletContext();
            await gateOrThrow(newActive ? 'Mở lại cơ sở' : 'Tạm dừng cơ sở');

            const txHash = await walletClient.writeContract({
                account,
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'setOrgActive',
                args: [BigInt(params.orgId), newActive],
                gas: BigInt(200000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });

            setActive(newActive);
            Alert.alert(
                newActive ? 'Đã mở lại' : 'Đã tạm dừng',
                `Cơ sở "${params.name}" hiện ${newActive ? 'hoạt động trở lại' : 'bị tạm dừng'}. Tx: ${String(txHash).slice(0, 14)}…`,
            );
        } catch (error: any) {
            const msg = String(error?.message || '');
            if (msg.includes('NotMinistry')) Alert.alert('Không có quyền', 'Ví này không phải Ministry.');
            else if (msg.includes('insufficient funds')) Alert.alert('Không đủ ETH', 'Ví không đủ ETH cho phí gas.');
            else Alert.alert('Lỗi', msg || 'Không thể thay đổi trạng thái cơ sở.');
        }
    };

    const handleRevokeVerification = async () => {
        if (!ACCESS_CONTROL_ADDRESS) {
            Alert.alert('Thiếu cấu hình', 'EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS chưa được đặt.');
            return;
        }
        try {
            const { walletClient, account } = await walletActionService.getWalletContext();
            await gateOrThrow('Thu hồi xác minh cơ sở');

            const txHash = await walletClient.writeContract({
                account,
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'revokeOrgVerification',
                args: [params.primaryAdmin.toLowerCase() as `0x${string}`],
                gas: BigInt(250000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });

            Alert.alert(
                'Đã thu hồi',
                `Cơ sở "${params.name}" mất trạng thái đã xác minh. Tất cả bác sĩ thuộc cơ sở mất quyền tx mới.\n\nTx: ${String(txHash).slice(0, 14)}…`,
                [{ text: 'OK', onPress: () => navigation?.goBack?.() }],
            );
        } catch (error: any) {
            const msg = String(error?.message || '');
            if (msg.includes('NotMinistry')) Alert.alert('Không có quyền', 'Ví này không phải Ministry.');
            else if (msg.includes('insufficient funds')) Alert.alert('Không đủ ETH', 'Ví không đủ ETH cho phí gas.');
            else Alert.alert('Lỗi', msg || 'Không thể thu hồi xác minh cơ sở.');
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                {/* PageHeader */}
                <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 14 }}>
                    <Text style={{ fontFamily: MONO, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '700', marginBottom: 8 }}>
                        Cơ sở · org-{String(params.orgId).padStart(4, '0')}
                    </Text>
                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 22, fontWeight: '700', color: palette.EHR_ON_SURFACE, letterSpacing: -0.2, lineHeight: 26 }}>
                        {params.name}
                    </Text>
                </View>

                {/* State pills */}
                <View style={{ paddingHorizontal: 22, paddingBottom: 16, flexDirection: 'row', gap: 10 }}>
                    <StatePill
                        kind={active ? 'active' : 'paused'}
                        label={active ? 'Đang hoạt động' : 'Đã tạm dừng'}
                    />
                    <StatePill kind="verified" label="Đã xác minh" />
                </View>

                {/* Admins */}
                <SectionLabel>Quản trị viên</SectionLabel>
                <AdminRow
                    role="Chính"
                    name={params.primaryAdminName || 'Quản trị chính'}
                    addr={params.primaryAdmin}
                />
                {params.backupAdmin ? (
                    <AdminRow
                        role="Dự phòng"
                        name={params.backupAdminName || 'Quản trị dự phòng'}
                        addr={params.backupAdmin}
                        last
                    />
                ) : null}

                {/* Compliance actions */}
                <SectionLabel trailing="Compliance">Hành động cưỡng chế</SectionLabel>
                <ComplianceRow
                    op="setOrgActive(orgId, false)"
                    title="Tạm dừng cơ sở"
                    sub="Khoá tx mới của cơ sở và bác sĩ thuộc cơ sở. Có thể bật lại bất kỳ lúc nào."
                    cta="Tạm dừng"
                    tone="warn"
                    disabled={!active}
                    onPress={() => setConfirm('pause')}
                />
                <ComplianceRow
                    op="setOrgActive(orgId, true)"
                    title="Mở lại cơ sở"
                    sub="Chỉ active khi cơ sở đang ở trạng thái tạm dừng."
                    cta="Mở lại"
                    tone="muted"
                    disabled={active}
                    onPress={() => setConfirm('resume')}
                />
                <ComplianceRow
                    op="revokeOrgVerification(org)"
                    title="Thu hồi xác minh cơ sở"
                    sub="Cơ sở mất trạng thái đã xác minh. Tất cả bác sĩ thuộc cơ sở mất quyền tx. Không tự khôi phục."
                    cta="Thu hồi"
                    tone="danger"
                    onPress={() => setConfirm('revoke')}
                    last
                />

                <View style={{ height: 24 }} />
            </ScrollView>

            {/* Confirm modals */}
            <ConfirmModal
                visible={confirm === 'pause'}
                kind="warn"
                title="Tạm dừng cơ sở"
                sub={`Bạn đang tạm dừng "${params.name}". Cơ sở và bác sĩ thuộc nó sẽ KHÔNG ký được tx mới. Bạn có thể mở lại bất kỳ lúc nào.`}
                op="setOrgActive"
                args={`orgId: ${params.orgId}, active: false`}
                primary="Tạm dừng"
                hint="Có thể mở lại qua setOrgActive(true)"
                onClose={() => setConfirm(null)}
                onConfirm={async () => {
                    setConfirm(null);
                    await handleSetActive(false);
                }}
            />
            <ConfirmModal
                visible={confirm === 'resume'}
                kind="warn"
                title="Mở lại cơ sở"
                sub={`Bạn đang mở lại "${params.name}". Cơ sở và bác sĩ thuộc nó sẽ ký được tx trở lại.`}
                op="setOrgActive"
                args={`orgId: ${params.orgId}, active: true`}
                primary="Mở lại"
                hint="Ký bằng FaceID"
                onClose={() => setConfirm(null)}
                onConfirm={async () => {
                    setConfirm(null);
                    await handleSetActive(true);
                }}
            />
            <ConfirmModal
                visible={confirm === 'revoke'}
                kind="danger"
                title="Thu hồi xác minh cơ sở"
                sub={`"${params.name}" sẽ mất trạng thái đã xác minh. Mọi bác sĩ thuộc cơ sở mất quyền ký tx mới. Hành động này KHÔNG TỰ KHÔI PHỤC.`}
                op="revokeOrgVerification"
                args={`org: ${truncate(params.primaryAdmin)}`}
                primary="Thu hồi xác minh"
                typeword={REVOKE_TYPEWORD}
                hint={`Gõ ${REVOKE_TYPEWORD} để mở khoá nút phát tx`}
                onClose={() => setConfirm(null)}
                onConfirm={async () => {
                    setConfirm(null);
                    await handleRevokeVerification();
                }}
            />
        </SafeAreaView>
    );
}

// ───────── Components ─────────

function StatePill({ kind, label }: { kind: 'active' | 'paused' | 'verified' | 'revoked'; label: string }) {
    const palette = useEhrPalette();
    const color =
        kind === 'active' ? palette.EHR_TERTIARY
        : kind === 'paused' ? palette.EHR_WARNING
        : kind === 'revoked' ? palette.EHR_CINNABAR_DEEP
        : palette.EHR_ON_SURFACE;
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: palette.EHR_SURFACE_LOWEST,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
            }}
        >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
            <Text style={{ fontFamily: SANS_SEMI, fontSize: 11.5, color: palette.EHR_ON_SURFACE, fontWeight: '600' }}>
                {label}
            </Text>
        </View>
    );
}

function SectionLabel({ children, trailing }: { children: React.ReactNode; trailing?: string }) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                paddingHorizontal: 22,
                paddingTop: 18,
                paddingBottom: 10,
                borderTopWidth: 0.5,
                borderTopColor: palette.EHR_OUTLINE_SOFT,
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
            }}
        >
            <Text
                style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: palette.EHR_ON_SURFACE_VARIANT,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                }}
            >
                {children}
            </Text>
            {trailing ? (
                <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.3 }}>
                    {trailing}
                </Text>
            ) : null}
        </View>
    );
}

function AdminRow({ role, name, addr, last }: { role: string; name: string; addr: string; last?: boolean }) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                paddingVertical: 12,
                paddingHorizontal: 22,
                borderBottomWidth: last ? 0 : 0.5,
                borderBottomColor: palette.EHR_OUTLINE_SOFT,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
            }}
        >
            <View
                style={{
                    paddingHorizontal: 7,
                    paddingVertical: 3,
                    borderRadius: 4,
                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                    borderWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                }}
            >
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 9.5,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        letterSpacing: 0.8,
                        fontWeight: '700',
                        textTransform: 'uppercase',
                    }}
                >
                    {role}
                </Text>
            </View>
            <YStack style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: SANS_SEMI, fontSize: 13.5, color: palette.EHR_ON_SURFACE, fontWeight: '600' }}>
                    {name}
                </Text>
                <Text style={{ marginTop: 2, fontFamily: MONO, fontSize: 11, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.3 }}>
                    {truncate(addr)}
                </Text>
            </YStack>
        </View>
    );
}

function ComplianceRow({
    op,
    title,
    sub,
    cta,
    tone,
    disabled,
    last,
    onPress,
}: {
    op: string;
    title: string;
    sub: string;
    cta: string;
    tone: 'warn' | 'danger' | 'ink' | 'muted';
    disabled?: boolean;
    last?: boolean;
    onPress: () => void;
}) {
    const palette = useEhrPalette();
    const color =
        tone === 'danger' ? palette.EHR_CINNABAR_DEEP
        : tone === 'warn' ? palette.EHR_WARNING
        : tone === 'ink' ? palette.EHR_ON_SURFACE
        : palette.EHR_TEXT_MUTED;
    return (
        <View
            style={{
                paddingVertical: 14,
                paddingHorizontal: 22,
                borderBottomWidth: last ? 0 : 0.5,
                borderBottomColor: palette.EHR_OUTLINE_SOFT,
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 14,
                opacity: disabled ? 0.45 : 1,
            }}
        >
            <YStack style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: SANS_SEMI, fontSize: 14.5, color: palette.EHR_ON_SURFACE, fontWeight: '700', letterSpacing: -0.1 }}>
                    {title}
                </Text>
                <Text style={{ marginTop: 3, fontFamily: MONO, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.3 }}>
                    {op}
                </Text>
                <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 12.5, color: palette.EHR_ON_SURFACE_VARIANT, lineHeight: 18 }}>
                    {sub}
                </Text>
            </YStack>
            <Pressable
                onPress={disabled ? undefined : onPress}
                disabled={disabled}
                style={({ pressed }) => ({
                    paddingVertical: 9,
                    paddingHorizontal: 14,
                    borderRadius: 8,
                    borderWidth: 0.5,
                    borderColor: disabled ? palette.EHR_OUTLINE_SOFT : color,
                    backgroundColor: 'transparent',
                    marginTop: 2,
                    opacity: pressed && !disabled ? 0.7 : 1,
                })}
            >
                <Text
                    style={{
                        fontFamily: SANS_SEMI,
                        fontSize: 12.5,
                        color: disabled ? palette.EHR_TEXT_MUTED : color,
                        fontWeight: '700',
                        letterSpacing: 0.1,
                    }}
                >
                    {cta}
                </Text>
            </Pressable>
        </View>
    );
}

function ConfirmModal({
    visible,
    kind,
    title,
    sub,
    op,
    args,
    primary,
    typeword,
    hint,
    onClose,
    onConfirm,
}: {
    visible: boolean;
    kind: 'warn' | 'danger';
    title: string;
    sub: string;
    op: string;
    args: string;
    primary: string;
    typeword?: string;
    hint?: string;
    onClose: () => void;
    onConfirm: () => void;
}) {
    const palette = useEhrPalette();
    const [typed, setTyped] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const danger = kind === 'danger';
    const c = danger ? palette.EHR_CINNABAR_DEEP : palette.EHR_WARNING;

    React.useEffect(() => {
        if (visible) {
            setTyped('');
            setSubmitting(false);
        }
    }, [visible]);

    const typewordOk = !typeword || typed.trim().toUpperCase() === typeword;
    const canConfirm = typewordOk && !submitting;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
                <View
                    style={{
                        backgroundColor: palette.EHR_SURFACE,
                        borderTopLeftRadius: 22,
                        borderTopRightRadius: 22,
                        paddingHorizontal: 22,
                        paddingTop: 12,
                        paddingBottom: 22,
                        borderTopWidth: 0.5,
                        borderTopColor: palette.EHR_OUTLINE_SOFT,
                    }}
                >
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: palette.EHR_OUTLINE_SOFT, alignSelf: 'center', marginBottom: 14 }} />

                    {/* Header */}
                    <XStack style={{ alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <View
                            style={{
                                width: 26,
                                height: 26,
                                borderRadius: 13,
                                borderWidth: 1.25,
                                borderColor: c,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {danger ? (
                                <X size={12} color={c} strokeWidth={2.4} />
                            ) : (
                                <Text style={{ fontFamily: SANS_SEMI, color: c, fontSize: 14, fontWeight: '700', lineHeight: 14 }}>
                                    ‖
                                </Text>
                            )}
                        </View>
                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 17, fontWeight: '700', color: palette.EHR_ON_SURFACE, letterSpacing: -0.2 }}>
                            {title}
                        </Text>
                    </XStack>
                    <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 13, color: palette.EHR_ON_SURFACE_VARIANT, lineHeight: 19 }}>
                        {sub}
                    </Text>

                    {/* Op preview */}
                    <View
                        style={{
                            marginTop: 16,
                            padding: 12,
                            borderRadius: 10,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                        }}
                    >
                        <Text style={{ fontFamily: MONO, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '700' }}>
                            Sẽ ký tx
                        </Text>
                        <Text style={{ marginTop: 6, fontFamily: MONO, fontSize: 12.5, color: palette.EHR_ON_SURFACE, lineHeight: 18 }}>
                            <Text style={{ color: c }}>{op}</Text>({args})
                        </Text>
                    </View>

                    {/* Typeword input */}
                    {typeword ? (
                        <View style={{ marginTop: 14 }}>
                            <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_ON_SURFACE_VARIANT, marginBottom: 6 }}>
                                Gõ{' '}
                                <Text style={{ fontFamily: MONO, color: c, fontWeight: '700' }}>{typeword}</Text>
                                {' '}để xác nhận
                            </Text>
                            <TextInput
                                value={typed}
                                onChangeText={setTyped}
                                placeholder={typeword}
                                placeholderTextColor={palette.EHR_TEXT_MUTED}
                                autoCapitalize="characters"
                                autoCorrect={false}
                                style={{
                                    minHeight: 44,
                                    padding: 12,
                                    borderRadius: 8,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    fontFamily: MONO,
                                    fontSize: 14,
                                    color: palette.EHR_ON_SURFACE,
                                    letterSpacing: 0.5,
                                }}
                            />
                        </View>
                    ) : null}

                    {/* Footer */}
                    <XStack style={{ marginTop: 18, gap: 10 }}>
                        <Pressable
                            onPress={onClose}
                            disabled={submitting}
                            style={({ pressed }) => ({
                                flex: 1,
                                paddingVertical: 14,
                                borderRadius: 12,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE,
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: 50,
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text style={{ fontFamily: SANS_SEMI, fontSize: 14, fontWeight: '600', color: palette.EHR_ON_SURFACE }}>
                                Huỷ
                            </Text>
                        </Pressable>
                        <Pressable
                            onPress={async () => {
                                if (!canConfirm) return;
                                setSubmitting(true);
                                try {
                                    await onConfirm();
                                } finally {
                                    setSubmitting(false);
                                }
                            }}
                            disabled={!canConfirm}
                            style={({ pressed }) => ({
                                flex: 1.4,
                                paddingVertical: 14,
                                borderRadius: 12,
                                backgroundColor: danger ? palette.EHR_CINNABAR_DEEP : palette.EHR_WARNING,
                                alignItems: 'center',
                                justifyContent: 'center',
                                minHeight: 50,
                                opacity: !canConfirm ? 0.5 : pressed ? 0.85 : 1,
                                flexDirection: 'row',
                                gap: 6,
                            })}
                        >
                            {submitting ? <ActivityIndicator size="small" color="#FBF8F1" /> : null}
                            <Text style={{ fontFamily: SANS_SEMI, fontSize: 14, fontWeight: '700', color: '#FBF8F1', letterSpacing: 0.1 }}>
                                {submitting ? 'Đang ký…' : primary}
                            </Text>
                        </Pressable>
                    </XStack>
                    {hint ? (
                        <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: palette.EHR_TEXT_MUTED }} />
                            <Text style={{ fontFamily: SANS, fontSize: 11.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.2 }}>
                                {hint}
                            </Text>
                        </View>
                    ) : null}
                </View>
            </View>
        </Modal>
    );
}
