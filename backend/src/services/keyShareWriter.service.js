// keyShareWriter.service.js — single writer for the KeyShare table.
//
// Why this exists (S15.1, 2026-04-29):
// 13 separate call sites mutate KeyShare across the codebase (POST /api/key-share,
// handleConsentRevoked, mark-claimed, save-only, approve-with-sig, grant-as-delegate,
// claim, reject, revoke endpoints). Without ordering guarantees, a stale event from
// the catchup queue can overwrite a fresh share — the S14 race that wiped V2 right
// after the user shared it. Centralizing every write here lets us enforce one
// invariant: "reject sources older than the current row state". Every helper:
//   1. Reads existing row in a transaction.
//   2. Compares `existing.updatedAt` vs `sourceTimestamp`.
//   3. Skips + logs if existing is newer (stale source).
//   4. Otherwise applies the change + audit-logs in the same tx.
//
// Source values (for KeyShareMutationLog filtering):
//   manual            POST /api/key-share (patient share via mobile)
//   cascade           POST /api/key-share with inheritsFromClaimedAncestor
//   save-only-doctor  doctor self KeyShare during /save-only
//   save-only-patient patient KeyShare during /save-only (doctor-create flow)
//   approve-with-sig  patient signs delegate request (status='awaiting_claim')
//   mark-claimed      doctor confirms on-chain (status flip + cascade apply)
//   grant-as-delegate delegatee approves on patient's behalf
//   recipient-claim   doctor claims a pending row
//   recipient-reject  doctor rejects a pending row
//   sender-revoke     patient revokes via DELETE /api/key-share/:id
//   revoke-endpoint   patient revokes via /api/records/:cidHash/revoke
//   event-revoke      handleConsentRevoked (chain event, may be stale)

import prisma from '../config/database.js';
import { createLogger } from '../utils/logger.js';
import { normalizeAddress, normalizeHash } from '../utils/normalize.js';

const log = createLogger('KeyShareWriter');

const SHARE_SOURCES = new Set([
    'manual',
    'cascade',
    'save-only-doctor',
    'save-only-patient',
    'approve-with-sig',
    'mark-claimed',
    'grant-as-delegate',
]);

const STATUS_FLIP_SOURCES = new Set([
    'recipient-claim',
    'recipient-reject',
    'sender-revoke',
    'mark-claimed-flip',
]);

const REVOKE_SOURCES = new Set([
    'event-revoke',
    'revoke-endpoint',
]);


async function logMutation(tx, {
    cidHash, senderAddress, recipientAddress,
    oldStatus, newStatus, source, sourceTimestamp,
    skipped = false, skipReason = null,
}) {
    return tx.keyShareMutationLog.create({
        data: {
            cidHash,
            senderAddress,
            recipientAddress,
            oldStatus: oldStatus ?? null,
            newStatus,
            source,
            sourceTimestamp,
            skipped,
            skipReason,
        },
    });
}

/**
 * applyShare — write or update a KeyShare row carrying a fresh encrypted payload.
 * Covers: POST /api/key-share (manual + cascade), save-only doctor/patient,
 *         approve-with-sig, mark-claimed cascade payload apply, grant-as-delegate.
 *
 * Returns { applied: boolean, row, skipReason? }.
 */
