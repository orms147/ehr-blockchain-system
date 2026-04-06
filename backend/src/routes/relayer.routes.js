// Relayer Routes - Gas sponsorship API for patients
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireOnChainRoles } from '../middleware/onChainRole.js';
import relayerService from '../services/relayer.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('RelayerRoutes');
const router = Router();
const requirePatientRole = requireOnChainRoles('patient');

// Validation schemas
const registerSchema = z.object({
    role: z.enum(['patient', 'doctor']),
});

const archiveRequestSchema = z.object({
    requestId: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

// GET /api/relayer/quota - Get current quota status
router.get('/quota', authenticate, async (req, res, next) => {
    try {
        const quota = await relayerService.getQuotaStatus(req.user.walletAddress);

        res.json({
            ...quota,
            limits: relayerService.QUOTA_LIMITS,
            message: quota.hasSelfWallet
                ? 'Bạn đang sử dụng ví riêng - không giới hạn'
                : `Còn ${quota.uploadsRemaining} lần upload và ${quota.revokesRemaining} lần revoke miễn phí tháng này`,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/relayer/register - Sponsor patient/doctor registration
router.post('/register', authenticate, async (req, res, next) => {
    try {
        const { role } = registerSchema.parse(req.body);

        // Note: No quota check for registration - user can register both patient AND doctor roles

        if (role === 'patient') {
            const result = await relayerService.sponsorRegisterPatient(req.user.walletAddress);

            if (result.alreadyRegistered) {
                return res.json({
                    success: true,
                    message: 'Bạn đã đăng ký Patient trước đó',
                    alreadyRegistered: true,
                });
            }

            res.json({
                success: true,
                message: 'Đăng ký Patient thành công - Được tài trợ bởi hệ thống',
                txHash: result.txHash,
            });
        } else {
            // Doctor registration
            const result = await relayerService.sponsorRegisterDoctor(req.user.walletAddress);

            if (result.alreadyRegistered) {
                return res.json({
                    success: true,
                    message: 'Bạn đã đăng ký Doctor trước đó',
                    alreadyRegistered: true,
                });
            }

            res.json({
                success: true,
                message: 'Đăng ký Doctor thành công - Vui lòng chờ xác thực từ Bộ Y tế',
                txHash: result.txHash,
            });
        }

    } catch (error) {
        log.error('Register role failed', { error: error.message, wallet: req.user?.walletAddress });
        next(error);
    }
});

// POST /api/relayer/archive-request - Archive a request (hide from UI)
router.post('/archive-request', authenticate, async (req, res, next) => {
    try {
        const { requestId } = archiveRequestSchema.parse(req.body);

        await relayerService.archiveRequest(req.user.walletAddress, requestId);

        res.json({
            success: true,
            message: 'Request đã được ẩn. Bạn có thể xem lại trong mục "Đã ẩn".',
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/relayer/archived-requests - Get list of archived requests
router.get('/archived-requests', authenticate, async (req, res, next) => {
    try {
        const archived = await relayerService.getArchivedRequests(req.user.walletAddress);

        res.json({
            count: archived.length,
            requests: archived,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/relayer/restore-request - Restore archived request
router.post('/restore-request', authenticate, async (req, res, next) => {
    try {
        const { requestId } = archiveRequestSchema.parse(req.body);

        await relayerService.restoreRequest(req.user.walletAddress, requestId);

        res.json({
            success: true,
            message: 'Request đã được khôi phục.',
        });
    } catch (error) {
        next(error);
    }
});

// Validation schema for revoke
const revokeSchema = z.object({
    granteeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

// POST /api/relayer/revoke - Sponsor revoke consent (quota limited)
router.post('/revoke', authenticate, requirePatientRole, async (req, res, next) => {
    try {
        const { granteeAddress, cidHash } = revokeSchema.parse(req.body);

        // Check quota first
        const quota = await relayerService.getQuotaStatus(req.user.walletAddress);

        if (!quota.hasSelfWallet && quota.revokesRemaining <= 0) {
            return res.status(400).json({
                code: 'QUOTA_EXHAUSTED',
                error: 'Đã hết quota revoke miễn phí tháng này',
                message: 'Đã hết quota revoke miễn phí tháng này',
                suggestion: 'Vui lòng kết nối ví có ETH hoặc chờ đến tháng sau',
                revokesRemaining: 0,
            });
        }

        const result = await relayerService.sponsorRevoke(
            req.user.walletAddress,
            granteeAddress,
            cidHash
        );

        res.json({
            success: true,
            message: 'Đã thu hồi quyền truy cập thành công',
            txHash: result.txHash,
        });
    } catch (error) {
        log.error('Revoke failed', { error: error.message, wallet: req.user?.walletAddress });
        next(error);
    }
});

// Validation schema for grant consent
const grantSchema = z.object({
    granteeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    encKeyHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    expireAt: z.number().int().nonnegative(),
    includeUpdates: z.boolean().default(false),
    allowDelegate: z.boolean().default(false),
    deadline: z.number().int().positive(),
    signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

// POST /api/relayer/grant - Sponsor grant consent (with Patient's EIP-712 signature)
router.post('/grant', authenticate, requirePatientRole, async (req, res, next) => {
    try {
        const data = grantSchema.parse(req.body);

        const result = await relayerService.sponsorGrantConsent(
            req.user.walletAddress,
            data.granteeAddress,
            data.cidHash,
            data.encKeyHash,
            data.expireAt,
            data.includeUpdates,
            data.allowDelegate,
            data.deadline,
            data.signature
        );

        res.json({
            success: true,
            message: 'Đã cấp quyền truy cập on-chain thành công',
            txHash: result.txHash,
        });
    } catch (error) {
        log.error('Grant failed', { error: error.message, wallet: req.user?.walletAddress });
        next(error);
    }
});

export default router;


