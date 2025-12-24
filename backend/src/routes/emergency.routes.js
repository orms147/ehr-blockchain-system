// Emergency Access Routes - API for emergency medical access
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';

const router = Router();

// Validation schemas
const createEmergencySchema = z.object({
    patientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
    reason: z.string().min(10).max(500),
    emergencyType: z.enum(['medical', 'accident', 'critical']).default('medical'),
    location: z.string().optional(),
    durationHours: z.number().min(1).max(48).default(24),
});

// POST /api/emergency/request - Doctor requests emergency access
router.post('/request', authenticate, async (req, res, next) => {
    try {
        const data = createEmergencySchema.parse(req.body);
        const doctorAddress = req.user.walletAddress.toLowerCase();

        // Check if doctor is verified (in production, enforce this strictly)
        // For now, just create the emergency access

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + data.durationHours);

        const emergency = await prisma.emergencyAccess.create({
            data: {
                doctorAddress: doctorAddress,
                patientAddress: data.patientAddress.toLowerCase(),
                cidHash: data.cidHash || null,
                reason: data.reason,
                emergencyType: data.emergencyType,
                location: data.location,
                expiresAt: expiresAt,
            },
        });

        res.json({
            success: true,
            message: 'Yêu cầu truy cập khẩn cấp đã được tạo.',
            emergency: emergency,
            // In practice, you might need org admin approval
            // For now, auto-approve for verified doctors
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/emergency/active - Get active emergency accesses for current doctor
router.get('/active', authenticate, async (req, res, next) => {
    try {
        const doctorAddress = req.user.walletAddress.toLowerCase();

        const emergencies = await prisma.emergencyAccess.findMany({
            where: {
                doctorAddress: doctorAddress,
                status: 'active',
                expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: emergencies.length,
            emergencies: emergencies,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/emergency/patient/:patientAddress - Get emergency accesses for a patient
router.get('/patient/:patientAddress', authenticate, async (req, res, next) => {
    try {
        const { patientAddress } = req.params;
        const userAddress = req.user.walletAddress.toLowerCase();

        // Only the patient or accessing doctor can view
        const emergencies = await prisma.emergencyAccess.findMany({
            where: {
                patientAddress: patientAddress.toLowerCase(),
                OR: [
                    { patientAddress: userAddress },
                    { doctorAddress: userAddress },
                ],
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: emergencies.length,
            emergencies: emergencies,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/emergency/revoke/:id - Revoke emergency access early
router.post('/revoke/:id', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const userAddress = req.user.walletAddress.toLowerCase();

        const emergency = await prisma.emergencyAccess.findUnique({
            where: { id: id },
        });

        if (!emergency) {
            return res.status(404).json({ error: 'Không tìm thấy quyền truy cập khẩn cấp' });
        }

        // Only patient or org admin can revoke
        if (emergency.patientAddress !== userAddress) {
            // TODO: Check if user is org admin
            return res.status(403).json({ error: 'Không có quyền thu hồi' });
        }

        await prisma.emergencyAccess.update({
            where: { id: id },
            data: {
                status: 'revoked',
                revokedBy: userAddress,
                revokedAt: new Date(),
            },
        });

        res.json({
            success: true,
            message: 'Đã thu hồi quyền truy cập khẩn cấp',
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/emergency/check/:patientAddress - Check if doctor has emergency access to patient
router.get('/check/:patientAddress', authenticate, async (req, res, next) => {
    try {
        const { patientAddress } = req.params;
        const doctorAddress = req.user.walletAddress.toLowerCase();

        const activeAccess = await prisma.emergencyAccess.findFirst({
            where: {
                doctorAddress: doctorAddress,
                patientAddress: patientAddress.toLowerCase(),
                status: 'active',
                expiresAt: { gt: new Date() },
            },
        });

        res.json({
            hasAccess: !!activeAccess,
            access: activeAccess,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
