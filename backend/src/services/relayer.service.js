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

// Unified gas sponsorship quota — 100 signatures/month pool covering every
// patient on-chain action (upload, update, grant/share, revoke, delegate).
// Rationale: splitting into per-action buckets caused confusing 429s mid-flow.
// One pool keeps "patient never pays gas" as a single guarantee.
const QUOTA_LIMITS = {
    SIGNATURES_PER_MONTH: 100,
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
                signaturesThisMonth: 0,
                quotaResetDate: now,
            }
        });
        return { ...user, signaturesThisMonth: 0 };
    }
    return user;
}

// Internal: require quota + bump counter atomically. Throws a 429 error when
// the pool is exhausted and the user does not self-pay gas.
async function consumeQuota(walletAddress, actionLabel) {
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

    if (!user.hasSelfWallet && user.signaturesThisMonth >= QUOTA_LIMITS.SIGNATURES_PER_MONTH) {
        throw createRelayerError(
            `Đã hết quota chữ ký miễn phí tháng này (${QUOTA_LIMITS.SIGNATURES_PER_MONTH}). Vui lòng kết nối ví có ETH hoặc chờ sang tháng sau.`,
            { code: 'QUOTA_EXHAUSTED', statusCode: 429, details: actionLabel }
        );
    }

    return user;
}

async function bumpSignatureCounter(walletAddress) {
    await prisma.user.update({
        where: { walletAddress: walletAddress.toLowerCase() },
        data: { signaturesThisMonth: { increment: 1 } },
    });
}

export async function getQuotaStatus(walletAddress) {
    let user = await prisma.user.findUnique({
        where: { walletAddress: walletAddress.toLowerCase() },
    });

    if (!user) {
        return {
            registrationAvailable: true,
            signaturesRemaining: QUOTA_LIMITS.SIGNATURES_PER_MONTH,
            signaturesLimit: QUOTA_LIMITS.SIGNATURES_PER_MONTH,
            hasSelfWallet: false,
        };
    }

    user = await checkAndResetQuota(user);

    return {
        registrationAvailable: !user.registrationSponsored,
        signaturesRemaining: Math.max(0, QUOTA_LIMITS.SIGNATURES_PER_MONTH - user.signaturesThisMonth),
        signaturesLimit: QUOTA_LIMITS.SIGNATURES_PER_MONTH,
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
    await consumeQuota(address, 'upload');

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

    await bumpSignatureCounter(address);

    return { txHash: hash, receipt };
}

export async function sponsorRevoke(walletAddress, granteeAddress, cidHash) {
    ensureSponsorWalletConfigured();

    const address = walletAddress.toLowerCase();
    await consumeQuota(address, 'revoke');

    const hash = await walletClient.writeContract({
        address: CONTRACTS.CONSENT_LEDGER,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'revokeFor',
        args: [address, granteeAddress, cidHash],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    await bumpSignatureCounter(address);

    return { txHash: hash, receipt };
}

export async function sponsorGrantConsent(
    patientAddress,
    granteeAddress,
    cidHash,
    encKeyHash,
    expireAt,
    allowDelegate,
    deadline,
    signature
) {
    ensureSponsorWalletConfigured();

    const patient = patientAddress.toLowerCase();
    await consumeQuota(patient, 'grant');

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
            allowDelegate,
            deadline,
            signature,
        ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    await bumpSignatureCounter(patient);
    return { txHash: hash, receipt };
}

// Relay a delegation grant via ConsentLedger.delegateAuthorityBySig.
// Patient signs EIP-712 DelegationPermit off-chain; backend submits with sponsor gas.
// Counts against the same 100/month pool as other patient actions.
//
// NOTE: the contract expects `duration` in SECONDS (uint40), not an absolute
// expiresAt timestamp. Contract will compute actual expiry as block.timestamp + duration.
// Contract enforces MIN_DURATION (1 day) and MAX_DURATION (5 years).
export async function sponsorDelegateAuthority({
    patientAddress,
    delegateeAddress,
    duration,
    allowSubDelegate,
    deadline,
    signature,
    scopeNote = null,
}) {
    ensureSponsorWalletConfigured();

    const patient = patientAddress.toLowerCase();
    const delegatee = delegateeAddress.toLowerCase();
    await consumeQuota(patient, 'delegate');

    let hash;
    try {
        const simulation = await publicClient.simulateContract({
            account: sponsorAccount,
            address: CONTRACTS.CONSENT_LEDGER,
            abi: CONSENT_LEDGER_ABI,
            functionName: 'delegateAuthorityBySig',
            args: [
                patient,
                delegatee,
                Number(duration), // uint40 duration in seconds
                Boolean(allowSubDelegate),
                BigInt(deadline),
                signature,
            ],
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

    await bumpSignatureCounter(patient);

    // Write DB cache row eagerly so the patient's UI sees it before the
    // DelegationGranted event catches up. Event sync will re-upsert later
    // (idempotent on @@unique(patientAddress, delegateeAddress)).
    // Approximate expiresAt = now + duration; event sync will correct to the
    // exact chain timestamp if there's drift.
    const approxExpiresAt = new Date(Date.now() + Number(duration) * 1000);
    try {
        await prisma.delegation.upsert({
            where: {
                patientAddress_delegateeAddress: {
                    patientAddress: patient,
                    delegateeAddress: delegatee,
                },
            },
            update: {
                chainDepth: 1,
                parentDelegator: null,
                allowSubDelegate: Boolean(allowSubDelegate),
                expiresAt: approxExpiresAt,
                scopeNote,
                grantTxHash: hash,
                grantBlockNumber: receipt?.blockNumber ?? null,
                grantedAt: new Date(),
                status: 'active',
                revokedTxHash: null,
                revokedAt: null,
                revokedBy: null,
            },
            create: {
                patientAddress: patient,
                delegateeAddress: delegatee,
                chainDepth: 1,
                parentDelegator: null,
                epoch: 0n,
                allowSubDelegate: Boolean(allowSubDelegate),
                expiresAt: approxExpiresAt,
                scopeNote,
                grantTxHash: hash,
                grantBlockNumber: receipt?.blockNumber ?? null,
                status: 'active',
            },
        });
    } catch (dbError) {
        // DB cache failure is not fatal — chain is source of truth.
        // Event sync will eventually populate the row.
    }

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
        signaturesRemaining: quota.signaturesRemaining,
        signaturesLimit: quota.signaturesLimit,
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
    sponsorDelegateAuthority,
    getGrantContext,
    archiveRequest,
    getArchivedRequests,
    restoreRequest,
    QUOTA_LIMITS,
};
