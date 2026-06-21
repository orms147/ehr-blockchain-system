// Organization Routes - API for hospital/clinic management
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { requireOnChainRoles } from '../middleware/onChainRole.js';
import prisma from '../config/database.js';
import { getUserRoleStrict } from '../config/blockchain.js';
import { encryptAES } from '../utils/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const requireMinistryRole = requireOnChainRoles('ministry');

// ============ MULTER CONFIG ============
const uploadDir = path.join(__dirname, '../../uploads/licenses');

// Create uploads directory if not exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'license-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận PDF, JPEG, PNG'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: fileFilter
});

// Validation schemas
const createOrgSchema = z.object({
    name: z.string().min(2).max(200),
    orgType: z.enum(['hospital', 'clinic', 'ministry']).default('hospital'),
    licenseNumber: z.string().optional(),
    location: z.string().optional(),
    contactEmail: z.string().email().optional(),
});

// Schema for ORG profile update (compliance/audit) - flexible validation
const applyOrgSchema = z.object({
    orgName: z.string().min(3).max(100),
    description: z.string().max(1000).optional().default(''),
    contactEmail: z.string().email(),
    licenseNumber: z.string().optional().default(''),
    orgType: z.enum(['hospital', 'private_hospital', 'clinic', 'medical_center']).default('hospital'),
    phone: z.string().optional().default(''),
    address: z.string().max(500).optional().default(''),
});

const addMemberSchema = z.object({
    memberAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    role: z.enum(['admin', 'doctor', 'nurse', 'staff']).default('doctor'),
    // Wave G: mobile broadcasts AccessControl.addOrgMember on-chain (org admin
    // pays gas) then POSTs here with txHash so backend mirrors DB. Optional
    // for backwards-compat with the previous db-only flow.
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
});

// ============ ORG APPLICATION ROUTES (Hybrid Flow) ============

