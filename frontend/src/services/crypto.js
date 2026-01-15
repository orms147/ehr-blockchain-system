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

    // Use chunked base64 encoding to avoid stack overflow with large files
    return arrayBufferToBase64(result);
}

// Helper: Convert ArrayBuffer to base64 without stack overflow
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192; // Process in chunks to avoid call stack exceeded
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
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
// aesKey can be a CryptoKey object or already exported string
export async function createKeySharePayload(cid, aesKey) {
    let keyString;
    if (typeof aesKey === 'string') {
        keyString = aesKey;
    } else if (aesKey && aesKey.aesKey) {
        // Handle { aesKey: 'string' } format
        keyString = aesKey.aesKey;
    } else {
        keyString = await exportAESKey(aesKey);
    }
    return JSON.stringify({ cid, aesKey: keyString });
}


// Parse key share payload
export function parseKeySharePayload(payload) {
    return JSON.parse(payload);
}

// NOTE: encryptForRecipient and decryptFromSender have been moved to nacl-crypto.js
// which provides real NaCl box encryption instead of fake btoa/atob

