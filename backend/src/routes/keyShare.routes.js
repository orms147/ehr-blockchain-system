import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { checkConsent, publicClient, CONTRACT_ADDRESSES } from '../config/blockchain.js';
import { ACCESS_CONTROL_ABI } from '../config/contractABI.js';
import { emitToUser } from '../services/socket.service.js';
import { sendPushToWallet } from '../services/push.service.js';
import { createLogger } from '../utils/logger.js';
import { applyShare, applyStatusFlip } from '../services/keyShareWriter.service.js';

const log = createLogger('KeyShareRoutes');
const router = Router();

/**
 * Walk the full record chain (ancestors + all descendants) to collect every cidHash.
 * Used for clean-slate DELETE before re-sharing.
 */
async function getChainCidHashes(startCidHash) {
    const all = new Set();
    // Walk up to root — root is the record with NO parentCidHash
    let root = startCidHash.toLowerCase();
    let cursor = root;
    let depth = 0;
    while (cursor && depth < 50) {
        all.add(cursor.toLowerCase());
        const rec = await prisma.recordMetadata.findUnique({
            where: { cidHash: cursor.toLowerCase() },
            select: { parentCidHash: true },
        });
        if (!rec?.parentCidHash) {
            root = cursor.toLowerCase(); // THIS is the true root
            break;
        }
        cursor = rec.parentCidHash;
        root = cursor.toLowerCase();
        depth++;
    }
    // Walk down from root (all children recursively, with depth guard)
    const walkDown = async (cid, d) => {
        if (d > 50) return; // infinite loop guard
        all.add(cid.toLowerCase());
        const children = await prisma.recordMetadata.findMany({
            where: { parentCidHash: cid.toLowerCase() },
            select: { cidHash: true },
        });
        for (const c of children) {
            if (!all.has(c.cidHash.toLowerCase())) {
                await walkDown(c.cidHash, d + 1);
            }
        }
    };
    await walkDown(root, 0);
    return [...all];
}

// Validation schemas
const createKeyShareSchema = z.object({
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    encryptedPayload: z.string().min(1), // Contains encrypted {cid, aesKey}
    senderPublicKey: z.string().min(1).optional(), // NaCl public key for decryption
    expiresAt: z.string().datetime().optional().nullable(),
    allowDelegate: z.boolean().optional().default(false), // For RecordDelegation
});

// Bulk pre-share to a Trusted Contact (S18 encryption ceremony, 2026-05-04).
// When patient adds a Trusted Contact, mobile encrypts aesKey for the contact's
// pubkey for every existing record and POSTs the batch here. Backend verifies
// (a) sender (msg.user) owns each record and (b) recipient is currently an
// active Trusted Contact in the cache (subgraph mirror). Then writes one
// KeyShare row per item via keyShareWriter.applyShare with
// source='trusted-contact-pre-share' so the cascade revoke handler can target
// these specifically.
const bulkTrustedContactSchema = z.object({
    recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    senderPublicKey: z.string().min(1),
    items: z.array(z.object({
        cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
        encryptedPayload: z.string().min(1),
    })).min(1).max(500),  // sanity cap; a patient with 500+ records is implausible
});

