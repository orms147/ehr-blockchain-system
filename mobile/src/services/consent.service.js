import api from './api';
import walletActionService from './walletAction.service';
import { signGrantConsent, computeCidHash, computeEncKeyHash, getDeadline } from '../utils/eip712';
import { createPublicClient, http, keccak256, toBytes } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { CONSENT_LEDGER_ABI } from '../abi/contractABI';

const CONSENT_LEDGER_ADDRESS = process.env.EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS;

/**
 * Doctor A → Doctor B delegation via direct on-chain call to
 * ConsentLedger.grantUsingRecordDelegation. Requires msg.sender == doctorA,
 * so we cannot use the relayer (which would make relayer the sender).
 * Caller must have allowDelegate=true on a prior consent for rootCidHash.
 */
/**
 * Doctor A re-shares a record to Doctor B via per-record delegation.
 * Calls ConsentLedger.grantUsingRecordDelegation (msg.sender = doctor A).
 *
 * SECURITY (defense-in-depth): clamp expireAt to sender's own consent expiry
 * so B cannot outlive A. Contract also enforces this (FIX audit #8), but we
 * cap client-side too so the user sees the correct duration in the UI.
 *
 * @param {object} params
 * @param {string} params.patientAddress
 * @param {string} params.granteeAddress
 * @param {string} params.rootCidHash
 * @param {string} params.aesKey
 * @param {number} [params.expiresAtMs]
 * @param {number} [params.senderConsentExpireAtSec]
 */
export async function delegateOnChain({
    patientAddress,
    granteeAddress,
    rootCidHash,
    aesKey,
    expiresAtMs,
    senderConsentExpireAtSec = 0,
}) {
    if (!CONSENT_LEDGER_ADDRESS) {
        throw new Error('Thiếu EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS trong env.');
    }
    const { walletClient, account } = await walletActionService.getWalletContext();
    const encKeyHash = keccak256(toBytes(aesKey));
    let expireAt = expiresAtMs ? Math.floor(expiresAtMs / 1000) : 0;

    // Defense-in-depth: cap to sender's own consent expiry.
    // Contract enforces this too (FIX audit #8) but capping here gives correct UX.
    if (senderConsentExpireAtSec > 0) {
        if (expireAt === 0 || expireAt > senderConsentExpireAtSec) {
            expireAt = senderConsentExpireAtSec;
        }
    }

    const publicClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: http('https://sepolia-rollup.arbitrum.io/rpc'),
    });

    const hash = await walletClient.writeContract({
        account,
        address: CONSENT_LEDGER_ADDRESS,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'grantUsingRecordDelegation',
        args: [
            patientAddress,
            granteeAddress,
            rootCidHash,
            encKeyHash,
            expireAt,
        ],
    });

    await publicClient.waitForTransactionReceipt({ hash });
    return { txHash: hash, encKeyHash, clampedExpireAt: expireAt };
}

/**
 * Grant on-chain consent via backend relayer (EIP-712 gasless).
 * Returns { txHash, isVerifiedDoctor, signaturesRemaining } so UI can surface warnings.
 *
 * @param {object} params
 * @param {string} params.granteeAddress
 * @param {string} params.cid            - plaintext CID (will be hashed)
 * @param {string} params.aesKey         - AES key string (will be hashed for encKeyHash)
 * @param {number} params.expiresAtMs    - epoch ms when access expires; 0/null = no expiry
 * @param {boolean} [params.includeUpdates=true]
 * @param {boolean} [params.allowDelegate=false]
 */
export async function grantConsentOnChain({
    granteeAddress,
    cid,
    aesKey,
    expiresAtMs,
    includeUpdates = true,
    allowDelegate = false,
}) {
    const grantee = granteeAddress.toLowerCase();

    // 1. Fetch nonce + verified status + quota
    const ctx = await api.get(`/api/relayer/grant-context?grantee=${grantee}`);

    // 2. Prepare EIP-712 fields
    const { walletClient, address: patient } = await walletActionService.getWalletContext();
    const cidHash = computeCidHash(cid);
    const encKeyHash = computeEncKeyHash(aesKey);
    const expireAt = expiresAtMs ? Math.floor(expiresAtMs / 1000) : 0;
    const deadline = getDeadline(1); // 1h to submit

    // 3. Patient signs ConsentPermit
    const signature = await signGrantConsent(walletClient, {
        patient,
        grantee,
        rootCidHash: cidHash,
        encKeyHash,
        expireAt,
        includeUpdates,
        allowDelegate,
        deadline,
        nonce: ctx.nonce,
    });

    // 4. Relayer submits grantBySig
    const result = await api.post('/api/relayer/grant', {
        granteeAddress: grantee,
        cidHash,
        encKeyHash,
        expireAt,
        includeUpdates,
        allowDelegate,
        deadline,
        signature,
    });

    return {
        txHash: result.txHash,
        cidHash,
        isVerifiedDoctor: ctx.isVerifiedDoctor,
        isDoctor: ctx.isDoctor,
        signaturesRemaining: Math.max(0, (ctx.signaturesRemaining ?? 0) - 1),
    };
}

export async function fetchGrantContext(granteeAddress) {
    const grantee = granteeAddress.toLowerCase();
    return api.get(`/api/relayer/grant-context?grantee=${grantee}`);
}



export async function getMyGrantedConsents() {
    return api.get('/api/key-share/sent');
}

export async function getMyReceivedConsents() {
    return api.get('/api/key-share/my');
}

export async function revokeConsent(consentOrAddress, cidHash) {
    // ALWAYS go on-chain via relayer (free quota first, then user gas).
    // Off-chain-only revoke is forbidden because consent is on-chain source of truth.
    let granteeAddress;
    let targetCidHash = cidHash;

    if (consentOrAddress && typeof consentOrAddress === 'object') {
        granteeAddress = consentOrAddress.recipientAddress
            || consentOrAddress.recipient?.walletAddress
            || consentOrAddress.granteeAddress
            || consentOrAddress.grantee;
        targetCidHash = targetCidHash || consentOrAddress.cidHash;
    } else {
        granteeAddress = consentOrAddress;
    }

    if (!granteeAddress || !targetCidHash) {
        throw new Error('Thiếu thông tin grantee hoặc cidHash để thu hồi.');
    }

    // Use the record DELETE endpoint — it walks parent chain to find the true
    // root cidHash before calling sponsorRevoke. Hitting /api/relayer/revoke
    // directly with a child cidHash makes the contract revert with
    // Unauthorized() because the consent lives at the root key.
    const result = await api.delete(
        `/api/records/${targetCidHash}/access/${String(granteeAddress).toLowerCase()}`
    );

    // Best-effort: also delete the off-chain key share row so payload is purged immediately.
    // The eventSync projection will eventually flip it to revoked anyway, but this gives instant UI.
    if (consentOrAddress && typeof consentOrAddress === 'object' && consentOrAddress.id) {
        try {
            await api.delete(`/api/key-share/${consentOrAddress.id}`);
        } catch (e) {
            // non-fatal: on-chain revoke is the source of truth
        }
    }

    return result;
}

export async function checkConsent(patientAddress, granteeAddress, cidHash) {
    // No dedicated backend route currently; rely on relayer/key-share flows instead.
    return {
        supported: false,
        message: 'checkConsent endpoint is not available on current backend.',
        patientAddress,
        granteeAddress,
        cidHash,
    };
}

export const consentService = {
    getMyGrantedConsents,
    getMyReceivedConsents,
    revokeConsent,
    checkConsent,
    grantConsentOnChain,
    fetchGrantContext,
    delegateOnChain,
};

export default consentService;
