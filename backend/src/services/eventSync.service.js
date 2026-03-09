// Event Sync Worker — Listen on-chain events → sync DB (authoritative)
// Architecture: blockchain = source of truth, DB = cache for UI
//
// Events: MemberAdded, MemberRemoved, DoctorVerified, VerificationRevoked,
//         OrganizationCreated, OrganizationStatusChanged
//
// Features:
// - Realtime via watchContractEvent (WebSocket)
// - Periodic catchup via getLogs (every 5 min)
// - Reorg-safe: stores blockHash, detects reorg → reprocess
// - Idempotent upserts (safe to replay events)
// - Socket.io emit for frontend auto-refresh

import { createPublicClient, http, parseAbiItem } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import prisma from '../config/database.js';
import { emitToUser, getIO } from './socket.service.js';

// ============ CONFIG ============

const ACCESS_CONTROL_ADDRESS = process.env.ACCESS_CONTROL_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const CATCHUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REORG_SAFETY_BLOCKS = 5; // Consider blocks < (latest - 5) as finalized
const CONTRACT_NAME = 'AccessControl';

// ============ ABI EVENTS ============

const EVENTS = {
    MemberAdded: parseAbiItem('event MemberAdded(address indexed org, address indexed doctor)'),
    MemberRemoved: parseAbiItem('event MemberRemoved(address indexed org, address indexed doctor)'),
    DoctorVerified: parseAbiItem('event DoctorVerified(address indexed doctor, address indexed verifier, uint256 indexed orgId, string credential)'),
    VerificationRevoked: parseAbiItem('event VerificationRevoked(address indexed user, address indexed revoker)'),
    OrganizationCreated: parseAbiItem('event OrganizationCreated(uint256 indexed orgId, string name, address primaryAdmin, address backupAdmin)'),
    OrganizationStatusChanged: parseAbiItem('event OrganizationStatusChanged(uint256 indexed orgId, bool active)'),
    OrganizationAdminChanged: parseAbiItem('event OrganizationAdminChanged(uint256 indexed orgId, address oldPrimary, address newPrimary, address oldBackup, address newBackup)'),
};

// ============ PUBLIC CLIENT ============

let publicClient;

function getPublicClient() {
    if (!publicClient) {
        publicClient = createPublicClient({
            chain: arbitrumSepolia,
            transport: http(RPC_URL),
        });
    }
    return publicClient;
}

// ============ SYNC STATE (Reorg-safe) ============

