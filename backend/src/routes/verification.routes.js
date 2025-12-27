// Verification Routes - API for doctor verification management
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';
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
            } catch (e) {
            }
        }

        // Get pending verification request
        const pendingRequest = await prisma.verificationRequest.findFirst({
            where: {
                doctorAddress: doctorAddress,
                status: 'pending',
            },
        });

        // Get approved request
        const approvedRequest = await prisma.verificationRequest.findFirst({
            where: {
                doctorAddress: doctorAddress,
                status: 'approved',
            },
        });

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
router.post('/submit', authenticate, async (req, res, next) => {
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

// GET /api/verification/pending - Get all pending requests (Ministry/Admin only)
router.get('/pending', authenticate, async (req, res, next) => {
    try {
        // TODO: Add role check for Ministry/Admin
        const requests = await prisma.verificationRequest.findMany({
            where: { status: 'pending' },
            orderBy: { createdAt: 'asc' },
        });

        res.json({
            count: requests.length,
            requests: requests,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/verification/all - Get all verification requests (Ministry/Admin only)
router.get('/all', authenticate, async (req, res, next) => {
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

// POST /api/verification/review - Approve or reject verification (Ministry/Admin only)
router.post('/review', authenticate, async (req, res, next) => {
    try {
        const { requestId, approved, rejectionReason } = reviewVerificationSchema.parse(req.body);
        const reviewerAddress = req.user.walletAddress.toLowerCase();

        // TODO: Add role check for Ministry/Admin

        const request = await prisma.verificationRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            return res.status(404).json({ error: 'Không tìm thấy yêu cầu xác thực' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ error: 'Yêu cầu này đã được xử lý' });
        }

        // Update request status
        const updated = await prisma.verificationRequest.update({
            where: { id: requestId },
            data: {
                status: approved ? 'approved' : 'rejected',
                reviewedBy: reviewerAddress,
                reviewedAt: new Date(),
                rejectionReason: approved ? null : rejectionReason,
            },
        });

        // If approved, the Ministry needs to call verifyDoctor on-chain
        // This returns the data needed for that call
        res.json({
            success: true,
            message: approved ? 'Đã phê duyệt bác sĩ' : 'Đã từ chối yêu cầu',
            request: updated,
            // If approved, return contract call info
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
