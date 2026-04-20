import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import recordService from '../services/record.service';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QrCode, Lock, Clock, FileText, User, Share2, Unlock, X, FilePlus2, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import useAuthStore from '../store/authStore';
import { YStack, XStack, Text, Button, View } from 'tamagui';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getOrCreateEncryptionKeypair, decryptFromSender, encryptForRecipient } from '../services/nacl-crypto';
import { importAESKey, decryptData } from '../services/crypto';
import ipfsService from '../services/ipfs.service';
import keyShareService from '../services/keyShare.service';
import consentService, { delegateOnChain } from '../services/consent.service';
import walletActionService from '../services/walletAction.service';
import authService from '../services/auth.service';
import { computeCidHash } from '../utils/eip712';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import {
    EHR_ERROR,
    EHR_ERROR_CONTAINER,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SECONDARY,
    EHR_SECONDARY_CONTAINER,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';
import { formatExpiry } from '../utils/dateFormatting';

type RouteRecord = {
    cidHash?: string;
    title?: string;
    type?: string;
    date?: string;
    createdByDisplay?: string;
};

type DecryptedImage = {
    uri: string;
    fileName?: string;
};

function normalizeBase64(data: string) {
    return data
        .replace(/^data:[^;]+;base64,/, '')
        .replace(/\s+/g, '')
        .trim();
}

function toDataUri(base64Data: string, contentType = 'image/jpeg') {
    if (base64Data.startsWith('data:')) {
        return base64Data;
    }
    return `data:${contentType};base64,${normalizeBase64(base64Data)}`;
}

function extractImageFromPayload(payload: any): DecryptedImage | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

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

export default function RecordDetailScreen({ route, navigation }: any) {
    const record: RouteRecord = route?.params?.record || {};
    const { user, activeRole } = useAuthStore();
    const me = String(user?.walletAddress || '').toLowerCase();
    const ownerAddrLc = String((record as any)?.ownerAddress || '').toLowerCase();
    const iAmDoctor = activeRole === 'doctor';
    const creatorAddrLc = String((record as any)?.createdBy || '').toLowerCase();
    const iAmOwner = !!me && (me === ownerAddrLc || me === creatorAddrLc);

    const [isDecrypting, setIsDecrypting] = useState(false);
    const [decryptedData, setDecryptedData] = useState<any>(null);

    const { data: chain } = useQuery({
        queryKey: ['recordChain', record?.cidHash],
        queryFn: () => recordService.getRecordChain(record.cidHash!),
        enabled: !!record?.cidHash,
        staleTime: 60_000,
    });
    // Full tree (all ancestors + all descendants) ordered by createdAt asc.
    // We use this for the "Chuỗi phiên bản" strip so mid-chain views don't
    // silently hide siblings/grandparents.
    const { data: fullChain } = useQuery({
        queryKey: ['recordChainCids', record?.cidHash],
        queryFn: () => recordService.getChainCids(record.cidHash!),
        enabled: !!record?.cidHash,
        staleTime: 60_000,
    });
    const [decryptError, setDecryptError] = useState<string | null>(null);

    // Share via address
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareAddress, setShareAddress] = useState('');
    const [isSharing, setIsSharing] = useState(false);

    // QR modal — hiển thị cidHash để bác sĩ nhập thủ công
    const [showQrModal, setShowQrModal] = useState(false);

    // Fullscreen image viewer
    const [showImageViewer, setShowImageViewer] = useState(false);

    // Share expiry (giờ). Null = không giới hạn.
    const [shareExpiryHours, setShareExpiryHours] = useState<number | null>(24 * 7);
    const [customExpiryOpen, setCustomExpiryOpen] = useState(false);
    const [customExpiryValue, setCustomExpiryValue] = useState('');
    const [customExpiryUnit, setCustomExpiryUnit] = useState<'hour' | 'day'>('day');

    // Share type (2026-04-19 medical episode model): chain-wide only.
    //   read-update    — sees whole chain, cannot re-share (default)
    //   read-delegate  — sees whole chain + can re-share (allowDelegate=true)
    type ShareType = 'read-update' | 'read-delegate';
    const [shareType, setShareType] = useState<ShareType>('read-update');

    const decryptedImage = useMemo(() => extractImageFromPayload(decryptedData), [decryptedData]);

    const [ancestorKeyWarning, setAncestorKeyWarning] = useState(false);

    const decodeSharedKeyPayload = async (cidHash?: string) => {
        const sharedKey = await keyShareService.getKeyForRecord(cidHash);
        if (!sharedKey) {
            throw new Error('Không tìm thấy key giải mã. Có thể hồ sơ này chưa được chia sẻ key cho bạn.');
        }

        // If backend returned a key from an ancestor version (different cidHash),
        // the decrypted content will be from that ancestor, not this version.
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

    const saveLocalKey = async (cidHash: string | undefined, cid: string, aesKeyString: string, title: string | undefined, iAmOwner: boolean) => {
        if (!cidHash) return;
        // SECURITY: only persist AES key locally if the current user is the record owner.
        // Caching shared-key for non-owner would let revoked/unverified doctors keep decrypting forever.
        if (!iAmOwner) return;

        const latestLocalRecordsString = await AsyncStorage.getItem('ehr_local_records');
        const latestRecords = latestLocalRecordsString ? JSON.parse(latestLocalRecordsString) : {};
        latestRecords[cidHash] = {
            ...(latestRecords[cidHash] || {}),
            cid,
            aesKey: aesKeyString,
            title: title || 'Hồ sơ được chia sẻ',
        };
        await AsyncStorage.setItem('ehr_local_records', JSON.stringify(latestRecords));
    };

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

    const performShare = async (address: string) => {
        // Load local CID + AES key
        const localStr = await AsyncStorage.getItem('ehr_local_records');
        const localRecords = localStr ? JSON.parse(localStr) : {};
        const local = localRecords[record.cidHash || ''];
        if (!local?.cid || !local?.aesKey) {
            Alert.alert('Chưa giải mã', 'Hãy giải mã hồ sơ trước khi chia sẻ để lấy khóa.');
            return;
        }

        // Get recipient NaCl public key
        const recipientKeyRes = await authService.getEncryptionKey(address);
        const recipientPubKey = recipientKeyRes?.encryptionPublicKey;
        if (!recipientPubKey) {
            Alert.alert('Không tìm thấy khóa', 'Địa chỉ ví này chưa đăng ký khóa mã hoá trong hệ thống.');
            return;
        }

        const expiresAtMs = shareExpiryHours ? Date.now() + shareExpiryHours * 3600 * 1000 : 0;

        // Pass the CURRENT version's cid as inputCidHash. Contract walks to the
        // canonical root internally, so storage location is identical whether
        // we pass V(n) or root. 2026-04-19: consent covers whole chain (no more
        // includeUpdates / anchor), so the only flag left is allowDelegate.
        const shareCid = local.cid;
        const shareAesKey = local.aesKey;

        // 1. ON-CHAIN CONSENT
        // Two paths depending on who is sharing:
        //   A. PATIENT (owner) → grantBySig via relayer (EIP-712, gasless)
        //   B. DOCTOR (delegated, allowDelegate=true) → grantUsingRecordDelegation
        //      (direct call, doctor pays gas, msg.sender must be the doctor)
        let grantResult: any;
        if (iAmOwner) {
            // Path A: patient signs EIP-712, relayer submits grantBySig
            grantResult = await consentService.grantConsentOnChain({
                granteeAddress: address,
                cid: shareCid,
                aesKey: shareAesKey,
                expiresAtMs,
                allowDelegate: shareType === 'read-delegate',
            });
        } else {
            // Path B: doctor re-shares via per-record delegation.
            // Contract: grantUsingRecordDelegation(patient, newGrantee, rootCidHash, encKeyHash, expireAt)
            // Requires sender to have consent with allowDelegate=true for this rootCidHash.
            // FIX audit #8: new consent MUST NOT outlive sender's own consent.
            const patientAddr = (record as any)?.ownerAddress || ownerAddrLc;
            if (!patientAddr) {
                Alert.alert('Lỗi', 'Không xác định được địa chỉ bệnh nhân (owner) của hồ sơ này.');
                return;
            }
            const shareCidHash = computeCidHash(shareCid);

            // Option B: check if grantee already has access → warn about overwrite
            try {
                const pc = createPublicClient({ chain: arbitrumSepolia, transport: http('https://sepolia-rollup.arbitrum.io/rpc') });
                const CONSENT_ADDR = process.env.EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS as `0x${string}`;
                const alreadyHas = await pc.readContract({
                    address: CONSENT_ADDR,
                    abi: [{ name: 'canAccess', type: 'function', stateMutability: 'view',
                        inputs: [{ name: 'p', type: 'address' }, { name: 'g', type: 'address' }, { name: 'c', type: 'bytes32' }],
                        outputs: [{ type: 'bool' }] }],
                    functionName: 'canAccess',
                    args: [patientAddr as `0x${string}`, address as `0x${string}`, shareCidHash],
                });
                if (alreadyHas) {
                    Alert.alert(
                        'Bác sĩ đã có quyền',
                        'Bác sĩ này đã có quyền truy cập. Chia sẻ sẽ GHI ĐÈ quyền cũ. Để thay đổi, bệnh nhân nên thu hồi quyền cũ trước.',
                        [{ text: 'Đã hiểu' }],
                    );
                    return;
                }
            } catch { /* proceed if check fails */ }

            // Read sender's own consent expiry to clamp the new grant.
            // If the record being viewed has an expiresAt from KeyShare, use that.
            // Otherwise read on-chain getConsent for exact expiry.
            let senderExpireSec = 0;
            try {
                const myKeyShare = await keyShareService.getKeyForRecord(record.cidHash);
                if (myKeyShare?.expiresAt) {
                    senderExpireSec = Math.floor(new Date(myKeyShare.expiresAt).getTime() / 1000);
                }
            } catch {}

            // Warn doctor if their own access is shorter than requested duration.
            if (senderExpireSec > 0 && expiresAtMs) {
                const requestedExpireSec = Math.floor(expiresAtMs / 1000);
                if (requestedExpireSec > senderExpireSec) {
                    const remainingH = Math.max(0, Math.floor((senderExpireSec * 1000 - Date.now()) / 3600000));
                    Alert.alert(
                        'Thời hạn bị giới hạn',
                        `Bạn chỉ còn ~${remainingH} giờ truy cập. Thời hạn chia sẻ cho bác sĩ mới sẽ bị giới hạn bằng thời hạn của bạn.`,
                    );
                }
            }

            const delegateResult = await delegateOnChain({
                patientAddress: patientAddr,
                granteeAddress: address,
                rootCidHash: shareCidHash,
                aesKey: shareAesKey,
                expiresAtMs,
                senderConsentExpireAtSec: senderExpireSec,
            });
            grantResult = {
                txHash: delegateResult.txHash,
                signaturesRemaining: '—',
                isDoctor: true,
                isVerifiedDoctor: true,
            };
        }

        // 2. Off-chain encrypted payload (blind mailbox)
        const { walletClient, address: myAddress } = await walletActionService.getWalletContext();
        const myKeypair = await getOrCreateEncryptionKeypair(walletClient, myAddress);
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

        // CASCADE: create KeyShare rows for every other version in the chain.
        // 2026-04-19 medical episode model: on-chain consent covers the whole
        // tree unconditionally, so every version needs an off-chain key-share
        // row for the doctor to decrypt whichever one they open.
        try {
            // Full chain loop: fetch ALL versions in the tree (ancestors + descendants)
            // via backend chain-cids endpoint, then create keyShare for each.
            let versionsToShare: any[] = [];
            try {
                const chainRes: any = await recordService.getChainCids(record.cidHash!);
                const all = chainRes?.records || [];
                versionsToShare = all.filter((v: any) => v?.cidHash && v.cidHash !== record.cidHash);
            } catch (e) {
                console.warn('getChainCids failed, falling back to parent/children', e);
                if (chain?.parent?.cidHash && chain.parent.cidHash !== record.cidHash) {
                    versionsToShare.push(chain.parent);
                }
                (chain?.children || []).forEach((c: any) => {
                    if (c?.cidHash && c.cidHash !== record.cidHash) versionsToShare.push(c);
                });
            }

            for (const v of versionsToShare) {
                const vLocal = localRecords[v.cidHash];
                if (!vLocal?.cid || !vLocal?.aesKey) continue; // patient doesn't have key for this version
                const vPayload = JSON.stringify({ cid: vLocal.cid, aesKey: vLocal.aesKey });
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
                } catch (e) {
                    console.warn('Cascade keyShare failed for version', v.cidHash, e);
                }
            }
        } catch (e) {
            console.warn('Cascade keyShare error', e);
        }

        setShowShareModal(false);
        setShareAddress('');

        const warn = grantResult.isDoctor && !grantResult.isVerifiedDoctor
            ? '\n\n⚠️ Bác sĩ này chưa được xác minh — họ sẽ chỉ đọc được hồ sơ sau khi tổ chức y tế xác minh.'
            : '';
        Alert.alert(
            'Chia sẻ thành công',
            `Đã cấp quyền on-chain (tx: ${grantResult.txHash.slice(0, 10)}…).\nCòn ${grantResult.signaturesRemaining} chữ ký miễn phí tháng này.${warn}`
        );
    };

    const handleShare = async () => {
        const raw = shareAddress.trim();
        if (!raw) {
            Alert.alert('Thiếu địa chỉ', 'Vui lòng nhập địa chỉ ví của người nhận.');
            return;
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(raw)) {
            Alert.alert(
                'Địa chỉ sai định dạng',
                'Địa chỉ ví Ethereum phải bắt đầu bằng 0x và có đúng 40 ký tự hex (vd: 0xabc...123).'
            );
            return;
        }
        const address = raw.toLowerCase();

        setIsSharing(true);
        try {
            // Pre-check 1: recipient must have registered an encryption key (NaCl pubkey)
            let recipientPub: string | null = null;
            try {
                const k = await authService.getEncryptionKey(address);
                recipientPub = k?.encryptionPublicKey || null;
            } catch {}
            if (!recipientPub) {
                Alert.alert(
                    'Người nhận chưa đăng ký',
                    'Địa chỉ này chưa đăng nhập vào hệ thống EHR hoặc chưa tạo khóa mã hoá. Hãy yêu cầu họ đăng nhập app trước khi bạn chia sẻ.'
                );
                setIsSharing(false);
                return;
            }

            // Pre-check 2: doctor verification status
            let ctx: any = null;
            try {
                ctx = await consentService.fetchGrantContext(address);
            } catch {
                // if context fails, let the actual grant call surface the real error
            }

            if (ctx && !ctx.isDoctor) {
                const ok = await new Promise<boolean>((resolve) => {
                    Alert.alert(
                        'Không phải bác sĩ',
                        'Địa chỉ này không đăng ký là bác sĩ trong hệ thống. Bạn có chắc muốn chia sẻ hồ sơ y tế cho địa chỉ này?',
                        [
                            { text: 'Huỷ', style: 'cancel', onPress: () => resolve(false) },
                            { text: 'Vẫn chia sẻ', style: 'destructive', onPress: () => resolve(true) },
                        ],
                        { cancelable: true, onDismiss: () => resolve(false) }
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
                        { cancelable: true, onDismiss: () => resolve(false) }
                    );
                });
                if (!confirmed) {
                    setIsSharing(false);
                    return;
                }
            }

            // Pre-check 3 (Option B): if THIS doctor already has access, block
            // permission/duration downgrade. Look up the recipient list for the
            // record and match against `address` (the grantee). Previously this
            // queried /api/key-share/record/:cidHash which filters by recipient
            // = current user, and thus returned the patient's own self-KeyShare
            // (expiresAt=null, includeUpdates=true) — guard would fire against
            // EVERY new record for any doctor target.
            if (iAmOwner && ctx?.isDoctor) {
                try {
                    const recipients = await keyShareService.getRecordRecipients(record.cidHash);
                    const existing = Array.isArray(recipients)
                        ? recipients.find((r: any) => r?.walletAddress?.toLowerCase() === address)
                        : null;
                    if (existing) {
                        const oldDelegate = existing.allowDelegate === true;
                        const newDelegate = shareType === 'read-delegate';

                        // Flag downgrade: grantee already has Delegate; new share drops it.
                        if (oldDelegate && !newDelegate) {
                            await new Promise<void>((resolve) => {
                                Alert.alert(
                                    'Bác sĩ đã có quyền cao hơn',
                                    'Bác sĩ này đã có quyền "Đọc & ủy quyền lại".\n\n' +
                                    'Để giới hạn xuống "Đọc & cập nhật", hãy THU HỒI quyền cũ trong "Nhật ký truy cập" trước, rồi chia sẻ lại.',
                                    [{ text: 'Đã hiểu', onPress: () => resolve() }],
                                    { cancelable: true, onDismiss: () => resolve() }
                                );
                            });
                            setIsSharing(false);
                            return;
                        }

                        // Duration downgrade: old expires later than new.
                        // Null expiresAt means forever (matches contract FOREVER sentinel).
                        // Only block if old consent is still ACTIVE — expired consent has no
                        // quyền left to "downgrade".
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
                                    { cancelable: true, onDismiss: () => resolve() }
                                );
                            });
                            setIsSharing(false);
                            return;
                        }
                    }
                } catch {
                    // No existing access or check failed → proceed normally
                }
            }

            await performShare(address);
        } catch (err: any) {
            const raw = String(err?.data?.message || err?.data?.error || err?.message || '').toLowerCase();
            let title = 'Chia sẻ thất bại';
            let msg = err?.data?.message || err?.data?.error || err?.message || 'Không thể chia sẻ hồ sơ.';
            if (raw.includes('quota') || raw.includes('limit') || raw.includes('miễn phí')) {
                title = 'Hết lượt miễn phí';
                msg = 'Bạn đã dùng hết lượt giao dịch on-chain miễn phí trong tháng. Hãy thử lại tháng sau hoặc dùng ví riêng.';
            } else if (raw.includes('nonce')) {
                title = 'Lỗi đồng bộ chữ ký';
                msg = 'Nonce on-chain không khớp. Vui lòng thử lại.';
            } else if (raw.includes('signature') || raw.includes('sign')) {
                title = 'Lỗi ký giao dịch';
            } else if (raw.includes('network') || raw.includes('fetch') || raw.includes('timeout')) {
                title = 'Lỗi kết nối';
                msg = 'Không kết nối được server hoặc blockchain. Kiểm tra mạng và thử lại.';
            } else if (raw.includes('revert')) {
                title = 'Giao dịch bị từ chối';
                msg = 'Smart contract từ chối giao dịch: ' + msg;
            }
            Alert.alert(title, String(msg));
        } finally {
            setIsSharing(false);
        }
    };

    const handleDecrypt = async () => {
        setIsDecrypting(true);
        setDecryptError(null);

        try {
            let cid: string | undefined;
            let aesKeyString: string | undefined;

            // SECURITY: only allow local AES cache when current user IS the record owner/creator.
            // Otherwise we bypass the backend canAccess gate (FIX #3, revocation cascade) entirely.
            const { address: myAddress } = await walletActionService.getWalletContext();
            const me = String(myAddress || '').toLowerCase();
            const ownerAddr = String(record?.ownerAddress || '').toLowerCase();
            const creatorAddr = String(record?.createdBy || '').toLowerCase();
            const iAmOwner = !!me && (me === ownerAddr || me === creatorAddr);

            const localRecordsString = await AsyncStorage.getItem('ehr_local_records');
            const localRecords = localRecordsString ? JSON.parse(localRecordsString) : {};
            const localData = localRecords[record.cidHash || ''];

            if (iAmOwner && localData?.cid && localData?.aesKey) {
                cid = localData.cid;
                aesKeyString = localData.aesKey;
            } else {
                // Forces a round-trip through backend, which calls on-chain canAccess.
                // If the patient revoked, or doctor became unverified, this path returns 403.
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

                if (!shouldRetryWithSharedKey) {
                    throw decryptErr;
                }

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

            await saveLocalKey(record.cidHash, cid, aesKeyString, decrypted?.meta?.title || record.title, iAmOwner);
        } catch (error: any) {
            const message = classifyDecryptError(error);
            console.warn('Decrypt error:', error?.message || error);
            setDecryptError(message);
            Alert.alert('Lỗi giải mã', message);
        } finally {
            setIsDecrypting(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['bottom', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 10 }}>
                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 18 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, marginBottom: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: EHR_PRIMARY_FIXED }}>
                        <FileText size={24} color={EHR_PRIMARY} />
                    </View>
                    <Text fontSize="$6" fontWeight="700" color="$color12" style={{ marginBottom: 8 }}>
                        {record.title || record.type || 'Hồ sơ y tế không tên'}
                    </Text>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <Clock size={14} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 8 }} />
                        <Text fontSize="$3" color="$color10">{record.date || 'Không có ngày'}</Text>
                    </XStack>
                    <XStack style={{ alignItems: 'center' }}>
                        <User size={14} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 8 }} />
                        <Text fontSize="$3" color="$color10">{record.createdByDisplay || 'Người tạo không rõ'}</Text>
                    </XStack>
                </View>

                {/* Access info badges for shared records (Delegate flag only since 2026-04-19) */}
                {!iAmOwner && (record as any)?.allowDelegate ? (
                    <XStack style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: EHR_PRIMARY_FIXED, borderColor: EHR_PRIMARY, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, gap: 4 }}>
                            <Share2 size={12} color={EHR_PRIMARY} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: EHR_PRIMARY }}>Chia sẻ lại được</Text>
                        </View>
                    </XStack>
                ) : null}

                {!decryptedData ? (
                    <View style={{ borderWidth: 1, borderColor: decryptError ? EHR_ERROR : EHR_OUTLINE_VARIANT, borderRadius: 20, padding: 14, marginBottom: 18, backgroundColor: decryptError ? EHR_ERROR_CONTAINER : EHR_SURFACE_LOWEST }}>
                        <XStack style={{ alignItems: 'center', marginBottom: 8 }}>
                            <Lock size={20} color={decryptError ? EHR_ERROR : EHR_PRIMARY} style={{ marginRight: 8 }} />
                            <Text fontSize="$4" fontWeight="700" color="$color11">Dữ liệu được mã hoá</Text>
                        </XStack>
                        <Text fontSize="$3" color="$color10" style={{ lineHeight: 20, marginBottom: 12 }}>
                            Hồ sơ này đã được mã hoá trên IPFS. Bạn cần giải mã bằng khóa chia sẻ để xem nội dung.
                        </Text>
                        {decryptError ? <Text fontSize="$3" style={{ marginBottom: 10, color: EHR_ERROR }}>{decryptError}</Text> : null}
                        <Button size="$4" background={EHR_PRIMARY} pressStyle={{ background: EHR_PRIMARY_CONTAINER }} icon={isDecrypting ? undefined : <Unlock size={18} color="white" />} onPress={handleDecrypt} disabled={isDecrypting} opacity={isDecrypting ? 0.7 : 1}>
                            <Text color="white" fontWeight="700">{isDecrypting ? 'Đang giải mã...' : 'Giải mã nội dung'}</Text>
                        </Button>
                    </View>
                ) : (
                    <View style={{ backgroundColor: EHR_PRIMARY_FIXED, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 18 }}>
                        <XStack style={{ alignItems: 'center', marginBottom: 10 }}>
                            <Unlock size={20} color={EHR_PRIMARY} style={{ marginRight: 8 }} />
                            <Text fontSize="$5" fontWeight="700" style={{ color: EHR_PRIMARY }}>Nội dung đã giải mã</Text>
                        </XStack>

                        {ancestorKeyWarning ? (
                            <View style={{ backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start' }}>
                                <Clock size={14} color="#D97706" style={{ marginTop: 2, marginRight: 8 }} />
                                <Text style={{ flex: 1, fontSize: 12, color: '#92400E' }}>
                                    Nội dung hiển thị là của phiên bản trước đó. Khoá giải mã cho phiên bản này chưa được chia sẻ — hãy yêu cầu bệnh nhân chia sẻ lại.
                                </Text>
                            </View>
                        ) : null}

                        {decryptedImage ? (
                            <YStack style={{ marginBottom: 12 }}>
                                <Text style={{ marginBottom: 8, fontSize: 13, fontWeight: '700' }} color="$color11">Ảnh đính kèm</Text>
                                <Pressable onPress={() => setShowImageViewer(true)}>
                                    <View borderColor={EHR_OUTLINE_VARIANT} style={{ borderWidth: 1, borderRadius: 10, overflow: 'hidden' }}>
                                        <Image
                                            source={{ uri: decryptedImage.uri }}
                                            style={{ width: '100%', height: 220, backgroundColor: EHR_SURFACE_LOW }}
                                            resizeMode="cover"
                                        />
                                    </View>
                                </Pressable>
                                <Text fontSize="$2" color="$color10" style={{ marginTop: 8 }}>
                                    {decryptedImage.fileName || 'Ảnh đính kèm'} • Chạm để xem toàn màn hình
                                </Text>
                            </YStack>
                        ) : null}

                        {decryptedData?.meta ? (
                            <View style={{
                                backgroundColor: EHR_PRIMARY_FIXED,
                                borderRadius: 14,
                                padding: 14,
                                marginBottom: 14,
                                borderLeftWidth: 4,
                                borderLeftColor: EHR_PRIMARY,
                            }}>
                                <Text fontSize="$2" fontWeight="700" style={{ color: EHR_PRIMARY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                    Thông tin hồ sơ
                                </Text>
                                <YStack style={{ gap: 6 }}>
                                    <XStack style={{ justifyContent: 'space-between' }}>
                                        <Text fontSize="$3" color="$color10">Tiêu đề</Text>
                                        <Text fontSize="$3" fontWeight="700" color="$color12" style={{ flex: 1, textAlign: 'right' }}>{decryptedData.meta.title || '—'}</Text>
                                    </XStack>
                                    <XStack style={{ justifyContent: 'space-between' }}>
                                        <Text fontSize="$3" color="$color10">Loại</Text>
                                        <Text fontSize="$3" fontWeight="700" color="$color12">{decryptedData.meta.type || '—'}</Text>
                                    </XStack>
                                    {decryptedData.meta.description ? (
                                        <YStack style={{ marginTop: 4 }}>
                                            <Text fontSize="$2" color="$color10" style={{ marginBottom: 2 }}>Mô tả</Text>
                                            <Text fontSize="$3" color="$color12" style={{ lineHeight: 20 }}>{decryptedData.meta.description}</Text>
                                        </YStack>
                                    ) : null}
                                </YStack>
                            </View>
                        ) : null}

                        {decryptedData?.summary ? (
                            <View style={{
                                backgroundColor: EHR_SURFACE_LOWEST,
                                borderRadius: 14,
                                padding: 14,
                                marginBottom: 14,
                                borderWidth: 1,
                                borderColor: EHR_OUTLINE_VARIANT,
                            }}>
                                <Text fontSize="$2" fontWeight="700" style={{ color: EHR_SECONDARY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                                    Tóm tắt
                                </Text>
                                <Text fontSize="$3" color="$color12" style={{ lineHeight: 22 }}>{decryptedData.summary}</Text>
                            </View>
                        ) : null}

                        {decryptedData?.notes ? (
                            <View style={{
                                backgroundColor: EHR_SURFACE_LOWEST,
                                borderRadius: 14,
                                padding: 14,
                                marginBottom: 14,
                                borderWidth: 1,
                                borderColor: EHR_OUTLINE_VARIANT,
                            }}>
                                <Text fontSize="$2" fontWeight="700" style={{ color: EHR_ON_SURFACE_VARIANT, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                                    Ghi chú lâm sàng
                                </Text>
                                <Text fontSize="$3" color="$color12" style={{ lineHeight: 22 }}>{decryptedData.notes}</Text>
                            </View>
                        ) : null}

                        {decryptedData?.observations && Object.keys(decryptedData.observations).length > 0 ? (
                            <View style={{
                                backgroundColor: EHR_SURFACE_LOWEST,
                                borderRadius: 14,
                                padding: 14,
                                marginBottom: 14,
                                borderWidth: 1,
                                borderColor: EHR_OUTLINE_VARIANT,
                            }}>
                                <Text fontSize="$2" fontWeight="700" style={{ color: EHR_PRIMARY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                    Chỉ số lâm sàng
                                </Text>
                                {Object.entries(decryptedData.observations).map(([key, val]: any, idx: number, arr: any[]) => (
                                    <XStack key={key} style={{
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        paddingVertical: 8,
                                        borderBottomWidth: idx === arr.length - 1 ? 0 : 1,
                                        borderBottomColor: EHR_OUTLINE_VARIANT,
                                    }}>
                                        <Text fontSize="$3" color="$color10" style={{ textTransform: 'capitalize' }}>{key}</Text>
                                        <View style={{
                                            backgroundColor: EHR_PRIMARY_FIXED,
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 8,
                                        }}>
                                            <Text fontSize="$3" fontWeight="700" style={{ color: EHR_PRIMARY }}>{String(val)}</Text>
                                        </View>
                                    </XStack>
                                ))}
                            </View>
                        ) : null}

                        {decryptedData?.diagnoses?.length ? (
                            <View style={{
                                backgroundColor: '#fff5f5',
                                borderRadius: 14,
                                padding: 14,
                                marginBottom: 14,
                                borderLeftWidth: 4,
                                borderLeftColor: '#DC2626',
                            }}>
                                <Text fontSize="$2" fontWeight="700" style={{ color: '#DC2626', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                    Chẩn đoán
                                </Text>
                                {decryptedData.diagnoses.map((diagnosis: string, index: number) => (
                                    <XStack key={index} style={{ alignItems: 'flex-start', marginBottom: 4, gap: 8 }}>
                                        <Text fontSize="$3" style={{ color: '#DC2626', fontWeight: '700' }}>•</Text>
                                        <Text fontSize="$3" color="$color12" style={{ flex: 1, lineHeight: 20 }}>{diagnosis}</Text>
                                    </XStack>
                                ))}
                            </View>
                        ) : null}

                        {decryptedData?.prescriptions?.length ? (
                            <View style={{
                                backgroundColor: '#f0fdf4',
                                borderRadius: 14,
                                padding: 14,
                                marginBottom: 14,
                                borderLeftWidth: 4,
                                borderLeftColor: '#16A34A',
                            }}>
                                <Text fontSize="$2" fontWeight="700" style={{ color: '#16A34A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                                    Đơn thuốc
                                </Text>
                                {decryptedData.prescriptions.map((p: any, index: number) => (
                                    <View key={index} style={{
                                        backgroundColor: '#fff',
                                        borderRadius: 10,
                                        padding: 10,
                                        marginBottom: 6,
                                        borderWidth: 1,
                                        borderColor: '#dcfce7',
                                    }}>
                                        <Text fontSize="$3" fontWeight="700" color="$color12">{p.medication || 'Thuốc'}</Text>
                                        <XStack style={{ gap: 12, marginTop: 4 }}>
                                            {p.dosage ? (
                                                <Text fontSize="$2" color="$color10">Liều: <Text fontWeight="700" color="$color12">{p.dosage}</Text></Text>
                                            ) : null}
                                            {p.frequency ? (
                                                <Text fontSize="$2" color="$color10">Tần suất: <Text fontWeight="700" color="$color12">{p.frequency}</Text></Text>
                                            ) : null}
                                        </XStack>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </View>
                )}

                {((fullChain?.records && fullChain.records.length > 1) || (chain && (chain.parent || (chain.children && chain.children.length > 0)))) ? (
                    <YStack style={{ marginBottom: 16 }}>
                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text fontSize="$5" fontWeight="700" color="$color12">Chuỗi phiên bản</Text>
                            <View style={{
                                backgroundColor: EHR_PRIMARY_FIXED,
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 999,
                            }}>
                                <Text fontSize={11} fontWeight="700" style={{ color: EHR_PRIMARY }}>
                                    v{chain?.version || 1}
                                </Text>
                            </View>
                        </XStack>
                        {(() => {
                            const all: any[] = [];
                            const currentHashLc = String(record.cidHash || '').toLowerCase();
                            if (fullChain?.records && fullChain.records.length > 0) {
                                // Use full tree ordered by createdAt asc (v1 → vN).
                                for (const r of fullChain.records) {
                                    const isCur = String(r.cidHash || '').toLowerCase() === currentHashLc;
                                    all.push({ ...r, _role: isCur ? 'current' : 'other' });
                                }
                            } else {
                                if (chain?.parent) all.push({ ...chain.parent, _role: 'parent' });
                                all.push({ cidHash: record.cidHash, title: record.title, createdAt: (record as any)?.createdAt, createdBy: (record as any)?.createdBy, _role: 'current' });
                                (chain?.children || []).forEach((c: any) => all.push({ ...c, _role: 'child' }));
                            }
                            return (
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={{ paddingVertical: 4, paddingRight: 8 }}
                                >
                                    {all.map((v, idx) => {
                                        const isCurrent = v._role === 'current';
                                        const tint = isCurrent ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT;
                                        const bg = isCurrent ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOWEST;
                                        const border = isCurrent ? EHR_PRIMARY : EHR_OUTLINE_VARIANT;
                                        const onPress = isCurrent ? undefined : () => navigation.replace('RecordDetail', { record: { ...v, createdAt: v?.createdAt ? new Date(v.createdAt).toISOString() : null } });
                                        return (
                                            <React.Fragment key={v.cidHash || idx}>
                                                <Pressable onPress={onPress} disabled={isCurrent}>
                                                    <View
                                                        style={{
                                                            width: 168,
                                                            backgroundColor: bg,
                                                            borderRadius: 16,
                                                            borderWidth: isCurrent ? 2 : 1,
                                                            borderColor: border,
                                                            padding: 12,
                                                            marginRight: 10,
                                                        }}
                                                    >
                                                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                            <View style={{
                                                                backgroundColor: isCurrent ? EHR_PRIMARY : EHR_SURFACE_LOW,
                                                                paddingHorizontal: 8,
                                                                paddingVertical: 2,
                                                                borderRadius: 999,
                                                            }}>
                                                                <Text fontSize={10} fontWeight="800" style={{ color: isCurrent ? '#FFFFFF' : EHR_ON_SURFACE_VARIANT }}>
                                                                    v{idx + 1}
                                                                </Text>
                                                            </View>
                                                            {isCurrent ? (
                                                                <Text fontSize={10} fontWeight="700" style={{ color: tint }}>HIỆN TẠI</Text>
                                                            ) : null}
                                                        </XStack>
                                                        <Text fontSize="$3" fontWeight="700" color="$color12" numberOfLines={2} style={{ marginBottom: 4 }}>
                                                            {v.title || `Phiên bản ${idx + 1}`}
                                                        </Text>
                                                        {v.createdAt ? (
                                                            <Text fontSize={11} color="$color10">
                                                                {new Date(v.createdAt).toLocaleDateString('vi-VN')}
                                                            </Text>
                                                        ) : null}
                                                        <Text fontSize={10} color="$color9" numberOfLines={1} style={{ marginTop: 2 }}>
                                                            {String(v.cidHash || '').slice(0, 14)}…
                                                        </Text>
                                                    </View>
                                                </Pressable>
                                                {idx < all.length - 1 ? (
                                                    <View style={{ alignSelf: 'center', marginRight: 10 }}>
                                                        <Text style={{ color: EHR_ON_SURFACE_VARIANT, fontSize: 18 }}>→</Text>
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

                {(iAmOwner || iAmDoctor) && (!chain?.children || chain.children.length === 0) ? (
                    <YStack style={{ marginBottom: 16 }}>
                        <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 12 }}>Cập nhật hồ sơ</Text>
                        <Pressable
                            onPress={() => {
                                if (iAmOwner) {
                                    navigation.navigate('CreateRecord', {
                                        parentCidHash: record.cidHash,
                                        initialTitle: record.title,
                                        initialRecordType: (record as any)?.type || (record as any)?.recordType,
                                    });
                                } else {
                                    // Doctor path: patient is the record owner
                                    navigation.navigate('DoctorCreateUpdate', {
                                        parentCidHash: record.cidHash,
                                        patientAddress: ownerAddrLc,
                                    });
                                }
                            }}
                        >
                            <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 14 }}>
                                <XStack style={{ alignItems: 'center' }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: EHR_PRIMARY_FIXED }}>
                                        <FilePlus2 size={20} color={EHR_PRIMARY} />
                                    </View>
                                    <YStack style={{ flex: 1 }}>
                                        <Text fontSize="$4" fontWeight="700" color="$color12">Tạo phiên bản mới</Text>
                                        <Text fontSize="$2" color="$color10">
                                            {iAmOwner
                                                ? 'Liên kết với hồ sơ gốc, các bên đã chia sẻ vẫn truy cập được.'
                                                : 'Bác sĩ cập nhật hồ sơ bệnh nhân. Key mới sẽ cascade tới mọi người đang có quyền.'}
                                        </Text>
                                    </YStack>
                                </XStack>
                            </View>
                        </Pressable>
                    </YStack>
                ) : null}

                <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 12 }}>Tuỳ chọn chia sẻ</Text>
                <YStack style={{ gap: 10 }}>
                    <Pressable onPress={() => {
                        if (!iAmOwner && !(record as any)?.allowDelegate) {
                            Alert.alert(
                                'Không có quyền chia sẻ',
                                'Hồ sơ này không cho phép bạn ủy quyền tiếp. Chỉ bệnh nhân hoặc bác sĩ được cấp quyền "allowDelegate" mới có thể chia sẻ lại.'
                            );
                            return;
                        }
                        setShowShareModal(true);
                    }}>
                        <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 14 }}>
                            <XStack style={{ alignItems: 'center' }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: EHR_PRIMARY_FIXED }}>
                                    <Share2 size={20} color={EHR_PRIMARY} />
                                </View>
                                <YStack>
                                    <Text fontSize="$4" fontWeight="700" color="$color12">Chia sẻ qua ví (Address)</Text>
                                    <Text fontSize="$2" color="$color10">Cấp quyền online cho bác sĩ</Text>
                                </YStack>
                            </XStack>
                        </View>
                    </Pressable>

                    <Pressable onPress={() => setShowQrModal(true)}>
                        <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 14 }}>
                            <XStack style={{ alignItems: 'center' }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: EHR_SECONDARY_CONTAINER }}>
                                    <QrCode size={20} color={EHR_SECONDARY} />
                                </View>
                                <YStack>
                                    <Text fontSize="$4" fontWeight="700" color="$color12">Hiển thị mã CID</Text>
                                    <Text fontSize="$2" color="$color10">Cho bác sĩ nhập CID Hash để tìm hồ sơ</Text>
                                </YStack>
                            </XStack>
                        </View>
                    </Pressable>
                </YStack>
            </ScrollView>

            {/* Modal: Chia sẻ qua địa chỉ ví */}
            <Modal visible={showShareModal} transparent animationType="fade" onRequestClose={() => setShowShareModal(false)}>
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
                    onPress={() => setShowShareModal(false)}
                >
                    <Pressable onPress={(e) => e.stopPropagation()}>
                        <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderRadius: 24, padding: 20 }}>
                            <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <Text fontSize="$5" fontWeight="700" color="$color12">Chia sẻ hồ sơ</Text>
                                <Pressable onPress={() => setShowShareModal(false)}>
                                    <X size={20} color={EHR_ON_SURFACE_VARIANT} />
                                </Pressable>
                            </XStack>
                            <Text fontSize="$3" color="$color10" style={{ marginBottom: 12 }}>
                                Nhập địa chỉ ví của bác sĩ cần chia sẻ. Khóa hồ sơ sẽ được mã hoá đầu-cuối.
                            </Text>
                            <TextInput
                                value={shareAddress}
                                onChangeText={setShareAddress}
                                placeholder="0x..."
                                placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={{
                                    borderWidth: 1,
                                    borderColor: EHR_OUTLINE_VARIANT,
                                    borderRadius: 14,
                                    padding: 12,
                                    fontSize: 14,
                                    color: EHR_ON_SURFACE_VARIANT,
                                    marginBottom: 16,
                                    backgroundColor: EHR_SURFACE_LOW,
                                }}
                            />
                            <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>
                                Loại quyền truy cập
                            </Text>
                            <YStack style={{ gap: 8, marginBottom: 16 }}>
                                {([
                                    { value: 'read-update', label: 'Đọc & cập nhật', sub: 'Bác sĩ đọc toàn bộ hồ sơ bao gồm các phiên bản cập nhật' },
                                    { value: 'read-delegate', label: 'Đọc & ủy quyền lại', sub: 'Bác sĩ đọc toàn bộ + có thể chia sẻ lại cho bác sĩ khác' },
                                ] as { value: ShareType; label: string; sub: string }[]).map((opt) => {
                                    const active = shareType === opt.value;
                                    return (
                                        <Pressable key={opt.value} onPress={() => setShareType(opt.value)}>
                                            <View style={{
                                                flexDirection: 'row', alignItems: 'center',
                                                borderWidth: 1.5,
                                                borderColor: active ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                                                borderRadius: 14, padding: 12,
                                                backgroundColor: active ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW,
                                            }}>
                                                <View style={{
                                                    width: 18, height: 18, borderRadius: 9,
                                                    borderWidth: 2,
                                                    borderColor: active ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT,
                                                    backgroundColor: active ? EHR_PRIMARY : 'transparent',
                                                    marginRight: 10,
                                                }} />
                                                <YStack style={{ flex: 1 }}>
                                                    <Text fontSize="$3" fontWeight="700" style={{ color: active ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}>{opt.label}</Text>
                                                    <Text fontSize="$2" style={{ color: EHR_ON_SURFACE_VARIANT }}>{opt.sub}</Text>
                                                </YStack>
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </YStack>

                            <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>
                                Thời hạn truy cập
                            </Text>
                            <XStack style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                {[
                                    { label: 'Không giới hạn', value: null as number | null },
                                    { label: '5 phút (test)', value: 5 / 60 },
                                    { label: '10 phút (test)', value: 10 / 60 },
                                    { label: '1 giờ', value: 1 },
                                    { label: '24 giờ', value: 24 },
                                    { label: '7 ngày', value: 24 * 7 },
                                    { label: '30 ngày', value: 24 * 30 },
                                ].map((opt) => {
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
                                                    borderRadius: 20,
                                                    borderWidth: 1,
                                                    borderColor: active ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                                                    backgroundColor: active ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW,
                                                }}
                                            >
                                                <Text
                                                    fontSize="$2"
                                                    fontWeight={active ? '700' : '500'}
                                                    style={{ color: active ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}
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
                                            borderRadius: 20,
                                            borderWidth: 1,
                                            borderColor: customExpiryOpen ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                                            backgroundColor: customExpiryOpen ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW,
                                        }}
                                    >
                                        <Text
                                            fontSize="$2"
                                            fontWeight={customExpiryOpen ? '700' : '500'}
                                            style={{ color: customExpiryOpen ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}
                                        >
                                            Tuỳ chỉnh
                                        </Text>
                                    </View>
                                </Pressable>
                            </XStack>

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
                                        placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                                        keyboardType="number-pad"
                                        style={{
                                            flex: 1,
                                            borderWidth: 1,
                                            borderColor: EHR_OUTLINE_VARIANT,
                                            borderRadius: 10,
                                            padding: 10,
                                            fontSize: 14,
                                            color: EHR_ON_SURFACE_VARIANT,
                                            backgroundColor: EHR_SURFACE_LOW,
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
                                                        borderWidth: 1,
                                                        borderColor: active ? EHR_PRIMARY : EHR_OUTLINE_VARIANT,
                                                        backgroundColor: active ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOW,
                                                    }}
                                                >
                                                    <Text
                                                        fontSize="$2"
                                                        fontWeight={active ? '700' : '500'}
                                                        style={{ color: active ? EHR_PRIMARY : EHR_ON_SURFACE_VARIANT }}
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

                            <Pressable onPress={isSharing ? undefined : handleShare}>
                                <View
                                    style={{
                                        backgroundColor: EHR_PRIMARY,
                                        borderRadius: 14,
                                        paddingVertical: 14,
                                        alignItems: 'center',
                                        opacity: isSharing ? 0.7 : 1,
                                    }}
                                >
                                    {isSharing ? (
                                        <XStack style={{ alignItems: 'center', gap: 8 }}>
                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Đang chia sẻ...</Text>
                                        </XStack>
                                    ) : (
                                        <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15 }}>Xác nhận chia sẻ</Text>
                                    )}
                                </View>
                            </Pressable>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Modal: Hiển thị CID Hash */}
            <Modal visible={showQrModal} transparent animationType="fade" onRequestClose={() => setShowQrModal(false)}>
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
                    onPress={() => setShowQrModal(false)}
                >
                    <Pressable onPress={(e) => e.stopPropagation()}>
                        <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderRadius: 24, padding: 20 }}>
                            <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <Text fontSize="$5" fontWeight="700" color="$color12">CID Hash hồ sơ</Text>
                                <Pressable onPress={() => setShowQrModal(false)}>
                                    <X size={20} color={EHR_ON_SURFACE_VARIANT} />
                                </Pressable>
                            </XStack>
                            <Text fontSize="$3" color="$color10" style={{ marginBottom: 12 }}>
                                Bác sĩ quét QR hoặc nhập CID Hash dưới đây vào form yêu cầu truy cập.
                            </Text>
                            {record.cidHash ? (
                                <View style={{
                                    alignSelf: 'center',
                                    backgroundColor: '#fff',
                                    padding: 14,
                                    borderRadius: 16,
                                    marginBottom: 14,
                                }}>
                                    <QRCode
                                        value={record.cidHash}
                                        size={220}
                                        backgroundColor="#fff"
                                        color={EHR_PRIMARY}
                                    />
                                </View>
                            ) : null}
                            <View style={{ backgroundColor: EHR_PRIMARY_FIXED, borderRadius: 14, padding: 14 }}>
                                <XStack style={{ alignItems: 'flex-start', gap: 10 }}>
                                    <Text
                                        fontSize="$2"
                                        style={{ color: EHR_PRIMARY, fontFamily: 'monospace', lineHeight: 22, flex: 1 }}
                                        selectable
                                    >
                                        {record.cidHash || 'Không có CID'}
                                    </Text>
                                    {record.cidHash ? (
                                        <Pressable
                                            onPress={async () => {
                                                await Clipboard.setStringAsync(record.cidHash!);
                                                Alert.alert('Đã sao chép', 'CID Hash đã được sao chép vào clipboard.');
                                            }}
                                            hitSlop={10}
                                            style={{
                                                padding: 6,
                                                borderRadius: 8,
                                                backgroundColor: '#FFFFFF',
                                            }}
                                        >
                                            <Copy size={16} color={EHR_PRIMARY} />
                                        </Pressable>
                                    ) : null}
                                </XStack>
                            </View>
                            <Text fontSize="$2" color="$color10" style={{ marginTop: 10 }}>
                                Bấm biểu tượng sao chép hoặc dùng QR phía trên.
                            </Text>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
            {/* Modal: Fullscreen image viewer */}
            <Modal visible={showImageViewer} transparent animationType="fade" onRequestClose={() => setShowImageViewer(false)}>
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
