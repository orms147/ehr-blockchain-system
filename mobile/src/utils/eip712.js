// EIP-712 Signing Utility for ConsentLedger
// This MUST match the domain and types in the ConsentLedger.sol contract

import { keccak256, toBytes } from 'viem';

// Contract address from environment
const CONSENT_LEDGER_ADDRESS = process.env.EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS;
const CHAIN_ID = parseInt(process.env.EXPO_PUBLIC_CHAIN_ID || '421614');

// EIP-712 Domain - MUST match contract constructor
export const EIP712_DOMAIN = {
    name: 'EHR Consent Ledger',
    version: '2',
    chainId: CHAIN_ID,
    verifyingContract: CONSENT_LEDGER_ADDRESS,
};

// EIP-712 Types - MUST match contract CONSENT_PERMIT_TYPEHASH.
// 2026-04-19: dropped `includeUpdates` — medical episode model.
export const CONSENT_PERMIT_TYPES = {
    ConsentPermit: [
        { name: 'patient', type: 'address' },
        { name: 'grantee', type: 'address' },
        { name: 'rootCidHash', type: 'bytes32' },
        { name: 'encKeyHash', type: 'bytes32' },
        { name: 'expireAt', type: 'uint256' },
        { name: 'allowDelegate', type: 'bool' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
    ],
};

// EIP-712 Types - MUST match contract DELEGATION_PERMIT_TYPEHASH:
//   DelegationPermit(address patient,address delegatee,uint40 duration,bool allowSubDelegate,uint256 deadline,uint256 nonce)
// Note: the contract accepts uint40 for `duration` but viem/EIP-712 signs with
// uint40 too — we stringify as BigInt below. The nonce field is shared with
// ConsentPermit (same `nonces[patient]` storage slot in the contract).
export const DELEGATION_PERMIT_TYPES = {
    DelegationPermit: [
        { name: 'patient', type: 'address' },
        { name: 'delegatee', type: 'address' },
        { name: 'duration', type: 'uint40' },
        { name: 'allowSubDelegate', type: 'bool' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
    ],
};

/**
 * Sign a grant consent message using EIP-712
 * @param {object} walletClient - Viem WalletClient with signer
 * @param {object} params - Grant parameters
 * @returns {Promise<string>} - The EIP-712 signature
 */
export async function signGrantConsent(walletClient, params) {
    const {
        patient,
        grantee,
        rootCidHash,
        encKeyHash,
        expireAt,
        allowDelegate,
        deadline,
        nonce,
    } = params;

    // Use the local account attached to walletClient (privateKeyToAccount) so signing
    // happens offline. Passing an address string here would make viem dispatch via
    // eth_signTypedData_v4 over RPC, which Arbitrum RPC node does not support.
    const account = walletClient.account;

    if (!account) {
        throw new Error('No local account found in walletClient');
    }

    // Message to sign
    const message = {
        patient: patient.toLowerCase(),
        grantee: grantee.toLowerCase(),
        rootCidHash,
        encKeyHash,
        expireAt: BigInt(expireAt),
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
 * Sign a DelegationPermit for patient -> doctor authority grant.
 * Backend relays this via ConsentLedger.delegateAuthorityBySig.
 *
 * @param {object} walletClient - Viem WalletClient with local account
 * @param {object} params
 * @param {string} params.patient           - patient wallet address
 * @param {string} params.delegatee         - doctor wallet address
 * @param {number} params.duration          - authority duration in SECONDS (uint40)
 * @param {boolean} params.allowSubDelegate - doctor may sub-delegate further
 * @param {number} params.deadline          - EIP-712 sig deadline (unix seconds)
 * @param {number|string|bigint} params.nonce - patient's current nonce from getNonce()
 * @returns {Promise<string>} EIP-712 signature (0x...)
 */
export async function signDelegationPermit(walletClient, params) {
    const {
        patient,
        delegatee,
        duration,
        allowSubDelegate,
        deadline,
        nonce,
    } = params;

    const account = walletClient.account;
    if (!account) {
        throw new Error('No local account found in walletClient');
    }

    const message = {
        patient: patient.toLowerCase(),
        delegatee: delegatee.toLowerCase(),
        duration: BigInt(duration),
        allowSubDelegate: Boolean(allowSubDelegate),
        deadline: BigInt(deadline),
        nonce: BigInt(nonce),
    };

    const signature = await walletClient.signTypedData({
        account,
        domain: EIP712_DOMAIN,
        types: DELEGATION_PERMIT_TYPES,
        primaryType: 'DelegationPermit',
        message,
    });

    return signature;
}

/**
 * Compute cidHash from CID string
 */
export function computeCidHash(cid) {
    return keccak256(toBytes(cid));
}

/**
 * Compute encKeyHash from AES key
 */
export function computeEncKeyHash(aesKey) {
    if (!aesKey) return keccak256(toBytes(''));
    return keccak256(toBytes(aesKey));
}

/**
 * Get deadline timestamp (default: 1 hour from now)
 */
export function getDeadline(hours = 1) {
    return Math.floor(Date.now() / 1000) + (hours * 3600);
}

export default {
    signGrantConsent,
    signDelegationPermit,
    computeCidHash,
    computeEncKeyHash,
    getDeadline,
    EIP712_DOMAIN,
    CONSENT_PERMIT_TYPES,
    DELEGATION_PERMIT_TYPES,
};
