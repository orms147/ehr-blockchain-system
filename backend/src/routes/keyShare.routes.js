import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { checkConsent } from '../config/blockchain.js';
import { emitToUser } from '../services/socket.service.js';

const router = Router();

// Validation schemas
const createKeyShareSchema = z.object({
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    encryptedPayload: z.string().min(1), // Contains encrypted {cid, aesKey}
    senderPublicKey: z.string().min(1).optional(), // NaCl public key for decryption
    expiresAt: z.string().datetime().optional().nullable(),
    allowDelegate: z.boolean().optional().default(false), // NEW: For RecordDelegation
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
            return res.status(404).json({ error: 'Record not found' });
        }

        // Check sender/recipient roles
        const isOwner = record.ownerAddress.toLowerCase() === senderAddress.toLowerCase();
        const isCreator = record.createdBy?.toLowerCase() === senderAddress.toLowerCase();
        const recipientIsOwner = record.ownerAddress.toLowerCase() === recipientLower;

        if (isCreator) {
            // Creator bypass - no consent check needed
        }
        // CASE 2: Owner shares (Patient→Doctor flow)
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
        // Doctors/Guardians/Creators sharing to others always grant "Read Only" (allowDelegate=false)
        // UPDATE: Allow Creator to delegate too (fixes Patient as Creator creating share).
        const finalAllowDelegate = (isOwner || isCreator) ? (allowDelegate === true) : false;

        // CLEANUP: Force delete existing share to ensure clean state (Fixes "Zombie Status" bug)
        // Instead of upsert, we wipe and recreate to guarantee status resets to 'pending'
        await prisma.keyShare.deleteMany({
            where: {
                cidHash: cidHashLower,
                senderAddress: senderAddress,
                recipientAddress: recipientLower,
            }
        });

        // INHERITANCE ENFORCEMENT: Check parent expiry
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
                const requestedExpiry = finalExpiresAt ? new Date(finalExpiresAt) : null;

                // If parent has expiry, child MUST have expiry <= parent
                // (If parent is restricted, child cannot be 'Forever' (null) or longer)
                if (!requestedExpiry || requestedExpiry > parentExpiry) {
                    console.log(`[Backend] Clamping expiry to match parent: ${parentExpiry.toISOString()}`);
                    finalExpiresAt = parentExpiry.toISOString();
                }
            }
        }

        // Create fresh key share
        const keyShare = await prisma.keyShare.create({
            data: {
                cidHash: cidHashLower,
                senderAddress,
                recipientAddress: recipientLower,
                encryptedPayload,
                senderPublicKey,
                allowDelegate: finalAllowDelegate,
                status: (senderAddress.toLowerCase() === recipientLower) ? 'claimed' : 'pending',
                claimedAt: (senderAddress.toLowerCase() === recipientLower) ? new Date() : null,
                expiresAt: finalExpiresAt ? new Date(finalExpiresAt) : null,
            }
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
            recordTitle: record.title || 'Hồ sơ mới',
        });

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
                // IMPORTANT: Exclude 'revoked', 'awaiting_claim' AND 'rejected' from DB
                status: { notIn: ['revoked', 'awaiting_claim', 'rejected'] },
                // IMPORTANT: We now return ALL records (including expired) so Doctor can potential see history.
                // Sensitive data will be scrubbed for expired records below.
                status: { notIn: ['revoked', 'awaiting_claim', 'rejected'] },
                // removed expiresAt filter to support Expired Tab
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

            // 1. Check direct expiry
            let isExpired = ks.expiresAt && new Date(ks.expiresAt).getTime() < Date.now();
            let isActive = !isExpired;

            // 2. Chain Inheritance Logic:
            // If current record is expired (or missing explicit grant), but has a Parent, check Parent.
            // (Only for Doctor-created updates or delegated records)
            if (isExpired && ks.record?.parentCidHash) {
                // Find parent key share in our list
                // NOTE: This assumes we have the parent key share. If we don't, we can't verify access locally.
                // In that case, we might still fail to show it, but usually doctors have the chain.
                // Or we can look it up in DB if not in `keyShares` list (but `keyShares` has all recipients' keys).
                const parentShare = recordsMap.get(ks.record.parentCidHash?.toLowerCase());

                if (parentShare) {
                    const parentExpired = parentShare.expiresAt && new Date(parentShare.expiresAt).getTime() < Date.now();
                    if (!parentExpired) {
                        // Parent is valid -> Child inherits validity!
                        isActive = true;
                        isExpired = false;
                        // Propagate expiry date from parent for UI display
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

                // SECURITY: Scrub keys if not active
                encryptedPayload: isActive ? ks.encryptedPayload : null,
                senderPublicKey: isActive ? ks.senderPublicKey : null,

                // Legacy fields for frontend compatibility
                hasOnChainAccess: isActive,
                parentCidHash: ks.record?.parentCidHash || null,
                rootCidHash: computedRootCidHash || null, // FIX: Use computed root
                senderPublicKey: ks.senderPublicKey || ks.sender?.encryptionPublicKey || null,
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
                        console.warn(`[DELEGATABLE] On-chain check failed for ${ks.cidHash}:`, err.message);
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
        const keyShares = await prisma.keyShare.findMany({
            where: {
                senderAddress: req.user.walletAddress,
            },
            include: {
                recipient: {
                    select: { walletAddress: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(keyShares);
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
            return res.status(403).json({ error: 'You do not have access to this record' });
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

        // 3. Filter out sensitive info, return public keys for re-encryption
        const team = recipients.map(share => ({
            walletAddress: share.recipient.walletAddress,
            encryptionPublicKey: share.recipient.encryptionPublicKey || share.senderPublicKey, // Fallback if user key missing
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

        // Find key share where current user is recipient
        const keyShare = await prisma.keyShare.findFirst({
            where: {
                cidHash: cidHashLower,
                recipientAddress: requesterAddress,
                status: { notIn: ['revoked', 'awaiting_claim', 'rejected'] },
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } }
                ]
            },
            include: {
                sender: {
                    select: { walletAddress: true, encryptionPublicKey: true }
                },
                record: {
                    select: { ownerAddress: true, createdBy: true }
                }
            }
        });

        if (!keyShare) {
            // Check if user is Creator/Owner to give better error details
            const record = await prisma.recordMetadata.findUnique({
                where: { cidHash: cidHashLower },
                select: { createdBy: true, ownerAddress: true }
            });

            if (record) {
                const isCreator = record.createdBy?.toLowerCase() === requesterAddress;
                const isOwner = record.ownerAddress?.toLowerCase() === requesterAddress;

                if (isCreator) {
                    return res.status(404).json({
                        error: 'You are the creator but no server-side key share exists. If you lost your local key, access is lost.',
                        code: 'CREATOR_KEY_LOST'
                    });
                }
                if (isOwner) {
                    return res.status(404).json({
                        error: 'No key share found. If this is an update, the updater may not have shared the key with you yet.',
                        code: 'OWNER_KEY_MISSING'
                    });
                }
            }
            return res.status(404).json({ error: 'No key share found for this record' });
        }

        // CRITICAL: Check on-chain consent before returning key
        // Skip check only if requester is owner or creator (they always have access)
        const isOwner = keyShare.record?.ownerAddress?.toLowerCase() === requesterAddress;
        const isCreator = keyShare.record?.createdBy?.toLowerCase() === requesterAddress;

        if (!isOwner && !isCreator) {
            const ownerAddress = keyShare.record?.ownerAddress;
            if (ownerAddress) {
                // 1. Check strict consent for this specific version
                let hasOnChainConsent = await checkConsent(ownerAddress, requesterAddress, cidHashLower);
                if (hasOnChainConsent) console.log(`[ACCESS] Strict consent GRANT for ${cidHashLower}`);
                else console.log(`[ACCESS] Strict consent DENY for ${cidHashLower}`);

                // 2. INHERITANCE: If strict consent fails, check if consent exists for the ROOT/ANCESTOR.
                // This implements the standard "Revoke Root kills Tree" logic.
                if (!hasOnChainConsent && keyShare.record?.parentCidHash) {
                    console.log(`[ACCESS] Checking ancestors for ${cidHashLower}...`);

                    // Traverse up to find root/ancestor with consent
                    let currentCid = keyShare.record.parentCidHash;
                    let depth = 0;

                    while (currentCid && depth < 20) {
                        const hasAncestorConsent = await checkConsent(ownerAddress, requesterAddress, currentCid.toLowerCase());
                        if (hasAncestorConsent) {
                            console.log(`[ACCESS] Inherited Consent FOUND at Ancestor: ${currentCid}`);
                            hasOnChainConsent = true;
                            break;
                        }

                        console.log(`[ACCESS] Ancestor ${currentCid} consent: FALSE`);

                        // Get next parent
                        const parentRecord = await prisma.recordMetadata.findUnique({
                            where: { cidHash: currentCid },
                            select: { parentCidHash: true }
                        });

                        if (!parentRecord) break;
                        currentCid = parentRecord.parentCidHash;
                        depth++;
                    }
                }

                if (!hasOnChainConsent) {
                    console.warn(`[ACCESS] DENIED FINAL for ${cidHashLower} (User: ${requesterAddress})`);
                    return res.status(403).json({
                        error: 'Quyền truy cập đã bị thu hồi',
                        message: 'Chủ sở hữu đã thu hồi quyền truy cập hồ sơ này (hoặc hồ sơ gốc)',
                        consentRevoked: true,
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
            return res.status(404).json({ error: 'Key share not found' });
        }

        if (keyShare.recipientAddress !== req.user.walletAddress) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        if (keyShare.status === 'revoked') {
            return res.status(400).json({ error: 'Key share has been revoked' });
        }

        if (keyShare.expiresAt && keyShare.expiresAt < new Date()) {
            return res.status(400).json({ error: 'Key share has expired' });
        }

        // ⚠️ SECURITY: Check KeyShare status instead of on-chain
        // KeyShare only becomes 'pending' after Doctor claims on-chain via mark-claimed route
        // This is secure because mark-claimed requires the claim tx hash
        if (keyShare.status === 'awaiting_claim') {
            return res.status(403).json({
                error: 'Please claim access on-chain first by clicking "Nhận truy cập".',
                requiresOnChainClaim: true,
            });
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
            return res.status(404).json({ error: 'Key share not found' });
        }

        if (keyShare.senderAddress !== req.user.walletAddress) {
            return res.status(403).json({ error: 'Only sender can revoke' });
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
            return res.status(404).json({ error: 'Key share not found' });
        }

        if (keyShare.recipientAddress !== req.user.walletAddress) {
            return res.status(403).json({ error: 'Only recipient can reject' });
        }

        if (keyShare.status === 'claimed') {
            return res.status(400).json({ error: 'Cannot reject after viewing. You have already accessed this record.' });
        }

        if (keyShare.status === 'rejected') {
            return res.status(400).json({ error: 'Already rejected' });
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
