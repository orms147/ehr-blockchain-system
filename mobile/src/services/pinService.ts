// pinService — PIN 6 chữ số fallback cho user không có biometric hardware.
//
// §19 R3 (2026-06-03): theo research biometric-research.md, các app banking VN
// luôn có PIN fallback bên cạnh biometric. Cho EHR thesis:
//   - User có hardware → biometric primary
//   - User không hardware (case A) hoặc chưa enrolled (case B) → PIN fallback
//   - Lưu hashed PIN (SHA-256 + salt) trong SecureStore, KHÔNG lưu plaintext
//
// PIN hash: SHA-256(pin + salt) — salt 32 byte ngẫu nhiên, lưu cùng SecureStore.
// Trên thiết bị bị compromise, attacker cần bruteforce 10^6 PIN combinations
// nhưng vẫn cần salt + access SecureStore (đã chống brute-force qua SecureStore
// Android Keystore + iOS Keychain).
//
// LIMITATION (2026-06-03): infrastructure-only — chưa integrate auto fallback
// với gateOrThrow ở các sign sites. User setup PIN qua Cài đặt + Onboarding.
// Full integrate (verify trước mỗi sign khi biometric không available) =
// future work, cần PinPromptContext hoặc global event emitter.

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const PIN_HASH_KEY = 'mfa_pin_hash_v1';
const PIN_SALT_KEY = 'mfa_pin_salt_v1';

const PIN_REGEX = /^\d{6}$/;

function randomHex(bytes: number): string {
    const arr = Crypto.getRandomBytes(bytes);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin: string, salt: string): Promise<string> {
    return Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${salt}::${pin}`,
        { encoding: Crypto.CryptoEncoding.HEX },
    );
}

/**
 * Validate PIN format (đúng 6 chữ số). Throw nếu sai.
 */
export function validatePinFormat(pin: string): void {
    if (!PIN_REGEX.test(pin)) {
        throw new Error('PIN phải gồm đúng 6 chữ số (0-9).');
    }
}

/**
 * Đặt PIN mới. Ghi đè PIN cũ nếu có.
 */
export async function setupPin(pin: string): Promise<void> {
    validatePinFormat(pin);
    const salt = randomHex(32);
    const hash = await hashPin(pin, salt);
    await Promise.all([
        SecureStore.setItemAsync(PIN_HASH_KEY, hash),
        SecureStore.setItemAsync(PIN_SALT_KEY, salt),
    ]);
}

/**
 * Kiểm tra PIN nhập vào có khớp PIN đã lưu không.
 */
export async function verifyPin(pin: string): Promise<boolean> {
    try {
        if (!PIN_REGEX.test(pin)) return false;
        const [storedHash, salt] = await Promise.all([
            SecureStore.getItemAsync(PIN_HASH_KEY),
            SecureStore.getItemAsync(PIN_SALT_KEY),
        ]);
        if (!storedHash || !salt) return false;
        const candidate = await hashPin(pin, salt);
        return candidate === storedHash;
    } catch {
        return false;
    }
}

/**
 * True nếu user đã setup PIN.
 */
export async function hasPin(): Promise<boolean> {
    try {
        const v = await SecureStore.getItemAsync(PIN_HASH_KEY);
        return !!v;
    } catch {
        return false;
    }
}

/**
 * Xoá PIN khỏi SecureStore (vd: logout, reset).
 */
export async function clearPin(): Promise<void> {
    await Promise.all([
        SecureStore.deleteItemAsync(PIN_HASH_KEY).catch(() => {}),
        SecureStore.deleteItemAsync(PIN_SALT_KEY).catch(() => {}),
    ]);
}

export default {
    setupPin,
    verifyPin,
    hasPin,
    clearPin,
    validatePinFormat,
};
