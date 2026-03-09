import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// Ensure 32 byte key for AES-256
const getEncryptionKey = () => {
    let key = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!key) {
        console.warn('⚠️ CREDENTIAL_ENCRYPTION_KEY not set in .env. Using ephemeral key (credentials may be lost on restart).');
        key = crypto.randomBytes(32).toString('hex');
    }
    // Pad or truncate to exactly 32 bytes
    if (key.length < 32) return Buffer.from(key.padEnd(32, '0'));
    return Buffer.from(key.slice(0, 32));
};

const ENCRYPTION_KEY = getEncryptionKey();
const IV_LENGTH = 16; // AES block size

/**
 * Encrypt plaintext string using AES-256-GCM
 */
export function encryptAES(text) {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');

        // Format: iv:encrypted:authTag
        return `${iv.toString('hex')}:${encrypted}:${authTag}`;
    } catch (error) {
        console.error('Encryption error:', error.message);
        throw new Error('Encryption failed');
    }
}

/**
 * Decrypt AES-256-GCM encrypted string
 */
export function decryptAES(encryptedPayload) {
    if (!encryptedPayload) return encryptedPayload;
    try {
        const parts = encryptedPayload.split(':');
        if (parts.length !== 3) return encryptedPayload; // Not encrypted by us / invalid format

        const [ivHex, encryptedData, authTagHex] = parts;

        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            ENCRYPTION_KEY,
            Buffer.from(ivHex, 'hex')
        );
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (e) {
        console.error('Decryption error:', e.message);
        return null;
    }
}
