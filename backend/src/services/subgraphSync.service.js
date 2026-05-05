// subgraphSync.service.js — replaces consentLedgerSync RPC polling (S17 2026-04-30).
//
// Why this exists:
// Backend used to spin up 3 RPC sync workers (eventSync, recordRegistrySync,
// consentLedgerSync), each with its own filter watchers + catchup loop. With
// 16 active filters × eth_getFilterChanges every 15s + 3 simultaneous catchup
// loops on app boot, Alchemy free-tier 300 CU/sec saturated and produced the
// 429 storm logged on 2026-04-30.
//
// The subgraph (deployed on The Graph Studio at SUBGRAPH_URL) already indexes
// every event we care about. One GraphQL request per cycle here replaces the
// 6 ConsentLedger watchers + their catchup. recordRegistrySync was disabled
// entirely — save-only API is the primary path for RecordMetadata writes.
// eventSync (AccessControl) stays on RPC because the subgraph's Doctor /
// Organization entities are mutable and don't expose a clean change stream.
//
// Strict mode: if subgraph fetch fails, this logs and skips the cycle. No RPC
// fallback — that defeats the entire reason for switching.

import prisma from '../config/database.js';
import { createLogger } from '../utils/logger.js';
import { gql, isSubgraphConfigured } from './subgraphClient.service.js';
import { invalidateRoleCache } from '../config/blockchain.js';
import {
    handleConsentGranted,
    handleConsentRevoked,
    handleEmergencyGranted,
    handleDelegationGranted,
    handleDelegationRevoked,
    handleAccessGrantedViaDelegation,
} from './consentLedgerSync.service.js';

const log = createLogger('SubgraphSync');

const POLL_MS = Number(process.env.SUBGRAPH_POLL_MS ?? 30_000);

// We keep one cursor per entity type because they have different timestamp
// fields and a single GraphQL request fetches all of them in parallel.
const CURSOR_KEYS = {
    consent: 'subgraph:consentEvent:lastTimestamp',
    delegation: 'subgraph:delegationEvent:lastTimestamp',
    emergency: 'subgraph:emergencyEvent:lastTimestamp',
    delegationAccess: 'subgraph:delegationAccessGrant:lastTimestamp',
    // Doctor entity is mutable in subgraph: Doctor.verifiedAt is set when
    // DoctorVerified event fires. We poll for newly-verified doctors and
    // invalidate the backend's roleCache so verifying organizations don't
    // wait the full ROLE_CACHE_TTL_MS for a freshly verified doctor to
    // be recognized by middleware. Doesn't track VerificationRevoked
    // (subgraph mapping only flips Doctor.verified=false without a fresh
    // timestamp); cache TTL eventually catches that case.
    doctorVerified: 'subgraph:doctor:lastVerifiedAt',
};

// EventSyncState is keyed on `contractName` (unique). We reuse the table by
// stuffing each cursor key into a row; lastSyncedBlock holds the timestamp
// (BigInt seconds) instead of a block number — same numeric type, semantics
// only differ in interpretation.
async function getCursor(key) {
    const row = await prisma.eventSyncState.findUnique({
        where: { contractName: key },
    });
    return row ? row.lastSyncedBlock : 0n;
}

async function setCursor(key, timestamp) {
    await prisma.eventSyncState.upsert({
        where: { contractName: key },
        update: { lastSyncedBlock: timestamp },
        create: { contractName: key, lastSyncedBlock: timestamp },
    });
}

// ---------- Row → handler-event shape adapters ----------
//
// The existing handlers in consentLedgerSync.service.js expect a viem-style
// event with `event.args.<field>` (BigInt for uint args) and
// `event.transactionHash`. Subgraph returns plain JSON with strings for
// BigInt-like fields. These adapters bridge the shape mismatch so we don't
// have to fork the handlers.

function asBigInt(value) {
    if (value === null || value === undefined) return null;
    return BigInt(value);
}

