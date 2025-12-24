// EIP-712 Signing Utility for ConsentLedger
// This MUST match the domain and types in the ConsentLedger.sol contract

import { keccak256, toBytes, encodePacked } from 'viem';

// Contract address from environment
const CONSENT_LEDGER_ADDRESS = process.env.NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS;
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '421614');

// EIP-712 Domain - MUST match contract constructor
export const EIP712_DOMAIN = {
    name: 'EHR Consent Ledger',
    version: '2',
    chainId: CHAIN_ID,
    verifyingContract: CONSENT_LEDGER_ADDRESS,
};

// EIP-712 Types - MUST match contract CONSENT_PERMIT_TYPEHASH
export const CONSENT_PERMIT_TYPES = {
    ConsentPermit: [
        { name: 'patient', type: 'address' },
        { name: 'grantee', type: 'address' },
        { name: 'rootCidHash', type: 'bytes32' },
        { name: 'encKeyHash', type: 'bytes32' },
        { name: 'expireAt', type: 'uint256' },
        { name: 'includeUpdates', type: 'bool' },
        { name: 'allowDelegate', type: 'bool' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
    ],
};

/**
 * Sign a grant consent message using EIP-712
 * @param {object} walletClient - Viem WalletClient with signer
 * @param {object} params - Grant parameters
 * @param {string} params.patient - Patient address
 * @param {string} params.grantee - Doctor address receiving access
 * @param {string} params.rootCidHash - keccak256 hash of the CID (bytes32)
 * @param {string} params.encKeyHash - keccak256 hash of encryption key (bytes32)
 * @param {number} params.expireAt - Expiration timestamp (0 = forever)
 * @param {boolean} params.includeUpdates - Can access child records
 * @param {boolean} params.allowDelegate - Can delegate access to others
 * @param {number} params.deadline - Signature deadline (recommended: now + 1 hour)
 * @param {bigint} params.nonce - Current nonce from contract
 * @returns {Promise<string>} - The EIP-712 signature
 */
export async function signGrantConsent(walletClient, params) {
    const {
        patient,
        grantee,
        rootCidHash,
        encKeyHash,
        expireAt,
        includeUpdates,
        allowDelegate,
        deadline,
        nonce,
    } = params;

    // Get account from wallet client
    const [account] = await walletClient.getAddresses();

    if (!account) {
        throw new Error('No account found in wallet');
    }

    // Message to sign
    const message = {
        patient: patient.toLowerCase(),
        grantee: grantee.toLowerCase(),
        rootCidHash,
        encKeyHash,
        expireAt: BigInt(expireAt),
        includeUpdates,
        allowDelegate,
        deadline: BigInt(deadline),
        nonce: BigInt(nonce),
    };

    // Sign using EIP-712 with account
    const signature = await walletClient.signTypedData({
        account,
        domain: EIP712_DOMAIN,
        types: CONSENT_PERMIT_TYPES,
        primaryType: 'ConsentPermit',
        message,
    });

    return signature;
}

/**
 * Compute cidHash from CID string
 * @param {string} cid - The IPFS CID
 * @returns {string} - bytes32 keccak256 hash
 */
export function computeCidHash(cid) {
    return keccak256(toBytes(cid));
}

/**
 * Compute encKeyHash from AES key
 * @param {string} aesKey - The AES key (base64)
 * @returns {string} - bytes32 keccak256 hash
 */
export function computeEncKeyHash(aesKey) {
    return keccak256(toBytes(aesKey));
}

/**
 * Get deadline timestamp (default: 1 hour from now)
 * @param {number} [hours=1] - Hours from now
 * @returns {number} - Unix timestamp
 */
export function getDeadline(hours = 1) {
    return Math.floor(Date.now() / 1000) + (hours * 3600);
}

export default {
    signGrantConsent,
    computeCidHash,
    computeEncKeyHash,
    getDeadline,
    EIP712_DOMAIN,
    CONSENT_PERMIT_TYPES,
};
