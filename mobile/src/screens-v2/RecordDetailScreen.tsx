// RecordDetailScreen v2 — port of .design-bundle/project/screens-patient.jsx
// RecordDetailScreen + ConsentSheet share modal. THIS IS THE LEGAL CORE of
// the thesis: consent ceremony, share modal with allowDelegate flag, biometric
// gate around signGrantConsent, cascade KeyShare across record chain versions.
//
// ALL BUSINESS LOGIC IS PRESERVED BIT-FOR-BIT from screens/RecordDetailScreen.tsx:
//
//   - decodeSharedKeyPayload: NaCl decrypt of KeyShare payload, with ancestor-key
//     warning + auto-claim
//   - saveLocalKey: only persist AES locally if iAmOwner (revocation-safe)
//   - handleDecrypt: tries local AES cache first for owner; otherwise round-trips
//     backend canAccess gate via decodeSharedKeyPayload (FIX audit #3)
//   - performShare: two on-chain paths
//       Path A: patient → consentService.grantConsentOnChain (EIP-712 relayer)
//       Path B: doctor → delegateOnChain (grantUsingRecordDelegation, doctor gas)
//     Both followed by cascade KeyShare across whole chain (resolveLocalKey
//     with self-share fallback for doctors w/o cached AES).
//   - handleShare: 3 pre-checks (recipient pubkey registered / doctor
//     verification status / downgrade block) before calling performShare.
//
// Visual layer is the only thing that changes — serif heading, ViCard sections,
// ViModeChip for share types, cinnabar reserved for the "Xác nhận chia sẻ"
// CTA (legal-action moment).

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Pressable,
    ScrollView,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QrCode, Lock, Clock, FileText, User, Share2, Unlock, X, FilePlus2, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { Text, XStack, YStack } from 'tamagui';

import recordService from '../services/record.service';
import useAuthStore from '../store/authStore';
import { getOrCreateEncryptionKeypair, decryptFromSender, encryptForRecipient } from '../services/nacl-crypto';
import { importAESKey, decryptData } from '../services/crypto';
import ipfsService from '../services/ipfs.service';
import keyShareService from '../services/keyShare.service';
import consentService, { delegateOnChain } from '../services/consent.service';
import walletActionService from '../services/walletAction.service';
import authService from '../services/auth.service';
import { computeCidHash } from '../utils/eip712';
import { formatChainError } from '../utils/rpcRetry';
import { normalizeBase64 } from '../utils/base64';
import localRecordStore from '../services/localRecordStore';
import { formatExpiry } from '../utils/dateFormatting';
import ViCard from '../components-v2/ViCard';
import ViButton from '../components-v2/ViButton';
import { ViSectionLabel, ViModeChip, ViSourceChip } from '../components-v2/ViChips';
import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SERIF_MEDIUM = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type RouteRecord = {
    cidHash?: string;
    title?: string;
    type?: string;
    date?: string;
    createdByDisplay?: string;
    createdAt?: string | null;
    createdBy?: string;
    ownerAddress?: string;
    allowDelegate?: boolean;
};

type DecryptedImage = {
    uri: string;
    fileName?: string;
};

function toDataUri(base64Data: string, contentType = 'image/jpeg') {
    if (base64Data.startsWith('data:')) return base64Data;
    return `data:${contentType};base64,${normalizeBase64(base64Data)}`;
}

function extractImageFromPayload(payload: any): DecryptedImage | null {
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.imageData === 'string' && payload.imageData.trim()) {
        const contentType = payload.imageContentType || payload?.attachment?.contentType || 'image/jpeg';
        return {
            uri: toDataUri(payload.imageData, contentType),
            fileName: payload?.attachment?.fileName || 'Ảnh đính kèm',
        };
    }
    const attachment = payload?.attachment;
    if (
        attachment
        && typeof attachment?.data === 'string'
        && attachment.data.trim()
        && String(attachment?.contentType || '').startsWith('image/')
    ) {
        return {
            uri: toDataUri(attachment.data, attachment.contentType),
            fileName: attachment.fileName || 'Ảnh đính kèm',
        };
    }
    return null;
}

function classifyDecryptError(error: any): string {
    const raw = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '');
    if (raw.includes('gcm authentication failed')) {
        return 'Khóa giải mã không khớp. Có thể hồ sơ đã được cập nhật key mới. Thử bấm "Giải mã" lại.';
    }
    if (code === 'KEY_SHARE_NOT_FOUND' || raw.includes('no key share found')) {
        return 'Bạn chưa được chia sẻ key cho hồ sơ này.';
    }
    if (code === 'KEY_NOT_SHARED_FOR_VERSION') {
        return 'Bệnh nhân chưa chia sẻ khoá giải mã cho đúng phiên bản này. Hãy yêu cầu bệnh nhân chia sẻ lại.';
    }
    if (code === 'KEY_SHARE_REVOKED' || raw.includes('revoked')) {
        return 'Bệnh nhân đã thu hồi quyền truy cập hồ sơ này. Vui lòng yêu cầu lại nếu cần.';
    }
    if (code === 'KEY_SHARE_EXPIRED' || raw.includes('expired')) {
        return 'Quyền truy cập đã hết hạn. Vui lòng yêu cầu gia hạn.';
    }
    if (code === 'CONSENT_NOT_FOUND') {
        return 'Chưa có quyền on-chain cho hồ sơ này. Vui lòng yêu cầu truy cập.';
    }
    if (code === 'DOCTOR_NOT_VERIFIED') {
        return 'Tài khoản bác sĩ của bạn chưa được tổ chức y tế xác minh on-chain. Liên hệ quản trị viên tổ chức để được duyệt.';
    }
    if (code === 'CREATOR_KEY_LOST') {
        return 'Khoá AES của hồ sơ chỉ được lưu trên thiết bị đã tạo. Hãy mở lại trên thiết bị cũ hoặc liên hệ quản trị viên để phục hồi.';
    }
    if (code === 'OWNER_KEY_MISSING') {
        return 'Chưa có khoá chia sẻ cho hồ sơ này. Có thể bác sĩ cập nhật chưa chia sẻ khoá cho bạn.';
    }
    if (code === 'BACKEND_UNREACHABLE' || raw.includes('network') || raw.includes('fetch')) {
        return 'Không kết nối được server. Kiểm tra kết nối mạng.';
    }
    return error?.message || 'Không thể giải mã hồ sơ. Vui lòng thử lại.';
}

