import api from './api';
import walletActionService from './walletAction.service';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

import { signDelegationPermit, getDeadline } from '../utils/eip712';
import { CONSENT_LEDGER_ABI } from '../abi/contractABI';

const CONSENT_LEDGER_ADDRESS = process.env.EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS;
const ARBITRUM_SEPOLIA_RPC = 'https://sepolia-rollup.arbitrum.io/rpc';

/**
 * Patient delegation service (CHAIN topology).
 *
 * Flows:
 *  - grantAuthority: patient signs DelegationPermit, backend relays delegateAuthorityBySig.
 *  - revokeAuthority: patient calls revokeDelegation() directly via their own wallet
 *    (no BySig variant exists — patient pays ~tiny gas themselves).
 *  - Doctor sub-delegate / revoke-sub: handled by consent.service.delegateOnChain
 *    and a separate helper below (subDelegate / revokeSubDelegation).
 */

// ============ PATIENT: LIST + READ ============

export async function getMyDelegates() {
    return api.get('/api/delegation/my-delegates');
}

export async function getDelegatedToMe() {
    return api.get('/api/delegation/delegated-to-me');
}

export async function checkDelegation(patientAddress) {
    return api.get(`/api/delegation/check/${patientAddress}`);
}

export async function getDelegationAccessLogs(role = 'patient') {
    return api.get(`/api/delegation/access-logs?role=${role}`);
}

// ============ PATIENT: GRANT ROOT AUTHORITY ============

/**
 * Grant a root authority delegation (patient -> doctor, chainDepth=1).
 * Patient signs an EIP-712 DelegationPermit, backend relays via sponsor wallet.
 *
 * @param {object} params
 * @param {string} params.delegateeAddress - doctor wallet address
 * @param {number} params.durationDays     - authority window in DAYS (min 1, max ~1825)
 * @param {boolean} [params.allowSubDelegate=false]
 * @param {string} [params.scopeNote]      - off-chain clinical purpose / ICD-10 notes
 * @returns {Promise<{txHash: string}>}
 */
export async function grantAuthority({
    delegateeAddress,
    durationDays,
    allowSubDelegate = false,
    scopeNote = null,
}) {
    if (!CONSENT_LEDGER_ADDRESS) {
        throw new Error('Thiếu EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS trong env.');
    }

    const delegatee = delegateeAddress.toLowerCase();
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days < 1 || days > 1825) {
        throw new Error('Thời hạn uỷ quyền phải từ 1 ngày đến 5 năm.');
    }
    const duration = Math.floor(days * 86400); // seconds

    // 1. Fetch patient nonce (reuse grant-context: same nonce slot)
    const ctx = await api.get(`/api/relayer/grant-context?grantee=${delegatee}`);
    if (ctx.isDoctor === false) {
        throw new Error('Địa chỉ bạn chọn chưa được đăng ký là bác sĩ trong hệ thống.');
    }

    // 2. Patient signs DelegationPermit
    const { walletClient, address: patient } = await walletActionService.getWalletContext();
    const deadline = getDeadline(1); // 1h to submit
    const signature = await signDelegationPermit(walletClient, {
        patient,
        delegatee,
        duration,
        allowSubDelegate,
        deadline,
        nonce: ctx.nonce,
    });

    // 3. Relayer submits delegateAuthorityBySig
    const result = await api.post('/api/relayer/delegate-authority', {
        delegateeAddress: delegatee,
        duration,
        allowSubDelegate,
        deadline,
        signature,
        scopeNote: scopeNote || null,
    });

    return { txHash: result.txHash };
}

// ============ PATIENT: REVOKE ROOT AUTHORITY ============

/**
 * Revoke a root delegation. Calls ConsentLedger.revokeDelegation() directly —
 * there is no BySig variant, so the patient pays (tiny) gas from their own wallet.
 * Epoch bump at the contract cascade-invalidates all downstream consents and
 * sub-delegations; backend event sync will mark DB rows accordingly.
 *
 * @param {string} delegateeAddress
 * @returns {Promise<{txHash: string}>}
 */