// POST /api/key-share - Share encrypted key with recipient
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { cidHash, recipientAddress, encryptedPayload, senderPublicKey, expiresAt, allowDelegate } =
            createKeyShareSchema.parse(req.body);

        const cidHashLower = cidHash.toLowerCase();
        const recipientLower = recipientAddress.toLowerCase();
        const senderAddress = req.user.walletAddress;

        // Check if record exists
        const record = await prisma.recordMetadata.findUnique({
            where: { cidHash: cidHashLower }
        });

        if (!record) {
            return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Record not found', message: 'Record not found' });
        }

        // Check sender/recipient roles
        const isOwner = record.ownerAddress.toLowerCase() === senderAddress.toLowerCase();
        const isCreator = record.createdBy?.toLowerCase() === senderAddress.toLowerCase();
        const recipientIsOwner = record.ownerAddress.toLowerCase() === recipientLower;

        if (isCreator) {
            // Creator bypass - no consent check needed
        }
        // CASE 2: Owner shares (Patientâ†’Doctor flow)
        // Requires on-chain consent from patient to doctor
        else if (isOwner) {
            let hasConsentForRecipient = await checkConsent(
                record.ownerAddress,
                recipientLower,
                cidHashLower
            );

            // REVERSE INHERITANCE: If no direct consent, check if consent exists for a DESCENDANT (Child/Grandchild).
            // This supports the flow: "Grant Update -> System shares Original too".
            if (!hasConsentForRecipient) {
                const checkDescendantConsent = async (currentCid, depth) => {
                    if (depth > 5) return false; // Max depth 5
                    const children = await prisma.recordMetadata.findMany({
                        where: { parentCidHash: currentCid },
                        select: { cidHash: true }
                    });

                    for (const child of children) {
                        const childConsent = await checkConsent(
                            record.ownerAddress,
                            recipientLower,
                            child.cidHash.toLowerCase()
                        );
                        if (childConsent) return true;

                        // Recurse
                        if (await checkDescendantConsent(child.cidHash, depth + 1)) return true;
                    }
                    return false;
                };

                // Start search
                const hasDescendantConsent = await checkDescendantConsent(cidHashLower, 1);
                if (hasDescendantConsent) {
                    hasConsentForRecipient = true;
                }
            }

            // INHERITANCE (Ancestor Check): If strict/descendant consent missing, check Ancestors.
            // This supports the flow: "Grant Root -> Share Child".
            if (!hasConsentForRecipient && record.parentCidHash) {
                let currentCid = record.parentCidHash;
                let depth = 0;
                while (currentCid && depth < 20) {
                    const isAuthorized = await checkConsent(record.ownerAddress, recipientLower, currentCid.toLowerCase());
                    if (isAuthorized) {
                        hasConsentForRecipient = true;
                        break;
                    }
                    const p = await prisma.recordMetadata.findUnique({
                        where: { cidHash: currentCid },
                        select: { parentCidHash: true }
                    });
                    if (!p) break;
                    currentCid = p.parentCidHash;
                    depth++;
                }
            }

            if (!hasConsentForRecipient) {
                return res.status(403).json({
                    error: 'On-chain consent for recipient not found. Please grant consent on-chain first.',
                    code: 'NO_ONCHAIN_CONSENT_FOR_RECIPIENT'
                });
            }
        }
        // CASE 3: Grantee re-shares (delegated access)
        // Sender must have consent from owner
        else {
            let senderHasConsent = await checkConsent(
                record.ownerAddress,
                senderAddress,
                cidHashLower
            );

            // INHERITANCE: If strict consent missing, check Ancestors content (Standard Inheritance)
            // Allows Doctor to re-share V3 if they have permission for V1 (Root)
            if (!senderHasConsent && record.parentCidHash) {
                let currentCid = record.parentCidHash;
                let depth = 0;
                while (currentCid && depth < 20) {
                    const isAuthorized = await checkConsent(record.ownerAddress, senderAddress, currentCid.toLowerCase());
                    if (isAuthorized) {
                        senderHasConsent = true;
                        break;
                    }
                    const p = await prisma.recordMetadata.findUnique({
                        where: { cidHash: currentCid },
                        select: { parentCidHash: true }
                    });
                    if (!p) break;
                    currentCid = p.parentCidHash;
                    depth++;
                }
            }

            if (!senderHasConsent) {
                return res.status(403).json({
                    error: 'No on-chain consent found. Request access first.'
                });
            }
        }

        // SECURITY: Only the Owner (Patient) can grant "Delegation Power" (allowDelegate=true).
        let finalAllowDelegate = (isOwner || isCreator) ? (allowDelegate === true) : false;

        // Auto-claim cascade + allowDelegate inheritance: walk ancestors once,
        // collect both signals from the recipient's existing KeyShare rows.
        // - inheritsFromClaimedAncestor: skip "Nhận và xem" liability modal on
        //   cascade share for an already-claimed chain.
        // - allowDelegate inheritance: per medical episode model the on-chain
        //   Consent is stored at the chain root with a single allowDelegate
        //   flag — every version inherits it. CreateRecordScreen cascade
        //   hardcodes `allowDelegate: false` for new versions, which would
        //   silently downgrade the recipient's UI ("Có thể chia sẻ lại" tag
        //   disappears) even though contract grantUsingRecordDelegation walks
        //   to root and accepts the tx. We restore the invariant here: if any
        //   ancestor share for this recipient has allowDelegate=true, the new
        //   version inherits it.
        let inheritsFromClaimedAncestor = false;
        if (record.parentCidHash) {
            let ancestor = record.parentCidHash.toLowerCase();
            let walked = 0;
            while (ancestor && walked < 20) {
                const ancestorShare = await prisma.keyShare.findFirst({
                    where: {
                        cidHash: ancestor,
                        recipientAddress: recipientLower,
                        status: { notIn: ['revoked', 'rejected'] },
                    },
                    select: { id: true, status: true, allowDelegate: true },
                });
                if (ancestorShare) {
                    if (ancestorShare.status === 'claimed') {
                        inheritsFromClaimedAncestor = true;
                    }
                    if (ancestorShare.allowDelegate === true && finalAllowDelegate === false) {
                        finalAllowDelegate = true;
                    }
                    if (inheritsFromClaimedAncestor && finalAllowDelegate) break;
                }
                const parentRow = await prisma.recordMetadata.findUnique({
                    where: { cidHash: ancestor },
                    select: { parentCidHash: true },
                });
                ancestor = parentRow?.parentCidHash?.toLowerCase() || null;
                walked++;
            }
        }

        // INHERITANCE ENFORCEMENT: Check parent expiry — child cannot outlive parent.
        // BUT: skip clamping when parent's expiresAt is ALREADY EXPIRED. This prevents
        // a stale expired parent from poisoning a fresh re-share. When patient re-shares
        // V3 after V2 has expired, V3 should get the NEW expiry, not be clamped to V2's
        // old expired date.
        let finalExpiresAt = expiresAt;

        if (record.parentCidHash) {
            const parentKeyShare = await prisma.keyShare.findFirst({
                where: {
                    cidHash: record.parentCidHash.toLowerCase(),
                    recipientAddress: recipientLower
                }
            });

            if (parentKeyShare && parentKeyShare.expiresAt) {
                const parentExpiry = new Date(parentKeyShare.expiresAt);
                // Only clamp if parent is still ACTIVE (not expired)
                if (parentExpiry.getTime() > Date.now()) {
                    const requestedExpiry = finalExpiresAt ? new Date(finalExpiresAt) : null;
                    if (!requestedExpiry || requestedExpiry > parentExpiry) {
                        log.info('Clamping expiry to parent', { parentExpiry: parentExpiry.toISOString() });
                        finalExpiresAt = parentExpiry.toISOString();
                    }
                } else {
                    log.info('Skipping expired parent clamp', { parentExpiry: parentExpiry.toISOString(), cidHash: cidHashLower });
                }
            }
        }

        // Routed through keyShareWriter.applyShare so the timestamp guard rejects
        // stale revoke events from the catchup queue overwriting this fresh
        // share. Source distinguishes a manual share from cascade/auto-claim
        // (used in audit log and UI). preserveClaimed prevents a doctor's
        // already-claimed row from being downgraded back to pending when the
        // patient idempotently re-shares.
        const isSelfShare = senderAddress.toLowerCase() === recipientLower;
        const autoClaim = isSelfShare || inheritsFromClaimedAncestor;
        const writeSource = inheritsFromClaimedAncestor ? 'cascade' : 'manual';

        const writeResult = await applyShare({
            cidHash: cidHashLower,
            senderAddress: senderAddress.toLowerCase(),
            recipientAddress: recipientLower,
            encryptedPayload,
            senderPublicKey,
            status: autoClaim ? 'claimed' : 'pending',
            expiresAt: finalExpiresAt ? new Date(finalExpiresAt) : null,
            allowDelegate: finalAllowDelegate,
            preserveClaimed: true,
            source: writeSource,
            sourceTimestamp: new Date(),
        });
        const keyShare = writeResult.row;

        // Log access
        await prisma.accessLog.create({
            data: {
                cidHash: cidHashLower,
                accessorAddress: senderAddress,
                action: 'SHARE_KEY',
                consentVerified: true,
            }
        });

        res.status(201).json({
            id: keyShare.id,
            recipientAddress: keyShare.recipientAddress,
            status: keyShare.status,
            createdAt: keyShare.createdAt,
            allowDelegate: finalAllowDelegate, // Return for debug
        });

        // Emit real-time event to recipient (doctor)
        emitToUser(recipientLower, 'record:shared', {
            keyShareId: keyShare.id,
            cidHash: cidHashLower,
            senderAddress: senderAddress,
            recordTitle: record.title || 'Há»“ sÆ¡ má»›i',
        });

        // Push notification (fire and forget; mobile setupNotificationListeners
        // routes data.screen → RecordDetail on tap).
        sendPushToWallet(recipientLower, {
            title: 'Hồ sơ mới được chia sẻ',
            body: `Bạn vừa nhận quyền truy cập một hồ sơ y tế.`,
            data: {
                screen: 'RecordDetail',
                params: { record: { cidHash: cidHashLower, title: record.title || 'Hồ sơ được chia sẻ' } },
                kind: 'record_shared',
            },
        }).catch((err) => log.warn('push send failed', { error: err?.message }));

    } catch (error) {
        next(error);
    }
});

