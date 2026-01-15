// Organization Routes - API for hospital/clinic management
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';

const router = Router();

// Validation schemas
const createOrgSchema = z.object({
    name: z.string().min(2).max(200),
    orgType: z.enum(['hospital', 'clinic', 'ministry']).default('hospital'),
    licenseNumber: z.string().optional(),
    location: z.string().optional(),
    contactEmail: z.string().email().optional(),
});

// Schema for ORG application (hybrid flow)
const applyOrgSchema = z.object({
    orgName: z.string().min(2).max(200),
    description: z.string().max(1000).optional(),
    contactEmail: z.string().email(),
    licenseNumber: z.string().optional(),
    orgType: z.enum(['hospital', 'clinic']).default('hospital'),
});

const addMemberSchema = z.object({
    memberAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    role: z.enum(['admin', 'doctor', 'nurse', 'staff']).default('doctor'),
});

// ============ ORG APPLICATION ROUTES (Hybrid Flow) ============

// POST /api/org/apply - Submit application to become ORG
router.post('/apply', authenticate, async (req, res, next) => {
    try {
        const data = applyOrgSchema.parse(req.body);
        const applicantAddress = req.user.walletAddress.toLowerCase();

        // Check if already has pending application
        const existingPending = await prisma.orgApplication.findFirst({
            where: {
                applicantAddress,
                status: 'PENDING',
            },
        });

        if (existingPending) {
            return res.status(400).json({
                error: 'You already have a pending application',
                application: existingPending,
            });
        }

        // Check if already verified
        const existingApproved = await prisma.orgApplication.findFirst({
            where: {
                applicantAddress,
                status: 'APPROVED',
            },
        });

        if (existingApproved) {
            return res.status(400).json({
                error: 'You are already a verified organization',
            });
        }

        // Create application
        const application = await prisma.orgApplication.create({
            data: {
                applicantAddress,
                orgName: data.orgName,
                description: data.description,
                contactEmail: data.contactEmail,
                licenseNumber: data.licenseNumber,
                orgType: data.orgType,
            },
        });

        res.status(201).json({
            success: true,
            message: 'Application submitted. Please register as Organization on-chain, then wait for Ministry verification.',
            application,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/org/my-application - Get current user's application status
router.get('/my-application', authenticate, async (req, res, next) => {
    try {
        const applicantAddress = req.user.walletAddress.toLowerCase();

        const application = await prisma.orgApplication.findFirst({
            where: { applicantAddress },
            orderBy: { createdAt: 'desc' },
        });

        if (!application) {
            return res.json({ hasApplication: false });
        }

        res.json({
            hasApplication: true,
            application,
        });
    } catch (error) {
        next(error);
    }
});

// ============ EXISTING ORG ROUTES ============

// POST /api/org/register - Register a new organization
router.post('/register', authenticate, async (req, res, next) => {
    try {
        const data = createOrgSchema.parse(req.body);
        const orgAddress = req.user.walletAddress.toLowerCase();

        // Check if org already exists
        const existing = await prisma.organization.findUnique({
            where: { address: orgAddress },
        });

        if (existing) {
            return res.status(400).json({
                error: 'Tổ chức đã được đăng ký với địa chỉ này',
                organization: existing,
            });
        }

        const org = await prisma.organization.create({
            data: {
                name: data.name,
                address: orgAddress,
                orgType: data.orgType,
                licenseNumber: data.licenseNumber,
                location: data.location,
                contactEmail: data.contactEmail,
            },
        });

        // Add creator as admin
        await prisma.organizationMember.create({
            data: {
                orgId: org.id,
                memberAddress: orgAddress,
                role: 'admin',
            },
        });

        res.json({
            success: true,
            message: 'Đã đăng ký tổ chức. Đang chờ xác thực từ Bộ Y tế.',
            organization: org,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/org/my-org - Get organization where current user is a member
router.get('/my-org', authenticate, async (req, res, next) => {
    try {
        const memberAddress = req.user.walletAddress.toLowerCase();

        const membership = await prisma.organizationMember.findFirst({
            where: {
                memberAddress: memberAddress,
                status: 'active',
            },
        });

        if (!membership) {
            return res.json({ hasOrg: false });
        }

        const org = await prisma.organization.findUnique({
            where: { id: membership.orgId },
        });

        res.json({
            hasOrg: true,
            organization: org,
            role: membership.role,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/org/:orgId/members - Get organization members
router.get('/:orgId/members', authenticate, async (req, res, next) => {
    try {
        const { orgId } = req.params;

        const members = await prisma.organizationMember.findMany({
            where: {
                orgId: orgId,
                status: 'active',
            },
            orderBy: { joinedAt: 'desc' },
        });

        res.json({
            count: members.length,
            members: members,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/org/:orgId/add-member - Add member to organization (admin only)
router.post('/:orgId/add-member', authenticate, async (req, res, next) => {
    try {
        const { orgId } = req.params;
        const data = addMemberSchema.parse(req.body);
        const adminAddress = req.user.walletAddress.toLowerCase();

        // Check if user is admin of this org
        const adminMembership = await prisma.organizationMember.findFirst({
            where: {
                orgId: orgId,
                memberAddress: adminAddress,
                role: 'admin',
                status: 'active',
            },
        });

        if (!adminMembership) {
            return res.status(403).json({ error: 'Chỉ admin mới có thể thêm thành viên' });
        }

        // Check if member already exists
        const existing = await prisma.organizationMember.findFirst({
            where: {
                orgId: orgId,
                memberAddress: data.memberAddress.toLowerCase(),
            },
        });

        if (existing) {
            return res.status(400).json({ error: 'Thành viên đã tồn tại trong tổ chức' });
        }

        const member = await prisma.organizationMember.create({
            data: {
                orgId: orgId,
                memberAddress: data.memberAddress.toLowerCase(),
                role: data.role,
            },
        });

        res.json({
            success: true,
            message: 'Đã thêm thành viên vào tổ chức',
            member: member,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/org/:orgId/remove-member/:memberId - Remove member (admin only)
router.post('/:orgId/remove-member/:memberId', authenticate, async (req, res, next) => {
    try {
        const { orgId, memberId } = req.params;
        const adminAddress = req.user.walletAddress.toLowerCase();

        // Check if user is admin of this org
        const adminMembership = await prisma.organizationMember.findFirst({
            where: {
                orgId: orgId,
                memberAddress: adminAddress,
                role: 'admin',
                status: 'active',
            },
        });

        if (!adminMembership) {
            return res.status(403).json({ error: 'Chỉ admin mới có thể xóa thành viên' });
        }

        await prisma.organizationMember.update({
            where: { id: memberId },
            data: {
                status: 'inactive',
                leftAt: new Date(),
            },
        });

        res.json({
            success: true,
            message: 'Đã xóa thành viên khỏi tổ chức',
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/org/all - Get all organizations (for Ministry/Admin)
router.get('/all', authenticate, async (req, res, next) => {
    try {
        const { status, type } = req.query;

        const where = {};
        if (status === 'verified') where.isVerified = true;
        if (status === 'pending') where.isVerified = false;
        if (type) where.orgType = type;

        const orgs = await prisma.organization.findMany({
            where: where,
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: orgs.length,
            organizations: orgs,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/org/:orgId/verify - Verify organization (Ministry only)
router.post('/:orgId/verify', authenticate, async (req, res, next) => {
    try {
        const { orgId } = req.params;
        const verifierAddress = req.user.walletAddress.toLowerCase();

        // TODO: Check if user is Ministry

        await prisma.organization.update({
            where: { id: orgId },
            data: {
                isVerified: true,
                verifiedAt: new Date(),
                verifiedBy: verifierAddress,
            },
        });

        res.json({
            success: true,
            message: 'Đã xác thực tổ chức',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