export default function RecordDetailScreen({ route, navigation }: any) {
    const palette = useEhrPalette();
    const record: RouteRecord = route?.params?.record || {};
    const { user, activeRole } = useAuthStore();
    const me = String(user?.walletAddress || '').toLowerCase();
    const ownerAddrLc = String((record as any)?.ownerAddress || '').toLowerCase();
    const iAmDoctor = activeRole === 'doctor';
    const creatorAddrLc = String((record as any)?.createdBy || '').toLowerCase();
    const iAmOwner = !!me && (me === ownerAddrLc || me === creatorAddrLc);
    const isRecordOwner = !!me && me === ownerAddrLc;

    const [isDecrypting, setIsDecrypting] = useState(false);
    const [decryptedData, setDecryptedData] = useState<any>(null);
    const [decryptError, setDecryptError] = useState<string | null>(null);

    const { data: chain } = useQuery({
        queryKey: ['recordChain', record?.cidHash],
        queryFn: () => recordService.getRecordChain(record.cidHash!),
        enabled: !!record?.cidHash,
        staleTime: 60_000,
    });
    const { data: fullChain } = useQuery({
        queryKey: ['recordChainCids', record?.cidHash],
        queryFn: () => recordService.getChainCids(record.cidHash!),
        enabled: !!record?.cidHash,
        staleTime: 60_000,
    });

    const [showShareModal, setShowShareModal] = useState(false);
    const [shareAddress, setShareAddress] = useState('');
    const [isSharing, setIsSharing] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);
    const [showImageViewer, setShowImageViewer] = useState(false);

    const [shareExpiryHours, setShareExpiryHours] = useState<number | null>(24 * 7);
    const [customExpiryOpen, setCustomExpiryOpen] = useState(false);
    const [customExpiryValue, setCustomExpiryValue] = useState('');
    const [customExpiryUnit, setCustomExpiryUnit] = useState<'hour' | 'day'>('day');

    type ShareType = 'read-update' | 'read-delegate';
    const [shareType, setShareType] = useState<ShareType>('read-update');

    const decryptedImage = useMemo(() => extractImageFromPayload(decryptedData), [decryptedData]);

    const [ancestorKeyWarning, setAncestorKeyWarning] = useState(false);

    // ───────────────────────────────────────────────────────────────────
    //  decodeSharedKeyPayload — verbatim from screens/RecordDetailScreen.tsx
    // ───────────────────────────────────────────────────────────────────
    const decodeSharedKeyPayload = async (cidHash?: string) => {
        const sharedKey = await keyShareService.getKeyForRecord(cidHash);
        if (!sharedKey) {
            throw new Error('Không tìm thấy key giải mã. Có thể hồ sơ này chưa được chia sẻ key cho bạn.');
        }

        if (sharedKey.isAncestorKey) {
            setAncestorKeyWarning(true);
        }

        if (sharedKey.status === 'pending' && sharedKey.id) {
            try {
                keyShareService.claimKey(sharedKey.id);
            } catch (error) {
                console.warn('Auto-claim failed:', error);
            }
        }

        const { walletClient, address } = await walletActionService.getWalletContext();
        const myKeypair = await getOrCreateEncryptionKeypair(walletClient, address);

        let keyData: any;
        try {
            const decryptedPayload = decryptFromSender(sharedKey.encryptedPayload, sharedKey.senderPublicKey, myKeypair.secretKey);
            keyData = JSON.parse(decryptedPayload);
        } catch {
            try {
                const decodedString = Buffer.from(sharedKey.encryptedPayload, 'base64').toString('utf8');
                keyData = JSON.parse(decodedString);
            } catch {
                try {
                    keyData = JSON.parse(sharedKey.encryptedPayload);
                } catch {
                    throw new Error('Không thể giải mã key. Định dạng key không hợp lệ.');
                }
            }
        }

        if (keyData?.cid && keyData?.aesKey) {
            return { cid: keyData.cid, aesKeyString: keyData.aesKey };
        }
        if (keyData?.metadata?.cid && keyData?.aesKey) {
            return { cid: keyData.metadata.cid, aesKeyString: keyData.aesKey };
        }
        throw new Error('Key đã được mã hoá bằng khoá cũ hoặc không hợp lệ.');
    };

    const saveLocalKey = async (cidHash: string | undefined, cid: string, aesKeyString: string, title: string | undefined, isOwner: boolean) => {
        if (!cidHash) return;
        if (!isOwner) return;
        await localRecordStore.setKey(cidHash, {
            cid,
            aesKey: aesKeyString,
            title: title || 'Hồ sơ được chia sẻ',
        });
    };

    // ───────────────────────────────────────────────────────────────────
    //  performShare — verbatim from screens/RecordDetailScreen.tsx
    // ───────────────────────────────────────────────────────────────────
    const performShare = async (address: string, prefetchedRecipientPubKey?: string | null) => {
        const { walletClient, address: myAddress } = await walletActionService.getWalletContext();
        const myKeypair = await getOrCreateEncryptionKeypair(walletClient, myAddress);

        const resolveLocalKey = async (
            cidHash: string,
            localMap: Record<string, any>,
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
                console.warn('[Share] Self-share fallback failed for', cidHash, err);
                return null;
            }
        };

        const localRecords = await localRecordStore.getAll();
        const local = await resolveLocalKey(record.cidHash || '', localRecords);
        if (!local?.cid || !local?.aesKey) {
            Alert.alert(
                'Không tìm thấy khoá',
                'Hệ thống không có khoá chia sẻ cho phiên bản này. Hãy thử giải mã lại hồ sơ rồi chia sẻ.',
            );
            return;
        }

        let recipientPubKey = prefetchedRecipientPubKey || null;
        if (!recipientPubKey) {
            const recipientKeyRes = await authService.getEncryptionKey(address);
            recipientPubKey = recipientKeyRes?.encryptionPublicKey;
        }
        if (!recipientPubKey) {
            Alert.alert('Không tìm thấy khóa', 'Địa chỉ ví này chưa đăng ký khóa mã hoá trong hệ thống.');
            return;
        }

        const expiresAtMs = shareExpiryHours ? Date.now() + shareExpiryHours * 3600 * 1000 : 0;

        const shareCid = local.cid;
        const shareAesKey = local.aesKey;

        let grantResult: any;
        if (isRecordOwner) {
            grantResult = await consentService.grantConsentOnChain({
                granteeAddress: address,
                cid: shareCid,
                aesKey: shareAesKey,
                expiresAtMs,
                allowDelegate: shareType === 'read-delegate',
            });
        } else {
            const patientAddr = (record as any)?.ownerAddress || ownerAddrLc;
            if (!patientAddr) {
                Alert.alert('Lỗi', 'Không xác định được địa chỉ bệnh nhân (owner) của hồ sơ này.');
                return;
            }
            const shareCidHash = computeCidHash(shareCid);
            const delegateResult = await delegateOnChain({
                patientAddress: patientAddr,
                granteeAddress: address,
                rootCidHash: shareCidHash,
                aesKey: shareAesKey,
                expiresAtMs,
                senderConsentExpireAtSec: 0,
            });
            grantResult = {
                txHash: delegateResult.txHash,
                signaturesRemaining: '—',
                isDoctor: true,
                isVerifiedDoctor: true,
            };
        }

        const payload = JSON.stringify({ cid: local.cid, aesKey: local.aesKey });
        const encryptedPayload = encryptForRecipient(payload, recipientPubKey, myKeypair.secretKey);
        const allowDelegateFlag = shareType === 'read-delegate';

        await keyShareService.shareKey({
            cidHash: record.cidHash!,
            recipientAddress: address,
            encryptedPayload,
            senderPublicKey: myKeypair.publicKey,
            expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
            allowDelegate: allowDelegateFlag,
        });

        const cascadeFailures: Array<{ cidHash: string; title?: string; reason: string }> = [];
        const cascadeSkipped: Array<{ cidHash: string; title?: string; reason: string }> = [];
        try {
            let versionsToShare: any[] = [];
            try {
                const chainRes: any = await recordService.getChainCids(record.cidHash!);
                const all = chainRes?.records || [];
                versionsToShare = all.filter((v: any) => v?.cidHash && v.cidHash !== record.cidHash);
            } catch (e) {
                console.error('[Share] getChainCids failed, falling back to parent/children', e);
                if (chain?.parent?.cidHash && chain.parent.cidHash !== record.cidHash) {
                    versionsToShare.push(chain.parent);
                }
                (chain?.children || []).forEach((c: any) => {
                    if (c?.cidHash && c.cidHash !== record.cidHash) versionsToShare.push(c);
                });
            }

            await Promise.all(versionsToShare.map(async (v) => {
                const vKey = await resolveLocalKey(v.cidHash, localRecords);
                if (!vKey) {
                    cascadeSkipped.push({
                        cidHash: v.cidHash,
                        title: v.title,
                        reason: 'Bạn không có khoá giải mã (hồ sơ tạo trước khi bạn đăng ký khoá)',
                    });
                    return;
                }
                const vPayload = JSON.stringify({ cid: vKey.cid, aesKey: vKey.aesKey });
                const vEncrypted = encryptForRecipient(vPayload, recipientPubKey, myKeypair.secretKey);
                try {
                    await keyShareService.shareKey({
                        cidHash: v.cidHash,
                        recipientAddress: address,
                        encryptedPayload: vEncrypted,
                        senderPublicKey: myKeypair.publicKey,
                        expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
                        allowDelegate: allowDelegateFlag,
                    });
                } catch (e: any) {
                    console.error('[Share] Cascade keyShare failed for version', v.cidHash, e);
                    cascadeFailures.push({
                        cidHash: v.cidHash,
                        title: v.title,
                        reason: e?.response?.data?.message || e?.message || 'Lỗi không xác định',
                    });
                }
            }));
        } catch (e) {
            console.error('[Share] Cascade outer error', e);
        }

        setShowShareModal(false);
        setShareAddress('');

        const verifyWarn = grantResult.isDoctor && !grantResult.isVerifiedDoctor
            ? '\n\n⚠️ Bác sĩ này chưa được xác minh — họ sẽ chỉ đọc được hồ sơ sau khi tổ chức y tế xác minh.'
            : '';

        let title = 'Chia sẻ thành công';
        let body = `Đã cấp quyền on-chain (tx: ${grantResult.txHash.slice(0, 10)}…).\nCòn ${grantResult.signaturesRemaining} chữ ký miễn phí tháng này.${verifyWarn}`;
        if (cascadeFailures.length > 0 || cascadeSkipped.length > 0) {
            title = 'Chia sẻ một phần';
            const list = [
                ...cascadeFailures.map((f) => `• ${f.title || f.cidHash.slice(0, 10)}: ${f.reason}`),
                ...cascadeSkipped.map((s) => `• ${s.title || s.cidHash.slice(0, 10)}: ${s.reason}`),
            ].join('\n');
            body += `\n\nMột số phiên bản chưa thể chia sẻ — bác sĩ sẽ KHÔNG đọc được:\n${list}`;
        }
        Alert.alert(title, body);
    };

    // ───────────────────────────────────────────────────────────────────
    //  handleShare — verbatim from screens/RecordDetailScreen.tsx
    // ───────────────────────────────────────────────────────────────────
    const handleShare = async () => {
        const raw = shareAddress.trim();
        if (!raw) {
            Alert.alert('Thiếu địa chỉ', 'Vui lòng nhập địa chỉ ví của người nhận.');
            return;
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
            Alert.alert(
                'Địa chỉ sai định dạng',
                'Địa chỉ ví Ethereum phải bắt đầu bằng 0x và có đúng 40 ký tự hex (vd: 0xabc...123).',
            );
            return;
        }
        const address = raw.toLowerCase();

        setIsSharing(true);
        try {
            let recipientPub: string | null = null;
            try {
                const k = await authService.getEncryptionKey(address);
                recipientPub = k?.encryptionPublicKey || null;
            } catch {}
            if (!recipientPub) {
                Alert.alert(
                    'Người nhận chưa đăng ký',
                    'Địa chỉ này chưa đăng nhập vào hệ thống EHR hoặc chưa tạo khóa mã hoá. Hãy yêu cầu họ đăng nhập app trước khi bạn chia sẻ.',
                );
                setIsSharing(false);
                return;
            }

            let ctx: any = null;
            try {
                ctx = await consentService.fetchGrantContext(address);
            } catch {}

            if (ctx && !ctx.isDoctor) {
                const ok = await new Promise<boolean>((resolve) => {
                    Alert.alert(
                        'Không phải bác sĩ',
                        'Địa chỉ này không đăng ký là bác sĩ trong hệ thống. Bạn có chắc muốn chia sẻ hồ sơ y tế cho địa chỉ này?',
                        [
                            { text: 'Huỷ', style: 'cancel', onPress: () => resolve(false) },
                            { text: 'Vẫn chia sẻ', style: 'destructive', onPress: () => resolve(true) },
                        ],
                        { cancelable: true, onDismiss: () => resolve(false) },
                    );
                });
                if (!ok) { setIsSharing(false); return; }
            }

            if (ctx?.isDoctor && !ctx?.isVerifiedDoctor) {
                const confirmed = await new Promise<boolean>((resolve) => {
                    Alert.alert(
                        'Bác sĩ chưa xác minh',
                        'Địa chỉ này đăng ký là bác sĩ nhưng chưa được tổ chức y tế xác minh. Hồ sơ bạn chia sẻ sẽ CHỈ ĐỌC ĐƯỢC sau khi họ được xác minh. Tiếp tục?',
                        [
                            { text: 'Huỷ', style: 'cancel', onPress: () => resolve(false) },
                            { text: 'Vẫn chia sẻ', style: 'destructive', onPress: () => resolve(true) },
                        ],
                        { cancelable: true, onDismiss: () => resolve(false) },
                    );
                });
                if (!confirmed) {
                    setIsSharing(false);
                    return;
                }
            }

            if (iAmOwner && ctx?.isDoctor) {
                try {
                    const recipients = await keyShareService.getRecordRecipients(record.cidHash);
                    const existing = Array.isArray(recipients)
                        ? recipients.find((r: any) => r?.walletAddress?.toLowerCase() === address)
                        : null;
                    if (existing) {
                        const oldDelegate = existing.allowDelegate === true;
                        const newDelegate = shareType === 'read-delegate';
                        if (oldDelegate && !newDelegate) {
                            await new Promise<void>((resolve) => {
                                Alert.alert(
                                    'Bác sĩ đã có quyền cao hơn',
                                    'Bác sĩ này đã có quyền "Đọc & ủy quyền lại".\n\n' +
                                    'Để giới hạn xuống "Đọc & cập nhật", hãy THU HỒI quyền cũ trong "Nhật ký truy cập" trước, rồi chia sẻ lại.',
                                    [{ text: 'Đã hiểu', onPress: () => resolve() }],
                                    { cancelable: true, onDismiss: () => resolve() },
                                );
                            });
                            setIsSharing(false);
                            return;
                        }
                        const oldExpiryMs = existing.expiresAt
                            ? new Date(existing.expiresAt).getTime()
                            : Number.POSITIVE_INFINITY;
                        const newExpiryMs = shareExpiryHours
                            ? Date.now() + shareExpiryHours * 3600 * 1000
                            : Number.POSITIVE_INFINITY;
                        const oldStillActive = oldExpiryMs > Date.now();
                        if (oldStillActive && newExpiryMs < oldExpiryMs) {
                            await new Promise<void>((resolve) => {
                                Alert.alert(
                                    'Bác sĩ đã có quyền dài hạn hơn',
                                    `Quyền hiện tại hết hạn: ${formatExpiry(existing.expiresAt)}.\n\n` +
                                    'Để rút ngắn thời hạn, hãy THU HỒI quyền cũ trong "Nhật ký truy cập" trước, rồi chia sẻ lại với thời hạn mới.',
                                    [{ text: 'Đã hiểu', onPress: () => resolve() }],
                                    { cancelable: true, onDismiss: () => resolve() },
                                );
                            });
                            setIsSharing(false);
                            return;
                        }
                    }
                } catch {
                    // proceed
                }
            }

            await performShare(address, recipientPub);
        } catch (err: any) {
            console.warn('[Share] Raw error:', {
                code: err?.code,
                status: err?.status,
                dataCode: err?.data?.code,
                message: err?.message,
                dataMessage: err?.data?.message,
                stack: err?.stack?.slice(0, 500),
            });
            const raw = String(err?.data?.message || err?.data?.error || err?.message || '').toLowerCase();
            let title = 'Chia sẻ thất bại';
            let msg: string;
            if (raw.includes('quota') || raw.includes('miễn phí')) {
                title = 'Hết lượt miễn phí';
                msg = 'Bạn đã dùng hết lượt giao dịch on-chain miễn phí trong tháng. Hãy thử lại tháng sau hoặc dùng ví riêng.';
            } else {
                msg = formatChainError(err, 'Không thể chia sẻ hồ sơ. Vui lòng thử lại.');
            }
            Alert.alert(title, msg);
        } finally {
            setIsSharing(false);
        }
    };

    // ───────────────────────────────────────────────────────────────────
    //  handleDecrypt — verbatim from screens/RecordDetailScreen.tsx
    // ───────────────────────────────────────────────────────────────────
    const handleDecrypt = async () => {
        setIsDecrypting(true);
        setDecryptError(null);

        try {
            let cid: string | undefined;
            let aesKeyString: string | undefined;

            const { address: myAddress } = await walletActionService.getWalletContext();
            const meLc = String(myAddress || '').toLowerCase();
            const ownerAddr = String(record?.ownerAddress || '').toLowerCase();
            const creatorAddr = String(record?.createdBy || '').toLowerCase();
            const isOwnerLocal = !!meLc && (meLc === ownerAddr || meLc === creatorAddr);

            const localData = (await localRecordStore.getKey(record.cidHash || '')) || null;

            if (isOwnerLocal && localData?.cid && localData?.aesKey) {
                cid = localData.cid;
                aesKeyString = localData.aesKey;
            } else {
                const sharedPayload = await decodeSharedKeyPayload(record.cidHash);
                cid = sharedPayload.cid;
                aesKeyString = sharedPayload.aesKeyString;
            }

            if (!cid || !aesKeyString) {
                throw new Error('Thiếu cid hoặc khóa AES.');
            }

            let decrypted: any;
            try {
                const encryptedContent = await ipfsService.download(cid);
                const aesKey = await importAESKey(aesKeyString);
                decrypted = await decryptData(encryptedContent, aesKey);
            } catch (decryptErr: any) {
                const shouldRetryWithSharedKey = Boolean(localData)
                    && String(decryptErr?.message || '').includes('GCM Authentication Failed');
                if (!shouldRetryWithSharedKey) throw decryptErr;
                const sharedPayload = await decodeSharedKeyPayload(record.cidHash);
                cid = sharedPayload.cid;
                aesKeyString = sharedPayload.aesKeyString;
                const retryEncrypted = await ipfsService.download(cid);
                const retryAesKey = await importAESKey(aesKeyString);
                decrypted = await decryptData(retryEncrypted, retryAesKey);
            }

            setDecryptedData(decrypted);

            if (!cid || !aesKeyString) {
                throw new Error('Thiếu dữ liệu key sau khi giải mã.');
            }

            await saveLocalKey(record.cidHash, cid, aesKeyString, decrypted?.meta?.title || record.title, isOwnerLocal);
        } catch (error: any) {
            const message = classifyDecryptError(error);
            console.warn('Decrypt error:', error?.message || error);
            setDecryptError(message);
            Alert.alert('Lỗi giải mã', message);
        } finally {
            setIsDecrypting(false);
        }
    };

    // ───────────────────────────────────────────────────────────────────
    //  RENDER
    // ───────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['bottom', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 10, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {/* ───────── Header card ───────── */}
                <ViCard padding={18} style={{ marginBottom: 18 }}>
                    <View
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: palette.EHR_PRIMARY_FIXED,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 12,
                        }}
                    >
                        <FileText size={20} color={palette.EHR_PRIMARY} />
                    </View>
                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 22,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.3,
                            lineHeight: 28,
                            marginBottom: 10,
                        }}
                    >
                        {record.title || record.type || 'Hồ sơ y tế không tên'}
                    </Text>
                    <XStack style={{ alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Clock size={13} color={palette.EHR_TEXT_MUTED} />
                        <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_TEXT_MUTED }}>
                            {record.date || 'Không có ngày'}
                        </Text>
                    </XStack>
                    <XStack style={{ alignItems: 'center', gap: 8 }}>
                        <User size={13} color={palette.EHR_TEXT_MUTED} />
                        <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_TEXT_MUTED }}>
                            {record.createdByDisplay || 'Người tạo không rõ'}
                        </Text>
                    </XStack>
                </ViCard>

                {/* Share-back badge for non-owner with delegate flag */}
                {!iAmOwner && (record as any)?.allowDelegate ? (
                    <View style={{ marginBottom: 12, alignSelf: 'flex-start' }}>
                        <ViSourceChip source="via-delegate" />
                    </View>
                ) : null}

                {/* ───────── Decrypt section ───────── */}
                {!decryptedData ? (
                    <View
                        style={{
                            borderWidth: 0.75,
                            borderColor: decryptError ? palette.EHR_DANGER : palette.EHR_OUTLINE_SOFT,
                            borderRadius: 14,
                            padding: 16,
                            marginBottom: 18,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                        }}
                    >
                        <XStack style={{ alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Lock size={18} color={decryptError ? palette.EHR_DANGER : palette.EHR_PRIMARY} />
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 14,
                                    color: palette.EHR_ON_SURFACE,
                                    fontWeight: '700',
                                }}
                            >
                                Dữ liệu được mã hoá
                            </Text>
                        </XStack>
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 19,
                                marginBottom: 12,
                            }}
                        >
                            Hồ sơ này đã được mã hoá trên IPFS. Bạn cần giải mã bằng khoá chia sẻ để xem nội dung.
                        </Text>
                        {decryptError ? (
                            <Text
                                style={{
                                    marginBottom: 12,
                                    fontFamily: SANS,
                                    fontSize: 12.5,
                                    color: palette.EHR_DANGER,
                                    lineHeight: 18,
                                }}
                            >
                                {decryptError}
                            </Text>
                        ) : null}
                        <ViButton
                            variant="primary"
                            full
                            loading={isDecrypting}
                            leftIcon={isDecrypting ? undefined : <Unlock size={16} color={palette.EHR_SURFACE} />}
                            onPress={handleDecrypt}
                        >
                            {isDecrypting ? 'Đang giải mã…' : 'Giải mã nội dung'}
                        </ViButton>
                    </View>
                ) : (
                    <DecryptedContent
                        data={decryptedData}
                        decryptedImage={decryptedImage}
                        ancestorKeyWarning={ancestorKeyWarning}
                        onOpenImage={() => setShowImageViewer(true)}
                    />
                )}

                {/* ───────── Version chain ───────── */}
                {(fullChain?.records && fullChain.records.length > 1)
                    || (chain && (chain.parent || (chain.children && chain.children.length > 0))) ? (
                    <YStack style={{ marginBottom: 18 }}>
                        <XStack style={{ alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                            <Text
                                style={{
                                    fontFamily: SERIF,
                                    fontSize: 18,
                                    color: palette.EHR_ON_SURFACE,
                                    letterSpacing: -0.2,
                                }}
                            >
                                Chuỗi phiên bản
                            </Text>
                            <View
                                style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 3,
                                    borderRadius: 999,
                                    backgroundColor: palette.EHR_PRIMARY_FIXED,
                                }}
                            >
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 10.5,
                                        fontWeight: '700',
                                        color: palette.EHR_PRIMARY,
                                    }}
                                >
                                    v{chain?.version || 1}
                                </Text>
                            </View>
                        </XStack>
                        {(() => {
                            const all: any[] = [];
                            const currentHashLc = String(record.cidHash || '').toLowerCase();
                            if (fullChain?.records && fullChain.records.length > 0) {
                                for (const r of fullChain.records) {
                                    const isCur = String(r.cidHash || '').toLowerCase() === currentHashLc;
                                    all.push({ ...r, _role: isCur ? 'current' : 'other' });
                                }
                            } else {
                                if (chain?.parent) all.push({ ...chain.parent, _role: 'parent' });
                                all.push({
                                    cidHash: record.cidHash,
                                    title: record.title,
                                    createdAt: (record as any)?.createdAt,
                                    createdBy: (record as any)?.createdBy,
                                    _role: 'current',
                                });
                                (chain?.children || []).forEach((c: any) => all.push({ ...c, _role: 'child' }));
                            }
                            return (
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={{ paddingVertical: 2, paddingRight: 8 }}
                                >
                                    {all.map((v, idx) => {
                                        const isCurrent = v._role === 'current';
                                        const onPress = isCurrent
                                            ? undefined
                                            : () => navigation.replace('RecordDetail', {
                                                record: { ...v, createdAt: v?.createdAt ? new Date(v.createdAt).toISOString() : null },
                                            });
                                        return (
                                            <React.Fragment key={v.cidHash || idx}>
                                                <Pressable onPress={onPress} disabled={isCurrent}>
                                                    <View
                                                        style={{
                                                            width: 160,
                                                            backgroundColor: isCurrent ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE_LOWEST,
                                                            borderRadius: 14,
                                                            borderWidth: isCurrent ? 1.5 : 0.75,
                                                            borderColor: isCurrent ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                                            padding: 12,
                                                            marginRight: 10,
                                                        }}
                                                    >
                                                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                            <View
                                                                style={{
                                                                    paddingHorizontal: 8,
                                                                    paddingVertical: 2,
                                                                    borderRadius: 999,
                                                                    backgroundColor: isCurrent ? palette.EHR_PRIMARY : palette.EHR_SURFACE,
                                                                }}
                                                            >
                                                                <Text
                                                                    style={{
                                                                        fontFamily: SANS_SEMI,
                                                                        fontSize: 10,
                                                                        fontWeight: '700',
                                                                        color: isCurrent ? '#FAF7F1' : palette.EHR_OUTLINE,
                                                                    }}
                                                                >
                                                                    v{idx + 1}
                                                                </Text>
                                                            </View>
                                                            {isCurrent ? (
                                                                <Text
                                                                    style={{
                                                                        fontFamily: SANS_SEMI,
                                                                        fontSize: 10,
                                                                        fontWeight: '700',
                                                                        color: palette.EHR_PRIMARY,
                                                                        letterSpacing: 0.4,
                                                                    }}
                                                                >
                                                                    HIỆN TẠI
                                                                </Text>
                                                            ) : null}
                                                        </XStack>
                                                        <Text
                                                            style={{
                                                                fontFamily: SANS_MEDIUM,
                                                                fontSize: 13,
                                                                color: palette.EHR_ON_SURFACE,
                                                                fontWeight: '500',
                                                                marginBottom: 4,
                                                            }}
                                                            numberOfLines={2}
                                                        >
                                                            {v.title || `Phiên bản ${idx + 1}`}
                                                        </Text>
                                                        {v.createdAt ? (
                                                            <Text
                                                                style={{
                                                                    fontFamily: SANS,
                                                                    fontSize: 11,
                                                                    color: palette.EHR_TEXT_MUTED,
                                                                }}
                                                            >
                                                                {new Date(v.createdAt).toLocaleDateString('vi-VN')}
                                                            </Text>
                                                        ) : null}
                                                        <Text
                                                            style={{
                                                                marginTop: 2,
                                                                fontFamily: 'monospace',
                                                                fontSize: 10,
                                                                color: palette.EHR_TEXT_MUTED,
                                                            }}
                                                            numberOfLines={1}
                                                        >
                                                            {String(v.cidHash || '').slice(0, 14)}…
                                                        </Text>
                                                    </View>
                                                </Pressable>
                                                {idx < all.length - 1 ? (
                                                    <View style={{ alignSelf: 'center', marginRight: 10 }}>
                                                        <Text style={{ color: palette.EHR_TEXT_MUTED, fontSize: 16 }}>→</Text>
                                                    </View>
                                                ) : null}
                                            </React.Fragment>
                                        );
                                    })}
                                </ScrollView>
                            );
                        })()}
                    </YStack>
                ) : null}

                {/* ───────── Cập nhật hồ sơ ───────── */}
                {(iAmOwner || iAmDoctor) && (!chain?.children || chain.children.length === 0) ? (
                    <Pressable
                        onPress={() => {
                            if (iAmOwner) {
                                navigation.navigate('CreateRecord', {
                                    parentCidHash: record.cidHash,
                                    initialTitle: record.title,
                                    initialRecordType: (record as any)?.type || (record as any)?.recordType,
                                });
                            } else {
                                navigation.navigate('DoctorCreateUpdate', {
                                    parentCidHash: record.cidHash,
                                    patientAddress: ownerAddrLc,
                                });
                            }
                        }}
                        style={({ pressed }) => ({
                            marginBottom: 18,
                            paddingVertical: 14,
                            paddingHorizontal: 14,
                            borderRadius: 14,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <View
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                backgroundColor: palette.EHR_PRIMARY_FIXED,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <FilePlus2 size={18} color={palette.EHR_PRIMARY} />
                        </View>
                        <YStack style={{ flex: 1 }}>
                            <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 14, color: palette.EHR_ON_SURFACE, fontWeight: '500' }}>
                                Tạo phiên bản mới
                            </Text>
                            <Text style={{ fontFamily: SANS, fontSize: 11.5, color: palette.EHR_TEXT_MUTED, lineHeight: 16, marginTop: 2 }}>
                                {iAmOwner
                                    ? 'Liên kết với hồ sơ gốc; bên đã chia sẻ vẫn truy cập được.'
                                    : 'Key mới sẽ cascade tới mọi người đang có quyền.'}
                            </Text>
                        </YStack>
                    </Pressable>
                ) : null}

                {/* ───────── Share options ───────── */}
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 18,
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.2,
                        marginBottom: 12,
                    }}
                >
                    Tuỳ chọn chia sẻ
                </Text>
                <YStack style={{ gap: 10 }}>
                    <Pressable
                        onPress={() => {
                            if (!iAmOwner && !(record as any)?.allowDelegate) {
                                Alert.alert(
                                    'Không có quyền chia sẻ',
                                    'Hồ sơ này không cho phép bạn ủy quyền tiếp. Chỉ bệnh nhân hoặc bác sĩ được cấp quyền "allowDelegate" mới có thể chia sẻ lại.',
                                );
                                return;
                            }
                            setShowShareModal(true);
                        }}
                        style={({ pressed }) => ({
                            paddingVertical: 14,
                            paddingHorizontal: 14,
                            borderRadius: 14,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <View
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                backgroundColor: palette.EHR_PRIMARY_FIXED,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Share2 size={18} color={palette.EHR_PRIMARY} />
                        </View>
                        <YStack>
                            <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 14, color: palette.EHR_ON_SURFACE, fontWeight: '500' }}>
                                Chia sẻ qua địa chỉ ví
                            </Text>
                            <Text style={{ fontFamily: SANS, fontSize: 11.5, color: palette.EHR_TEXT_MUTED, marginTop: 2 }}>
                                Cấp quyền on-chain cho bác sĩ
                            </Text>
                        </YStack>
                    </Pressable>

                    <Pressable
                        onPress={() => setShowQrModal(true)}
                        style={({ pressed }) => ({
                            paddingVertical: 14,
                            paddingHorizontal: 14,
                            borderRadius: 14,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <View
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                backgroundColor: `${palette.EHR_SECONDARY}26`,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <QrCode size={18} color={palette.EHR_SECONDARY} />
                        </View>
                        <YStack>
                            <Text style={{ fontFamily: SANS_MEDIUM, fontSize: 14, color: palette.EHR_ON_SURFACE, fontWeight: '500' }}>
                                Hiển thị mã CID
                            </Text>
                            <Text style={{ fontFamily: SANS, fontSize: 11.5, color: palette.EHR_TEXT_MUTED, marginTop: 2 }}>
                                Cho bác sĩ nhập CID Hash để tìm hồ sơ
                            </Text>
                        </YStack>
                    </Pressable>
                </YStack>
            </ScrollView>

            {/* ───────── Share modal (ConsentSheet) ───────── */}
            <ShareModal
                visible={showShareModal}
                onClose={() => setShowShareModal(false)}
                shareAddress={shareAddress}
                setShareAddress={setShareAddress}
                shareType={shareType}
                setShareType={setShareType}
                showDelegateOption={isRecordOwner}
                shareExpiryHours={shareExpiryHours}
                setShareExpiryHours={setShareExpiryHours}
                customExpiryOpen={customExpiryOpen}
                setCustomExpiryOpen={setCustomExpiryOpen}
                customExpiryValue={customExpiryValue}
                setCustomExpiryValue={setCustomExpiryValue}
                customExpiryUnit={customExpiryUnit}
                setCustomExpiryUnit={setCustomExpiryUnit}
                onConfirm={handleShare}
                isSharing={isSharing}
            />

            {/* ───────── QR / CID modal ───────── */}
            <QrModal visible={showQrModal} onClose={() => setShowQrModal(false)} cidHash={record.cidHash} />

            {/* ───────── Fullscreen image viewer ───────── */}
            <Modal
                visible={showImageViewer}
                transparent
                animationType="fade"
                onRequestClose={() => setShowImageViewer(false)}
            >
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => setShowImageViewer(false)}
                >
                    {decryptedImage ? (
                        <Image
                            source={{ uri: decryptedImage.uri }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="contain"
                        />
                    ) : null}
                    <Pressable
                        onPress={() => setShowImageViewer(false)}
                        style={{
                            position: 'absolute',
                            top: 40,
                            right: 20,
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <X size={22} color="white" />
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

// ───────── DecryptedContent (KV-style sections) ─────────
function DecryptedContent({
    data,
    decryptedImage,
    ancestorKeyWarning,
    onOpenImage,
}: {
    data: any;
    decryptedImage: DecryptedImage | null;
    ancestorKeyWarning: boolean;
    onOpenImage: () => void;
}) {
    const palette = useEhrPalette();
    return (
        <View style={{ marginBottom: 18 }}>
            <XStack style={{ alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Unlock size={16} color={palette.EHR_TERTIARY} />
                <Text style={{ fontFamily: SANS_SEMI, fontSize: 13, color: palette.EHR_TERTIARY, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    Đã giải mã
                </Text>
            </XStack>

            {ancestorKeyWarning ? (
                <View
                    style={{
                        backgroundColor: `${palette.EHR_WARNING}1A`,
                        borderColor: `${palette.EHR_WARNING}50`,
                        borderWidth: 0.75,
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 12,
                        flexDirection: 'row',
                        gap: 8,
                    }}
                >
                    <Clock size={14} color={palette.EHR_WARNING} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontFamily: SANS, fontSize: 12, color: palette.EHR_ON_SURFACE, lineHeight: 18 }}>
                        Nội dung hiển thị là của phiên bản trước. Khoá giải mã cho phiên bản này chưa được chia sẻ — hãy yêu cầu bệnh nhân chia sẻ lại.
                    </Text>
                </View>
            ) : null}

            {decryptedImage ? (
                <YStack style={{ marginBottom: 12 }}>
                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 11, color: palette.EHR_TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontWeight: '700' }}>
                        Ảnh đính kèm
                    </Text>
                    <Pressable onPress={onOpenImage}>
                        <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 0.5, borderColor: palette.EHR_OUTLINE_SOFT }}>
                            <Image
                                source={{ uri: decryptedImage.uri }}
                                style={{ width: '100%', height: 220, backgroundColor: palette.EHR_SURFACE_LOWEST }}
                                resizeMode="cover"
                            />
                        </View>
                    </Pressable>
                    <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                        {decryptedImage.fileName || 'Ảnh đính kèm'} • Chạm để xem toàn màn hình
                    </Text>
                </YStack>
            ) : null}

            {data?.meta ? (
                <DecryptedSection title="Thông tin hồ sơ" accent={palette.EHR_PRIMARY}>
                    <KV label="Tiêu đề" value={data.meta.title || '—'} />
                    <KV label="Loại" value={data.meta.type || '—'} />
                    {data.meta.description ? (
                        <YStack style={{ marginTop: 6 }}>
                            <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, marginBottom: 2 }}>Mô tả</Text>
                            <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_ON_SURFACE, lineHeight: 20 }}>
                                {data.meta.description}
                            </Text>
                        </YStack>
                    ) : null}
                </DecryptedSection>
            ) : null}

            {data?.summary ? (
                <DecryptedSection title="Tóm tắt" accent={palette.EHR_SECONDARY}>
                    <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_ON_SURFACE, lineHeight: 21 }}>
                        {data.summary}
                    </Text>
                </DecryptedSection>
            ) : null}

            {data?.notes ? (
                <DecryptedSection title="Ghi chú lâm sàng" accent={palette.EHR_OUTLINE}>
                    <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_ON_SURFACE, lineHeight: 21 }}>
                        {data.notes}
                    </Text>
                </DecryptedSection>
            ) : null}

            {data?.observations && Object.keys(data.observations).length > 0 ? (
                <DecryptedSection title="Chỉ số lâm sàng" accent={palette.EHR_PRIMARY}>
                    {Object.entries(data.observations).map(([key, val]: any, idx: number, arr: any[]) => (
                        <XStack
                            key={key}
                            style={{
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingVertical: 8,
                                borderBottomWidth: idx === arr.length - 1 ? 0 : 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                            }}
                        >
                            <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_TEXT_MUTED, textTransform: 'capitalize' }}>
                                {key}
                            </Text>
                            <View
                                style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 3,
                                    borderRadius: 8,
                                    backgroundColor: palette.EHR_PRIMARY_FIXED,
                                }}
                            >
                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 13, color: palette.EHR_PRIMARY, fontWeight: '700' }}>
                                    {String(val)}
                                </Text>
                            </View>
                        </XStack>
                    ))}
                </DecryptedSection>
            ) : null}

            {data?.diagnoses?.length ? (
                <DecryptedSection title="Chẩn đoán" accent={palette.EHR_DANGER}>
                    {data.diagnoses.map((d: string, i: number) => (
                        <XStack key={i} style={{ alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                            <Text style={{ fontFamily: SANS_SEMI, fontSize: 13, color: palette.EHR_DANGER, fontWeight: '700' }}>•</Text>
                            <Text style={{ flex: 1, fontFamily: SANS, fontSize: 13, color: palette.EHR_ON_SURFACE, lineHeight: 20 }}>
                                {d}
                            </Text>
                        </XStack>
                    ))}
                </DecryptedSection>
            ) : null}

            {data?.prescriptions?.length ? (
                <DecryptedSection title="Đơn thuốc" accent={palette.EHR_TERTIARY}>
                    {data.prescriptions.map((p: any, i: number) => (
                        <View
                            key={i}
                            style={{
                                paddingVertical: 10,
                                paddingHorizontal: 12,
                                marginBottom: 6,
                                borderRadius: 10,
                                backgroundColor: palette.EHR_SURFACE,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                            }}
                        >
                            <Text style={{ fontFamily: SANS_SEMI, fontSize: 13, color: palette.EHR_ON_SURFACE, fontWeight: '700' }}>
                                {p.medication || 'Thuốc'}
                            </Text>
                            <XStack style={{ gap: 12, marginTop: 4 }}>
                                {p.dosage ? (
                                    <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_TEXT_MUTED }}>
                                        Liều:{' '}
                                        <Text style={{ fontFamily: SANS_SEMI, color: palette.EHR_ON_SURFACE, fontWeight: '700' }}>
                                            {p.dosage}
                                        </Text>
                                    </Text>
                                ) : null}
                                {p.frequency ? (
                                    <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_TEXT_MUTED }}>
                                        Tần suất:{' '}
                                        <Text style={{ fontFamily: SANS_SEMI, color: palette.EHR_ON_SURFACE, fontWeight: '700' }}>
                                            {p.frequency}
                                        </Text>
                                    </Text>
                                ) : null}
                            </XStack>
                        </View>
                    ))}
                </DecryptedSection>
            ) : null}
        </View>
    );
}

