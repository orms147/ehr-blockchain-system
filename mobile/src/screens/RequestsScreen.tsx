import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Check, X, Clock, User, FilePlus2 } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import useRequests from '../hooks/useRequests';
import requestService from '../services/request.service';
// pendingUpdateService removed 2026-04-19 — doctor updates now go direct on-chain.
import authService from '../services/auth.service';
import consentService from '../services/consent.service';
import keyShareService from '../services/keyShare.service';
import recordService from '../services/record.service';
import { getOrCreateEncryptionKeypair, encryptForRecipient, decryptFromSender } from '../services/nacl-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import walletActionService from '../services/walletAction.service';
import {
    EHR_ERROR,
    EHR_ERROR_CONTAINER,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SECONDARY,
    EHR_SECONDARY_CONTAINER,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
    EHR_TERTIARY,
    EHR_TERTIARY_FIXED,
} from '../constants/uiColors';
import { formatDateTime, formatExpiry, getExpiryUrgency } from '../utils/dateFormatting';

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

const formatDuration = (item: RequestItem) => {
    // 1) Prefer explicit hour fields
    let hours: number | null = null;
    if (item.consentDurationHours != null) hours = Number(item.consentDurationHours);
    else if (item.durationHours != null) hours = Number(item.durationHours);
    else if (item.durationDays != null) hours = Number(item.durationDays) * 24;
    // 2) Fallback: derive from deadline - createdAt
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

type FilterKey = 'all' | 'pending' | 'approved' | 'rejected';

const formatDate = (dateStr?: string) => formatDateTime(dateStr);

const getRequestTypeLabel = (reqType?: number) => {
    switch (reqType) {
        case 0: return 'Đọc & cập nhật';
        case 1: return 'Ủy quyền toàn bộ';
        case 2: return 'Đọc & ủy quyền lại';
        case 2: return 'Khẩn cấp';
        default: return 'Không rõ';
    }
};

// Map internal recordType codes to Vietnamese labels for patient-facing UI.
// Codes come from CreateRecordScreen.tsx / DoctorCreateUpdateScreen.tsx typeOptions.
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

const getStatusLabel = (status?: string) => {
    switch (String(status || 'pending').toLowerCase()) {
        case 'approved': return 'Đã duyệt';
        case 'signed': return 'Chờ bác sĩ nhận';
        case 'rejected': return 'Đã từ chối';
        default: return 'Chờ duyệt';
    }
};

const getStatusColor = (status?: string) => {
    switch (String(status || 'pending').toLowerCase()) {
        case 'approved': return { bg: EHR_PRIMARY_FIXED, text: EHR_PRIMARY };
        case 'signed': return { bg: '#FEF3C7', text: '#92400E' };
        case 'rejected': return { bg: EHR_ERROR_CONTAINER, text: EHR_ERROR };
        default: return { bg: EHR_SECONDARY_CONTAINER, text: EHR_SECONDARY };
    }
};

const getSignatureTimeLeft = (deadline?: string | null) => {
    if (!deadline) return null;
    const deadlineMs = Number(deadline) * 1000;
    const diffMs = deadlineMs - Date.now();
    if (diffMs <= 0) return { text: 'Đã hết hạn', expired: true };
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return { text: `Còn ${hours}h${mins > 0 ? `${mins}p` : ''} để bác sĩ nhận`, expired: false };
    return { text: `Còn ${mins} phút để bác sĩ nhận`, expired: false };
};

const truncateAddr = (addr?: string) => addr ? `${addr.substring(0, 8)}...${addr.slice(-4)}` : '???';

const RequestRenderItem = React.memo(({
    item,
    onApprove,
    onArchive,
    isApproving,
}: {
    item: RequestItem;
    onApprove: (r: RequestItem) => void;
    onArchive: (r: RequestItem) => void;
    isApproving?: boolean;
}) => {
    const normalizedStatus = (item.status || 'pending').toLowerCase();
    const statusStyle = getStatusColor(normalizedStatus);
    const isPending = normalizedStatus === 'pending';
    const isSigned = normalizedStatus === 'signed';
    const timeLeft = isSigned ? getSignatureTimeLeft(item.signatureDeadline) : null;

    return (
        <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: isSigned && timeLeft?.expired ? '#FECACA' : EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 12 }}>
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <YStack style={{ flex: 1, paddingRight: 10 }}>
                    <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 4 }}>Yêu cầu truy cập hồ sơ</Text>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <User size={14} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 4 }} />
                        <Text fontSize="$3" color="$color10" numberOfLines={1}>
                            {truncateAddr(item.requesterAddress)}
                        </Text>
                    </XStack>
                </YStack>
                <View style={{ backgroundColor: statusStyle.bg, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <Text style={{ color: statusStyle.text, fontSize: 12, fontWeight: '700' }}>{getStatusLabel(normalizedStatus)}</Text>
                </View>
            </XStack>

            {/* Record identification panel — patient needs to know WHICH record is being asked for. */}
            {item.requestType === 1 ? (
                <View style={{ backgroundColor: EHR_SECONDARY_CONTAINER, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <Text fontSize="$2" fontWeight="700" style={{ color: EHR_SECONDARY, marginBottom: 2 }}>
                        Uỷ quyền toàn bộ
                    </Text>
                    <Text fontSize="$2" color="$color11">
                        Áp dụng cho TẤT CẢ hồ sơ của bạn — không gắn với một hồ sơ cụ thể.
                    </Text>
                </View>
            ) : (
                <View style={{ backgroundColor: EHR_PRIMARY_FIXED, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: item.recordDescription ? 6 : 2 }}>
                        <FilePlus2 size={14} color={EHR_PRIMARY} style={{ marginRight: 6 }} />
                        <Text fontSize="$3" fontWeight="700" style={{ color: EHR_PRIMARY, flex: 1 }} numberOfLines={1}>
                            {item.recordTitle || 'Hồ sơ chưa rõ tên'}
                        </Text>
                    </XStack>
                    {item.recordDescription ? (
                        <Text fontSize="$2" color="$color11" style={{ marginBottom: 4, lineHeight: 18 }} numberOfLines={3}>
                            {item.recordDescription}
                        </Text>
                    ) : null}
                    <XStack style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {item.recordType ? (
                            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 }}>
                                <Text fontSize="$1" style={{ color: EHR_PRIMARY, fontWeight: '600' }}>
                                    {getRecordTypeLabel(item.recordType)}
                                </Text>
                            </View>
                        ) : null}
                        {item.recordCreatedAt ? (
                            <Text fontSize="$1" color="$color9">
                                Ngày tạo: {formatDate(item.recordCreatedAt)}
                            </Text>
                        ) : null}
                        {item.parentCidHash ? (
                            <Text fontSize="$1" color="$color9">
                                • Bản cập nhật
                            </Text>
                        ) : null}
                    </XStack>
                </View>
            )}

            <XStack style={{ alignItems: 'center', marginBottom: isPending ? 12 : 0, flexWrap: 'wrap', gap: 6 }}>
                <View style={{ backgroundColor: EHR_PRIMARY_FIXED, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 }}>
                    <Text fontSize="$2" fontWeight="700" style={{ color: EHR_PRIMARY }}>
                        Loại: {getRequestTypeLabel(item.requestType)}
                    </Text>
                </View>
                {formatDuration(item) ? (
                    <View style={{ backgroundColor: EHR_SECONDARY_CONTAINER, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 }}>
                        <Text fontSize="$2" fontWeight="700" style={{ color: EHR_SECONDARY }}>
                            Thời lượng: {formatDuration(item)}
                        </Text>
                    </View>
                ) : null}
                <XStack style={{ alignItems: 'center' }}>
                    <Clock size={12} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 4 }} />
                    <Text fontSize="$2" color="$color9">{formatDate(item.createdAt)}</Text>
                </XStack>
                {item.deadline && isPending ? (() => {
                    const urgency = getExpiryUrgency(item.deadline);
                    const urgent = urgency === 'urgent' || urgency === 'soon';
                    const color = urgency === 'expired' ? EHR_ERROR : urgent ? '#B45309' : EHR_ON_SURFACE_VARIANT;
                    return (
                        <XStack style={{ alignItems: 'center' }}>
                            <Clock size={12} color={color} style={{ marginRight: 4 }} />
                            <Text fontSize="$2" style={{ color }} fontWeight={urgent ? '700' : '500'}>
                                Duyệt trước: {formatExpiry(item.deadline)}
                            </Text>
                        </XStack>
                    );
                })() : null}
            </XStack>

            {/* Signed: show countdown for doctor to claim */}
            {isSigned && timeLeft ? (
                <View style={{
                    backgroundColor: timeLeft.expired ? '#FEF2F2' : '#F0FDF4',
                    borderRadius: 10,
                    padding: 10,
                    marginTop: 8,
                }}>
                    <Text
                        fontSize="$3"
                        fontWeight="600"
                        style={{ color: timeLeft.expired ? '#DC2626' : '#166534', textAlign: 'center' }}
                    >
                        {timeLeft.expired
                            ? 'Bác sĩ chưa nhận kịp. Bạn có thể duyệt lại nếu cần.'
                            : `Bạn đã duyệt. ${timeLeft.text}.`
                        }
                    </Text>
                </View>
            ) : null}

            {isPending ? (
                <XStack style={{ justifyContent: 'flex-end', gap: 8 }}>
                    <Button size="$3" variant="outlined" borderColor={EHR_OUTLINE_VARIANT} pressStyle={{ background: EHR_SURFACE_LOW }} icon={<X size={15} color={EHR_ON_SURFACE_VARIANT} />} onPress={() => onArchive(item)} disabled={isApproving}>
                        <Text color="$color11" fontWeight="500">Ẩn</Text>
                    </Button>
                    <Button size="$3" background={EHR_PRIMARY} pressStyle={{ background: EHR_PRIMARY }} icon={<Check size={15} color="white" />} onPress={() => onApprove(item)} disabled={isApproving}>
                        <Text color="white" fontWeight="500">{isApproving ? 'Đang xử lý...' : 'Chấp nhận'}</Text>
                    </Button>
                </XStack>
            ) : null}
        </View>
    );
});

