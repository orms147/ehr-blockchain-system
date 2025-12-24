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
        console.log('📤 [UPLOAD] Received upload request');
        const { cidHash, recordTypeHash, parentCidHash, title, description, recordType } = createRecordSchema.parse(req.body);
        const walletAddress = req.user.walletAddress;
        console.log(`📤 [UPLOAD] User: ${walletAddress}, cidHash: ${cidHash.slice(0, 20)}..., title: ${title || 'N/A'}`);

        // Check if record already exists
        const existing = await prisma.recordMetadata.findUnique({
            where: { cidHash: cidHash.toLowerCase() }
        });

        if (existing) {
            console.log('📤 [UPLOAD] Record already exists, returning 409');
            return res.status(409).json({ error: 'Record already exists' });
        }

        // Check quota first
        console.log('📤 [UPLOAD] Checking quota...');
        const quota = await relayerService.getQuotaStatus(walletAddress);
        console.log('📤 [UPLOAD] Quota status:', JSON.stringify(quota));

        if (!quota.hasSelfWallet && quota.uploadsRemaining <= 0) {
            console.log('📤 [UPLOAD] Quota exceeded, returning 429');
            return res.status(429).json({
                error: 'Đã hết quota upload tháng này. Vui lòng kết nối ví có ETH để tiếp tục.',
                quota
            });
        }

        // Submit on-chain via relayer (this will also decrement quota)
        let txResult = null;
        console.log('📤 [UPLOAD] Starting on-chain transaction via relayer...');
        try {
            txResult = await relayerService.sponsorUploadRecord(
                walletAddress,
                cidHash.toLowerCase(),
                parentCidHash?.toLowerCase() || '0x0000000000000000000000000000000000000000000000000000000000000000',
                recordTypeHash?.toLowerCase() || '0x0000000000000000000000000000000000000000000000000000000000000000'
            );
            console.log('📤 [UPLOAD] ✅ On-chain tx SUCCESS:', txResult?.txHash);
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

        console.log(`📤 [SAVE-ONLY] Doctor ${creatorAddress} saving record for patient ${patientAddress}`);

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
            console.log(`📤 [SAVE-ONLY] ✅ KeyShare created for Doctor with 7-day access`);
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

        console.log(`📤 [SAVE-ONLY] ✅ Record saved: ${record.id}`);

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

        console.log(`🔐 [REVOKE] Caller: ${callerAddress} revoking ${targetAddress} from ${cidHash.slice(0, 20)}...`);

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
        let onChainRevokeSkipped = false;
        try {
            console.log(`🔐 [REVOKE] Calling on-chain revokeFor...`);
            txResult = await relayerService.sponsorRevoke(callerAddress, targetAddress, cidHash);
            console.log(`🔐 [REVOKE] ✅ On-chain revoke SUCCESS: ${txResult?.txHash}`);
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
                console.log(`🔐 [REVOKE] No on-chain consent found, proceeding with DB-only revoke`);
                onChainRevokeSkipped = true;
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

        console.log(`🔐 [REVOKE] ✅ Access revoked for ${targetAddress} (on-chain + DB)`);

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

        console.log(`🔑 [ACCESS-LIST] cidHash: ${cidHash.slice(0, 20)}..., found ${keyShares.length} key shares:`, keyShares.map(ks => ks.recipientAddress));

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