export async function revokeAuthority(delegateeAddress) {
    if (!CONSENT_LEDGER_ADDRESS) {
        throw new Error('Thiếu EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS trong env.');
    }
    const delegatee = delegateeAddress.toLowerCase();

    const { walletClient, account } = await walletActionService.getWalletContext();
    const publicClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: http(ARBITRUM_SEPOLIA_RPC),
    });

    const { request } = await publicClient.simulateContract({
        account,
        address: CONSENT_LEDGER_ADDRESS,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'revokeDelegation',
        args: [delegatee],
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return { txHash: hash };
}

// ============ DOCTOR: SUB-DELEGATE (CHAIN extension) ============

/**
 * Doctor with allowSubDelegate=true creates a sub-delegation to another doctor.
 * Direct on-chain call; msg.sender must equal the parent delegatee.
 *
 * @param {object} params
 * @param {string} params.patientAddress  - root patient owner
 * @param {string} params.subDelegatee    - downstream doctor receiving authority
 * @param {number} params.durationDays
 * @param {boolean} [params.allowFurther=false] - whether subDelegatee may sub-delegate again
 */
export async function subDelegate({
    patientAddress,
    subDelegatee,
    durationDays,
    allowFurther = false,
}) {
    if (!CONSENT_LEDGER_ADDRESS) {
        throw new Error('Thiếu EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS trong env.');
    }
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days < 1 || days > 1825) {
        throw new Error('Thời hạn uỷ quyền phải từ 1 ngày đến 5 năm.');
    }
    const duration = Math.floor(days * 86400);

    const { walletClient, account } = await walletActionService.getWalletContext();
    const publicClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: http(ARBITRUM_SEPOLIA_RPC),
    });

    const { request } = await publicClient.simulateContract({
        account,
        address: CONSENT_LEDGER_ADDRESS,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'subDelegate',
        args: [
            patientAddress.toLowerCase(),
            subDelegatee.toLowerCase(),
            duration,
            Boolean(allowFurther),
        ],
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return { txHash: hash };
}

/**
 * Revoke a sub-delegation issued by me (msg.sender must equal parentDelegator).
 */
export async function revokeSubDelegation(patientAddress, subDelegatee) {
    if (!CONSENT_LEDGER_ADDRESS) {
        throw new Error('Thiếu EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS trong env.');
    }
    const { walletClient, account } = await walletActionService.getWalletContext();
    const publicClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: http(ARBITRUM_SEPOLIA_RPC),
    });

    const { request } = await publicClient.simulateContract({
        account,
        address: CONSENT_LEDGER_ADDRESS,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'revokeSubDelegation',
        args: [patientAddress.toLowerCase(), subDelegatee.toLowerCase()],
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return { txHash: hash };
}

// ============ DOCTOR: MINT CONSENT FROM DELEGATION ============

/**
 * Doctor with active delegation uses it to grant a new consent to another doctor
 * on behalf of the patient. msg.sender = delegatee; no patient signature needed.
 *
 * Contract signature: grantUsingDelegation(patient, newGrantee, rootCidHash, encKeyHash, expireAt, includeUpdates, allowDelegate)
 */
export async function grantUsingDelegation({
    patientAddress,
    newGrantee,
    rootCidHash,
    encKeyHash,
    expireAtSeconds = 0,
    includeUpdates = true,
    allowDelegate = false,
}) {
    if (!CONSENT_LEDGER_ADDRESS) {
        throw new Error('Thiếu EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS trong env.');
    }
    const { walletClient, account } = await walletActionService.getWalletContext();
    const publicClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: http(ARBITRUM_SEPOLIA_RPC),
    });

    const { request } = await publicClient.simulateContract({
        account,
        address: CONSENT_LEDGER_ADDRESS,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'grantUsingDelegation',
        args: [
            patientAddress.toLowerCase(),
            newGrantee.toLowerCase(),
            rootCidHash,
            encKeyHash,
            Number(expireAtSeconds),
            Boolean(includeUpdates),
            Boolean(allowDelegate),
        ],
    });
    const hash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return { txHash: hash };
}

export const delegationService = {
    getMyDelegates,
    getDelegatedToMe,
    checkDelegation,
    getDelegationAccessLogs,
    grantAuthority,
    revokeAuthority,
    subDelegate,
    revokeSubDelegation,
    grantUsingDelegation,
};

export default delegationService;
