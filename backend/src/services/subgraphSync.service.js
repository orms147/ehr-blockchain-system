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
    handleDelegationGranted,
    handleDelegationRevoked,
    handleAccessGrantedViaDelegation,
    handleTrustedContactSet,
    handleTrustedContactRevoked,
} from './consentLedgerSync.service.js';

const log = createLogger('SubgraphSync');

const POLL_MS = Number(process.env.SUBGRAPH_POLL_MS ?? 30_000);

// We keep one cursor per entity type because they have different timestamp
// fields and a single GraphQL request fetches all of them in parallel.
const CURSOR_KEYS = {
    consent: 'subgraph:consentEvent:lastTimestamp',
    delegation: 'subgraph:delegationEvent:lastTimestamp',
    delegationAccess: 'subgraph:delegationAccessGrant:lastTimestamp',
    trustedContact: 'subgraph:trustedContactEvent:lastTimestamp',
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

function shapeTrustedContactEvent(row) {
    return {
        args: {
            patient: row.patient,
            contact: row.contact,
            label: row.label ?? null,
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

// In-memory set of doctor addresses whose VerificationRevoked we've already
// reconciled this process. The subgraph keeps `verifiedAt` on revoke (only flips
// verified=false, no revokedAt to cursor on), so we re-fetch the full
// verified=false set each cycle but act on each address once. Re-verification
// clears the address (see the verified loop) so a later revocation is handled
// again. Reset on restart → re-reconcile is idempotent (member flip is a no-op
// once already 'revoked').
const handledRevocations = new Set();

const QUERY = `
    query SubgraphSync(
        $sinceConsent: BigInt!,
        $sinceDelegation: BigInt!,
        $sinceDelegationAccess: BigInt!,
        $sinceTrustedContact: BigInt!,
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
        delegationAccessGrants(
            where: { timestamp_gt: $sinceDelegationAccess }
            orderBy: timestamp
            orderDirection: asc
            first: 200
        ) {
            id patient newGrantee byDelegatee rootCidHash timestamp txHash
        }
        trustedContactEvents(
            where: { timestamp_gt: $sinceTrustedContact }
            orderBy: timestamp
            orderDirection: asc
            first: 200
        ) {
            id kind patient contact label timestamp txHash
        }
        doctors(
            where: { verifiedAt_gt: $sinceDoctorVerified, verified: true }
            orderBy: verifiedAt
            orderDirection: asc
            first: 200
        ) {
            id address verifiedAt
        }
        revokedDoctors: doctors(
            where: { verified: false }
            orderBy: verifiedAt
            orderDirection: asc
            first: 200
        ) {
            id address
        }
    }
`;

async function syncOnce() {
    const [sinceConsent, sinceDelegation, sinceDelegationAccess, sinceTrustedContact, sinceDoctorVerified] = await Promise.all([
        getCursor(CURSOR_KEYS.consent),
        getCursor(CURSOR_KEYS.delegation),
        getCursor(CURSOR_KEYS.delegationAccess),
        getCursor(CURSOR_KEYS.trustedContact),
        getCursor(CURSOR_KEYS.doctorVerified),
    ]);

    let data;
    try {
        data = await gql(QUERY, {
            sinceConsent: sinceConsent.toString(),
            sinceDelegation: sinceDelegation.toString(),
            sinceDelegationAccess: sinceDelegationAccess.toString(),
            sinceTrustedContact: sinceTrustedContact.toString(),
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
        delegationAccess: data.delegationAccessGrants?.length ?? 0,
        trustedContact: data.trustedContactEvents?.length ?? 0,
        doctorVerified: data.doctors?.length ?? 0,
    };
    const total = counts.consent + counts.delegation + counts.delegationAccess + counts.trustedContact + counts.doctorVerified;
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

    // Apply TrustedContactEvent (set | revoked).
    for (const row of data.trustedContactEvents ?? []) {
        try {
            const event = shapeTrustedContactEvent(row);
            if (row.kind === 'set') {
                await handleTrustedContactSet(event);
            } else if (row.kind === 'revoked') {
                await handleTrustedContactRevoked(event);
            } else {
                log.warn('Unknown TrustedContactEvent.kind', { id: row.id, kind: row.kind });
                continue;
            }
            await setCursor(CURSOR_KEYS.trustedContact, BigInt(row.timestamp));
        } catch (err) {
            log.error('TrustedContactEvent handler failed', { id: row.id, error: err.message });
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
                // Re-verification resets revocation tracking so a future
                // VerificationRevoked for this doctor is reconciled again.
                handledRevocations.delete(addr);
                // On-chain DoctorVerified is the source of truth: finalize the
                // verification request only now (the /review endpoint no longer
                // marks it 'approved' optimistically — see verification.routes.js).
                // If the org's verifyDoctor tx had failed, no event fires and the
                // request stays 'pending' so the org can retry.
                await prisma.verificationRequest.updateMany({
                    where: { doctorAddress: addr, status: { in: ['pending', 'approving'] } },
                    data: { status: 'approved', reviewedAt: new Date() },
                });
                log.info('roleCache invalidated + verificationRequest finalized for newly-verified doctor', { addr });
            }
            await setCursor(CURSOR_KEYS.doctorVerified, BigInt(row.verifiedAt));
        } catch (err) {
            log.error('Doctor verification handler failed', { id: row.id, error: err.message });
            break;
        }
    }

    // Doctor verification REVOCATIONS: the subgraph flips Doctor.verified=false
    // on VerificationRevoked but keeps verifiedAt, so there is no timestamp to
    // cursor on. Reconcile the (small, bounded) ever-revoked set each cycle,
    // acting on each address once: invalidate the roleCache so middleware re-reads
    // the cleared on-chain flag before ROLE_CACHE_TTL_MS, and mirror the
    // revocation into the member cache as a backstop for a failed mobile
    // /revoke-member mirror. The security-critical gate is on-chain canAccess
    // (already immediate); this only keeps backend caches consistent.
    for (const row of data.revokedDoctors ?? []) {
        const addr = String(row.address || row.id || '').toLowerCase();
        if (!addr || handledRevocations.has(addr)) continue;
        try {
            invalidateRoleCache(addr);
            const flipped = await prisma.organizationMember.updateMany({
                where: { memberAddress: addr, status: { not: 'revoked' } },
                data: { status: 'revoked', leftAt: new Date() },
            });
            handledRevocations.add(addr);
            if (flipped.count > 0) {
                log.info('verification revoked → roleCache invalidated + member(s) flipped', { addr, members: flipped.count });
            }
        } catch (err) {
            log.error('Doctor revocation handler failed', { id: row.id, error: err.message });
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
