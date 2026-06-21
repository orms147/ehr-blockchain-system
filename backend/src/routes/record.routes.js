import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import relayerService from '../services/relayer.service.js';
import { emitToUser } from '../services/socket.service.js';
import { createLogger } from '../utils/logger.js';
import { normalizeAddress, normalizeHash } from '../utils/normalize.js';
import { applyShare, applyRevoke } from '../services/keyShareWriter.service.js';

const log = createLogger('RecordRoutes');

const router = Router();

const RECORD_SYNC_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    FAILED: 'failed',
};

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
const MAX_CHILDREN = 100;

// Backend tables (KeyShare, RecordMetadata) have FK constraints to User. When a
// doctor writes a record for a patient who has never logged in, the patient
// User row may not exist yet and the KeyShare upsert would silently fail with
// a FK violation, leaving the doctor unable to decrypt their own creation.
// Upsert the User row defensively before writing anything that references it.
async function ensureUserRow(walletAddress) {
    if (!walletAddress) return;
    try {
        await prisma.user.upsert({
            where: { walletAddress },
            update: {},
            create: { walletAddress },
        });
    } catch (err) {
        log.warn('ensureUserRow failed', { walletAddress, error: err?.message });
    }
}

function buildConfirmedRecordWhere(extraWhere = {}) {
    return {
        syncStatus: RECORD_SYNC_STATUS.CONFIRMED,
        ...extraWhere,
    };
}

function sanitizeSyncError(message) {
    if (!message) {
        return null;
    }

    return String(message).slice(0, 2000);
}

async function findConfirmedRecordByCidHash(cidHash, extra = {}) {
    return prisma.recordMetadata.findFirst({
        where: buildConfirmedRecordWhere({ cidHash }),
        ...extra,
    });
}

// Validation schemas
const createRecordSchema = z.object({
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recordTypeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    parentCidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    title: z.string().max(255).optional().nullable(),
    description: z.string().optional().nullable(),
    recordType: z.string().max(50).optional().nullable(),
    versionNote: z.string().max(500).optional().nullable(),
});

const saveOnlySchema = z.object({
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recordTypeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    encryptedPayload: z.string().optional().nullable(),          // doctor's own copy
    senderPublicKey: z.string().optional().nullable(),
    title: z.string().max(255).optional().nullable(),
    description: z.string().optional().nullable(),
    recordType: z.string().max(50).optional().nullable(),
    versionNote: z.string().max(500).optional().nullable(),
    parentCidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    // When doctor updates a patient's record, mobile provides a NaCl-sealed
    // envelope of {cid, aesKey} encrypted for the PATIENT so the patient can
    // decrypt the new version. Optional for legacy/no-patient-share callers.
    patientEncryptedPayload: z.string().optional().nullable(),
});

