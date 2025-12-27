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
});

// POST /api/key-share - Share encrypted key with recipient
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { cidHash, recipientAddress, encryptedPayload, senderPublicKey, expiresAt } =
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

        // DEBUG: Log for troubleshooting
        console.log('🔍 KeyShare consent check:', {
            sender: senderAddress,
            recipient: recipientLower,
            recordOwner: record.ownerAddress,
            recordCreator: record.createdBy,
            isOwner,
            isCreator,
            recipientIsOwner,
        });

        // CASE 1: Creator shares (Doctor→Anyone flow)
        // Creator who made the record can always share
        if (isCreator) {
            console.log('🔓 Creator sharing: consent check skipped');
            // Proceed without consent check
        }
        // CASE 2: Owner shares (Patient→Doctor flow)
        // Requires on-chain consent from patient to doctor
        else if (isOwner) {
            const hasConsentForRecipient = await checkConsent(
                record.ownerAddress,
                recipientLower,
                cidHashLower
            );
            if (!hasConsentForRecipient) {
                return res.status(403).json({
                    error: 'On-chain consent for recipient not found. Please grant consent on-chain first.',
                    code: 'NO_ONCHAIN_CONSENT_FOR_RECIPIENT'
                });
            }
            console.log('✅ Owner sharing: on-chain consent verified');
        }
        // CASE 3: Grantee re-shares (delegated access)
        // Sender must have consent from owner
        else {
            const senderHasConsent = await checkConsent(
                record.ownerAddress,
                senderAddress,
                cidHashLower
            );
            if (!senderHasConsent) {
                console.log('❌ Grantee sharing without consent');
                return res.status(403).json({
                    error: 'No on-chain consent found. Request access first.'
                });
            }
            console.log('✅ Grantee sharing: consent verified');
        }

        // Create or update key share
        const keyShare = await prisma.keyShare.upsert({
            where: {
                cidHash_senderAddress_recipientAddress: {
                    cidHash: cidHashLower,
                    senderAddress,
                    recipientAddress: recipientLower,
                }
            },
            update: {
                encryptedPayload,
                senderPublicKey,
                status: 'pending',
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                claimedAt: null,
                createdAt: new Date(), // Reset timestamp on re-grant
            },
            create: {
                cidHash: cidHashLower,
                senderAddress,
                recipientAddress: recipientLower,
                encryptedPayload,
                senderPublicKey,
                expiresAt: expiresAt ? new Date(expiresAt) : null,
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
                // IMPORTANT: Exclude 'revoked' and 'awaiting_claim' from DB
                status: { notIn: ['revoked', 'awaiting_claim'] },
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } }
                ]
            },
            include: {
                record: true,
                sender: {
                    select: { walletAddress: true, publicKey: true, encryptionPublicKey: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Check on-chain consent for each key share (parallel)
        const resultsWithConsent = await Promise.all(
            keyShares.map(async (ks) => {
                let hasOnChainAccess = true; // Default to true for backwards compatibility

                // Skip consent check if recipient is the record creator (Doctor-created records)
                const isCreator = ks.record?.createdBy?.toLowerCase() === recipientAddress;
                if (isCreator) {
                    console.log(`[KEY-SHARE] Skipping consent check - recipient is record creator`);
                    return {
                        ...ks,
                        senderPublicKey: ks.senderPublicKey || ks.sender?.encryptionPublicKey || null,
                        hasOnChainAccess: true,
                    };
                }

                // Only check on-chain if we have owner address
                if (ks.record?.ownerAddress) {
                    try {
                        hasOnChainAccess = await checkConsent(
                            ks.record.ownerAddress,
                            recipientAddress,
                            ks.cidHash
                        );
                    } catch (err) {
                        console.warn(`[KEY-SHARE] On-chain check failed for ${ks.cidHash.slice(0, 20)}:`, err.message);
                        // If check fails, assume access is still valid
                    }
                }

                return {
                    ...ks,
                    parentCidHash: ks.record?.parentCidHash || null, // For chain grouping
                    senderPublicKey: ks.senderPublicKey || ks.sender?.encryptionPublicKey || null,
                    hasOnChainAccess, // Frontend can use this to hide revoked records
                };
            })
        );

        // Filter out records where on-chain consent was revoked
        const activeRecords = resultsWithConsent.filter(r => r.hasOnChainAccess);


        res.json(activeRecords);
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
                status: { notIn: ['revoked', 'awaiting_claim'] },
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
            return res.status(404).json({ error: 'No key share found for this record' });
        }

        // CRITICAL: Check on-chain consent before returning key
        // Skip check only if requester is owner or creator (they always have access)
        const isOwner = keyShare.record?.ownerAddress?.toLowerCase() === requesterAddress;
        const isCreator = keyShare.record?.createdBy?.toLowerCase() === requesterAddress;

        if (!isOwner && !isCreator) {
            const ownerAddress = keyShare.record?.ownerAddress;
            if (ownerAddress) {
                const hasOnChainConsent = await checkConsent(ownerAddress, requesterAddress, cidHashLower);
                if (!hasOnChainConsent) {
                    console.log(`🚫 [KEY-SHARE] On-chain consent revoked for ${requesterAddress} on ${cidHashLower.slice(0, 20)}`);
                    return res.status(403).json({
                        error: 'Quyền truy cập đã bị thu hồi',
                        message: 'Chủ sở hữu đã thu hồi quyền truy cập hồ sơ này',
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
