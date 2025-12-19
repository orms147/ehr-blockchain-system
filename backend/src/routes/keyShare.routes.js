import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { checkConsent } from '../config/blockchain.js';

const router = Router();

// Validation schemas
const createKeyShareSchema = z.object({
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    encryptedPayload: z.string().min(1), // Contains encrypted {cid, aesKey}
    expiresAt: z.string().datetime().optional(),
});

// POST /api/key-share - Share encrypted key with recipient
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { cidHash, recipientAddress, encryptedPayload, expiresAt } =
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

        // If sender is NOT the owner, verify on-chain consent
        if (record.ownerAddress !== senderAddress) {
            const hasConsent = await checkConsent(
                record.ownerAddress,
                senderAddress,
                cidHashLower
            );

            if (!hasConsent) {
                return res.status(403).json({
                    error: 'No on-chain consent found. Request access first.'
                });
            }
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
                status: 'pending',
                expiresAt: expiresAt ? new Date(expiresAt) : null,
                claimedAt: null,
            },
            create: {
                cidHash: cidHashLower,
                senderAddress,
                recipientAddress: recipientLower,
                encryptedPayload,
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
    } catch (error) {
        next(error);
    }
});

// GET /api/key-share/my - Get keys shared with me
router.get('/my', authenticate, async (req, res, next) => {
    try {
        const keyShares = await prisma.keyShare.findMany({
            where: {
                recipientAddress: req.user.walletAddress,
                status: { not: 'revoked' },
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } }
                ]
            },
            include: {
                record: true,
                sender: {
                    select: { walletAddress: true, publicKey: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(keyShares);
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

// POST /api/key-share/:id/claim - Mark key as claimed
router.post('/:id/claim', authenticate, async (req, res, next) => {
    try {
        const keyShare = await prisma.keyShare.findUnique({
            where: { id: req.params.id }
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
                consentVerified: true,
            }
        });

        res.json({
            id: updated.id,
            status: updated.status,
            claimedAt: updated.claimedAt,
            encryptedPayload: updated.encryptedPayload, // Return the encrypted payload
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

        res.json({ success: true, message: 'Key share revoked' });
    } catch (error) {
        next(error);
    }
});

export default router;