function shapeConsentEvent(row) {
    return {
        args: {
            patient: row.patient,
            grantee: row.grantee,
            rootCidHash: row.rootCidHash,
            expireAt: asBigInt(row.expireAt),
            allowDelegate: row.allowDelegate ?? false,
            timestamp: asBigInt(row.timestamp),
        },
        transactionHash: row.txHash,
        // blockNumber unavailable from this entity. Handlers don't need it
        // for granted/revoked — only the address + timestamp matter.
        blockNumber: null,
    };
}

function shapeEmergencyEvent(row) {
    return {
        args: {
            patient: row.patient,
            grantee: row.grantee,
            rootCidHash: row.rootCidHash,
            expireAt: asBigInt(row.expireAt),
        },
        transactionHash: row.txHash,
        blockNumber: null,
    };
}

function shapeDelegationEvent(row) {
    return {
        args: {
            patient: row.patient,
            delegatee: row.delegatee,
            expiresAt: asBigInt(row.expiresAt),
            allowSubDelegate: row.allowSubDelegate ?? false,
        },
        transactionHash: row.txHash,
        blockNumber: null,
    };
}

function shapeDelegationAccessGrant(row) {
    return {
        args: {
            patient: row.patient,
            newGrantee: row.newGrantee,
            byDelegatee: row.byDelegatee,
            rootCidHash: row.rootCidHash,
        },
        transactionHash: row.txHash,
        blockNumber: null,
    };
}

// ---------- Polling cycle ----------

const QUERY = `
    query SubgraphSync(
        $sinceConsent: BigInt!,
        $sinceDelegation: BigInt!,
        $sinceEmergency: BigInt!,
        $sinceDelegationAccess: BigInt!,
        $sinceDoctorVerified: BigInt!
    ) {
        consentEvents(
            where: { timestamp_gt: $sinceConsent }
            orderBy: timestamp
            orderDirection: asc
            first: 200
        ) {
            id kind patient grantee rootCidHash expireAt allowDelegate timestamp txHash
        }
        delegationEvents(
            where: { timestamp_gt: $sinceDelegation }
            orderBy: timestamp
            orderDirection: asc
            first: 200
        ) {
            id kind patient delegatee expiresAt allowSubDelegate timestamp txHash
        }
        emergencyEvents(
            where: { timestamp_gt: $sinceEmergency }
            orderBy: timestamp
            orderDirection: asc
            first: 200
        ) {
            id patient grantee rootCidHash expireAt timestamp txHash
        }
        delegationAccessGrants(
            where: { timestamp_gt: $sinceDelegationAccess }
            orderBy: timestamp
            orderDirection: asc
            first: 200
        ) {
            id patient newGrantee byDelegatee rootCidHash timestamp txHash
        }
        doctors(
            where: { verifiedAt_gt: $sinceDoctorVerified, verified: true }
            orderBy: verifiedAt
            orderDirection: asc
            first: 200
        ) {
            id address verifiedAt
        }
    }
`;

