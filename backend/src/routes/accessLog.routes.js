import { Router } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/access-logs/:cidHash - Get access logs for a record (owner only)
router.get('/:cidHash', authenticate, async (req, res, next) => {
    try {
        const cidHash = req.params.cidHash.toLowerCase();

        // Verify ownership
        const record = await prisma.recordMetadata.findUnique({
            where: { cidHash }
        });

        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }

        if (record.ownerAddress !== req.user.walletAddress) {
            return res.status(403).json({ error: 'Only owner can view access logs' });
        }

        // Get logs
        const logs = await prisma.accessLog.findMany({
            where: { cidHash },
            orderBy: { createdAt: 'desc' },
            take: 100 // Limit to last 100 logs
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
            where: { accessorAddress: req.user.walletAddress },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        res.json(logs);
    } catch (error) {
        next(error);
    }
});

export default router;
