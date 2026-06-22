// Verification Routes - API for doctor verification management
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { requireOnChainRoles } from '../middleware/onChainRole.js';
import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

const router = Router();

// Contract config
const ACCESS_CONTROL_ADDRESS = process.env.ACCESS_CONTROL_ADDRESS;
const ACCESS_CONTROL_ABI = parseAbi([
    'function verifyDoctor(address doctor, string credential) external',
    'function isVerifiedDoctor(address) view returns (bool)',
    'function isDoctor(address) view returns (bool)',
]);

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL),
});

const requireDoctorRole = requireOnChainRoles('doctor');
const requireMinistryRole = requireOnChainRoles('ministry');
// Wave N — /pending must be accessible by org admins (review their own
// submitted requests) AND ministry (oversight). orgAdmin = isActiveOrgAdmin.
const requireOrgOrMinistry = requireOnChainRoles('orgAdmin', 'ministry');

/**
 * Wave N — Compute 4-check verification outcome per design Q4.
 * Returns shape: {
 *   passed: boolean,
 *   score: '4/4' | '3/4' | ...,
 *   label: human-readable summary,
 *   severity: 'jade' | 'warn' | 'cinnabar',
 *   checks: [{ id, label, pass, detail? }]
 * }
 */
async function computeVerificationOutcome(request, prismaClient) {
    const checks = [];

    // 1. Auth signature valid — always true (request reached our API via auth middleware)
    checks.push({
        id: 'sig',
        label: 'Chữ ký hồ sơ hợp lệ',
        pass: true,
    });

    // 2. CCHN license number format check — Vietnamese formats include
    //    "028294/HN-CCHN", "1234-HCM-CCHN", or simple digits. Accept loose.
    const license = (request.licenseNumber || '').trim();
    const licenseValid = license.length >= 4 && /[0-9]/.test(license);
    checks.push({
        id: 'license',
        label: 'Số CCHN có format hợp lệ',
        pass: licenseValid,
        detail: licenseValid ? null : 'Số CCHN trống hoặc sai format',
    });

    // 3. Organization in DB + Ministry-verified on-chain (proxy via isVerified flag)
    let orgVerified = false;
    let orgDetail = null;
    if (request.organization) {
        const org = await prismaClient.organization.findFirst({
            where: { name: request.organization },
        });
        orgVerified = Boolean(org?.isVerified && org?.isActive);
        if (!org) orgDetail = `Cơ sở "${request.organization}" chưa có trong hệ thống`;
        else if (!org.isVerified) orgDetail = 'Cơ sở chưa được Bộ Y tế xác minh';
        else if (!org.isActive) orgDetail = 'Cơ sở đang tạm dừng hoạt động';
    } else {
        orgDetail = 'Hồ sơ không khai báo cơ sở';
    }
    checks.push({
        id: 'org',
        label: 'Tổ chức đã được Bộ Y tế xác minh',
        pass: orgVerified,
        detail: orgDetail,
    });

    // 4. Doctor history clean — no revoked OrganizationMember row
    const revokedHistory = await prismaClient.organizationMember.findFirst({
        where: {
            memberAddress: request.doctorAddress.toLowerCase(),
            status: 'revoked',
        },
    });
    checks.push({
        id: 'history',
        label: 'Bác sĩ chưa từng bị thu hồi xác minh',
        pass: !revokedHistory,
        detail: revokedHistory ? 'Bác sĩ đã bị một cơ sở thu hồi trước đây' : null,
    });

    const passCount = checks.filter((c) => c.pass).length;
    const total = checks.length;
    const allPass = passCount === total;
    const severityForFailCount = (n) => (n === 0 ? 'jade' : n <= 1 ? 'warn' : 'cinnabar');

    return {
        passed: allPass,
        score: `${passCount}/${total}`,
        label: allPass
            ? `Đã xác minh tự động · ${passCount}/${total}`
            : `Cảnh báo: ${total - passCount} mục cần kiểm tra`,
        severity: severityForFailCount(total - passCount),
        checks,
    };
}

