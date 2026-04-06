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

        await prisma.orgApplication.update({
            where: { id: req.params.id },
            data: {
                status: 'REJECTED',
                reviewedBy: req.user.walletAddress,
                reviewNote: reason,
                reviewedAt: new Date(),
            },
        });

        // TODO: Emit real-time notification to applicant

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

// Mock IPFS Service (Inlined to fix import path issues)
const ipfsService = {
    async uploadFile(fileBuffer, mimeType) {
        log.info('IPFS upload', { size: fileBuffer.length, type: mimeType });
        await new Promise(resolve => setTimeout(resolve, 500));
        const fakeCid = 'Qm' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        return {
            cid: fakeCid,
            url: `https://gateway.pinata.cloud/ipfs/${fakeCid}`
        };
    }
};

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

// Validation schema for syncing
const syncOrgSchema = z.object({
    orgId: z.number().int().positive(),
    name: z.string().min(2),
    primaryAdmin: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    backupAdmin: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().nullable(),
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    licenseCid: z.string().min(10), // IPFS CID
    licenseUrl: z.string().optional(),
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

export default router;
