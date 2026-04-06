/**
 * backfill-org-chainId.js
 *
 * One-off script to backfill Organization records missing chainOrgId.
 * For each org without chainOrgId, lookup admin address on-chain via getAdminOrgId.
 *
 * Usage: node --experimental-modules backend/src/scripts/backfill-org-chainId.js
 */

import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import prisma from '../config/database.js';
import { ACCESS_CONTROL_ABI } from '../config/blockchain.js';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../../../.env', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });

const ACCESS_CONTROL_ADDRESS = process.env.ACCESS_CONTROL_ADDRESS;

if (!ACCESS_CONTROL_ADDRESS) {
    console.error('[Backfill] ACCESS_CONTROL_ADDRESS not set in .env');
    process.exit(1);
}

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL),
});

async function main() {
    console.log('[Backfill] Finding organizations without chainOrgId...');

    const orgs = await prisma.organization.findMany({
        where: { chainOrgId: null },
    });

    if (orgs.length === 0) {
        console.log('[Backfill] All organizations already have chainOrgId. Nothing to do.');
        return;
    }

    console.log(`[Backfill] Found ${orgs.length} organization(s) without chainOrgId.`);

    let updated = 0;
    let skipped = 0;

    for (const org of orgs) {
        const adminAddress = org.address;
        if (!adminAddress) {
            console.warn(`[Backfill] Org "${org.name}" (id=${org.id}) has no admin address. Skipping.`);
            skipped++;
            continue;
        }

        try {
            const adminOrgId = await publicClient.readContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'getAdminOrgId',
                args: [adminAddress],
            });

            if (adminOrgId > 0n) {
                await prisma.organization.update({
                    where: { id: org.id },
                    data: { chainOrgId: adminOrgId },
                });
                console.log(`[Backfill] ✅ "${org.name}" → chainOrgId=${adminOrgId.toString()}`);
                updated++;
            } else {
                console.warn(`[Backfill] ⚠️ "${org.name}" (admin=${adminAddress}) has no on-chain orgId. Not created on-chain yet.`);
                skipped++;
            }
        } catch (error) {
            console.error(`[Backfill] ❌ Error for "${org.name}":`, error.message);
            skipped++;
        }
    }

    console.log(`[Backfill] Done. Updated: ${updated}, Skipped: ${skipped}`);
}

main()
    .catch((error) => {
        console.error('[Backfill] Fatal error:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
