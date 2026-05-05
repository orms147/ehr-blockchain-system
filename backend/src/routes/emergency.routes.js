// Emergency lookup routes (S18, 2026-05-04 — replaces grantEmergencyAccess flow).
//
// New emergency flow:
//   1. Doctor scans patient's CCCD/CMND in ER → mobile hashes locally,
//      submits to GET /api/emergency/lookup-by-cccd?cccdHash=0x... → receives
//      patientAddress.
//   2. Doctor reads patient's Trusted Contacts via
//      GET /api/trusted-contacts/by-patient/:address (separate router).
//   3. Doctor calls a contact who logs in to their own wallet and re-shares
//      via per-record-delegate flow (existing share endpoints).
//
// We do NOT auto-create an EmergencyAccess row — the EmergencyAccess table
// has been dropped. The on-chain emergency primitive (grantEmergencyAccess)
// has also been dropped because it granted on-chain canAccess without an
// off-chain key delivery path.
//
// Rate-limit the lookup endpoint to deter brute-forcing CCCD hashes (the
// hash space is 2^256 but raw CCCDs are 9-12 digits ~ 10^12, brute-forceable
// in seconds without a rate limit). Doctor must be authenticated AND
// on-chain isVerifiedDoctor.

import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requireOnChainRoles } from '../middleware/onChainRole.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('EmergencyRoutes');
const router = Router();
const requireDoctorRole = requireOnChainRoles('verifiedDoctor');

// Naive in-memory rate limiter: 5 lookups per minute per doctor wallet.
// Sufficient for the thesis demo. Production would back this with Redis +
// IP + sliding window.
const lookupBuckets = new Map(); // walletAddress -> { count, windowStart }
const LOOKUP_WINDOW_MS = 60_000;
const LOOKUP_MAX = 5;

function rateLimitOk(walletAddress) {
    const now = Date.now();
    const bucket = lookupBuckets.get(walletAddress);
    if (!bucket || now - bucket.windowStart > LOOKUP_WINDOW_MS) {
        lookupBuckets.set(walletAddress, { count: 1, windowStart: now });
        return true;
    }
    bucket.count += 1;
    return bucket.count <= LOOKUP_MAX;
}

const lookupSchema = z.object({
    cccdHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

// GET /api/emergency/lookup-by-cccd?cccdHash=0x...
router.get('/lookup-by-cccd', authenticate, requireDoctorRole, async (req, res, next) => {
    try {
        const { cccdHash } = lookupSchema.parse(req.query);

        if (!rateLimitOk(req.user.walletAddress)) {
            return res.status(429).json({
                code: 'LOOKUP_RATE_LIMITED',
                error: `Quá ${LOOKUP_MAX} lần tra cứu/phút. Vui lòng thử lại sau.`,
            });
        }

        const user = await prisma.user.findUnique({
            where: { nationalIdHash: cccdHash.toLowerCase() },
            select: {
                walletAddress: true,
                fullName: true,
                gender: true,
                bloodType: true,        // critical info for ER
                allergies: true,        // critical info for ER
                avatarUrl: true,
            },
        });

        if (!user) {
            log.info('CCCD lookup miss', { doctor: req.user.walletAddress });
            return res.status(404).json({
                code: 'PATIENT_NOT_FOUND',
                error: 'Không tìm thấy bệnh nhân với CCCD này. Bệnh nhân có thể chưa đăng ký Mã định danh khẩn cấp trong app.',
            });
        }

        log.info('CCCD lookup hit', {
            doctor: req.user.walletAddress,
            patient: user.walletAddress,
        });

        res.json(user);
    } catch (error) {
        log.error('lookup-by-cccd failed', { error: error.message });
        next(error);
    }
});

export default router;
