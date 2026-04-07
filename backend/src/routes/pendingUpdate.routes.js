// Pending Update Routes - Doctor update approval flow
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireOnChainRoles } from '../middleware/onChainRole.js';
import prisma from '../config/database.js';
import { keccak256, toBytes } from 'viem';
import { emitToUser } from '../services/socket.service.js';

const router = Router();
const requireDoctorRole = requireOnChainRoles('doctor');
const requirePatientRole = requireOnChainRoles('patient');

// Validation schemas
const createPendingUpdateSchema = z.object({
    parentCidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    patientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    encryptedContent: z.string(), // Base64 encrypted FHIR bundle
    recordType: z.string().max(50).optional(),
    title: z.string().max(255).optional(),
});

const claimUpdateSchema = z.object({
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    cid: z.string().min(1), // IPFS CID
    aesKey: z.string().min(1), // AES key string
    encryptedPayloadForPatient: z.string().nullable().optional(),
    senderPublicKey: z.string().nullable().optional(),
});

// Helper: Calculate content hash
function calculateContentHash(content) {
    return keccak256(toBytes(content));
}

// POST /api/pending-updates - Create pending update (Doctor)
router.post('/', authenticate, requireDoctorRole, async (req, res, next) => {
    try {
        const { parentCidHash, patientAddress, encryptedContent, recordType, title } =
            createPendingUpdateSchema.parse(req.body);
        const doctorAddress = req.user.walletAddress.toLowerCase();


        // Verify parent record exists
        const parentRecord = await prisma.recordMetadata.findFirst({
            where: {
                cidHash: parentCidHash.toLowerCase(),
                syncStatus: 'confirmed',
            }
        });

        if (!parentRecord) {
            return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Hồ sơ gốc không tồn tại', message: 'Hồ sơ gốc không tồn tại' });
        }

        // Auto-detect patientAddress from parent record's owner
        // This ensures we always use the correct patient even if frontend sends wrong address
        const actualPatientAddress = parentRecord.ownerAddress.toLowerCase();

        // Verify doctor has access to this record (keyShare exists)
        const hasAccess = await prisma.keyShare.findFirst({
            where: {
                cidHash: parentCidHash.toLowerCase(),
                recipientAddress: doctorAddress,
                status: { in: ['pending', 'claimed'] },
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } }
                ]
            }
        });

        if (!hasAccess) {
            return res.status(403).json({
                code: 'CONSENT_NOT_FOUND',
                error: 'Bạn không có quyền truy cập hồ sơ này. Vui lòng yêu cầu quyền truy cập trước.',
                message: 'Bạn không có quyền truy cập hồ sơ này. Vui lòng yêu cầu quyền truy cập trước.',
            });
        }

        // Check if this record already has children (updates)
        const existingChild = await prisma.recordMetadata.findFirst({
            where: {
                parentCidHash: parentCidHash.toLowerCase(),
                syncStatus: 'confirmed',
            }
        });

        if (existingChild) {
            return res.status(400).json({
                code: 'PENDING_UPDATE_ALREADY_PROCESSED',
                error: 'Hồ sơ này đã có bản cập nhật. Vui lòng cập nhật từ phiên bản mới nhất.',
                message: 'Hồ sơ này đã có bản cập nhật. Vui lòng cập nhật từ phiên bản mới nhất.',
                latestCidHash: existingChild.cidHash,
            });
        }

        // Calculate content hash for integrity
        const contentHash = calculateContentHash(encryptedContent);

        // Set expiry (7 days from now)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Create pending update
        const pendingUpdate = await prisma.pendingUpdate.create({
            data: {
                doctorAddress,
                patientAddress: actualPatientAddress, // Use auto-detected from parent record
                parentCidHash: parentCidHash.toLowerCase(),
                encryptedContent,
                contentHash,
                recordType: recordType || null,
                title: title || null,
                status: 'pending',
                expiresAt,
            }
        });

        // Notify patient via WebSocket (use actual patient from parent record)
        emitToUser(actualPatientAddress, 'pending_update:new', {
            id: pendingUpdate.id,
            doctorAddress,
            parentCidHash: parentCidHash.toLowerCase(),
            title: title || 'Cập nhật hồ sơ',
        });
        res.status(201).json({
            success: true,
            pendingUpdate: {
                id: pendingUpdate.id,
                status: pendingUpdate.status,
                expiresAt: pendingUpdate.expiresAt,
            },
            message: 'Yêu cầu cập nhật đã được gửi. Chờ bệnh nhân phê duyệt.'
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/pending-updates/incoming - Get updates for me (Patient)
router.get('/incoming', authenticate, requirePatientRole, async (req, res, next) => {
    try {
        const patientAddress = req.user.walletAddress.toLowerCase();

        const updates = await prisma.pendingUpdate.findMany({
            where: {
                patientAddress,
                status: 'pending',
                expiresAt: { gt: new Date() }, // Not expired
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: updates.length,
            updates,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/pending-updates/outgoing - Get updates I created (Doctor)
router.get('/outgoing', authenticate, requireDoctorRole, async (req, res, next) => {
    try {
        const doctorAddress = req.user.walletAddress.toLowerCase();

        const updates = await prisma.pendingUpdate.findMany({
            where: {
                doctorAddress,
                status: { in: ['pending', 'approved'] }, // Show pending and approved
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: updates.length,
            updates,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/pending-updates/approved - Get approved updates ready to claim (Doctor)
router.get('/approved', authenticate, requireDoctorRole, async (req, res, next) => {
    try {
        const doctorAddress = req.user.walletAddress.toLowerCase();

        const updates = await prisma.pendingUpdate.findMany({
            where: {
                doctorAddress,
                status: 'approved',
            },
            orderBy: { approvedAt: 'desc' },
        });

        res.json({
            count: updates.length,
            updates,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/pending-updates/:id - Get update details
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const { id } = req.params;
        const userAddress = req.user.walletAddress.toLowerCase();

        const update = await prisma.pendingUpdate.findUnique({
            where: { id },
        });

        if (!update) {
            return res.status(404).json({ code: 'PENDING_UPDATE_NOT_FOUND', error: 'Không tìm thấy yêu cầu cập nhật', message: 'Không tìm thấy yêu cầu cập nhật' });
        }

        // Check access - only doctor or patient can view
        if (update.doctorAddress !== userAddress && update.patientAddress !== userAddress) {
            return res.status(403).json({ code: 'REQUEST_NOT_AUTHORIZED', error: 'Không có quyền xem yêu cầu này', message: 'Không có quyền xem yêu cầu này' });
        }

        res.json(update);
    } catch (error) {
        next(error);
    }
});

// POST /api/pending-updates/:id/approve - Approve update (Patient)
router.post('/:id/approve', authenticate, requirePatientRole, async (req, res, next) => {
    try {
        const { id } = req.params;
        const patientAddress = req.user.walletAddress.toLowerCase();

        const update = await prisma.pendingUpdate.findUnique({
            where: { id },
        });

        if (!update) {
            return res.status(404).json({ code: 'PENDING_UPDATE_NOT_FOUND', error: 'Không tìm thấy yêu cầu cập nhật', message: 'Không tìm thấy yêu cầu cập nhật' });
        }

        if (update.patientAddress !== patientAddress) {
            return res.status(403).json({ code: 'REQUEST_NOT_AUTHORIZED', error: 'Chỉ bệnh nhân mới có thể phê duyệt', message: 'Chỉ bệnh nhân mới có thể phê duyệt' });
        }

        if (update.status !== 'pending') {
            return res.status(400).json({ code: 'PENDING_UPDATE_ALREADY_PROCESSED', error: `Yêu cầu này đã ${update.status}`, message: `Yêu cầu này đã ${update.status}` });
        }

        if (new Date() > update.expiresAt) {
            return res.status(400).json({ code: 'PENDING_UPDATE_EXPIRED', error: 'Yêu cầu đã hết hạn', message: 'Yêu cầu đã hết hạn' });
        }

        // Update status to approved
        const updated = await prisma.pendingUpdate.update({
            where: { id },
            data: {
                status: 'approved',
                approvedAt: new Date(),
            },
        });

        // Notify doctor via WebSocket
        emitToUser(update.doctorAddress, 'pending_update:approved', {
            id: update.id,
            patientAddress,
            title: update.title,
        });
        res.json({
            success: true,
            message: 'Đã phê duyệt yêu cầu cập nhật. Bác sĩ có thể xác nhận.',
            update: updated,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/pending-updates/:id/reject - Reject update (Patient)
router.post('/:id/reject', authenticate, requirePatientRole, async (req, res, next) => {
    try {
        const { id } = req.params;
        const patientAddress = req.user.walletAddress.toLowerCase();

        const update = await prisma.pendingUpdate.findUnique({
            where: { id },
        });

        if (!update) {
            return res.status(404).json({ code: 'PENDING_UPDATE_NOT_FOUND', error: 'Không tìm thấy yêu cầu cập nhật', message: 'Không tìm thấy yêu cầu cập nhật' });
        }

        if (update.patientAddress !== patientAddress) {
            return res.status(403).json({ code: 'REQUEST_NOT_AUTHORIZED', error: 'Chỉ bệnh nhân mới có thể từ chối', message: 'Chỉ bệnh nhân mới có thể từ chối' });
        }

        if (update.status !== 'pending') {
            return res.status(400).json({ code: 'PENDING_UPDATE_ALREADY_PROCESSED', error: `Yêu cầu này đã ${update.status}`, message: `Yêu cầu này đã ${update.status}` });
        }

        // Update status to rejected
        await prisma.pendingUpdate.update({
            where: { id },
            data: { status: 'rejected' },
        });

        // Notify doctor via WebSocket
        emitToUser(update.doctorAddress, 'pending_update:rejected', {
            id: update.id,
            patientAddress,
            title: update.title,
        });
        res.json({
            success: true,
            message: 'Đã từ chối yêu cầu cập nhật.',
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/pending-updates/:id/claim - Claim approved update (Doctor)
router.post('/:id/claim', authenticate, requireDoctorRole, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { cidHash, txHash, cid, aesKey, encryptedPayloadForPatient, senderPublicKey } = claimUpdateSchema.parse(req.body);
        const doctorAddress = req.user.walletAddress.toLowerCase();

        const update = await prisma.pendingUpdate.findUnique({
            where: { id },
        });

        if (!update) {
            return res.status(404).json({ code: 'PENDING_UPDATE_NOT_FOUND', error: 'Không tìm thấy yêu cầu cập nhật', message: 'Không tìm thấy yêu cầu cập nhật' });
        }

        if (update.doctorAddress !== doctorAddress) {
            return res.status(403).json({ code: 'REQUEST_NOT_AUTHORIZED', error: 'Chỉ bác sĩ tạo yêu cầu mới có thể xác nhận', message: 'Chỉ bác sĩ tạo yêu cầu mới có thể xác nhận' });
        }

        if (update.status !== 'approved') {
            return res.status(400).json({
                code: 'PENDING_UPDATE_ALREADY_PROCESSED',
                error: update.status === 'pending'
                    ? 'Yêu cầu chưa được bệnh nhân phê duyệt'
                    : `Yêu cầu này đã ${update.status}`,
                message: update.status === 'pending'
                    ? 'Yêu cầu chưa được bệnh nhân phê duyệt'
                    : `Yêu cầu này đã ${update.status}`,
            });
        }

        // ATOMIC: Update status to claimed only if still approved (prevents race condition)
        const claimedAt = new Date();
        const normalizedCidHash = cidHash.toLowerCase();
        const normalizedTxHash = txHash.toLowerCase();

        const claimResult = await prisma.pendingUpdate.updateMany({
            where: { id, status: 'approved' },
            data: {
                status: 'claimed',
                cidHash: normalizedCidHash,
                txHash: normalizedTxHash,
                claimedAt,
            },
        });

        if (claimResult.count === 0) {
            return res.status(409).json({
                code: 'PENDING_UPDATE_ALREADY_CLAIMED',
                error: 'Yêu cầu đã được xử lý bởi người khác',
                message: 'Yêu cầu đã được xử lý bởi người khác',
            });
        }

        const claimed = await prisma.pendingUpdate.findUnique({ where: { id } });

        await prisma.recordMetadata.upsert({
            where: { cidHash: normalizedCidHash },
            update: {
                ownerAddress: update.patientAddress,
                createdBy: doctorAddress,
                parentCidHash: update.parentCidHash,
                title: update.title || null,
                recordType: update.recordType || null,
                syncStatus: 'confirmed',
                txHash: normalizedTxHash,
                submittedAt: claimedAt,
                confirmedAt: claimedAt,
                failedAt: null,
                syncError: null,
            },
            create: {
                cidHash: normalizedCidHash,
                ownerAddress: update.patientAddress,
                createdBy: doctorAddress,
                parentCidHash: update.parentCidHash,
                title: update.title || null,
                recordType: update.recordType || null,
                syncStatus: 'confirmed',
                txHash: normalizedTxHash,
                submittedAt: claimedAt,
                confirmedAt: claimedAt,
            },
        });

        // Get AES key from parent record's encryptedContent
        // The encryptedContent stored in pendingUpdate contains the AES key needed to decrypt

        // SYNC EXPIRY: Get doctor's access expiry from parent record's KeyShare
        // This ensures doctor cannot extend access indefinitely by creating updates
        const parentKeyShare = await prisma.keyShare.findFirst({
            where: {
                cidHash: update.parentCidHash.toLowerCase(),
                recipientAddress: doctorAddress,
                status: { notIn: ['revoked'] },
            },
            select: { expiresAt: true }
        });

        // Use parent's expiresAt, or if null (permanent access for owner), use null
        const doctorExpiresAt = parentKeyShare?.expiresAt || null;

        // Plaintext fallback (legacy). Real clients MUST send NaCl-sealed
        // `encryptedPayloadForPatient`, otherwise the patient cannot decrypt
        // because their device only knows how to open NaCl envelopes.
        const plaintextPayload = JSON.stringify({ cid, aesKey });
        const patientEncryptedPayload = encryptedPayloadForPatient || plaintextPayload;

        // Create KeyShare for Patient (owner) - permanent access
        await prisma.keyShare.upsert({
            where: {
                cidHash_senderAddress_recipientAddress: {
                    cidHash: cidHash.toLowerCase(),
                    senderAddress: doctorAddress,
                    recipientAddress: update.patientAddress,
                }
            },
            update: {
                status: 'pending',
                encryptedPayload: patientEncryptedPayload,
                senderPublicKey: senderPublicKey || undefined,
            },
            create: {
                cidHash: cidHash.toLowerCase(),
                senderAddress: doctorAddress,
                recipientAddress: update.patientAddress,
                encryptedPayload: patientEncryptedPayload,
                senderPublicKey: senderPublicKey || null,
                status: 'pending',
            },
        });

        // Create KeyShare for Doctor - access for 7 days
        await prisma.keyShare.upsert({
            where: {
                cidHash_senderAddress_recipientAddress: {
                    cidHash: cidHash.toLowerCase(),
                    senderAddress: update.patientAddress,
                    recipientAddress: doctorAddress,
                }
            },
            update: {
                status: 'claimed',
                expiresAt: doctorExpiresAt,
            },
            create: {
                cidHash: cidHash.toLowerCase(),
                senderAddress: update.patientAddress,
                recipientAddress: doctorAddress,
                encryptedPayload: plaintextPayload, // Doctor reads via local records; this row exists only for authorization.
                status: 'claimed', // Doctor has access
                expiresAt: doctorExpiresAt,
            },
        });
        // Notify patient via WebSocket
        emitToUser(update.patientAddress, 'pending_update:claimed', {
            id: update.id,
            cidHash: cidHash.toLowerCase(),
            doctorAddress,
        });

        res.json({
            success: true,
            message: 'Đã xác nhận cập nhật on-chain.',
            update: claimed,
        });
    } catch (error) {
        next(error);
    }
});

export default router;

