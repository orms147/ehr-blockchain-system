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

// GET /api/relayer/quota - Get unified signature quota (100/month pool)
router.get('/quota', authenticate, async (req, res, next) => {
    try {
        const quota = await relayerService.getQuotaStatus(req.user.walletAddress);

        res.json({
            ...quota,
            limits: relayerService.QUOTA_LIMITS,
            message: quota.hasSelfWallet
                ? 'Bạn đang sử dụng ví riêng - không giới hạn'
                : `Còn ${quota.signaturesRemaining}/${quota.signaturesLimit} chữ ký miễn phí tháng này (gồm upload, cập nhật, cấp quyền, thu hồi, uỷ quyền)`,
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

// POST /api/relayer/revoke - Sponsor revoke consent (unified quota pool)
router.post('/revoke', authenticate, requirePatientRole, async (req, res, next) => {
    try {
        const { granteeAddress, cidHash } = revokeSchema.parse(req.body);

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
    allowDelegate: z.boolean().default(false),
    deadline: z.number().int().positive(),
    signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

// GET /api/relayer/grant-context?grantee=0x... - Nonce + verified status + quota for share UI
router.get('/grant-context', authenticate, async (req, res, next) => {
    try {
        const grantee = String(req.query.grantee || '').toLowerCase();
        if (!/^0x[a-f0-9]{40}$/.test(grantee)) {
            return res.status(400).json({ code: 'INVALID_GRANTEE', error: 'grantee query param phải là địa chỉ ví hợp lệ' });
        }
        const ctx = await relayerService.getGrantContext(req.user.walletAddress, grantee);
        res.json(ctx);
    } catch (error) {
        log.error('grant-context failed', { error: error.message });
        next(error);
    }
});

// Validation schema for delegation authority grant (CHAIN topology root grant)
// NOTE: Contract takes `duration` (seconds, uint40), not absolute expiresAt.
//   MIN_DURATION = 1 day = 86400
//   MAX_DURATION = 5 years = 157_680_000
const delegateAuthoritySchema = z.object({
    delegateeAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    duration: z.number().int().min(86400).max(157_680_000), // seconds, 1d - 5y
    allowSubDelegate: z.boolean().default(false),
    deadline: z.number().int().positive(),   // EIP-712 sig deadline (unix seconds)
    signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
    scopeNote: z.string().max(500).optional().nullable(), // off-chain clinical purpose
});

// POST /api/relayer/delegate-authority
// Patient signs a DelegationPermit off-chain, backend relays delegateAuthorityBySig.
// This is the ROOT grant of a CHAIN: a direct patient -> doctor delegation with
// chainDepth=1. Sub-delegations are issued on-chain by the delegatee via
// ConsentLedger.subDelegate (no relayer, no patient signature needed).
router.post('/delegate-authority', authenticate, requirePatientRole, async (req, res, next) => {
    try {
        const data = delegateAuthoritySchema.parse(req.body);

        const result = await relayerService.sponsorDelegateAuthority({
            patientAddress: req.user.walletAddress,
            delegateeAddress: data.delegateeAddress,
            duration: data.duration,
            allowSubDelegate: data.allowSubDelegate,
            deadline: data.deadline,
            signature: data.signature,
            scopeNote: data.scopeNote ?? null,
        });

        res.json({
            success: true,
            message: 'Đã uỷ quyền cho bác sĩ thành công',
            txHash: result.txHash,
        });
    } catch (error) {
        log.error('delegate-authority failed', { error: error.message, wallet: req.user?.walletAddress });
        next(error);
    }
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