function DecryptedSection({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                backgroundColor: palette.EHR_SURFACE_LOWEST,
                borderRadius: 14,
                padding: 14,
                marginBottom: 12,
                borderLeftWidth: 3,
                borderLeftColor: accent,
                borderTopWidth: 0.5,
                borderBottomWidth: 0.5,
                borderRightWidth: 0.5,
                borderTopColor: palette.EHR_OUTLINE_SOFT,
                borderBottomColor: palette.EHR_OUTLINE_SOFT,
                borderRightColor: palette.EHR_OUTLINE_SOFT,
            }}
        >
            <Text
                style={{
                    fontFamily: SANS_SEMI,
                    fontSize: 11,
                    color: accent,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 8,
                    fontWeight: '700',
                }}
            >
                {title}
            </Text>
            {children}
        </View>
    );
}

function KV({ label, value }: { label: string; value: string }) {
    const palette = useEhrPalette();
    return (
        <XStack style={{ justifyContent: 'space-between', alignItems: 'baseline', marginVertical: 3 }}>
            <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_TEXT_MUTED }}>{label}</Text>
            <Text
                style={{
                    fontFamily: SANS_SEMI,
                    fontSize: 13,
                    color: palette.EHR_ON_SURFACE,
                    flex: 1,
                    textAlign: 'right',
                    fontWeight: '700',
                }}
            >
                {value}
            </Text>
        </XStack>
    );
}

