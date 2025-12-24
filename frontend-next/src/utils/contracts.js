// Contract Utilities - Direct contract calls for EHR system
// Used for reading contract state and self-pay transactions

import { createPublicClient, createWalletClient, http, parseAbi, custom } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

// Contract addresses from environment
const CONSENT_LEDGER_ADDRESS = process.env.NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS;
const ACCESS_CONTROL_ADDRESS = process.env.NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS;
const RECORD_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_RECORD_REGISTRY_ADDRESS;

// Minimal ABIs for read/write operations
const CONSENT_LEDGER_ABI = parseAbi([
    // Read functions
    'function nonces(address patient) view returns (uint256)',
    'function canAccess(address patient, address grantee, bytes32 cidHash) view returns (bool)',
    'function getConsent(address patient, address grantee, bytes32 rootCidHash) view returns ((address patient, address grantee, bytes32 rootCidHash, bytes32 encKeyHash, uint40 issuedAt, uint40 expireAt, bool active, bool includeUpdates, bool allowDelegate))',
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    // Write functions (for self-pay)
    'function grantBySig(address patient, address grantee, bytes32 rootCidHash, bytes32 encKeyHash, uint40 expireAt, bool includeUpdates, bool allowDelegate, uint256 deadline, bytes signature) external',
    'function revoke(address grantee, bytes32 rootCidHash) external',
]);

// Public client for read operations (no wallet needed)
const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'),
});

/**
 * Get current nonce for patient from ConsentLedger contract
 * @param {string} patientAddress - Patient wallet address
 * @returns {Promise<bigint>} - Current nonce
 */
export async function getNonce(patientAddress) {
    const nonce = await publicClient.readContract({
        address: CONSENT_LEDGER_ADDRESS,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'nonces',
        args: [patientAddress],
    });
    return nonce;
}

/**
 * Check if grantee has consent for a record on-chain
 * @param {string} patientAddress - Patient wallet address
 * @param {string} granteeAddress - Doctor wallet address
 * @param {string} cidHash - Record cidHash (bytes32)
 * @returns {Promise<boolean>} - true if consent is active
 */
export async function checkConsentOnChain(patientAddress, granteeAddress, cidHash) {
    try {
        const hasAccess = await publicClient.readContract({
            address: CONSENT_LEDGER_ADDRESS,
            abi: CONSENT_LEDGER_ABI,
            functionName: 'canAccess',
            args: [patientAddress, granteeAddress, cidHash],
        });
        return hasAccess;
    } catch (error) {
        console.error('Error checking consent on-chain:', error);
        return false;
    }
}

/**
 * Get full consent details from contract
 * @param {string} patientAddress - Patient wallet address
 * @param {string} granteeAddress - Doctor wallet address
 * @param {string} cidHash - Record cidHash (bytes32)
 * @returns {Promise<object|null>} - Consent details or null if not found
 */
export async function getConsentDetails(patientAddress, granteeAddress, cidHash) {
    try {
        const consent = await publicClient.readContract({
            address: CONSENT_LEDGER_ADDRESS,
            abi: CONSENT_LEDGER_ABI,
            functionName: 'getConsent',
            args: [patientAddress, granteeAddress, cidHash],
        });
        return consent;
    } catch (error) {
        console.error('Error getting consent details:', error);
        return null;
    }
}

/**
 * Create wallet client for user-signed transactions
 * @param {object} provider - Web3Auth or wallet provider
 * @returns {object} - Viem WalletClient
 */
export function createUserWalletClient(provider) {
    return createWalletClient({
        chain: arbitrumSepolia,
        transport: custom(provider),
    });
}

/**
 * User pays gas to call grantBySig (when quota exhausted)
 * @param {object} provider - Web3Auth or wallet provider
 * @param {object} params - All grant parameters including signature
 * @returns {Promise<string>} - Transaction hash
 */
export async function userGrantConsent(provider, params) {
    const walletClient = createUserWalletClient(provider);
    const [account] = await walletClient.getAddresses();

    const hash = await walletClient.writeContract({
        account,
        address: CONSENT_LEDGER_ADDRESS,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'grantBySig',
        args: [
            params.patient,
            params.grantee,
            params.rootCidHash,
            params.encKeyHash,
            params.expireAt,
            params.includeUpdates,
            params.allowDelegate,
            params.deadline,
            params.signature,
        ],
    });

    return hash;
}

/**
 * User pays gas to revoke consent (when quota exhausted)
 * @param {object} provider - Web3Auth or wallet provider
 * @param {string} granteeAddress - Doctor address to revoke
 * @param {string} cidHash - Record cidHash (bytes32)
 * @returns {Promise<string>} - Transaction hash
 */
export async function userRevokeConsent(provider, granteeAddress, cidHash) {
    const walletClient = createUserWalletClient(provider);
    const [account] = await walletClient.getAddresses();

    const hash = await walletClient.writeContract({
        account,
        address: CONSENT_LEDGER_ADDRESS,
        abi: CONSENT_LEDGER_ABI,
        functionName: 'revoke',
        args: [granteeAddress, cidHash],
    });

    return hash;
}

export default {
    getNonce,
    checkConsentOnChain,
    getConsentDetails,
    createUserWalletClient,
    userGrantConsent,
    userRevokeConsent,
    publicClient,
};
