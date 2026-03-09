import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ==================== Validation Schemas ====================

const updateProfileSchema = z.object({
    fullName: z.string().max(100).optional(),
    dateOfBirth: z.string().datetime().optional().nullable(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable(),
    phone: z.string().max(20).optional().nullable(),
    homeAddress: z.string().max(255).optional().nullable(),
    bloodType: z.string().max(5).optional().nullable(),
    allergies: z.string().optional().nullable(),
});

const updateDoctorProfileSchema = z.object({
    specialty: z.string().max(100).optional().nullable(),
    licenseNumber: z.string().max(50).optional().nullable(),
    hospitalName: z.string().max(200).optional().nullable(),
    yearsExperience: z.number().int().min(0).max(80).optional().nullable(),
    bio: z.string().max(1000).optional().nullable(),
});

// ==================== User Profile ====================

// GET /api/profile/me — Get my profile (auth required)
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const user = await prisma.user.findUnique({
            where: { walletAddress: req.user.walletAddress },
            select: {
                walletAddress: true,
                fullName: true,
                dateOfBirth: true,
                gender: true,
                phone: true,
                email: true,
                homeAddress: true,
                avatarUrl: true,
                bloodType: true,
                allergies: true,
                createdAt: true,
                doctorProfile: true,
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        next(error);
    }
});

// PUT /api/profile/me — Update my profile (auth required)
router.put('/me', authenticate, async (req, res, next) => {
    try {
        const data = updateProfileSchema.parse(req.body);

        // Convert dateOfBirth string to Date if provided
        const updateData = {
            ...data,
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : data.dateOfBirth,
        };

        const user = await prisma.user.update({
            where: { walletAddress: req.user.walletAddress },
            data: updateData,
            select: {
                walletAddress: true,
                fullName: true,
                dateOfBirth: true,
                gender: true,
                phone: true,
                email: true,
                homeAddress: true,
                avatarUrl: true,
                bloodType: true,
                allergies: true,
            }
        });

        res.json({ success: true, user });
    } catch (error) {
        next(error);
    }
});

// GET /api/profile/:address — Get public profile of any user (no auth)
router.get('/:address', async (req, res, next) => {
    try {
        const address = req.params.address.toLowerCase();

        const user = await prisma.user.findUnique({
            where: { walletAddress: address },
            select: {
                walletAddress: true,
                fullName: true,
                gender: true,
                avatarUrl: true,
                createdAt: true,
                // Don't expose: phone, email, homeAddress, allergies, bloodType
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Also check if this user has a doctor profile
        const doctorProfile = await prisma.doctorProfile.findUnique({
            where: { walletAddress: address },
            select: {
                specialty: true,
                hospitalName: true,
                yearsExperience: true,
                bio: true,
                // Don't expose: licenseNumber (sensitive)
            }
        });

        res.json({
            ...user,
            doctorProfile: doctorProfile || null,
        });
    } catch (error) {
        next(error);
    }
});

// ==================== Doctor Profile ====================

// PUT /api/profile/doctor — Update doctor-specific profile (auth required)
router.put('/doctor', authenticate, async (req, res, next) => {
    try {
        const data = updateDoctorProfileSchema.parse(req.body);

        const doctorProfile = await prisma.doctorProfile.upsert({
            where: { walletAddress: req.user.walletAddress },
            update: data,
            create: {
                walletAddress: req.user.walletAddress,
                ...data,
            },
        });

        res.json({ success: true, doctorProfile });
    } catch (error) {
        next(error);
    }
});

// GET /api/profile/doctor/:address — Get doctor profile (public)
router.get('/doctor/:address', async (req, res, next) => {
    try {
        const address = req.params.address.toLowerCase();

        const doctorProfile = await prisma.doctorProfile.findUnique({
            where: { walletAddress: address },
            include: {
                user: {
                    select: {
                        fullName: true,
                        avatarUrl: true,
                        gender: true,
                    }
                }
            }
        });

        if (!doctorProfile) {
            return res.status(404).json({ error: 'Doctor profile not found' });
        }

        res.json(doctorProfile);
    } catch (error) {
        next(error);
    }
});

// ==================== Batch Lookup (for Dashboard name resolution) ====================

// POST /api/profile/batch — Get names for multiple addresses at once
router.post('/batch', async (req, res, next) => {
    try {
        const { addresses } = req.body;

        if (!Array.isArray(addresses) || addresses.length === 0) {
            return res.status(400).json({ error: 'addresses array required' });
        }

        // Limit batch size
        const limitedAddresses = addresses.slice(0, 50).map(a => a.toLowerCase());

        const users = await prisma.user.findMany({
            where: { walletAddress: { in: limitedAddresses } },
            select: {
                walletAddress: true,
                fullName: true,
                avatarUrl: true,
            }
        });

        // Return as map: { "0x...": { fullName, avatarUrl } }
        const profileMap = {};
        users.forEach(u => {
            profileMap[u.walletAddress] = {
                fullName: u.fullName,
                avatarUrl: u.avatarUrl,
            };
        });

        res.json(profileMap);
    } catch (error) {
        next(error);
    }
});

export default router;
