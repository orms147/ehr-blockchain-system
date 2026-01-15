import { Router } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// GET /api/access-logs/:cidHash - Get access logs for a record (owner only)
router.get('/:cidHash', authenticate, async (req, res, next) => {
    try {
        const cidHash = req.params.cidHash.toLowerCase();
        console.log('[ACCESS_LOG] Request for cidHash:', cidHash);
        console.log('[ACCESS_LOG] User wallet:', req.user.walletAddress);

        // Verify ownership
        const record = await prisma.recordMetadata.findUnique({
            where: { cidHash }
        });

        if (!record) {
            console.log('[ACCESS_LOG] Record not found');
            return res.status(404).json({ error: 'Record not found' });
        }

        console.log('[ACCESS_LOG] Record ownerAddress:', record.ownerAddress);
        console.log('[ACCESS_LOG] Match:', record.ownerAddress.toLowerCase() === req.user.walletAddress.toLowerCase());

        if (record.ownerAddress.toLowerCase() !== req.user.walletAddress.toLowerCase()) {
            console.log('[ACCESS_LOG] Ownership check FAILED');
            return res.status(403).json({ error: 'Only owner can view access logs' });
        }

        // Get logs
        const logs = await prisma.accessLog.findMany({
            where: { cidHash },
            orderBy: { createdAt: 'desc' },
            take: 100 // Limit to last 100 logs
        });

        console.log('[ACCESS_LOG] Found', logs.length, 'logs for cidHash:', cidHash);
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
