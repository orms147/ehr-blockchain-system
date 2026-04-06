/**
 * Crypto utilities for EHR system (Mobile App)
 * AES encryption for data, asymmetric for key sharing.
 * Uses node-forge for AES-GCM on React Native since Web Crypto API is unavailable.
 */
import { keccak256, toBytes } from 'viem';
import forge from 'node-forge';

// Compute cidHash from CID string
export function computeCidHash(cid) {
    return keccak256(toBytes(cid));
}

// Generates a new 256-bit AES key and returns it as base64 string
export async function generateAESKey() {
    const key = forge.random.getBytesSync(32);
    return forge.util.encode64(key);
}

// Expected base64Key string (already base64 as returned by node-forge or Web Client export)
export async function exportAESKey(keyBase64) {
    return keyBase64; 
}

// In mobile, we just pass around the base64 string
export async function importAESKey(base64Key) {
    return base64Key;
}

/**
 * Encrypt data with AES-GCM
 * @param {object} data - Data to encrypt
 * @param {string} base64Key - AES key in base64
 * @returns {string} - Base64 encoded encrypted payload (IV + Ciphertext + Tag)
 */
export async function encryptData(data, base64Key) {
    const keyBytes = forge.util.decode64(base64Key);
    const ivBytes = forge.random.getBytesSync(12);
    
    const cipher = forge.cipher.createCipher('AES-GCM', keyBytes);
    cipher.start({ iv: ivBytes });
    
    // Convert object string to utf8 bytes
    const textData = JSON.stringify(data);
    cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(textData)));
    cipher.finish();

    const encryptedBytes = cipher.output.getBytes();
    const tagBytes = cipher.mode.tag.getBytes();

    // The Web logic expected: [ IV (12) | CipherText (N) | Tag (16 max) ]
    // We combine them before encoding
    const result = ivBytes + encryptedBytes + tagBytes;
    
    return forge.util.encode64(result);
}

/**
 * Decrypt data with AES-GCM
 * @param {string} encryptedBase64 - Base64 encoded payload (IV + Ciphertext + Tag)
 * @param {string} base64Key - AES key in base64
 * @returns {object} - Decrypted JSON object
 */
export async function decryptData(encryptedBase64, base64Key) {
    const dataBytes = forge.util.decode64(encryptedBase64);
    const keyBytes = forge.util.decode64(base64Key);

    // subtle.crypto AES-GCM appends the auth tag (16 bytes) at the very end
    // First 12 bytes = IV
    const ivBytes = dataBytes.substring(0, 12);
    // Last 16 bytes = Auth Tag
    const tagBytes = dataBytes.substring(dataBytes.length - 16);
    // Middle = Ciphertext
    const ciphertextBytes = dataBytes.substring(12, dataBytes.length - 16);

    const decipher = forge.cipher.createDecipher('AES-GCM', keyBytes);
    decipher.start({
        iv: ivBytes,
        tag: forge.util.createBuffer(tagBytes)
    });
    
    decipher.update(forge.util.createBuffer(ciphertextBytes));
    const pass = decipher.finish();

    if (!pass) {
        throw new Error('GCM Authentication Failed');
    }

    const decryptedUtf8 = forge.util.decodeUtf8(decipher.output.getBytes());
    try {
        return JSON.parse(decryptedUtf8);
    } catch (e) {
        throw new Error('Giải mã thành công nhưng dữ liệu không hợp lệ');
    }
}

// Create payload for key sharing
export async function createKeySharePayload(cid, aesKey) {
    let keyString = aesKey;
    if (typeof aesKey === 'object' && aesKey.aesKey) {
        keyString = aesKey.aesKey;
    }
    return JSON.stringify({ cid, aesKey: keyString });
}

// Parse key share payload
export function parseKeySharePayload(payload) {
    try {
        return JSON.parse(payload);
    } catch (e) {
        throw new Error('Dữ liệu chia sẻ khóa không hợp lệ');
    }
}
