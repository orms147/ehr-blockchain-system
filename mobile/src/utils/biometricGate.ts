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
import useAuthStore from '../store/authStore';

// Roles whose signing actions MUST pass a device authentication factor at the
// moment of signing (Luật GDĐT 20/2023 Đ22 k2c — "chủ thể ký kiểm soát tại thời
// điểm ký"). Org/Ministry/Admin are institutional accounts and are exempt by
// product decision. The factor is the DEVICE OS credential (biometric OR device
// PIN/pattern) — VN law does not mandate a per-account app credential for health
// apps (TT 13/2025 Đ3 lists biometric as one optional form; NĐ 356/2025 Đ9 k3b
// MFA applies only to "xử lý dữ liệu lớn"); device-level OS auth also satisfies
// OWASP MASVS-AUTH-2.
const FACTOR_REQUIRED_ROLES = ['patient', 'doctor'];

const SETTINGS_KEY = 'biometric_signing_enabled';
const ONBOARDING_KEY = 'mfa_onboarded_v1';

let cachedSupport: BiometricStatus | null = null;

export type BiometricStatus = {
    hasHardware: boolean;
    isEnrolled: boolean;
    supportedTypes: LocalAuthentication.AuthenticationType[];
};

export async function getBiometricStatus(): Promise<BiometricStatus> {
    if (cachedSupport) return cachedSupport;
    try {
        const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync(),
            LocalAuthentication.supportedAuthenticationTypesAsync(),
        ]);
        cachedSupport = { hasHardware, isEnrolled, supportedTypes };
    } catch {
        cachedSupport = { hasHardware: false, isEnrolled: false, supportedTypes: [] };
    }
    return cachedSupport;
}

// Backward-compat wrapper (internal callers expecting {hasHardware, isEnrolled}).
async function probeSupport(): Promise<{ hasHardware: boolean; isEnrolled: boolean }> {
    const s = await getBiometricStatus();
    return { hasHardware: s.hasHardware, isEnrolled: s.isEnrolled };
}

/**
 * §19 R4 (2026-06-03): track xem user đã qua MFA onboarding lần đầu chưa.
 * Onboarding screen hiển thị 1 lần sau login đầu tiên, kèm disclosure NĐ 13/2023
 * Điều 11.8 cho dữ liệu sinh trắc học nhạy cảm.
 */
export async function isMfaOnboarded(): Promise<boolean> {
    try {
        const v = await AsyncStorage.getItem(ONBOARDING_KEY);
        return v === 'true';
    } catch {
        return false;
    }
}

export async function setMfaOnboarded(done: boolean): Promise<void> {
    await AsyncStorage.setItem(ONBOARDING_KEY, done ? 'true' : 'false');
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
    // Role scope: only patient/doctor signing is gated. Org/Ministry/Admin
    // (institutional accounts) are exempt — return true without prompting.
    let role = 'patient';
    try {
        role = String(useAuthStore.getState().activeRole || 'patient');
    } catch {
        role = 'patient';
    }
    if (!FACTOR_REQUIRED_ROLES.includes(role)) {
        return true;
    }

    // MANDATORY for patient/doctor — no opt-out toggle, no silent bypass.
    // The second factor is the device OS credential: biometric if enrolled,
    // otherwise the device PIN/pattern/password (disableDeviceFallback:false).
    let level: LocalAuthentication.SecurityLevel;
    try {
        level = await LocalAuthentication.getEnrolledLevelAsync();
    } catch {
        level = LocalAuthentication.SecurityLevel.NONE;
    }

    if (level === LocalAuthentication.SecurityLevel.NONE) {
        // Device has NEITHER biometric NOR a screen-lock PIN/pattern → we cannot
        // bind the signing moment to the device owner. Refuse with a clear,
        // actionable error (this is the "require setup" enforcement).
        const e: any = new Error(
            'Thiết bị chưa đặt khoá màn hình. Hãy bật vân tay/khuôn mặt hoặc mã PIN/mật khẩu trong Cài đặt thiết bị để ký hồ sơ y tế.'
        );
        e.code = 'NO_DEVICE_LOCK';
        throw e;
    }

    try {
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: reason,
            cancelLabel: 'Huỷ',
            fallbackLabel: 'Mã khoá thiết bị',
            // Allow OS fallback to device PIN/pattern/password when biometric
            // isn't enrolled — the second factor is the device-owner credential.
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
    getBiometricStatus,
    isMfaOnboarded,
    setMfaOnboarded,
};
