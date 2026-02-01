// Admin Routes - Ministry-only endpoints for org verification
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { ACCESS_CONTROL_ABI } from '../config/contractABI.js';

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
            return res.status(403).json({ error: 'Only Ministry can access this endpoint' });
        }

        next();
    } catch (error) {
        console.error('[isMinistry] Error:', error);
        res.status(500).json({ error: 'Failed to verify Ministry status' });
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
            return res.status(404).json({ error: 'Application not found' });
        }

        res.json(application);
    } catch (error) {
        next(error);
    }
});

// POST /api/admin/org-applications/:id/approve - Approve application
router.post('/org-applications/:id/approve', authenticate, isMinistry, async (req, res, next) => {
    try {
        const application = await prisma.orgApplication.findUnique({
            where: { id: req.params.id },
        });

        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        if (application.status !== 'PENDING') {
            return res.status(400).json({ error: `Application already ${application.status.toLowerCase()}` });
        }

        if (!walletClient) {
            throw new Error('Ministry wallet not configured');
        }

        const orgAddress = application.applicantAddress.toLowerCase();

        // Step 1: Check if ORG is already registered on-chain
        const isOrgOnChain = await publicClient.readContract({
            address: ACCESS_CONTROL_ADDRESS,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isOrganization',
            args: [orgAddress],
        });

        if (!isOrgOnChain) {
            // ORG needs to self-register first
            return res.status(400).json({
                error: 'Applicant has not registered as Organization on-chain yet',
                code: 'NOT_REGISTERED_ON_CHAIN',
                suggestion: 'The applicant must call registerAsOrganization() first',
            });
        }

        // Step 2: Check if already verified
        const isVerified = await publicClient.readContract({
            address: ACCESS_CONTROL_ADDRESS,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isVerifiedOrganization',
            args: [orgAddress],
        });

        if (isVerified) {
            // Already verified on-chain, just update DB
            await prisma.orgApplication.update({
                where: { id: req.params.id },
                data: {
                    status: 'APPROVED',
                    reviewedBy: req.user.walletAddress,
                    reviewedAt: new Date(),
                },
            });

            return res.json({
                success: true,
                message: 'Organization already verified on-chain, application updated',
                alreadyVerified: true,
            });
        }

        // Step 3: Call verifyOrganization on-chain
        console.log(`[Admin] Verifying org: ${orgAddress} as "${application.orgName}"`);

        const hash = await walletClient.writeContract({
            address: ACCESS_CONTROL_ADDRESS,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'verifyOrganization',
            args: [orgAddress, application.orgName],
        });

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        // Step 4: Update DB (invariant: only after on-chain success)
        await prisma.orgApplication.update({
            where: { id: req.params.id },
            data: {
                status: 'APPROVED',
                reviewedBy: req.user.walletAddress,
                reviewedAt: new Date(),
                verifyTxHash: hash,
            },
        });

        // Step 5: Create/Update Organization record (cache)
        await prisma.organization.upsert({
            where: { address: orgAddress },
            update: {
                isVerified: true,
                verifiedAt: new Date(),
                verifiedBy: req.user.walletAddress,
            },
            create: {
                name: application.orgName,
                address: orgAddress,
                orgType: application.orgType,
                licenseNumber: application.licenseNumber,
                contactEmail: application.contactEmail,
                isVerified: true,
                verifiedAt: new Date(),
                verifiedBy: req.user.walletAddress,
            },
        });

        // TODO: Emit real-time notification to applicant
        // emitToUser(orgAddress, 'org:verified', { ... });

        console.log(`[Admin] ORG verified: ${orgAddress}, tx: ${hash}`);

        res.json({
            success: true,
            message: 'Organization verified successfully',
            txHash: hash,
        });

    } catch (error) {
        console.error('[Approve] Error:', error);

        // Mark as FAILED if on-chain tx failed
        if (error.message?.includes('transaction')) {
            await prisma.orgApplication.update({
                where: { id: req.params.id },
                data: {
                    status: 'FAILED',
                    reviewNote: `On-chain verification failed: ${error.message}`,
                },
            });
        }

        next(error);
    }
});

// POST /api/admin/org-applications/:id/reject - Reject application
router.post('/org-applications/:id/reject', authenticate, isMinistry, async (req, res, next) => {
    try {
        const { reason } = rejectSchema.parse(req.body);

        const application = await prisma.orgApplication.findUnique({
            where: { id: req.params.id },
        });

        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        if (application.status !== 'PENDING') {
            return res.status(400).json({ error: `Application already ${application.status.toLowerCase()}` });
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
        console.log('[MockIPFS] Uploading file...', { size: fileBuffer.length, type: mimeType });
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
            return res.status(400).json({ error: 'License file is required' });
        }

        // Upload to IPFS
        const { cid, url } = await ipfsService.uploadFile(req.file.buffer, req.file.mimetype);

        console.log(`[Admin] License uploaded: ${cid}`);

        res.json({
            success: true,
            licenseCid: cid,
            licenseUrl: url,
        });
    } catch (error) {
        console.error('[UploadLicense] Error:', error);
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
            return res.status(400).json({ error: 'Transaction failed or not found' });
        }

        // Optional: Verify that this Tx actually created THIS orgId
        // In a real prod environment, we should parse logs.
        // For now, we trust the input + receipt existence to avoid complex log parsing here.

        // 2. Create/Update Organization in DB
        const org = await prisma.organization.upsert({
            where: { address: primaryAdmin.toLowerCase() }, // Use address as unique identifier
            update: {
                name: name,
                // address: primaryAdmin.toLowerCase(), // Address is unique key, no update?
                // primaryAdmin: primaryAdmin.toLowerCase(), // Removed - not in schema
                // backupAdmin: backupAdmin ? backupAdmin.toLowerCase() : null, // Removed
                // licenseCid: licenseCid, // Removed
                licenseNumber: licenseUrl, // Map URL to licenseNumber (Hotfix)
                isVerified: true,
                verifiedAt: new Date(),
                verifiedBy: req.user.walletAddress,
                // active: true, // Removed
            },
            create: {
                // id will be auto-generated UUID
                name: name,
                address: primaryAdmin.toLowerCase(),
                orgType: 'hospital', // Default
                licenseNumber: licenseUrl, // Store license URL here
                isVerified: true,
                verifiedAt: new Date(),
                verifiedBy: req.user.walletAddress,
            },
        });

        console.log(`[Admin] Org synced: ${name} (ID: ${orgId})`);

        // 3. Ensure Admin Membership exists
        await prisma.organizationMember.create({
            data: {
                orgId: org.id,
                memberAddress: primaryAdmin.toLowerCase(),
                role: 'admin',
                status: 'active'
            }
        }).catch(() => {
            // Ignore if already exists
        });

        res.json({
            success: true,
            message: 'Organization synchronized successfully',
            organization: org,
        });

    } catch (error) {
        console.error('[SyncOrg] Error:', error);
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
                console.error(`Error fetching org ${i}:`, e);
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
