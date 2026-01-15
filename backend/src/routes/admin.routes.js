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

export default router;
