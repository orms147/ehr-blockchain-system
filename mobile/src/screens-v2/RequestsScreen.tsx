// RequestsScreen v2 — port of .design-bundle/project/screens-extras.jsx
// RequestsScreen. Patient duyệt yêu cầu truy cập hồ sơ từ bác sĩ. THIS IS
// THE CONSENT MOMENT — biometric-gated EIP-712 signature + cascade KeyShare
// preparation server-side staged.
//
// ALL handler logic preserved bit-for-bit:
//   - useRequests hook (TanStack Query)
//   - Pre-check: doctor verification with cinnabar warning
//   - Pre-check: Option B downgrade guard (allowDelegate / duration)
//   - approveWithSignature with EIP-712 signTypedData
//   - getOrCreateEncryptionKeypair for KeyShare encryption
//   - resolveLocalKey self-share fallback for chain versions
//   - Cascade payloads staged (S11.D pattern) on AccessRequest, applied on
//     doctor mark-claimed (not immediate shareKey)
//   - archiveRequest for "Ẩn yêu cầu"

import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Alert, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Check, X, Clock, User, FilePlus2 } from 'lucide-react-native';
import { Text, XStack, YStack } from 'tamagui';

import LoadingSpinner from '../components/LoadingSpinner';
import UserChip from '../components/UserChip';
import RecordChip from '../components/RecordChip';
import useRequests from '../hooks/useRequests';
import requestService from '../services/request.service';
import authService from '../services/auth.service';
import consentService from '../services/consent.service';
import keyShareService from '../services/keyShare.service';
import recordService from '../services/record.service';
import {
    getOrCreateEncryptionKeypair,
    encryptForRecipient,
    decryptFromSender,
} from '../services/nacl-crypto';
import localRecordStore from '../services/localRecordStore';
import walletActionService from '../services/walletAction.service';
import { gateOrThrow } from '../utils/biometricGate';
import ViButton from '../components-v2/ViButton';
import { useEhrPalette } from '../constants/uiColors';
import { resolveRecordType } from '../constants/recordTypes';
import { formatDateTime, formatExpiry, getExpiryUrgency } from '../utils/dateFormatting';

// Wave K: handleReject no longer needs direct contract address/ABI.
// Backend `/api/requests/:reqId/reject` handles the sponsored flow —
// mobile only signs EIP-712 typed data returned by /reject-message.

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

type RequestItem = {
    id?: string;
    requestId?: string;
    requesterAddress?: string;
    requestType?: number;
    createdAt?: string;
    deadline?: string;
    recordTitle?: string | null;
    recordType?: string | null;
    recordDescription?: string | null;
    recordCreatedAt?: string | null;
    parentCidHash?: string | null;
    cidHash?: string;
    status?: 'pending' | 'approved' | 'rejected' | 'signed' | string;
    signatureDeadline?: string | null;
    durationDays?: number;
    durationHours?: number;
    consentDurationHours?: number;
};

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected';

const formatDate = (s?: string) => formatDateTime(s);

const getRequestTypeLabel = (reqType?: number) => {
    switch (reqType) {
        case 0: return 'Đọc & cập nhật';
        case 1: return 'Uỷ quyền toàn bộ';
        case 2: return 'Đọc & uỷ quyền lại';
        default: return 'Không rõ';
    }
};

const getRecordTypeLabel = (code?: string | null) => {
    if (!code) return null;
    if (code.toLowerCase() === 'local_record') return 'Hồ sơ tự tạo';
    return resolveRecordType(code).label;
};

