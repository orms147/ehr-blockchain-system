// Delegation Routes - API for patient delegation to family members
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';

const router = Router();

// Validation schemas
const createDelegationSchema = z.object({
    delegateAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    delegationType: z.enum(['full', 'limited', 'emergency_only']).default('full'),
});

// POST /api/delegation/create - Patient adds a delegate (family member)
router.post('/create', authenticate, async (req, res, next) => {
    try {
        const data = createDelegationSchema.parse(req.body);
        const patientAddress = req.user.walletAddress.toLowerCase();

        // Check if delegation already exists
        const existing = await prisma.delegation.findFirst({
            where: {
                patientAddress: patientAddress,
                delegateAddress: data.delegateAddress.toLowerCase(),
                status: 'active',
            },
        });

        if (existing) {
            return res.status(400).json({
                error: 'Ủy quyền đã tồn tại cho địa chỉ này',
                delegation: existing,
            });
        }

        const delegation = await prisma.delegation.create({
            data: {
                patientAddress: patientAddress,
                delegateAddress: data.delegateAddress.toLowerCase(),
                delegationType: data.delegationType,
            },
        });

        res.json({
            success: true,
            message: 'Đã thêm ủy quyền thành công',
            delegation: delegation,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/delegation/my-delegates - Get delegates I've added (as patient)
router.get('/my-delegates', authenticate, async (req, res, next) => {
    try {
        const patientAddress = req.user.walletAddress.toLowerCase();

        const delegations = await prisma.delegation.findMany({
            where: {
                patientAddress: patientAddress,
                status: 'active',
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: delegations.length,
            delegations: delegations,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/delegation/delegated-to-me - Get patients who delegated to me
router.get('/delegated-to-me', authenticate, async (req, res, next) => {
    try {
        const delegateAddress = req.user.walletAddress.toLowerCase();

        const delegations = await prisma.delegation.findMany({
            where: {
                delegateAddress: delegateAddress,
                status: 'active',
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: delegations.length,
            delegations: delegations,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/delegation/revoke/:id - Revoke delegation
router.post('/revoke/:id', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const patientAddress = req.user.walletAddress.toLowerCase();

        const delegation = await prisma.delegation.findUnique({
            where: { id: id },
        });

        if (!delegation) {
            return res.status(404).json({ error: 'Không tìm thấy ủy quyền' });
        }

        // Only patient can revoke
        if (delegation.patientAddress !== patientAddress) {
            return res.status(403).json({ error: 'Không có quyền thu hồi ủy quyền này' });
        }

        await prisma.delegation.update({
            where: { id: id },
            data: {
                status: 'revoked',
                revokedAt: new Date(),
            },
        });

        res.json({
            success: true,
            message: 'Đã thu hồi ủy quyền',
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/delegation/check/:patientAddress - Check if I have delegation for a patient
router.get('/check/:patientAddress', authenticate, async (req, res, next) => {
    try {
        const { patientAddress } = req.params;
        const delegateAddress = req.user.walletAddress.toLowerCase();

        const delegation = await prisma.delegation.findFirst({
            where: {
                patientAddress: patientAddress.toLowerCase(),
                delegateAddress: delegateAddress,
                status: 'active',
            },
        });

        res.json({
            hasDelegation: !!delegation,
            delegation: delegation,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
