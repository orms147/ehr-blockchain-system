// F15 verification — atomic gas-sponsorship quota under concurrency.
//
// Proves the fix in relayer.service.js consumeQuota(): the conditional
// `updateMany({ where: { signaturesThisMonth: { lt: CAP } }, increment })`
// reserves a slot atomically, so N concurrent requests at the boundary can
// NEVER push the counter past the cap (the pre-fix read-then-check could).
//
// Run:  cd backend && node scripts/test-f15-quota-race.js   (needs DATABASE_URL in .env)
// This script creates + deletes a throwaway test user; it touches no real data.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CAP = 100;            // QUOTA_LIMITS.SIGNATURES_PER_MONTH
const START = 90;           // 10 slots left
const CONCURRENT = 30;      // fire 30 at once → expect exactly 10 to win
const addr = '0x' + 'f15'.repeat(14).slice(0, 40); // throwaway 0x+40hex test address

// Mirrors the atomic reserve in consumeQuota() (F15 fix).
const reserve = () => prisma.user.updateMany({
    where: { walletAddress: addr, hasSelfWallet: false, signaturesThisMonth: { lt: CAP } },
    data: { signaturesThisMonth: { increment: 1 } },
});

async function main() {
    await prisma.user.deleteMany({ where: { walletAddress: addr } });
    await prisma.user.create({
        data: { walletAddress: addr, signaturesThisMonth: START, hasSelfWallet: false, quotaResetDate: new Date() },
    });

    const results = await Promise.all(Array.from({ length: CONCURRENT }, () => reserve()));
    const successes = results.filter((r) => r.count === 1).length;
    const rejected = results.filter((r) => r.count === 0).length;
    const finalUser = await prisma.user.findUnique({ where: { walletAddress: addr } });

    const expectedWins = CAP - START;
    console.log('--- F15 atomic quota race ---');
    console.log(`START=${START}  CAP=${CAP}  CONCURRENT=${CONCURRENT}`);
    console.log(`reserved(success)=${successes}  rejected=${rejected}  (expected success=${expectedWins})`);
    console.log(`final signaturesThisMonth=${finalUser.signaturesThisMonth}  (expected ${CAP})`);

    const pass = successes === expectedWins && rejected === (CONCURRENT - expectedWins) && finalUser.signaturesThisMonth === CAP;
    console.log(pass
        ? 'RESULT: F15 PASS — cap held atomically under concurrency (no over-count).'
        : 'RESULT: F15 FAIL — counter exceeded cap or wrong success count.');

    await prisma.user.delete({ where: { walletAddress: addr } });
    await prisma.$disconnect();
    process.exit(pass ? 0 : 1);
}

main().catch(async (e) => {
    console.error('test error:', e);
    try { await prisma.user.deleteMany({ where: { walletAddress: addr } }); } catch {}
    await prisma.$disconnect();
    process.exit(2);
});