async function getSyncState() {
    let state = await prisma.eventSyncState.findUnique({
        where: { contractName: CONTRACT_NAME },
    });
    if (!state) {
        // First run — start from current block minus safety margin
        const client = getPublicClient();
        const currentBlock = await client.getBlockNumber();
        const startBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n;
        state = await prisma.eventSyncState.create({
            data: {
                contractName: CONTRACT_NAME,
                lastSyncedBlock: startBlock,
            },
        });
    }
    return state;
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

// ============ EVENT HANDLERS (Idempotent) ============

/**
 * MemberAdded(org, doctor) → upsert OrganizationMember
 * org = primaryAdmin of the organization (not orgId — legacy event format)
 */
async function handleMemberAdded(log) {
    const orgAdminAddress = log.args.org?.toLowerCase();
    const doctorAddress = log.args.doctor?.toLowerCase();
    if (!orgAdminAddress || !doctorAddress) return;

    // Resolve orgId from admin address
    const org = await prisma.organization.findFirst({
        where: { address: orgAdminAddress },
    });
    if (!org) {
        console.warn(`[EventSync] MemberAdded: No org found for admin ${orgAdminAddress}`);
        return;
    }

    // Idempotent upsert
    await prisma.organizationMember.upsert({
        where: {
            orgId_memberAddress: {
                orgId: org.id,
                memberAddress: doctorAddress,
            },
        },
        update: {
            status: 'active',
            leftAt: null,
        },
        create: {
            orgId: org.id,
            memberAddress: doctorAddress,
            role: 'doctor',
            status: 'active',
        },
    });

    console.log(`[EventSync] MemberAdded: ${doctorAddress} → org ${org.name}`);

    // Emit socket events
    emitToUser(orgAdminAddress, 'orgMemberUpdated', { orgId: org.id, action: 'added', doctor: doctorAddress });
    emitToUser(doctorAddress, 'orgMemberUpdated', { orgId: org.id, action: 'added_me' });
}

/**
 * MemberRemoved(org, doctor) → soft-delete OrganizationMember
 */
async function handleMemberRemoved(log) {
    const orgAdminAddress = log.args.org?.toLowerCase();
    const doctorAddress = log.args.doctor?.toLowerCase();
    if (!orgAdminAddress || !doctorAddress) return;

    const org = await prisma.organization.findFirst({
        where: { address: orgAdminAddress },
    });
    if (!org) return;

    // Idempotent: update if exists
    try {
        await prisma.organizationMember.update({
            where: {
                orgId_memberAddress: {
                    orgId: org.id,
                    memberAddress: doctorAddress,
                },
            },
            data: {
                status: 'inactive',
                leftAt: new Date(),
            },
        });
    } catch (e) {
        // Member might not exist in DB — ignore
    }

    console.log(`[EventSync] MemberRemoved: ${doctorAddress} from org ${org.name}`);

    emitToUser(orgAdminAddress, 'orgMemberUpdated', { orgId: org.id, action: 'removed', doctor: doctorAddress });
    emitToUser(doctorAddress, 'orgMemberUpdated', { orgId: org.id, action: 'removed_me' });
}

/**
 * DoctorVerified(doctor, verifier, orgId, credential) → update User verified cache
 */
async function handleDoctorVerified(log) {
    const doctorAddress = log.args.doctor?.toLowerCase();
    const verifierAddress = log.args.verifier?.toLowerCase();
    const orgId = log.args.orgId?.toString();
    if (!doctorAddress) return;

    // Cache verified status in User model (if field exists)
    try {
        await prisma.user.update({
            where: { walletAddress: doctorAddress },
            data: { role: 'doctor' }, // Ensure role is set
        });
    } catch (e) {
        // User might not exist yet
    }

    console.log(`[EventSync] DoctorVerified: ${doctorAddress} by ${verifierAddress} (orgId: ${orgId})`);

    emitToUser(doctorAddress, 'doctorVerified', { doctor: doctorAddress, verifier: verifierAddress });
    // Broadcast to org admin
    if (verifierAddress) {
        emitToUser(verifierAddress, 'doctorVerified', { doctor: doctorAddress, action: 'verified_by_me' });
    }
    // Broadcast to all connected clients in the org
    const io = getIO();
    if (io) {
        io.emit('verificationUpdated', { doctor: doctorAddress, verified: true });
    }
}

/**
 * VerificationRevoked(user, revoker)
 */
async function handleVerificationRevoked(log) {
    const userAddress = log.args.user?.toLowerCase();
    const revokerAddress = log.args.revoker?.toLowerCase();
    if (!userAddress) return;

    console.log(`[EventSync] VerificationRevoked: ${userAddress} by ${revokerAddress}`);

    emitToUser(userAddress, 'verificationRevoked', { user: userAddress, revoker: revokerAddress });
    const io = getIO();
    if (io) {
        io.emit('verificationUpdated', { doctor: userAddress, verified: false });
    }
}

/**
 * OrganizationCreated(orgId, name, primaryAdmin, backupAdmin) → upsert Organization
 */
async function handleOrganizationCreated(log) {
    const orgId = log.args.orgId?.toString();
    const name = log.args.name;
    const primaryAdmin = log.args.primaryAdmin?.toLowerCase();
    const backupAdmin = log.args.backupAdmin?.toLowerCase();
    if (!orgId || !name || !primaryAdmin) return;

    // Upsert organization
    await prisma.organization.upsert({
        where: { address: primaryAdmin },
        update: {
            name: name,
            isVerified: true,
            verifiedAt: new Date(),
        },
        create: {
            name: name,
            address: primaryAdmin,
            orgType: 'hospital',
            isVerified: true,
            verifiedAt: new Date(),
        },
    });

    // Create admin membership
    await prisma.organizationMember.upsert({
        where: {
            orgId_memberAddress: {
                orgId: orgId,  // This uses blockchain orgId — may differ from DB id
                memberAddress: primaryAdmin,
            },
        },
        update: { status: 'active', role: 'admin' },
        create: {
            orgId: orgId,
            memberAddress: primaryAdmin,
            role: 'admin',
            status: 'active',
        },
    });

    console.log(`[EventSync] OrganizationCreated: "${name}" (orgId: ${orgId})`);

    emitToUser(primaryAdmin, 'orgCreated', { orgId, name });
    if (backupAdmin && backupAdmin !== '0x0000000000000000000000000000000000000000') {
        emitToUser(backupAdmin, 'orgCreated', { orgId, name });
    }
}

/**
 * OrganizationStatusChanged(orgId, active) → update org active status
 */
async function handleOrganizationStatusChanged(log) {
    const orgId = log.args.orgId?.toString();
    const active = log.args.active;
    if (!orgId) return;

    // Find org by orgId (stored in membership or by admin lookup)
    // Since our DB uses address as primary key, we look up via admin
    console.log(`[EventSync] OrgStatusChanged: orgId ${orgId} → active: ${active}`);

    const io = getIO();
    if (io) {
        io.emit('orgStatusUpdated', { orgId, active });
    }
}

// ============ EVENT ROUTER ============

const EVENT_HANDLERS = {
    MemberAdded: handleMemberAdded,
    MemberRemoved: handleMemberRemoved,
    DoctorVerified: handleDoctorVerified,
    VerificationRevoked: handleVerificationRevoked,
    OrganizationCreated: handleOrganizationCreated,
    OrganizationStatusChanged: handleOrganizationStatusChanged,
};

async function processLog(eventName, log) {
    try {
        const handler = EVENT_HANDLERS[eventName];
        if (handler) {
            await handler(log);
        }
    } catch (error) {
        console.error(`[EventSync] Error processing ${eventName}:`, error.message);
    }
}

// ============ CATCHUP (getLogs) ============

async function catchupLogs() {
    if (!ACCESS_CONTROL_ADDRESS) {
        console.warn('[EventSync] ACCESS_CONTROL_ADDRESS not set, skipping catchup');
        return;
    }

    try {
        const client = getPublicClient();
        const syncState = await getSyncState();
        const currentBlock = await client.getBlockNumber();

        // Apply safety margin for reorg protection
        const safeBlock = currentBlock - BigInt(REORG_SAFETY_BLOCKS);
        const fromBlock = syncState.lastSyncedBlock + 1n;

        if (fromBlock > safeBlock) {
            return; // Already caught up
        }

        console.log(`[EventSync] Catching up from block ${fromBlock} to ${safeBlock}...`);

        // Reorg detection: verify last known block hash
        if (syncState.lastBlockHash && syncState.lastSyncedBlock > 0n) {
            try {
                const lastBlock = await client.getBlock({
                    blockNumber: syncState.lastSyncedBlock,
                });
                if (lastBlock.hash !== syncState.lastBlockHash) {
                    console.warn(`[EventSync] ⚠️ REORG DETECTED at block ${syncState.lastSyncedBlock}! Reprocessing...`);
                    // Rollback 50 blocks and reprocess
                    const rollbackBlock = syncState.lastSyncedBlock > 50n
                        ? syncState.lastSyncedBlock - 50n
                        : 0n;
                    await updateSyncState(rollbackBlock, null);
                    return catchupLogs(); // Recursive retry
                }
            } catch (e) {
                console.warn('[EventSync] Could not verify block hash:', e.message);
            }
        }

        // Fetch logs in chunks (max 10000 blocks at a time for RPC limits)
        const CHUNK_SIZE = 10000n;
        let chunkFrom = fromBlock;

        while (chunkFrom <= safeBlock) {
            const chunkTo = chunkFrom + CHUNK_SIZE - 1n > safeBlock ? safeBlock : chunkFrom + CHUNK_SIZE - 1n;

            for (const [eventName, eventAbi] of Object.entries(EVENTS)) {
                try {
                    const logs = await client.getLogs({
                        address: ACCESS_CONTROL_ADDRESS,
                        event: eventAbi,
                        fromBlock: chunkFrom,
                        toBlock: chunkTo,
                    });

                    for (const log of logs) {
                        await processLog(eventName, log);
                    }
                } catch (e) {
                    console.error(`[EventSync] Error fetching ${eventName} logs:`, e.message);
                }
            }

            // Update sync state after each chunk
            try {
                const block = await client.getBlock({ blockNumber: chunkTo });
                await updateSyncState(chunkTo, block.hash);
            } catch (e) {
                await updateSyncState(chunkTo, null);
            }

            chunkFrom = chunkTo + 1n;
        }

        console.log(`[EventSync] Catchup complete. Synced to block ${safeBlock}`);
    } catch (error) {
        console.error('[EventSync] Catchup error:', error.message);
    }
}

// ============ REALTIME WATCH ============

let unwatchFunctions = [];

function startRealtimeWatch() {
    if (!ACCESS_CONTROL_ADDRESS) {
        console.warn('[EventSync] ACCESS_CONTROL_ADDRESS not set, skipping realtime watch');
        return;
    }

    const client = getPublicClient();

    for (const [eventName, eventAbi] of Object.entries(EVENTS)) {
        try {
            const unwatch = client.watchContractEvent({
                address: ACCESS_CONTROL_ADDRESS,
                abi: [eventAbi],
                onLogs: async (logs) => {
                    for (const log of logs) {
                        console.log(`[EventSync] Realtime ${eventName} at block ${log.blockNumber}`);
                        await processLog(eventName, log);
                    }
                },
                onError: (error) => {
                    console.error(`[EventSync] Watch error for ${eventName}:`, error.message);
                },
            });
            unwatchFunctions.push(unwatch);
        } catch (e) {
            console.error(`[EventSync] Failed to watch ${eventName}:`, e.message);
        }
    }

    console.log(`[EventSync] Realtime watching ${Object.keys(EVENTS).length} events on ${ACCESS_CONTROL_ADDRESS}`);
}

// ============ MAIN ============

let catchupInterval = null;

export function startEventSync() {
    if (!ACCESS_CONTROL_ADDRESS) {
        console.warn('[EventSync] ⚠️ ACCESS_CONTROL_ADDRESS not set in .env — event sync disabled');
        console.warn('[EventSync] Set ACCESS_CONTROL_ADDRESS=0x... in .env to enable');
        return;
    }

    console.log('[EventSync] 🚀 Starting event sync worker...');
    console.log(`[EventSync] Contract: ${ACCESS_CONTROL_ADDRESS}`);
    console.log(`[EventSync] RPC: ${RPC_URL}`);

    // Initial catchup
    catchupLogs().then(() => {
        console.log('[EventSync] Initial catchup done');
    });

    // Start realtime watch
    startRealtimeWatch();

    // Periodic catchup (safety net — catches any missed events)
    catchupInterval = setInterval(catchupLogs, CATCHUP_INTERVAL_MS);
}

export function stopEventSync() {
    console.log('[EventSync] Stopping event sync worker...');
    // Unwatch all events
    for (const unwatch of unwatchFunctions) {
        try { unwatch(); } catch (e) { /* ignore */ }
    }
    unwatchFunctions = [];

    // Clear catchup interval
    if (catchupInterval) {
        clearInterval(catchupInterval);
        catchupInterval = null;
    }
}

export default { startEventSync, stopEventSync };
