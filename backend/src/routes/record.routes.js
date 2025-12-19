import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const createRecordSchema = z.object({
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recordTypeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

// POST /api/records - Store record metadata (cidHash only, NO plaintext CID!)
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { cidHash, recordTypeHash } = createRecordSchema.parse(req.body);

        const record = await prisma.recordMetadata.create({
            data: {
                cidHash: cidHash.toLowerCase(),
                ownerAddress: req.user.walletAddress,
                createdBy: req.user.walletAddress,
                recordTypeHash: recordTypeHash?.toLowerCase(),
            }
        });

        // Log access
        await prisma.accessLog.create({
            data: {
                cidHash: cidHash.toLowerCase(),
                accessorAddress: req.user.walletAddress,
                action: 'CREATE_RECORD',
                consentVerified: true, // Owner creating their own record
            }
        });

        res.status(201).json({
            id: record.id,
            cidHash: record.cidHash,
            createdAt: record.createdAt,
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

export default router;
