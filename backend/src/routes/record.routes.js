import { Router } from 'express';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import relayerService from '../services/relayer.service.js';
import { emitToUser } from '../services/socket.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('RecordRoutes');

const router = Router();

const RECORD_SYNC_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    FAILED: 'failed',
};

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
const MAX_CHILDREN = 100;

function normalizeAddress(value) {
    return typeof value === 'string' ? value.toLowerCase() : null;
}

function normalizeHash(value) {
    return typeof value === 'string' ? value.toLowerCase() : null;
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
});

const saveOnlySchema = z.object({
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    recordTypeHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    ownerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    encryptedPayload: z.string().optional().nullable(),
    senderPublicKey: z.string().optional().nullable(),
    title: z.string().max(255).optional().nullable(),
    description: z.string().optional().nullable(),
    recordType: z.string().max(50).optional().nullable(),
    parentCidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
});

// POST /api/records - Upload record with quota check and on-chain registration
router.post('/', authenticate, async (req, res, next) => {
    try {
        const { cidHash, recordTypeHash, parentCidHash, title, description, recordType } = createRecordSchema.parse(req.body);
        const walletAddress = normalizeAddress(req.user.walletAddress);
        const normalizedCidHash = normalizeHash(cidHash);
        const normalizedParentCidHash = normalizeHash(parentCidHash);
        const normalizedRecordTypeHash = normalizeHash(recordTypeHash);

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

        if (normalizedParentCidHash) {
            const parentRecord = await findConfirmedRecordByCidHash(normalizedParentCidHash);

            if (!parentRecord) {
                return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Parent record not found', message: 'Parent record not found' });
            }

            const childCount = await prisma.recordMetadata.count({
                where: buildConfirmedRecordWhere({ parentCidHash: normalizedParentCidHash }),
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
                    cidHash: normalizedParentCidHash,
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
        if (!quota.hasSelfWallet && quota.uploadsRemaining <= 0) {
            return res.status(429).json({
                error: 'Monthly sponsored upload quota exhausted. Please connect a wallet with ETH to continue.',
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
                    parentCidHash: normalizedParentCidHash,
                    title: title || null,
                    description: description || null,
                    recordType: recordType || null,
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
                    parentCidHash: normalizedParentCidHash,
                    title: title || null,
                    description: description || null,
                    recordType: recordType || null,
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
                normalizedParentCidHash || ZERO_HASH,
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
            parentCidHash,
            txHash,
        } = saveOnlySchema.parse(req.body);

        const creatorAddress = normalizeAddress(req.user.walletAddress);
        const patientAddress = normalizeAddress(ownerAddress);
        const normalizedCidHash = normalizeHash(cidHash);
        const normalizedParentCidHash = normalizeHash(parentCidHash);
        const normalizedRecordTypeHash = normalizeHash(recordTypeHash);
        const normalizedTxHash = normalizeHash(txHash);
        const confirmedAt = new Date();
        let record;

        const existing = await prisma.recordMetadata.findUnique({
            where: { cidHash: normalizedCidHash },
        });

        if (existing) {
            const isMissingParent = !existing.parentCidHash || existing.parentCidHash === ZERO_HASH;
            const hasNewParent = normalizedParentCidHash && normalizedParentCidHash !== ZERO_HASH;
            const shouldPatchParent = isMissingParent && hasNewParent;
            const shouldMarkConfirmed = existing.syncStatus !== RECORD_SYNC_STATUS.CONFIRMED || !existing.confirmedAt || !!existing.syncError;

            if (shouldPatchParent || shouldMarkConfirmed) {
                record = await prisma.recordMetadata.update({
                    where: { id: existing.id },
                    data: {
                        ownerAddress: patientAddress,
                        createdBy: creatorAddress,
                        recordTypeHash: normalizedRecordTypeHash,
                        title: title || existing.title || null,
                        description: description || existing.description || null,
                        recordType: recordType || existing.recordType || null,
                        parentCidHash: shouldPatchParent ? normalizedParentCidHash : existing.parentCidHash,
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
                    parentCidHash: normalizedParentCidHash,
                    syncStatus: RECORD_SYNC_STATUS.CONFIRMED,
                    txHash: normalizedTxHash,
                    submittedAt: confirmedAt,
                    confirmedAt,
                },
            });
        }

        if (encryptedPayload) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            await prisma.keyShare.upsert({
                where: {
                    cidHash_senderAddress_recipientAddress: {
                        cidHash: normalizedCidHash,
                        senderAddress: patientAddress,
                        recipientAddress: creatorAddress,
                    },
                },
                update: {
                    encryptedPayload,
                    status: 'claimed',
                },
                create: {
                    cidHash: normalizedCidHash,
                    senderAddress: patientAddress,
                    recipientAddress: creatorAddress,
                    encryptedPayload,
                    senderPublicKey: senderPublicKey || null,
                    status: 'claimed',
                    expiresAt,
                },
            });
        }

        await prisma.accessLog.create({
            data: {
                cidHash: normalizedCidHash,
                accessorAddress: creatorAddress,
                action: 'CREATE_RECORD_BY_DOCTOR',
                consentVerified: true,
            },
        });

        const patchedParent = !!existing && (!existing.parentCidHash || existing.parentCidHash === ZERO_HASH) && !!normalizedParentCidHash;

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

        res.json(records);
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
        while (currentParent) {
            version += 1;
            const parentRecord = await findConfirmedRecordByCidHash(currentParent, {
                select: { parentCidHash: true },
            });
            currentParent = parentRecord?.parentCidHash || null;
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
router.get('/chain-cids/:cidHash', authenticate, async (req, res, next) => {
    try {
        const startCidHash = normalizeHash(req.params.cidHash);
        const currentRecord = await findConfirmedRecordByCidHash(startCidHash, {
            select: { cidHash: true, parentCidHash: true },
        });

        if (!currentRecord) {
            return res.status(404).json({ code: 'RECORD_NOT_FOUND', error: 'Record not found', message: 'Record not found' });
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
                current = record?.parentCidHash || null;
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
            if (txError.message === 'QUOTA_EXHAUSTED_USE_OWN_WALLET') {
                return res.status(402).json({
                    error: 'Quota exhausted',
                    message: 'Please connect a wallet with ETH to continue revoking access.',
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

        await prisma.keyShare.updateMany({
            where: {
                id: { in: keyShares.map(keyShare => keyShare.id) },
            },
            data: {
                status: 'revoked',
                encryptedPayload: '',
                revokedAt: new Date(),
                expiresAt: new Date(),
            },
        });

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



