// RecordRegistry Event Sync Worker - keeps DB record cache aligned with on-chain state.
// Blockchain remains the source of truth for ownership and lineage.

import { createPublicClient, http, parseAbi, parseAbiItem } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import prisma from '../config/database.js';
import { emitToUser, getIO } from './socket.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('RecordSync');

const RECORD_REGISTRY_ADDRESS = process.env.RECORD_REGISTRY_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const CATCHUP_INTERVAL_MS = 5 * 60 * 1000;
const REORG_SAFETY_BLOCKS = 5;
const CONTRACT_NAME = 'RecordRegistry';
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

const EVENTS = {
    RecordAdded: parseAbiItem(
        'event RecordAdded(address indexed owner, bytes32 indexed cidHash, bytes32 parentCidHash, bytes32 recordTypeHash, uint40 timestamp)'
    ),
    RecordUpdated: parseAbiItem(
        'event RecordUpdated(bytes32 indexed oldCidHash, bytes32 indexed newCidHash, address indexed owner)'
    ),
    OwnershipTransferred: parseAbiItem(
        'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner, bytes32 indexed cidHash)'
    ),
};

const RECORD_REGISTRY_READ_ABI = parseAbi([
    'function getRecord(bytes32 cidHash) view returns ((bytes32 cidHash, bytes32 parentCidHash, address createdBy, address owner, bytes32 recordTypeHash, uint40 createdAt, uint8 version, bool exists))',
]);

let publicClient;
let catchupInterval = null;
let unwatchFunctions = [];

function getPublicClient() {
    if (!publicClient) {
        publicClient = createPublicClient({
            chain: arbitrumSepolia,
            transport: http(RPC_URL),
        });
    }
    return publicClient;
}

function normalizeAddress(value) {
    return typeof value === 'string' ? value.toLowerCase() : null;
}

function normalizeHash(value) {
    if (typeof value !== 'string') {
        return null;
    }

    return /^0x[a-fA-F0-9]{64}$/.test(value) ? value.toLowerCase() : null;
}

function toOptionalHash(value) {
    const normalized = normalizeHash(value);
    return normalized && normalized !== ZERO_HASH ? normalized : null;
}

function toDateFromUnix(value) {
    if (value === undefined || value === null) {
        return null;
    }

    try {
        const seconds = typeof value === 'bigint' ? Number(value) : Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) {
            return null;
        }
        return new Date(seconds * 1000);
    } catch {
        return null;
    }
}

async function ensureUserRecord(walletAddress) {
    if (!walletAddress) {
        return null;
    }

    return prisma.user.upsert({
        where: { walletAddress },
        update: {},
        create: { walletAddress },
    });
}

function isUniqueConflict(error) {
    return error?.code === 'P2002';
}

async function getSyncState() {
    const existing = await prisma.eventSyncState.findUnique({
        where: { contractName: CONTRACT_NAME },
    });

    if (existing) {
        return existing;
    }

    const client = getPublicClient();
    const currentBlock = await client.getBlockNumber();
    const startBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;

    // contractName is @unique, id is @default(cuid()) — each contract gets a unique row.
    return prisma.eventSyncState.upsert({
        where: { contractName: CONTRACT_NAME },
        update: {},
        create: {
            contractName: CONTRACT_NAME,
            lastSyncedBlock: startBlock,
        },
    });
}

async function updateSyncState(blockNumber, blockHash) {
    await prisma.eventSyncState.upsert({
        where: { contractName: CONTRACT_NAME },
        update: {
            lastSyncedBlock: blockNumber,
            lastBlockHash: blockHash,
        },
        create: {
            contractName: CONTRACT_NAME,
            lastSyncedBlock: blockNumber,
            lastBlockHash: blockHash,
        },
    });
}

async function readRecordFromChain(cidHash) {
    if (!RECORD_REGISTRY_ADDRESS || !cidHash) {
        return null;
    }

    try {
        const client = getPublicClient();
        const record = await client.readContract({
            address: RECORD_REGISTRY_ADDRESS,
            abi: RECORD_REGISTRY_READ_ABI,
            functionName: 'getRecord',
            args: [cidHash],
        });

        if (!record?.exists) {
            return null;
        }

        return {
            cidHash: normalizeHash(record.cidHash) ?? cidHash,
            parentCidHash: toOptionalHash(record.parentCidHash),
            createdBy: normalizeAddress(record.createdBy),
            owner: normalizeAddress(record.owner),
            recordTypeHash: toOptionalHash(record.recordTypeHash),
            createdAt: toDateFromUnix(record.createdAt),
        };
    } catch (error) {
        if (
            error?.shortMessage?.includes('reverted')
            || error?.message?.includes('RecordNotExist')
            || error?.message?.includes('execution reverted')
        ) {
            return null;
        }

        throw error;
    }
}

