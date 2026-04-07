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

const QUOTA_LIMITS = {
    UPLOADS_PER_MONTH: 100,
    REVOKES_PER_MONTH: 20,
};

const CONTRACTS = {
    ACCESS_CONTROL: process.env.ACCESS_CONTROL_ADDRESS,
    RECORD_REGISTRY: process.env.RECORD_REGISTRY_ADDRESS,
    CONSENT_LEDGER: process.env.CONSENT_LEDGER_ADDRESS,
};

const sponsorAccount = process.env.SPONSOR_PRIVATE_KEY
    ? privateKeyToAccount(process.env.SPONSOR_PRIVATE_KEY)
    : null;

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL),
});

const walletClient = sponsorAccount ? createWalletClient({
    account: sponsorAccount,
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL),
}) : null;

function createRelayerError(message, { code = 'RELAYER_ERROR', statusCode = 500, details = null, txHash = null } = {}) {
    const error = new Error(message);
    error.code = code;
    error.statusCode = statusCode;
    error.details = details;
    if (txHash) {
        error.txHash = txHash;
    }
    return error;
}

function extractErrorText(error, seen = new Set()) {
    if (!error || seen.has(error)) {
        return [];
    }

    seen.add(error);
    const messages = [];

    if (typeof error === 'string') {
        messages.push(error);
        return messages;
    }

    for (const key of ['shortMessage', 'details', 'message']) {
        if (typeof error[key] === 'string' && error[key].trim()) {
            messages.push(error[key].trim());
        }
    }

    if (Array.isArray(error.metaMessages)) {
        messages.push(...error.metaMessages.filter((item) => typeof item === 'string' && item.trim()));
    }

    if (error.cause) {
        messages.push(...extractErrorText(error.cause, seen));
    }

    return [...new Set(messages)];
}

function buildUploadError(error, txHash = null) {
    const details = extractErrorText(error).join(' | ');
    const normalized = details.toLowerCase();

    if (normalized.includes('quota_exhausted_use_own_wallet')) {
        return createRelayerError(
            'Quota upload mien phi da het. Hay dung vi rieng co ETH de tiep tuc.',
            { code: 'QUOTA_EXHAUSTED', statusCode: 429, details, txHash }
        );
    }

    if (normalized.includes('notpatient')) {
        return createRelayerError(
            'Tai khoan nay chua duoc dang ky patient tren blockchain.',
            { code: 'PATIENT_NOT_REGISTERED', statusCode: 400, details, txHash }
        );
    }

    if (normalized.includes('notsponsor')) {
        return createRelayerError(
            'Sponsor wallet chua duoc authorize trong RecordRegistry.',
            { code: 'SPONSOR_NOT_AUTHORIZED', statusCode: 500, details, txHash }
        );
    }

    if (normalized.includes('notauthorized') && normalized.includes('registerpatientfor')) {
        return createRelayerError(
            'Sponsor wallet chua duoc authorize trong AccessControl.',
            { code: 'RELAYER_NOT_AUTHORIZED', statusCode: 500, details, txHash }
        );
    }

    if (normalized.includes('recordexists')) {
        return createRelayerError(
            'CID nay da ton tai tren blockchain.',
            { code: 'RECORD_EXISTS', statusCode: 409, details, txHash }
        );
    }

    if (normalized.includes('parentnotexist')) {
        return createRelayerError(
            'Ban ghi cha khong ton tai tren blockchain.',
            { code: 'PARENT_NOT_FOUND', statusCode: 400, details, txHash }
        );
    }

    if (normalized.includes('toomanychildren') || normalized.includes('maxversionreached')) {
        return createRelayerError(
            'Ban ghi goc da dat toi da so phien ban cho phep.',
            { code: 'MAX_CHILDREN_REACHED', statusCode: 400, details, txHash }
        );
    }

    if (normalized.includes('user not found')) {
        return createRelayerError(
            'Khong tim thay nguoi dung trong database. Hay dang nhap lai roi thu lai.',
            { code: 'USER_NOT_FOUND', statusCode: 404, details, txHash }
        );
    }

    if (normalized.includes('relayer not configured')) {
        return createRelayerError(
            'Relayer chua duoc cau hinh day du tren backend.',
            { code: 'RELAYER_NOT_CONFIGURED', statusCode: 500, details, txHash }
        );
    }

    return createRelayerError(
        details ? `Khong the dang ky ho so len blockchain. ${details}` : 'Khong the dang ky ho so len blockchain. Vui long thu lai.',
        { code: 'UPLOAD_TX_FAILED', statusCode: 500, details, txHash }
    );
}

