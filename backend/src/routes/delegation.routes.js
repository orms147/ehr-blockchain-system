// Delegation Routes - Read-only projections of the CHAIN topology delegations.
//
// IMPORTANT: all mutations go through the relayer or the contract directly:
//   - Grant root (patient -> doctor)   : POST /api/relayer/delegate-authority
//   - Sub-delegate (doctor -> doctor)  : ConsentLedger.subDelegate() via wallet (no relayer)
//   - Revoke root                      : ConsentLedger.revokeDelegation() via patient wallet
//   - Revoke sub                       : ConsentLedger.revokeSubDelegation() via parent wallet
//
// This file only EXPOSES the projections that consentLedgerSync.service.js
// populates from on-chain events (DelegationGranted / DelegationRevoked /
// AccessGrantedViaDelegation). No DB writes here.

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';

const router = Router();

// Serialize BigInt fields (epoch, grantBlockNumber) for JSON output.
function serializeDelegation(row) {
    if (!row) return row;
    return {
        ...row,
        epoch: row.epoch != null ? row.epoch.toString() : null,
        grantBlockNumber: row.grantBlockNumber != null ? row.grantBlockNumber.toString() : null,
    };
}

// GET /api/delegation/my-delegates - As patient: who did I delegate authority to?
router.get('/my-delegates', authenticate, async (req, res, next) => {
    try {
        const patientAddress = req.user.walletAddress.toLowerCase();

        const delegations = await prisma.delegation.findMany({
            where: { patientAddress },
            orderBy: { grantedAt: 'desc' },
        });

        res.json({
            count: delegations.length,
            delegations: delegations.map(serializeDelegation),
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/delegation/delegated-to-me - As doctor: who delegated authority to me?
// Returns both direct (chainDepth=1) and sub-delegations where I am the delegatee.
router.get('/delegated-to-me', authenticate, async (req, res, next) => {
    try {
        const delegateeAddress = req.user.walletAddress.toLowerCase();

        const delegations = await prisma.delegation.findMany({
            where: {
                delegateeAddress,
                status: 'active',
            },
            orderBy: { grantedAt: 'desc' },
        });

        res.json({
            count: delegations.length,
            delegations: delegations.map(serializeDelegation),
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/delegation/check/:patientAddress - Check if I hold an active delegation
// from a given patient. Used by the doctor UI before attempting grantUsingDelegation.
router.get('/check/:patientAddress', authenticate, async (req, res, next) => {
    try {
        const patientAddress = req.params.patientAddress.toLowerCase();
        const delegateeAddress = req.user.walletAddress.toLowerCase();

        const delegation = await prisma.delegation.findUnique({
            where: {
                patientAddress_delegateeAddress: { patientAddress, delegateeAddress },
            },
        });

        const isActive = !!(
            delegation &&
            delegation.status === 'active' &&
            (!delegation.expiresAt || delegation.expiresAt > new Date())
        );

        res.json({
            hasDelegation: isActive,
            delegation: delegation ? serializeDelegation(delegation) : null,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/delegation/access-logs - Audit trail of grantUsingDelegation events.
// Patient sees logs where patientAddress = me; doctor sees where byDelegatee = me.
router.get('/access-logs', authenticate, async (req, res, next) => {
    try {
        const me = req.user.walletAddress.toLowerCase();
        const role = (req.query.role || 'patient').toString();

        const where = role === 'delegatee' ? { byDelegatee: me } : { patientAddress: me };

        const logs = await prisma.delegationAccessLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 200,
        });

        res.json({
            count: logs.length,
            logs: logs.map((l) => ({
                ...l,
                blockNumber: l.blockNumber != null ? l.blockNumber.toString() : null,
            })),
        });
    } catch (error) {
        next(error);
    }
});

export default router;