async function hydrateRecordFromChain(cidHash, options = {}, visited = new Set()) {
    const normalizedCidHash = normalizeHash(cidHash);
    if (!normalizedCidHash) {
        return null;
    }

    if (visited.has(normalizedCidHash)) {
        return prisma.recordMetadata.findUnique({
            where: { cidHash: normalizedCidHash },
        });
    }
    visited.add(normalizedCidHash);

    const existing = await prisma.recordMetadata.findUnique({
        where: { cidHash: normalizedCidHash },
    });
    const onChainRecord = await readRecordFromChain(normalizedCidHash);

    const ownerAddress = onChainRecord?.owner
        ?? normalizeAddress(options.fallbackOwner)
        ?? existing?.ownerAddress
        ?? null;
    const createdBy = onChainRecord?.createdBy
        ?? normalizeAddress(options.fallbackCreatedBy)
        ?? existing?.createdBy
        ?? ownerAddress;

    if (!ownerAddress || !createdBy) {
        return existing;
    }

    const parentCidHash = onChainRecord?.parentCidHash
        ?? toOptionalHash(options.fallbackParentCidHash)
        ?? existing?.parentCidHash
        ?? null;
    const recordTypeHash = onChainRecord?.recordTypeHash
        ?? toOptionalHash(options.fallbackRecordTypeHash)
        ?? existing?.recordTypeHash
        ?? null;
    const chainCreatedAt = onChainRecord?.createdAt
        ?? toDateFromUnix(options.fallbackTimestamp)
        ?? existing?.confirmedAt
        ?? existing?.submittedAt
        ?? null;
    const submittedAt = existing?.submittedAt ?? chainCreatedAt ?? new Date();
    const confirmedAt = existing?.confirmedAt ?? chainCreatedAt ?? new Date();
    const txHash = normalizeHash(options.txHash) ?? existing?.txHash ?? null;

    await ensureUserRecord(ownerAddress);
    await ensureUserRecord(createdBy);

    if (parentCidHash && parentCidHash !== normalizedCidHash) {
        try {
            await hydrateRecordFromChain(parentCidHash, {}, visited);
        } catch (error) {
            log.warn('Could not hydrate parent', { parentCidHash, error: error.message });
        }
    }

    const mergedTitle = existing?.title ?? options.title ?? null;
    const mergedDescription = existing?.description ?? options.description ?? null;
    const mergedRecordType = existing?.recordType ?? options.recordType ?? null;

    if (existing) {
        return prisma.recordMetadata.update({
            where: { id: existing.id },
            data: {
                ownerAddress,
                createdBy,
                parentCidHash,
                recordTypeHash,
                title: mergedTitle,
                description: mergedDescription,
                recordType: mergedRecordType,
                syncStatus: 'confirmed',
                txHash,
                submittedAt,
                confirmedAt,
                failedAt: null,
                syncError: null,
            },
        });
    }

    return prisma.recordMetadata.create({
        data: {
            cidHash: normalizedCidHash,
            ownerAddress,
            createdBy,
            parentCidHash,
            recordTypeHash,
            title: mergedTitle,
            description: mergedDescription,
            recordType: mergedRecordType,
            syncStatus: 'confirmed',
            txHash,
            submittedAt,
            confirmedAt,
            createdAt: chainCreatedAt ?? new Date(),
        },
    });
}

async function handleRecordAdded(log) {
    const ownerAddress = normalizeAddress(log.args.owner);
    const cidHash = normalizeHash(log.args.cidHash);
    const parentCidHash = toOptionalHash(log.args.parentCidHash);
    const recordTypeHash = toOptionalHash(log.args.recordTypeHash);

    if (!ownerAddress || !cidHash) {
        return;
    }

    const record = await hydrateRecordFromChain(cidHash, {
        fallbackOwner: ownerAddress,
        fallbackParentCidHash: parentCidHash,
        fallbackRecordTypeHash: recordTypeHash,
        fallbackTimestamp: log.args.timestamp,
        txHash: log.transactionHash,
    });

    if (!record) {
        return;
    }

    log.info('RecordAdded', { cidHash, owner: ownerAddress });

    emitToUser(ownerAddress, 'recordSynced', {
        action: 'added',
        cidHash: record.cidHash,
        ownerAddress: record.ownerAddress,
        parentCidHash: record.parentCidHash,
        txHash: record.txHash,
    });

    const io = getIO();
    if (io) {
        io.emit('recordSyncUpdated', {
            action: 'added',
            cidHash: record.cidHash,
            ownerAddress: record.ownerAddress,
        });
    }
}

