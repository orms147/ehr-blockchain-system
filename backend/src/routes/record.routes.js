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

            // CHECK LIMIT: Contract RecordRegistry.sol enforces MAX_CHILDREN = 100
            const childCount = await prisma.recordMetadata.count({
                where: { parentCidHash: parentCidHash.toLowerCase() }
            });
            const MAX_CHILDREN = 100; // Must sync with Contract

            if (childCount >= MAX_CHILDREN) {
                return res.status(400).json({
                    error: `Đã đạt giới hạn số lượng phiên bản con (${MAX_CHILDREN}). Vui lòng tạo hồ sơ mới.`,
                    code: 'MAX_CHILDREN_REACHED'
                });
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

            // FIX: Prevent "Ghost Record" creation. Abort if on-chain fails.
            if (txError.message?.includes('QUOTA_EXHAUSTED')) {
                return res.status(429).json({
                    error: 'Quota exhausted. Please use your own wallet.',
                    code: 'QUOTA_EXHAUSTED'
                });
            }

            return res.status(500).json({
                error: 'On-chain transaction failed. Record not saved.',
                details: txError.message
            });
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
    parentCidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
});


router.post('/save-only', authenticate, async (req, res, next) => {
    try {
        const { cidHash, recordTypeHash, ownerAddress, encryptedPayload, senderPublicKey, title, description, recordType, parentCidHash } = saveOnlySchema.parse(req.body);
        const creatorAddress = req.user.walletAddress.toLowerCase();
        const patientAddress = ownerAddress.toLowerCase();
        let record;
        // Check if record already exists
        const existing = await prisma.recordMetadata.findUnique({
            where: { cidHash: cidHash.toLowerCase() }
        });

        if (existing) {
            console.log(`[SAVE-ONLY] Record ${cidHash} exists. Checking metadata consistency...`);
            // Fix: If existing record is missing parentCidHash OR has Zero Hash, but we have a valid one, update it.
            const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
            const isMissingParent = !existing.parentCidHash || existing.parentCidHash === ZERO_HASH;
            const hasNewParent = parentCidHash && parentCidHash !== ZERO_HASH;

            if (isMissingParent && hasNewParent) {
                console.log(`[SAVE-ONLY] Patching missing/zero parentCidHash for ${cidHash}`);
                record = await prisma.recordMetadata.update({
                    where: { id: existing.id },
                    data: { parentCidHash: parentCidHash.toLowerCase() }
                });
            } else {
                record = existing;
            }
        } else {
            // Save record metadata (owned by patient, created by doctor)
            record = await prisma.recordMetadata.create({
                data: {
                    cidHash: cidHash.toLowerCase(),
                    ownerAddress: patientAddress, // Patient owns it
                    createdBy: creatorAddress, // Doctor created it
                    recordTypeHash: recordTypeHash?.toLowerCase(),
                    title: title || null,
                    description: description || null,
                    recordType: recordType || null,
                    parentCidHash: parentCidHash?.toLowerCase() || null,
                }
            });
        }

        // Create KeyShare for Doctor so they can view the record
        // This emulates the 7-day auto-share from contract
        if (encryptedPayload) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7-day access

            // Use upsert to prevent duplicates if listener already created it
            await prisma.keyShare.upsert({
                where: {
                    cidHash_senderAddress_recipientAddress: {
                        cidHash: cidHash.toLowerCase(),
                        senderAddress: patientAddress,
                        recipientAddress: creatorAddress
                    }
                },
                update: {
                    encryptedPayload, // Update payload just in case
                    status: 'claimed',
                },
                create: {
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

        // Return success even if existing (idempotent)
        res.status(existing ? 200 : 201).json({
            id: record.id,
            cidHash: record.cidHash,
            createdAt: record.createdAt,
            onChain: true, // Doctor already did on-chain
            patched: !!(existing && !existing.parentCidHash && parentCidHash)
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

        // 2. Find KeyShares (Recursive Cleanup)
        // We must delete keys for the entire chain (Root + all updates) to prevents "fallback to V1" issue.

        // Helper to find root
        let currentCid = cidHash;
        let rootCid = cidHash;

        // Traverse up to find root (max 20 depth)
        for (let i = 0; i < 20; i++) {
            const r = await prisma.recordMetadata.findUnique({
                where: { cidHash: currentCid },
                select: { parentCidHash: true }
            });
            if (!r?.parentCidHash) {
                rootCid = currentCid;
                break;
            }
            currentCid = r.parentCidHash;
        }

        // Helper to find all descendants
        const allCids = [rootCid];
        const queue = [rootCid];

        while (queue.length > 0) {
            const parent = queue.shift();
            const children = await prisma.recordMetadata.findMany({
                where: { parentCidHash: parent },
                select: { cidHash: true }
            });
            for (const child of children) {
                allCids.push(child.cidHash);
                queue.push(child.cidHash);
            }
        }

        console.log(`🔐 [REVOKE] Cleaning up keys for chain: ${allCids.length} records (Root: ${rootCid})`);

        const keyShares = await prisma.keyShare.findMany({
            where: {
                cidHash: { in: allCids },
                recipientAddress: targetAddress,
            }
        });

        if (keyShares.length === 0) {
            return res.status(404).json({ error: 'Access grant not found for this address' });
        }

        // 3. Try on-chain revoke (Use Root CID)
        let txResult = null;
        try {
            // Use ROOT CID for on-chain revoke because ConsentLedger uses Root grouping
            txResult = await relayerService.sponsorRevoke(callerAddress, targetAddress, rootCid);
        } catch (txError) {
            // Check if quota exhausted
            if (txError.message === 'QUOTA_EXHAUSTED_USE_OWN_WALLET') {
                return res.status(402).json({
                    error: 'Quota exhausted',
                    message: 'Vui lòng kết nối ví có ETH để tiếp tục thu hồi',
                    requiresOwnWallet: true,
                });
            }

            const noConsentErrors = ['0x82b42900', 'Unauthorized', 'ConsentNotFound', 'execution reverted', 'NoActiveDelegation'];
            const isNoConsentError = noConsentErrors.some(e => txError.message?.includes(e));

            if (isNoConsentError) {
                console.log(`🔐 [REVOKE] Skipping on-chain (already revoked or no consent)`);
            } else {
                console.error(`🔐 [REVOKE] ❌ On-chain revoke FAILED:`, txError.message);
                return res.status(500).json({
                    error: 'On-chain revoke failed',
                    message: txError.message
                });
            }
        }


        // 4. Delete ALL KeyShares in DB
        await prisma.keyShare.deleteMany({
            where: {
                id: { in: keyShares.map(k => k.id) }
            }
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
                expiresAt: ks.expiresAt, // Added for frontend expiry check
            }))
        });
    } catch (error) {
        next(error);
    }
});

export default router;
