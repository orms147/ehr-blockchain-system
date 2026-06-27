// Event Sync Worker - Listen on-chain events and sync the DB cache.
// Blockchain remains the source of truth for authorization decisions.

import { createPublicClient, http, parseAbi, parseAbiItem } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import prisma from '../config/database.js';
import { emitToUser, getIO } from './socket.service.js';
import { createLogger } from '../utils/logger.js';
import { withRpcRetry } from '../utils/rpcRetry.js';
import { normalizeAddress } from '../utils/normalize.js';
import { invalidateRoleCache } from '../config/blockchain.js';

const log = createLogger('EventSync');

const ACCESS_CONTROL_ADDRESS = process.env.ACCESS_CONTROL_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const CATCHUP_INTERVAL_MS = 5 * 60 * 1000;
const REORG_SAFETY_BLOCKS = 5;
const CONTRACT_NAME = 'AccessControl';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const EVENTS = {
    MemberAdded: parseAbiItem('event MemberAdded(address indexed org, address indexed doctor)'),
    MemberRemoved: parseAbiItem('event MemberRemoved(address indexed org, address indexed doctor)'),
    DoctorVerified: parseAbiItem('event DoctorVerified(address indexed doctor, address indexed verifier, uint256 indexed orgId, string credential)'),
    VerificationRevoked: parseAbiItem('event VerificationRevoked(address indexed user, address indexed revoker)'),
    OrganizationCreated: parseAbiItem('event OrganizationCreated(uint256 indexed orgId, string name, address primaryAdmin, address backupAdmin)'),
    OrganizationStatusChanged: parseAbiItem('event OrganizationStatusChanged(uint256 indexed orgId, bool active)'),
    OrganizationAdminChanged: parseAbiItem('event OrganizationAdminChanged(uint256 indexed orgId, address oldPrimary, address newPrimary, address oldBackup, address newBackup)'),
};

const ACCESS_CONTROL_READ_ABI = parseAbi([
    'function getOrganization(uint256 orgId) view returns ((uint256 id, string name, address primaryAdmin, address backupAdmin, uint40 createdAt, bool active))',
]);

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


function normalizeChainOrgId(value) {
    if (value === undefined || value === null) {
        return null;
    }

    return typeof value === 'bigint' ? value : BigInt(value.toString());
}

function isZeroAddress(value) {
    return !value || value === ZERO_ADDRESS;
}

