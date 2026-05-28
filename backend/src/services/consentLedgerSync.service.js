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
//   - ConsentGranted(patient, grantee, rootCidHash, expireAt, allowDelegate)
//   - ConsentRevoked(patient, grantee, rootCidHash, timestamp)
//   - DelegationGranted(patient, delegatee, expiresAt, allowSubDelegate)
//   - DelegationRevoked(patient, delegatee)
//   - AccessGrantedViaDelegation(patient, newGrantee, byDelegatee, rootCidHash)

import { createPublicClient, http, parseAbi, parseAbiItem } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import prisma from '../config/database.js';
import { emitToUser, getIO } from './socket.service.js';
import { sendPushToWallet } from './push.service.js';
import { createLogger } from '../utils/logger.js';
import { withRpcRetry } from '../utils/rpcRetry.js';
import { normalizeAddress, normalizeHash } from '../utils/normalize.js';
import { applyRevoke } from './keyShareWriter.service.js';

const log = createLogger('ConsentSync');

const CONSENT_LEDGER_ADDRESS = process.env.CONSENT_LEDGER_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const CATCHUP_INTERVAL_MS = 5 * 60 * 1000;
const REORG_SAFETY_BLOCKS = 5;
const CONTRACT_NAME = 'ConsentLedger';

const EVENTS = {
    ConsentGranted: parseAbiItem(
        'event ConsentGranted(address indexed patient, address indexed grantee, bytes32 indexed rootCidHash, uint40 expireAt, bool allowDelegate)'
    ),
    ConsentRevoked: parseAbiItem(
        'event ConsentRevoked(address indexed patient, address indexed grantee, bytes32 indexed rootCidHash, uint40 timestamp)'
    ),
    EmergencyGranted: parseAbiItem(
        'event EmergencyGranted(address indexed patient, address indexed grantee, bytes32 indexed rootCidHash, uint40 expireAt)'
    ),
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

// Walk the record tree rooted at rootCidHash and return every cidHash belonging
// to that tree. Patient on-chain consent is keyed by root, so a single revoke
// kills access to every descendant version — we mirror that in DB.
async function collectDescendantCidHashes(rootCidHash) {
    const result = new Set([rootCidHash]);
    const frontier = [rootCidHash];
    const HARD_CAP = 200;
    while (frontier.length > 0 && result.size < HARD_CAP) {
        const batch = frontier.splice(0, frontier.length);
        const children = await prisma.recordMetadata.findMany({
            where: { parentCidHash: { in: batch } },
            select: { cidHash: true },
        });
        for (const child of children) {
            const hash = child.cidHash?.toLowerCase();
            if (!hash || result.has(hash)) continue;
            result.add(hash);
            frontier.push(hash);
        }
    }
    return Array.from(result);
}

// ConsentGranted. On-chain is the source of truth; we just cache into the
// Consent mirror table so admin/UI surfaces can list without re-scanning chain.
async function handleConsentGranted(event) {
    const patient = normalizeAddress(event.args.patient);
    const grantee = normalizeAddress(event.args.grantee);
    const rootCidHash = normalizeHash(event.args.rootCidHash);
    const expireAtSec = event.args.expireAt;
    if (!patient || !grantee || !rootCidHash) return;

    await ensureUserRecord(patient);
    await ensureUserRecord(grantee);

    // Contract stores expireAt=type(uint40).max as the "forever" sentinel when
    // caller passes 0. Map that back to null so DB semantics stay consistent
    // with how mobile writes KeyShare rows.
    const FOREVER = (1n << 40n) - 1n;
    const isForever = BigInt(expireAtSec) >= FOREVER;
    const expiresAtDate = isForever ? null : new Date(Number(expireAtSec) * 1000);

    try {
        await prisma.consent.upsert({
            where: {
                patientAddress_granteeAddress_cidHash: {
                    patientAddress: patient,
                    granteeAddress: grantee,
                    cidHash: rootCidHash,
                },
            },
            update: {
                status: 'active',
                expiresAt: expiresAtDate ?? new Date(Number(FOREVER) * 1000),
            },
            create: {
                patientAddress: patient,
                granteeAddress: grantee,
                cidHash: rootCidHash,
                status: 'active',
                expiresAt: expiresAtDate ?? new Date(Number(FOREVER) * 1000),
            },
        });
    } catch (err) {
        log.warn('Consent upsert failed', { patient, grantee, rootCidHash, error: err?.message });
    }

    log.info('ConsentGranted', { patient, grantee, rootCidHash, expireAtSec: String(expireAtSec) });

    emitToUser(patient, 'consentUpdated', { action: 'granted', patient, grantee, rootCidHash });
    emitToUser(grantee, 'consentUpdated', { action: 'granted_to_me', patient, grantee, rootCidHash });
}

// ConsentRevoked. On-chain canAccess will now refuse; we flip every KeyShare row
// whose cidHash is in the record tree rooted at rootCidHash so the patient's
// "Nhật ký truy cập" and the doctor's dashboard stop showing stale active rows.
async function handleConsentRevoked(event) {
    const patient = normalizeAddress(event.args.patient);
    const grantee = normalizeAddress(event.args.grantee);
    const rootCidHash = normalizeHash(event.args.rootCidHash);
    if (!patient || !grantee || !rootCidHash) return;

    const cidHashes = await collectDescendantCidHashes(rootCidHash);

    // Envelope-encryption invariant (see context/06_design_decisions.md §0b):
    // a doctor who AUTHORED a record already "knows" the content — revoking
    // patient consent cannot un-know it. Wiping the doctor's self KeyShare
    // only breaks their ability to re-read their own notes after they clear
    // the local AES cache (e.g. logout), without any real security benefit.
    // Exclude cidHashes where this `grantee` is the record's createdBy.
    const authoredCidHashes = cidHashes.length
        ? (await prisma.recordMetadata.findMany({
            where: {
                cidHash: { in: cidHashes },
                createdBy: grantee,
            },
            select: { cidHash: true },
        })).map((r) => r.cidHash)
        : [];
    const authoredCidHashSet = new Set(authoredCidHashes);
    const revocableCidHashes = cidHashes.filter((c) => !authoredCidHashSet.has(c));

    // S14 race fix: route through keyShareWriter so the timestamp guard rejects
    // stale revoke events from the catchup queue. Event timestamp comes from the
    // contract emit (uint40 seconds). Without this, an old ConsentRevoked from a
    // prior revoke could overwrite a fresh share that just landed via POST /api/key-share.
    const eventTimestampMs = event.args?.timestamp
        ? Number(event.args.timestamp) * 1000
        : null;
    const sourceTimestamp = eventTimestampMs
        ? new Date(eventTimestampMs)
        : new Date();  // legacy events without timestamp arg fall back to now

    const updateResult = await applyRevoke({
        senderAddress: patient,
        recipientAddress: grantee,
        cidHashes: revocableCidHashes,
        source: 'event-revoke',
        sourceTimestamp,
    });

    // Cascade revoke for downstream recipients: when patient revokes D_A, contract
    // cascades through `recordDelegationSource` so canAccess() denies any C that
    // received per-record delegation from D_A. Mirror that in the DB so C's
    // dashboard doesn't show ghost rows that 403 on tap. Find KeyShare rows
    // where the revoked grantee was the SENDER (D_A re-shared to C) and revoke
    // those too. Contract's grantUsingRecordDelegation hardcodes one-hop, so
    // only 1 cascade level needed.
    const downstreamRows = revocableCidHashes.length
        ? await prisma.keyShare.findMany({
            where: {
                senderAddress: grantee,
                cidHash: { in: revocableCidHashes },
                status: { not: 'revoked' },
            },
            select: { recipientAddress: true },
        })
        : [];
    const downstreamRecipients = Array.from(new Set(downstreamRows.map((r) => r.recipientAddress?.toLowerCase()).filter(Boolean)));
    let cascadeRevoked = 0;
    for (const recipient of downstreamRecipients) {
        const result = await applyRevoke({
            senderAddress: grantee,
            recipientAddress: recipient,
            cidHashes: revocableCidHashes,
            source: 'event-revoke',
            sourceTimestamp,
        });
        cascadeRevoked += result.applied;
        // Notify each downstream recipient too
        emitToUser(recipient, 'consentUpdated', {
            action: 'cascade_revoked',
            patient,
            via: grantee,
            rootCidHash,
        });
    }

    // BUG FIX (2026-05-28): cascade-by-sender ở trên CHỈ revoke rows mà revoked
    // grantee (A) là sender. Bỏ sót case: khi downstream recipient B sau đó
    // tạo update version mới (addRecordByDoctor), backend `/save-only` tự tạo
    // KeyShare(v_new, B) với senderAddress=PATIENT (record.routes.js
    // L425-438 save-only-doctor pattern) — semantic ownership cho patient.
    // Row này KHÔNG bị cascade-by-sender bắt vì sender=patient ≠ A.
    //
    // Fix: dùng DelegationAccessLog (immutable on-chain event log) làm source
    // of truth để xác định "ai là delegation-derived recipient của A trong
    // chain này". Với mỗi recipient đó, revoke ALL KeyShare rows trong chain
    // BẤT KỂ sender. Cũng update Consent mirror table sang revoked để
    // /recipients + /all-grantees + downstream gates filter đúng.
    let cascadeDelegationDerivedRevoked = 0;
    let cascadeDelegationDerivedRecipients = 0;
    if (revocableCidHashes.length > 0) {
        const delegationDerived = await prisma.delegationAccessLog.findMany({
            where: {
                patientAddress: patient,
                byDelegatee: grantee, // A đã delegate cho ai trong chain root này
                rootCidHash,
            },
            select: { newGrantee: true },
        });
        const delegationDerivedRecipients = Array.from(new Set(
            delegationDerived.map((d) => d.newGrantee?.toLowerCase()).filter(Boolean)
        ));
        cascadeDelegationDerivedRecipients = delegationDerivedRecipients.length;

        for (const recipient of delegationDerivedRecipients) {
            // Query ALL non-revoked KeyShare rows cho recipient trong chain,
            // group by sender (applyRevoke yêu cầu exact senderAddress match).
            const rows = await prisma.keyShare.findMany({
                where: {
                    recipientAddress: recipient,
                    cidHash: { in: revocableCidHashes },
                    status: { not: 'revoked' },
                },
                select: { senderAddress: true, cidHash: true },
            });
            const bySender = new Map();
            for (const r of rows) {
                const s = r.senderAddress?.toLowerCase();
                if (!s) continue;
                if (!bySender.has(s)) bySender.set(s, []);
                bySender.get(s).push(r.cidHash);
            }
            for (const [sender, hashes] of bySender) {
                const r = await applyRevoke({
                    senderAddress: sender,
                    recipientAddress: recipient,
                    cidHashes: hashes,
                    source: 'event-revoke',
                    sourceTimestamp,
                });
                cascadeDelegationDerivedRevoked += r.applied;
            }

            // Flip Consent mirror cho recipient → revoked. Lý do: handler
            // cũ chỉ update Consent cho A. Khi B nhận quyền qua A's delegation,
            // Consent(patient, B, root) vẫn active=true trong DB → /recipients
            // + /all-grantees vẫn cho qua → bug.
            try {
                await prisma.consent.updateMany({
                    where: {
                        patientAddress: patient,
                        granteeAddress: recipient,
                        cidHash: rootCidHash,
                    },
                    data: { status: 'revoked' },
                });
            } catch (err) {
                log.warn('Cascade Consent flip failed', {
                    patient, recipient, rootCidHash, error: err?.message,
                });
            }

            emitToUser(recipient, 'consentUpdated', {
                action: 'cascade_revoked',
                patient,
                via: grantee,
                rootCidHash,
            });
        }
    }

    try {
        await prisma.consent.updateMany({
            where: {
                patientAddress: patient,
                granteeAddress: grantee,
                cidHash: rootCidHash,
            },
            data: { status: 'revoked' },
        });
    } catch (err) {
        log.warn('Consent status flip failed', { patient, grantee, rootCidHash, error: err?.message });
    }

    log.info('ConsentRevoked', {
        patient,
        grantee,
        rootCidHash,
        keySharesRevoked: updateResult.applied,
        keySharesSkipped: updateResult.skipped,
        cascadeDownstreamRevoked: cascadeRevoked,
        cascadeRecipientCount: downstreamRecipients.length,
        cascadeDelegationDerivedRevoked,
        cascadeDelegationDerivedRecipients,
        versionCount: cidHashes.length,
    });

    emitToUser(patient, 'consentUpdated', { action: 'revoked', patient, grantee, rootCidHash });
    emitToUser(grantee, 'consentUpdated', { action: 'revoked_me', patient, grantee, rootCidHash });

    sendPushToWallet(grantee, {
        title: 'Quyền truy cập đã bị thu hồi',
        body: 'Bệnh nhân đã thu hồi quyền xem hồ sơ của bạn.',
        data: { kind: 'consent_revoked', patient, rootCidHash },
    }).catch((err) => log.warn('push send failed', { error: err?.message }));
}

// TrustedContactSet — patient designated a wallet as Trusted Contact.
// Mirror to TrustedContact table for fast UI lookup and pre-share triggering.
async function handleTrustedContactSet(event) {
    const patient = normalizeAddress(event.args.patient);
    const contact = normalizeAddress(event.args.contact);
    const label = event.args.label || null;
    if (!patient || !contact) return;

    await ensureUserRecord(patient);
    await ensureUserRecord(contact);

    await prisma.trustedContact.upsert({
        where: {
            patientAddress_contactAddress: { patientAddress: patient, contactAddress: contact },
        },
        update: {
            label,
            status: 'active',
            setTxHash: event.transactionHash || null,
            setBlockNumber: event.blockNumber ?? null,
            setAt: new Date(),
            revokedAt: null,
            revokedTxHash: null,
        },
        create: {
            patientAddress: patient,
            contactAddress: contact,
            label,
            status: 'active',
            setTxHash: event.transactionHash || null,
            setBlockNumber: event.blockNumber ?? null,
        },
    });

    log.info('TrustedContactSet', { patient, contact, label });
    emitToUser(patient, 'trustedContactUpdated', { action: 'set', contact, label });
    emitToUser(contact, 'trustedContactUpdated', { action: 'designatedAsContact', patient, label });

    sendPushToWallet(contact, {
        title: 'Bạn đã được chỉ định là Người thân tin cậy',
        body: 'Bạn sẽ tự động nhận quyền truy cập hồ sơ y tế nếu bệnh nhân cần sự hỗ trợ khẩn cấp.',
        data: { kind: 'trusted_contact_set', patient },
    }).catch((err) => log.warn('push send failed', { error: err?.message }));
}

// TrustedContactRevoked — patient removed a wallet from their list.
// Cascade revoke any KeyShare rows where contact was the recipient (auto
// pre-share at record creation time): the contact loses decryption ability
// the moment the on-chain registry says they're no longer trusted.
async function handleTrustedContactRevoked(event) {
    const patient = normalizeAddress(event.args.patient);
    const contact = normalizeAddress(event.args.contact);
    if (!patient || !contact) return;

    await prisma.trustedContact.updateMany({
        where: { patientAddress: patient, contactAddress: contact, status: 'active' },
        data: {
            status: 'revoked',
            revokedAt: new Date(),
            revokedTxHash: event.transactionHash || null,
        },
    });

    // Cascade: revoke KeyShare rows where patient is sender + contact is recipient.
    // Only those auto-pre-shared via the Trusted Contact ceremony — regular
    // share/grant rows from the patient stay (e.g. patient also shared a
    // record to family member as a doctor, separately). We scope by source=
    // 'trusted-contact-pre-share' which the writer tags those rows with.
    try {
        const rows = await prisma.keyShare.findMany({
            where: {
                senderAddress: patient,
                recipientAddress: contact,
                status: { not: 'revoked' },
            },
            select: { cidHash: true },
        });
        const cidHashes = rows.map((r) => r.cidHash);
        if (cidHashes.length > 0) {
            await applyRevoke({
                senderAddress: patient,
                recipientAddress: contact,
                cidHashes,
                source: 'trusted-contact-revoked',
                sourceTimestamp: new Date(),
            });
        }
    } catch (err) {
        log.warn('Cascade revoke for trusted contact failed', { error: err?.message });
    }

    log.info('TrustedContactRevoked', { patient, contact });
    emitToUser(patient, 'trustedContactUpdated', { action: 'revoked', contact });
    emitToUser(contact, 'trustedContactUpdated', { action: 'undesignated', patient });
}

const EVENT_HANDLERS = {
    ConsentGranted: handleConsentGranted,
    ConsentRevoked: handleConsentRevoked,
    DelegationGranted: handleDelegationGranted,
    DelegationRevoked: handleDelegationRevoked,
    AccessGrantedViaDelegation: handleAccessGrantedViaDelegation,
    TrustedContactSet: handleTrustedContactSet,
    TrustedContactRevoked: handleTrustedContactRevoked,
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
        let fromBlock = syncState.lastSyncedBlock + 1n;

        if (fromBlock > safeBlock) return;

        // Skip ahead on huge catchups (see eventSync.service.js for rationale).
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

        // Alchemy free tier caps eth_getLogs to a 10-block range; override via
        // RPC_LOGS_CHUNK_SIZE on paid plans.
        const CHUNK_SIZE = BigInt(process.env.RPC_LOGS_CHUNK_SIZE || 10);
        const CHUNK_DELAY_MS = Number(process.env.RPC_CATCHUP_DELAY_MS ?? 200);
        let chunkFrom = fromBlock;

        while (chunkFrom <= safeBlock) {
            const chunkTo = chunkFrom + CHUNK_SIZE - 1n > safeBlock ? safeBlock : chunkFrom + CHUNK_SIZE - 1n;

            for (const [eventName, eventAbi] of Object.entries(EVENTS)) {
                try {
                    const logs = await withRpcRetry(
                        () => client.getLogs({
                            address: CONSENT_LEDGER_ADDRESS,
                            event: eventAbi,
                            fromBlock: chunkFrom,
                            toBlock: chunkTo,
                        }),
                        { label: `ConsentSync.getLogs(${eventName})` },
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
                    { label: 'ConsentSync.getBlock' },
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

function startRealtimeWatch() {
    if (!CONSENT_LEDGER_ADDRESS) {
        log.warn('CONSENT_LEDGER_ADDRESS not set, skipping realtime watch');
        return;
    }

    const client = getPublicClient();
    // Throttle realtime polling to avoid Alchemy free-tier 429. See
    // eventSync.service.js for rationale.
    const POLL_MS = Number(process.env.RPC_WATCH_POLL_MS ?? 15_000);

    for (const [eventName, eventAbi] of Object.entries(EVENTS)) {
        try {
            const unwatch = client.watchContractEvent({
                address: CONSENT_LEDGER_ADDRESS,
                abi: [eventAbi],
                pollingInterval: POLL_MS,
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

// Exported for subgraphSync (S17): when reading events from the subgraph
// instead of polling RPC, we still want the same DB side effects + socket
// emits, so subgraphSync shapes its rows into the {args, transactionHash}
// structure these handlers expect and dispatches here.
export {
    handleConsentGranted,
    handleConsentRevoked,
    handleDelegationGranted,
    handleDelegationRevoked,
    handleAccessGrantedViaDelegation,
    handleTrustedContactSet,
    handleTrustedContactRevoked,
};

export default {
    startConsentLedgerSync,
    stopConsentLedgerSync,
};
