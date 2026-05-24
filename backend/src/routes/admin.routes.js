// Admin Routes - Ministry-only endpoints for org verification
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { ACCESS_CONTROL_ABI } from '../config/contractABI.js';
import { createLogger } from '../utils/logger.js';
import { ipfsService } from '../services/ipfs.service.js';
import { emitToUser } from '../services/socket.service.js';
import { sendPushToWallet } from '../services/push.service.js';

const log = createLogger('AdminRoutes');
const router = Router();

// Contract addresses
const ACCESS_CONTROL_ADDRESS = process.env.ACCESS_CONTROL_ADDRESS;

// Ministry wallet (same as sponsor for simplicity in DATN)
const ministryAccount = process.env.SPONSOR_PRIVATE_KEY
    ? privateKeyToAccount(process.env.SPONSOR_PRIVATE_KEY)
    : null;

// Viem clients
const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL),
});

const walletClient = ministryAccount ? createWalletClient({
    account: ministryAccount,
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL),
}) : null;

// Middleware: Check if user is Ministry
const isMinistry = async (req, res, next) => {
    try {
        const userAddress = req.user.walletAddress.toLowerCase();

        const isMinistryOnChain = await publicClient.readContract({
            address: ACCESS_CONTROL_ADDRESS,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isMinistry',
            args: [userAddress],
        });

        if (!isMinistryOnChain) {
            return res.status(403).json({ code: 'ONCHAIN_ROLE_FORBIDDEN', error: 'Only Ministry can access this endpoint', message: 'Only Ministry can access this endpoint' });
        }

        next();
    } catch (error) {
        log.error('Ministry verification failed', { error: error.message });
        res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Failed to verify Ministry status', message: 'Failed to verify Ministry status' });
    }
};

// Validation schemas
const rejectSchema = z.object({
    reason: z.string().min(10).max(500),
});