// ───────── ShareModal (ConsentSheet) ─────────
function ShareModal(props: {
    visible: boolean;
    onClose: () => void;
    shareAddress: string;
    setShareAddress: (v: string) => void;
    shareType: 'read-update' | 'read-delegate';
    setShareType: (v: 'read-update' | 'read-delegate') => void;
    showDelegateOption: boolean;
    shareExpiryHours: number | null;
    setShareExpiryHours: (v: number | null) => void;
    customExpiryOpen: boolean;
    setCustomExpiryOpen: (v: boolean) => void;
    customExpiryValue: string;
    setCustomExpiryValue: (v: string) => void;
    customExpiryUnit: 'hour' | 'day';
    setCustomExpiryUnit: (v: 'hour' | 'day') => void;
    onConfirm: () => void;
    isSharing: boolean;
}) {
    const palette = useEhrPalette();
    const {
        visible, onClose, shareAddress, setShareAddress, shareType, setShareType,
        showDelegateOption, shareExpiryHours, setShareExpiryHours, customExpiryOpen,
        setCustomExpiryOpen, customExpiryValue, setCustomExpiryValue,
        customExpiryUnit, setCustomExpiryUnit, onConfirm, isSharing,
    } = props;

    const opts: { value: 'read-update' | 'read-delegate'; label: string; sub: string }[] = [
        { value: 'read-update', label: 'Đọc & cập nhật', sub: 'Bác sĩ đọc toàn bộ hồ sơ + các phiên bản sau' },
    ];
    if (showDelegateOption) {
        opts.push({ value: 'read-delegate', label: 'Đọc & uỷ quyền lại', sub: 'Bác sĩ đọc + có thể chia sẻ lại cho bác sĩ khác' });
    }

    const expiryChoices: { label: string; value: number | null }[] = [
        { label: 'Không giới hạn', value: null },
        { label: '5 phút (test)', value: 5 / 60 },
        { label: '10 phút (test)', value: 10 / 60 },
        { label: '1 giờ', value: 1 },
        { label: '24 giờ', value: 24 },
        { label: '7 ngày', value: 24 * 7 },
        { label: '30 ngày', value: 24 * 30 },
    ];

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
                <View
                    style={{
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                        borderTopLeftRadius: 24,
                        borderTopRightRadius: 24,
                        padding: 22,
                        paddingBottom: 36,
                        maxHeight: '90%',
                    }}
                >
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <Text style={{ fontFamily: SERIF, fontSize: 22, color: palette.EHR_ON_SURFACE, letterSpacing: -0.2 }}>
                            Chia sẻ hồ sơ
                        </Text>
                        <Pressable onPress={onClose} hitSlop={10}>
                            <X size={20} color={palette.EHR_TEXT_MUTED} />
                        </Pressable>
                    </XStack>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_ON_SURFACE_VARIANT, marginBottom: 12, lineHeight: 18 }}>
                            Nhập địa chỉ ví của bác sĩ. Khoá hồ sơ sẽ được mã hoá đầu-cuối cho ví đó.
                        </Text>
                        <TextInput
                            value={shareAddress}
                            onChangeText={setShareAddress}
                            placeholder="0x..."
                            placeholderTextColor={palette.EHR_OUTLINE}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={{
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                borderRadius: 10,
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                fontFamily: 'monospace',
                                fontSize: 13,
                                color: palette.EHR_ON_SURFACE,
                                backgroundColor: palette.EHR_SURFACE,
                                marginBottom: 16,
                            }}
                        />

                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 11, color: palette.EHR_TEXT_MUTED, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '600' }}>
                            Loại quyền truy cập
                        </Text>
                        <YStack style={{ gap: 8, marginBottom: 16 }}>
                            {opts.map((opt) => {
                                const active = shareType === opt.value;
                                return (
                                    <Pressable key={opt.value} onPress={() => setShareType(opt.value)}>
                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                borderWidth: active ? 1.5 : 0.5,
                                                borderColor: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                                borderRadius: 12,
                                                padding: 12,
                                                backgroundColor: active ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE,
                                            }}
                                        >
                                            <View
                                                style={{
                                                    width: 18,
                                                    height: 18,
                                                    borderRadius: 9,
                                                    borderWidth: 2,
                                                    borderColor: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_VARIANT,
                                                    backgroundColor: active ? palette.EHR_PRIMARY : 'transparent',
                                                    marginRight: 10,
                                                }}
                                            />
                                            <YStack style={{ flex: 1 }}>
                                                <XStack style={{ alignItems: 'center', gap: 8 }}>
                                                    <Text
                                                        style={{
                                                            fontFamily: SANS_SEMI,
                                                            fontSize: 13.5,
                                                            color: active ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE,
                                                            fontWeight: '700',
                                                        }}
                                                    >
                                                        {opt.label}
                                                    </Text>
                                                    <ViModeChip mode={opt.value} />
                                                </XStack>
                                                <Text style={{ fontFamily: SANS, fontSize: 11.5, color: palette.EHR_TEXT_MUTED, marginTop: 4 }}>
                                                    {opt.sub}
                                                </Text>
                                            </YStack>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </YStack>

                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 11, color: palette.EHR_TEXT_MUTED, marginBottom: 8, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '600' }}>
                            Thời hạn truy cập
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                            {expiryChoices.map((opt) => {
                                const active = !customExpiryOpen && shareExpiryHours === opt.value;
                                return (
                                    <Pressable
                                        key={opt.label}
                                        onPress={() => {
                                            setCustomExpiryOpen(false);
                                            setShareExpiryHours(opt.value);
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
                                                {opt.label}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                            <Pressable onPress={() => setCustomExpiryOpen(true)}>
                                <View
                                    style={{
                                        paddingHorizontal: 12,
                                        paddingVertical: 6,
                                        borderRadius: 999,
                                        borderWidth: 0.5,
                                        borderColor: customExpiryOpen ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                        backgroundColor: customExpiryOpen ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE,
                                    }}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_MEDIUM,
                                            fontSize: 12,
                                            color: customExpiryOpen ? palette.EHR_PRIMARY : palette.EHR_OUTLINE,
                                            fontWeight: customExpiryOpen ? '700' : '500',
                                        }}
                                    >
                                        Tuỳ chỉnh
                                    </Text>
                                </View>
                            </Pressable>
                        </View>

                        {customExpiryOpen ? (
                            <XStack style={{ gap: 8, marginBottom: 16, alignItems: 'center' }}>
                                <TextInput
                                    value={customExpiryValue}
                                    onChangeText={(text) => {
                                        const clean = text.replace(/[^0-9]/g, '');
                                        setCustomExpiryValue(clean);
                                        const num = parseInt(clean, 10);
                                        if (!Number.isNaN(num) && num > 0) {
                                            const hours = customExpiryUnit === 'day' ? num * 24 : num;
                                            setShareExpiryHours(hours);
                                        }
                                    }}
                                    placeholder="VD: 3"
                                    placeholderTextColor={palette.EHR_OUTLINE}
                                    keyboardType="number-pad"
                                    style={{
                                        flex: 1,
                                        borderWidth: 0.5,
                                        borderColor: palette.EHR_OUTLINE_SOFT,
                                        borderRadius: 10,
                                        padding: 10,
                                        fontFamily: SANS,
                                        fontSize: 13.5,
                                        color: palette.EHR_ON_SURFACE,
                                        backgroundColor: palette.EHR_SURFACE,
                                    }}
                                />
                                {(['hour', 'day'] as const).map((unit) => {
                                    const active = customExpiryUnit === unit;
                                    return (
                                        <Pressable
                                            key={unit}
                                            onPress={() => {
                                                setCustomExpiryUnit(unit);
                                                const num = parseInt(customExpiryValue, 10);
                                                if (!Number.isNaN(num) && num > 0) {
                                                    setShareExpiryHours(unit === 'day' ? num * 24 : num);
                                                }
                                            }}
                                        >
                                            <View
                                                style={{
                                                    paddingHorizontal: 14,
                                                    paddingVertical: 10,
                                                    borderRadius: 10,
                                                    borderWidth: 0.5,
                                                    borderColor: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                                                    backgroundColor: active ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE,
                                                }}
                                            >
                                                <Text
                                                    style={{
                                                        fontFamily: SANS_MEDIUM,
                                                        fontSize: 12.5,
                                                        color: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE,
                                                        fontWeight: active ? '700' : '500',
                                                    }}
                                                >
                                                    {unit === 'hour' ? 'Giờ' : 'Ngày'}
                                                </Text>
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </XStack>
                        ) : (
                            <View style={{ marginBottom: 16 }} />
                        )}

                        <ViButton
                            variant="cinnabar"
                            full
                            loading={isSharing}
                            onPress={isSharing ? undefined : onConfirm}
                        >
                            {isSharing ? 'Đang chia sẻ…' : 'Xác nhận chia sẻ'}
                        </ViButton>
                        <Text
                            style={{
                                marginTop: 10,
                                fontFamily: SANS,
                                fontSize: 11,
                                color: palette.EHR_TEXT_MUTED,
                                textAlign: 'center',
                                lineHeight: 16,
                            }}
                        >
                            Bạn sẽ ký bằng vân tay để cấp quyền on-chain.
                        </Text>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ───────── QrModal (CID QR + copy) ─────────
function QrModal({ visible, onClose, cidHash }: { visible: boolean; onClose: () => void; cidHash?: string }) {
    const palette = useEhrPalette();
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
                onPress={onClose}
            >
                <Pressable onPress={(e) => e.stopPropagation()}>
                    <View style={{ backgroundColor: palette.EHR_SURFACE_LOWEST, borderRadius: 20, padding: 22 }}>
                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <Text style={{ fontFamily: SERIF, fontSize: 20, color: palette.EHR_ON_SURFACE, letterSpacing: -0.2 }}>
                                CID Hash hồ sơ
                            </Text>
                            <Pressable onPress={onClose} hitSlop={10}>
                                <X size={20} color={palette.EHR_TEXT_MUTED} />
                            </Pressable>
                        </XStack>
                        <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_ON_SURFACE_VARIANT, marginBottom: 12, lineHeight: 18 }}>
                            Bác sĩ quét QR hoặc nhập CID Hash vào form yêu cầu truy cập.
                        </Text>
                        {cidHash ? (
                            <View
                                style={{
                                    alignSelf: 'center',
                                    backgroundColor: '#FAF7F1',
                                    padding: 14,
                                    borderRadius: 14,
                                    marginBottom: 14,
                                }}
                            >
                                <QRCode value={cidHash} size={220} backgroundColor="#FAF7F1" color={palette.EHR_PRIMARY} />
                            </View>
                        ) : null}
                        <View
                            style={{
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                borderRadius: 12,
                                backgroundColor: palette.EHR_PRIMARY_FIXED,
                            }}
                        >
                            <XStack style={{ alignItems: 'flex-start', gap: 10 }}>
                                <Text
                                    style={{
                                        flex: 1,
                                        fontFamily: 'monospace',
                                        fontSize: 12,
                                        color: palette.EHR_PRIMARY,
                                        lineHeight: 20,
                                    }}
                                    selectable
                                >
                                    {cidHash || 'Không có CID'}
                                </Text>
                                {cidHash ? (
                                    <Pressable
                                        onPress={async () => {
                                            await Clipboard.setStringAsync(cidHash);
                                            Alert.alert('Đã sao chép', 'CID Hash đã được sao chép vào clipboard.');
                                        }}
                                        hitSlop={10}
                                        style={{
                                            padding: 6,
                                            borderRadius: 8,
                                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                                        }}
                                    >
                                        <Copy size={14} color={palette.EHR_PRIMARY} />
                                    </Pressable>
                                ) : null}
                            </XStack>
                        </View>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

void ViSectionLabel;