async function handleRecordUpdated(log) {
    const oldCidHash = normalizeHash(log.args.oldCidHash);
    const newCidHash = normalizeHash(log.args.newCidHash);
    const ownerAddress = normalizeAddress(log.args.owner);

    if (!oldCidHash || !newCidHash || !ownerAddress) {
        return;
    }

    const previousRecord = await prisma.recordMetadata.findUnique({
        where: { cidHash: oldCidHash },
    });

    const nextRecord = await hydrateRecordFromChain(newCidHash, {
        fallbackOwner: ownerAddress,
        fallbackParentCidHash: previousRecord?.parentCidHash,
        fallbackRecordTypeHash: previousRecord?.recordTypeHash,
        txHash: log.transactionHash,
        title: previousRecord?.title,
        description: previousRecord?.description,
        recordType: previousRecord?.recordType,
    });

    if (previousRecord) {
        await prisma.recordMetadata.update({
            where: { id: previousRecord.id },
            data: {
                syncStatus: 'replaced',
                txHash: normalizeHash(log.transactionHash) ?? previousRecord.txHash,
                failedAt: null,
                syncError: null,
            },
        });
    }

    log.info('RecordUpdated', { oldCidHash, newCidHash });

    emitToUser(ownerAddress, 'recordSynced', {
        action: 'updated',
        oldCidHash,
        cidHash: nextRecord?.cidHash ?? newCidHash,
        ownerAddress,
        txHash: normalizeHash(log.transactionHash),
    });

    const io = getIO();
    if (io) {
        io.emit('recordSyncUpdated', {
            action: 'updated',
            oldCidHash,
            cidHash: nextRecord?.cidHash ?? newCidHash,
            ownerAddress,
        });
    }
}

async function handleOwnershipTransferred(log) {
    const previousOwner = normalizeAddress(log.args.previousOwner);
    const newOwner = normalizeAddress(log.args.newOwner);
    const cidHash = normalizeHash(log.args.cidHash);

    if (!newOwner || !cidHash) {
        return;
    }

    await ensureUserRecord(newOwner);

    const existing = await prisma.recordMetadata.findUnique({
        where: { cidHash },
    });

    if (existing) {
        await prisma.recordMetadata.update({
            where: { id: existing.id },
            data: {
                ownerAddress: newOwner,
                syncStatus: 'confirmed',
                txHash: normalizeHash(log.transactionHash) ?? existing.txHash,
                submittedAt: existing.submittedAt ?? existing.confirmedAt ?? new Date(),
                confirmedAt: existing.confirmedAt ?? new Date(),
                failedAt: null,
                syncError: null,
            },
        });
    } else {
        await hydrateRecordFromChain(cidHash, {
            fallbackOwner: newOwner,
            txHash: log.transactionHash,
        });
    }

    log.info('OwnershipTransferred', { cidHash, previousOwner, newOwner });

    if (previousOwner) {
        emitToUser(previousOwner, 'recordOwnershipTransferred', {
            action: 'sent',
            cidHash,
            previousOwner,
            newOwner,
        });
    }
    emitToUser(newOwner, 'recordOwnershipTransferred', {
        action: 'received',
        cidHash,
        previousOwner,
        newOwner,
    });
}

const EVENT_HANDLERS = {
    RecordAdded: handleRecordAdded,
    RecordUpdated: handleRecordUpdated,
    OwnershipTransferred: handleOwnershipTransferred,
};

async function processLog(eventName, log) {
    try {
        const handler = EVENT_HANDLERS[eventName];
        if (handler) {
            await handler(log);
        }
    } catch (error) {
        log.error(`Error processing ${eventName}`, { error: error.message });
    }
}