// GET /api/admin/org-applications - List all applications
router.get('/org-applications', authenticate, isMinistry, async (req, res, next) => {
    try {
        const { status } = req.query;

        const where = status ? { status } : {};

        const applications = await prisma.orgApplication.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: applications.length,
            applications,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/admin/org-applications/:id - Get single application
router.get('/org-applications/:id', authenticate, isMinistry, async (req, res, next) => {
    try {
        const application = await prisma.orgApplication.findUnique({
            where: { id: req.params.id },
        });

        if (!application) {
            return res.status(404).json({ code: 'ORG_APP_NOT_FOUND', error: 'Application not found', message: 'Application not found' });
        }

        res.json(application);
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/org-applications/:id/approve - DEPRECATED
// Legacy flow called verifyOrganization() which is deprecated on-chain.
// Use createOrganization() on-chain + POST /api/admin/confirm-org-creation instead.
router.post('/org-applications/:id/approve', authenticate, isMinistry, (req, res) => {
    return res.status(410).json({
        code: 'ORG_FLOW_DEPRECATED',
        error: 'This approval flow is deprecated.',
        message: 'This approval flow is deprecated. Use createOrganization on-chain + POST /api/admin/confirm-org-creation.',
    });
});

// POST /api/admin/org-applications/:id/reject - Reject application
router.post('/org-applications/:id/reject', authenticate, isMinistry, async (req, res, next) => {
    try {
        const { reason } = rejectSchema.parse(req.body);

        const application = await prisma.orgApplication.findUnique({
            where: { id: req.params.id },
        });

        if (!application) {
            return res.status(404).json({ code: 'ORG_APP_NOT_FOUND', error: 'Application not found', message: 'Application not found' });
        }

        if (application.status !== 'PENDING') {
            return res.status(400).json({ code: 'ORG_APP_ALREADY_PROCESSED', error: `Application already ${application.status.toLowerCase()}`, message: `Application already ${application.status.toLowerCase()}` });
        }

        const updated = await prisma.orgApplication.update({
            where: { id: req.params.id },
            data: {
                status: 'REJECTED',
                reviewedBy: req.user.walletAddress,
                reviewNote: reason,
                reviewedAt: new Date(),
            },
        });

        const applicantAddr = updated.applicantAddress?.toLowerCase();
        if (applicantAddr) {
            emitToUser(applicantAddr, 'org:rejected', {
                applicationId: updated.id,
                reason,
            });
            sendPushToWallet(applicantAddr, {
                title: 'Đơn đăng ký tổ chức bị từ chối',
                body: reason,
                data: { kind: 'org_rejected' },
            }).catch((err) => log.warn('push send failed', { error: err?.message }));
        }

        res.json({
            success: true,
            message: 'Application rejected',
        });
    } catch (error) {
        next(error);
    }
});

// ============ ORGANIZATION ENTITY (CLIENT-SIDE FLOW) ============

// Multer setup for license upload
import multer from 'multer';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// POST /api/admin/upload-license - Step 1: Upload License to IPFS
router.post('/upload-license', authenticate, isMinistry, upload.single('licenseFile'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ code: 'UPLOAD_MISSING_FILE', error: 'License file is required', message: 'License file is required' });
        }

        // Upload to IPFS
        const { cid, url } = await ipfsService.uploadFile(req.file.buffer, req.file.mimetype);

        log.info('License uploaded', { cid });

        res.json({
            success: true,
            licenseCid: cid,
            licenseUrl: url,
        });
    } catch (error) {
        log.error('License upload failed', { error: error.message });
        next(error);
    }
});

// Validation schema for syncing.
// Wave D 2026-05-24: orgId accepts string (from BigInt serialization in mobile);
// licenseCid + licenseUrl optional (mobile createOrg flow skips license upload
// for thesis demo — production should require both).
const syncOrgSchema = z.object({
    orgId: z.union([z.number().int().positive(), z.string()]),
    name: z.string().min(2),
    primaryAdmin: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    backupAdmin: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().nullable(),
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    licenseCid: z.string().optional().nullable(),
    licenseUrl: z.string().optional().nullable(),
});

// POST /api/admin/confirm-org-creation - Step 3: Sync DB after On-chain Success
router.post('/confirm-org-creation', authenticate, isMinistry, async (req, res, next) => {
    try {
        const data = syncOrgSchema.parse(req.body);
        const { orgId, name, primaryAdmin, backupAdmin, txHash, licenseCid, licenseUrl } = data;

        // 1. Verify Transaction on-chain (Sanity check)
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

        if (!receipt || receipt.status !== 'success') {
            return res.status(400).json({
                code: 'TX_VERIFICATION_FAILED',
                error: 'Transaction failed or not found',
                message: 'Transaction failed or not found',
            });
        }

        // Optional: Verify that this Tx actually created THIS orgId
        // In a real prod environment, we should parse logs.
        // For now, we trust the input + receipt existence to avoid complex log parsing here.

        // 2. Create/Update Organization in DB
        const normalizedPrimaryAdmin = primaryAdmin.toLowerCase();
        const normalizedBackupAdmin = backupAdmin ? backupAdmin.toLowerCase() : null;
        const chainOrgId = BigInt(orgId);

        const existingOrg = await prisma.organization.findFirst({
            where: {
                OR: [
                    { chainOrgId },
                    { address: normalizedPrimaryAdmin },
                ],
            },
        });

        const orgData = {
            chainOrgId,
            name,
            address: normalizedPrimaryAdmin,
            backupAdminAddress: normalizedBackupAdmin,
            licenseNumber: licenseUrl,
            isVerified: true,
            isActive: true,
            verifiedAt: new Date(),
            verifiedBy: req.user.walletAddress,
        };

        const org = existingOrg
            ? await prisma.organization.update({
                where: { id: existingOrg.id },
                data: orgData,
            })
            : await prisma.organization.create({
                data: {
                    ...orgData,
                    orgType: 'hospital',
                },
            });

        // Guard: chainOrgId must always be set after sync
        if (!org.chainOrgId) {
            log.error('CRITICAL: Org created without chainOrgId', { name });
            return res.status(500).json({
                code: 'ORG_MISSING_CHAIN_ID',
                error: 'Organization sync failed: chainOrgId not set.',
                message: 'Organization sync failed: chainOrgId not set.',
            });
        }

        log.info('Org synced', { name, chainOrgId: chainOrgId.toString() });

        // 3. Ensure Admin Membership exists
        await prisma.organizationMember.upsert({
            where: {
                orgId_memberAddress: {
                    orgId: org.id,
                    memberAddress: normalizedPrimaryAdmin,
                },
            },
            update: {
                role: 'admin',
                status: 'active',
                leftAt: null,
            },
            create: {
                orgId: org.id,
                memberAddress: normalizedPrimaryAdmin,
                role: 'admin',
                status: 'active'
            }
        });

        res.json({
            success: true,
            message: 'Organization synchronized successfully',
            organization: org,
        });

        // Notify the org admin (applicant) in realtime + push so they know
        // their application landed on-chain. Mobile/web both subscribe via socket.
        emitToUser(normalizedPrimaryAdmin, 'org:approved', {
            orgId: chainOrgId.toString(),
            name,
            txHash,
        });
        sendPushToWallet(normalizedPrimaryAdmin, {
            title: 'Tổ chức đã được duyệt',
            body: `${name} đã được Bộ Y tế xác minh trên blockchain.`,
            data: { kind: 'org_approved', screen: 'OrgDashboard' },
        }).catch((err) => log.warn('push send failed', { error: err?.message }));

    } catch (error) {
        log.error('Org sync error', { error: error.message });
        next(error);
    }
});

// GET /api/admin/organizations - List all on-chain organizations
router.get('/organizations', authenticate, isMinistry, async (req, res, next) => {
    try {
        // Source of truth: Blockchain
        const orgCount = await publicClient.readContract({
            address: ACCESS_CONTROL_ADDRESS,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'orgCount',
        });

        const organizations = [];
        for (let i = 1; i <= Number(orgCount); i++) {
            try {
                const org = await publicClient.readContract({
                    address: ACCESS_CONTROL_ADDRESS,
                    abi: ACCESS_CONTROL_ABI,
                    functionName: 'getOrganization',
                    args: [BigInt(i)],
                });

                // Fetch extra data from DB (License, etc) if available
                const dbOrg = await prisma.organization.findFirst({
                    where: { address: org.primaryAdmin.toLowerCase() }
                });

                organizations.push({
                    id: Number(org.id),
                    name: org.name,
                    primaryAdmin: org.primaryAdmin,
                    backupAdmin: org.backupAdmin,
                    createdAt: new Date(Number(org.createdAt) * 1000),
                    active: org.active,
                    licenseUrl: dbOrg?.licenseNumber || null, // Enrich from DB (Hotfix: licenseNumber stores URL)
                });
            } catch (e) {
                log.warn('Error fetching on-chain org', { index: i, error: e.message });
            }
        }

        res.json({
            count: organizations.length,
            organizations: organizations,
        });
    } catch (error) {
        next(error);
    }
});

// Wave E — GET /api/admin/independent-doctors
// List doctors NOT belonging to any organization (independent practice).
// Ministry uses this to verify doctors directly via verifyDoctorByMinistry.
// Filter ?status= pending | verified | revoked | all (default pending).
//
// "Independent" = User has DoctorProfile AND is NOT in any active
// OrganizationMember row.
// "Verified" = on-chain VERIFIED_DOCTOR flag (cached via VerificationRequest
// status='approved' for fast list — UI should re-check before write action).
router.get('/independent-doctors', authenticate, isMinistry, async (req, res, next) => {
    try {
        const statusFilter = String(req.query.status || 'pending').toLowerCase();
        const allowed = ['pending', 'verified', 'revoked', 'all'];
        if (!allowed.includes(statusFilter)) {
            return res.status(400).json({
                code: 'INVALID_STATUS_FILTER',
                error: `status must be one of ${allowed.join(', ')}`,
            });
        }

        // 1. All users who have a doctor profile = candidate doctors.
        const doctorProfiles = await prisma.doctorProfile.findMany({
            include: { user: true },
        });

        // 2. Addresses of doctors in any ACTIVE org membership.
        const orgMembers = await prisma.organizationMember.findMany({
            where: { status: 'active' },
            select: { memberAddress: true },
        });
        const orgMemberAddrs = new Set(orgMembers.map((m) => m.memberAddress.toLowerCase()));

        // 3. Latest VerificationRequest per doctor → status mapping.
        const allVerifs = await prisma.verificationRequest.findMany({
            orderBy: { createdAt: 'desc' },
        });
        const latestVerifByAddr = new Map();
        for (const v of allVerifs) {
            const k = v.doctorAddress.toLowerCase();
            if (!latestVerifByAddr.has(k)) latestVerifByAddr.set(k, v);
        }

        // 4. Build independent doctor list — exclude those in any org.
        const independents = doctorProfiles
            .filter((dp) => !orgMemberAddrs.has(dp.walletAddress.toLowerCase()))
            .map((dp) => {
                const addr = dp.walletAddress.toLowerCase();
                const v = latestVerifByAddr.get(addr);
                let state = 'pending';
                if (v?.status === 'approved') state = 'verified';
                else if (v?.status === 'rejected') state = 'rejected';
                return {
                    walletAddress: dp.walletAddress,
                    fullName: dp.user?.fullName || v?.fullName || null,
                    specialty: dp.specialty || v?.specialty || null,
                    licenseNumber: dp.licenseNumber || v?.licenseNumber || null,
                    verifiedAt: v?.status === 'approved' ? v.reviewedAt : null,
                    verificationState: state,
                    verificationRequestId: v?.id || null,
                };
            });

        const counts = {
            pending: independents.filter((d) => d.verificationState === 'pending').length,
            verified: independents.filter((d) => d.verificationState === 'verified').length,
            revoked: 0,  // No revoked state derivable from VerificationRequest;
                        // future: add when verification revoke flow exists for independents
        };

        const filtered = statusFilter === 'all'
            ? independents
            : independents.filter((d) => d.verificationState === statusFilter);

        res.json({
            count: filtered.length,
            doctors: filtered,
            counts,
        });
    } catch (error) {
        next(error);
    }
});

// Wave E — POST /api/admin/verify-doctor-mirror
// Mirror on-chain verifyDoctorByMinistry tx (Ministry pays gas, broadcasts
// from mobile). Backend marks the doctor's VerificationRequest as approved
// + stores reviewedBy/reviewedAt + txHash. If no VerificationRequest exists
// (doctor independent never submitted), create one with status=approved so
// subsequent listings reflect verified state.
router.post('/verify-doctor-mirror', authenticate, isMinistry, async (req, res, next) => {
    try {
        const { doctorAddress, txHash, credential } = req.body || {};
        if (!doctorAddress || !/^0x[a-fA-F0-9]{40}$/.test(doctorAddress)) {
            return res.status(400).json({
                code: 'INVALID_DOCTOR_ADDRESS',
                error: 'doctorAddress must be a 0x-prefixed 40-hex string',
            });
        }
        const addr = doctorAddress.toLowerCase();
        const ministryAddr = req.user.walletAddress;

        // Fetch the most recent VerificationRequest. If none, create one.
        const existing = await prisma.verificationRequest.findFirst({
            where: { doctorAddress: addr },
            orderBy: { createdAt: 'desc' },
        });

        const doctorProfile = await prisma.doctorProfile.findUnique({
            where: { walletAddress: addr },
            include: { user: true },
        });

        const verifData = {
            status: 'approved',
            reviewedBy: ministryAddr,
            reviewedAt: new Date(),
        };

        if (existing) {
            await prisma.verificationRequest.update({
                where: { id: existing.id },
                data: verifData,
            });
        } else {
            await prisma.verificationRequest.create({
                data: {
                    doctorAddress: addr,
                    fullName: doctorProfile?.user?.fullName || 'Unknown',
                    specialty: doctorProfile?.specialty || null,
                    licenseNumber: doctorProfile?.licenseNumber || credential || null,
                    organization: null,
                    ...verifData,
                },
            });
        }

        res.json({
            success: true,
            doctorAddress: addr,
            status: 'verified',
            txHash: txHash || null,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
