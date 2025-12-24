// Relayer Service - Backend sponsors gas for patient transactions
// Uses admin wallet to submit transactions on behalf of patients

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import prisma from '../config/database.js';
import {
    ACCESS_CONTROL_ABI,
    RECORD_REGISTRY_ABI,
    CONSENT_LEDGER_ABI,
} from '../config/contractABI.js';

// Quota limits
const QUOTA_LIMITS = {
    UPLOADS_PER_MONTH: 100,
    REVOKES_PER_MONTH: 20,
};

// Contract addresses from env
const CONTRACTS = {
    ACCESS_CONTROL: process.env.ACCESS_CONTROL_ADDRESS,
    RECORD_REGISTRY: process.env.RECORD_REGISTRY_ADDRESS,
    CONSENT_LEDGER: process.env.CONSENT_LEDGER_ADDRESS,
};

// Sponsor wallet for gas sponsorship (e.g., Ministry of Health, or designated sponsor)
const sponsorAccount = process.env.SPONSOR_PRIVATE_KEY
    ? privateKeyToAccount(process.env.SPONSOR_PRIVATE_KEY)
    : null;


// Viem clients
const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL),
});

const walletClient = sponsorAccount ? createWalletClient({
    account: sponsorAccount,
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL),
}) : null;


// Helper: Check and reset monthly quota
async function checkAndResetQuota(user) {
    const now = new Date();
    const resetDate = new Date(user.quotaResetDate);

    // If a month has passed, reset quota
    if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
        await prisma.user.update({
            where: { walletAddress: user.walletAddress },
            data: {
                uploadsThisMonth: 0,
                revokesThisMonth: 0,
                quotaResetDate: now,
            }
        });
        return { ...user, uploadsThisMonth: 0, revokesThisMonth: 0 };
    }
    return user;
}

// Get user quota status
export async function getQuotaStatus(walletAddress) {
    let user = await prisma.user.findUnique({
        where: { walletAddress: walletAddress.toLowerCase() },
    });

    if (!user) {
        return {
            registrationAvailable: true,
            uploadsRemaining: QUOTA_LIMITS.UPLOADS_PER_MONTH,
            revokesRemaining: QUOTA_LIMITS.REVOKES_PER_MONTH,
            hasSelfWallet: false,
        };
    }

    user = await checkAndResetQuota(user);

    return {
        registrationAvailable: !user.registrationSponsored,
        uploadsRemaining: QUOTA_LIMITS.UPLOADS_PER_MONTH - user.uploadsThisMonth,
        revokesRemaining: QUOTA_LIMITS.REVOKES_PER_MONTH - user.revokesThisMonth,
        hasSelfWallet: user.hasSelfWallet,
        quotaResetDate: user.quotaResetDate,
    };
}

