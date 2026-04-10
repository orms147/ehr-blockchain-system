// ConsentLedger Event Sync Worker — caches delegation + delegation-sourced
// consent events to the DB so mobile/frontend can list them without re-scanning
// chain state on every page load.
//
// IMPORTANT: The DB rows here are a CACHE. Authorization decisions still go
// through ConsentLedger.canAccess() (backend/src/config/blockchain.js) so they
// always observe the live on-chain CHAIN walk, including epoch-based cascade
// revokes and parent-chain invalidation.
//
// Events handled:
//   - DelegationGranted(patient, delegatee, expiresAt, allowSubDelegate)
//   - DelegationRevoked(patient, delegatee)
//   - AccessGrantedViaDelegation(patient, newGrantee, byDelegatee, rootCidHash)

import { createPublicClient, http, parseAbi, parseAbiItem } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import prisma from '../config/database.js';
import { emitToUser, getIO } from './socket.service.js';
import { sendPushToWallet } from './push.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ConsentSync');

const CONSENT_LEDGER_ADDRESS = process.env.CONSENT_LEDGER_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const CATCHUP_INTERVAL_MS = 5 * 60 * 1000;
const REORG_SAFETY_BLOCKS = 5;
const CONTRACT_NAME = 'ConsentLedger';

const EVENTS = {
    DelegationGranted: parseAbiItem(
        'event DelegationGranted(address indexed patient, address indexed delegatee, uint40 expiresAt, bool allowSubDelegate)'
    ),
    DelegationRevoked: parseAbiItem(
        'event DelegationRevoked(address indexed patient, address indexed delegatee)'
    ),
    AccessGrantedViaDelegation: parseAbiItem(
        'event AccessGrantedViaDelegation(address indexed patient, address indexed newGrantee, address indexed byDelegatee, bytes32 rootCidHash)'
    ),
};