async function syncOnce() {
    const [sinceConsent, sinceDelegation, sinceEmergency, sinceDelegationAccess, sinceDoctorVerified] = await Promise.all([
        getCursor(CURSOR_KEYS.consent),
        getCursor(CURSOR_KEYS.delegation),
        getCursor(CURSOR_KEYS.emergency),
        getCursor(CURSOR_KEYS.delegationAccess),
        getCursor(CURSOR_KEYS.doctorVerified),
    ]);

    let data;
    try {
        data = await gql(QUERY, {
            sinceConsent: sinceConsent.toString(),
            sinceDelegation: sinceDelegation.toString(),
            sinceEmergency: sinceEmergency.toString(),
            sinceDelegationAccess: sinceDelegationAccess.toString(),
            sinceDoctorVerified: sinceDoctorVerified.toString(),
        });
    } catch (err) {
        // Strict mode: log + skip cycle. Caller's setInterval will retry next tick.
        log.error('Subgraph fetch failed — skipping cycle', { error: err.message });
        return;
    }

    const counts = {
        consent: data.consentEvents?.length ?? 0,
        delegation: data.delegationEvents?.length ?? 0,
        emergency: data.emergencyEvents?.length ?? 0,
        delegationAccess: data.delegationAccessGrants?.length ?? 0,
        doctorVerified: data.doctors?.length ?? 0,
    };
    const total = counts.consent + counts.delegation + counts.emergency + counts.delegationAccess + counts.doctorVerified;
    if (total === 0) return;

    log.info('Processing subgraph batch', counts);

    // Apply ConsentEvent (granted | revoked).
    for (const row of data.consentEvents ?? []) {
        try {
            const event = shapeConsentEvent(row);
            if (row.kind === 'granted') {
                await handleConsentGranted(event);
            } else if (row.kind === 'revoked') {
                await handleConsentRevoked(event);
            } else {
                log.warn('Unknown ConsentEvent.kind', { id: row.id, kind: row.kind });
                continue;
            }
            await setCursor(CURSOR_KEYS.consent, BigInt(row.timestamp));
        } catch (err) {
            log.error('ConsentEvent handler failed', { id: row.id, error: err.message });
            // Don't advance cursor on error — next cycle retries.
            break;
        }
    }

    // Apply EmergencyEvent.
    for (const row of data.emergencyEvents ?? []) {
        try {
            await handleEmergencyGranted(shapeEmergencyEvent(row));
            await setCursor(CURSOR_KEYS.emergency, BigInt(row.timestamp));
        } catch (err) {
            log.error('EmergencyEvent handler failed', { id: row.id, error: err.message });
            break;
        }
    }

    // Apply DelegationEvent (granted | revoked).
    for (const row of data.delegationEvents ?? []) {
        try {
            const event = shapeDelegationEvent(row);
            if (row.kind === 'granted') {
                await handleDelegationGranted(event);
            } else if (row.kind === 'revoked') {
                await handleDelegationRevoked(event);
            } else {
                log.warn('Unknown DelegationEvent.kind', { id: row.id, kind: row.kind });
                continue;
            }
            await setCursor(CURSOR_KEYS.delegation, BigInt(row.timestamp));
        } catch (err) {
            log.error('DelegationEvent handler failed', { id: row.id, error: err.message });
            break;
        }
    }

    // Apply DelegationAccessGrant.
    for (const row of data.delegationAccessGrants ?? []) {
        try {
            await handleAccessGrantedViaDelegation(shapeDelegationAccessGrant(row));
            await setCursor(CURSOR_KEYS.delegationAccess, BigInt(row.timestamp));
        } catch (err) {
            log.error('DelegationAccessGrant handler failed', { id: row.id, error: err.message });
            break;
        }
    }

    // Doctor verifications: invalidate roleCache so middleware re-reads fresh
    // flags on the next request instead of waiting ROLE_CACHE_TTL_MS.
    for (const row of data.doctors ?? []) {
        try {
            const addr = String(row.address || row.id || '').toLowerCase();
            if (addr) {
                invalidateRoleCache(addr);
                log.info('roleCache invalidated for newly-verified doctor', { addr });
            }
            await setCursor(CURSOR_KEYS.doctorVerified, BigInt(row.verifiedAt));
        } catch (err) {
            log.error('Doctor verification handler failed', { id: row.id, error: err.message });
            break;
        }
    }
}

let pollHandle = null;

export function startSubgraphSync() {
    if (!isSubgraphConfigured) {
        log.warn('SUBGRAPH_URL not set — subgraph sync disabled');
        return;
    }

    log.info('Starting subgraph sync worker', { url: process.env.SUBGRAPH_URL, pollMs: POLL_MS });

    // Run once immediately on boot, then on the interval.
    syncOnce().catch((err) => log.error('Initial syncOnce failed', { error: err.message }));
    pollHandle = setInterval(() => {
        syncOnce().catch((err) => log.error('Periodic syncOnce failed', { error: err.message }));
    }, POLL_MS);
}

export function stopSubgraphSync() {
    if (pollHandle) {
        clearInterval(pollHandle);
        pollHandle = null;
        log.info('Stopped subgraph sync worker');
    }
}

export default { startSubgraphSync, stopSubgraphSync };