// POST /api/key-share/bulk-trusted-contact — encryption ceremony for a new
// Trusted Contact. Sender (patient) submits one batch encrypting all their
// records' AES keys for the contact's pubkey. Backend validates + writes one
// KeyShare row per item via keyShareWriter.applyShare.
router.post('/bulk-trusted-contact', authenticate, async (req, res, next) => {
    try {
        const { recipientAddress, senderPublicKey, items } = bulkTrustedContactSchema.parse(req.body);

        const sender = req.user.walletAddress.toLowerCase();
        const recipient = recipientAddress.toLowerCase();

        if (sender === recipient) {
            return res.status(400).json({
                code: 'CONTACT_IS_SELF',
                error: 'Không thể tự đặt mình làm Người thân tin cậy',
            });
        }

        // Verify recipient is currently an active Trusted Contact of the sender.
        // This is the auth gate — if the contact isn't on the patient's
        // on-chain registry (subgraph cache), we refuse to pre-share.
        const tc = await prisma.trustedContact.findUnique({
            where: {
                patientAddress_contactAddress: {
                    patientAddress: sender,
                    contactAddress: recipient,
                },
            },
        });
        if (!tc || tc.status !== 'active') {
            return res.status(403).json({
                code: 'NOT_A_TRUSTED_CONTACT',
                error: 'Người nhận chưa được đăng ký làm Người thân tin cậy của bạn. Hãy thêm họ trước khi pre-share.',
            });
        }

        // Verify every cidHash in the batch is owned (ownerAddress=sender) or
        // created (createdBy=sender) by the patient. Doctor-authored records
        // for a patient have ownerAddress=patient, so this single condition
        // covers both create cases.
        const cidHashes = items.map((i) => i.cidHash.toLowerCase());
        const records = await prisma.recordMetadata.findMany({
            where: { cidHash: { in: cidHashes } },
            select: { cidHash: true, ownerAddress: true, createdBy: true },
        });
        const recordByCid = new Map(records.map((r) => [r.cidHash.toLowerCase(), r]));

        const unowned = [];
        for (const cid of cidHashes) {
            const rec = recordByCid.get(cid);
            if (!rec) {
                unowned.push({ cidHash: cid, reason: 'RECORD_NOT_FOUND' });
                continue;
            }
            const owns = rec.ownerAddress?.toLowerCase() === sender;
            const created = rec.createdBy?.toLowerCase() === sender;
            if (!owns && !created) {
                unowned.push({ cidHash: cid, reason: 'NOT_OWNED' });
            }
        }
        if (unowned.length > 0) {
            return res.status(403).json({
                code: 'BULK_AUTH_FAILED',
                error: 'Một hoặc nhiều hồ sơ không thuộc quyền sở hữu của bạn.',
                details: unowned,
            });
        }

        // Write KeyShare rows. Idempotent on (cidHash, sender, recipient).
        const sourceTimestamp = new Date();
        let written = 0;
        const failures = [];
        for (const item of items) {
            try {
                await applyShare({
                    cidHash: item.cidHash.toLowerCase(),
                    senderAddress: sender,
                    recipientAddress: recipient,
                    encryptedPayload: item.encryptedPayload,
                    senderPublicKey,
                    status: 'claimed',  // Trusted Contact pre-share is auto-claimed
                    expiresAt: null,    // FOREVER until the contact is revoked
                    allowDelegate: true, // Trusted Contact can re-share to ER doctor
                    source: 'trusted-contact-pre-share',
                    sourceTimestamp,
                });
                written += 1;
            } catch (err) {
                log.warn('Bulk pre-share item failed', { cidHash: item.cidHash, error: err?.message });
                failures.push({ cidHash: item.cidHash, error: err?.message });
            }
        }

        log.info('Bulk pre-share complete', { sender, recipient, written, failures: failures.length });

        emitToUser(recipient, 'trustedContactPreShareReceived', {
            patient: sender,
            count: written,
        });

        sendPushToWallet(recipient, {
            title: 'Bạn đã nhận khoá hồ sơ',
            body: `Bệnh nhân vừa chia sẻ ${written} hồ sơ y tế cho bạn với tư cách Người thân tin cậy.`,
            data: { kind: 'trusted_contact_pre_share', patient: sender, count: written },
        }).catch((e) => log.warn('push failed', { error: e?.message }));

        res.json({
            success: true,
            written,
            failed: failures.length,
            failures,
        });
    } catch (error) {
        log.error('bulk-trusted-contact failed', { error: error.message });
        next(error);
    }
});

