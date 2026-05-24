// OrgMembersScreen v3 — Wave C redesign per viehp-ministry-org-actions §2.
//
// Layout:
//   PageHeader (eyebrow "revokeDoctorVerification(doctor)" + title + subtitle)
//   Filter chips · Đã xác minh · Chờ · Đã thu hồi (counts from backend)
//   VerifiedDoctorRow per member:
//     Name 15pt 650 + Specialty · GPHN-mono · "Đã xác minh" jade pill
//     "Xác minh từ DD·MM·YYYY" mono muted
//     [Xem hồ sơ] ghost + [Thu hồi xác minh] cinnabar outline (verified only)
//
// Revoke flow:
//   Tap "Thu hồi xác minh" → RevokeDoctorModal bottom-sheet
//   Modal: × cinnabar icon + body + reason PickerRow×4 + note 280-char +
//          op preview mono + footer "Huỷ" + "Thu hồi xác minh" cinnabar 1.4× width
//   On confirm: biometric → AccessControl.revokeDoctorVerification(doctor) tx
//             → mirror to backend (flip member status) → refresh

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Search, X } from 'lucide-react-native';
import { parseGwei } from 'viem';

import LoadingSpinner from '../../components/LoadingSpinner';
import orgService from '../../services/org.service';
import walletActionService from '../../services/walletAction.service';
import useAuthStore from '../../store/authStore';
import { useEhrPalette } from '../../constants/uiColors';
import { PickerRow } from '../../components-v2/FormPrimitives';
import { ACCESS_CONTROL_ABI } from '../../abi/contractABI';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

const ACCESS_CONTROL_ADDRESS = process.env.EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS as `0x${string}`;

type Member = {
    id?: string;
    memberAddress: string;
    fullName?: string | null;
    specialty?: string | null;
    licenseNumber?: string | null;
    hospitalName?: string | null;
    verifiedAt?: string | null;
    verificationState?: 'verified' | 'pending' | 'rejected' | 'revoked';
    role?: string;
    status?: string;
    joinedAt?: string;
};

type FilterKey = 'verified' | 'pending' | 'revoked';

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???');

