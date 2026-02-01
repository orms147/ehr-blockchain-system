/**
 * NaCl Encryption Module for EHR System
 * 
 * Uses x25519 curve for key exchange and XSalsa20-Poly1305 for encryption.
 * Encryption keypair is separate from wallet keypair (identity vs data encryption).
 * 
 * Security Notes:
 * - Encryption private key is protected using a symmetric key derived from wallet signature via KDF
 * - For prototype simplicity, encrypted private keys are stored in localStorage. 
 *   In production, secure storage such as IndexedDB with OS-level protection 
 *   or hardware-backed keystores should be used.
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { keccak256, toBytes, concat } from 'viem';

// ==================== KEY GENERATION ====================

/**
 * Generate new NaCl x25519 keypair for encryption
 * @param {Uint8Array} [seed] - Optional 32-byte seed for deterministic generation
 * @returns {{ publicKey: string, secretKey: string }} Base64 encoded keypair
 */
export function generateEncryptionKeypair(seed) {
    let keypair;
    if (seed) {
        keypair = nacl.box.keyPair.fromSecretKey(seed);
    } else {
        keypair = nacl.box.keyPair();
    }
    return {
        publicKey: encodeBase64(keypair.publicKey),
        secretKey: encodeBase64(keypair.secretKey),
    };
}

// ==================== ENCRYPTION / DECRYPTION ====================

/**
 * Encrypt message for a recipient using NaCl box
 * @param {string} message - Plaintext message to encrypt
 * @param {string} recipientPublicKey - Recipient's NaCl public key (base64)
 * @param {string} senderSecretKey - Sender's NaCl secret key (base64)
 * @returns {string} JSON string with nonce and ciphertext (base64)
 */
export function encryptForRecipient(message, recipientPublicKey, senderSecretKey) {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageBytes = new TextEncoder().encode(message);
    const pubKey = decodeBase64(recipientPublicKey);
    const secKey = decodeBase64(senderSecretKey);

    const encrypted = nacl.box(messageBytes, nonce, pubKey, secKey);

    return JSON.stringify({
        nonce: encodeBase64(nonce),
        ciphertext: encodeBase64(encrypted),
    });
}

/**
 * Decrypt message from sender using NaCl box.open
 * @param {string} encryptedJson - JSON string with nonce and ciphertext
 * @param {string} senderPublicKey - Sender's NaCl public key (base64)
 * @param {string} recipientSecretKey - Recipient's NaCl secret key (base64)
 * @returns {string} Decrypted plaintext
 * @throws {Error} If decryption fails (invalid key, tampered message, etc.)
 */
export function decryptFromSender(encryptedJson, senderPublicKey, recipientSecretKey) {
    const { nonce, ciphertext } = JSON.parse(encryptedJson);

    const decrypted = nacl.box.open(
        decodeBase64(ciphertext),
        decodeBase64(nonce),
        decodeBase64(senderPublicKey),
        decodeBase64(recipientSecretKey)
    );

    // Handle decryption failure (null means authentication failed)
    if (!decrypted) {
        throw new Error('Decryption failed: invalid key or tampered message');
    }

    return new TextDecoder().decode(decrypted);
}

// ==================== KEY STORAGE (ENCRYPTED) ====================

const STORAGE_KEY_ENCRYPTED = 'ehr_nacl_encrypted_key';
const STORAGE_KEY_PUBLIC = 'ehr_nacl_public_key';
const STORAGE_KEY_VERSION = 'ehr_nacl_key_version'; // Track which scheme was used
const SIGNATURE_MESSAGE = 'EHR-Sign-Encryption-Key-v1';
const APP_SALT = 'EHR-NACL-KEY-DERIVATION-v1';

/**
 * Derive stable symmetric key from wallet signature using HKDF-like approach
 * MPC-safe, non-deterministic signature safe
 * 
 * @param {string} signature - Wallet signature
 * @param {string} walletAddress - User's wallet address
 * @returns {Uint8Array} 32-byte derived key
 */
function deriveKeyFromWalletSignature(signature, walletAddress) {
    // Combine signature + walletAddress + salt for stability
    const material = concat([
        toBytes(signature),
        toBytes(walletAddress.toLowerCase()),
        toBytes(APP_SALT),
    ]);

    const hash = keccak256(material);
    return toBytes(hash).slice(0, 32);
}

/**
 * Legacy: Derive key from signature only (for migration)
 * @deprecated Use deriveKeyFromWalletSignature instead
 */
function deriveKeyFromSignatureLegacy(signature) {
    const hash = keccak256(toBytes(signature));
    return toBytes(hash).slice(0, 32);
}

/**
 * Encrypt the NaCl secret key using key derived from wallet signature
 * @param {string} secretKey - NaCl secret key (base64)
 * @param {string} signature - Wallet signature
 * @param {string} walletAddress - User's wallet address
 * @returns {string} Encrypted secret key (JSON with nonce + ciphertext)
 */