// GET /api/key-share/my - Get keys shared with me (ONLY after on-chain claim)
router.get('/my', authenticate, async (req, res, next) => {
    try {
        const recipientAddress = req.user.walletAddress.toLowerCase();

        // Include 'revoked' rows so they surface trong mục "Hồ sơ hết hạn /
        // bị thu hồi" của doctor (user feedback 2026-05-28: doctor cần biết
        // hồ sơ nào đã từng có quyền mà bị thu hồi). Frontend dashboard tự
        // ẩn inactive (active===false) ra khỏi list chính. Vẫn loại 'rejected'
        // (request never accepted) + post-revoke versions doctor tạo (orphan
        // synth filter dưới — chain root walk).
        const keyShares = await prisma.keyShare.findMany({
            where: {
                recipientAddress,
                status: { notIn: ['rejected'] },
            },
            include: {
                record: true,
                sender: {
                    select: { walletAddress: true, publicKey: true, encryptionPublicKey: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Defensive union: include records where the user is the `createdBy`
        // (doctor who authored the record) but no KeyShare row exists (e.g. a
        // transient upsert failure during /save-only). Without this, a doctor
        // may never see records they just created if the KeyShare write fell
        // through. Synthesize a self-access "virtual KeyShare" for those.
        //
        // BUT: skip cidHashes where the patient explicitly revoked the
        // doctor's KeyShare. Without this guard, after a revoke the row was
        // excluded from `keyShares` (filter notIn:['revoked',...]), then the
        // doctor's createdBy lookup re-synthesized it as `status='claimed'`,
        // making the dashboard show a ghost row that the doctor couldn't
        // actually decrypt (on-chain canAccess gate denied).
        const existingCids = new Set(keyShares.map(ks => ks.cidHash?.toLowerCase()).filter(Boolean));
        const revokedRows = await prisma.keyShare.findMany({
            where: { recipientAddress, status: 'revoked' },
            select: { cidHash: true },
        });
        const revokedCids = new Set(revokedRows.map((r) => r.cidHash?.toLowerCase()).filter(Boolean));
        const excludeCids = Array.from(new Set([...existingCids, ...revokedCids]));
        const orphanCreatedRaw = await prisma.recordMetadata.findMany({
            where: {
                createdBy: recipientAddress,
                syncStatus: 'confirmed',
                NOT: { cidHash: { in: excludeCids } },
            },
            orderBy: { createdAt: 'desc' },
        });

        // BUG FIX (2026-05-28): walk parent chain when checking revoked status.
        // Scenario user-reported: doctor mất quyền v1/v2 (patient revoke cascade)
        // → doctor tạo update v3, v4. orphanCreated trả về v3/v4 (cidHash KHÔNG
        // ở revokedCids vì revoke chỉ direct match v1/v2). Synthesis tạo KeyShare
        // ảo cho v3/v4 → doctor dashboard hiển thị "Hồ sơ đã nhận" + click thấy
        // toàn bộ chain metadata. → Leak: doctor xem được tên/metadata version
        // tạo AFTER patient đã revoke.
        //
        // Fix: walk parentCidHash chain cho mỗi revoked + orphanCreated; nếu
        // chain root nào giao nhau → exclude orphan.
        const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const chainRootCache = new Map(); // cidHash → root cidHash
        async function findChainRoot(cid) {
            const startLower = cid.toLowerCase();
            if (chainRootCache.has(startLower)) return chainRootCache.get(startLower);
            let current = startLower;
            const path = [current];
            const seen = new Set(path);
            for (let depth = 0; depth < 20; depth++) {
                const rec = await prisma.recordMetadata.findUnique({
                    where: { cidHash: current },
                    select: { parentCidHash: true },
                });
                const parent = rec?.parentCidHash?.toLowerCase();
                if (!parent || parent === ZERO_HASH || seen.has(parent)) break;
                current = parent;
                seen.add(current);
                path.push(current);
            }
            // Cache root for every node in walk path
            for (const node of path) chainRootCache.set(node, current);
            return current;
        }

        // Compute roots of all revoked chains
        const revokedRoots = new Set();
        for (const cid of revokedCids) {
            revokedRoots.add(await findChainRoot(cid));
        }

        // Filter orphanCreated: drop any record whose chain root has been revoked
        // for this doctor (transitive — covers doctor-created updates AFTER revoke).
        const orphanCreated = [];
        for (const rec of orphanCreatedRaw) {
            const root = await findChainRoot(rec.cidHash);
            if (revokedRoots.has(root)) continue;
            orphanCreated.push(rec);
        }

        // Build a lookup of existing real KeyShare allowDelegate values keyed
        // by cidHash, so synth rows can inherit the chain's effective delegate
        // flag instead of hardcoding false (same medical-episode invariant as
        // POST /api/key-share + save-only-doctor inheritance fixes).
        const allowDelegateByCid = new Map();
        for (const ks of keyShares) {
            const key = ks.cidHash?.toLowerCase();
            if (key) allowDelegateByCid.set(key, ks.allowDelegate === true);
        }

        // Synthesize entries shaped like a KeyShare include result so the
        // processing loop below can handle them uniformly.
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const syntheticKeyShares = orphanCreated.map((record) => {
            // Inherit allowDelegate from parent KeyShare if present. Synth row
            // represents a doctor-created record with no real KeyShare row;
            // per medical-episode model the chain root's allowDelegate applies.
            const parentAllowDelegate = record.parentCidHash
                ? (allowDelegateByCid.get(record.parentCidHash.toLowerCase()) === true)
                : false;
            return {
                id: `synthetic-${record.cidHash}`,
                cidHash: record.cidHash,
                senderAddress: record.ownerAddress,
                recipientAddress,
                encryptedPayload: null,  // doctor still has local AES cache from creation
                senderPublicKey: null,
                allowDelegate: parentAllowDelegate,
                status: 'claimed',
                createdAt: record.createdAt,
                claimedAt: record.createdAt,
                expiresAt: new Date(new Date(record.createdAt).getTime() + SEVEN_DAYS_MS),
                record,
                sender: null,
                _synthetic: true,
            };
        });
        keyShares.push(...syntheticKeyShares);

        // Create a map to look up parent status efficiently
        const recordsMap = new Map();
        keyShares.forEach(ks => {
            const key = ks.cidHash?.toLowerCase();
            if (key && !recordsMap.has(key)) {
                recordsMap.set(key, ks); // Keep the NEWEST one (first in sorted list)
            }
        });

        // Resolve status based on DB and Parent Inheritance (No RPC Loop)
        const processedRecords = keyShares.map(ks => {
            const isSelfCreated = ks.record?.createdBy?.toLowerCase() === recipientAddress;
            const senderKey = ks.senderPublicKey || ks.sender?.encryptionPublicKey || null;

            // 1. Check direct expiry — revoked rows always treat as inactive.
            const isRevokedStatus = ks.status === 'revoked';
            let isExpired = isRevokedStatus || (ks.expiresAt && new Date(ks.expiresAt).getTime() < Date.now());
            let isActive = !isExpired;

            // 2. Chain Inheritance Logic (bidirectional):
            // a) If child is expired but parent is valid → child inherits parent validity
            // b) If parent is expired → child MUST also be expired (parent revoke kills children)
            if (ks.record?.parentCidHash) {
                const parentShare = recordsMap.get(ks.record.parentCidHash?.toLowerCase());

                if (parentShare) {
                    const parentExpired = parentShare.expiresAt && new Date(parentShare.expiresAt).getTime() < Date.now();

                    if (parentExpired) {
                        // Parent expired → force child expired too (revocation propagation)
                        isActive = false;
                        isExpired = true;
                    } else if (isExpired && !parentExpired) {
                        // Child expired but parent valid → child inherits parent validity
                        isActive = true;
                        isExpired = false;
                        ks.inheritedExpiresAt = parentShare.expiresAt;
                    }
                }
            }



            // 3. Find Root Logic (Traverse up checking local map)
            let rootShare = ks;
            let depth = 0;
            while (rootShare.record?.parentCidHash && recordsMap.has(rootShare.record.parentCidHash.toLowerCase()) && depth < 20) {
                rootShare = recordsMap.get(rootShare.record.parentCidHash.toLowerCase());
                depth++;
            }
            const computedRootCidHash = rootShare.cidHash; // If no parent, Self is Root

            return {
                ...ks,
                active: isActive,
                // UI helper for "Effective Expiry"
                expiresAt: ks.inheritedExpiresAt || ks.expiresAt,

                // SECURITY: Don't return encryptedPayload in the list endpoint —
                // payload is served via GET /record/:cidHash which checks on-chain
                // canAccess. EXCEPTION: self-share rows (sender == recipient) are
                // the patient's own backup and safe to return — the patient is the
                // owner and can always canAccess their own records.
                encryptedPayload: (ks.senderAddress?.toLowerCase() === recipientAddress)
                    ? ks.encryptedPayload
                    : null,
                senderPublicKey: isActive ? senderKey : null,

                // Legacy fields for frontend compatibility
                hasOnChainAccess: isActive,
                parentCidHash: ks.record?.parentCidHash || null,
                rootCidHash: computedRootCidHash || null, // FIX: Use computed root
            };
        });

        res.json(processedRecords);
    } catch (error) {
        next(error);
    }
});

// GET /api/key-share/missing-for-creator (S12.C, 2026-04-25)
// For records the caller AUTHORED (createdBy = caller), find recipients who
// have on-chain consent on the chain but NO KeyShare row for this specific
// version. Mobile uses the result to re-encrypt the AES key from local cache
// and upload — heals the "patient never had pubkey at creation time, so V1
// patient KeyShare missing → cascade to new doctor silently skips V1" bug.
router.get('/missing-for-creator', authenticate, async (req, res, next) => {
    try {
        const creatorAddress = req.user.walletAddress.toLowerCase();

        // Records this user created (any version, any chain).
        const myRecords = await prisma.recordMetadata.findMany({
            where: {
                createdBy: creatorAddress,
                syncStatus: 'confirmed',
            },
            select: { cidHash: true, parentCidHash: true },
        });

        if (myRecords.length === 0) {
            return res.json([]);
        }

        // Compute chain root for each record (consent is keyed at root).
        const rootCache = new Map();
        const computeRoot = async (cidHash) => {
            if (rootCache.has(cidHash)) return rootCache.get(cidHash);
            let cursor = cidHash;
            let depth = 0;
            while (depth < 50) {
                const r = await prisma.recordMetadata.findUnique({
                    where: { cidHash: cursor },
                    select: { parentCidHash: true },
                });
                if (!r?.parentCidHash) {
                    rootCache.set(cidHash, cursor);
                    return cursor;
                }
                cursor = r.parentCidHash;
                depth++;
            }
            rootCache.set(cidHash, cursor);
            return cursor;
        };

        const orphans = [];
        for (const r of myRecords) {
            const root = await computeRoot(r.cidHash);

            // Active consents on this chain (mirror of on-chain ConsentLedger).
            // Consent.expiresAt is non-nullable per schema, so a simple `gt`
            // check covers all live consents — no null branch needed.
            const consents = await prisma.consent.findMany({
                where: {
                    cidHash: root,
                    status: 'active',
                    expiresAt: { gt: new Date() },
                },
                select: { granteeAddress: true },
            });

            for (const c of consents) {
                if (c.granteeAddress.toLowerCase() === creatorAddress) continue; // skip self

                const existing = await prisma.keyShare.findFirst({
                    where: {
                        cidHash: r.cidHash,
                        recipientAddress: c.granteeAddress.toLowerCase(),
                        status: { notIn: ['revoked', 'rejected'] },
                    },
                    select: { id: true },
                });
                if (existing) continue;

                const u = await prisma.user.findUnique({
                    where: { walletAddress: c.granteeAddress.toLowerCase() },
                    select: { encryptionPublicKey: true },
                });
                if (!u?.encryptionPublicKey) continue;

                orphans.push({
                    cidHash: r.cidHash,
                    recipientAddress: c.granteeAddress.toLowerCase(),
                    recipientPubkey: u.encryptionPublicKey,
                });
            }
        }

        res.json(orphans);
    } catch (error) {
        next(error);
    }
});

// NEW: GET /api/key-share/delegatable - Get records I can re-share (allowDelegate=true)
router.get('/delegatable', authenticate, async (req, res, next) => {
    try {
        const userAddress = req.user.walletAddress.toLowerCase();

        // Find key shares where:
        // 1. User is the recipient
        // 2. allowDelegate is true
        // 3. Status is claimed (user has accessed)
        // 4. Not expired
        const delegatableShares = await prisma.keyShare.findMany({
            where: {
                recipientAddress: userAddress,
                allowDelegate: true,
                status: 'claimed',
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } }
                ]
            },
            include: {
                record: {
                    select: {
                        cidHash: true,
                        title: true,
                        recordType: true,
                        ownerAddress: true,
                        createdAt: true,
                        parentCidHash: true,
                    }
                },
                sender: {
                    select: { walletAddress: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Enrich with on-chain consent check (IMPLEMENT TRAVERSAL)
        const results = await Promise.all(
            delegatableShares.map(async (ks) => {
                let hasOnChainAccess = true;
                let rootCidHash = ks.cidHash; // Default to self

                if (ks.record?.ownerAddress) {
                    try {
                        // 1. Check strict consent
                        hasOnChainAccess = await checkConsent(
                            ks.record.ownerAddress,
                            userAddress,
                            ks.cidHash
                        );

                        // 2. Traversal & Root Resolution
                        if (ks.record.parentCidHash) {
                            let currentCid = ks.record.parentCidHash;
                            let depth = 0;

                            // Walk up the chain
                            while (currentCid && depth < 20) {
                                rootCidHash = currentCid; // Update root candidate

                                // If strict consent failed, check ancestor
                                if (!hasOnChainAccess) {
                                    const ancestorConsent = await checkConsent(
                                        ks.record.ownerAddress,
                                        userAddress,
                                        currentCid
                                    );
                                    if (ancestorConsent) {
                                        hasOnChainAccess = true;
                                        // We don't break immediately because we still want to find the TRUE Root
                                        // (though usually Root is the one with consent)
                                    }
                                }

                                // Get next parent
                                const parent = await prisma.recordMetadata.findUnique({
                                    where: { cidHash: currentCid },
                                    select: { parentCidHash: true }
                                });
                                if (!parent) break;
                                currentCid = parent.parentCidHash;
                                depth++;
                            }
                        }
                    } catch (err) {
                        log.warn('On-chain check failed for delegatable', { cidHash: ks.cidHash, error: err.message });
                        // If check fails, we might want to default to false or keep true if logic implies?
                        // Original logic defaulted 'hasOnChainAccess = true' then checked.
                        // But if check throws, it stays true? RISK.
                        // Better to set false on error? Or assume read-only ok?
                        // Let's stick to "If checkConsent matches contract logic".
                        // If contract call failed, we assume FALSE for safety.
                        hasOnChainAccess = false;
                    }
                }

                return {
                    id: ks.id,
                    cidHash: ks.cidHash,
                    rootCidHash: rootCidHash,
                    record: ks.record,
                    sharedBy: ks.sender?.walletAddress,
                    expiresAt: ks.expiresAt,
                    status: ks.status,
                    hasOnChainAccess,
                };
            })
        );

        // Only return records with active on-chain consent
        const finalResults = results.filter(r => r.hasOnChainAccess);
        res.json(finalResults);
    } catch (error) {
        next(error);
    }
});

// GET /api/key-share/sent - Get keys I've shared
router.get('/sent', authenticate, async (req, res, next) => {
    try {
        const me = req.user.walletAddress.toLowerCase();
        const keyShares = await prisma.keyShare.findMany({
            where: {
                senderAddress: me,
                // Exclude self-share rows (sender == recipient). Those are recovery
                // backups the patient creates for themselves and should not appear
                // in "Nhật ký truy cập" which lists permissions granted to OTHERS.
                NOT: { recipientAddress: me },
            },
            include: {
                recipient: {
                    select: { walletAddress: true }
                },
                record: {
                    select: { cidHash: true, parentCidHash: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Compute rootCidHash per row so the client can group versions of the
        // same logical record under one UI row. On-chain consent is keyed by
        // rootCidHash, so a single revoke covers every version in the group.
        const byCid = new Map();
        for (const ks of keyShares) {
            const key = ks.cidHash?.toLowerCase();
            if (key) byCid.set(key, ks);
        }
        const resolveRoot = (ks) => {
            let cursor = ks;
            let depth = 0;
            while (
                cursor?.record?.parentCidHash
                && byCid.has(cursor.record.parentCidHash.toLowerCase())
                && depth < 20
            ) {
                cursor = byCid.get(cursor.record.parentCidHash.toLowerCase());
                depth += 1;
            }
            return cursor.cidHash;
        };
        const payload = keyShares.map((ks) => ({
            ...ks,
            parentCidHash: ks.record?.parentCidHash || null,
            rootCidHash: resolveRoot(ks),
        }));

        // Compute total version count per chain root từ RecordMetadata. Lý do
        // KHÔNG đếm bằng KeyShare rows: khi doctor làm addRecordByDoctor tạo
        // version mới, KeyShare row mới có senderAddress=doctor (không phải
        // patient) → patient's /sent miss those rows → count thiếu version.
        // Walk descendants tử root để có true chain size.
        const uniqueRoots = new Set(
            payload.map((p) => p.rootCidHash?.toLowerCase()).filter(Boolean)
        );
        const chainCountByRoot = new Map();
        for (const root of uniqueRoots) {
            const visited = new Set([root]);
            let frontier = [root];
            // Hard cap 200 versions per chain (same as collectDescendantCidHashes
            // in consentLedgerSync) — pathological deep chains stop walking.
            while (frontier.length > 0 && visited.size < 200) {
                const batch = frontier.splice(0);
                const children = await prisma.recordMetadata.findMany({
                    where: { parentCidHash: { in: batch } },
                    select: { cidHash: true },
                });
                const next = [];
                for (const c of children) {
                    const h = c.cidHash?.toLowerCase();
                    if (h && !visited.has(h)) {
                        visited.add(h);
                        next.push(h);
                    }
                }
                frontier = next;
            }
            chainCountByRoot.set(root, visited.size);
        }
        for (const p of payload) {
            const root = p.rootCidHash?.toLowerCase();
            p.chainVersionCount = (root && chainCountByRoot.get(root)) || 1;
        }

        // BUG FIX (2026-05-28+) — cascade expiry / revoke từ source consent:
        // Khi A re-share record cho B (sender=A=me, recipient=B), KeyShare(B)
        // row có expiresAt riêng. Nếu A's consent từ patient hết hạn (time)
        // hoặc bị revoke, on-chain canAccess(P, B, cid) sẽ refuse (qua
        // recordDelegationSource cascade trong _hasValidNormalConsent), nhưng
        // backend KeyShare row của B KHÔNG tự flip status. → Frontend hiển
        // thị B vẫn "Còn ∞ ngày" mặc dù truth on-chain là expired/revoked.
        //
        // §13 fix chỉ cover REVOKE event (handleConsentRevoked listener).
        // Time-based expiry KHÔNG emit event → backend phải runtime check.
        //
        // Fix: với mỗi unique root, lookup Consent(patient=record.owner,
        // grantee=me=A, cidHash=root). Nếu A's consent đã expired/revoked
        // → set effectiveActive=false + effectiveExpiresAt=A's expiry trên
        // tất cả rows của root đó. Skip rows mà me là OWNER (direct grant,
        // không phải delegation-derived).
        if (payload.length > 0) {
            // Lookup record owner + my consent cho mỗi unique root
            const rootList = Array.from(uniqueRoots);
            const records = await prisma.recordMetadata.findMany({
                where: { cidHash: { in: rootList } },
                select: { cidHash: true, ownerAddress: true },
            });
            const ownerByRoot = new Map(
                records.map((r) => [r.cidHash.toLowerCase(), r.ownerAddress?.toLowerCase()])
            );

            // Batch query Consent table cho (P, me, root) các root có owner != me
            const consentsToCheck = rootList
                .map((root) => ({ root, owner: ownerByRoot.get(root) }))
                .filter((x) => x.owner && x.owner !== me);

            const sourceConsentByRoot = new Map();
            if (consentsToCheck.length > 0) {
                const consents = await prisma.consent.findMany({
                    where: {
                        granteeAddress: me,
                        cidHash: { in: consentsToCheck.map((x) => x.root) },
                        // patient = owner — filter sau khi fetch để batch tốt hơn
                    },
                    select: { patientAddress: true, cidHash: true, status: true, expiresAt: true },
                });
                for (const c of consents) {
                    const root = c.cidHash.toLowerCase();
                    const expectedOwner = ownerByRoot.get(root);
                    if (c.patientAddress.toLowerCase() === expectedOwner) {
                        sourceConsentByRoot.set(root, c);
                    }
                }
            }

            const now = Date.now();
            for (const p of payload) {
                const root = p.rootCidHash?.toLowerCase();
                if (!root) continue;
                const owner = ownerByRoot.get(root);
                // Direct grant (me là owner/patient) → KHÔNG cascade
                if (!owner || owner === me) {
                    p.effectiveActive = undefined; // sentinel: not delegation-derived
                    continue;
                }
                // Delegation-derived → check source
                const src = sourceConsentByRoot.get(root);
                if (!src) {
                    // Không có Consent row cho A — có thể consent chưa sync hoặc
                    // không tồn tại. Conservative: treat as inactive để tránh
                    // lie. Frontend có thể cảnh báo "chưa xác định".
                    p.effectiveActive = false;
                    p.sourceConsentMissing = true;
                    continue;
                }
                const srcExpired =
                    src.status === 'revoked' ||
                    (src.expiresAt && new Date(src.expiresAt).getTime() < now);
                p.effectiveActive = !srcExpired;
                if (srcExpired) {
                    p.effectiveExpiresAt = src.expiresAt;
                    p.sourceStatus = src.status; // 'active' / 'revoked'
                }
            }
        }

        res.json(payload);
    } catch (error) {
        next(error);
    }
});

// NEW: GET /api/key-share/recipients/:cidHash - Get all team members who have access to this record
// Used for "Broadcast Update" (Doctor B updates -> shares with Doctor C who also saw original)
router.get('/recipients/:cidHash', authenticate, async (req, res, next) => {
    try {
        const { cidHash } = req.params;
        const cidHashLower = cidHash.toLowerCase();
        const requesterAddress = req.user.walletAddress.toLowerCase();

        // 1. Verify requester has access to this record themselves
        // (Must participate in the chain to see others)
        const myAccess = await prisma.keyShare.findFirst({
            where: {
                cidHash: cidHashLower,
                OR: [
                    { recipientAddress: requesterAddress },
                    { senderAddress: requesterAddress }
                ],
                status: { not: 'revoked' }
            }
        });

        // Also check if requester is owner or creator
        const record = await prisma.recordMetadata.findUnique({
            where: { cidHash: cidHashLower }
        });

        const isOwner = record?.ownerAddress?.toLowerCase() === requesterAddress;
        const isCreator = record?.createdBy?.toLowerCase() === requesterAddress;

        if (!myAccess && !isOwner && !isCreator) {
            return res.status(403).json({ code: 'CONSENT_NOT_FOUND', error: 'You do not have access to this record', message: 'You do not have access to this record' });
        }

        // 2. Fetch all recipients who have claimed the key for this record
        // Include 'pending' shares too so auto-propagate (patient creates V2)
        // still cascades keys to doctors who were granted V1 but haven't
        // claimed it yet. Filtering to status='claimed' left recipients
        // stranded when the patient updated before the doctor logged in.
        // Exclude: revoked/rejected (dead), awaiting_claim (2-step request
        // not completed on-chain — no consent yet).
        const recipients = await prisma.keyShare.findMany({
            where: {
                cidHash: cidHashLower,
                status: { notIn: ['revoked', 'rejected', 'awaiting_claim'] },
            },
            include: {
                recipient: {
                    select: {
                        walletAddress: true,
                        encryptionPublicKey: true,
                        email: true
                    }
                }
            }
        });

        // Return public keys for re-encryption + flags the mobile share-modal
        // downgrade guard reads. Consent covers the whole chain (medical episode
        // model), so allowDelegate + expiresAt are the only per-share flags.
        let team = recipients.map(share => ({
            walletAddress: share.recipient.walletAddress,
            encryptionPublicKey: share.recipient.encryptionPublicKey || share.senderPublicKey,
            allowDelegate: share.allowDelegate === true,
            expiresAt: share.expiresAt,
            role: 'member'
        }));

        // Cross-check on-chain consent (mirror trong Consent table). KeyShare
        // row chỉ filter status=revoked/rejected, KHÔNG biết về cascade revoke
        // mà handleConsentRevoked skip vì doctor là createdBy của version
        // (authoredCidHashes exclusion ở consentLedgerSync.service.js:511-521).
        // Hệ quả: row 'claimed' vẫn return cho doctor đã bị revoked → mobile
        // share-sheet pop alert "Bác sĩ đã có quyền dài hạn hơn / Vĩnh viễn"
        // dù consent on-chain đã revoke. Fix: walk root, query Consent table,
        // chỉ giữ recipient có Consent active.
        if (team.length > 0 && record?.ownerAddress) {
            // Walk parent chain → root (Consent key by root per medical episode model)
            let rootCid = cidHashLower;
            for (let depth = 0; depth < 50; depth++) {
                const r = await prisma.recordMetadata.findUnique({
                    where: { cidHash: rootCid },
                    select: { parentCidHash: true },
                });
                if (!r?.parentCidHash) break;
                rootCid = r.parentCidHash.toLowerCase();
            }

            const ownerLower = record.ownerAddress.toLowerCase();
            const granteeAddrs = team.map(t => t.walletAddress.toLowerCase());
            const activeConsents = await prisma.consent.findMany({
                where: {
                    patientAddress: ownerLower,
                    granteeAddress: { in: granteeAddrs },
                    cidHash: rootCid,
                    status: 'active',
                    expiresAt: { gt: new Date() },
                },
                select: { granteeAddress: true },
            });
            const activeSet = new Set(
                activeConsents.map(c => c.granteeAddress.toLowerCase())
            );
            team = team.filter(t => activeSet.has(t.walletAddress.toLowerCase()));
        }

        res.json(team);

    } catch (error) {
        next(error);
    }
});

// GET /api/key-share/record/:cidHash - Get key shared for a specific record
// CRITICAL: Must verify on-chain consent before returning key
router.get('/record/:cidHash', authenticate, async (req, res, next) => {
    try {
        const { cidHash } = req.params;
        const cidHashLower = cidHash.toLowerCase();
        const requesterAddress = req.user.walletAddress.toLowerCase();

        // Strict direct lookup — ancestor/descendant fallback removed. Contract
        // now walks chain internally in canAccess; if a KeyShare for this exact
        // cidHash doesn't exist, it means the patient couldn't cascade-share
        // this version's AES key (e.g. a doctor created the update and the
        // doctor→patient self-share is missing). Returning an ancestor payload
        // here caused silent cache poisoning — doctor would decrypt V1 content
        // while thinking they were viewing V2. Explicit 404 makes the missing
        // cascade visible.
        const keyShare = await prisma.keyShare.findFirst({
            where: {
                cidHash: cidHashLower,
                recipientAddress: requesterAddress,
                status: { notIn: ['revoked', 'awaiting_claim', 'rejected'] },
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } },
                ],
            },
            include: {
                sender: { select: { walletAddress: true, encryptionPublicKey: true } },
                record: { select: { ownerAddress: true, createdBy: true, parentCidHash: true } },
            },
        });

        if (!keyShare) {
            const record = await prisma.recordMetadata.findUnique({
                where: { cidHash: cidHashLower },
                select: { createdBy: true, ownerAddress: true },
            });
            if (record) {
                const isCreator = record.createdBy?.toLowerCase() === requesterAddress;
                const isOwner = record.ownerAddress?.toLowerCase() === requesterAddress;
                if (isCreator) {
                    return res.status(404).json({
                        error: 'Khoá giải mã cục bộ đã mất',
                        message: 'Bạn là người tạo hồ sơ nhưng khoá AES chỉ được lưu trên thiết bị ban đầu. Hãy mở lại hồ sơ trên thiết bị cũ hoặc liên hệ quản trị viên để phục hồi.',
                        code: 'CREATOR_KEY_LOST',
                    });
                }
                if (isOwner) {
                    return res.status(404).json({
                        error: 'Chưa có khoá chia sẻ cho hồ sơ này',
                        message: 'Đây có thể là bản cập nhật do bác sĩ khác tạo và họ chưa chia sẻ khoá cho bạn.',
                        code: 'OWNER_KEY_MISSING',
                    });
                }
            }
            return res.status(404).json({
                code: 'KEY_NOT_SHARED_FOR_VERSION',
                error: 'Chưa có khoá cho phiên bản này',
                message: 'Bệnh nhân chưa chia sẻ khoá giải mã cho đúng phiên bản này. Hãy yêu cầu bệnh nhân chia sẻ lại.',
            });
        }

        // Permission check — contract canAccess walks the record chain to
        // the canonical root and validates the consent (medical episode
        // model, post-2026-04-19). A single call is sufficient; backend no
        // longer walks anything.
        const isOwner = keyShare.record?.ownerAddress?.toLowerCase() === requesterAddress;
        const isCreator = keyShare.record?.createdBy?.toLowerCase() === requesterAddress;

        if (!isOwner && !isCreator) {
            const ownerAddress = keyShare.record?.ownerAddress;
            if (ownerAddress) {
                const hasOnChainConsent = await checkConsent(ownerAddress, requesterAddress, cidHashLower);
                if (!hasOnChainConsent) {
                    // BUG FIX 2026-05-28: Trusted Contact bypass.
                    // canAccess() trong ConsentLedger KHÔNG check
                    // isTrustedContact[patient][contact] mapping → backend
                    // refuse contact dù KeyShare đã pre-share + on-chain
                    // setTrustedContactBySig đã thành công. Kết quả: contact
                    // mở record thấy "Quyền truy cập đã bị thu hồi" sai.
                    //
                    // Fix: nếu canAccess fail, check TrustedContact table
                    // mirror (cập nhật từ TrustedContactSet event). Nếu
                    // requester là active TC của owner → grant access (TC
                    // có off-chain trust, KeyShare pre-share đã có sẵn).
                    const isTrustedContact = await prisma.trustedContact.findFirst({
                        where: {
                            patientAddress: ownerAddress.toLowerCase(),
                            contactAddress: requesterAddress,
                            status: 'active',
                        },
                        select: { id: true },
                    });
                    if (isTrustedContact) {
                        log.info('Access GRANTED via Trusted Contact bypass', {
                            cidHash: cidHashLower,
                            patient: ownerAddress,
                            contact: requesterAddress,
                        });
                        // Fall through — trả keyShare bình thường ở dưới.
                    } else {
                        let notVerifiedDoctor = false;
                        try {
                            const [isDoc, isVerifiedDoc] = await Promise.all([
                                publicClient.readContract({
                                    address: CONTRACT_ADDRESSES.AccessControl,
                                    abi: ACCESS_CONTROL_ABI,
                                    functionName: 'isDoctor',
                                    args: [requesterAddress],
                                }),
                                publicClient.readContract({
                                    address: CONTRACT_ADDRESSES.AccessControl,
                                    abi: ACCESS_CONTROL_ABI,
                                    functionName: 'isVerifiedDoctor',
                                    args: [requesterAddress],
                                }),
                            ]);
                            notVerifiedDoctor = Boolean(isDoc) && !isVerifiedDoc;
                        } catch (e) {
                            log.warn('verify-check failed', { err: e && e.message });
                        }

                        log.warn('Access DENIED', {
                            cidHash: cidHashLower,
                            user: requesterAddress,
                            reason: notVerifiedDoctor ? 'DOCTOR_NOT_VERIFIED' : 'CONSENT_REVOKED',
                        });

                        if (notVerifiedDoctor) {
                            return res.status(403).json({
                                error: 'Bác sĩ chưa được xác minh',
                                message: 'Tài khoản bác sĩ của bạn chưa được tổ chức y tế xác minh on-chain. Vui lòng liên hệ quản trị viên tổ chức để được duyệt trước khi truy cập hồ sơ.',
                                code: 'DOCTOR_NOT_VERIFIED',
                            });
                        }

                        return res.status(403).json({
                            error: 'Quyền truy cập đã bị thu hồi',
                            message: 'Chủ sở hữu đã thu hồi quyền truy cập hồ sơ này.',
                            consentRevoked: true,
                            code: 'CONSENT_REVOKED',
                        });
                    }
                }
            }
        }

        res.json({
            id: keyShare.id,
            cidHash: keyShare.cidHash,
            encryptedPayload: keyShare.encryptedPayload,
            senderPublicKey: keyShare.senderPublicKey || keyShare.sender?.encryptionPublicKey || null,
            senderAddress: keyShare.senderAddress,
            status: keyShare.status,
        });
    } catch (error) {
        next(error);
    }
});


// POST /api/key-share/:id/claim - Mark key as claimed (REQUIRES ON-CHAIN CONSENT)
router.post('/:id/claim', authenticate, async (req, res, next) => {
    try {
        const keyShare = await prisma.keyShare.findUnique({
            where: { id: req.params.id },
            include: {
                record: true,  // Need record to get owner address
            }
        });

        if (!keyShare) {
            return res.status(404).json({ code: 'KEY_SHARE_NOT_FOUND', error: 'Key share not found', message: 'Key share not found' });
        }

        if (keyShare.recipientAddress?.toLowerCase() !== req.user.walletAddress?.toLowerCase()) {
            return res.status(403).json({ code: 'REQUEST_NOT_AUTHORIZED', error: 'Not authorized', message: 'Not authorized' });
        }

        if (keyShare.status === 'revoked') {
            return res.status(403).json({
                code: 'KEY_SHARE_REVOKED',
                error: 'Bệnh nhân đã thu hồi quyền truy cập',
                message: 'Bệnh nhân đã thu hồi quyền truy cập hồ sơ này. Vui lòng yêu cầu lại nếu cần.',
            });
        }

        if (keyShare.expiresAt && keyShare.expiresAt < new Date()) {
            return res.status(400).json({ code: 'KEY_SHARE_EXPIRED', error: 'Key share has expired', message: 'Key share has expired' });
        }

        // âš ï¸ SECURITY: Check KeyShare status instead of on-chain
        // KeyShare only becomes 'pending' after Doctor claims on-chain via mark-claimed route
        // This is secure because mark-claimed requires the claim tx hash
        if (keyShare.status === 'awaiting_claim') {
            return res.status(403).json({
                error: 'Please claim access on-chain first by clicking "Nháº­n truy cáº­p".',
                requiresOnChainClaim: true,
            });
        }

        // CRITICAL: Revalidate on-chain consent at claim time.
        // DB row may still say 'pending' even though a parent delegator in the
        // CHAIN has since revoked. Epoch bumps make downstream consents dead
        // without touching this cached row. Ask canAccess() which walks the
        // full delegation chain including parent-epoch and patient-epoch mismatches.
        //
        // IMPORTANT: canAccess returns false for UNVERIFIED doctors (FIX audit #3).
        // In that case the consent IS valid — the doctor simply needs to get verified.
        // We must NOT revoke the KeyShare row, otherwise the patient would have to
        // re-share after the doctor is verified. Instead, return a specific error
        // code so the mobile UI can show a targeted message.
        // SAFETY: record relation MUST exist for consent verification.
        // If missing (DB inconsistency), deny claim rather than skip check.
        if (!keyShare.record) {
            log.error('KeyShare record relation missing — cannot verify consent', { keyShareId: keyShare.id });
            return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Dữ liệu hồ sơ không đồng bộ. Vui lòng thử lại.' });
        }

        // Revalidate on-chain consent at claim time. Contract's canAccess
        // walks the record chain to canonical root (medical episode model)
        // and is the source of truth. No backend walk needed.
        const ownerAddress = keyShare.record.ownerAddress?.toLowerCase();
        if (ownerAddress) {
            const recipientLower = keyShare.recipientAddress.toLowerCase();
            const cidHashLower = keyShare.cidHash.toLowerCase();

            const hasAccess = await checkConsent(ownerAddress, recipientLower, cidHashLower);

            if (!hasAccess) {
                // Check if doctor not verified (FIX #3) — don't revoke KeyShare
                let doctorNotVerified = false;
                try {
                    const [isDoc, isVerified] = await Promise.all([
                        publicClient.readContract({
                            address: CONTRACT_ADDRESSES.AccessControl,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'isDoctor',
                            args: [recipientLower],
                        }),
                        publicClient.readContract({
                            address: CONTRACT_ADDRESSES.AccessControl,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'isVerifiedDoctor',
                            args: [recipientLower],
                        }),
                    ]);
                    doctorNotVerified = isDoc === true && isVerified === false;
                } catch (err) {
                    log.warn('Verify check failed', { error: err?.message });
                }

                if (doctorNotVerified) {
                    return res.status(403).json({
                        code: 'DOCTOR_NOT_VERIFIED',
                        error: 'Tài khoản bác sĩ của bạn chưa được tổ chức y tế xác minh on-chain. Khi được xác minh, bạn sẽ tự động truy cập được hồ sơ này.',
                    });
                }

                // canAccess=false but doctor IS verified. Could be: genuinely
                // revoked on-chain, chain RPC transient fail, or
                // contract/subgraph desync. We USED TO mark the KeyShare row
                // `revoked` here, but that destroyed data for cases (b)+(c)
                // — a single transient failure permanently killed a valid
                // share.
                //
                // Trust the event sync worker: when patient actually revokes
                // on-chain, `ConsentRevoked` flows through consentLedgerSync
                // → KeyShare.status='revoked' via the proper pipeline. Here
                // we just return an error; caller retries on next session.
                log.warn('canAccess returned false for verified doctor — NOT auto-revoking', {
                    keyShareId: keyShare.id,
                    patient: ownerAddress,
                    doctor: recipientLower,
                    cidHash: cidHashLower,
                });
                return res.status(403).json({
                    code: 'ONCHAIN_CONSENT_MISSING',
                    error: 'Quyền truy cập trên blockchain chưa sẵn sàng. Có thể do bị thu hồi, hết hạn, hoặc đang đồng bộ. Vui lòng thử lại sau vài giây.',
                });
            }
        }

        const flipResult = await applyStatusFlip({
            keyShareId: req.params.id,
            newStatus: 'claimed',
            claimedAt: new Date(),
            source: 'recipient-claim',
            sourceTimestamp: new Date(),
        });
        const updated = flipResult.row;

        // Log access
        await prisma.accessLog.create({
            data: {
                cidHash: keyShare.cidHash,
                accessorAddress: req.user.walletAddress,
                action: 'CLAIM_KEY',
                consentVerified: true,  // We verified on-chain!
            }
        });

        res.json({
            id: updated.id,
            status: updated.status,
            claimedAt: updated.claimedAt,
            encryptedPayload: updated.encryptedPayload,
            senderPublicKey: updated.senderPublicKey,
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/key-share/:id - Revoke a key share (sender only)
router.delete('/:id', authenticate, async (req, res, next) => {
    try {
        const keyShare = await prisma.keyShare.findUnique({
            where: { id: req.params.id }
        });

        if (!keyShare) {
            return res.status(404).json({ code: 'KEY_SHARE_NOT_FOUND', error: 'Key share not found', message: 'Key share not found' });
        }

        if (keyShare.senderAddress?.toLowerCase() !== req.user.walletAddress?.toLowerCase()) {
            return res.status(403).json({ code: 'REQUEST_NOT_AUTHORIZED', error: 'Only sender can revoke', message: 'Only sender can revoke' });
        }

        await applyStatusFlip({
            keyShareId: req.params.id,
            newStatus: 'revoked',
            source: 'sender-revoke',
            sourceTimestamp: new Date(),
        });

        // Emit real-time event to recipient that access was revoked
        emitToUser(keyShare.recipientAddress.toLowerCase(), 'consent:updated', {
            cidHash: keyShare.cidHash,
            status: 'revoked',
            senderAddress: req.user.walletAddress,
        });

        res.json({ success: true, message: 'Key share revoked' });
    } catch (error) {
        next(error);
    }
});

// POST /api/key-share/:id/reject - Reject a key share (recipient only)
router.post('/:id/reject', authenticate, async (req, res, next) => {
    try {
        const keyShare = await prisma.keyShare.findUnique({
            where: { id: req.params.id }
        });

        if (!keyShare) {
            return res.status(404).json({ code: 'KEY_SHARE_NOT_FOUND', error: 'Key share not found', message: 'Key share not found' });
        }

        if (keyShare.recipientAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
            return res.status(403).json({ code: 'REQUEST_NOT_AUTHORIZED', error: 'Only recipient can reject', message: 'Only recipient can reject' });
        }

        if (keyShare.status === 'claimed') {
            return res.status(400).json({ code: 'KEY_SHARE_ALREADY_CLAIMED', error: 'Cannot reject after viewing. You have already accessed this record.', message: 'Cannot reject after viewing. You have already accessed this record.' });
        }

        if (keyShare.status === 'rejected') {
            return res.status(400).json({ code: 'REQUEST_ALREADY_PROCESSED', error: 'Already rejected', message: 'Already rejected' });
        }

        await applyStatusFlip({
            keyShareId: req.params.id,
            newStatus: 'rejected',
            source: 'recipient-reject',
            sourceTimestamp: new Date(),
        });

        // Emit real-time event to sender that share was rejected
        emitToUser(keyShare.senderAddress.toLowerCase(), 'consent:updated', {
            cidHash: keyShare.cidHash,
            status: 'rejected',
            recipientAddress: req.user.walletAddress,
        });

        res.json({ success: true, message: 'Key share rejected' });
    } catch (error) {
        next(error);
    }
});

export default router;