// POST /api/org/apply - Submit/update org profile (compliance) with file upload
router.post('/apply', authenticate, upload.single('licenseFile'), async (req, res, next) => {
    try {
        const data = applyOrgSchema.parse(req.body);
        const applicantAddress = req.user.walletAddress.toLowerCase();
        const licensePath = req.file ? `/uploads/licenses/${req.file.filename}` : null;

        // Check if already has pending application
        const existingPending = await prisma.orgApplication.findFirst({
            where: {
                applicantAddress,
                status: 'PENDING',
            },
        });

        if (existingPending) {
            // Update existing application
            const updated = await prisma.orgApplication.update({
                where: { id: existingPending.id },
                data: {
                    orgName: data.orgName,
                    description: data.description,
                    contactEmail: data.contactEmail,
                    licenseNumber: data.licenseNumber,
                    orgType: data.orgType,
                    phone: data.phone,
                    address: data.address,
                    ...(licensePath && { licenseFilePath: licensePath }),
                },
            });
            return res.json({
                success: true,
                message: 'Đã cập nhật hồ sơ tổ chức',
                application: updated,
            });
        }

        // Create new application
        const application = await prisma.orgApplication.create({
            data: {
                applicantAddress,
                orgName: data.orgName,
                description: data.description,
                contactEmail: data.contactEmail,
                licenseNumber: data.licenseNumber,
                orgType: data.orgType,
                phone: data.phone,
                address: data.address,
                licenseFilePath: licensePath,
            },
        });

        res.status(201).json({
            success: true,
            message: 'Đã lưu hồ sơ tổ chức. Bộ Y tế có thể xem xét bất kỳ lúc nào.',
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

        let membership = await prisma.organizationMember.findFirst({
            where: {
                memberAddress: memberAddress,
                status: 'active',
            },
        });

        let org;
        let role;

        if (membership) {
            org = await prisma.organization.findUnique({
                where: { id: membership.orgId },
            });
            role = membership.role;
        } else {
            // Fallback: user là primaryAdmin (address) HOẶC backupAdmin của 1 org.
            // On-chain cả 2 admin bình đẳng (createOrganization cấp ORGANIZATION|VERIFIED_ORG
            // + adminToOrgId cho cả hai) → backend cũng phải resolve cả backupAdminAddress,
            // nếu không backup admin đăng nhập sẽ thấy hasOrg:false dù có đủ quyền.
            org = await prisma.organization.findFirst({
                where: { OR: [{ address: memberAddress }, { backupAdminAddress: memberAddress }] },
            });

            if (org) {
                role = 'admin';
                // Auto-fix: Create membership record if missing
                try {
                    await prisma.organizationMember.create({
                        data: {
                            orgId: org.id,
                            memberAddress: memberAddress,
                            role: 'admin',
                            status: 'active'
                        }
                    });
                } catch (e) {
                    // Ignore unique constraint violation if race condition
                }
            }
        }

        if (!org) {
            return res.json({ hasOrg: false });
        }

        res.json({
            hasOrg: true,
            organization: org,
            role: role,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/org/:orgId/members - Get organization members
// Wave C: enriched member list. Joins OrganizationMember with User +
// DoctorProfile + VerificationRequest to give the mobile UI everything it
// needs for the redesigned VerifiedDoctorRow (per viehp-ministry-org-actions
// §2: name + specialty + GPHN license + verifiedAt date + status pill).
//
// Query param ?status= filters by lifecycle:
//   - active (default): all current members (verified + pending)
//   - revoked: members whose verification was revoked (kept for audit)
router.get('/:orgId/members', authenticate, async (req, res, next) => {
    try {
        const { orgId } = req.params;
        const statusFilter = String(req.query.status || 'active').toLowerCase();
        const allowedStatuses = ['active', 'revoked', 'all'];
        if (!allowedStatuses.includes(statusFilter)) {
            return res.status(400).json({
                code: 'INVALID_STATUS_FILTER',
                error: `status must be one of ${allowedStatuses.join(', ')}`,
            });
        }

        // F7 fix: authorization gate. The member roster (incl. CCHN license
        // numbers + specialties) must not be enumerable by any logged-in user.
        // Allow only an ACTIVE member of THIS org, or the Ministry. (Ministry has
        // dedicated oversight endpoints under /api/admin; the flag here is a
        // fail-safe — absent/false flag falls through to the membership check.)
        const callerAddress = req.user.walletAddress.toLowerCase();
        if (req.user.isMinistry !== true) {
            const callerMembership = await prisma.organizationMember.findFirst({
                where: { orgId, memberAddress: callerAddress, status: 'active' },
            });
            if (!callerMembership) {
                return res.status(403).json({
                    code: 'NOT_ORG_MEMBER',
                    error: 'Chỉ thành viên tổ chức (hoặc Bộ Y tế) mới xem được danh sách thành viên',
                });
            }
        }

        // Admin (primary/backup) là quản trị viên, KHÔNG phải bác sĩ cần xác minh →
        // loại khỏi roster "Quản lý bác sĩ" (auth-gate ở query riêng phía trên nên
        // admin vẫn xem được danh sách).
        const where = { orgId, role: { not: 'admin' } };
        if (statusFilter !== 'all') where.status = statusFilter;

        const members = await prisma.organizationMember.findMany({
            where,
            orderBy: { joinedAt: 'desc' },
        });

        if (members.length === 0) {
            return res.json({ count: 0, members: [] });
        }

        const addresses = members.map((m) => m.memberAddress);
        const [users, latestVerifs] = await Promise.all([
            prisma.user.findMany({
                where: { walletAddress: { in: addresses } },
                include: { doctorProfile: true },
            }),
            prisma.verificationRequest.findMany({
                where: { doctorAddress: { in: addresses } },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        const userByAddr = new Map(users.map((u) => [u.walletAddress.toLowerCase(), u]));
        // Pick the most recent verification request per doctor (already ordered desc).
        const verifByAddr = new Map();
        for (const v of latestVerifs) {
            const key = v.doctorAddress.toLowerCase();
            if (!verifByAddr.has(key)) verifByAddr.set(key, v);
        }

        const enriched = members.map((m) => {
            const addr = m.memberAddress.toLowerCase();
            const u = userByAddr.get(addr);
            const v = verifByAddr.get(addr);
            // Verification state derived from latest VerificationRequest.status.
            // 'verified' = approved (cached, contract is source of truth — UI
            //              should re-check on action). 'pending' / 'rejected'.
            // If member.status='revoked' override to 'revoked' regardless.
            let verificationState = 'pending';
            if (m.status === 'revoked') verificationState = 'revoked';
            else if (v?.status === 'approved') verificationState = 'verified';
            else if (v?.status === 'rejected') verificationState = 'rejected';
            return {
                id: m.id,
                memberAddress: m.memberAddress,
                role: m.role,
                status: m.status,
                joinedAt: m.joinedAt,
                leftAt: m.leftAt,
                // Enrichment fields:
                fullName: u?.fullName || v?.fullName || null,
                specialty: u?.doctorProfile?.specialty || v?.specialty || null,
                licenseNumber: u?.doctorProfile?.licenseNumber || v?.licenseNumber || null,
                hospitalName: u?.doctorProfile?.hospitalName || null,
                verifiedAt: v?.status === 'approved' ? v.reviewedAt : null,
                verificationState,
            };
        });

        // Counts for filter chips — across all status filters so UI can render
        // chip badges even when current view is filtered.
        const allMembers = await prisma.organizationMember.findMany({
            where: { orgId, role: { not: 'admin' } },  // counts: bác sĩ thật, không tính admin
            select: { status: true, memberAddress: true },
        });
        const allAddrs = allMembers.map((m) => m.memberAddress.toLowerCase());
        const allVerifs = await prisma.verificationRequest.findMany({
            where: { doctorAddress: { in: allAddrs } },
            select: { doctorAddress: true, status: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
        const latestVerifMap = new Map();
        for (const v of allVerifs) {
            const k = v.doctorAddress.toLowerCase();
            if (!latestVerifMap.has(k)) latestVerifMap.set(k, v.status);
        }
        const counts = { verified: 0, pending: 0, revoked: 0 };
        for (const m of allMembers) {
            if (m.status === 'revoked') counts.revoked += 1;
            else {
                const v = latestVerifMap.get(m.memberAddress.toLowerCase());
                if (v === 'approved') counts.verified += 1;
                else counts.pending += 1;
            }
        }

        res.json({
            count: enriched.length,
            members: enriched,
            counts,
        });
    } catch (error) {
        next(error);
    }
});

// Wave C: mirror on-chain revokeDoctorVerification → flip OrganizationMember
// to 'revoked'. The actual AccessControl.revokeDoctorVerification(doctor)
// tx is broadcast from mobile (org admin pays gas). This endpoint just
// updates the cache so the UI status flips instantly without waiting for
// event-sync to catch up. Reason field accepted but stored TBD (UX Q3).
router.post('/:orgId/revoke-member', authenticate, async (req, res, next) => {
    try {
        const { orgId } = req.params;
        const { doctorAddress, txHash } = req.body || {};
        if (!doctorAddress || !/^0x[a-fA-F0-9]{40}$/.test(doctorAddress)) {
            return res.status(400).json({
                code: 'INVALID_DOCTOR_ADDRESS',
                error: 'doctorAddress must be a 0x-prefixed 40-hex string',
            });
        }
        const callerAddress = req.user.walletAddress.toLowerCase();

        // Only org admin can revoke (mirror contract permission — the on-chain
        // tx would fail anyway, but reject early so we don't store stale state).
        const adminMembership = await prisma.organizationMember.findFirst({
            where: { orgId, memberAddress: callerAddress, role: 'admin', status: 'active' },
        });
        if (!adminMembership) {
            return res.status(403).json({
                code: 'NOT_ORG_ADMIN',
                error: 'Chỉ admin tổ chức mới có thể thu hồi xác minh',
            });
        }

        await prisma.organizationMember.updateMany({
            where: { orgId, memberAddress: doctorAddress.toLowerCase() },
            data: { status: 'revoked', leftAt: new Date() },
        });

        res.json({ success: true, status: 'revoked', doctorAddress: doctorAddress.toLowerCase(), txHash: txHash || null });
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
            txHash: data.txHash || null,
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
router.get('/all', authenticate, requireMinistryRole, async (req, res, next) => {
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
router.post('/:orgId/verify', authenticate, requireMinistryRole, async (req, res, next) => {
    try {
        const { orgId } = req.params;
        const verifierAddress = req.user.walletAddress.toLowerCase();
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

// Validation schema for credential
const saveCredentialSchema = z.object({
    doctorAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/i, 'Địa chỉ ví không hợp lệ'),
    credential: z.string().min(1, 'GPHH không được để trống'),
    credentialHash: z.string().min(1, 'Hash không được để trống')
});

// POST /api/org/doctor-credential - Save encrypted doctor credential off-chain
router.post('/doctor-credential', authenticate, async (req, res, next) => {
    try {
        const { doctorAddress, credential, credentialHash } = saveCredentialSchema.parse(req.body);
        const adminAddress = req.user.walletAddress.toLowerCase();

        // Verify caller is an admin
        const adminOrg = await prisma.organizationMember.findFirst({
            where: {
                memberAddress: adminAddress,
                role: 'admin',
                status: 'active'
            }
        });

        // Ministry can also save credentials (source of truth: on-chain)
        const onChainRoles = await getUserRoleStrict(adminAddress);
        const isMinistry = onChainRoles.isMinistry === true;

        if (!adminOrg && !isMinistry) {
            return res.status(403).json({ error: 'Chỉ Admin tổ chức hoặc Bộ Y tế mới có thể lưu chứng chỉ' });
        }

        // Encrypt the plaintext credential
        const encryptedData = encryptAES(credential);

        // Save to DB
        await prisma.doctorCredential.upsert({
            where: { doctorAddress: doctorAddress.toLowerCase() },
            update: {
                credentialHash,
                encryptedData,
                verifiedByOrgId: adminOrg ? adminOrg.orgId : 'ministry'
            },
            create: {
                doctorAddress: doctorAddress.toLowerCase(),
                credentialHash,
                encryptedData,
                verifiedByOrgId: adminOrg ? adminOrg.orgId : 'ministry'
            }
        });

        res.json({
            success: true,
            message: 'Đã lưu thông tin chứng chỉ an toàn (mã hóa off-chain)'
        });
    } catch (error) {
        next(error);
    }
});

export default router;

