import { Router } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/access-logs/:cidHash - Get access logs for a record (owner only)
router.get('/:cidHash', authenticate, async (req, res, next) => {
    try {
        const cidHash = req.params.cidHash.toLowerCase();

        const record = await prisma.recordMetadata.findUnique({
            where: { cidHash }
        });

        if (!record) {
            return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Record not found', message: 'Record not found' });
        }

        if (record.ownerAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
            return res.status(403).json({ code: 'ONCHAIN_ROLE_FORBIDDEN', error: 'Only owner can view access logs', message: 'Only owner can view access logs' });
        }

        const logs = await prisma.accessLog.findMany({
            where: { cidHash },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        res.json(logs);
    } catch (error) {
        next(error);
    }
});

// GET /api/access-logs/my/activity - Get my own activity
router.get('/my/activity', authenticate, async (req, res, next) => {
    try {
        const logs = await prisma.accessLog.findMany({
            where: { accessorAddress: req.user.walletAddress?.toLowerCase() },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        res.json(logs);
    } catch (error) {
        next(error);
    }
});

export default router;
