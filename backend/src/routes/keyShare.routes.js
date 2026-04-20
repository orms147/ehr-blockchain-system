import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { checkConsent, publicClient, CONTRACT_ADDRESSES } from '../config/blockchain.js';
import { ACCESS_CONTROL_ABI } from '../config/contractABI.js';
import { emitToUser } from '../services/socket.service.js';
import { sendPushToWallet } from '../services/push.service.js';
import { createLogger } from '../utils/logger.js';

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
        const finalAllowDelegate = (isOwner || isCreator) ? (allowDelegate === true) : false;

        // CLEAN SLATE: When owner/creator re-shares, DELETE all old KeyShare rows
        // for this recipient across the ENTIRE record chain. This prevents stale
        // rows (expired, revoked, wrong flags) from polluting the doctor's view.
        // New rows will be created fresh by this request + cascade from mobile.
        let isReShare = false;
        if (isOwner || isCreator) {
            try {
                const chainCids = await getChainCidHashes(cidHashLower);
                // Only delete STALE rows (created >60s ago). This prevents cascade
                // calls (which fire within seconds of the main share) from deleting
                // rows that the main share or earlier cascade steps just created.
                const staleThreshold = new Date(Date.now() - 60000);
                const staleCount = await prisma.keyShare.count({
                    where: {
                        recipientAddress: recipientLower,
                        senderAddress: senderAddress,
                        cidHash: { in: chainCids },
                        createdAt: { lt: staleThreshold },
                    },
                });
                if (staleCount > 0) {
                    const deleted = await prisma.keyShare.deleteMany({
                        where: {
                            recipientAddress: recipientLower,
                            senderAddress: senderAddress,
                            cidHash: { in: chainCids },
                            createdAt: { lt: staleThreshold },
                        },
                    });
                    isReShare = true;
                    log.info('Clean slate: deleted stale KeyShares for re-share', {
                        recipient: recipientLower,
                        chainSize: chainCids.length,
                        deletedCount: deleted.count,
                    });
                }
            } catch (err) {
                log.warn('Clean slate failed (non-fatal, proceeding with upsert)', { error: err?.message });
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

        // IDEMPOTENT UPSERT: If an active row already exists for this
        // (cidHash, sender, recipient) triple — e.g. patient accidentally re-shares —
        // update it in place instead of delete+create. This preserves the
        // existing 'claimed' status so the recipient doesn't lose access and
        // avoids the frontend briefly seeing KEY_SHARE_NOT_FOUND during the
        // race window.
        const keyShare = await prisma.$transaction(async (tx) => {
            const existing = await tx.keyShare.findFirst({
                where: {
                    cidHash: cidHashLower,
                    senderAddress: senderAddress,
                    recipientAddress: recipientLower,
                }
            });

            const isSelfShare = senderAddress.toLowerCase() === recipientLower;

            if (existing) {
                // Re-share (clean-slate DELETE ran) or self-share → auto-claim.
                // Otherwise preserve existing 'claimed' status.
                const nextStatus = (isSelfShare || isReShare || existing.status === 'claimed')
                    ? 'claimed'
                    : 'pending';

                return tx.keyShare.update({
                    where: { id: existing.id },
                    data: {
                        encryptedPayload,
                        senderPublicKey,
                        allowDelegate: finalAllowDelegate,
                        status: nextStatus,
                        claimedAt: nextStatus === 'claimed' ? (existing.claimedAt || new Date()) : null,
                        expiresAt: finalExpiresAt ? new Date(finalExpiresAt) : null,
                    }
                });
            }

            // For re-shares (clean slate DELETE ran above), auto-claim so doctor
            // doesn't need to re-click "Nhận và xem". Patient explicitly re-granted.
            const autoClaimStatus = isSelfShare || isReShare ? 'claimed' : 'pending';

            return tx.keyShare.create({
                data: {
                    cidHash: cidHashLower,
                    senderAddress,
                    recipientAddress: recipientLower,
                    encryptedPayload,
                    senderPublicKey,
                    allowDelegate: finalAllowDelegate,
                    status: autoClaimStatus,
                    claimedAt: autoClaimStatus === 'claimed' ? new Date() : null,
                    expiresAt: finalExpiresAt ? new Date(finalExpiresAt) : null,
                }
            });
        });

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

// GET /api/key-share/my - Get keys shared with me (ONLY after on-chain claim)
router.get('/my', authenticate, async (req, res, next) => {
    try {
        const recipientAddress = req.user.walletAddress.toLowerCase();

        const keyShares = await prisma.keyShare.findMany({
            where: {
                recipientAddress,
                // Exclude revoked/rejected. Show 'awaiting_claim' so doctor can claim.
                status: { notIn: ['revoked', 'rejected'] },
            },
            include: {
                record: true,
                sender: {
                    select: { walletAddress: true, publicKey: true, encryptionPublicKey: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

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

            // 1. Check direct expiry
            let isExpired = ks.expiresAt && new Date(ks.expiresAt).getTime() < Date.now();
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
        const recipients = await prisma.keyShare.findMany({
            where: {
                cidHash: cidHashLower,
                status: 'claimed', // Only active participants
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
        // downgrade guard reads. 2026-04-19: dropped `includeUpdates` — medical
        // episode model means every consent covers the whole chain.
        const team = recipients.map(share => ({
            walletAddress: share.recipient.walletAddress,
            encryptionPublicKey: share.recipient.encryptionPublicKey || share.senderPublicKey,
            allowDelegate: share.allowDelegate === true,
            expiresAt: share.expiresAt,
            role: 'member'
        }));

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

        // Permission check — contract canAccess now walks record chain to the
        // canonical root and enforces includeUpdates on-chain. A single call
        // is sufficient; backend no longer walks anything.
        const isOwner = keyShare.record?.ownerAddress?.toLowerCase() === requesterAddress;
        const isCreator = keyShare.record?.createdBy?.toLowerCase() === requesterAddress;

        if (!isOwner && !isCreator) {
            const ownerAddress = keyShare.record?.ownerAddress;
            if (ownerAddress) {
                const hasOnChainConsent = await checkConsent(ownerAddress, requesterAddress, cidHashLower);
                if (!hasOnChainConsent) {
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

        // Revalidate on-chain consent at claim time. Contract's canAccess now
        // walks the record chain to canonical root and enforces includeUpdates
        // on-chain — a single call is the source of truth. No backend walk.
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
                // revoked on-chain, chain RPC transient fail, contract/subgraph
                // desync, or anchorCidHash mismatch for a `includeUpdates=false`
                // consent. We USED TO mark the KeyShare row `revoked` here, but
                // that destroyed data for cases (b)-(d) — a single transient
                // failure permanently killed a valid share.
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

        const updated = await prisma.keyShare.update({
            where: { id: req.params.id },
            data: {
                status: 'claimed',
                claimedAt: new Date()
            }
        });

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

        await prisma.keyShare.update({
            where: { id: req.params.id },
            data: { status: 'revoked' }
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

        if (keyShare.recipientAddress !== req.user.walletAddress) {
            return res.status(403).json({ code: 'REQUEST_NOT_AUTHORIZED', error: 'Only recipient can reject', message: 'Only recipient can reject' });
        }

        if (keyShare.status === 'claimed') {
            return res.status(400).json({ code: 'KEY_SHARE_ALREADY_CLAIMED', error: 'Cannot reject after viewing. You have already accessed this record.', message: 'Cannot reject after viewing. You have already accessed this record.' });
        }

        if (keyShare.status === 'rejected') {
            return res.status(400).json({ code: 'REQUEST_ALREADY_PROCESSED', error: 'Already rejected', message: 'Already rejected' });
        }

        await prisma.keyShare.update({
            where: { id: req.params.id },
            data: { status: 'rejected' }
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