async function catchupLogs() {
    if (!RECORD_REGISTRY_ADDRESS) {
        log.warn('RECORD_REGISTRY_ADDRESS not set, skipping catchup');
        return;
    }

    try {
        const client = getPublicClient();
        const syncState = await getSyncState();
        const currentBlock = await client.getBlockNumber();
        const safeBlock = currentBlock - BigInt(REORG_SAFETY_BLOCKS);
        const fromBlock = syncState.lastSyncedBlock + 1n;

        if (fromBlock > safeBlock) {
            return;
        }

        log.info('Catching up', { fromBlock, toBlock: safeBlock });

        if (syncState.lastBlockHash && syncState.lastSyncedBlock > 0n) {
            try {
                const lastBlock = await client.getBlock({
                    blockNumber: syncState.lastSyncedBlock,
                });

                if (lastBlock.hash !== syncState.lastBlockHash) {
                    log.warn('Reorg detected, reprocessing', { block: syncState.lastSyncedBlock });
                    const rollbackBlock = syncState.lastSyncedBlock > 50n
                        ? syncState.lastSyncedBlock - 50n
                        : 0n;
                    await updateSyncState(rollbackBlock, null);
                    return catchupLogs();
                }
            } catch (error) {
                log.warn('Could not verify block hash', { error: error.message });
            }
        }

        const CHUNK_SIZE = 10000n;
        let chunkFrom = fromBlock;

        while (chunkFrom <= safeBlock) {
            const chunkTo = chunkFrom + CHUNK_SIZE - 1n > safeBlock ? safeBlock : chunkFrom + CHUNK_SIZE - 1n;

            for (const [eventName, eventAbi] of Object.entries(EVENTS)) {
                try {
                    const logs = await client.getLogs({
                        address: RECORD_REGISTRY_ADDRESS,
                        event: eventAbi,
                        fromBlock: chunkFrom,
                        toBlock: chunkTo,
                    });

                    for (const log of logs) {
                        await processLog(eventName, log);
                    }
                } catch (error) {
                    log.error(`Error fetching ${eventName} logs`, { error: error.message });
                }
            }

            try {
                const block = await client.getBlock({ blockNumber: chunkTo });
                await updateSyncState(chunkTo, block.hash);
            } catch {
                await updateSyncState(chunkTo, null);
            }

            chunkFrom = chunkTo + 1n;
        }

        log.info('Catchup complete', { syncedToBlock: safeBlock });
    } catch (error) {
        log.error('Catchup error', { error: error.message });
    }
}

function startRealtimeWatch() {
    if (!RECORD_REGISTRY_ADDRESS) {
        log.warn('RECORD_REGISTRY_ADDRESS not set, skipping realtime watch');
        return;
    }

    const client = getPublicClient();

    for (const [eventName, eventAbi] of Object.entries(EVENTS)) {
        try {
            const unwatch = client.watchContractEvent({
                address: RECORD_REGISTRY_ADDRESS,
                abi: [eventAbi],
                onLogs: async (logs) => {
                    for (const logEntry of logs) {
                        log.info(`Realtime ${eventName}`, { blockNumber: logEntry.blockNumber });
                        await processLog(eventName, logEntry);
                    }
                },
                onError: (error) => {
                    log.error(`Watch error for ${eventName}`, { error: error.message });
                },
            });

            unwatchFunctions.push(unwatch);
        } catch (error) {
            log.error(`Failed to watch ${eventName}`, { error: error.message });
        }
    }

    log.info('Realtime watching started', { eventCount: Object.keys(EVENTS).length, contract: RECORD_REGISTRY_ADDRESS });
}

export function startRecordRegistrySync() {
    if (!RECORD_REGISTRY_ADDRESS) {
        log.warn('RECORD_REGISTRY_ADDRESS not set - record sync disabled');
        log.warn('Set RECORD_REGISTRY_ADDRESS=0x... in .env to enable');
        return;
    }

    log.info('Starting record registry sync worker');
    log.info('Contract', { address: RECORD_REGISTRY_ADDRESS });
    log.info('RPC', { url: RPC_URL });

    catchupLogs().then(() => {
        log.info('Initial catchup done');
    });

    startRealtimeWatch();
    catchupInterval = setInterval(catchupLogs, CATCHUP_INTERVAL_MS);
}

export function stopRecordRegistrySync() {
    log.info('Stopping record registry sync worker');

    for (const unwatch of unwatchFunctions) {
        try {
            unwatch();
        } catch {
            // Ignore shutdown noise.
        }
    }
    unwatchFunctions = [];

    if (catchupInterval) {
        clearInterval(catchupInterval);
        catchupInterval = null;
    }
}

export default {
    startRecordRegistrySync,
    stopRecordRegistrySync,
};