async function findOrganizationRecord({ chainOrgId = null, adminAddress = null }) {
    const conditions = [];

    if (chainOrgId !== null) {
        conditions.push({ chainOrgId });
    }
    if (adminAddress) {
        conditions.push({ address: adminAddress });
    }

    if (conditions.length === 0) {
        return null;
    }

    return prisma.organization.findFirst({
        where: { OR: conditions },
    });
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

async function upsertAdminMembership(orgDbId, adminAddress) {
    if (!orgDbId || !adminAddress) {
        return;
    }

    await prisma.organizationMember.upsert({
        where: {
            orgId_memberAddress: {
                orgId: orgDbId,
                memberAddress: adminAddress,
            },
        },
        update: {
            role: 'admin',
            status: 'active',
            leftAt: null,
        },
        create: {
            orgId: orgDbId,
            memberAddress: adminAddress,
            role: 'admin',
            status: 'active',
        },
    });
}

async function hydrateOrganizationFromChain(chainOrgId) {
    if (!ACCESS_CONTROL_ADDRESS || chainOrgId === null) {
        return null;
    }

    const client = getPublicClient();
    const onChainOrg = await client.readContract({
        address: ACCESS_CONTROL_ADDRESS,
        abi: ACCESS_CONTROL_READ_ABI,
        functionName: 'getOrganization',
        args: [chainOrgId],
    });

    const primaryAdmin = normalizeAddress(onChainOrg.primaryAdmin);
    const backupAdmin = normalizeAddress(onChainOrg.backupAdmin);
    const existingOrg = await findOrganizationRecord({ chainOrgId, adminAddress: primaryAdmin });
    const orgData = {
        chainOrgId,
        name: onChainOrg.name,
        address: primaryAdmin,
        backupAdminAddress: isZeroAddress(backupAdmin) ? null : backupAdmin,
        isActive: Boolean(onChainOrg.active),
    };

    const organization = existingOrg
        ? await prisma.organization.update({
            where: { id: existingOrg.id },
            data: orgData,
        })
        : await prisma.organization.create({
            data: {
                ...orgData,
                orgType: 'hospital',
            },
        });

    await upsertAdminMembership(organization.id, primaryAdmin);
    return organization;
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

async function handleMemberAdded(event) {
    const orgAdminAddress = normalizeAddress(event.args.org);
    const doctorAddress = normalizeAddress(event.args.doctor);
    if (!orgAdminAddress || !doctorAddress) {
        return;
    }

    const organization = await findOrganizationRecord({ adminAddress: orgAdminAddress });
    if (!organization) {
        log.warn('MemberAdded: no organization found', { adminAddress: orgAdminAddress });
        return;
    }

    await ensureUserRecord(doctorAddress);

    await prisma.organizationMember.upsert({
        where: {
            orgId_memberAddress: {
                orgId: organization.id,
                memberAddress: doctorAddress,
            },
        },
        update: {
            status: 'active',
            leftAt: null,
        },
        create: {
            orgId: organization.id,
            memberAddress: doctorAddress,
            role: 'doctor',
            status: 'active',
        },
    });

    // Membership flips affect isActiveOrgAdmin / isOrg flags in the cached
    // role result; bust the cache so the next role lookup hits chain truth.
    invalidateRoleCache(doctorAddress);

    log.info('MemberAdded', { doctor: doctorAddress, org: organization.name });

    emitToUser(orgAdminAddress, 'orgMemberUpdated', {
        orgId: organization.id,
        chainOrgId: organization.chainOrgId?.toString() ?? null,
        action: 'added',
        doctor: doctorAddress,
    });
    emitToUser(doctorAddress, 'orgMemberUpdated', {
        orgId: organization.id,
        chainOrgId: organization.chainOrgId?.toString() ?? null,
        action: 'added_me',
    });
}

async function handleMemberRemoved(event) {
    const orgAdminAddress = normalizeAddress(event.args.org);
    const doctorAddress = normalizeAddress(event.args.doctor);
    if (!orgAdminAddress || !doctorAddress) {
        return;
    }

    const organization = await findOrganizationRecord({ adminAddress: orgAdminAddress });
    if (!organization) {
        return;
    }

    try {
        await prisma.organizationMember.update({
            where: {
                orgId_memberAddress: {
                    orgId: organization.id,
                    memberAddress: doctorAddress,
                },
            },
            data: {
                status: 'inactive',
                leftAt: new Date(),
            },
        });
    } catch {
        // Ignore if the membership was never cached locally.
    }

    invalidateRoleCache(doctorAddress);

    log.info('MemberRemoved', { doctor: doctorAddress, org: organization.name });

    emitToUser(orgAdminAddress, 'orgMemberUpdated', {
        orgId: organization.id,
        chainOrgId: organization.chainOrgId?.toString() ?? null,
        action: 'removed',
        doctor: doctorAddress,
    });
    emitToUser(doctorAddress, 'orgMemberUpdated', {
        orgId: organization.id,
        chainOrgId: organization.chainOrgId?.toString() ?? null,
        action: 'removed_me',
    });
}

async function handleDoctorVerified(event) {
    const doctorAddress = normalizeAddress(event.args.doctor);
    const verifierAddress = normalizeAddress(event.args.verifier);
    const chainOrgId = normalizeChainOrgId(event.args.orgId);
    if (!doctorAddress) {
        return;
    }

    await ensureUserRecord(doctorAddress);

    const verificationUpdate = {
        status: 'approved',
        reviewedAt: new Date(),
    };
    if (verifierAddress) {
        verificationUpdate.reviewedBy = verifierAddress;
    }

    await prisma.verificationRequest.updateMany({
        where: {
            doctorAddress,
            status: { in: ['pending', 'approved'] },
        },
        data: verificationUpdate,
    });

    // Backstop for /api/verification/confirm: a doctor an org verifies must also
    // land in that org's member roster (OrganizationMember) — otherwise verified
    // doctors are invisible in "Quản lý bác sĩ thuộc cơ sở". Org verification
    // carries a non-zero chainOrgId; ministry-verified independent doctors carry
    // 0 → no org membership. Preserve an existing row's role (don't downgrade an
    // admin who is also a doctor) and just (re)activate it.
    if (chainOrgId && chainOrgId !== 0n) {
        const org = await prisma.organization.findUnique({ where: { chainOrgId } });
        if (org) {
            await prisma.organizationMember.upsert({
                where: { orgId_memberAddress: { orgId: org.id, memberAddress: doctorAddress } },
                update: { status: 'active', leftAt: null },
                create: { orgId: org.id, memberAddress: doctorAddress, role: 'doctor', status: 'active' },
            });
        }
    }

    // The on-chain role middleware caches isVerifiedDoctor for 60s. Without
    // this invalidation, fresh requests after verification still see "not
    // verified" until cache expires — patient share would block on
    // DOCTOR_NOT_VERIFIED for a minute after the verify tx confirms.
    invalidateRoleCache(doctorAddress);

    log.info('DoctorVerified', { doctor: doctorAddress, verifier: verifierAddress, chainOrgId: chainOrgId?.toString() ?? 'n/a' });

    emitToUser(doctorAddress, 'doctorVerified', {
        doctor: doctorAddress,
        verifier: verifierAddress,
        chainOrgId: chainOrgId?.toString() ?? null,
    });
    if (verifierAddress) {
        emitToUser(verifierAddress, 'doctorVerified', {
            doctor: doctorAddress,
            action: 'verified_by_me',
            chainOrgId: chainOrgId?.toString() ?? null,
        });
    }

    const io = getIO();
    if (io) {
        io.emit('verificationUpdated', { doctor: doctorAddress, verified: true });
    }
}

async function handleVerificationRevoked(event) {
    const userAddress = normalizeAddress(event.args.user);
    const revokerAddress = normalizeAddress(event.args.revoker);
    if (!userAddress) {
        return;
    }

    invalidateRoleCache(userAddress);

    log.info('VerificationRevoked', { user: userAddress, revoker: revokerAddress });

    emitToUser(userAddress, 'verificationRevoked', { user: userAddress, revoker: revokerAddress });
    const io = getIO();
    if (io) {
        io.emit('verificationUpdated', { doctor: userAddress, verified: false });
    }
}

async function handleOrganizationCreated(event) {
    const chainOrgId = normalizeChainOrgId(event.args.orgId);
    const name = event.args.name;
    const primaryAdmin = normalizeAddress(event.args.primaryAdmin);
    const backupAdmin = normalizeAddress(event.args.backupAdmin);
    if (chainOrgId === null || !name || !primaryAdmin) {
        return;
    }

    const existingOrg = await findOrganizationRecord({ chainOrgId, adminAddress: primaryAdmin });
    const orgData = {
        chainOrgId,
        name,
        address: primaryAdmin,
        backupAdminAddress: isZeroAddress(backupAdmin) ? null : backupAdmin,
        isVerified: true,
        isActive: true,
        verifiedAt: existingOrg?.verifiedAt ?? new Date(),
    };

    const organization = existingOrg
        ? await prisma.organization.update({
            where: { id: existingOrg.id },
            data: orgData,
        })
        : await prisma.organization.create({
            data: {
                ...orgData,
                orgType: 'hospital',
            },
        });

    await upsertAdminMembership(organization.id, primaryAdmin);

    log.info('OrganizationCreated', { name, chainOrgId: chainOrgId.toString() });

    emitToUser(primaryAdmin, 'orgCreated', {
        orgId: organization.id,
        chainOrgId: chainOrgId.toString(),
        name,
    });
    if (!isZeroAddress(backupAdmin)) {
        emitToUser(backupAdmin, 'orgCreated', {
            orgId: organization.id,
            chainOrgId: chainOrgId.toString(),
            name,
        });
    }
}

async function handleOrganizationStatusChanged(event) {
    const chainOrgId = normalizeChainOrgId(event.args.orgId);
    const active = Boolean(event.args.active);
    if (chainOrgId === null) {
        return;
    }

    let organization = await prisma.organization.findUnique({
        where: { chainOrgId },
    });
    if (!organization) {
        try {
            organization = await hydrateOrganizationFromChain(chainOrgId);
        } catch (error) {
            log.warn('OrgStatusChanged: could not hydrate org', { chainOrgId: chainOrgId.toString(), error: error.message });
        }
    }
    if (!organization) {
        return;
    }

    organization = await prisma.organization.update({
        where: { id: organization.id },
        data: { isActive: active },
    });

    log.info('OrgStatusChanged', { chainOrgId: chainOrgId.toString(), active });

    const io = getIO();
    if (io) {
        io.emit('orgStatusUpdated', {
            orgId: organization.id,
            chainOrgId: chainOrgId.toString(),
            active,
        });
    }
}

async function handleOrganizationAdminChanged(event) {
    const chainOrgId = normalizeChainOrgId(event.args.orgId);
    const oldPrimary = normalizeAddress(event.args.oldPrimary);
    const newPrimary = normalizeAddress(event.args.newPrimary);
    const oldBackup = normalizeAddress(event.args.oldBackup);
    const newBackup = normalizeAddress(event.args.newBackup);
    if (chainOrgId === null || !newPrimary) {
        return;
    }

    let organization = await prisma.organization.findUnique({
        where: { chainOrgId },
    });
    if (!organization) {
        try {
            organization = await hydrateOrganizationFromChain(chainOrgId);
        } catch (error) {
            log.warn('OrgAdminChanged: could not hydrate org', { chainOrgId: chainOrgId.toString(), error: error.message });
        }
    }
    if (!organization) {
        return;
    }

    organization = await prisma.organization.update({
        where: { id: organization.id },
        data: {
            address: newPrimary,
            backupAdminAddress: isZeroAddress(newBackup) ? null : newBackup,
        },
    });

    await upsertAdminMembership(organization.id, newPrimary);

    log.info('OrgAdminChanged', { chainOrgId: chainOrgId.toString(), oldPrimary, newPrimary });

    emitToUser(newPrimary, 'orgAdminUpdated', {
        orgId: organization.id,
        chainOrgId: chainOrgId.toString(),
        action: 'became_primary_admin',
    });
    if (oldPrimary && oldPrimary !== newPrimary) {
        emitToUser(oldPrimary, 'orgAdminUpdated', {
            orgId: organization.id,
            chainOrgId: chainOrgId.toString(),
            action: 'no_longer_primary_admin',
        });
    }
    if (!isZeroAddress(newBackup)) {
        emitToUser(newBackup, 'orgAdminUpdated', {
            orgId: organization.id,
            chainOrgId: chainOrgId.toString(),
            action: 'backup_admin_updated',
        });
    }
    if (!isZeroAddress(oldBackup) && oldBackup !== newBackup) {
        emitToUser(oldBackup, 'orgAdminUpdated', {
            orgId: organization.id,
            chainOrgId: chainOrgId.toString(),
            action: 'backup_admin_removed',
        });
    }
}

const EVENT_HANDLERS = {
    MemberAdded: handleMemberAdded,
    MemberRemoved: handleMemberRemoved,
    DoctorVerified: handleDoctorVerified,
    VerificationRevoked: handleVerificationRevoked,
    OrganizationCreated: handleOrganizationCreated,
    OrganizationStatusChanged: handleOrganizationStatusChanged,
    OrganizationAdminChanged: handleOrganizationAdminChanged,
};

async function processLog(eventName, eventLog) {
    try {
        const handler = EVENT_HANDLERS[eventName];
        if (handler) {
            await handler(eventLog);
        }
    } catch (error) {
        log.error(`Error processing ${eventName}`, { error: error.message });
    }
}

async function catchupLogs() {
    if (!ACCESS_CONTROL_ADDRESS) {
        log.warn('ACCESS_CONTROL_ADDRESS not set, skipping catchup');
        return;
    }

    try {
        const client = getPublicClient();
        const syncState = await getSyncState();
        const currentBlock = await client.getBlockNumber();
        const safeBlock = currentBlock - BigInt(REORG_SAFETY_BLOCKS);
        let fromBlock = syncState.lastSyncedBlock + 1n;

        if (fromBlock > safeBlock) {
            return;
        }

        // Bail out of multi-day catchups on free-tier RPC. Each 10-block
        // chunk costs 7 getLogs + 1 getBlock = 8 calls; 290k-block catchup
        // would take ~96 minutes and DOS the rate limit. If the gap exceeds
        // RPC_CATCHUP_MAX_BLOCKS (default 5_000 = ~20 min of Arbitrum),
        // jump ahead and only sync the recent window. Older state is still
        // accurate on-chain — we just skip the DB cache sync for that span.
        const MAX_BLOCKS = BigInt(process.env.RPC_CATCHUP_MAX_BLOCKS || 5000);
        if (safeBlock - fromBlock > MAX_BLOCKS) {
            const skipTo = safeBlock - MAX_BLOCKS;
            log.warn('Catchup gap too large, skipping ahead', {
                originalFrom: fromBlock,
                skipTo,
                gap: safeBlock - fromBlock,
                max: MAX_BLOCKS,
            });
            await updateSyncState(skipTo, null);
            fromBlock = skipTo + 1n;
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

        // Alchemy free tier caps eth_getLogs to a 10-block range. Paid tiers
        // and most other RPC providers allow much larger windows. Override
        // via RPC_LOGS_CHUNK_SIZE in .env when on a paid plan to speed up
        // catch-up after long downtime.
        const CHUNK_SIZE = BigInt(process.env.RPC_LOGS_CHUNK_SIZE || 10);
        let chunkFrom = fromBlock;

        // Small delay between chunks to spread the load and avoid Alchemy
        // free-tier 300 CU/sec ceiling. Override via RPC_CATCHUP_DELAY_MS for
        // paid plans (set to 0 for no throttle).
        const CHUNK_DELAY_MS = Number(process.env.RPC_CATCHUP_DELAY_MS ?? 200);

        while (chunkFrom <= safeBlock) {
            const chunkTo = chunkFrom + CHUNK_SIZE - 1n > safeBlock ? safeBlock : chunkFrom + CHUNK_SIZE - 1n;

            for (const [eventName, eventAbi] of Object.entries(EVENTS)) {
                try {
                    // withRpcRetry: backoff on 429 / network blip. Without
                    // this, a single 429 silently dropped the chunk's events
                    // — they were never reprocessed because lastSyncedBlock
                    // got bumped past them at the bottom of the loop.
                    const logs = await withRpcRetry(
                        () => client.getLogs({
                            address: ACCESS_CONTROL_ADDRESS,
                            event: eventAbi,
                            fromBlock: chunkFrom,
                            toBlock: chunkTo,
                        }),
                        { label: `EventSync.getLogs(${eventName})` },
                    );

                    for (const eventLog of logs) {
                        await processLog(eventName, eventLog);
                    }
                } catch (error) {
                    log.error(`Error fetching ${eventName} logs`, { error: error.message });
                }
            }

            try {
                const block = await withRpcRetry(
                    () => client.getBlock({ blockNumber: chunkTo }),
                    { label: 'EventSync.getBlock' },
                );
                await updateSyncState(chunkTo, block.hash);
            } catch {
                await updateSyncState(chunkTo, null);
            }

            chunkFrom = chunkTo + 1n;
            if (CHUNK_DELAY_MS > 0 && chunkFrom <= safeBlock) {
                await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
            }
        }

        log.info('Catchup complete', { syncedToBlock: safeBlock });
    } catch (error) {
        log.error('Catchup error', { error: error.message });
    }
}

let unwatchFunctions = [];

function startRealtimeWatch() {
    if (!ACCESS_CONTROL_ADDRESS) {
        log.warn('ACCESS_CONTROL_ADDRESS not set, skipping realtime watch');
        return;
    }

    const client = getPublicClient();

    // Default viem pollingInterval is 4s. With 16 watchers across 3 services
    // each calling eth_getFilterChanges every 4s, free-tier RPC saturates fast.
    // 15s spreads the load (~1 poll/sec total across all watchers) and is
    // still snappy enough for UX. Override via RPC_WATCH_POLL_MS on paid plans.
    const POLL_MS = Number(process.env.RPC_WATCH_POLL_MS ?? 15_000);

    for (const [eventName, eventAbi] of Object.entries(EVENTS)) {
        try {
            const unwatch = client.watchContractEvent({
                address: ACCESS_CONTROL_ADDRESS,
                abi: [eventAbi],
                pollingInterval: POLL_MS,
                onLogs: async (logs) => {
                    for (const eventLog of logs) {
                        log.info(`Realtime ${eventName}`, { blockNumber: eventLog.blockNumber });
                        await processLog(eventName, eventLog);
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

    log.info('Realtime watching started', { eventCount: Object.keys(EVENTS).length, contract: ACCESS_CONTROL_ADDRESS });
}

let catchupInterval = null;

export function startEventSync() {
    if (!ACCESS_CONTROL_ADDRESS) {
        log.warn('ACCESS_CONTROL_ADDRESS not set - event sync disabled');
        log.warn('Set ACCESS_CONTROL_ADDRESS=0x... in .env to enable');
        return;
    }

    log.info('Starting event sync worker');
    log.info('Contract', { address: ACCESS_CONTROL_ADDRESS });
    log.info('RPC', { url: RPC_URL });

    catchupLogs().then(() => {
        log.info('Initial catchup done');
    });

    startRealtimeWatch();
    catchupInterval = setInterval(catchupLogs, CATCHUP_INTERVAL_MS);
}

export function stopEventSync() {
    log.info('Stopping event sync worker');

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

export default { startEventSync, stopEventSync };


