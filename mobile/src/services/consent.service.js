import api from './api';
import walletActionService from './walletAction.service';
import { signGrantConsent, computeCidHash, computeEncKeyHash, getDeadline } from '../utils/eip712';
import { withRpcRetry } from '../utils/rpcRetry';
import { gateOrThrow } from '../utils/biometricGate';
import { withSelfPayFallback } from '../utils/selfPayFallback';
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
 * SECURITY: contract caps B's expiry to A's own consent expiry (FIX audit #8
 * in ConsentLedger.sol:615-623) — A KHÔNG được cấp quyền dài hơn quyền chính
 * mình. Cap là silent (không revert), nên sau khi tx confirm hàm này READ
 * BACK consent từ contract qua getConsent() để biết expireAt thật → caller
 * dùng giá trị thật ghi backend + báo user nếu đã bị cap.
 *
 * @param {object} params
 * @param {string} params.patientAddress
 * @param {string} params.granteeAddress
 * @param {string} params.rootCidHash
 * @param {string} params.aesKey
 * @param {number} [params.expiresAtMs]
 * @returns {Promise<{
 *   txHash: string,
 *   encKeyHash: string,
 *   requestedExpireAtSec: number,
 *   actualExpireAtSec: number,
 *   wasClamped: boolean,
 * }>}
 */
export async function delegateOnChain({
    patientAddress,
    granteeAddress,
    rootCidHash,
    aesKey,
    expiresAtMs,
}) {
    if (!CONSENT_LEDGER_ADDRESS) {
        throw new Error('Thiếu EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS trong env.');
    }
    const { walletClient, account } = await walletActionService.getWalletContext();
    const encKeyHash = keccak256(toBytes(aesKey));
    const requestedExpireAtSec = expiresAtMs ? Math.floor(expiresAtMs / 1000) : 0;

    const publicClient = createPublicClient({
        chain: arbitrumSepolia,
        // retryCount=0: withRpcRetry below is the single retry layer. viem
        // transport-level retry on top would stack into ~26s hangs on 429s.
        transport: http(process.env.EXPO_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc', {
            retryCount: 0,
        }),
    });

    // P4: biometric MFA before broadcasting on-chain delegation.
    await gateOrThrow('Để uỷ quyền hồ sơ cho bác sĩ khác');

    // Both writeContract and waitForTransactionReceipt poll Alchemy and can
    // hit the 300 CU/sec rate limit during share bursts. withRpcRetry handles
    // 429 transparently with backoff.
    const hash = await withRpcRetry(() => walletClient.writeContract({
        account,
        address: CONSENT_LEDGER_ADDRESS,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'grantUsingRecordDelegation',
        args: [
            patientAddress,
            granteeAddress,
            rootCidHash,
            encKeyHash,
            requestedExpireAtSec,
        ],
    }));

    await withRpcRetry(() => publicClient.waitForTransactionReceipt({ hash }));

    // Read back B's consent từ contract để lấy actual expireAt (contract có
    // thể đã cap silent xuống A's expiry). Đây là source of truth on-chain.
    let actualExpireAtSec = requestedExpireAtSec;
    try {
        const consent = await withRpcRetry(() => publicClient.readContract({
            address: CONSENT_LEDGER_ADDRESS,
            abi: CONSENT_LEDGER_ABI,
            functionName: 'getConsent',
            args: [patientAddress, granteeAddress, rootCidHash],
        }));
        actualExpireAtSec = Number(consent?.expireAt ?? requestedExpireAtSec);
    } catch (err) {
        console.warn('[delegateOnChain] getConsent read-back failed; falling back to requested expiry', err);
    }

    const wasClamped =
        requestedExpireAtSec !== 0 &&
        actualExpireAtSec !== 0 &&
        actualExpireAtSec < requestedExpireAtSec;

    return {
        txHash: hash,
        encKeyHash,
        requestedExpireAtSec,
        actualExpireAtSec,
        wasClamped,
    };
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
 * @param {boolean} [params.allowDelegate=false]
 */
