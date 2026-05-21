// PatientIdentityInline — text-only patient identity for form contexts where
// the doctor has NOT yet been granted access (e.g. DoctorRequestAccessScreen).
//
// Visual (3 lines):
//   Nguyễn Thị Hà · Nữ · 34 tuổi
//   VN-7A4F·C12D                            (mono ViEH ID — NOT CCCD)
//
// Per spec Q5 (viehp-doctor-forms-spec.html):
//   - Reuse useUserProfile hook (no separate fetch)
//   - Privacy gating: in 'minimal' mode (default for request-access flow)
//     show only name + gender + age + ViEH ID. NO CCCD, NO wallet hex.
//     CCCD only after BN ký consent (NĐ 13/2023/NĐ-CP).
//   - 'full' mode (when caller HAS access — e.g. DoctorCreateUpdate after
//     consent): additionally show wallet (truncated) + specialty/hospital
//     if doctor role.

import React from 'react';
import { View } from 'react-native';
import { Text, YStack, XStack } from 'tamagui';

import { useEhrPalette } from '../constants/uiColors';
import { useUserProfile } from './UserChip';

export type DetailLevel = 'minimal' | 'full';

interface Props {
    address?: string | null;
    detailLevel?: DetailLevel;
    /** Fallback name if resolver returns empty (offline cache, etc.) */
    fallbackName?: string | null;
}

const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

function formatGender(g?: string | null): string {
    if (!g) return '—';
    const lower = String(g).toLowerCase();
    if (lower === 'male' || lower === 'm') return 'Nam';
    if (lower === 'female' || lower === 'f') return 'Nữ';
    return 'Khác';
}

function computeAge(iso?: string | null): number | null {
    if (!iso) return null;
    try {
        const d = new Date(iso);
        const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        return age >= 0 && age < 150 ? age : null;
    } catch {
        return null;
    }
}

/**
 * Derive a stable "ViEH ID" display string from wallet address.
 * Per spec Q5: "VN-079·1991·0314" is INTERNAL ViEH patient ID, NOT CCCD.
 * Format: `VN-XXXX·YYYY` where X/Y are slices of the wallet hex.
 * Purely cosmetic — does NOT expose CCCD or DOB.
 */
function deriveViehId(address?: string | null): string {
    if (!address || address.length < 10) return 'VN-——————';
    const a = address.toLowerCase().replace(/^0x/, '');
    const first = a.slice(0, 4).toUpperCase();
    const last = a.slice(-4).toUpperCase();
    return `VN-${first}·${last}`;
}

export default function PatientIdentityInline({
    address,
    detailLevel = 'minimal',
    fallbackName = null,
}: Props) {
    const palette = useEhrPalette();
    const { data: profile } = useUserProfile(address);

    const fullName = profile?.fullName || fallbackName;
    const gender = formatGender(profile?.gender);
    const age = computeAge((profile as any)?.dateOfBirth);
    const viehId = deriveViehId(address);

    const ageLabel = age !== null ? ` · ${age} tuổi` : '';
    const headerLine = fullName
        ? `${fullName} · ${gender}${ageLabel}`
        : '— Chưa rõ danh tính —';

    const isDoctor = profile?.isDoctor === true;
    const specialty = profile?.doctorProfile?.specialty;
    const hospital = profile?.doctorProfile?.hospitalName;
    const doctorMeta = isDoctor && (specialty || hospital)
        ? [specialty, hospital].filter(Boolean).join(' · ')
        : null;

    return (
        <YStack style={{ paddingVertical: 4 }}>
            <Text
                style={{
                    fontFamily: SANS_MEDIUM,
                    fontSize: 13,
                    color: palette.EHR_ON_SURFACE,
                    lineHeight: 18,
                }}
                numberOfLines={1}
            >
                {fullName ? (
                    <>
                        <Text style={{ fontFamily: SANS_SEMI, fontWeight: '600' }}>{fullName}</Text>
                        <Text style={{ color: palette.EHR_TEXT_MUTED }}>
                            {` · ${gender}${ageLabel}`}
                        </Text>
                    </>
                ) : (
                    <Text style={{ color: palette.EHR_TEXT_MUTED, fontStyle: 'italic' }}>
                        {headerLine}
                    </Text>
                )}
            </Text>

            <XStack style={{ marginTop: 3, alignItems: 'center', gap: 6 }}>
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 11.5,
                        color: palette.EHR_TEXT_MUTED,
                        letterSpacing: 0.3,
                    }}
                >
                    {viehId}
                </Text>
                {detailLevel === 'full' && doctorMeta ? (
                    <>
                        <Text style={{ color: palette.EHR_TEXT_MUTED, fontSize: 11 }}>·</Text>
                        <Text
                            style={{
                                fontFamily: SANS,
                                fontSize: 11.5,
                                color: palette.EHR_TEXT_MUTED,
                            }}
                            numberOfLines={1}
                        >
                            {doctorMeta}
                        </Text>
                    </>
                ) : null}
            </XStack>

            {/* detailLevel='full' shows specialty/hospital above. CCCD is NEVER
                rendered here per privacy gating — must use a separate component
                in screens that have consent (e.g. EmergencyLookupScreen, where
                doctor has emergency-flow access). */}
        </YStack>
    );
}