// Validation schemas
const submitVerificationSchema = z.object({
    fullName: z.string().min(2).max(100),
    licenseNumber: z.string().optional(),
    specialty: z.string().optional(),
    organization: z.string().optional(),
    documentCid: z.string().optional(),
    documentType: z.string().optional(),
});

const reviewVerificationSchema = z.object({
    requestId: z.string().uuid(),
    approved: z.boolean(),
    rejectionReason: z.string().optional(),
});

// GET /api/verification/status - Check current doctor's verification status
router.get('/status', authenticate, async (req, res, next) => {
    try {
        const doctorAddress = req.user.walletAddress.toLowerCase();

        // Check on-chain status
        let isVerifiedOnChain = false;
        let isDoctorOnChain = false;
        let chainReadOk = false;

        if (ACCESS_CONTROL_ADDRESS) {
            try {
                [isVerifiedOnChain, isDoctorOnChain] = await Promise.all([
                    publicClient.readContract({
                        address: ACCESS_CONTROL_ADDRESS,
                        abi: ACCESS_CONTROL_ABI,
                        functionName: 'isVerifiedDoctor',
                        args: [doctorAddress],
                    }),
                    publicClient.readContract({
                        address: ACCESS_CONTROL_ADDRESS,
                        abi: ACCESS_CONTROL_ABI,
                        functionName: 'isDoctor',
                        args: [doctorAddress],
                    }),
                ]);
                chainReadOk = true;
            } catch (e) {
            }
        }

        // Get pending verification request
        let pendingRequest = await prisma.verificationRequest.findFirst({
            where: {
                doctorAddress: doctorAddress,
                status: 'pending',
            },
        });

        // Get approved request
        let approvedRequest = await prisma.verificationRequest.findFirst({
            where: {
                doctorAddress: doctorAddress,
                status: 'approved',
            },
        });

        // Self-heal: a request marked 'approved' in the DB but NOT verified
        // on-chain means the org's verifyDoctor tx never landed (e.g. ran out of
        // gas) under the old optimistic flow. Downgrade it back to 'pending' so
        // the org sees it again and can retry. Guarded by chainReadOk so a
        // transient RPC failure (isVerifiedOnChain defaults false) can't wrongly
        // demote a genuinely-verified doctor.
        if (chainReadOk && !isVerifiedOnChain && approvedRequest) {
            await prisma.verificationRequest.update({
                where: { id: approvedRequest.id },
                data: { status: 'pending' },
            });
            pendingRequest = pendingRequest || { ...approvedRequest, status: 'pending' };
            approvedRequest = null;
        }

        res.json({
            isDoctor: isDoctorOnChain,
            isVerified: isVerifiedOnChain,
            hasPendingRequest: !!pendingRequest,
            pendingRequest: pendingRequest,
            approvedRequest: approvedRequest,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/verification/submit - Submit verification request
router.post('/submit', authenticate, requireDoctorRole, async (req, res, next) => {
    try {
        const data = submitVerificationSchema.parse(req.body);
        const doctorAddress = req.user.walletAddress.toLowerCase();

        // Check if already has pending request
        const existing = await prisma.verificationRequest.findFirst({
            where: {
                doctorAddress: doctorAddress,
                status: 'pending',
            },
        });

        if (existing) {
            return res.status(400).json({
                error: 'Bạn đã có yêu cầu xác thực đang chờ xử lý',
                existingRequest: existing,
            });
        }

        // Create new verification request
        const request = await prisma.verificationRequest.create({
            data: {
                doctorAddress: doctorAddress,
                fullName: data.fullName,
                licenseNumber: data.licenseNumber,
                specialty: data.specialty,
                organization: data.organization,
                documentCid: data.documentCid,
                documentType: data.documentType,
            },
        });

        res.json({
            success: true,
            message: 'Yêu cầu xác thực đã được gửi. Vui lòng chờ Bộ Y tế phê duyệt.',
            request: request,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/verification/pending - Pending CCHN verification requests
// (Org admin reviews their own org submissions; Ministry oversight).
// Wave N: each request enriched with verificationOutcome 4-check per design Q4.
router.get('/pending', authenticate, requireOrgOrMinistry, async (req, res, next) => {
    try {
        const requests = await prisma.verificationRequest.findMany({
            where: { status: 'pending' },
            orderBy: { createdAt: 'asc' },
        });

        // Compute outcome per request in parallel
        const enriched = await Promise.all(
            requests.map(async (r) => ({
                ...r,
                verificationOutcome: await computeVerificationOutcome(r, prisma),
            })),
        );

        res.json({
            count: enriched.length,
            requests: enriched,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/verification/all - Get all verification requests (Ministry/Admin only)
router.get('/all', authenticate, requireMinistryRole, async (req, res, next) => {
    try {
        const { status } = req.query;

        const where = status ? { status: status } : {};

        const requests = await prisma.verificationRequest.findMany({
            where: where,
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: requests.length,
            requests: requests,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/verification/review - Approve or reject verification.
// Org admins review requests for THEIR OWN org; Ministry has oversight on all.
// (On-chain verifyDoctor is the real authority and is signed by the org admin's
// wallet from mobile; this endpoint is DB bookkeeping + returns the call args.)
router.post('/review', authenticate, requireOrgOrMinistry, async (req, res, next) => {
    try {
        const { requestId, approved, rejectionReason } = reviewVerificationSchema.parse(req.body);
        const reviewerAddress = req.user.walletAddress.toLowerCase();
        const isMinistry = req.user.isMinistry === true;
        const request = await prisma.verificationRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            return res.status(404).json({ error: 'Không tìm thấy yêu cầu xác thực' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ error: 'Yêu cầu này đã được xử lý' });
        }

        // Org admins may only review requests directed at their own org.
        // Resolve the reviewer's org (primary OR backup admin) and match by name
        // — VerificationRequest stores the org by name (selectedOrg.name on submit).
        if (!isMinistry) {
            const reviewerOrg = await prisma.organization.findFirst({
                where: {
                    OR: [
                        { address: reviewerAddress },
                        { backupAdminAddress: reviewerAddress },
                    ],
                },
            });
            if (!reviewerOrg) {
                return res.status(403).json({ error: 'Không tìm thấy tổ chức của bạn' });
            }
            if (!request.organization || request.organization !== reviewerOrg.name) {
                return res.status(403).json({ error: 'Yêu cầu này không thuộc tổ chức của bạn' });
            }
        }

        let updated = request;
        if (approved) {
            // DO NOT optimistically set status='approved'. The on-chain
            // verifyDoctor tx (signed + paid by the org admin from mobile) is the
            // source of truth. The request flips to 'approved' only when the
            // DoctorVerified event is synced (subgraphSync). If that tx fails
            // (e.g. out of gas) the request stays 'pending' so the org still sees
            // it and can retry — this prevents the "DB approved but chain
            // reverted" desync (org loses the request, doctor sees a phantom
            // "đã xác minh" while still unverified on-chain). We only record the
            // reviewer for audit; status stays 'pending'.
            updated = await prisma.verificationRequest.update({
                where: { id: requestId },
                data: { reviewedBy: reviewerAddress, reviewedAt: new Date() },
            });
        } else {
            updated = await prisma.verificationRequest.update({
                where: { id: requestId },
                data: {
                    status: 'rejected',
                    reviewedBy: reviewerAddress,
                    reviewedAt: new Date(),
                    rejectionReason: rejectionReason || null,
                },
            });
        }

        res.json({
            success: true,
            message: approved
                ? 'Đã ký duyệt — vui lòng ký giao dịch xác minh on-chain để hoàn tất'
                : 'Đã từ chối yêu cầu',
            request: updated,
            // If approved, return the data the org admin needs to broadcast verifyDoctor.
            contractCall: approved ? {
                function: 'verifyDoctor',
                args: [request.doctorAddress, request.licenseNumber || 'VERIFIED'],
            } : null,
        });
    } catch (error) {
        next(error);
    }
});

export default router;