function formatDotDate(iso?: string | null): string | null {
    if (!iso) return null;
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}·${mm}·${d.getFullYear()}`;
    } catch {
        return null;
    }
}

const REVOKE_REASONS = [
    { id: 'left', name: 'Bác sĩ rời cơ sở', sub: 'Nghỉ việc / chuyển công tác. Hồ sơ cũ giữ nguyên.' },
    { id: 'violation', name: 'Vi phạm chuyên môn', sub: 'Cảnh báo từ Hội đồng đạo đức nội bộ.' },
    { id: 'expired', name: 'Giấy phép hết hạn', sub: 'GPHN không còn hiệu lực.' },
    { id: 'other', name: 'Lý do khác', sub: 'Ghi chú bắt buộc dưới dây.' },
] as const;

type RevokeReasonId = (typeof REVOKE_REASONS)[number]['id'];

export default function OrgMembersScreen() {
    const palette = useEhrPalette();
    const { token } = useAuthStore();
    const [members, setMembers] = useState<Member[]>([]);
    const [counts, setCounts] = useState<{ verified: number; pending: number; revoked: number }>({ verified: 0, pending: 0, revoked: 0 });
    const [orgInfo, setOrgInfo] = useState<{ id: string; name: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterKey>('verified');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [revokeTarget, setRevokeTarget] = useState<Member | null>(null);

    const fetchData = useCallback(async (status: FilterKey = activeFilter) => {
        try {
            const orgRes: any = await orgService.getMyOrg();
            if (!orgRes?.hasOrg || !orgRes.organization) {
                setMembers([]);
                setOrgInfo(null);
                return;
            }
            setOrgInfo({ id: orgRes.organization.id, name: orgRes.organization.name });
            const backendStatus = status === 'revoked' ? 'revoked' : 'active';
            const membersRes: any = await orgService.getOrgMembers(orgRes.organization.id, backendStatus);
            const list: Member[] = Array.isArray(membersRes?.members) ? membersRes.members : [];
            // Client-side filter by verificationState since backend returns
            // by lifecycle status (active/revoked) and we further split
            // active → verified/pending in the UI.
            const filtered = status === 'revoked'
                ? list
                : list.filter((m) => m.verificationState === status);
            setMembers(filtered);
            if (membersRes?.counts) setCounts(membersRes.counts);
        } catch (err) {
            console.error('Failed to fetch members:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [activeFilter]);

    useEffect(() => {
        if (token) fetchData(activeFilter);
    }, [token, activeFilter, fetchData]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchData(activeFilter);
    }, [fetchData, activeFilter]);

    const filteredMembers = useMemo(() => {
        if (!searchTerm.trim()) return members;
        const term = searchTerm.toLowerCase();
        return members.filter((m) =>
            (m.fullName || '').toLowerCase().includes(term) ||
            (m.specialty || '').toLowerCase().includes(term) ||
            (m.licenseNumber || '').toLowerCase().includes(term) ||
            (m.memberAddress || '').toLowerCase().includes(term),
        );
    }, [members, searchTerm]);

    if (isLoading) return <LoadingSpinner message="Đang tải danh sách thành viên..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            {/* PageHeader */}
            <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 14 }}>
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: palette.EHR_TEXT_MUTED,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        fontWeight: '700',
                        marginBottom: 8,
                    }}
                >
                    revokeDoctorVerification(doctor)
                </Text>
                <Text
                    style={{
                        fontFamily: SANS_SEMI,
                        fontSize: 22,
                        fontWeight: '700',
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.2,
                        lineHeight: 26,
                    }}
                >
                    Quản lý bác sĩ thuộc cơ sở
                </Text>
                <Text
                    style={{
                        marginTop: 6,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        lineHeight: 19,
                        maxWidth: 320,
                    }}
                >
                    Thu hồi khi bác sĩ rời cơ sở, vi phạm chuyên môn, hoặc giấy phép hết hạn. Hồ sơ cũ vẫn giữ nguyên.
                </Text>
                {orgInfo ? (
                    <Text style={{ marginTop: 8, fontFamily: MONO, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                        {orgInfo.name}
                    </Text>
                ) : null}
            </View>

            {/* Filter chips */}
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 22, paddingBottom: 14 }}>
                {([
                    ['verified', 'Đã xác minh', counts.verified],
                    ['pending', 'Chờ', counts.pending],
                    ['revoked', 'Đã thu hồi', counts.revoked],
                ] as const).map(([k, label, count]) => {
                    const active = activeFilter === k;
                    return (
                        <Pressable
                            key={k}
                            onPress={() => setActiveFilter(k as FilterKey)}
                            style={({ pressed }) => ({
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                borderRadius: 999,
                                borderWidth: 0.5,
                                borderColor: active ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE_SOFT,
                                backgroundColor: active ? palette.EHR_ON_SURFACE : 'transparent',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 12,
                                    fontWeight: '600',
                                    color: active ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE,
                                }}
                            >
                                {label} · {count}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {/* Search */}
            <View style={{ paddingHorizontal: 22, paddingBottom: 10 }}>
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_SOFT,
                        borderRadius: 10,
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                        paddingHorizontal: 12,
                    }}
                >
                    <Search size={14} color={palette.EHR_TEXT_MUTED} />
                    <TextInput
                        value={searchTerm}
                        onChangeText={setSearchTerm}
                        placeholder="Tìm bác sĩ, chuyên khoa, GPHN, địa chỉ…"
                        placeholderTextColor={palette.EHR_TEXT_MUTED}
                        style={{
                            flex: 1,
                            paddingVertical: 9,
                            color: palette.EHR_ON_SURFACE,
                            fontFamily: SANS,
                            fontSize: 12.5,
                        }}
                    />
                </View>
            </View>

            <FlatList
                data={filteredMembers}
                keyExtractor={(item, index) => item.id || item.memberAddress || String(index)}
                renderItem={({ item }) => (
                    <VerifiedDoctorRow
                        member={item}
                        onRevoke={() => setRevokeTarget(item)}
                    />
                )}
                contentContainerStyle={{ paddingBottom: 32 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListEmptyComponent={
                    <View style={{ paddingTop: 30, paddingHorizontal: 22, alignItems: 'center' }}>
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_TEXT_MUTED,
                                textAlign: 'center',
                                fontStyle: 'italic',
                            }}
                        >
                            {searchTerm
                                ? 'Không tìm thấy bác sĩ nào khớp.'
                                : activeFilter === 'verified' ? 'Chưa có bác sĩ đã xác minh.'
                                : activeFilter === 'pending' ? 'Không có bác sĩ đang chờ xác minh.'
                                : 'Không có bác sĩ nào đã thu hồi.'}
                        </Text>
                    </View>
                }
            />

            <RevokeDoctorModal
                target={revokeTarget}
                orgId={orgInfo?.id || null}
                onClose={() => setRevokeTarget(null)}
                onSuccess={() => {
                    setRevokeTarget(null);
                    handleRefresh();
                }}
            />
        </SafeAreaView>
    );
}

function VerifiedDoctorRow({ member, onRevoke }: { member: Member; onRevoke: () => void }) {
    const palette = useEhrPalette();
    const state = member.verificationState || 'pending';
    const isVerified = state === 'verified';
    const isRevoked = state === 'revoked';
    const verifiedDate = formatDotDate(member.verifiedAt);

    const pillTone =
        isVerified ? palette.EHR_TERTIARY
        : isRevoked ? palette.EHR_CINNABAR_DEEP
        : palette.EHR_WARNING;
    const pillLabel =
        isVerified ? 'Đã xác minh'
        : isRevoked ? 'Đã thu hồi'
        : 'Chờ';

    return (
        <View
            style={{
                paddingVertical: 16,
                paddingHorizontal: 22,
                borderTopWidth: 0.5,
                borderTopColor: palette.EHR_OUTLINE_SOFT,
            }}
        >
            <XStack style={{ alignItems: 'baseline', gap: 10 }}>
                <YStack style={{ flex: 1 }}>
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 15,
                            color: palette.EHR_ON_SURFACE,
                            fontWeight: '700',
                            letterSpacing: -0.1,
                        }}
                    >
                        {member.fullName || `Bác sĩ ${truncate(member.memberAddress)}`}
                    </Text>
                    <Text style={{ marginTop: 3, fontFamily: SANS, fontSize: 12.5, color: palette.EHR_ON_SURFACE_VARIANT }}>
                        {member.specialty || 'Chưa rõ chuyên khoa'}
                        {member.licenseNumber ? (
                            <>
                                {' · '}
                                <Text style={{ fontFamily: MONO, fontSize: 11.5, color: palette.EHR_TEXT_MUTED }}>
                                    {member.licenseNumber}
                                </Text>
                            </>
                        ) : null}
                    </Text>
                </YStack>
                <View
                    style={{
                        paddingHorizontal: 8,
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
                            color: pillTone,
                            fontWeight: '700',
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                        }}
                    >
                        {pillLabel}
                    </Text>
                </View>
            </XStack>

            {verifiedDate ? (
                <Text style={{ marginTop: 8, fontFamily: MONO, fontSize: 11, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.3 }}>
                    Xác minh từ {verifiedDate}
                </Text>
            ) : null}

            {/* Address mono — always show for transparency */}
            <Text style={{ marginTop: 4, fontFamily: MONO, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.2 }}>
                {truncate(member.memberAddress)}
            </Text>

            {/* Actions — "Thu hồi" visible only for verified members */}
            <XStack style={{ marginTop: 12, gap: 8 }}>
                {isVerified ? (
                    <Pressable
                        onPress={onRevoke}
                        style={({ pressed }) => ({
                            paddingVertical: 9,
                            paddingHorizontal: 14,
                            borderRadius: 8,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_CINNABAR_DEEP,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 12.5,
                                color: palette.EHR_CINNABAR_DEEP,
                                fontWeight: '700',
                                letterSpacing: 0.2,
                            }}
                        >
                            Thu hồi xác minh
                        </Text>
                    </Pressable>
                ) : null}
            </XStack>
        </View>
    );
}

function RevokeDoctorModal({
    target,
    orgId,
    onClose,
    onSuccess,
}: {
    target: Member | null;
    orgId: string | null;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const palette = useEhrPalette();
    const [reason, setReason] = useState<RevokeReasonId>('violation');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Reset state when modal opens for a new target.
    useEffect(() => {
        if (target) {
            setReason('violation');
            setNote('');
            setIsSubmitting(false);
        }
    }, [target]);

    if (!target) return null;

    const doctorAddr = target.memberAddress.toLowerCase();
    const doctorDisplay = target.fullName || `Bác sĩ ${truncate(doctorAddr)}`;

    const handleRevoke = async () => {
        if (!orgId) {
            Alert.alert('Lỗi', 'Không có thông tin tổ chức.');
            return;
        }
        if (reason === 'other' && !note.trim()) {
            Alert.alert('Thiếu ghi chú', 'Vui lòng nhập lý do khi chọn "Lý do khác".');
            return;
        }
        if (!ACCESS_CONTROL_ADDRESS) {
            Alert.alert('Thiếu cấu hình', 'EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS chưa được đặt.');
            return;
        }

        setIsSubmitting(true);
        try {
            const { walletClient, account } = await walletActionService.getWalletContext();
            const { gateOrThrow } = await import('../../utils/biometricGate');
            await gateOrThrow('Xác thực để thu hồi xác minh bác sĩ');

            const txHash = await walletClient.writeContract({
                account,
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'revokeDoctorVerification',
                args: [doctorAddr as `0x${string}`],
                gas: BigInt(200000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });

            // Mirror to backend so member list updates instantly.
            try {
                await (orgService as any).mirrorRevokeMember(orgId, doctorAddr, txHash, `${reason}: ${note.trim()}`);
            } catch (mirrorErr) {
                console.warn('Revoke mirror failed (non-fatal):', mirrorErr);
            }

            Alert.alert(
                'Đã thu hồi',
                `${doctorDisplay} mất quyền xác minh on-chain. Họ vẫn xem được các hồ sơ đã có nhưng không ký tx mới được nữa.`,
            );
            onSuccess();
        } catch (error: any) {
            const msg = String(error?.message || '');
            if (msg.includes('NotAuthorized') || msg.includes('NotVerifiedOrg')) {
                Alert.alert(
                    'Không có quyền on-chain',
                    'Ví này không phải admin tổ chức đã xác minh.',
                );
            } else if (msg.includes('insufficient funds')) {
                Alert.alert('Không đủ ETH', 'Ví của bạn không đủ ETH để trả phí giao dịch.');
            } else {
                Alert.alert('Lỗi', msg || 'Không thể thu hồi xác minh.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            visible={!!target}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
                <View
                    style={{
                        backgroundColor: palette.EHR_SURFACE,
                        borderTopLeftRadius: 22,
                        borderTopRightRadius: 22,
                        maxHeight: '92%',
                        borderTopWidth: 0.5,
                        borderTopColor: palette.EHR_OUTLINE_SOFT,
                    }}
                >
                    {/* Drag handle */}
                    <View
                        style={{
                            width: 36,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: palette.EHR_OUTLINE_SOFT,
                            alignSelf: 'center',
                            marginTop: 12,
                            marginBottom: 14,
                        }}
                    />
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Header */}
                        <View style={{ paddingHorizontal: 22, paddingBottom: 6 }}>
                            <XStack style={{ alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                <View
                                    style={{
                                        width: 26,
                                        height: 26,
                                        borderRadius: 13,
                                        borderWidth: 1.25,
                                        borderColor: palette.EHR_CINNABAR_DEEP,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <X size={12} color={palette.EHR_CINNABAR_DEEP} strokeWidth={2.4} />
                                </View>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 17,
                                        fontWeight: '700',
                                        color: palette.EHR_ON_SURFACE,
                                        letterSpacing: -0.2,
                                    }}
                                >
                                    Thu hồi xác minh bác sĩ
                                </Text>
                            </XStack>
                            <Text
                                style={{
                                    marginTop: 6,
                                    fontFamily: SANS,
                                    fontSize: 13,
                                    color: palette.EHR_ON_SURFACE_VARIANT,
                                    lineHeight: 19,
                                }}
                            >
                                <Text style={{ fontFamily: SANS_SEMI, color: palette.EHR_ON_SURFACE, fontWeight: '700' }}>
                                    {doctorDisplay}
                                </Text>
                                {' '}sẽ mất quyền ký tx mới từ phía cơ sở. Hồ sơ đã ghi vẫn giữ nguyên trên chuỗi.
                            </Text>
                        </View>

                        {/* Reason picker */}
                        <SectionHeader>Lý do thu hồi</SectionHeader>
                        {REVOKE_REASONS.map((r, i) => (
                            <PickerRow
                                key={r.id}
                                name={r.name}
                                sub={r.sub}
                                selected={reason === r.id}
                                last={i === REVOKE_REASONS.length - 1}
                                onPress={() => setReason(r.id)}
                            />
                        ))}

                        {/* Note textarea */}
                        <SectionHeader trailing="Tối đa 280 ký tự">Ghi chú</SectionHeader>
                        <View style={{ paddingHorizontal: 22, paddingBottom: 10 }}>
                            <TextInput
                                value={note}
                                onChangeText={(t) => setNote(t.slice(0, 280))}
                                placeholder={reason === 'other'
                                    ? 'Bắt buộc — ghi rõ lý do thu hồi…'
                                    : 'Ví dụ: Hội đồng đạo đức nội bộ · biên bản 042/2026…'}
                                placeholderTextColor={palette.EHR_TEXT_MUTED}
                                multiline
                                textAlignVertical="top"
                                style={{
                                    minHeight: 76,
                                    borderRadius: 10,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    paddingHorizontal: 12,
                                    paddingVertical: 10,
                                    color: palette.EHR_ON_SURFACE,
                                    fontFamily: SANS,
                                    fontSize: 13.5,
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
                                {note.length} / 280
                            </Text>
                        </View>

                        {/* Op preview */}
                        <View
                            style={{
                                margin: 22,
                                marginTop: 8,
                                padding: 12,
                                borderRadius: 10,
                                backgroundColor: palette.EHR_SURFACE_LOWEST,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: MONO,
                                    fontSize: 10.5,
                                    color: palette.EHR_TEXT_MUTED,
                                    letterSpacing: 0.8,
                                    textTransform: 'uppercase',
                                    fontWeight: '700',
                                }}
                            >
                                Sẽ ký tx
                            </Text>
                            <Text
                                style={{
                                    marginTop: 6,
                                    fontFamily: MONO,
                                    fontSize: 12,
                                    color: palette.EHR_ON_SURFACE,
                                    lineHeight: 18,
                                }}
                            >
                                <Text style={{ color: palette.EHR_CINNABAR_DEEP }}>revokeDoctorVerification</Text>
                                {'('}
                                {'\n  '}
                                <Text style={{ color: palette.EHR_ON_SURFACE_VARIANT }}>doctor: {truncate(doctorAddr)}</Text>
                                {'\n)'}
                            </Text>
                        </View>

                        {/* Footer buttons */}
                        <XStack style={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 22, gap: 10 }}>
                            <Pressable
                                onPress={onClose}
                                disabled={isSubmitting}
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
                                onPress={handleRevoke}
                                disabled={isSubmitting}
                                style={({ pressed }) => ({
                                    flex: 1.4,
                                    paddingVertical: 14,
                                    borderRadius: 12,
                                    backgroundColor: palette.EHR_CINNABAR_DEEP,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minHeight: 50,
                                    opacity: isSubmitting ? 0.5 : pressed ? 0.85 : 1,
                                    flexDirection: 'row',
                                    gap: 6,
                                })}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator size="small" color="#FBF8F1" />
                                ) : null}
                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 14, fontWeight: '700', color: '#FBF8F1', letterSpacing: 0.1 }}>
                                    {isSubmitting ? 'Đang ký…' : 'Thu hồi xác minh'}
                                </Text>
                            </Pressable>
                        </XStack>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function SectionHeader({ children, trailing }: { children: React.ReactNode; trailing?: string }) {
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

void SERIF;
void SANS_MEDIUM;