export async function applyShare({
    cidHash,
    senderAddress,
    recipientAddress,
    encryptedPayload,
    senderPublicKey = null,
    status,                 // required: 'pending' | 'claimed' | 'awaiting_claim'
    expiresAt = null,
    allowDelegate = false,
    claimedAt = null,
    preserveClaimed = false, // if true and existing.status==='claimed', keep claimed (don't downgrade to pending)
    createOnlyFields = [],   // field names to set ONLY on create (skip on update). e.g. ['expiresAt', 'allowDelegate'] for approve-with-sig.
    source,
    sourceTimestamp,
}) {
    if (!SHARE_SOURCES.has(source)) {
        throw new Error(`applyShare: invalid source "${source}"`);
    }
    if (!cidHash || !senderAddress || !recipientAddress) {
        throw new Error('applyShare: cidHash/sender/recipient required');
    }
    if (!status) {
        throw new Error('applyShare: status required');
    }
    if (!sourceTimestamp || !(sourceTimestamp instanceof Date)) {
        throw new Error('applyShare: sourceTimestamp must be Date');
    }

    const cid = normalizeHash(cidHash);
    const sender = normalizeAddress(senderAddress);
    const recipient = normalizeAddress(recipientAddress);

    return prisma.$transaction(async (tx) => {
        const existing = await tx.keyShare.findUnique({
            where: {
                cidHash_senderAddress_recipientAddress: {
                    cidHash: cid,
                    senderAddress: sender,
                    recipientAddress: recipient,
                },
            },
        });

        // Timestamp guard: skip if existing row is newer than this source.
        // Prevents stale event/cascade from overwriting fresh manual share.
        if (existing && existing.updatedAt > sourceTimestamp) {
            await logMutation(tx, {
                cidHash: cid,
                senderAddress: sender,
                recipientAddress: recipient,
                oldStatus: existing.status,
                newStatus: existing.status,
                source,
                sourceTimestamp,
                skipped: true,
                skipReason: 'stale-source',
            });
            log.info('Skipped stale share', {
                source, cidHash: cid, recipient,
                existingAt: existing.updatedAt.toISOString(),
                sourceAt: sourceTimestamp.toISOString(),
            });
            return { applied: false, row: existing, skipReason: 'stale-source' };
        }

        // preserveClaimed: don't downgrade an already-claimed row back to
        // pending. POST /api/key-share idempotent re-share path needs this:
        // patient repeats a share, doctor's existing claimed row should keep
        // its claimed state so the doctor doesn't lose access.
        const effectiveStatus = (preserveClaimed && existing?.status === 'claimed')
            ? 'claimed'
            : status;
        const effectiveClaimedAt = claimedAt
            ?? (effectiveStatus === 'claimed'
                ? (existing?.claimedAt || new Date())
                : null);

        // createOnlyFields: leave certain fields untouched on update (set only
        // when row is brand-new). Used by approve-with-sig where expiresAt and
        // allowDelegate represent on-chain consent state that isn't minted
        // until mark-claimed — touching them earlier makes the dashboard lie
        // about chain state if the doctor never confirms.
        const skip = new Set(createOnlyFields);
        const updateData = {
            encryptedPayload,
            senderPublicKey: senderPublicKey ?? undefined,
            status: effectiveStatus,
            claimedAt: effectiveClaimedAt,
        };
        if (!skip.has('expiresAt')) updateData.expiresAt = expiresAt;
        if (!skip.has('allowDelegate')) updateData.allowDelegate = allowDelegate;

        const row = await tx.keyShare.upsert({
            where: {
                cidHash_senderAddress_recipientAddress: {
                    cidHash: cid,
                    senderAddress: sender,
                    recipientAddress: recipient,
                },
            },
            update: updateData,
            create: {
                cidHash: cid,
                senderAddress: sender,
                recipientAddress: recipient,
                encryptedPayload,
                senderPublicKey,
                status: effectiveStatus,
                expiresAt,
                allowDelegate,
                claimedAt: effectiveClaimedAt,
            },
        });

        await logMutation(tx, {
            cidHash: cid,
            senderAddress: sender,
            recipientAddress: recipient,
            oldStatus: existing?.status ?? null,
            newStatus: row.status,
            source,
            sourceTimestamp,
        });

        return { applied: true, row };
    });
}

/**
 * applyStatusFlip — change only the status of an existing KeyShare row.
 * Covers: POST /:id/claim, POST /:id/reject, DELETE /:id (sender-revoke),
 *         mark-claimed status flip from 'awaiting_claim' to 'pending'.
 *
 * Targets the row by either id (PK) OR (cidHash + sender + recipient) triple.
 *
 * Returns { applied: boolean, row, skipReason? }.
 */
export async function applyStatusFlip({
    keyShareId = null,
    cidHash = null,
    senderAddress = null,
    recipientAddress = null,
    newStatus,              // required: 'claimed' | 'revoked' | 'rejected' | 'pending'
    claimedAt = null,
    expectedCurrentStatus = null,  // optional: only flip if current matches this (e.g. 'awaiting_claim' → 'pending')
    source,
    sourceTimestamp,
}) {
    if (!STATUS_FLIP_SOURCES.has(source)) {
        throw new Error(`applyStatusFlip: invalid source "${source}"`);
    }
    if (!newStatus) {
        throw new Error('applyStatusFlip: newStatus required');
    }
    if (!sourceTimestamp || !(sourceTimestamp instanceof Date)) {
        throw new Error('applyStatusFlip: sourceTimestamp must be Date');
    }
    if (!keyShareId && !(cidHash && senderAddress && recipientAddress)) {
        throw new Error('applyStatusFlip: must provide keyShareId or (cidHash, sender, recipient)');
    }

    return prisma.$transaction(async (tx) => {
        const existing = keyShareId
            ? await tx.keyShare.findUnique({ where: { id: keyShareId } })
            : await tx.keyShare.findUnique({
                where: {
                    cidHash_senderAddress_recipientAddress: {
                        cidHash: normalizeHash(cidHash),
                        senderAddress: normalizeAddress(senderAddress),
                        recipientAddress: normalizeAddress(recipientAddress),
                    },
                },
            });

        if (!existing) {
            return { applied: false, row: null, skipReason: 'not-found' };
        }

        if (expectedCurrentStatus && existing.status !== expectedCurrentStatus) {
            await logMutation(tx, {
                cidHash: existing.cidHash,
                senderAddress: existing.senderAddress,
                recipientAddress: existing.recipientAddress,
                oldStatus: existing.status,
                newStatus: existing.status,
                source,
                sourceTimestamp,
                skipped: true,
                skipReason: `status-mismatch:${existing.status}`,
            });
            return { applied: false, row: existing, skipReason: 'status-mismatch' };
        }

        if (existing.updatedAt > sourceTimestamp) {
            await logMutation(tx, {
                cidHash: existing.cidHash,
                senderAddress: existing.senderAddress,
                recipientAddress: existing.recipientAddress,
                oldStatus: existing.status,
                newStatus: existing.status,
                source,
                sourceTimestamp,
                skipped: true,
                skipReason: 'stale-source',
            });
            return { applied: false, row: existing, skipReason: 'stale-source' };
        }

        const row = await tx.keyShare.update({
            where: { id: existing.id },
            data: {
                status: newStatus,
                claimedAt: claimedAt ?? (newStatus === 'claimed' ? (existing.claimedAt || new Date()) : existing.claimedAt),
            },
        });

        await logMutation(tx, {
            cidHash: existing.cidHash,
            senderAddress: existing.senderAddress,
            recipientAddress: existing.recipientAddress,
            oldStatus: existing.status,
            newStatus: row.status,
            source,
            sourceTimestamp,
        });

        return { applied: true, row };
    });
}

