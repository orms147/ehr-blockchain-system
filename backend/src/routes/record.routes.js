import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import relayerService from '../services/relayer.service.js';
import { emitToUser } from '../services/socket.service.js';


const router = Router();

// Validation schemas
const createRecordSchema = z.object({
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recordTypeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    parentCidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    title: z.string().max(255).optional().nullable(),
    description: z.string().optional().nullable(),
    recordType: z.string().max(50).optional().nullable(), // e.g. "diagnosis", "prescription"
});

// POST /api/records - Upload record with quota check and on-chain registration
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { cidHash, recordTypeHash, parentCidHash, title, description, recordType } = createRecordSchema.parse(req.body);
        const walletAddress = req.user.walletAddress;

        // Check if record already exists
        const existing = await prisma.recordMetadata.findUnique({
            where: { cidHash: cidHash.toLowerCase() }
        });

        if (existing) {
            return res.status(409).json({ error: 'Record already exists' });
        }

        // SECURITY: If updating a record (parentCidHash provided), verify user has read access
        if (parentCidHash) {
            const parentRecord = await prisma.recordMetadata.findUnique({
                where: { cidHash: parentCidHash.toLowerCase() }
            });

            if (!parentRecord) {
                return res.status(404).json({ error: 'Hồ sơ gốc không tồn tại' });
            }

            // Check if user is the owner
            const isOwner = parentRecord.ownerAddress?.toLowerCase() === walletAddress.toLowerCase();

            // Check if user has active keyShare (read access)
            const hasKeyShare = await prisma.keyShare.findFirst({
                where: {
                    cidHash: parentCidHash.toLowerCase(),
                    recipientAddress: walletAddress.toLowerCase(),
                    status: { in: ['pending', 'claimed'] }, // Active access
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } }
                    ]
                }
            });

            if (!isOwner && !hasKeyShare) {
                return res.status(403).json({
                    error: 'Bạn phải xem hồ sơ gốc trước khi cập nhật. Vui lòng yêu cầu quyền truy cập.'
                });
            }
        }

        // Check quota first
        const quota = await relayerService.getQuotaStatus(walletAddress);

        if (!quota.hasSelfWallet && quota.uploadsRemaining <= 0) {
            return res.status(429).json({
                error: 'Đã hết quota upload tháng này. Vui lòng kết nối ví có ETH để tiếp tục.',
                quota
            });
        }

        // Submit on-chain via relayer (this will also decrement quota)
        let txResult = null;
        try {
            txResult = await relayerService.sponsorUploadRecord(
                walletAddress,
                cidHash.toLowerCase(),
                parentCidHash?.toLowerCase() || '0x0000000000000000000000000000000000000000000000000000000000000000',
                recordTypeHash?.toLowerCase() || '0x0000000000000000000000000000000000000000000000000000000000000000'
            );
        } catch (txError) {
            console.error('📤 [UPLOAD] ❌ On-chain tx FAILED:', txError.message);
            console.error('📤 [UPLOAD] Full error:', txError);
            // Still save metadata even if on-chain fails (for MVP)
        }


        // Save record metadata
        const record = await prisma.recordMetadata.create({
            data: {
                cidHash: cidHash.toLowerCase(),
                ownerAddress: walletAddress,
                createdBy: walletAddress,
                recordTypeHash: recordTypeHash?.toLowerCase(),
                parentCidHash: parentCidHash?.toLowerCase() || null,
                title: title || null,
                description: description || null,
                recordType: recordType || null,
            }
        });


        // Log access
        await prisma.accessLog.create({
            data: {
                cidHash: cidHash.toLowerCase(),
                accessorAddress: walletAddress,
                action: 'CREATE_RECORD',
                consentVerified: true, // Owner creating their own record
            }
        });

        res.status(201).json({
            id: record.id,
            cidHash: record.cidHash,
            createdAt: record.createdAt,
            txHash: txResult?.txHash || null,
            onChain: !!txResult,
        });
    } catch (error) {
        next(error);
    }
});


// POST /api/records/save-only - Save metadata only (no on-chain tx)
// Used by Doctors who already submitted on-chain tx themselves
// Also creates KeyShare so Doctor can view the record they created
const saveOnlySchema = z.object({
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recordTypeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/), // The patient who owns this record
    // Optional encrypted payload for Doctor to view later
    encryptedPayload: z.string().optional().nullable(),
    senderPublicKey: z.string().optional().nullable(),
    title: z.string().max(255).optional().nullable(),
    description: z.string().optional().nullable(),
    recordType: z.string().max(50).optional().nullable(),
});