// Small read ABI for the chain-walk queries we need when ingesting a
// DelegationGranted: we must know if this is a direct grant (chainDepth=1)
// or a sub-delegation (chainDepth>=2, parentDelegator != null).
const CONSENT_LEDGER_READ_ABI = parseAbi([
    'function delegationParent(address patient, address delegatee) view returns (address)',
    'function delegationEpoch(address patient, address delegatee) view returns (uint64)',
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
    if (typeof value !== 'string') return null;
    return /^0x[a-fA-F0-9]{64}$/.test(value) ? value.toLowerCase() : null;
}

async function ensureUserRecord(walletAddress) {
    if (!walletAddress) return null;
    return prisma.user.upsert({
        where: { walletAddress },
        update: {},
        create: { walletAddress },
    });
}

async function getSyncState() {
    const existing = await prisma.eventSyncState.findUnique({
        where: { contractName: CONTRACT_NAME },
    });

    if (existing) return existing;

    const client = getPublicClient();
    const currentBlock = await client.getBlockNumber();
    const startBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;

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

// Walk the delegation chain upward from `delegatee` to compute chainDepth and
// the immediate parentDelegator. Caps at 8 hops (matches ConsentLedger's
// MAX_DELEGATION_WALK) so a malicious chain can never stall the worker.
async function resolveChainPosition(patient, delegatee) {
    const client = getPublicClient();
    let parent = null;
    try {
        parent = await client.readContract({
            address: CONSENT_LEDGER_ADDRESS,
            abi: CONSENT_LEDGER_READ_ABI,
            functionName: 'delegationParent',
            args: [patient, delegatee],
        });
    } catch (err) {
        log.warn('delegationParent read failed', { patient, delegatee, error: err.message });
        return { parentDelegator: null, chainDepth: 1 };
    }

    const parentLower = normalizeAddress(parent);
    if (!parentLower || parentLower === '0x0000000000000000000000000000000000000000') {
        return { parentDelegator: null, chainDepth: 1 };
    }

    // Walk upward to count depth. We follow parent pointers until we hit the
    // patient (root) or reach the hop cap. Each hop is an O(1) read so this
    // stays cheap even for long chains.
    let depth = 2; // delegatee is at depth 2 (patient=0 -> parent=1 -> delegatee=2)
    let cursor = parentLower;
    for (let i = 0; i < 8; i++) {
        let grand = null;
        try {
            grand = await client.readContract({
                address: CONSENT_LEDGER_ADDRESS,
                abi: CONSENT_LEDGER_READ_ABI,
                functionName: 'delegationParent',
                args: [patient, cursor],
            });
        } catch {
            break;
        }
        const grandLower = normalizeAddress(grand);
        if (!grandLower || grandLower === '0x0000000000000000000000000000000000000000') {
            break;
        }
        cursor = grandLower;
        depth += 1;
    }

    return { parentDelegator: parentLower, chainDepth: depth };
}

async function handleDelegationGranted(event) {
    const patient = normalizeAddress(event.args.patient);
    const delegatee = normalizeAddress(event.args.delegatee);
    const expiresAtSec = event.args.expiresAt; // uint40 unix seconds
    const allowSubDelegate = Boolean(event.args.allowSubDelegate);

    if (!patient || !delegatee) return;

    await ensureUserRecord(patient);
    await ensureUserRecord(delegatee);

    const { parentDelegator, chainDepth } = await resolveChainPosition(patient, delegatee);

    // Read the fresh on-chain epoch so our row stays in sync with cascade revokes.
    let epoch = 0n;
    try {
        const client = getPublicClient();
        epoch = await client.readContract({
            address: CONSENT_LEDGER_ADDRESS,
            abi: CONSENT_LEDGER_READ_ABI,
            functionName: 'delegationEpoch',
            args: [patient, delegatee],
        });
    } catch (err) {
        log.warn('delegationEpoch read failed', { patient, delegatee, error: err.message });
    }

    const expiresAtDate = new Date(Number(expiresAtSec) * 1000);
    const txHash = normalizeHash(event.transactionHash);
    const blockNumber = event.blockNumber ?? null;

    await prisma.delegation.upsert({
        where: {
            patientAddress_delegateeAddress: {
                patientAddress: patient,
                delegateeAddress: delegatee,
            },
        },
        update: {
            parentDelegator,
            chainDepth,
            epoch: BigInt(epoch),
            allowSubDelegate,
            expiresAt: expiresAtDate,
            grantTxHash: txHash,
            grantBlockNumber: blockNumber,
            grantedAt: new Date(),
            status: 'active',
            revokedTxHash: null,
            revokedAt: null,
            revokedBy: null,
        },
        create: {
            patientAddress: patient,
            delegateeAddress: delegatee,
            parentDelegator,
            chainDepth,
            epoch: BigInt(epoch),
            allowSubDelegate,
            expiresAt: expiresAtDate,
            grantTxHash: txHash,
            grantBlockNumber: blockNumber,
            status: 'active',
        },
    });

    log.info('DelegationGranted', {
        patient,
        delegatee,
        chainDepth,
        parentDelegator,
        allowSubDelegate,
    });

    emitToUser(patient, 'delegationUpdated', {
        action: 'granted',
        patient,
        delegatee,
        chainDepth,
        parentDelegator,
    });
    emitToUser(delegatee, 'delegationUpdated', {
        action: 'received',
        patient,
        delegatee,
        chainDepth,
        parentDelegator,
    });
    if (parentDelegator) {
        emitToUser(parentDelegator, 'delegationUpdated', {
            action: 'sub_delegated',
            patient,
            delegatee,
            chainDepth,
        });
    }
}

// DelegationRevoked. Epoch has already been bumped on-chain (see
// ConsentLedger.revokeDelegation + revokeSubDelegation). We mirror the status
// flip plus cascade-mark any downstream sub-delegations whose cached
// parentEpochAtCreate no longer matches — these are functionally dead.
//
// Note: we can't tell from the event alone whether the patient or a parent did
// the revoke. The `revokedBy` audit field is filled in when we know (e.g. by
// comparing tx sender / delegator -> patient in a follow-up refactor).
async function handleDelegationRevoked(event) {
    const patient = normalizeAddress(event.args.patient);
    const delegatee = normalizeAddress(event.args.delegatee);
    if (!patient || !delegatee) return;

    const txHash = normalizeHash(event.transactionHash);

    // Mark the direct row revoked.
    try {
        await prisma.delegation.update({
            where: {
                patientAddress_delegateeAddress: {
                    patientAddress: patient,
                    delegateeAddress: delegatee,
                },
            },
            data: {
                status: 'revoked',
                revokedTxHash: txHash,
                revokedAt: new Date(),
            },
        });
    } catch (err) {
        // Row may not exist yet if catchup is out of order; not fatal.
        log.warn('Delegation revoke target missing', { patient, delegatee });
    }

    // Cascade: mark every delegation that has this delegatee as an ancestor
    // as revoked too. We do a simple BFS — for thesis scale (small trees) this
    // is fine. A future version could read on-chain epoch for each descendant
    // to confirm, but epoch mismatch already enforces the security property.
    const frontier = [delegatee];
    const visited = new Set(frontier);
    while (frontier.length > 0) {
        const current = frontier.shift();
        const children = await prisma.delegation.findMany({
            where: {
                patientAddress: patient,
                parentDelegator: current,
                status: 'active',
            },
            select: { delegateeAddress: true },
        });
        for (const child of children) {
            if (visited.has(child.delegateeAddress)) continue;
            visited.add(child.delegateeAddress);
            frontier.push(child.delegateeAddress);
            await prisma.delegation.update({
                where: {
                    patientAddress_delegateeAddress: {
                        patientAddress: patient,
                        delegateeAddress: child.delegateeAddress,
                    },
                },
                data: {
                    status: 'revoked',
                    revokedTxHash: txHash,
                    revokedAt: new Date(),
                    revokedBy: 'cascade',
                },
            });
            emitToUser(child.delegateeAddress, 'delegationUpdated', {
                action: 'cascade_revoked',
                patient,
                ancestor: delegatee,
            });
        }
    }

    log.info('DelegationRevoked', {
        patient,
        delegatee,
        cascadeCount: visited.size - 1,
    });

    emitToUser(patient, 'delegationUpdated', { action: 'revoked', patient, delegatee });
    emitToUser(delegatee, 'delegationUpdated', { action: 'revoked_me', patient, delegatee });

    // Push the delegatee so they know their authority is gone immediately,
    // even if the app isn't open. Cascade descendants get a separate emit but
    // we skip pushing them to avoid notification floods on long chains.
    sendPushToWallet(delegatee, {
        title: 'Quyền uỷ quyền đã bị thu hồi',
        body: `Bệnh nhân đã thu hồi quyền uỷ quyền truy cập hồ sơ.`,
        data: { kind: 'delegation_revoked', patient },
    }).catch((err) => log.warn('push send failed', { error: err?.message }));
}

async function handleAccessGrantedViaDelegation(event) {
    const patient = normalizeAddress(event.args.patient);
    const newGrantee = normalizeAddress(event.args.newGrantee);
    const byDelegatee = normalizeAddress(event.args.byDelegatee);
    const rootCidHash = normalizeHash(event.args.rootCidHash);
    const txHash = normalizeHash(event.transactionHash);
    const blockNumber = event.blockNumber ?? 0n;

    if (!patient || !newGrantee || !byDelegatee || !rootCidHash || !txHash) return;

    await ensureUserRecord(newGrantee);

    // Idempotent-by-txHash+event: logIndex uniqueness is via @@id field `id`
    // (cuid). Use a deterministic string key (txHash+newGrantee) to avoid dup
    // rows on realtime + catchup overlap.
    try {
        await prisma.delegationAccessLog.create({
            data: {
                patientAddress: patient,
                newGrantee,
                byDelegatee,
                rootCidHash,
                txHash,
                blockNumber: BigInt(blockNumber),
            },
        });
    } catch (err) {
        // Duplicate — catchup already wrote this row.
        if (err?.code !== 'P2002') throw err;
    }

    log.info('AccessGrantedViaDelegation', {
        patient,
        newGrantee,
        byDelegatee,
        rootCidHash,
    });

    emitToUser(patient, 'delegationAccessLog', {
        patient,
        newGrantee,
        byDelegatee,
        rootCidHash,
    });
    emitToUser(newGrantee, 'delegationAccessLog', {
        patient,
        newGrantee,
        byDelegatee,
        rootCidHash,
    });
}

const EVENT_HANDLERS = {
    DelegationGranted: handleDelegationGranted,
    DelegationRevoked: handleDelegationRevoked,
    AccessGrantedViaDelegation: handleAccessGrantedViaDelegation,
};

async function processLog(eventName, eventLog) {
    try {
        const handler = EVENT_HANDLERS[eventName];
        if (handler) {
            await handler(eventLog);
        }
    } catch (error) {
        log.error(`Error processing ${eventName}`, { error: error.message, stack: error.stack });
    }
}

async function catchupLogs() {
    if (!CONSENT_LEDGER_ADDRESS) {
        log.warn('CONSENT_LEDGER_ADDRESS not set, skipping catchup');
        return;
    }

    try {
        const client = getPublicClient();
        const syncState = await getSyncState();
        const currentBlock = await client.getBlockNumber();
        const safeBlock = currentBlock - BigInt(REORG_SAFETY_BLOCKS);
        const fromBlock = syncState.lastSyncedBlock + 1n;

        if (fromBlock > safeBlock) return;

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
                        address: CONSENT_LEDGER_ADDRESS,
                        event: eventAbi,
                        fromBlock: chunkFrom,
                        toBlock: chunkTo,
                    });

                    for (const eventLog of logs) {
                        await processLog(eventName, eventLog);
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
    if (!CONSENT_LEDGER_ADDRESS) {
        log.warn('CONSENT_LEDGER_ADDRESS not set, skipping realtime watch');
        return;
    }

    const client = getPublicClient();

    for (const [eventName, eventAbi] of Object.entries(EVENTS)) {
        try {
            const unwatch = client.watchContractEvent({
                address: CONSENT_LEDGER_ADDRESS,
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

    log.info('Realtime watching started', { eventCount: Object.keys(EVENTS).length, contract: CONSENT_LEDGER_ADDRESS });
}

export function startConsentLedgerSync() {
    if (!CONSENT_LEDGER_ADDRESS) {
        log.warn('CONSENT_LEDGER_ADDRESS not set - consent ledger sync disabled');
        log.warn('Set CONSENT_LEDGER_ADDRESS=0x... in .env to enable');
        return;
    }

    log.info('Starting consent ledger sync worker');
    log.info('Contract', { address: CONSENT_LEDGER_ADDRESS });
    log.info('RPC', { url: RPC_URL });

    catchupLogs().then(() => {
        log.info('Initial catchup done');
    });

    startRealtimeWatch();
    catchupInterval = setInterval(catchupLogs, CATCHUP_INTERVAL_MS);
}

export function stopConsentLedgerSync() {
    log.info('Stopping consent ledger sync worker');

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
    startConsentLedgerSync,
    stopConsentLedgerSync,
};