// POST /api/records - Upload record with quota check and on-chain registration
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { cidHash, recordTypeHash, parentCidHash, title, description, recordType, versionNote } = createRecordSchema.parse(req.body);
        const walletAddress = normalizeAddress(req.user.walletAddress);
        const normalizedCidHash = normalizeHash(cidHash);
        const normalizedParentCidHash = normalizeHash(parentCidHash);
        const normalizedRecordTypeHash = normalizeHash(recordTypeHash);
        // Canonical "no parent" = null in DB. Clients send ZERO_HASH for root
        // records (contract requires bytes32), but storing that string in DB
        // breaks chain grouping (version walk loops, filter(Boolean) sets).
        const effectiveParentCidHash = normalizedParentCidHash && normalizedParentCidHash !== ZERO_HASH
            ? normalizedParentCidHash
            : null;

        const existing = await prisma.recordMetadata.findUnique({
            where: { cidHash: normalizedCidHash },
        });

        if (existing?.syncStatus === RECORD_SYNC_STATUS.CONFIRMED) {
            return res.status(409).json({
                error: 'Record already exists',
                code: 'RECORD_EXISTS',
                recordId: existing.id,
                txHash: existing.txHash || null,
            });
        }

        if (existing?.syncStatus === RECORD_SYNC_STATUS.PENDING) {
            return res.status(409).json({
                error: 'Record upload is already in progress',
                code: 'UPLOAD_ALREADY_PENDING',
                recordId: existing.id,
                txHash: existing.txHash,
            });
        }

        if (existing && normalizeAddress(existing.ownerAddress) !== walletAddress) {
            return res.status(409).json({
                error: 'This CID is already reserved by another record upload',
                code: 'CID_RESERVED',
            });
        }

        if (effectiveParentCidHash) {
            const parentRecord = await findConfirmedRecordByCidHash(effectiveParentCidHash);

            if (!parentRecord) {
                return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Parent record not found', message: 'Parent record not found' });
            }

            const childCount = await prisma.recordMetadata.count({
                where: buildConfirmedRecordWhere({ parentCidHash: effectiveParentCidHash }),
            });

            if (childCount >= MAX_CHILDREN) {
                return res.status(400).json({
                    error: `Max child version limit reached (${MAX_CHILDREN}). Please create a new record instead.`,
                    code: 'MAX_CHILDREN_REACHED',
                });
            }

            const isOwner = normalizeAddress(parentRecord.ownerAddress) === walletAddress;
            const hasKeyShare = await prisma.keyShare.findFirst({
                where: {
                    cidHash: effectiveParentCidHash,
                    recipientAddress: walletAddress,
                    status: { in: ['pending', 'claimed'] },
                    OR: [
                        { expiresAt: null },
                        { expiresAt: { gt: new Date() } },
                    ],
                },
            });

            if (!isOwner && !hasKeyShare) {
                return res.status(403).json({
                    error: 'You must have access to the parent record before uploading an update.',
                });
            }
        }

        const quota = await relayerService.getQuotaStatus(walletAddress);
        if (quota.signaturesRemaining <= 0) {
            return res.status(429).json({
                code: 'QUOTA_EXHAUSTED',
                error: 'Monthly sponsored signature quota exhausted. Please connect a wallet with ETH to continue.',
                quota,
            });
        }

        const submittedAt = new Date();
        let record;

        if (existing?.syncStatus === RECORD_SYNC_STATUS.FAILED) {
            record = await prisma.recordMetadata.update({
                where: { id: existing.id },
                data: {
                    ownerAddress: walletAddress,
                    createdBy: walletAddress,
                    recordTypeHash: normalizedRecordTypeHash,
                    parentCidHash: effectiveParentCidHash,
                    title: title || null,
                    description: description || null,
                    recordType: recordType || null,
                    versionNote: versionNote || null,
                    syncStatus: RECORD_SYNC_STATUS.PENDING,
                    txHash: null,
                    submittedAt,
                    confirmedAt: null,
                    failedAt: null,
                    syncError: null,
                },
            });
        } else {
            record = await prisma.recordMetadata.create({
                data: {
                    cidHash: normalizedCidHash,
                    ownerAddress: walletAddress,
                    createdBy: walletAddress,
                    recordTypeHash: normalizedRecordTypeHash,
                    parentCidHash: effectiveParentCidHash,
                    title: title || null,
                    description: description || null,
                    recordType: recordType || null,
                    versionNote: versionNote || null,
                    syncStatus: RECORD_SYNC_STATUS.PENDING,
                    submittedAt,
                },
            });
        }

        let txResult = null;
        try {
            txResult = await relayerService.sponsorUploadRecord(
                walletAddress,
                normalizedCidHash,
                effectiveParentCidHash || ZERO_HASH,
                normalizedRecordTypeHash || ZERO_HASH,
            );
        } catch (txError) {
            const responseMessage = txError.message || 'On-chain transaction failed. The upload is saved as failed so it can be retried safely.';
            const responseCode = txError.code || 'UPLOAD_TX_FAILED';
            const responseStatus = txError.statusCode || (responseCode === 'QUOTA_EXHAUSTED' ? 429 : 500);

            await prisma.recordMetadata.update({
                where: { id: record.id },
                data: {
                    syncStatus: RECORD_SYNC_STATUS.FAILED,
                    txHash: txError.txHash || null,
                    failedAt: new Date(),
                    confirmedAt: null,
                    syncError: sanitizeSyncError(txError.details || responseMessage),
                },
            });

            return res.status(responseStatus).json({
                error: responseMessage,
                code: responseCode,
                details: txError.details || null,
                txHash: txError.txHash || null,
            });
        }

        record = await prisma.recordMetadata.update({
            where: { id: record.id },
            data: {
                syncStatus: RECORD_SYNC_STATUS.CONFIRMED,
                txHash: txResult?.txHash || null,
                confirmedAt: new Date(),
                failedAt: null,
                syncError: null,
            },
        });

        await prisma.accessLog.create({
            data: {
                cidHash: normalizedCidHash,
                accessorAddress: walletAddress,
                action: 'CREATE_RECORD',
                consentVerified: true,
            },
        });

        res.status(existing ? 200 : 201).json({
            id: record.id,
            cidHash: record.cidHash,
            createdAt: record.createdAt,
            submittedAt: record.submittedAt,
            confirmedAt: record.confirmedAt,
            syncStatus: record.syncStatus,
            txHash: txResult?.txHash || null,
            onChain: true,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/records/save-only - Save metadata only (no on-chain tx)
// Used by Doctors who already submitted on-chain tx themselves
// Also creates KeyShare so Doctor can view the record they created
router.post('/save-only', authenticate, async (req, res, next) => {
    try {
        const {
            cidHash,
            recordTypeHash,
            ownerAddress,
            encryptedPayload,
            senderPublicKey,
            title,
            description,
            recordType,
            versionNote,
            parentCidHash,
            txHash,
            patientEncryptedPayload,
        } = saveOnlySchema.parse(req.body);

        const creatorAddress = normalizeAddress(req.user.walletAddress);
        const patientAddress = normalizeAddress(ownerAddress);
        const normalizedCidHash = normalizeHash(cidHash);
        const normalizedParentCidHash = normalizeHash(parentCidHash);
        const normalizedRecordTypeHash = normalizeHash(recordTypeHash);
        const normalizedTxHash = normalizeHash(txHash);
        // Canonical "no parent" = null in DB (see POST / for rationale).
        const effectiveParentCidHash = normalizedParentCidHash && normalizedParentCidHash !== ZERO_HASH
            ? normalizedParentCidHash
            : null;
        const confirmedAt = new Date();
        let record;

        // Guarantee both sides of the upcoming FK edges exist before any
        // RecordMetadata / KeyShare writes. Without this, a doctor writing for
        // a never-logged-in patient would fail on KeyShare.sender FK and leave
        // the doctor unable to decrypt their own record.
        await ensureUserRow(creatorAddress);
        await ensureUserRow(patientAddress);

        const existing = await prisma.recordMetadata.findUnique({
            where: { cidHash: normalizedCidHash },
        });

        if (existing) {
            const isMissingParent = !existing.parentCidHash || existing.parentCidHash === ZERO_HASH;
            const hasNewParent = !!effectiveParentCidHash;
            const shouldPatchParent = isMissingParent && hasNewParent;
            const shouldMarkConfirmed = existing.syncStatus !== RECORD_SYNC_STATUS.CONFIRMED || !existing.confirmedAt || !!existing.syncError;

            if (shouldPatchParent || shouldMarkConfirmed) {
                // When not patching, preserve existing.parentCidHash — but
                // collapse legacy ZERO_HASH rows to null so the canonical shape
                // spreads organically.
                const preservedParent = existing.parentCidHash === ZERO_HASH ? null : existing.parentCidHash;
                record = await prisma.recordMetadata.update({
                    where: { id: existing.id },
                    data: {
                        ownerAddress: patientAddress,
                        createdBy: creatorAddress,
                        recordTypeHash: normalizedRecordTypeHash,
                        title: title || existing.title || null,
                        description: description || existing.description || null,
                        recordType: recordType || existing.recordType || null,
                        versionNote: versionNote || existing.versionNote || null,
                        parentCidHash: shouldPatchParent ? effectiveParentCidHash : preservedParent,
                        syncStatus: RECORD_SYNC_STATUS.CONFIRMED,
                        txHash: normalizedTxHash || existing.txHash,
                        submittedAt: existing.submittedAt || confirmedAt,
                        confirmedAt,
                        failedAt: null,
                        syncError: null,
                    },
                });
            } else {
                record = existing;
            }
        } else {
            record = await prisma.recordMetadata.create({
                data: {
                    cidHash: normalizedCidHash,
                    ownerAddress: patientAddress,
                    createdBy: creatorAddress,
                    recordTypeHash: normalizedRecordTypeHash,
                    title: title || null,
                    description: description || null,
                    recordType: recordType || null,
                    versionNote: versionNote || null,
                    parentCidHash: effectiveParentCidHash,
                    syncStatus: RECORD_SYNC_STATUS.CONFIRMED,
                    txHash: normalizedTxHash,
                    submittedAt: confirmedAt,
                    confirmedAt,
                },
            });
        }

        if (encryptedPayload) {
            // Inherit doctor's expiry from the parent KeyShare so an update
            // never extends their window beyond the original consent. If this
            // is a NEW root (no parent) or the doctor has no prior KeyShare
            // (e.g. patient-self path where creatorAddress == patientAddress),
            // fall back to a 7-day default. If the parent KeyShare has null
            // expiry (permanent — typical for the patient themselves) the
            // new row also gets null so owners don't accidentally self-expire.
            let inheritedExpiresAt = null;
            let inheritedAllowDelegate = false;
            let useFallback = true;
            if (effectiveParentCidHash && creatorAddress !== patientAddress) {
                const parentShare = await prisma.keyShare.findFirst({
                    where: {
                        cidHash: effectiveParentCidHash,
                        recipientAddress: creatorAddress,
                        status: { notIn: ['revoked', 'rejected'] },
                    },
                    select: { expiresAt: true, allowDelegate: true },
                });
                if (parentShare) {
                    inheritedExpiresAt = parentShare.expiresAt; // may be null (forever)
                    // On-chain Consent is at chain root with a single allowDelegate
                    // flag — every version inherits it. Without this, when D updates
                    // V1 → V2, V2's new self-share defaults to allowDelegate=false
                    // and the dashboard's "Có thể chia sẻ lại" tag disappears even
                    // though contract grantUsingRecordDelegation walks to root and
                    // would still accept the share.
                    inheritedAllowDelegate = parentShare.allowDelegate === true;
                    useFallback = false;
                }
            }
            const fallbackExpiresAt = new Date();
            fallbackExpiresAt.setDate(fallbackExpiresAt.getDate() + 7);
            const finalExpiresAt = useFallback ? fallbackExpiresAt : inheritedExpiresAt;

            try {
                await applyShare({
                    cidHash: normalizedCidHash,
                    senderAddress: patientAddress,
                    recipientAddress: creatorAddress,
                    encryptedPayload,
                    senderPublicKey: senderPublicKey || null,
                    status: 'claimed',
                    expiresAt: finalExpiresAt,
                    allowDelegate: inheritedAllowDelegate,
                    preserveClaimed: true,
                    source: 'save-only-doctor',
                    sourceTimestamp: new Date(),
                });
            } catch (err) {
                // Don't fail the whole request if KeyShare write blows up —
                // the on-chain record + RecordMetadata are already committed.
                // But surface it loudly in logs so silent "can't decrypt"
                // reports stop being a mystery.
                log.error('save-only: doctor self KeyShare upsert failed', {
                    cidHash: normalizedCidHash,
                    senderAddress: patientAddress,
                    recipientAddress: creatorAddress,
                    error: err?.message,
                });
            }
        } else {
            log.warn('save-only: encryptedPayload empty — skipping doctor self KeyShare', {
                cidHash: normalizedCidHash,
                creatorAddress,
            });
        }

        // 2026-04-19 doctor-update-direct flow: create KeyShare for the PATIENT
        // (owner) so they can decrypt the new version the doctor just wrote.
        // Only fires when doctor is updating on behalf of someone else — skip
        // when creator == owner (patient creating their own record path).
        if (patientEncryptedPayload && creatorAddress !== patientAddress) {
            try {
                await applyShare({
                    cidHash: normalizedCidHash,
                    senderAddress: creatorAddress,
                    recipientAddress: patientAddress,
                    encryptedPayload: patientEncryptedPayload,
                    senderPublicKey: senderPublicKey || null,
                    status: 'pending',
                    preserveClaimed: true,
                    source: 'save-only-patient',
                    sourceTimestamp: new Date(),
                });
            } catch (err) {
                log.error('save-only: patient KeyShare upsert failed', {
                    cidHash: normalizedCidHash,
                    senderAddress: creatorAddress,
                    recipientAddress: patientAddress,
                    error: err?.message,
                });
            }
        }

        await prisma.accessLog.create({
            data: {
                cidHash: normalizedCidHash,
                accessorAddress: creatorAddress,
                action: 'CREATE_RECORD_BY_DOCTOR',
                consentVerified: true,
            },
        });

        const patchedParent = !!existing && (!existing.parentCidHash || existing.parentCidHash === ZERO_HASH) && !!effectiveParentCidHash;

        res.status(existing ? 200 : 201).json({
            id: record.id,
            cidHash: record.cidHash,
            createdAt: record.createdAt,
            confirmedAt: record.confirmedAt,
            syncStatus: record.syncStatus,
            txHash: record.txHash,
            onChain: true,
            patched: patchedParent,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/records/my - Get user's records (owned or created)
//
// G.1.b — augments each record with `versionCount` (1 + descendant count)
// so RecordRow can render "v·N" chip when chain has >1 versions per Backend
// Reconciliation §matrix decision 4. Single $queryRaw aggregates in one DB
// trip; Prisma's relation count would issue N+1 since we don't have an
// `ancestors`/`descendants` self-relation modeled.
router.get('/my', authenticate, async (req, res, next) => {
    try {
        const walletAddress = normalizeAddress(req.user.walletAddress);
        const records = await prisma.recordMetadata.findMany({
            where: {
                syncStatus: RECORD_SYNC_STATUS.CONFIRMED,
                OR: [
                    { ownerAddress: walletAddress },
                    { createdBy: walletAddress },
                ],
            },
            orderBy: { createdAt: 'desc' },
        });

        // Compute versionCount per record via recursive CTE walking UP the
        // parentCidHash chain to root. mobile useRecords already filters list
        // to leaf records (those with no children pointing at them), so each
        // record IS a chain leaf — the depth from leaf back to root tells us
        // total versions in the chain. Single roundtrip vs N+1.
        if (records.length === 0) {
            return res.json(records);
        }

        const cidHashes = records.map((r) => r.cidHash);
        const counts = await prisma.$queryRaw`
            WITH RECURSIVE chain AS (
                SELECT
                    "cidHash" AS leaf,
                    "cidHash" AS current,
                    "parentCidHash",
                    1 AS depth
                FROM "RecordMetadata"
                WHERE "cidHash" = ANY(${cidHashes}::text[])
                  AND "syncStatus" = ${RECORD_SYNC_STATUS.CONFIRMED}

                UNION ALL

                SELECT
                    c.leaf,
                    r."cidHash",
                    r."parentCidHash",
                    c.depth + 1
                FROM chain c
                INNER JOIN "RecordMetadata" r ON c."parentCidHash" = r."cidHash"
                WHERE r."syncStatus" = ${RECORD_SYNC_STATUS.CONFIRMED}
                  AND c.depth < 50
            )
            SELECT leaf, MAX(depth)::int AS "versionCount"
            FROM chain
            GROUP BY leaf
        `;
        const versionByLeaf = new Map(
            (counts || []).map((row) => [String(row.leaf).toLowerCase(), Number(row.versionCount) || 1])
        );

        const augmented = records.map((r) => ({
            ...r,
            versionCount: versionByLeaf.get(String(r.cidHash).toLowerCase()) || 1,
        }));

        res.json(augmented);
    } catch (error) {
        next(error);
    }
});

// GET /api/records/delegated/:patientAddress
// Returns the given patient's records, but only if the caller currently holds
// an active delegation from that patient. Used by the doctor UI to pick which
// record to share with another doctor via grantUsingDelegation.
router.get('/delegated/:patientAddress', authenticate, async (req, res, next) => {
    try {
        const patientAddress = normalizeAddress(req.params.patientAddress);
        const delegateeAddress = normalizeAddress(req.user.walletAddress);

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

        if (!isActive) {
            return res.status(403).json({
                code: 'NO_ACTIVE_DELEGATION',
                error: 'Bạn không có uỷ quyền hoạt động từ bệnh nhân này.',
            });
        }

        const records = await prisma.recordMetadata.findMany({
            where: {
                syncStatus: RECORD_SYNC_STATUS.CONFIRMED,
                ownerAddress: patientAddress,
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            delegation: {
                ...delegation,
                epoch: delegation.epoch != null ? delegation.epoch.toString() : null,
                grantBlockNumber: delegation.grantBlockNumber != null ? delegation.grantBlockNumber.toString() : null,
            },
            records,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/records/chain/:cidHash - Get record chain (parent, children, siblings)
router.get('/chain/:cidHash', authenticate, async (req, res, next) => {
    try {
        const cidHash = normalizeHash(req.params.cidHash);
        const record = await findConfirmedRecordByCidHash(cidHash);

        if (!record) {
            return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Record not found', message: 'Record not found' });
        }

        // Collapse legacy zero-hash parentCidHash to null so version walks +
        // parent lookups don't loop through a non-existent phantom root.
        if (record.parentCidHash === ZERO_HASH) {
            record.parentCidHash = null;
        }

        let parent = null;
        if (record.parentCidHash) {
            parent = await findConfirmedRecordByCidHash(record.parentCidHash);
        }

        const children = await prisma.recordMetadata.findMany({
            where: buildConfirmedRecordWhere({ parentCidHash: cidHash }),
            orderBy: { createdAt: 'asc' },
        });

        let siblings = [];
        if (record.parentCidHash) {
            siblings = await prisma.recordMetadata.findMany({
                where: buildConfirmedRecordWhere({
                    parentCidHash: record.parentCidHash,
                    NOT: { cidHash },
                }),
                orderBy: { createdAt: 'asc' },
            });
        }

        let version = 1;
        let currentParent = record.parentCidHash;
        while (currentParent && currentParent !== ZERO_HASH) {
            version += 1;
            const parentRecord = await findConfirmedRecordByCidHash(currentParent, {
                select: { parentCidHash: true },
            });
            const nextParent = parentRecord?.parentCidHash || null;
            currentParent = (nextParent === ZERO_HASH) ? null : nextParent;
        }

        res.json({
            current: record,
            parent,
            children,
            siblings,
            version,
            childCount: children.length,
            hasParent: !!parent,
            hasChildren: children.length > 0,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/records/chain-cids/:cidHash - Get ALL cidHashes in a chain (for chain-wide sharing)
//
// Audit P1 (2026-05-26) — gate: caller PHẢI là owner of root record OR có
// active KeyShare cho cidHash. Trước: bất kỳ user authenticated nào enumerate
// được chain topology + metadata → leak. KeyShare existence proof có quyền
// (lighter than on-chain canAccess; KeyShare đã được gate khi grant).
router.get('/chain-cids/:cidHash', authenticate, async (req, res, next) => {
    try {
        const startCidHash = normalizeHash(req.params.cidHash);
        const callerAddress = normalizeAddress(req.user.walletAddress);

        const currentRecord = await findConfirmedRecordByCidHash(startCidHash, {
            select: { cidHash: true, parentCidHash: true, ownerAddress: true },
        });

        if (!currentRecord) {
            return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Record not found', message: 'Record not found' });
        }

        const isOwner = normalizeAddress(currentRecord.ownerAddress) === callerAddress;
        if (!isOwner) {
            const activeShare = await prisma.keyShare.findFirst({
                where: {
                    cidHash: startCidHash,
                    recipientAddress: callerAddress,
                    status: { in: ['pending', 'claimed'] },
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
                select: { id: true },
            });
            if (!activeShare) {
                return res.status(403).json({
                    code: 'ONCHAIN_ROLE_FORBIDDEN',
                    error: 'Bạn không có quyền truy cập chuỗi hồ sơ này',
                    message: 'Bạn không có quyền truy cập chuỗi hồ sơ này',
                });
            }
        }

        const allCids = new Set();

        const findRoot = async (cidHash) => {
            let current = cidHash;
            const ancestors = [];

            while (current) {
                ancestors.push(current);
                allCids.add(current);
                const record = await findConfirmedRecordByCidHash(current, {
                    select: { parentCidHash: true },
                });
                // Treat zero-hash parentCidHash as no-parent (legacy data).
                const nextParent = record?.parentCidHash || null;
                current = (nextParent === ZERO_HASH) ? null : nextParent;
            }

            return ancestors[ancestors.length - 1];
        };

        const findAllChildren = async (cidHash) => {
            allCids.add(cidHash);
            const children = await prisma.recordMetadata.findMany({
                where: buildConfirmedRecordWhere({ parentCidHash: cidHash }),
                select: { cidHash: true },
            });

            for (const child of children) {
                await findAllChildren(child.cidHash);
            }
        };

        const rootCid = await findRoot(startCidHash);
        await findAllChildren(rootCid);

        const records = await prisma.recordMetadata.findMany({
            where: buildConfirmedRecordWhere({ cidHash: { in: Array.from(allCids) } }),
            orderBy: { createdAt: 'asc' },
        });

        res.json({
            rootCidHash: rootCid,
            chainCids: Array.from(allCids),
            records,
            count: allCids.size,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/records/:cidHash - Get single record metadata
router.get('/:cidHash', authenticate, async (req, res, next) => {
    try {
        const cidHash = normalizeHash(req.params.cidHash);
        const callerAddress = normalizeAddress(req.user.walletAddress);
        const record = await findConfirmedRecordByCidHash(cidHash);

        if (!record) {
            return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Record not found', message: 'Record not found' });
        }

        await prisma.accessLog.create({
            data: {
                cidHash,
                accessorAddress: callerAddress,
                action: 'VIEW_METADATA',
                consentVerified: normalizeAddress(record.ownerAddress) === callerAddress,
            },
        });

        res.json(record);
    } catch (error) {
        next(error);
    }
});

// GET /api/records/:cidHash/meta — Lightweight, no-AccessLog metadata.
// Used by mobile RecordChip when rendering long lists. Same record can be
// chip-rendered dozens of times per screen (each share, each access log
// entry, each request); going through GET /:cidHash would emit a
// VIEW_METADATA AccessLog row for every chip render and pollute the audit
// trail. This endpoint returns ONLY display-safe fields and skips the log.
router.get('/:cidHash/meta', authenticate, async (req, res, next) => {
    try {
        const cidHash = normalizeHash(req.params.cidHash);
        const record = await prisma.recordMetadata.findUnique({
            where: { cidHash },
            select: {
                cidHash: true,
                parentCidHash: true,
                title: true,
                description: true,
                recordType: true,
                versionNote: true,
                ownerAddress: true,
                createdBy: true,
                createdAt: true,
            },
        });

        if (!record) {
            return res.status(404).json({ code: 'RECORD_NOT_FOUND' });
        }

        res.json(record);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/records/:cidHash/access/:address - Revoke someone's access to a record
router.delete('/:cidHash/access/:address', authenticate, async (req, res, next) => {
    try {
        const cidHash = normalizeHash(req.params.cidHash);
        const targetAddress = normalizeAddress(req.params.address);
        const callerAddress = normalizeAddress(req.user.walletAddress);

        const record = await findConfirmedRecordByCidHash(cidHash);
        if (!record) {
            return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Record not found', message: 'Record not found' });
        }

        if (normalizeAddress(record.ownerAddress) !== callerAddress) {
            return res.status(403).json({ code: 'ONCHAIN_ROLE_FORBIDDEN', error: 'Only record owner can revoke access', message: 'Only record owner can revoke access' });
        }

        let currentCid = cidHash;
        let rootCid = cidHash;
        for (let i = 0; i < 20; i += 1) {
            const currentRecord = await findConfirmedRecordByCidHash(currentCid, {
                select: { parentCidHash: true },
            });

            if (!currentRecord?.parentCidHash) {
                rootCid = currentCid;
                break;
            }

            currentCid = currentRecord.parentCidHash;
        }

        const allCids = [rootCid];
        const queue = [rootCid];
        while (queue.length > 0) {
            const parent = queue.shift();
            const children = await prisma.recordMetadata.findMany({
                where: buildConfirmedRecordWhere({ parentCidHash: parent }),
                select: { cidHash: true },
            });

            for (const child of children) {
                allCids.push(child.cidHash);
                queue.push(child.cidHash);
            }
        }

        log.info('Revoke chain cleanup', { chainSize: allCids.length, rootCid, target: targetAddress });

        const keyShares = await prisma.keyShare.findMany({
            where: {
                cidHash: { in: allCids },
                recipientAddress: targetAddress,
            },
        });

        if (keyShares.length === 0) {
            return res.status(404).json({ code: 'CONSENT_NOT_FOUND', error: 'Access grant not found for this address', message: 'Access grant not found for this address' });
        }

        let txResult = null;
        try {
            txResult = await relayerService.sponsorRevoke(callerAddress, targetAddress, rootCid);
        } catch (txError) {
            // Quota exhausted → signal the client to self-pay. consumeQuota throws
            // code QUOTA_EXHAUSTED (statusCode 429); older paths used the literal
            // 'QUOTA_EXHAUSTED_USE_OWN_WALLET' message. Match BOTH and surface a
            // clean 402 + code so the mobile self-pay fallback can catch it.
            if (txError.code === 'QUOTA_EXHAUSTED' || txError.message === 'QUOTA_EXHAUSTED_USE_OWN_WALLET') {
                return res.status(402).json({
                    code: 'QUOTA_EXHAUSTED',
                    error: 'Quota exhausted',
                    message: 'Đã hết 100 lượt miễn phí tháng này. Giao dịch thu hồi sẽ tự trả phí từ ví của bạn.',
                    requiresOwnWallet: true,
                });
            }

            const noConsentErrors = ['0x82b42900', 'Unauthorized', 'ConsentNotFound', 'execution reverted', 'NoActiveDelegation'];
            const isNoConsentError = noConsentErrors.some(code => txError.message?.includes(code));

            if (!isNoConsentError) {
                log.error('On-chain revoke failed', { error: txError.message, cidHash, target: targetAddress });
                return res.status(500).json({
                    error: 'On-chain revoke failed',
                    message: txError.message,
                });
            }
        }

        // Group revokes by sender so applyRevoke can apply the timestamp guard
        // per-row. Multiple senders are possible (patient + doctors who re-shared
        // earlier); revoking all of them is intentional — patient is killing
        // every access path to `targetAddress` for this chain.
        const bySender = new Map();
        for (const ks of keyShares) {
            const key = ks.senderAddress.toLowerCase();
            if (!bySender.has(key)) bySender.set(key, []);
            bySender.get(key).push(ks.cidHash.toLowerCase());
        }
        const revokeTimestamp = new Date();
        for (const [senderAddr, cids] of bySender) {
            await applyRevoke({
                senderAddress: senderAddr,
                recipientAddress: targetAddress,
                cidHashes: cids,
                source: 'revoke-endpoint',
                sourceTimestamp: revokeTimestamp,
            });
        }
        // Note: applyRevoke clears encryptedPayload and sets status='revoked'
        // but does NOT touch expiresAt. The original code set expiresAt=now()
        // as a defensive marker; removed because status='revoked' is the
        // primary signal and KeyShare reads filter on it.

        await prisma.accessLog.create({
            data: {
                cidHash,
                accessorAddress: callerAddress,
                action: 'REVOKE_ACCESS',
                consentVerified: true,
            },
        });

        emitToUser(targetAddress, 'access_revoked', {
            cidHash,
            revokedBy: callerAddress,
        });

        res.json({
            success: true,
            message: 'Access revoked on-chain',
            revokedAddress: targetAddress,
            cidHash,
            txHash: txResult?.txHash,
        });
    } catch (error) {
        log.error('Revoke error', { error: error.message, cidHash: normalizeHash(req.params.cidHash) });
        next(error);
    }
});

// GET /api/records/:cidHash/access - Get list of who has access to a record
router.get('/:cidHash/access', authenticate, async (req, res, next) => {
    try {
        const cidHash = normalizeHash(req.params.cidHash);
        const callerAddress = normalizeAddress(req.user.walletAddress);

        const record = await findConfirmedRecordByCidHash(cidHash);
        if (!record) {
            return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Record not found', message: 'Record not found' });
        }

        if (normalizeAddress(record.ownerAddress) !== callerAddress) {
            return res.status(403).json({ code: 'ONCHAIN_ROLE_FORBIDDEN', error: 'Only record owner can view access list', message: 'Only record owner can view access list' });
        }

        const keyShares = await prisma.keyShare.findMany({
            where: { cidHash },
            select: {
                recipientAddress: true,
                senderAddress: true,
                status: true,
                createdAt: true,
                expiresAt: true,
            },
        });

        res.json({
            cidHash,
            accessList: keyShares.map(keyShare => ({
                address: keyShare.recipientAddress,
                grantedBy: keyShare.senderAddress,
                status: keyShare.status,
                grantedAt: keyShare.createdAt,
                expiresAt: keyShare.expiresAt,
            })),
        });
    } catch (error) {
        next(error);
    }
});

export default router;