router.post('/save-only', authenticate, async (req, res, next) => {
    try {
        const { cidHash, recordTypeHash, ownerAddress, encryptedPayload, senderPublicKey, title, description, recordType } = saveOnlySchema.parse(req.body);
        const creatorAddress = req.user.walletAddress.toLowerCase();
        const patientAddress = ownerAddress.toLowerCase();
        // Check if record already exists
        const existing = await prisma.recordMetadata.findUnique({
            where: { cidHash: cidHash.toLowerCase() }
        });

        if (existing) {
            return res.status(409).json({ error: 'Record already exists' });
        }

        // Save record metadata (owned by patient, created by doctor)
        const record = await prisma.recordMetadata.create({
            data: {
                cidHash: cidHash.toLowerCase(),
                ownerAddress: patientAddress, // Patient owns it
                createdBy: creatorAddress, // Doctor created it
                recordTypeHash: recordTypeHash?.toLowerCase(),
                title: title || null,
                description: description || null,
                recordType: recordType || null,
            }
        });

        // Create KeyShare for Doctor so they can view the record
        // This emulates the 7-day auto-share from contract
        if (encryptedPayload) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7-day access

            await prisma.keyShare.create({
                data: {
                    cidHash: cidHash.toLowerCase(),
                    senderAddress: patientAddress, // "From" patient (record owner)
                    recipientAddress: creatorAddress, // "To" doctor (creator)
                    encryptedPayload,
                    senderPublicKey: senderPublicKey || null,
                    status: 'claimed', // Auto-claimed since Doctor has the key
                    expiresAt,
                }
            });
        }

        // Log access
        await prisma.accessLog.create({
            data: {
                cidHash: cidHash.toLowerCase(),
                accessorAddress: creatorAddress,
                action: 'CREATE_RECORD_BY_DOCTOR',
                consentVerified: true,
            }
        });
        res.status(201).json({
            id: record.id,
            cidHash: record.cidHash,
            createdAt: record.createdAt,
            onChain: true, // Doctor already did on-chain
        });
    } catch (error) {
        next(error);
    }
});



