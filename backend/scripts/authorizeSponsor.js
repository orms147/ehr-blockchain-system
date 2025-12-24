// Script to authorize the sponsor/relayer wallet on all contracts
// Run this ONCE from the deployer wallet
// Usage: node scripts/authorizeSponsor.js

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import dotenv from 'dotenv';
import {
    ACCESS_CONTROL_ABI,
    RECORD_REGISTRY_ABI,
    CONSENT_LEDGER_ABI,
} from '../src/config/contractABI.js';

dotenv.config();

// All config from .env
const SPONSOR_ADDRESS = process.env.SPONSOR_ADDRESS;
const CONTRACTS = {
    ACCESS_CONTROL: process.env.ACCESS_CONTROL_ADDRESS,
    RECORD_REGISTRY: process.env.RECORD_REGISTRY_ADDRESS,
    CONSENT_LEDGER: process.env.CONSENT_LEDGER_ADDRESS,
};

async function main() {
    // Validate env vars
    const requiredEnvVars = [
        'SPONSOR_PRIVATE_KEY',
        'ACCESS_CONTROL_ADDRESS',
        'RECORD_REGISTRY_ADDRESS',
        'CONSENT_LEDGER_ADDRESS',
        'RPC_URL',
    ];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            console.error(`❌ Missing required env var: ${envVar}`);
            process.exit(1);
        }
    }

    const privateKey = process.env.SPONSOR_PRIVATE_KEY;
    const account = privateKeyToAccount(privateKey);

    // Derive sponsor address from private key if not provided
    const sponsorAddress = SPONSOR_ADDRESS || account.address;

    console.log(`🔑 Using deployer account: ${account.address}`);
    console.log(`📋 Sponsor address to authorize: ${sponsorAddress}`);
    console.log('');

    const publicClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: http(process.env.RPC_URL),
    });

    const walletClient = createWalletClient({
        account,
        chain: arbitrumSepolia,
        transport: http(process.env.RPC_URL),
    });

    console.log('📋 Checking current authorization status...\n');

    // Check AccessControl
    const isRelayer = await publicClient.readContract({
        address: CONTRACTS.ACCESS_CONTROL,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'authorizedRelayers',
        args: [sponsorAddress],
    });
    console.log(`AccessControl.authorizedRelayers(${sponsorAddress}): ${isRelayer}`);

    // Check RecordRegistry
    const isRecordSponsor = await publicClient.readContract({
        address: CONTRACTS.RECORD_REGISTRY,
        abi: RECORD_REGISTRY_ABI,
        functionName: 'authorizedSponsors',
        args: [sponsorAddress],
    });
    console.log(`RecordRegistry.authorizedSponsors(${sponsorAddress}): ${isRecordSponsor}`);

    // Check ConsentLedger
    const isConsentSponsor = await publicClient.readContract({
        address: CONTRACTS.CONSENT_LEDGER,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'authorizedSponsors',
        args: [sponsorAddress],
    });
    console.log(`ConsentLedger.authorizedSponsors(${sponsorAddress}): ${isConsentSponsor}`);

    // Authorize if needed
    console.log('\n🔧 Authorizing sponsor where needed...\n');

    if (!isRelayer) {
        console.log('⏳ Authorizing on AccessControl...');
        const hash = await walletClient.writeContract({
            address: CONTRACTS.ACCESS_CONTROL,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'setRelayer',
            args: [sponsorAddress, true],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`✅ AccessControl.setRelayer done! TX: ${hash}`);
    } else {
        console.log('✅ AccessControl already authorized');
    }

    if (!isRecordSponsor) {
        console.log('⏳ Authorizing on RecordRegistry...');
        const hash = await walletClient.writeContract({
            address: CONTRACTS.RECORD_REGISTRY,
            abi: RECORD_REGISTRY_ABI,
            functionName: 'authorizeSponsor',
            args: [sponsorAddress, true],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`✅ RecordRegistry.authorizeSponsor done! TX: ${hash}`);
    } else {
        console.log('✅ RecordRegistry already authorized');
    }

    if (!isConsentSponsor) {
        console.log('⏳ Authorizing on ConsentLedger...');
        const hash = await walletClient.writeContract({
            address: CONTRACTS.CONSENT_LEDGER,
            abi: CONSENT_LEDGER_ABI,
            functionName: 'authorizeSponsor',
            args: [sponsorAddress, true],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`✅ ConsentLedger.authorizeSponsor done! TX: ${hash}`);
    } else {
        console.log('✅ ConsentLedger already authorized');
    }

    console.log('\n🎉 All authorizations complete!');
    console.log(`\nSponsor ${sponsorAddress} can now:`);
    console.log('  - Register patients/doctors via AccessControl');
    console.log('  - Upload records via RecordRegistry');
    console.log('  - Revoke consents via ConsentLedger');
}

main().catch(console.error);
