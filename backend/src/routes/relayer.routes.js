// Relayer Routes - Gas sponsorship API for patients
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireOnChainRoles } from '../middleware/onChainRole.js';
import { rateLimitByWallet } from '../middleware/rateLimit.js';
import relayerService from '../services/relayer.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('RelayerRoutes');
const router = Router();
const requirePatientRole = requireOnChainRoles('patient');

// Per-wallet short-window cap on SPONSORED writes (advisor feedback #7).
// The 100/month quota (relayer.service.js) caps cost; this caps burst rate so a
// single wallet can't fire dozens of sponsored txs in seconds. Default 20/min —
// far above any legitimate share/revoke/delegate flow, well below abuse.
// Mounted after `authenticate` so it keys on the verified wallet.
const sponsoredWriteLimit = rateLimitByWallet({
    windowMs: Number(process.env.RELAYER_RATELIMIT_WINDOW_MS ?? 60_000),
    max: Number(process.env.RELAYER_RATELIMIT_MAX ?? 20),
    code: 'RELAYER_RATE_LIMITED',
    message: 'Bạn đang gửi quá nhiều giao dịch được bảo trợ. Vui lòng chờ một lát rồi thử lại.',
});

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

// GET /api/relayer/all-grantees - Patient sees ALL active grantees on their records,
// including downstream grants minted via delegation chain (D shared to D1 via
// grantUsingRecordDelegation → D1 listed). UI uses this to revoke individual
// grantees independently. Without this, patient could only revoke direct grants
// (from /api/key-share/sent) and was forced to revoke D wholesale to kill D1.
router.get('/all-grantees', authenticate, async (req, res, next) => {
    try {
        const prisma = (await import('../config/database.js')).default;
        const patientAddress = req.user.walletAddress.toLowerCase();

        const consents = await prisma.consent.findMany({
            where: { patientAddress, status: 'active' },
            orderBy: { grantedAt: 'desc' },
        });
        if (consents.length === 0) {
            return res.json([]);
        }

        const cidHashes = Array.from(new Set(consents.map((c) => c.cidHash)));
        const records = await prisma.recordMetadata.findMany({
            where: { cidHash: { in: cidHashes } },
            select: { cidHash: true, title: true, recordType: true },
        });
        const recordByCid = new Map(records.map((r) => [r.cidHash.toLowerCase(), r]));

        // DelegationAccessLog tracks AccessGrantedViaDelegation events (both
        // grantUsingDelegation + grantUsingRecordDelegation emit it). When a
        // row exists for (patient, grantee, root), it means the grant was
        // minted via delegation chain — byDelegatee is the doctor who relayed.
        // Absent row = direct grant from patient.
        const accessLogs = await prisma.delegationAccessLog.findMany({
            where: { patientAddress },
            select: { newGrantee: true, rootCidHash: true, byDelegatee: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
        const sourceByGranteeChain = new Map();
        for (const log of accessLogs) {
            const key = `${log.newGrantee.toLowerCase()}|${log.rootCidHash.toLowerCase()}`;
            // Keep only the latest source if multiple grants happened for same chain
            if (!sourceByGranteeChain.has(key)) {
                sourceByGranteeChain.set(key, log.byDelegatee.toLowerCase());
            }
        }

        const result = consents.map((c) => {
            const cid = c.cidHash.toLowerCase();
            const grantee = c.granteeAddress.toLowerCase();
            const record = recordByCid.get(cid);
            const sourceDelegatee = sourceByGranteeChain.get(`${grantee}|${cid}`);
            return {
                granteeAddress: c.granteeAddress,
                cidHash: c.cidHash,
                recordTitle: record?.title || null,
                recordType: record?.recordType || null,
                grantedAt: c.grantedAt,
                expiresAt: c.expiresAt,
                source: sourceDelegatee
                    ? { type: 'via-delegate', byDelegatee: sourceDelegatee }
                    : { type: 'direct' },
            };
        });

        res.json(result);
    } catch (error) {
        log.error('all-grantees failed', { error: error.message });
        next(error);
    }
});

// POST /api/relayer/register - Sponsor patient/doctor registration
router.post('/register', authenticate, sponsoredWriteLimit, async (req, res, next) => {
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
router.post('/revoke', authenticate, sponsoredWriteLimit, requirePatientRole, async (req, res, next) => {
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
router.post('/delegate-authority', authenticate, sponsoredWriteLimit, requirePatientRole, async (req, res, next) => {
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
router.post('/grant', authenticate, sponsoredWriteLimit, requirePatientRole, async (req, res, next) => {
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

// Validation schema for Trusted Contact registry (S18, 2026-05-04).
// Patient signs an EIP-712 TrustedContactPermit off-chain, backend relays
// setTrustedContactBySig. label is optional ("Vợ", "Con trai"...) and stored
// on-chain — keep short, will appear in events.
const trustedContactSchema = z.object({
    contactAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    label: z.string().max(120).optional().default(''),
    active: z.boolean(),                           // true = designate, false = revoke
    deadline: z.number().int().positive(),
    signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

// POST /api/relayer/trusted-contact
router.post('/trusted-contact', authenticate, sponsoredWriteLimit, requirePatientRole, async (req, res, next) => {
    try {
        const data = trustedContactSchema.parse(req.body);

        const result = await relayerService.sponsorSetTrustedContact({
            patientAddress: req.user.walletAddress,
            contactAddress: data.contactAddress,
            label: data.label,
            active: data.active,
            deadline: data.deadline,
            signature: data.signature,
        });

        res.json({
            success: true,
            message: data.active
                ? 'Đã thêm Người thân tin cậy thành công'
                : 'Đã huỷ Người thân tin cậy thành công',
            txHash: result.txHash,
        });
    } catch (error) {
        log.error('trusted-contact failed', { error: error.message, wallet: req.user?.walletAddress });
        next(error);
    }
});

export default router;


