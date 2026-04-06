
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const CONSENT_LEDGER_ADDRESS = process.env.CONSENT_LEDGER_ADDRESS || '0xdF6b60e5887a4256ea7CA745Cf60CFfd9D5a4bff';

const CONSENT_LEDGER_ABI = [
    {
        name: 'canAccess',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'patient', type: 'address' },
            { name: 'grantee', type: 'address' },
            { name: 'cidHash', type: 'bytes32' }
        ],
        outputs: [{ type: 'bool' }]
    },
    {
        name: 'getConsent',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'patient', type: 'address' },
            { name: 'grantee', type: 'address' },
            { name: 'cidHash', type: 'bytes32' }
        ],
        outputs: [{
            type: 'tuple',
            components: [
                { name: 'patient', type: 'address' },
                { name: 'grantee', type: 'address' },
                { name: 'cidHash', type: 'bytes32' },
                { name: 'encKeyHash', type: 'bytes32' },
                { name: 'issuedAt', type: 'uint40' },
                { name: 'expireAt', type: 'uint40' },
                { name: 'active', type: 'bool' },
                { name: 'includeUpdates', type: 'bool' },
                { name: 'allowDelegate', type: 'bool' }
            ]
        }]
    }
];

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(RPC_URL),
});

const patient = '0x8Af0bc7D09299D8513E7Ac8ED094e322Ea4fbD0f';
const grantee = '0xCdFA0c21bba07C3376D39e817Aa2E38A5dBf67c1';
const startCid = '0x09e8aafa08a07b424f76f99b2704c1e07f85c36b2d5c2028b9a66f6ae31114d1';

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkStatus(cid, label) {
    if (!cid) return;

    console.log(`\n--- Checking ${label} [${cid.slice(0, 10)}...] ---`);

    // DB
    const record = await prisma.recordMetadata.findUnique({
        where: { cidHash: cid },
        select: { parentCidHash: true, ownerAddress: true, createdBy: true, title: true }
    });

    if (!record) {
        console.log("Record not found in DB");
        return null;
    }
    console.log(`Title: ${record.title}`);
    console.log(`CreatedBy: ${record.createdBy}`);

    // Chain Consent
    try {
        const consent = await publicClient.readContract({
            address: CONSENT_LEDGER_ADDRESS,
            abi: CONSENT_LEDGER_ABI,
            functionName: 'getConsent',
            args: [patient, grantee, cid],
        });
        const expireAt = consent.expireAt || consent[5];
        const active = consent.active || consent[6];
        const date = new Date(Number(expireAt) * 1000);

        console.log(`[CONTRACT] Active: ${active}`);
        console.log(`[CONTRACT] Expires: ${date.toLocaleString()} (${date < new Date() ? 'EXPIRED' : 'VALID'})`);
    } catch (e) {
        const msg = e.shortMessage || e.message?.split('\n')[0];
        console.log(`[CONTRACT] No Consent Found (or Error): ${msg}`);
    }

    return record.parentCidHash;
}

async function main() {
    console.log(`Tracing Chain for Access Leak...`);
    let currentCid = startCid;
    let index = 3; // Assuming user called it Ver 3, counting down

    while (currentCid && index > 0) {
        const parent = await checkStatus(currentCid, `Ver ${index} Node`);
        currentCid = parent;
        index--;
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