const formatDuration = (item: RequestItem) => {
    let hours: number | null = null;
    if (item.consentDurationHours != null) hours = Number(item.consentDurationHours);
    else if (item.durationHours != null) hours = Number(item.durationHours);
    else if (item.durationDays != null) hours = Number(item.durationDays) * 24;
    if (hours == null && item.deadline && item.createdAt) {
        const diffMs = new Date(item.deadline).getTime() - new Date(item.createdAt).getTime();
        if (Number.isFinite(diffMs) && diffMs > 0) hours = diffMs / 3600000;
    }
    if (hours == null) return null;
    if (hours < 1) {
        const mins = Math.max(1, Math.round(hours * 60));
        return `${mins} phút`;
    }
    if (hours < 24) return `${Math.round(hours)} giờ`;
    const days = Math.round(hours / 24);
    return `${days} ngày`;
};

const getSignatureTimeLeft = (deadline?: string | null) => {
    if (!deadline) return null;
    const deadlineMs = Number(deadline) * 1000;
    const diffMs = deadlineMs - Date.now();
    if (diffMs <= 0) return { text: 'Đã hết hạn', expired: true };
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return { text: `Còn ${hours}h${mins > 0 ? `${mins}p` : ''}`, expired: false };
    return { text: `Còn ${mins} phút`, expired: false };
};

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???');

/**
 * statusPillTokens — per polish pack §3 A·1: dashed-border pill with
 * status-tone color. warn (gold) pending · jade approved · cinnabar
 * rejected · clay signed (awaiting doctor claim).
 */
function statusPillTokens(status: string, palette: any): { label: string; color: string } {
    const s = status.toLowerCase();
    if (s === 'approved') return { label: 'Đã duyệt', color: palette.EHR_TERTIARY };
    if (s === 'signed') return { label: 'Đã ký · chờ nhận', color: palette.EHR_CLAY };
    if (s === 'rejected') return { label: 'Từ chối', color: palette.EHR_CINNABAR_DEEP };
    return { label: 'Chờ duyệt', color: palette.EHR_WARNING };
}

