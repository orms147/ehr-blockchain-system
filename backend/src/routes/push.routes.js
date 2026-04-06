// Push notification routes — register/unregister Expo push tokens.
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('PushRoutes');
const router = Router();

const registerSchema = z.object({
    expoPushToken: z.string().min(10),
});

// POST /api/push/register — save Expo push token for current user
router.post('/register', authenticate, async (req, res, next) => {
    try {
        const { expoPushToken } = registerSchema.parse(req.body);
        const walletAddress = req.user.walletAddress.toLowerCase();

        await prisma.user.update({
            where: { walletAddress },
            data: { expoPushToken },
        });

        log.info('Push token registered', { walletAddress });
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// POST /api/push/unregister — clear push token (logout)
router.post('/unregister', authenticate, async (req, res, next) => {
    try {
        const walletAddress = req.user.walletAddress.toLowerCase();
        await prisma.user.update({
            where: { walletAddress },
            data: { expoPushToken: null },
        });
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export default router;