function ensureSponsorWalletConfigured() {
    if (!walletClient || !sponsorAccount) {
        throw createRelayerError('Relayer not configured: SPONSOR_PRIVATE_KEY missing', {
            code: 'RELAYER_NOT_CONFIGURED',
            statusCode: 500,
        });
    }
}

async function ensurePatientRegistered(walletAddress) {
    ensureSponsorWalletConfigured();

    const address = walletAddress.toLowerCase();
    const isPatient = await publicClient.readContract({
        address: CONTRACTS.ACCESS_CONTROL,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'isPatient',
        args: [address],
    });

    if (isPatient) {
        return false;
    }

    const relayerAuthorized = await publicClient.readContract({
        address: CONTRACTS.ACCESS_CONTROL,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'authorizedRelayers',
        args: [sponsorAccount.address],
    });

    if (!relayerAuthorized) {
        throw createRelayerError('Sponsor wallet chua duoc authorize trong AccessControl.', {
            code: 'RELAYER_NOT_AUTHORIZED',
            statusCode: 500,
        });
    }

    try {
        await sponsorRegisterPatient(address);
    } catch (error) {
        const normalized = extractErrorText(error).join(' | ').toLowerCase();
        if (!normalized.includes('alreadyregistered')) {
            throw buildUploadError(error);
        }
    }

    const registeredAfter = await publicClient.readContract({
        address: CONTRACTS.ACCESS_CONTROL,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'isPatient',
        args: [address],
    });

    if (!registeredAfter) {
        throw createRelayerError('Tai khoan nay chua duoc dang ky patient tren blockchain.', {
            code: 'PATIENT_NOT_REGISTERED',
            statusCode: 400,
        });
    }

    return true;
}