const RequestRow = React.memo(function RequestRow({
    item,
    onApprove,
    onReject,
    onArchive,
    isApproving,
}: {
    item: RequestItem;
    onApprove: (r: RequestItem) => void;
    onReject: (r: RequestItem) => void;
    onArchive: (r: RequestItem) => void;
    isApproving?: boolean;
}) {
    const palette = useEhrPalette();
    const normalizedStatus = (item.status || 'pending').toLowerCase();
    const isPending = normalizedStatus === 'pending';
    const isSigned = normalizedStatus === 'signed';
    const isFullDelegation = item.requestType === 1;
    const timeLeft = isSigned ? getSignatureTimeLeft(item.signatureDeadline) : null;
    const statusPill = statusPillTokens(normalizedStatus, palette);
    const scopeLabel = getRequestTypeLabel(item.requestType);
    const durationLabel = formatDuration(item);

    return (
        <View
            style={{
                paddingVertical: 16,
                paddingHorizontal: 4,
                borderBottomWidth: 0.5,
                borderBottomColor: palette.EHR_OUTLINE_SOFT,
            }}
        >
            {/* HEAD ROW — requester (serif italic) + dashed status pill (top-right) */}
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1 }}>
                    <UserChip address={item.requesterAddress} expanded showAddress={false} />
                </View>
                <View
                    style={{
                        paddingVertical: 3,
                        paddingHorizontal: 8,
                        borderRadius: 4,
                        borderWidth: 0.5,
                        borderStyle: 'dashed',
                        borderColor: statusPill.color,
                    }}
                >
                    <Text
                        style={{
                            fontFamily: MONO,
                            fontSize: 9.5,
                            color: statusPill.color,
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            fontWeight: '700',
                        }}
                    >
                        {statusPill.label}
                    </Text>
                </View>
            </XStack>

            {/* KVROW SEPARATOR — 0.5px dashed borderSoft, marks head/body split.
                RN borderStyle applies to all sides; we set only borderTopWidth
                so only the top edge renders, others stay 0. */}
            <View
                style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTopWidth: 0.5,
                    borderStyle: 'dashed',
                    borderTopColor: palette.EHR_OUTLINE_SOFT,
                }}
            >
                {/* BODY — RecordChip OR full-delegation warning */}
                {isFullDelegation ? (
                    <XStack style={{ alignItems: 'flex-start', gap: 8 }}>
                        <View
                            style={{
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: palette.EHR_WARNING,
                                marginTop: 6,
                            }}
                        />
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: SANS_SEMI, fontSize: 12.5, color: palette.EHR_WARNING, fontWeight: '700' }}>
                                Uỷ quyền toàn bộ
                            </Text>
                            <Text
                                style={{
                                    marginTop: 2,
                                    fontFamily: SANS,
                                    fontSize: 12,
                                    color: palette.EHR_ON_SURFACE_VARIANT,
                                    lineHeight: 17,
                                }}
                            >
                                Áp dụng cho TẤT CẢ hồ sơ của bạn — không gắn với một hồ sơ cụ thể.
                            </Text>
                        </View>
                    </XStack>
                ) : item.cidHash ? (
                    <RecordChip cidHash={item.cidHash} fallbackTitle={item.recordTitle} showHash={false} />
                ) : (
                    <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_TEXT_MUTED, fontStyle: 'italic' }}>
                        {item.recordTitle || 'Hồ sơ chưa rõ tên'}
                    </Text>
                )}

                {/* META STRIP — scope · duration · deadline urgency */}
                <XStack
                    style={{
                        marginTop: 10,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 10,
                    }}
                >
                    <Text style={{ fontFamily: MONO, fontSize: 11, color: palette.EHR_ON_SURFACE_VARIANT, letterSpacing: 0.2 }}>
                        {scopeLabel}
                    </Text>
                    {durationLabel ? (
                        <>
                            <Text style={{ color: palette.EHR_TEXT_MUTED }}>·</Text>
                            <Text style={{ fontFamily: MONO, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                                {durationLabel}
                            </Text>
                        </>
                    ) : null}
                    {item.deadline && isPending ? (() => {
                        const urgency = getExpiryUrgency(item.deadline);
                        const urgent = urgency === 'urgent' || urgency === 'soon';
                        const color =
                            urgency === 'expired' ? palette.EHR_CINNABAR_DEEP : urgent ? palette.EHR_WARNING : palette.EHR_TEXT_MUTED;
                        return (
                            <>
                                <Text style={{ color: palette.EHR_TEXT_MUTED }}>·</Text>
                                <XStack style={{ alignItems: 'center', gap: 4 }}>
                                    <Clock size={11} color={color} />
                                    <Text style={{ fontFamily: MONO, fontSize: 11, color, fontWeight: urgent ? '700' : '400' }}>
                                        Duyệt trước {formatExpiry(item.deadline)}
                                    </Text>
                                </XStack>
                            </>
                        );
                    })() : null}
                </XStack>
            </View>

            {/* FOOTER LINE — timestamp mono 11 muted + audit·log marker */}
            <Text
                style={{
                    marginTop: 10,
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 0.2,
                }}
            >
                {formatDate(item.createdAt)} · audit·log
            </Text>

            {/* Signed: countdown for doctor to claim */}
            {isSigned && timeLeft ? (
                <View
                    style={{
                        marginTop: 10,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        borderLeftWidth: 2,
                        borderLeftColor: timeLeft.expired ? palette.EHR_CINNABAR_DEEP : palette.EHR_TERTIARY,
                        backgroundColor: timeLeft.expired ? `${palette.EHR_CINNABAR_DEEP}10` : `${palette.EHR_TERTIARY}10`,
                    }}
                >
                    <Text
                        style={{
                            fontFamily: SANS_MEDIUM,
                            fontSize: 12,
                            color: timeLeft.expired ? palette.EHR_CINNABAR_DEEP : palette.EHR_TERTIARY,
                            fontWeight: '600',
                        }}
                    >
                        {timeLeft.expired
                            ? 'Bác sĩ chưa nhận kịp. Bạn có thể duyệt lại nếu cần.'
                            : `Bạn đã duyệt. ${timeLeft.text} để bác sĩ nhận.`}
                    </Text>
                </View>
            ) : null}

            {/* Pending: Từ chối (cinnabar outline) + Phê duyệt (cinnabar fill).
                Other statuses: only Ẩn (archive — hide from list, no on-chain).
                Wave A.1: rejectRequest is REAL on-chain action; Ẩn is db-only. */}
            {isPending ? (
                <XStack style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                    <View>
                        <ViButton
                            variant="danger"
                            size="sm"
                            onPress={() => onReject(item)}
                            disabled={isApproving}
                            leftIcon={<X size={14} color={palette.EHR_CINNABAR_DEEP} />}
                        >
                            Từ chối
                        </ViButton>
                    </View>
                    <View>
                        <ViButton
                            variant="cinnabar"
                            size="sm"
                            onPress={() => onApprove(item)}
                            loading={isApproving}
                            leftIcon={isApproving ? undefined : <Check size={14} color="#FEFBF5" />}
                        >
                            {isApproving ? 'Đang ký…' : 'Phê duyệt'}
                        </ViButton>
                    </View>
                </XStack>
            ) : (
                <XStack style={{ justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                    <View>
                        <ViButton
                            variant="ghost"
                            size="sm"
                            onPress={() => onArchive(item)}
                            leftIcon={<X size={14} color={palette.EHR_TEXT_MUTED} />}
                        >
                            Ẩn
                        </ViButton>
                    </View>
                </XStack>
            )}
        </View>
    );
});

export default function RequestsScreen() {
    const palette = useEhrPalette();
    const { requests, isLoading, isRefreshing, refresh } = useRequests();
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
    const [approvingId, setApprovingId] = useState<string | null>(null);

    const normalizedRequests = useMemo(() => {
        return (requests || []).map((r: RequestItem) => ({
            ...r,
            status: String(r.status || 'pending').toLowerCase(),
        }));
    }, [requests]);

    const counts = useMemo(
        () => ({
            all: normalizedRequests.length,
            pending: normalizedRequests.filter((r: any) => r.status === 'pending').length,
            approved: normalizedRequests.filter(
                (r: any) => r.status === 'approved' || r.status === 'signed',
            ).length,
            rejected: normalizedRequests.filter((r: any) => r.status === 'rejected').length,
        }),
        [normalizedRequests],
    );

    const filteredRequests = useMemo(() => {
        if (activeFilter === 'all') return normalizedRequests;
        if (activeFilter === 'approved') {
            return normalizedRequests.filter(
                (r: any) => r.status === 'approved' || r.status === 'signed',
            );
        }
        return normalizedRequests.filter((r: any) => r.status === activeFilter);
    }, [activeFilter, normalizedRequests]);

    // ───────────────────────────────────────────────────────────────────
    //  handleApprove — verbatim from screens/RequestsScreen.tsx
    // ───────────────────────────────────────────────────────────────────
    const handleApprove = useCallback(async (request: RequestItem) => {
        const reqId = request.requestId || request.id;
        if (!reqId) { Alert.alert('Lỗi', 'Thiếu mã yêu cầu'); return; }
        if (approvingId) return;

        const doctorAddr = (request.requesterAddress || '').toLowerCase();
        if (doctorAddr) {
            try {
                const ctx = await consentService.fetchGrantContext(doctorAddr);
                if (ctx?.isDoctor && !ctx?.isVerifiedDoctor) {
                    const confirmed = await new Promise<boolean>((resolve) => {
                        Alert.alert(
                            'Bác sĩ chưa xác minh',
                            'Bác sĩ này chưa được tổ chức y tế xác minh on-chain. Hồ sơ bạn cấp quyền sẽ CHỈ ĐỌC ĐƯỢC sau khi họ được xác minh.\n\nBạn có muốn tiếp tục?',
                            [
                                { text: 'Huỷ', style: 'cancel', onPress: () => resolve(false) },
                                { text: 'Vẫn duyệt', style: 'destructive', onPress: () => resolve(true) },
                            ],
                            { cancelable: true, onDismiss: () => resolve(false) },
                        );
                    });
                    if (!confirmed) return;
                }
            } catch {}
        }

        if (request.cidHash && request.requestType !== 1 && doctorAddr) {
            try {
                const existing: any = await keyShareService.getKeyForRecord(request.cidHash);
                const alreadyActive = existing?.status && existing.status !== 'revoked' && existing.status !== 'rejected';
                if (alreadyActive) {
                    const oldAllowDelegate = existing.allowDelegate === true;
                    const newAllowDelegate = request.requestType === 2;
                    const oldExpiryMs = existing.expiresAt
                        ? new Date(existing.expiresAt).getTime()
                        : Number.POSITIVE_INFINITY;
                    const newExpiryMs = request.consentDurationHours
                        ? Date.now() + request.consentDurationHours * 3600 * 1000
                        : Number.POSITIVE_INFINITY;
                    const oldStillActive = oldExpiryMs > Date.now();
                    const flagDowngrade = oldAllowDelegate && !newAllowDelegate;
                    const durationDowngrade = oldStillActive && newExpiryMs < oldExpiryMs;
                    if (flagDowngrade || durationDowngrade) {
                        const reason = flagDowngrade
                            ? `Quyền hiện tại: ${oldAllowDelegate ? '"Đọc & uỷ quyền lại"' : '"Đọc & cập nhật"'}. Yêu cầu mới sẽ giảm quyền.`
                            : `Quyền hiện tại còn hạn dài hơn. Phê duyệt sẽ rút ngắn thời hạn.`;
                        const confirmed = await new Promise<boolean>((resolve) => {
                            Alert.alert(
                                'Cảnh báo: yêu cầu mới GHI ĐÈ quyền cũ',
                                `${reason}\n\nHệ thống chỉ lưu 1 consent cho mỗi bác sĩ/hồ sơ — phê duyệt yêu cầu này sẽ thay thế quyền đang có.\n\nNếu muốn giữ quyền cũ, hãy bấm "Từ chối".`,
                                [
                                    { text: 'Từ chối', style: 'cancel', onPress: () => resolve(false) },
                                    { text: 'Vẫn phê duyệt', style: 'destructive', onPress: () => resolve(true) },
                                ],
                                { cancelable: true, onDismiss: () => resolve(false) },
                            );
                        });
                        if (!confirmed) return;
                    }
                }
            } catch {}
        }

        setApprovingId(reqId);
        try {
            const { walletClient, address } = await walletActionService.getWalletContext();
            const { typedData, deadline } = await requestService.getApprovalMessage(reqId);
            const signature = await walletActionService.signTypedData(walletClient, {
                domain: typedData.domain,
                types: typedData.types,
                primaryType: typedData.primaryType,
                message: typedData.message,
            });

            let encryptedKeyPayload: string | null = null;
            let senderPublicKey: string | null = null;

            const resolveLocalKey = async (
                cidHash: string,
                localMap: Record<string, any>,
                myKeypair: { publicKey: string; secretKey: string },
            ): Promise<{ cid: string; aesKey: string } | null> => {
                const direct = localMap[cidHash];
                if (direct?.cid && direct?.aesKey) return { cid: direct.cid, aesKey: direct.aesKey };
                try {
                    const selfShare: any = await keyShareService.getKeyForRecord(cidHash);
                    if (!selfShare?.encryptedPayload || !selfShare?.senderPublicKey) return null;
                    const decrypted = decryptFromSender(
                        selfShare.encryptedPayload,
                        selfShare.senderPublicKey,
                        myKeypair.secretKey,
                    );
                    if (!decrypted) return null;
                    const parsed = JSON.parse(decrypted);
                    if (!parsed?.cid || !parsed?.aesKey) return null;
                    localMap[cidHash] = { ...(localMap[cidHash] || {}), cid: parsed.cid, aesKey: parsed.aesKey };
                    await localRecordStore.setKey(cidHash, { cid: parsed.cid, aesKey: parsed.aesKey });
                    return { cid: parsed.cid, aesKey: parsed.aesKey };
                } catch (err) {
                    console.warn('Self-share fallback failed for', cidHash, err);
                    return null;
                }
            };

            try {
                const myKeypair = await getOrCreateEncryptionKeypair(walletClient, address);
                senderPublicKey = myKeypair.publicKey;
                const docKeyRes = await authService.getEncryptionKey(request.requesterAddress);
                const doctorPubKey = docKeyRes?.encryptionPublicKey;
                const localRecords = await localRecordStore.getAll();
                const resolved = request.cidHash
                    ? await resolveLocalKey(request.cidHash, localRecords, myKeypair)
                    : null;
                if (resolved && doctorPubKey) {
                    const keyPayload = JSON.stringify({ cid: resolved.cid, aesKey: resolved.aesKey });
                    encryptedKeyPayload = encryptForRecipient(keyPayload, doctorPubKey, myKeypair.secretKey);
                }
            } catch (err) {
                console.warn('Key sharing encryption step failed/skipped:', err);
            }

            let cascadePayloads: Array<{ cidHash: string; encryptedPayload: string; senderPublicKey: string }> = [];
            const skippedVersions: Array<{ cidHash: string; title?: string }> = [];
            let cascadeBuildError: string | null = null;
            try {
                const localRecords2 = await localRecordStore.getAll();
                const myKeypair2 = await getOrCreateEncryptionKeypair(
                    (await walletActionService.getWalletContext()).walletClient,
                    address,
                );
                const docKeyRes2 = await authService.getEncryptionKey(request.requesterAddress);
                const doctorPubKey2 = docKeyRes2?.encryptionPublicKey;

                if (doctorPubKey2 && request.cidHash) {
                    const chainRes: any = await recordService.getChainCids(request.cidHash);
                    const allVersions = (chainRes?.records || []).filter(
                        (v: any) => v?.cidHash && v.cidHash !== request.cidHash,
                    );
                    for (const v of allVersions) {
                        const vKey = await resolveLocalKey(v.cidHash, localRecords2, myKeypair2);
                        if (!vKey) {
                            skippedVersions.push({ cidHash: v.cidHash, title: v.title });
                            continue;
                        }
                        const vPayload = JSON.stringify({ cid: vKey.cid, aesKey: vKey.aesKey });
                        const vEncrypted = encryptForRecipient(vPayload, doctorPubKey2, myKeypair2.secretKey);
                        cascadePayloads.push({
                            cidHash: v.cidHash,
                            encryptedPayload: vEncrypted,
                            senderPublicKey: myKeypair2.publicKey,
                        });
                    }
                }
            } catch (cascadeErr: any) {
                console.error('[Approve] Cascade payload build error:', cascadeErr);
                cascadeBuildError = cascadeErr?.message || 'Lỗi không xác định';
            }

            await (requestService as any).approveWithSignature(
                reqId,
                signature,
                deadline,
                encryptedKeyPayload || undefined,
                request.cidHash || undefined,
                senderPublicKey || undefined,
                cascadePayloads.length > 0 ? cascadePayloads : undefined,
            );

            if (cascadeBuildError) {
                Alert.alert(
                    'Phê duyệt thành công nhưng cảnh báo',
                    `Đã phê duyệt yêu cầu chính. Tuy nhiên, hệ thống không thể chuẩn bị chia sẻ các phiên bản khác trong chain (lý do: ${cascadeBuildError}).\n\n` +
                    'Bác sĩ chỉ nhận được khoá cho phiên bản đã yêu cầu, các phiên bản khác sẽ KHÔNG đọc được.',
                );
            } else if (skippedVersions.length > 0) {
                const list = skippedVersions
                    .map((s) => `• ${s.title || `${s.cidHash.slice(0, 10)}...`}`)
                    .join('\n');
                Alert.alert(
                    'Một số phiên bản chưa thể chia sẻ',
                    `Bác sĩ sẽ KHÔNG đọc được các phiên bản sau:\n${list}\n\n` +
                    'Lý do: bạn chưa từng có khoá giải mã cho các phiên bản này ' +
                    '(thường gặp khi hồ sơ được tạo trước khi bạn đăng nhập app lần đầu). ' +
                    'Hãy yêu cầu bác sĩ tạo các phiên bản đó tự re-share để khôi phục.',
                );
            } else {
                Alert.alert(
                    'Thành công',
                    'Đã phê duyệt. Bác sĩ sẽ nhận quyền truy cập sau khi xác nhận trên blockchain.',
                );
            }
            refresh();
        } catch (error) {
            console.error(error);
            Alert.alert('Lỗi', 'Không thể phê duyệt yêu cầu.');
        } finally {
            setApprovingId(null);
        }
    }, [refresh, approvingId]);

    // ───────────────────────────────────────────────────────────────────
    //  handleReject — Wave K: SPONSORED reject.
    //  Patient signs EIP-712 off-chain, backend relayer broadcasts
    //  EHRSystemSecure.rejectRequestBySig — patient KHÔNG cần ETH.
    //  Cùng pattern với handleApprove (consistent UX, both sponsored).
    // ───────────────────────────────────────────────────────────────────
    const handleReject = useCallback(async (request: RequestItem) => {
        const reqId = request.requestId || request.id;
        if (!reqId) { Alert.alert('Lỗi', 'Thiếu mã yêu cầu'); return; }
        if (approvingId) return;

        const confirmed = await new Promise<boolean>((resolve) => {
            Alert.alert(
                'Từ chối yêu cầu?',
                'Bác sĩ sẽ nhận thông báo bị từ chối. Hành động này được ghi on-chain và không thể huỷ.\n\nBạn vẫn có thể duyệt yêu cầu mới từ bác sĩ này sau.',
                [
                    { text: 'Huỷ', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Từ chối', style: 'destructive', onPress: () => resolve(true) },
                ],
                { cancelable: true, onDismiss: () => resolve(false) },
            );
        });
        if (!confirmed) return;

        setApprovingId(reqId);
        try {
            const { walletClient } = await walletActionService.getWalletContext();
            await gateOrThrow('Xác thực để từ chối yêu cầu');

            // 1. Fetch EIP-712 typed data from backend (locked to reqId + deadline)
            const msgRes: any = await (requestService as any).getRejectMessage(reqId);
            const { typedData, deadline } = msgRes || {};
            if (!typedData || !deadline) throw new Error('Backend không trả về typed data');

            // 2. Sign off-chain — wallet shows "RejectRequest(reqId, deadline)" preview
            const signature = await walletActionService.signTypedData(walletClient, {
                domain: typedData.domain,
                types: typedData.types,
                primaryType: typedData.primaryType,
                message: typedData.message,
            });

            // 3. POST signature → backend broadcasts via relayer (sponsor gas)
            const result: any = await (requestService as any).rejectWithSignature(
                reqId,
                signature,
                deadline,
                null, // reason — defer until UX Q3 dropdown decision
            );

            Alert.alert(
                'Đã từ chối',
                `Yêu cầu đã được từ chối on-chain. Bác sĩ sẽ thấy trạng thái cập nhật ngay.\n\nTx: ${String(result?.txHash || '').slice(0, 14)}…`,
            );
            refresh();
        } catch (error: any) {
            console.error('[Reject] Failed:', error);
            Alert.alert(
                'Lỗi',
                error?.message || error?.shortMessage || 'Không thể từ chối yêu cầu. Vui lòng thử lại.',
            );
        } finally {
            setApprovingId(null);
        }
    }, [refresh, approvingId]);

    const handleArchive = useCallback((request: RequestItem) => {
        Alert.alert('Ẩn yêu cầu', 'Bạn có chắc chắn muốn ẩn yêu cầu này?', [
            { text: 'Huỷ', style: 'cancel' },
            {
                text: 'Ẩn',
                style: 'destructive',
                onPress: async () => {
                    try {
                        const reqId = request.requestId || request.id;
                        if (!reqId) throw new Error('Missing request id');
                        await requestService.archiveRequest(reqId);
                        refresh();
                    } catch (e) {
                        console.error(e);
                        Alert.alert('Lỗi', 'Không thể ẩn yêu cầu.');
                    }
                },
            },
        ]);
    }, [refresh]);

    if (isLoading && !isRefreshing) {
        return <LoadingSpinner message="Đang tải danh sách yêu cầu..." />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            {/* Hero header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 }}>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 26,
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.3,
                        lineHeight: 30,
                    }}
                >
                    Yêu cầu truy cập
                </Text>
                <Text
                    style={{
                        marginTop: 4,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        lineHeight: 18,
                    }}
                >
                    Bác sĩ xin xem hồ sơ — bạn quyết định ai và khi nào.
                </Text>
            </View>

            {/* Filter pills */}
            <View
                style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 6,
                    paddingHorizontal: 20,
                    marginBottom: 14,
                }}
            >
                {([
                    ['all', 'Tất cả'],
                    ['pending', 'Chờ duyệt'],
                    ['approved', 'Đã duyệt'],
                    ['rejected', 'Đã từ chối'],
                ] as [FilterKey, string][]).map(([key, label]) => {
                    const active = key === activeFilter;
                    return (
                        <Pressable
                            key={key}
                            onPress={() => setActiveFilter(key)}
                            style={({ pressed }) => ({
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 999,
                                borderWidth: 0.5,
                                borderColor: active ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE_SOFT,
                                backgroundColor: active ? palette.EHR_ON_SURFACE : 'transparent',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_MEDIUM,
                                    fontSize: 12,
                                    color: active ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE_VARIANT,
                                    fontWeight: '600',
                                }}
                            >
                                {label} · {counts[key]}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            {filteredRequests.length === 0 ? (
                <View style={{ paddingHorizontal: 22, paddingTop: 30, alignItems: 'center' }}>
                    <Bell size={28} color={palette.EHR_TEXT_MUTED} />
                    <Text
                        style={{
                            marginTop: 12,
                            fontFamily: SERIF,
                            fontSize: 18,
                            color: palette.EHR_ON_SURFACE,
                            textAlign: 'center',
                        }}
                    >
                        Không có yêu cầu
                    </Text>
                    <Text
                        style={{
                            marginTop: 8,
                            fontFamily: SANS,
                            fontSize: 13,
                            color: palette.EHR_TEXT_MUTED,
                            textAlign: 'center',
                            lineHeight: 19,
                            maxWidth: 280,
                        }}
                    >
                        {activeFilter === 'all'
                            ? 'Khi bác sĩ yêu cầu truy cập hồ sơ, yêu cầu sẽ hiển thị ở đây.'
                            : 'Không có yêu cầu ở nhóm trạng thái này.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredRequests}
                    keyExtractor={(item: any, index) =>
                        item.id?.toString() || item.requestId || `request-${index}`
                    }
                    renderItem={({ item }: { item: any }) => (
                        <RequestRow
                            item={item}
                            onApprove={handleApprove}
                            onReject={handleReject}
                            onArchive={handleArchive}
                            isApproving={approvingId === (item.requestId || item.id)}
                        />
                    )}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={refresh}
                            tintColor={palette.EHR_ON_SURFACE_VARIANT}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}
