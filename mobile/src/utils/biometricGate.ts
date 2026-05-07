// Biometric MFA gate for signing operations (P4, S18 2026-05-04).
//
// TT 13/2025/TT-BYT Điều 3.2 lists biometric authentication as a directly
// recognized form of legal e-signature in Vietnam. The Web3Auth wallet
// signature alone is NOT in that list — it's the technical primitive
// underneath. By requiring a biometric prompt RIGHT BEFORE the wallet
// signs, the user-visible signing event becomes biometric, satisfying
// Điều 3.2 while preserving the on-chain ECDSA audit trail.
//
// Usage: wrap any signMessage / signTypedData / writeContract call:
//
//     const ok = await requireBiometric('Để cấp quyền truy cập hồ sơ');
//     if (!ok) throw new Error('Biometric required');
//     return walletClient.signTypedData(...);
//
// The gate is opt-out via Settings ("Yêu cầu vân tay khi ký" toggle,
// default ON, stored in AsyncStorage). Users on devices without
// biometric hardware bypass the gate automatically — graceful degrade
// rather than block them out.

import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'biometric_signing_enabled';

let cachedSupport: { hasHardware: boolean; isEnrolled: boolean } | null = null;

async function probeSupport(): Promise<{ hasHardware: boolean; isEnrolled: boolean }> {
    if (cachedSupport) return cachedSupport;
    try {
        const [hasHardware, isEnrolled] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync(),
        ]);
        cachedSupport = { hasHardware, isEnrolled };
    } catch {
        cachedSupport = { hasHardware: false, isEnrolled: false };
    }
    return cachedSupport;
}

/**
 * Get current toggle value. Default ON when unset.
 */
export async function isBiometricSigningEnabled(): Promise<boolean> {
    try {
        const v = await AsyncStorage.getItem(SETTINGS_KEY);
        return v === null ? true : v === 'true';
    } catch {
        return true;
    }
}

export async function setBiometricSigningEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(SETTINGS_KEY, enabled ? 'true' : 'false');
}

/**
 * Prompt user for biometric authentication before a signing operation.
 *
 * Returns true to proceed (biometric ok, biometric disabled by user, or
 * device has no biometric hardware/enrollment). Returns false ONLY when
 * the user explicitly cancelled the prompt.
 *
 * @param reason Vietnamese sentence shown in the prompt explaining what's
 *               being signed. Keep <80 chars; long strings clip on Android.
 */
export async function requireBiometric(reason: string): Promise<boolean> {
    const enabled = await isBiometricSigningEnabled();
    if (!enabled) return true;

    const { hasHardware, isEnrolled } = await probeSupport();
    if (!hasHardware || !isEnrolled) {
        // Graceful degrade: device can't do biometric → proceed without it.
        // Users typing private keys / using passwords aren't gated either.
        return true;
    }

    try {
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: reason,
            cancelLabel: 'Huỷ',
            fallbackLabel: 'Mã PIN thiết bị',
            // disableDeviceFallback=false: allow PIN/pattern fallback so
            // users without enrolled biometric (just PIN) can still sign.
            disableDeviceFallback: false,
        });
        return result.success === true;
    } catch {
        // Authentication errored (e.g. too many attempts). Treat as cancellation.
        return false;
    }
}

/**
 * Helper: throw if biometric is required and user rejected.
 */
export async function gateOrThrow(reason: string): Promise<void> {
    const ok = await requireBiometric(reason);
    if (!ok) {
        const e: any = new Error('Đã huỷ xác thực vân tay. Giao dịch không được ký.');
        e.code = 'BIOMETRIC_CANCELLED';
        throw e;
    }
}

export default {
    requireBiometric,
    gateOrThrow,
    isBiometricSigningEnabled,
    setBiometricSigningEnabled,
};