/**
 * applyRevoke — revoke a set of KeyShare rows owned by (sender, recipient) pair.
 * Sets status='revoked' + clears encryptedPayload. Each cidHash is checked
 * individually for the timestamp guard so a single stale entry doesn't poison
 * the whole batch.
 *
 * Covers: handleConsentRevoked (event-revoke), record /:cidHash/revoke endpoint.
 *
 * Returns { applied: number, skipped: number, rows: [] }.
 */
export async function applyRevoke({
    senderAddress,
    recipientAddress,
    cidHashes,              // string[] — revoke this set of rows
    source,
    sourceTimestamp,
}) {
    if (!REVOKE_SOURCES.has(source)) {
        throw new Error(`applyRevoke: invalid source "${source}"`);
    }
    if (!Array.isArray(cidHashes) || cidHashes.length === 0) {
        return { applied: 0, skipped: 0, rows: [] };
    }
    if (!sourceTimestamp || !(sourceTimestamp instanceof Date)) {
        throw new Error('applyRevoke: sourceTimestamp must be Date');
    }

    const sender = normalizeAddress(senderAddress);
    const recipient = normalizeAddress(recipientAddress);
    const hashes = cidHashes.map(normalizeHash);

    return prisma.$transaction(async (tx) => {
        const existing = await tx.keyShare.findMany({
            where: {
                senderAddress: sender,
                recipientAddress: recipient,
                cidHash: { in: hashes },
            },
        });

        const rows = [];
        let appliedCount = 0;
        let skippedCount = 0;

        for (const row of existing) {
            // Don't re-revoke an already-revoked row.
            if (row.status === 'revoked') {
                skippedCount += 1;
                await logMutation(tx, {
                    cidHash: row.cidHash,
                    senderAddress: row.senderAddress,
                    recipientAddress: row.recipientAddress,
                    oldStatus: row.status,
                    newStatus: row.status,
                    source,
                    sourceTimestamp,
                    skipped: true,
                    skipReason: 'already-revoked',
                });
                continue;
            }

            // Timestamp guard: stale event arriving after a fresh share would
            // overwrite payload here. Skip if so. This is the S14 fix.
            if (row.updatedAt > sourceTimestamp) {
                skippedCount += 1;
                await logMutation(tx, {
                    cidHash: row.cidHash,
                    senderAddress: row.senderAddress,
                    recipientAddress: row.recipientAddress,
                    oldStatus: row.status,
                    newStatus: row.status,
                    source,
                    sourceTimestamp,
                    skipped: true,
                    skipReason: 'stale-source',
                });
                log.info('Skipped stale revoke', {
                    source, cidHash: row.cidHash, recipient,
                    existingAt: row.updatedAt.toISOString(),
                    sourceAt: sourceTimestamp.toISOString(),
                });
                continue;
            }

            const updated = await tx.keyShare.update({
                where: { id: row.id },
                data: {
                    status: 'revoked',
                    encryptedPayload: '',
                },
            });
            rows.push(updated);
            appliedCount += 1;

            await logMutation(tx, {
                cidHash: row.cidHash,
                senderAddress: row.senderAddress,
                recipientAddress: row.recipientAddress,
                oldStatus: row.status,
                newStatus: 'revoked',
                source,
                sourceTimestamp,
            });
        }

        return { applied: appliedCount, skipped: skippedCount, rows };
    });
}

export default {
    applyShare,
    applyStatusFlip,
    applyRevoke,
};