async function checkAndResetQuota(user) {
    const now = new Date();
    const resetDate = new Date(user.quotaResetDate);

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

export async function sponsorRegisterPatient(walletAddress) {
    ensureSponsorWalletConfigured();

    const address = walletAddress.toLowerCase();
    const isPatient = await publicClient.readContract({
        address: CONTRACTS.ACCESS_CONTROL,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'isPatient',
        args: [address],
    });

    if (isPatient) {
        await prisma.user.upsert({
            where: { walletAddress: address },
            update: { registrationSponsored: true },
            create: { walletAddress: address, registrationSponsored: true },
        });
        return { alreadyRegistered: true };
    }

    const hash = await walletClient.writeContract({
        address: CONTRACTS.ACCESS_CONTROL,
        abi: ACCESS_CONTROL_ABI,
        functionName: 'registerPatientFor',
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

export async function sponsorRegisterDoctor(walletAddress) {
    ensureSponsorWalletConfigured();

    const address = walletAddress.toLowerCase();
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

export async function sponsorUploadRecord(walletAddress, cidHash, parentCidHash, recordTypeHash) {
    ensureSponsorWalletConfigured();

    const address = walletAddress.toLowerCase();

    let user = await prisma.user.findUnique({
        where: { walletAddress: address },
    });

    if (!user) {
        throw createRelayerError('User not found', {
            code: 'USER_NOT_FOUND',
            statusCode: 404,
        });
    }

    user = await checkAndResetQuota(user);

    if (user.uploadsThisMonth >= QUOTA_LIMITS.UPLOADS_PER_MONTH) {
        if (user.hasSelfWallet) {
            throw createRelayerError('QUOTA_EXHAUSTED_USE_OWN_WALLET', {
                code: 'QUOTA_EXHAUSTED',
                statusCode: 429,
            });
        }

        throw createRelayerError(
            `Da het quota upload thang nay (${QUOTA_LIMITS.UPLOADS_PER_MONTH}). Vui long ket noi vi co ETH de tiep tuc.`,
            { code: 'QUOTA_EXHAUSTED', statusCode: 429 }
        );
    }

    await ensurePatientRegistered(address);

    const sponsorAuthorized = await publicClient.readContract({
        address: CONTRACTS.RECORD_REGISTRY,
        abi: RECORD_REGISTRY_ABI,
        functionName: 'authorizedSponsors',
        args: [sponsorAccount.address],
    });

    if (!sponsorAuthorized) {
        throw createRelayerError('Sponsor wallet chua duoc authorize trong RecordRegistry.', {
            code: 'SPONSOR_NOT_AUTHORIZED',
            statusCode: 500,
        });
    }

    let hash;
    try {
        const simulation = await publicClient.simulateContract({
            account: sponsorAccount,
            address: CONTRACTS.RECORD_REGISTRY,
            abi: RECORD_REGISTRY_ABI,
            functionName: 'addRecordFor',
            args: [cidHash, parentCidHash, recordTypeHash, address],
        });

        hash = await walletClient.writeContract(simulation.request);
    } catch (error) {
        throw buildUploadError(error);
    }

    let receipt;
    try {
        receipt = await publicClient.waitForTransactionReceipt({ hash });
    } catch (error) {
        throw buildUploadError(error, hash);
    }

    await prisma.user.update({
        where: { walletAddress: address },
        data: { uploadsThisMonth: { increment: 1 } },
    });

    return { txHash: hash, receipt };
}

export async function sponsorRevoke(walletAddress, granteeAddress, cidHash) {
    ensureSponsorWalletConfigured();

    const address = walletAddress.toLowerCase();

    let user = await prisma.user.findUnique({
        where: { walletAddress: address },
    });

    if (!user) {
        throw new Error('User not found');
    }

    user = await checkAndResetQuota(user);

    if (user.revokesThisMonth >= QUOTA_LIMITS.REVOKES_PER_MONTH) {
        if (user.hasSelfWallet) {
            throw new Error('QUOTA_EXHAUSTED_USE_OWN_WALLET');
        }

        throw new Error(`Da het quota revoke thang nay (${QUOTA_LIMITS.REVOKES_PER_MONTH}). Vui long ket noi vi co ETH de tiep tuc.`);
    }

    const hash = await walletClient.writeContract({
        address: CONTRACTS.CONSENT_LEDGER,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'revokeFor',
        args: [address, granteeAddress, cidHash],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    await prisma.user.update({
        where: { walletAddress: address },
        data: { revokesThisMonth: { increment: 1 } },
    });

    return { txHash: hash, receipt };
}

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
    ensureSponsorWalletConfigured();

    const patient = patientAddress.toLowerCase();
    const user = await prisma.user.findUnique({
        where: { walletAddress: patient },
    });

    if (!user) {
        throw new Error('User not found');
    }

    if (user.uploadsThisMonth >= QUOTA_LIMITS.UPLOADS_PER_MONTH) {
        throw new Error('Monthly upload/grant quota exceeded. Please pay gas yourself.');
    }

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

    await prisma.user.update({
        where: { walletAddress: patient },
        data: { uploadsThisMonth: { increment: 1 } },
    });
    return { txHash: hash, receipt };
}

export async function getGrantContext(patientAddress, granteeAddress) {
    const patient = patientAddress.toLowerCase();
    const grantee = granteeAddress.toLowerCase();

    const [nonce, isDoctor, isVerifiedDoctor] = await Promise.all([
        publicClient.readContract({
            address: CONTRACTS.CONSENT_LEDGER,
            abi: CONSENT_LEDGER_ABI,
            functionName: 'nonces',
            args: [patient],
        }),
        publicClient.readContract({
            address: CONTRACTS.ACCESS_CONTROL,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isDoctor',
            args: [grantee],
        }),
        publicClient.readContract({
            address: CONTRACTS.ACCESS_CONTROL,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isVerifiedDoctor',
            args: [grantee],
        }),
    ]);

    const quota = await getQuotaStatus(patient);

    return {
        nonce: nonce.toString(),
        isDoctor,
        isVerifiedDoctor,
        uploadsRemaining: quota.uploadsRemaining,
        hasSelfWallet: quota.hasSelfWallet,
    };
}

export async function archiveRequest(walletAddress, requestId) {
    const address = walletAddress.toLowerCase();

    await prisma.archivedRequest.create({
        data: {
            userAddress: address,
            requestId,
        },
    });

    return { archived: true };
}

export async function getArchivedRequests(walletAddress) {
    return await prisma.archivedRequest.findMany({
        where: { userAddress: walletAddress.toLowerCase() },
        orderBy: { archivedAt: 'desc' },
    });
}

export async function restoreRequest(walletAddress, requestId) {
    await prisma.archivedRequest.delete({
        where: {
            userAddress_requestId: {
                userAddress: walletAddress.toLowerCase(),
                requestId,
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
    getGrantContext,
    archiveRequest,
    getArchivedRequests,
    restoreRequest,
    QUOTA_LIMITS,
};
