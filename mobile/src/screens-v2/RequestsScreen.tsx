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
import ViCard from '../components-v2/ViCard';
import ViButton from '../components-v2/ViButton';
import { ViStatusChip, ViModeChip } from '../components-v2/ViChips';
import {
    EHR_SURFACE,
    EHR_SURFACE_LOWEST,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE,
    EHR_OUTLINE_SOFT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_TERTIARY,
    EHR_WARNING,
    EHR_DANGER,
} from '../constants/uiColors';
import { formatDateTime, formatExpiry, getExpiryUrgency } from '../utils/dateFormatting';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

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

const RECORD_TYPE_LABELS: Record<string, string> = {
    checkup: 'Khám tổng quát',
    lab_result: 'Xét nghiệm',
    prescription: 'Đơn thuốc',
    diagnosis: 'Chẩn đoán',
    local_record: 'Hồ sơ tự tạo',
};

const getRecordTypeLabel = (code?: string | null) => {
    if (!code) return null;
    return RECORD_TYPE_LABELS[code.toLowerCase()] || code;
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

function statusToken(status?: string): 'pending' | 'active' | 'rejected' | 'expiring' {
    const s = String(status || 'pending').toLowerCase();
    if (s === 'approved') return 'active';
    if (s === 'signed') return 'expiring';
    if (s === 'rejected') return 'rejected';
    return 'pending';
}

const RequestRow = React.memo(function RequestRow({
    item,
    onApprove,
    onArchive,
    isApproving,
}: {
    item: RequestItem;
    onApprove: (r: RequestItem) => void;
    onArchive: (r: RequestItem) => void;
    isApproving?: boolean;
}) {
    const normalizedStatus = (item.status || 'pending').toLowerCase();
    const isPending = normalizedStatus === 'pending';
    const isSigned = normalizedStatus === 'signed';
    const timeLeft = isSigned ? getSignatureTimeLeft(item.signatureDeadline) : null;

    return (
        <ViCard padding={16} style={{ marginBottom: 12 }}>
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                <View style={{ flex: 1 }}>
                    {/* G.2 — requester wallet → UserChip resolves name + specialty + hospital + verified badge */}
                    <UserChip address={item.requesterAddress} expanded showAddress={false} />
                </View>
                <ViStatusChip status={statusToken(normalizedStatus)} />
            </XStack>

            {/* Record identification panel */}
            {item.requestType === 1 ? (
                <View
                    style={{
                        backgroundColor: `${EHR_WARNING}1A`,
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 10,
                        borderWidth: 0.5,
                        borderColor: `${EHR_WARNING}50`,
                    }}
                >
                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 12, color: EHR_WARNING, fontWeight: '700' }}>
                        Uỷ quyền toàn bộ
                    </Text>
                    <Text
                        style={{
                            marginTop: 2,
                            fontFamily: SANS,
                            fontSize: 12,
                            color: EHR_ON_SURFACE,
                            lineHeight: 18,
                        }}
                    >
                        Áp dụng cho TẤT CẢ hồ sơ của bạn — không gắn với một hồ sơ cụ thể.
                    </Text>
                </View>
            ) : (
                <View
                    style={{
                        backgroundColor: EHR_PRIMARY_FIXED,
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 10,
                    }}
                >
                    <XStack style={{ alignItems: 'center', gap: 6, marginBottom: item.recordDescription ? 6 : 0 }}>
                        <FilePlus2 size={13} color={EHR_PRIMARY} />
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 13,
                                color: EHR_PRIMARY,
                                fontWeight: '700',
                                flex: 1,
                            }}
                            numberOfLines={1}
                        >
                            {item.recordTitle || 'Hồ sơ chưa rõ tên'}
                        </Text>
                    </XStack>
                    {item.recordDescription ? (
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 12,
                                color: EHR_ON_SURFACE,
                                lineHeight: 18,
                                marginBottom: 4,
                            }}
                            numberOfLines={3}
                        >
                            {item.recordDescription}
                        </Text>
                    ) : null}
                    <XStack style={{ flexWrap: 'wrap', gap: 6 }}>
                        {item.recordType ? (
                            <View
                                style={{
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 6,
                                    backgroundColor: EHR_SURFACE_LOWEST,
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: SANS_MEDIUM,
                                        fontSize: 10.5,
                                        color: EHR_PRIMARY,
                                        fontWeight: '600',
                                    }}
                                >
                                    {getRecordTypeLabel(item.recordType)}
                                </Text>
                            </View>
                        ) : null}
                        {item.recordCreatedAt ? (
                            <Text style={{ fontFamily: SANS, fontSize: 10.5, color: EHR_OUTLINE }}>
                                {formatDate(item.recordCreatedAt)}
                            </Text>
                        ) : null}
                        {item.parentCidHash ? (
                            <Text style={{ fontFamily: SANS, fontSize: 10.5, color: EHR_OUTLINE }}>
                                · Bản cập nhật
                            </Text>
                        ) : null}
                    </XStack>
                </View>
            )}

            {/* Metadata strip */}
            <XStack
                style={{
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: isPending ? 12 : 0,
                }}
            >
                <ViModeChip mode={item.requestType === 2 ? 'read-delegate' : 'read-update'} />
                {formatDuration(item) ? (
                    <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 11.5, color: EHR_OUTLINE }}>
                        {formatDuration(item)}
                    </Text>
                ) : null}
                <Text style={{ fontFamily: SANS, fontSize: 11, color: EHR_OUTLINE }}>
                    {formatDate(item.createdAt)}
                </Text>
                {item.deadline && isPending ? (() => {
                    const urgency = getExpiryUrgency(item.deadline);
                    const urgent = urgency === 'urgent' || urgency === 'soon';
                    const color =
                        urgency === 'expired' ? EHR_DANGER : urgent ? EHR_WARNING : EHR_OUTLINE;
                    return (
                        <XStack style={{ alignItems: 'center', gap: 4 }}>
                            <Clock size={11} color={color} />
                            <Text
                                style={{
                                    fontFamily: SANS_MEDIUM,
                                    fontSize: 11,
                                    color,
                                    fontWeight: urgent ? '700' : '500',
                                }}
                            >
                                Duyệt trước: {formatExpiry(item.deadline)}
                            </Text>
                        </XStack>
                    );
                })() : null}
            </XStack>

            {/* Signed: countdown for doctor to claim */}
            {isSigned && timeLeft ? (
                <View
                    style={{
                        marginTop: 8,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        backgroundColor: timeLeft.expired ? `${EHR_DANGER}14` : `${EHR_TERTIARY}14`,
                    }}
                >
                    <Text
                        style={{
                            fontFamily: SANS_MEDIUM,
                            fontSize: 12.5,
                            color: timeLeft.expired ? EHR_DANGER : EHR_TERTIARY,
                            textAlign: 'center',
                            fontWeight: '600',
                        }}
                    >
                        {timeLeft.expired
                            ? 'Bác sĩ chưa nhận kịp. Bạn có thể duyệt lại nếu cần.'
                            : `Bạn đã duyệt. ${timeLeft.text} để bác sĩ nhận.`}
                    </Text>
                </View>
            ) : null}

            {/* Approve / Archive */}
            {isPending ? (
                <XStack style={{ justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <View>
                        <ViButton
                            variant="ghost"
                            size="sm"
                            onPress={() => onArchive(item)}
                            disabled={isApproving}
                            leftIcon={<X size={14} color={EHR_OUTLINE} />}
                        >
                            Ẩn
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
            ) : null}
        </ViCard>
    );
});

export default function RequestsScreen() {
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
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['right', 'left']}>
            {/* Hero header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 }}>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 26,
                        color: EHR_ON_SURFACE,
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
                        color: EHR_ON_SURFACE_VARIANT,
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
                                borderColor: active ? EHR_ON_SURFACE : EHR_OUTLINE_SOFT,
                                backgroundColor: active ? EHR_ON_SURFACE : 'transparent',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_MEDIUM,
                                    fontSize: 12,
                                    color: active ? EHR_SURFACE : EHR_ON_SURFACE_VARIANT,
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
                    <Bell size={28} color={EHR_OUTLINE} />
                    <Text
                        style={{
                            marginTop: 12,
                            fontFamily: SERIF,
                            fontSize: 18,
                            color: EHR_ON_SURFACE,
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
                            color: EHR_OUTLINE,
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
                            onArchive={handleArchive}
                            isApproving={approvingId === (item.requestId || item.id)}
                        />
                    )}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefreshing}
                            onRefresh={refresh}
                            tintColor={EHR_ON_SURFACE_VARIANT}
                        />
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}
