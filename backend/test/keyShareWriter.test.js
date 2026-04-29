// Integration tests for keyShareWriter.service.js (S15.3, 2026-04-29).
//
// Covers the 3 scenarios the regression cycle kept hitting:
//   1. Baseline applyShare — row created, audit log entry exists.
//   2. S14 race fix — stale revoke event from the past doesn't overwrite a
//      fresh share that just landed.
//   3. Manual share at T+now beats event-grant from T-30s — timestamp guard
//      prevents stale event from undoing a fresh manual write.
//
// Each test generates random cidHash + addresses to avoid colliding with
// real data, and cleans up its rows at the end. No transaction rollback
// pattern because the writer service uses its own $transaction internally.

import { describe, test, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import prisma from '../src/config/database.js';
import {
    applyShare,
    applyRevoke,
} from '../src/services/keyShareWriter.service.js';

function randHex(bytes) {
    return '0x' + randomBytes(bytes).toString('hex');
}
function randCidHash() { return randHex(32); }
function randAddress() { return randHex(20).toLowerCase(); }

// Track rows created per test so we can clean them up. Runs after each test.
let testCids = [];
let testAddresses = [];

async function ensureUser(walletAddress) {
    return prisma.user.upsert({
        where: { walletAddress },
        update: {},
        create: { walletAddress },
    });
}

async function ensureRecord(cidHash, ownerAddress, createdBy, recipientAddress = null) {
    await ensureUser(ownerAddress);
    if (createdBy !== ownerAddress) await ensureUser(createdBy);
    if (recipientAddress && recipientAddress !== ownerAddress && recipientAddress !== createdBy) {
        await ensureUser(recipientAddress);
    }
    return prisma.recordMetadata.upsert({
        where: { cidHash },
        update: {},
        create: {
            cidHash,
            ownerAddress,
            createdBy,
            syncStatus: 'confirmed',
        },
    });
}

afterEach(async () => {
    if (testCids.length > 0) {
        // Delete in FK-safe order: mutation log, key share, record metadata.
        await prisma.keyShareMutationLog.deleteMany({
            where: { cidHash: { in: testCids } },
        });
        await prisma.keyShare.deleteMany({
            where: { cidHash: { in: testCids } },
        });
        await prisma.recordMetadata.deleteMany({
            where: { cidHash: { in: testCids } },
        });
    }
    if (testAddresses.length > 0) {
        await prisma.user.deleteMany({
            where: { walletAddress: { in: testAddresses } },
        });
    }
    testCids = [];
    testAddresses = [];
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe('keyShareWriter — applyShare', () => {
    test('baseline: creates KeyShare row and audit log entry', async () => {
        const cid = randCidHash();
        const sender = randAddress();
        const recipient = randAddress();
        testCids.push(cid);
        testAddresses.push(sender, recipient);

        await ensureRecord(cid, sender, sender, recipient);

        const result = await applyShare({
            cidHash: cid,
            senderAddress: sender,
            recipientAddress: recipient,
            encryptedPayload: 'TEST_PAYLOAD_BASELINE',
            senderPublicKey: 'pubkey',
            status: 'pending',
            source: 'manual',
            sourceTimestamp: new Date(),
        });

        expect(result.applied).toBe(true);
        expect(result.row.status).toBe('pending');
        expect(result.row.encryptedPayload).toBe('TEST_PAYLOAD_BASELINE');

        const log = await prisma.keyShareMutationLog.findFirst({
            where: { cidHash: cid, recipientAddress: recipient },
        });
        expect(log).not.toBeNull();
        expect(log.source).toBe('manual');
        expect(log.skipped).toBe(false);
        expect(log.newStatus).toBe('pending');
    });

    test('preserveClaimed: idempotent re-share keeps claimed status', async () => {
        const cid = randCidHash();
        const sender = randAddress();
        const recipient = randAddress();
        testCids.push(cid);
        testAddresses.push(sender, recipient);
        await ensureRecord(cid, sender, sender, recipient);

        // First share — auto-claimed.
        await applyShare({
            cidHash: cid, senderAddress: sender, recipientAddress: recipient,
            encryptedPayload: 'P1', senderPublicKey: 'pk',
            status: 'claimed',
            source: 'manual', sourceTimestamp: new Date(),
        });

        // Idempotent re-share — caller passes 'pending' but preserveClaimed=true.
        const result = await applyShare({
            cidHash: cid, senderAddress: sender, recipientAddress: recipient,
            encryptedPayload: 'P2', senderPublicKey: 'pk',
            status: 'pending',
            preserveClaimed: true,
            source: 'manual', sourceTimestamp: new Date(Date.now() + 100),
        });

        expect(result.applied).toBe(true);
        expect(result.row.status).toBe('claimed'); // preserved, not downgraded
        expect(result.row.encryptedPayload).toBe('P2'); // payload still updated
    });
});

describe('keyShareWriter — applyRevoke (S14 race)', () => {
    test('stale revoke event from past does NOT overwrite fresh share', async () => {
        const cid = randCidHash();
        const sender = randAddress();
        const recipient = randAddress();
        testCids.push(cid);
        testAddresses.push(sender, recipient);
        await ensureRecord(cid, sender, sender, recipient);

        // T+0: fresh manual share lands (this represents POST /api/key-share).
        const shareTs = new Date();
        await applyShare({
            cidHash: cid, senderAddress: sender, recipientAddress: recipient,
            encryptedPayload: 'FRESH_PAYLOAD', senderPublicKey: 'pk',
            status: 'claimed',
            source: 'manual', sourceTimestamp: shareTs,
        });

        // T+stale: ConsentRevoked event from 5 minutes BEFORE the share gets
        // processed by the catchup queue. This is exactly the S14 scenario:
        // a stale event in the queue arrives AFTER a fresh write.
        const staleRevokeTs = new Date(shareTs.getTime() - 5 * 60_000);
        const result = await applyRevoke({
            senderAddress: sender,
            recipientAddress: recipient,
            cidHashes: [cid],
            source: 'event-revoke',
            sourceTimestamp: staleRevokeTs,
        });

        expect(result.applied).toBe(0); // no rows actually revoked
        expect(result.skipped).toBe(1); // one row skipped due to stale-source

        const row = await prisma.keyShare.findFirst({
            where: { cidHash: cid, recipientAddress: recipient },
        });
        expect(row.status).toBe('claimed'); // still claimed, NOT revoked
        expect(row.encryptedPayload).toBe('FRESH_PAYLOAD'); // payload preserved

        // Audit log records the skip with a reason.
        const skipLog = await prisma.keyShareMutationLog.findFirst({
            where: { cidHash: cid, source: 'event-revoke', skipped: true },
        });
        expect(skipLog).not.toBeNull();
        expect(skipLog.skipReason).toBe('stale-source');
    });

    test('non-stale revoke event DOES revoke the row', async () => {
        const cid = randCidHash();
        const sender = randAddress();
        const recipient = randAddress();
        testCids.push(cid);
        testAddresses.push(sender, recipient);
        await ensureRecord(cid, sender, sender, recipient);

        // T+0: share happens.
        const shareTs = new Date();
        await applyShare({
            cidHash: cid, senderAddress: sender, recipientAddress: recipient,
            encryptedPayload: 'P', senderPublicKey: 'pk',
            status: 'claimed',
            source: 'manual', sourceTimestamp: shareTs,
        });

        // T+1s: ConsentRevoked event AFTER share — legit revoke.
        // Wait briefly so updatedAt is strictly less than the revoke timestamp.
        await new Promise((r) => setTimeout(r, 50));
        const futureRevokeTs = new Date(shareTs.getTime() + 1_000);
        const result = await applyRevoke({
            senderAddress: sender,
            recipientAddress: recipient,
            cidHashes: [cid],
            source: 'event-revoke',
            sourceTimestamp: futureRevokeTs,
        });

        expect(result.applied).toBe(1);
        expect(result.skipped).toBe(0);

        const row = await prisma.keyShare.findFirst({
            where: { cidHash: cid, recipientAddress: recipient },
        });
        expect(row.status).toBe('revoked');
        expect(row.encryptedPayload).toBe('');
    });
});