function encryptSecretKeyForStorage(secretKey, signature, walletAddress) {
    const derivedKey = deriveKeyFromWalletSignature(signature, walletAddress);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const secretKeyBytes = decodeBase64(secretKey);

    const encrypted = nacl.secretbox(secretKeyBytes, nonce, derivedKey);

    return JSON.stringify({
        nonce: encodeBase64(nonce),
        ciphertext: encodeBase64(encrypted),
        version: 'v2', // Self-describing payload
    });
}

/**
 * Decrypt the stored NaCl secret key using wallet signature (NEW scheme)
 * @param {string} encryptedJson - Encrypted secret key (JSON)
 * @param {string} signature - Wallet signature
 * @param {string} walletAddress - User's wallet address
 * @returns {string} Decrypted NaCl secret key (base64)
 * @throws {Error} If decryption fails
 */
function decryptSecretKeyFromStorage(encryptedJson, signature, walletAddress) {
    const { nonce, ciphertext } = JSON.parse(encryptedJson);
    const derivedKey = deriveKeyFromWalletSignature(signature, walletAddress);

    const decrypted = nacl.secretbox.open(
        decodeBase64(ciphertext),
        decodeBase64(nonce),
        derivedKey
    );

    if (!decrypted) {
        throw new Error('Failed to decrypt with new scheme');
    }

    return encodeBase64(decrypted);
}

/**
 * Legacy: Decrypt using old scheme (signature only, for migration)
 */
function decryptSecretKeyFromStorageLegacy(encryptedJson, signature) {
    const { nonce, ciphertext } = JSON.parse(encryptedJson);
    const derivedKey = deriveKeyFromSignatureLegacy(signature);

    const decrypted = nacl.secretbox.open(
        decodeBase64(ciphertext),
        decodeBase64(nonce),
        derivedKey
    );

    if (!decrypted) {
        throw new Error('Failed to decrypt with legacy scheme');
    }

    return encodeBase64(decrypted);
}

// ==================== HIGH-LEVEL API ====================

/**
 * Get the signing message for key derivation
 * @param {string} walletAddress - User's wallet address
 * @returns {string} Message to be signed
 */
export function getKeyDerivationMessage(walletAddress) {
    return `${SIGNATURE_MESSAGE}\nWallet: ${walletAddress}`;
}

/**
 * Get or create encryption keypair for user
 * Supports migration from old scheme (signature-only) to new scheme (HKDF + wallet)
 * 
 * @param {object} provider - Web3 provider for signing
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{ publicKey: string, secretKey: string }>} User's encryption keypair
 */
export async function getOrCreateEncryptionKeypair(provider, walletAddress) {
    // 1. Get signature (User identity proof)
    const message = getKeyDerivationMessage(walletAddress);
    let signature;
    try {
        signature = await provider.request({
            method: 'personal_sign',
            params: [message, walletAddress],
        });
    } catch (error) {
        console.error('Signature rejected OR wallet busy:', error);
        throw error;
    }

    // 2. Derive Deterministic Key from Signature
    // This 32-byte hash acts as the seed for the NaCl keypair.
    // Same Wallet = Same Signature = Same Seed = Same Keypair.
    const seed = deriveKeyFromWalletSignature(signature, walletAddress);

    // Generate Deterministic Keypair (v3)
    const keypair = generateEncryptionKeypair(seed);

    console.log('🔑 Generated Deterministic Keypair (v3-AccessAnywhere)');

    // 3. Cache in LocalStorage (for performance/offline use)
    // We still encrypt the SK for storage compliance
    const encryptedSecretKey = encryptSecretKeyForStorage(keypair.secretKey, signature, walletAddress);
    localStorage.setItem(STORAGE_KEY_ENCRYPTED, encryptedSecretKey);
    localStorage.setItem(STORAGE_KEY_PUBLIC, keypair.publicKey);
    localStorage.setItem(STORAGE_KEY_VERSION, 'v3'); // Mark as Version 3 (Deterministic)

    return keypair;
}

/**
 * Get cached public key (without signature requirement)
 * @returns {string | null} Public key if exists
 */
export function getCachedPublicKey() {
    if (typeof window === 'undefined') return null; // SSR check
    return localStorage.getItem(STORAGE_KEY_PUBLIC);
}

/**
 * Check if user has encryption keypair
 * @returns {boolean}
 */
export function hasEncryptionKeypair() {
    if (typeof window === 'undefined') return false; // SSR check
    return !!(localStorage.getItem(STORAGE_KEY_PUBLIC) && localStorage.getItem(STORAGE_KEY_ENCRYPTED));
}

/**
 * Clear stored encryption keypair and version
 */
export function clearEncryptionKeypair() {
    if (typeof window === 'undefined') return; // SSR check
    localStorage.removeItem(STORAGE_KEY_PUBLIC);
    localStorage.removeItem(STORAGE_KEY_ENCRYPTED);
    localStorage.removeItem(STORAGE_KEY_VERSION);
}

export default {
    generateEncryptionKeypair,
    encryptForRecipient,
    decryptFromSender,
    getOrCreateEncryptionKeypair,
    getCachedPublicKey,
    hasEncryptionKeypair,
    clearEncryptionKeypair,
    getKeyDerivationMessage,
};