export async function grantConsentOnChain({
    granteeAddress,
    cid,
    aesKey,
    expiresAtMs,
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
        allowDelegate,
        deadline,
        nonce: ctx.nonce,
    });

    // 4. Relayer submits grantBySig — or, if the 100 free signatures are used up,
    //    the patient self-submits the SAME signature (grantBySig is signature-gated,
    //    not msg.sender-gated) and pays gas from their own wallet.
    const { txHash, selfPaid } = await withSelfPayFallback(
        () => api.post('/api/relayer/grant', {
            granteeAddress: grantee,
            cidHash,
            encKeyHash,
            expireAt,
            allowDelegate,
            deadline,
            signature,
        }),
        {
            address: CONSENT_LEDGER_ADDRESS,
            abi: CONSENT_LEDGER_ABI,
            functionName: 'grantBySig',
            args: [patient, grantee, cidHash, encKeyHash, expireAt, allowDelegate, deadline, signature],
        },
    );

    return {
        txHash,
        cidHash,
        isVerifiedDoctor: ctx.isVerifiedDoctor,
        isDoctor: ctx.isDoctor,
        selfPaid,
        // Self-pay does NOT consume the free quota (relayer threw before submitting).
        signaturesRemaining: selfPaid
            ? (ctx.signaturesRemaining ?? 0)
            : Math.max(0, (ctx.signaturesRemaining ?? 0) - 1),
    };
}

export async function fetchGrantContext(granteeAddress) {
    const grantee = granteeAddress.toLowerCase();
    return api.get(`/api/relayer/grant-context?grantee=${grantee}`);
}



export async function getMyGrantedConsents() {
    return api.get('/api/key-share/sent');
}

/**
 * Patient: list ALL active grantees on my records, including downstream
 * (D1, D2 minted via D's delegation) — backend joins Consent mirror with
 * DelegationAccessLog so each row carries `source` (direct vs via-delegate).
 * UI uses this for selective per-grantee revoke.
 */
export async function getAllActiveGrantees() {
    return api.get('/api/relayer/all-grantees');
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

    // R2 §19 (2026-06-03): biometric MFA gate cho destructive action.
    // Backend revoke on-chain sponsored, user không ký EIP-712 nào — nhưng
    // hành vi thu hồi quyền truy cập hồ sơ y tế là destructive (mất quyền
    // bác sĩ) nên phải gate biometric để xác nhận chủ ý theo TT 13/2025.
    await gateOrThrow('Xác thực để thu hồi quyền truy cập hồ sơ y tế');

    // Use the record DELETE endpoint — it walks parent chain to find the true
    // root cidHash before calling sponsorRevoke. Hitting /api/relayer/revoke
    // directly with a child cidHash makes the contract revert with
    // Unauthorized() because the consent lives at the root key.
    //
    // On quota exhaustion (100 free used up → backend 402 requiresOwnWallet), the
    // patient self-submits ConsentLedger.revoke (it walks inputCidHash → root
    // internally, and requires c.patient == msg.sender = this wallet). The
    // off-chain KeyShare payload purge still happens via backend event sync on the
    // ConsentRevoked event, plus the best-effort key-share delete below.
    const { relayerResult, selfPaid } = await withSelfPayFallback(
        () => api.delete(
            `/api/records/${targetCidHash}/access/${String(granteeAddress).toLowerCase()}`
        ),
        {
            address: CONSENT_LEDGER_ADDRESS,
            abi: CONSENT_LEDGER_ABI,
            functionName: 'revoke',
            args: [String(granteeAddress).toLowerCase(), targetCidHash],
        },
    );
    const result = selfPaid ? { success: true, selfPaid: true } : relayerResult;

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
    getAllActiveGrantees,
    getMyReceivedConsents,
    revokeConsent,
    checkConsent,
    grantConsentOnChain,
    fetchGrantContext,
    delegateOnChain,
};

export default consentService;
