import { Router } from 'express';
import { z } from 'zod';
import { keccak256, toBytes } from 'viem';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { getUserRole } from '../config/blockchain.js';

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
    // Số BHYT — TT 32/2023 Chương X. Format chuẩn: 2 chữ cái + 13 chữ số
    // (vd "SV4796543210123"). Cho phép null/empty để clear field. Regex
    // chỉ apply khi value không rỗng — defer business validation cho mobile
    // (user có thể đang nhập dở).
    insuranceNumber: z.string().max(20).optional().nullable().refine(
        (v) => !v || /^[A-Z]{2}\d{13}$/.test(v),
        { message: 'Số BHYT phải gồm 2 chữ cái + 13 chữ số (vd SV4796543210123).' }
    ),
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
                insuranceNumber: true,
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

// PUT /api/profile/me/national-id — Opt-in to emergency CCCD lookup.
// Stores keccak256(rawCccd) so doctor in ER can hash the patient's physical
// CCCD card and look up the wallet address. Plaintext CCCD never leaves the
// patient's device. Patient can clear by passing nationalId=null.
const nationalIdSchema = z.object({
    nationalId: z.string().regex(/^\d{9,12}$/, 'CCCD/CMND phải là 9-12 chữ số').nullable(),
});
router.put('/me/national-id', authenticate, async (req, res, next) => {
    try {
        const { nationalId } = nationalIdSchema.parse(req.body);

        const nationalIdHash = nationalId
            ? keccak256(toBytes(nationalId))
            : null;

        await prisma.user.update({
            where: { walletAddress: req.user.walletAddress },
            data: { nationalIdHash },
        });

        res.json({
            success: true,
            optedIn: nationalIdHash !== null,
            message: nationalIdHash
                ? 'Đã đăng ký mã định danh khẩn cấp. Bác sĩ cấp cứu có thể tra cứu địa chỉ ví của bạn qua CCCD.'
                : 'Đã huỷ đăng ký mã định danh khẩn cấp.',
        });
    } catch (error) {
        if (error?.code === 'P2002') {
            // Unique constraint violation — another user already registered this CCCD hash.
            return res.status(409).json({
                code: 'NATIONAL_ID_TAKEN',
                error: 'CCCD này đã được đăng ký bởi một người dùng khác. Nếu đây là CCCD của bạn, hãy huỷ ở tài khoản kia trước.',
            });
        }
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
                insuranceNumber: true,
            }
        });

        res.json({ success: true, user });
    } catch (error) {
        next(error);
    }
});

// GET /api/profile/:address — Get public profile of any user (no auth).
// Used by mobile UserChip to render "Trần Quốc Bảo · BS · BV Bạch Mai · Đã xác minh"
// next to a wallet address. Returns ONLY public-safe fields — no phone,
// email, dateOfBirth, allergies, bloodType, homeAddress.
//
// isVerifiedDoctor is read from the on-chain role cache (10min TTL,
// invalidated by subgraphSync on DoctorVerified events) so the badge
// refreshes within seconds of an org admin verifying.
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
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

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

        // Surface verified-doctor flag so UserChip can render a "✓ XM" badge.
        // getUserRole uses the 10min role cache (invalidated by subgraphSync
        // on DoctorVerified events) so this endpoint stays cheap even when
        // every chip in a long list calls it.
        let isVerifiedDoctor = false;
        let isDoctor = false;
        try {
            const role = await getUserRole(address);
            isDoctor = role?.isDoctor === true;
            isVerifiedDoctor = role?.isVerifiedDoctor === true;
        } catch {
            // Best-effort — if the read fails, fall back to false flags.
        }

        res.json({
            ...user,
            isDoctor,
            isVerifiedDoctor,
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
