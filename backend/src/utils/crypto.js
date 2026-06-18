import crypto from 'crypto';
import dotenv from 'dotenv';
import { createLogger } from './logger.js';
dotenv.config();

const log = createLogger('Crypto');

// Ensure 32 byte key for AES-256
const getEncryptionKey = () => {
    const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
    const isProd = process.env.NODE_ENV === 'production';
    if (!key) {
        // F18 fix: fail FAST in production instead of silently using an ephemeral
        // key (which makes every stored DoctorCredential undecryptable after a
        // restart / on a second instance).
        if (isProd) {
            throw new Error('CREDENTIAL_ENCRYPTION_KEY is required in production (64-char hex). Refusing to start with an ephemeral key.');
        }
        log.error('CREDENTIAL_ENCRYPTION_KEY not set! Using an EPHEMERAL key (DEV ONLY) — encrypted credentials will be LOST on restart. Set a 64-char hex value in .env');
        return crypto.randomBytes(32);
    }
    // Key should be 64-char hex string → 32 bytes
    const hexClean = key.replace(/^0x/, '');
    if (/^[a-fA-F0-9]{64}$/.test(hexClean)) {
        return Buffer.from(hexClean, 'hex');
    }
    // Not 64-char hex: acceptable (hashed) in dev, but reject in production.
    if (isProd) {
        throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 64-char hex (32-byte) value in production.');
    }
    log.warn('CREDENTIAL_ENCRYPTION_KEY is not 64-char hex. Hashing it to derive key (DEV ONLY).');
    return crypto.createHash('sha256').update(key).digest();
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
        log.error('Encryption error', { error: error.message });
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
        log.error('Decryption error', { error: e.message });
        return null;
    }
}