export default function RequestsScreen() {
    const { requests, isLoading, isRefreshing, refresh } = useRequests();
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
    const [approvingId, setApprovingId] = useState<string | null>(null);

    const handleRefreshAll = useCallback(() => {
        refresh();
    }, [refresh]);

    const normalizedRequests = useMemo(() => {
        return (requests || []).map((r: RequestItem) => ({
            ...r,
            status: String(r.status || 'pending').toLowerCase(),
        }));
    }, [requests]);

    const counts = useMemo(() => ({
        all: normalizedRequests.length,
        pending: normalizedRequests.filter((r) => r.status === 'pending').length,
        approved: normalizedRequests.filter((r) => r.status === 'approved' || r.status === 'signed').length,
        rejected: normalizedRequests.filter((r) => r.status === 'rejected').length,
    }), [normalizedRequests]);

    const filteredRequests = useMemo(() => {
        if (activeFilter === 'all') return normalizedRequests;
        if (activeFilter === 'approved') return normalizedRequests.filter((r) => r.status === 'approved' || r.status === 'signed');
        return normalizedRequests.filter((r) => r.status === activeFilter);
    }, [activeFilter, normalizedRequests]);

    const handleApprove = useCallback(async (request: RequestItem) => {
        const reqId = request.requestId || request.id;
        if (!reqId) { Alert.alert('Lỗi', 'Thiếu mã yêu cầu'); return; }
        if (approvingId) return; // prevent double tap

        // Pre-check: doctor verification status (same as RecordDetailScreen share flow).
        // If doctor is unverified, warn patient that the record will only be
        // readable AFTER the doctor gets verified by an organization on-chain.
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
                            { cancelable: true, onDismiss: () => resolve(false) }
                        );
                    });
                    if (!confirmed) return;
                }
            } catch {
                // If check fails, continue with approval — on-chain is the final gate
            }
        }

        // BUG-E fix: Option B downgrade check at approve time.
        // Contract overwrites `_consents[keccak256(P, doctor, root)]` — a second
        // request with weaker permissions silently destroys the previous grant.
        // Mirror the RecordDetailScreen guard so patient is warned before approving
        // a request that lowers existing permissions. Skip for FullDelegation
        // (type 1) which has no cidHash to look up.
        if (request.cidHash && request.requestType !== 1 && doctorAddr) {
            try {
                const existing: any = await keyShareService.getKeyForRecord(request.cidHash);
                // `existing` is the doctor's KeyShare row — only present when doctor
                // already has access. status 'revoked'/'rejected' means previous consent
                // is already dead; skip the downgrade guard.
                const alreadyActive = existing?.status && existing.status !== 'revoked' && existing.status !== 'rejected';
                if (alreadyActive) {
                    const oldAllowDelegate = existing.allowDelegate === true;
                    // Request types: 0=DirectAccess, 2=RecordDelegation, 1=FullDelegation (skipped above)
                    const newAllowDelegate = request.requestType === 2;

                    // Duration comparison: null expiry = forever (Infinity)
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
                                { cancelable: true, onDismiss: () => resolve(false) }
                            );
                        });
                        if (!confirmed) return;
                    }
                }
            } catch {
                // Check failed (no existing KeyShare, network error, etc.) — allow approval to proceed.
            }
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

            // Helper: resolve {cid, aesKey} for a given cidHash.
            // Order: AsyncStorage (fast path) → self-share backup on server (fallback).
            // The self-share fallback handles versions the doctor created that the
            // patient has never decrypted on this device — without it, cascade
            // silently skips them and the doctor ends up with ancestor-fallback
            // payloads that decrypt to the WRONG version's content.
            const resolveLocalKey = async (
                cidHash: string,
                localMap: Record<string, any>,
                myKeypair: { publicKey: string; secretKey: string }
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
                    // Cache so subsequent shares + decrypt calls are instant.
                    localMap[cidHash] = {
                        ...(localMap[cidHash] || {}),
                        cid: parsed.cid,
                        aesKey: parsed.aesKey,
                    };
                    await AsyncStorage.setItem('ehr_local_records', JSON.stringify(localMap));
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
                const localRecordsStr = await AsyncStorage.getItem('ehr_local_records');
                const localRecords = localRecordsStr ? JSON.parse(localRecordsStr) : {};
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

            await (requestService as any).approveWithSignature(
                reqId, signature, deadline,
                encryptedKeyPayload || undefined,
                request.cidHash || undefined,
                senderPublicKey || undefined
            );

            // CASCADE: share keys for ALL other versions in the record chain
            // (parent + children) so doctor can view the full history — same as
            // RecordDetailScreen.performShare cascade logic.
            try {
                const localRecordsStr2 = await AsyncStorage.getItem('ehr_local_records');
                const localRecords2 = localRecordsStr2 ? JSON.parse(localRecordsStr2) : {};
                const myKeypair2 = await getOrCreateEncryptionKeypair(
                    (await walletActionService.getWalletContext()).walletClient, address
                );
                const docKeyRes2 = await authService.getEncryptionKey(request.requesterAddress);
                const doctorPubKey2 = docKeyRes2?.encryptionPublicKey;

                if (doctorPubKey2 && request.cidHash) {
                    const chainRes: any = await recordService.getChainCids(request.cidHash);
                    const allVersions = (chainRes?.records || []).filter(
                        (v: any) => v?.cidHash && v.cidHash !== request.cidHash
                    );

                    // Compute KeyShare.expiresAt from consentDurationHours so the
                    // cascade rows match the on-chain consent lifetime instead of
                    // defaulting to null ("Vĩnh viễn").
                    const cascadeExpiresAt = request.consentDurationHours
                        ? new Date(Date.now() + request.consentDurationHours * 3600 * 1000).toISOString()
                        : null;
                    for (const v of allVersions) {
                        // Same fallback as main flow: if patient doesn't have this
                        // version's aesKey in AsyncStorage, pull it from their
                        // self-share backup on the server before sharing to doctor.
                        const vKey = await resolveLocalKey(v.cidHash, localRecords2, myKeypair2);
                        if (!vKey) continue;
                        const vPayload = JSON.stringify({ cid: vKey.cid, aesKey: vKey.aesKey });
                        const vEncrypted = encryptForRecipient(vPayload, doctorPubKey2, myKeypair2.secretKey);
                        try {
                            await keyShareService.shareKey({
                                cidHash: v.cidHash,
                                recipientAddress: request.requesterAddress || '',
                                encryptedPayload: vEncrypted,
                                senderPublicKey: myKeypair2.publicKey,
                                expiresAt: cascadeExpiresAt,
                            });
                        } catch (e) {
                            console.warn('Cascade keyShare failed for version', v.cidHash, e);
                        }
                    }
                }
            } catch (cascadeErr) {
                // Non-fatal — main approval succeeded, cascade is best-effort
                console.warn('Cascade keyShare error:', cascadeErr);
            }

            Alert.alert('Thành công', 'Đã phê duyệt và cấp quyền truy cập.');
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
        return <LoadingSpinner message={'Đang tải danh sách yêu cầu...'} />;
    }

    const allData: { type: 'request'; data: any }[] = [
        ...filteredRequests.map((r) => ({ type: 'request' as const, data: r })),
    ];

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['right', 'left']}>
            <YStack style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                <Text fontSize="$7" fontWeight="800" color="$color12">Yêu cầu truy cập</Text>
                <Text fontSize="$3" color="$color10" style={{ marginTop: 2, marginBottom: 10 }}>
                    Quản lý quyền xem hồ sơ từ bác sĩ
                </Text>
                <XStack style={{ gap: 8, flexWrap: 'wrap' }}>
                    {([
                        ['all', 'Tất cả'],
                        ['pending', 'Chờ duyệt'],
                        ['approved', 'Đã duyệt'],
                        ['rejected', 'Đã từ chối'],
                    ] as [FilterKey, string][]).map(([key, label]) => {
                        const active = key === activeFilter;
                        return (
                            <Button
                                key={key}
                                size="$2"
                                background={active ? EHR_PRIMARY : EHR_SURFACE_LOW}
                                borderColor={active ? EHR_PRIMARY : EHR_OUTLINE_VARIANT}
                                borderWidth={1}
                                pressStyle={{ opacity: 0.85 }}
                                onPress={() => setActiveFilter(key)}
                            >
                                <Text color={active ? 'white' : '$color11'} fontWeight="700">
                                    {label} ({counts[key]})
                                </Text>
                            </Button>
                        );
                    })}
                </XStack>
            </YStack>

            {allData.length === 0 ? (
                <EmptyState
                    icon={Bell}
                    message={'Không có yêu cầu nào'}
                    subMessage={activeFilter === 'all'
                        ? 'Khi bác sĩ yêu cầu truy cập hồ sơ, yêu cầu sẽ hiển thị ở đây.'
                        : 'Không có yêu cầu ở nhóm trạng thái này.'}
                />
            ) : (
                <FlatList
                    data={allData}
                    keyExtractor={(item, index) =>
                        item.data.id?.toString() || item.data.requestId || `request-${index}`
                    }
                    renderItem={({ item }) => (
                        <RequestRenderItem item={item.data} onApprove={handleApprove} onArchive={handleArchive} isApproving={approvingId === (item.data.requestId || item.data.id)} />
                    )}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefreshAll} colors={[EHR_PRIMARY]} />}
                    ListHeaderComponent={
                        <YStack style={{ marginBottom: 10 }}>
                            <Text fontSize="$3" color="$color10">{filteredRequests.length} yêu cầu</Text>
                        </YStack>
                    }
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}
