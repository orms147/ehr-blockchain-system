/**
 * NaCl Encryption Module for EHR System (Mobile App)
 */

import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
import { keccak256, toBytes, concat } from 'viem';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ==================== KEY GENERATION ====================

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

export function decryptFromSender(encryptedJson, senderPublicKey, recipientSecretKey) {
    let parsed;
    try {
        parsed = JSON.parse(encryptedJson);
    } catch (e) {
        throw new Error('Dữ liệu mã hóa không hợp lệ');
    }
    const { nonce, ciphertext } = parsed;

    const decrypted = nacl.box.open(
        decodeBase64(ciphertext),
        decodeBase64(nonce),
        decodeBase64(senderPublicKey),
        decodeBase64(recipientSecretKey)
    );

    if (!decrypted) {
        throw new Error('Decryption failed: invalid key or tampered message');
    }

    return new TextDecoder().decode(decrypted);
}

// ==================== KEY STORAGE (ENCRYPTED) ====================

const STORAGE_KEY_ENCRYPTED = 'ehr_nacl_encrypted_key';
const STORAGE_KEY_PUBLIC = 'ehr_nacl_public_key';
const STORAGE_KEY_VERSION = 'ehr_nacl_key_version';
const SIGNATURE_MESSAGE = 'EHR-Sign-Encryption-Key-v1';
const APP_SALT = 'EHR-NACL-KEY-DERIVATION-v1';

function deriveKeyFromWalletSignature(signature, walletAddress) {
    const material = concat([
        toBytes(signature),
        toBytes(walletAddress.toLowerCase()),
        toBytes(APP_SALT),
    ]);
    const hash = keccak256(material);
    return toBytes(hash).slice(0, 32);
}

function encryptSecretKeyForStorage(secretKey, signature, walletAddress) {
    const derivedKey = deriveKeyFromWalletSignature(signature, walletAddress);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const secretKeyBytes = decodeBase64(secretKey);

    const encrypted = nacl.secretbox(secretKeyBytes, nonce, derivedKey);

    return JSON.stringify({
        nonce: encodeBase64(nonce),
        ciphertext: encodeBase64(encrypted),
        version: 'v2', 
    });
}

function decryptSecretKeyFromStorage(encryptedJson, signature, walletAddress) {
    let parsed;
    try {
        parsed = JSON.parse(encryptedJson);
    } catch (e) {
        throw new Error('Dữ liệu khóa lưu trữ không hợp lệ');
    }
    const { nonce, ciphertext } = parsed;
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

// ==================== HIGH-LEVEL API ====================

export function getKeyDerivationMessage(walletAddress) {
    return `${SIGNATURE_MESSAGE}\nWallet: ${walletAddress}`;
}

export async function getOrCreateEncryptionKeypair(walletClient, walletAddress) {
    const message = getKeyDerivationMessage(walletAddress);
    let signature;
    try {
        signature = await walletClient.signMessage({ message });
    } catch (error) {
        console.error('Signature rejected OR wallet busy:', error);
        throw error;
    }

    const seed = deriveKeyFromWalletSignature(signature, walletAddress);
    const keypair = generateEncryptionKeypair(seed);

    console.log('🔑 Generated Deterministic Keypair (Mobile)');

    const encryptedSecretKey = encryptSecretKeyForStorage(keypair.secretKey, signature, walletAddress);
    
    await AsyncStorage.setItem(STORAGE_KEY_ENCRYPTED, encryptedSecretKey);
    await AsyncStorage.setItem(STORAGE_KEY_PUBLIC, keypair.publicKey);
    await AsyncStorage.setItem(STORAGE_KEY_VERSION, 'v3');

    return keypair;
}

export async function getCachedPublicKey() {
    return await AsyncStorage.getItem(STORAGE_KEY_PUBLIC);
}

export async function hasEncryptionKeypair() {
    const pub = await AsyncStorage.getItem(STORAGE_KEY_PUBLIC);
    const enc = await AsyncStorage.getItem(STORAGE_KEY_ENCRYPTED);
    return !!(pub && enc);
}

export async function clearEncryptionKeypair() {
    await AsyncStorage.removeItem(STORAGE_KEY_PUBLIC);
    await AsyncStorage.removeItem(STORAGE_KEY_ENCRYPTED);
    await AsyncStorage.removeItem(STORAGE_KEY_VERSION);
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