// Sponsor patient registration
export async function sponsorRegisterPatient(walletAddress) {
    if (!walletClient) {
        throw new Error('Relayer not configured: SPONSOR_PRIVATE_KEY missing');
    }

    const address = walletAddress.toLowerCase();

    // Check if already registered on-chain
    const isPatient = await publicClient.readContract({
        address: CONTRACTS.ACCESS_CONTROL,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'isPatient',
        args: [address],
    });

    if (isPatient) {
        // Already registered, just update DB
        await prisma.user.upsert({
            where: { walletAddress: address },
            update: { registrationSponsored: true },
            create: { walletAddress: address, registrationSponsored: true },
        });
        return { alreadyRegistered: true };
    }

    // Check quota
    const user = await prisma.user.findUnique({
        where: { walletAddress: address },
    });

    if (user?.registrationSponsored) {
        throw new Error('Đã sử dụng quyền đăng ký miễn phí');
    }

    // Submit transaction - use registerPatientFor to register the USER (not admin)
    const hash = await walletClient.writeContract({
        address: CONTRACTS.ACCESS_CONTROL,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'registerPatientFor',
        args: [address],  // Register this user address as patient
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Update DB
    await prisma.user.upsert({
        where: { walletAddress: address },
        update: { registrationSponsored: true },
        create: { walletAddress: address, registrationSponsored: true },
    });

    return { txHash: hash, receipt };
}

// Sponsor doctor registration
export async function sponsorRegisterDoctor(walletAddress) {
    if (!walletClient) {
        throw new Error('Relayer not configured: SPONSOR_PRIVATE_KEY missing');
    }

    const address = walletAddress.toLowerCase();

    // Check if already registered on-chain
    const isDoctor = await publicClient.readContract({
        address: CONTRACTS.ACCESS_CONTROL,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'isDoctor',
        args: [address],
    });

    if (isDoctor) {
        await prisma.user.upsert({
            where: { walletAddress: address },
            update: { registrationSponsored: true },
            create: { walletAddress: address, registrationSponsored: true },
        });
        return { alreadyRegistered: true };
    }

    // Check quota
    const user = await prisma.user.findUnique({
        where: { walletAddress: address },
    });

    if (user?.registrationSponsored) {
        throw new Error('Đã sử dụng quyền đăng ký miễn phí');
    }

    // Submit transaction
    const hash = await walletClient.writeContract({
        address: CONTRACTS.ACCESS_CONTROL,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'registerDoctorFor',
        args: [address],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    await prisma.user.upsert({
        where: { walletAddress: address },
        update: { registrationSponsored: true },
        create: { walletAddress: address, registrationSponsored: true },
    });

    return { txHash: hash, receipt };
}


// Sponsor record upload (on-chain)
export async function sponsorUploadRecord(walletAddress, cidHash, parentCidHash, recordTypeHash) {
    if (!walletClient) {
        throw new Error('Relayer not configured');
    }

    const address = walletAddress.toLowerCase();

    // Check quota
    let user = await prisma.user.findUnique({
        where: { walletAddress: address },
    });

    if (!user) {
        throw new Error('User not found');
    }

    // ALL users use free quota first (even if they have own wallet)
    user = await checkAndResetQuota(user);

    if (user.uploadsThisMonth >= QUOTA_LIMITS.UPLOADS_PER_MONTH) {
        if (user.hasSelfWallet) {
            // User has wallet with ETH - tell frontend to call addRecord directly
            throw new Error('QUOTA_EXHAUSTED_USE_OWN_WALLET');
        } else {
            throw new Error(`Đã hết quota upload tháng này (${QUOTA_LIMITS.UPLOADS_PER_MONTH}). Vui lòng kết nối ví có ETH để tiếp tục.`);
        }
    }

    // Submit transaction - use addRecordFor to sponsor for patient
    const hash = await walletClient.writeContract({
        address: CONTRACTS.RECORD_REGISTRY,
        abi: RECORD_REGISTRY_ABI,
        functionName: 'addRecordFor',
        args: [cidHash, parentCidHash, recordTypeHash, address],
    });


    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Update quota for ALL users
    await prisma.user.update({
        where: { walletAddress: address },
        data: { uploadsThisMonth: { increment: 1 } },
    });

    return { txHash: hash, receipt };

}

// Sponsor revoke consent
export async function sponsorRevoke(walletAddress, granteeAddress, cidHash) {
    if (!walletClient) {
        throw new Error('Relayer not configured');
    }

    const address = walletAddress.toLowerCase();

    // Check quota
    let user = await prisma.user.findUnique({
        where: { walletAddress: address },
    });

    if (!user) {
        throw new Error('User not found');
    }

    // ALL users use free quota first (even if they have own wallet)
    user = await checkAndResetQuota(user);

    if (user.revokesThisMonth >= QUOTA_LIMITS.REVOKES_PER_MONTH) {
        if (user.hasSelfWallet) {
            // User has wallet with ETH - tell frontend to call revoke directly
            throw new Error('QUOTA_EXHAUSTED_USE_OWN_WALLET');
        } else {
            throw new Error(`Đã hết quota revoke tháng này (${QUOTA_LIMITS.REVOKES_PER_MONTH}). Vui lòng kết nối ví có ETH để tiếp tục.`);
        }
    }

    // Submit transaction - use revokeFor to sponsor for patient
    const hash = await walletClient.writeContract({
        address: CONTRACTS.CONSENT_LEDGER,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'revokeFor',
        args: [address, granteeAddress, cidHash],
    });


    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Update quota for ALL users
    await prisma.user.update({
        where: { walletAddress: address },
        data: { revokesThisMonth: { increment: 1 } },
    });

    return { txHash: hash, receipt };

}

// Sponsor grant consent (Patient grants access to Doctor with signature)
export async function sponsorGrantConsent(
    patientAddress,
    granteeAddress,
    cidHash,
    encKeyHash,
    expireAt,
    includeUpdates,
    allowDelegate,
    deadline,
    signature
) {
    if (!walletClient) {
        throw new Error('Relayer not configured');
    }

    const patient = patientAddress.toLowerCase();

    // Verify user exists
    const user = await prisma.user.findUnique({
        where: { walletAddress: patient },
    });

    if (!user) {
        throw new Error('User not found');
    }

    // Check quota before sponsored grant
    if (user.uploadsThisMonth >= QUOTA_LIMITS.UPLOADS_PER_MONTH) {
        throw new Error('Monthly upload/grant quota exceeded. Please pay gas yourself.');
    }

    // Submit grantBySig transaction
    const hash = await walletClient.writeContract({
        address: CONTRACTS.CONSENT_LEDGER,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'grantBySig',
        args: [
            patient,
            granteeAddress.toLowerCase(),
            cidHash,
            encKeyHash,
            expireAt,
            includeUpdates,
            allowDelegate,
            deadline,
            signature,
        ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Deduct quota after successful grant
    await prisma.user.update({
        where: { walletAddress: patient },
        data: { uploadsThisMonth: { increment: 1 } },
    });

    console.log(`✅ Sponsored grantConsent for ${patient} -> ${granteeAddress}`);

    return { txHash: hash, receipt };
}

// Archive a request (instead of on-chain reject)
export async function archiveRequest(walletAddress, requestId) {
    const address = walletAddress.toLowerCase();

    await prisma.archivedRequest.create({
        data: {
            userAddress: address,
            requestId: requestId,
        },
    });

    return { archived: true };
}

// Get archived requests
export async function getArchivedRequests(walletAddress) {
    return await prisma.archivedRequest.findMany({
        where: { userAddress: walletAddress.toLowerCase() },
        orderBy: { archivedAt: 'desc' },
    });
}

// Restore archived request
export async function restoreRequest(walletAddress, requestId) {
    await prisma.archivedRequest.delete({
        where: {
            userAddress_requestId: {
                userAddress: walletAddress.toLowerCase(),
                requestId: requestId,
            },
        },
    });

    return { restored: true };
}

export default {
    getQuotaStatus,
    sponsorRegisterPatient,
    sponsorRegisterDoctor,
    sponsorUploadRecord,
    sponsorRevoke,
    sponsorGrantConsent,
    archiveRequest,
    getArchivedRequests,
    restoreRequest,
    QUOTA_LIMITS,
};