// GET /api/records/my - Get user's records (owned or created)
router.get('/my', authenticate, async (req, res, next) => {
    try {
        const records = await prisma.recordMetadata.findMany({
            where: {
                OR: [
                    { ownerAddress: req.user.walletAddress },
                    { createdBy: req.user.walletAddress }
                ]
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(records);
    } catch (error) {
        next(error);
    }
});

// GET /api/records/chain/:cidHash - Get record chain (parent, children, siblings)
router.get('/chain/:cidHash', authenticate, async (req, res, next) => {
    try {
        const cidHash = req.params.cidHash.toLowerCase();

        // Get the current record
        const record = await prisma.recordMetadata.findUnique({
            where: { cidHash }
        });

        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }

        // Get parent record (if exists)
        let parent = null;
        if (record.parentCidHash) {
            parent = await prisma.recordMetadata.findUnique({
                where: { cidHash: record.parentCidHash }
            });
        }

        // Get children records
        const children = await prisma.recordMetadata.findMany({
            where: { parentCidHash: cidHash },
            orderBy: { createdAt: 'asc' }
        });

        // Get siblings (records with same parent)
        let siblings = [];
        if (record.parentCidHash) {
            siblings = await prisma.recordMetadata.findMany({
                where: {
                    parentCidHash: record.parentCidHash,
                    NOT: { cidHash: cidHash }
                },
                orderBy: { createdAt: 'asc' }
            });
        }

        // Calculate version number (position in chain from root)
        let version = 1;
        let currentParent = record.parentCidHash;
        while (currentParent) {
            version++;
            const parentRecord = await prisma.recordMetadata.findUnique({
                where: { cidHash: currentParent }
            });
            currentParent = parentRecord?.parentCidHash || null;
        }

        res.json({
            current: record,
            parent,
            children,
            siblings,
            version,
            childCount: children.length,
            hasParent: !!parent,
            hasChildren: children.length > 0
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/records/chain-cids/:cidHash - Get ALL cidHashes in a chain (for chain-wide sharing)
// Given any CID in the chain, returns all CIDs from root to all leaves
router.get('/chain-cids/:cidHash', authenticate, async (req, res, next) => {
    try {
        const startCidHash = req.params.cidHash.toLowerCase();
        const allCids = new Set();

        // Helper function to traverse up to root
        const findRoot = async (cidHash) => {
            let current = cidHash;
            const ancestors = [];
            while (current) {
                ancestors.push(current);
                allCids.add(current);
                const record = await prisma.recordMetadata.findUnique({
                    where: { cidHash: current },
                    select: { parentCidHash: true }
                });
                current = record?.parentCidHash || null;
            }
            return ancestors[ancestors.length - 1]; // root is last
        };

        // Helper function to traverse down to all children
        const findAllChildren = async (cidHash) => {
            allCids.add(cidHash);
            const children = await prisma.recordMetadata.findMany({
                where: { parentCidHash: cidHash },
                select: { cidHash: true }
            });
            for (const child of children) {
                await findAllChildren(child.cidHash);
            }
        };

        // Find root first
        const rootCid = await findRoot(startCidHash);

        // Then find all children from root
        await findAllChildren(rootCid);

        // Get all records with details
        const records = await prisma.recordMetadata.findMany({
            where: { cidHash: { in: Array.from(allCids) } },
            orderBy: { createdAt: 'asc' }
        });

        res.json({
            rootCidHash: rootCid,
            chainCids: Array.from(allCids),
            records,
            count: allCids.size
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/records/:cidHash - Get single record metadata
router.get('/:cidHash', authenticate, async (req, res, next) => {
    try {
        const cidHash = req.params.cidHash.toLowerCase();

        const record = await prisma.recordMetadata.findUnique({
            where: { cidHash }
        });

        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }

        // Log access
        await prisma.accessLog.create({
            data: {
                cidHash,
                accessorAddress: req.user.walletAddress,
                action: 'VIEW_METADATA',
                consentVerified: record.ownerAddress === req.user.walletAddress,
            }
        });

        res.json(record);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/records/:cidHash/access/:address - Revoke someone's access to a record
// Only record owner (Patient) can revoke access
router.delete('/:cidHash/access/:address', authenticate, async (req, res, next) => {
    try {
        const cidHash = req.params.cidHash.toLowerCase();
        const targetAddress = req.params.address.toLowerCase();
        const callerAddress = req.user.walletAddress.toLowerCase();

        // 1. Verify record exists and caller is owner
        const record = await prisma.recordMetadata.findUnique({
            where: { cidHash }
        });

        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }

        if (record.ownerAddress.toLowerCase() !== callerAddress) {
            return res.status(403).json({ error: 'Only record owner can revoke access' });
        }

        // 2. Find KeyShare
        const keyShare = await prisma.keyShare.findFirst({
            where: {
                cidHash: cidHash,
                recipientAddress: targetAddress,
            }
        });

        if (!keyShare) {
            return res.status(404).json({ error: 'Access grant not found for this address' });
        }

        // 3. Try on-chain revoke (may not exist for doctor-created records)
        let txResult = null;
        try {
            txResult = await relayerService.sponsorRevoke(callerAddress, targetAddress, cidHash);
        } catch (txError) {
            // Check if quota exhausted
            if (txError.message === 'QUOTA_EXHAUSTED_USE_OWN_WALLET') {
                return res.status(402).json({
                    error: 'Quota exhausted',
                    message: 'Vui lòng kết nối ví có ETH để tiếp tục thu hồi',
                    requiresOwnWallet: true,
                });
            }

            // Check if no consent exists on-chain (doctor-created records)
            // These error codes/messages indicate no consent to revoke
            const noConsentErrors = ['0x82b42900', 'Unauthorized', 'ConsentNotFound', 'execution reverted'];
            const isNoConsentError = noConsentErrors.some(e => txError.message?.includes(e));

            if (isNoConsentError) {
                // No on-chain consent exists - OK for doctor-created records, continue to delete KeyShare
                console.log(`🔐 [REVOKE] Skipping on-chain (no consent exists for doctor-created record)`);
            } else {
                console.error(`🔐 [REVOKE] ❌ On-chain revoke FAILED:`, txError.message);
                return res.status(500).json({
                    error: 'On-chain revoke failed',
                    message: txError.message
                });
            }
        }


        // 4. Delete KeyShare in DB (after on-chain success)
        await prisma.keyShare.delete({
            where: { id: keyShare.id }
        });

        // 5. Log the revoke action
        await prisma.accessLog.create({
            data: {
                cidHash,
                accessorAddress: callerAddress,
                action: 'REVOKE_ACCESS',
                consentVerified: true,
            }
        });

        // 6. Emit socket event to notify the revoked user
        emitToUser(targetAddress, 'access_revoked', {
            cidHash,
            revokedBy: callerAddress,
        });

        res.json({
            success: true,
            message: 'Đã thu hồi quyền truy cập on-chain',
            revokedAddress: targetAddress,
            cidHash: cidHash,
            txHash: txResult?.txHash,
        });
    } catch (error) {
        console.error('🔐 [REVOKE] Error:', error);
        next(error);
    }
});


// GET /api/records/:cidHash/access - Get list of who has access to a record
router.get('/:cidHash/access', authenticate, async (req, res, next) => {
    try {
        const cidHash = req.params.cidHash.toLowerCase();
        const callerAddress = req.user.walletAddress.toLowerCase();

        // Verify record exists and caller is owner
        const record = await prisma.recordMetadata.findUnique({
            where: { cidHash }
        });

        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }

        if (record.ownerAddress.toLowerCase() !== callerAddress) {
            return res.status(403).json({ error: 'Only record owner can view access list' });
        }

        // Get all KeyShares for this record
        const keyShares = await prisma.keyShare.findMany({
            where: { cidHash },
            select: {
                recipientAddress: true,
                senderAddress: true,
                status: true,
                createdAt: true,
            }
        });

        res.json({
            cidHash,
            accessList: keyShares.map(ks => ({
                address: ks.recipientAddress,
                grantedBy: ks.senderAddress,
                status: ks.status,
                grantedAt: ks.createdAt,
            }))
        });
    } catch (error) {
        next(error);
    }
});

export default router;
