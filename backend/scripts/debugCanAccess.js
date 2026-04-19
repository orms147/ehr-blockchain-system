// Diagnostic script — dump all state relevant to canAccess(patient, doctor, cidHash)
// Usage:
//   cd backend
//   node scripts/debugCanAccess.js <patient> <doctor> <cidHash>
//
// Example:
//   node scripts/debugCanAccess.js \
//     0xaaaa...patient \
//     0xbbbb...doctor \
//     0xcccc...cidHashV2

import { createPublicClient, http, keccak256, encodePacked } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

const RPC = process.env.ARB_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc';
const CONSENT = process.env.CONSENT_LEDGER_ADDRESS;
const REGISTRY = process.env.RECORD_REGISTRY_ADDRESS;
const ACCESS = process.env.ACCESS_CONTROL_ADDRESS;

const [, , patientArg, doctorArg, cidHashArg] = process.argv;

if (!patientArg || !doctorArg || !cidHashArg) {
    console.error('Usage: node scripts/debugCanAccess.js <patient> <doctor> <cidHash>');
    process.exit(1);
}

const patient = patientArg.toLowerCase();
const doctor = doctorArg.toLowerCase();
const cidHash = cidHashArg.toLowerCase();

const ABI = [
    {
        name: 'canAccess',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'patient', type: 'address' },
            { name: 'grantee', type: 'address' },
            { name: 'queryCidHash', type: 'bytes32' },
        ],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'getConsent',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'patient', type: 'address' },
            { name: 'grantee', type: 'address' },
            { name: 'queryCidHash', type: 'bytes32' },
        ],
        outputs: [
            {
                type: 'tuple',
                components: [
                    { name: 'patient', type: 'address' },
                    { name: 'grantee', type: 'address' },
                    { name: 'rootCidHash', type: 'bytes32' },
                    { name: 'anchorCidHash', type: 'bytes32' },
                    { name: 'encKeyHash', type: 'bytes32' },
                    { name: 'issuedAt', type: 'uint40' },
                    { name: 'expireAt', type: 'uint40' },
                    { name: 'active', type: 'bool' },
                    { name: 'includeUpdates', type: 'bool' },
                    { name: 'allowDelegate', type: 'bool' },
                ],
            },
        ],
    },
    {
        name: 'isDoctor',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'isVerifiedDoctor',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'parentOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'cidHash', type: 'bytes32' }],
        outputs: [{ type: 'bytes32' }],
    },
    {
        name: 'recordExists',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'cidHash', type: 'bytes32' }],
        outputs: [{ type: 'bool' }],
    },
];

const client = createPublicClient({ chain: arbitrumSepolia, transport: http(RPC) });

function fmt(name, val) {
    console.log(`  ${name.padEnd(24)} ${val}`);
}

async function main() {
    console.log('=== DEBUG CANACCESS ===');
    fmt('Patient', patient);
    fmt('Doctor', doctor);
    fmt('Query cidHash', cidHash);
    fmt('AccessControl', ACCESS);
    fmt('ConsentLedger', CONSENT);
    fmt('RecordRegistry', REGISTRY);
    console.log();

    console.log('=== DOCTOR ROLE STATE ===');
    const isDoc = await client.readContract({ address: ACCESS, abi: ABI, functionName: 'isDoctor', args: [doctor] });
    const isVerified = await client.readContract({ address: ACCESS, abi: ABI, functionName: 'isVerifiedDoctor', args: [doctor] });
    fmt('isDoctor', isDoc);
    fmt('isVerifiedDoctor', isVerified);
    if (isDoc && !isVerified) {
        console.log('  ⚠️  Doctor registered but NOT verified → canAccess WILL return false.');
    }
    if (!isDoc) {
        console.log('  ⚠️  Address is NOT a registered doctor.');
    }
    console.log();

    console.log('=== RECORD CHAIN (walk to root) ===');
    const recExists = await client.readContract({ address: REGISTRY, abi: ABI, functionName: 'recordExists', args: [cidHash] });
    fmt('recordExists(query)', recExists);
    if (!recExists) {
        console.log('  ⚠️  Record does not exist on-chain. Was addRecord tx successful?');
    }
    let current = cidHash;
    let root = current;
    for (let i = 0; i < 10; i++) {
        const parent = await client.readContract({ address: REGISTRY, abi: ABI, functionName: 'parentOf', args: [current] });
        fmt(`hop ${i}: ${current.slice(0, 10)}...`, `parent=${parent === '0x0000000000000000000000000000000000000000000000000000000000000000' ? '(root)' : parent.slice(0, 10) + '...'}`);
        if (parent === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            root = current;
            break;
        }
        current = parent;
    }
    fmt('Resolved root', root);
    console.log();

    console.log('=== CONSENT AT ROOT ===');
    const FOREVER = (1n << 40n) - 1n; // uint40 max
    try {
        const c = await client.readContract({ address: CONSENT, abi: ABI, functionName: 'getConsent', args: [patient, doctor, cidHash] });
        fmt('patient', c.patient);
        fmt('grantee', c.grantee);
        fmt('rootCidHash', c.rootCidHash);
        fmt('anchorCidHash', c.anchorCidHash);
        fmt('encKeyHash', c.encKeyHash);
        fmt('issuedAt', c.issuedAt === 0n ? '0 (never issued)' : `${c.issuedAt} (${new Date(Number(c.issuedAt) * 1000).toISOString()})`);
        fmt('expireAt', c.expireAt === 0n ? '0' : c.expireAt === FOREVER ? `${FOREVER} (FOREVER)` : `${c.expireAt} (${new Date(Number(c.expireAt) * 1000).toISOString()})`);
        fmt('active', c.active);
        fmt('includeUpdates', c.includeUpdates);
        fmt('allowDelegate', c.allowDelegate);

        const now = BigInt(Math.floor(Date.now() / 1000));
        if (c.patient === '0x0000000000000000000000000000000000000000') {
            console.log('  ⚠️  Consent NEVER EXISTED — patient field zero. Grant tx likely failed or was never submitted.');
        } else if (!c.active) {
            console.log('  ⚠️  Consent inactive (revoked on-chain).');
        } else if (c.expireAt !== 0n && c.expireAt !== FOREVER && c.expireAt < now) {
            console.log(`  ⚠️  Consent EXPIRED (expireAt=${c.expireAt}, now=${now}).`);
        } else if (!c.includeUpdates && c.anchorCidHash.toLowerCase() !== cidHash.toLowerCase()) {
            console.log('  ⚠️  includeUpdates=false AND anchorCidHash != query.');
            console.log(`       Query:  ${cidHash}`);
            console.log(`       Anchor: ${c.anchorCidHash}`);
        } else {
            console.log('  ✓ Consent looks valid. canAccess should pass (unless delegation chain invalid).');
        }
    } catch (err) {
        console.log('  ❌ getConsent threw:', err.shortMessage || err.message);
    }
    console.log();

    console.log('=== FINAL canAccess() ===');
    try {
        const result = await client.readContract({ address: CONSENT, abi: ABI, functionName: 'canAccess', args: [patient, doctor, cidHash] });
        fmt('canAccess', result);
        if (result) {
            console.log('  ✅ Doctor SHOULD be able to claim + decrypt this version.');
        } else {
            console.log('  ❌ Doctor CANNOT access. See warnings above for reason.');
        }
    } catch (err) {
        console.log('  ❌ canAccess threw:', err.shortMessage || err.message);
    }
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
