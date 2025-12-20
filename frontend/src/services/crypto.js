// Crypto utilities for EHR system
// AES encryption for data, asymmetric for key sharing
import { keccak256, toBytes } from 'viem';

// Compute cidHash from CID string (matches smart contract logic)
export function computeCidHash(cid) {
    return keccak256(toBytes(cid));
}

// Generate random AES-256 key
export async function generateAESKey() {
    const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable
        ['encrypt', 'decrypt']
    );
    return key;
}

// Export AES key to base64 string
export async function exportAESKey(key) {
    const rawKey = await crypto.subtle.exportKey('raw', key);
    return btoa(String.fromCharCode(...new Uint8Array(rawKey)));
}

// Import AES key from base64 string
export async function importAESKey(base64Key) {
    const rawKey = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// Encrypt data with AES-GCM
export async function encryptData(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(JSON.stringify(data));

    const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encodedData
    );

    // Combine IV + encrypted data
    const result = new Uint8Array(iv.length + encryptedData.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encryptedData), iv.length);

    return btoa(String.fromCharCode(...result));
}

// Decrypt data with AES-GCM
export async function decryptData(encryptedBase64, key) {
    const data = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
}

// Create payload for key sharing (CID + AES key)
export async function createKeySharePayload(cid, aesKey) {
    const keyString = await exportAESKey(aesKey);
    return JSON.stringify({ cid, aesKey: keyString });
}

// Parse key share payload
export function parseKeySharePayload(payload) {
    return JSON.parse(payload);
}

// Simple encryption for key sharing (using recipient's derived key)
// In production, use proper asymmetric encryption with recipient's public key
export async function encryptForRecipient(payload, recipientPublicKey) {
    // For demo: just base64 encode
    // TODO: Implement proper ECIES or similar using recipientPublicKey
    return btoa(payload);
}

// Decrypt received key share
export async function decryptFromSender(encryptedPayload, privateKey) {
    // For demo: just base64 decode
    // TODO: Implement proper ECIES decryption
    return atob(encryptedPayload);
}
