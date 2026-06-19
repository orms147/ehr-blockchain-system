// Trusted Contact routes — read-only projection. Mutations go via
// /api/relayer/trusted-contact (EIP-712 signed by patient).
//
// Endpoints:
//   GET  /api/trusted-contacts/me         — patient lists their own contacts
//   GET  /api/trusted-contacts/by-patient/:address
//                                          — verified doctor lists a specific
//                                            patient's contacts in emergency.
//                                            Gate: doctor session + on-chain
//                                            isVerifiedDoctor.
//
// Backend table TrustedContact is a CACHE populated by subgraphSync via
// TrustedContactSet/Revoked events. On-chain
// ConsentLedger.getTrustedContacts is the source of truth — these endpoints
// just hit the mirror for fast UI reads.

import { Router } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requireOnChainRoles } from '../middleware/onChainRole.js';
import { emitToUser } from '../services/socket.service.js';
import { sendPushToWallet } from '../services/push.service.js';
import { createLogger } from '../utils/logger.js';

// AccessLog.cidHash is required (VarChar 66) but a contact-list lookup has no
// record cidHash, so emergency-lookup audit rows are keyed on this sentinel.
const LOOKUP_SENTINEL_CID = '0x' + '0'.repeat(64);

const log = createLogger('TrustedContactRoutes');
const router = Router();
const requireDoctorRole = requireOnChainRoles('verifiedDoctor');

async function listContactsForPatient(patientAddress) {
    const rows = await prisma.trustedContact.findMany({
        where: { patientAddress: patientAddress.toLowerCase(), status: 'active' },
        orderBy: { setAt: 'desc' },
    });

    if (rows.length === 0) return [];

    // Join with User for fullName + phone (kept private — only doctors should
    // see phone for the emergency lookup endpoint; mobile patient sees own
    // contacts, doesn't need their own contact's phone).
    const addresses = rows.map((r) => r.contactAddress);
    const users = await prisma.user.findMany({
        where: { walletAddress: { in: addresses } },
        select: {
            walletAddress: true,
            fullName: true,
            phone: true,
            avatarUrl: true,
        },
    });
    const userByAddr = new Map(users.map((u) => [u.walletAddress.toLowerCase(), u]));

    return rows.map((r) => ({
        contactAddress: r.contactAddress,
        label: r.label,
        setAt: r.setAt,
        fullName: userByAddr.get(r.contactAddress)?.fullName || null,
        avatarUrl: userByAddr.get(r.contactAddress)?.avatarUrl || null,
        // phone is conditionally included by the doctor endpoint below
        phone: userByAddr.get(r.contactAddress)?.phone || null,
    }));
}

// GET /api/trusted-contacts/me
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const contacts = await listContactsForPatient(req.user.walletAddress);
        // Patient sees their own list; we expose phone here too because patient
        // already knows their family member's phone (they typed it in).
        res.json(contacts);
    } catch (error) {
        log.error('GET /me failed', { error: error.message });
        next(error);
    }
});

// GET /api/trusted-contacts/by-patient/:address — used by ER doctor flow.
// Doctor must be a verified doctor. We don't gate on a specific consent or
// patient relationship: in emergency, ANY verified doctor needs to see the
// list to call a contact. The contact is the one who actually authorizes
// access (they sign per-record-delegate from their own wallet).
router.get('/by-patient/:address', authenticate, requireDoctorRole, async (req, res, next) => {
    try {
        const patientAddress = String(req.params.address || '').toLowerCase();
        if (!/^0x[a-f0-9]{40}$/.test(patientAddress)) {
            return res.status(400).json({ code: 'INVALID_ADDRESS', error: 'Địa chỉ ví không hợp lệ' });
        }

        const contacts = await listContactsForPatient(patientAddress);

        // S2 (advisor feedback #6): the ER trusted-contact lookup is a sensitive
        // read of the patient's data (their family contact list) OUTSIDE the
        // normal doctor-consent flow. Persist an immutable audit row and notify
        // the patient post-hoc (hậu kiểm — they may be unconscious during the
        // emergency). AccessLog has no per-patient column, so the row is keyed on
        // a sentinel cidHash with the doctor as accessor; the patient-facing
        // signal is the notification below.
        try {
            await prisma.accessLog.create({
                data: {
                    cidHash: LOOKUP_SENTINEL_CID,
                    accessorAddress: req.user.walletAddress,
                    action: 'EMERGENCY_CONTACT_LOOKUP',
                    consentVerified: true, // gated by on-chain isVerifiedDoctor
                },
            });
        } catch (auditErr) {
            // Audit write failure must not block the emergency lookup itself.
            log.warn('Emergency lookup audit write failed', { error: auditErr?.message });
        }

        emitToUser(patientAddress, 'trustedContact:lookup', {
            doctor: req.user.walletAddress,
            count: contacts.length,
            at: new Date().toISOString(),
        });
        sendPushToWallet(patientAddress, {
            title: 'Tra cứu khẩn cấp người thân tin cậy',
            body: 'Một bác sĩ vừa tra cứu danh sách người thân tin cậy của bạn trong tình huống khẩn cấp.',
            data: { screen: 'AccessLog' },
        }).catch(() => {});

        log.info('Emergency trusted-contact lookup', {
            doctor: req.user.walletAddress,
            patient: patientAddress,
            count: contacts.length,
        });

        res.json(contacts);
    } catch (error) {
        log.error('GET /by-patient failed', { error: error.message });
        next(error);
    }
});

export default router;
