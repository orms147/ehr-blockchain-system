// UserChip — render a wallet address as "Tên · Vai trò · Tổ chức · 0x...4f3c"
// instead of raw hex. Used everywhere a doctor / patient / contact appears in
// a list (P5, S18 2026-05-04).
//
// Public profile fetched via GET /api/profile/:address (cached 5min). Falls
// back gracefully to a truncated address when the lookup fails or the user
// hasn't filled in fullName yet.

import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { User, Stethoscope, ShieldCheck, Copy } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

import profileService from '../services/profile.service';
import { useEhrPalette } from '../constants/uiColors';

export type PublicProfile = {
    walletAddress: string;
    fullName: string | null;
    gender?: string | null;
    avatarUrl?: string | null;
    isDoctor?: boolean;
    isVerifiedDoctor?: boolean;
    doctorProfile?: {
        specialty?: string | null;
        hospitalName?: string | null;
        yearsExperience?: number | null;
        bio?: string | null;
    } | null;
};

const truncate = (a?: string | null) =>
    a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';

/**
 * React Query hook — 5min stale + cache. Returns PublicProfile | undefined.
 * Multiple <UserChip> on the same list dedupe to one network call thanks to
 * shared queryKey.
 */
export function useUserProfile(address: string | null | undefined) {
    return useQuery<PublicProfile | null>({
        queryKey: ['userProfile', address?.toLowerCase()],
        queryFn: async () => {
            if (!address) return null;
            try {
                const data = await profileService.getProfile(address);
                return data || null;
            } catch {
                return null;
            }
        },
        staleTime: 5 * 60 * 1000,
        enabled: !!address,
    });
}

export type UserChipSize = 'sm' | 'md';

export interface UserChipProps {
    address?: string | null;
    /** override fullName (e.g. when caller already has it from another query) */
    fallbackName?: string | null;
    /** show truncated address as second line. Default true */
    showAddress?: boolean;
    /** when expanded=true, show role + specialty/hospital subtitle */
    expanded?: boolean;
    /** sm = single-line compact; md = 2-line stacked */
    size?: UserChipSize;
    /** show role label "BS." / nothing for patient */
    showRolePrefix?: boolean;
    /** tap → bottom sheet with full info + copy address */
    interactive?: boolean;
}

/**
 * Render a wallet address with the holder's display name + verified-doctor
 * badge. Tap (when interactive) opens a bottom sheet with full info.
 */
export default function UserChip({
    address,
    fallbackName = null,
    showAddress = true,
    expanded = false,
    size = 'md',
    showRolePrefix = true,
    interactive = true,
}: UserChipProps) {
    const palette = useEhrPalette();
    const { data: profile } = useUserProfile(address);
    const [sheetOpen, setSheetOpen] = useState(false);

    const fullName = profile?.fullName || fallbackName || null;
    const isDoctor = profile?.isDoctor === true;
    const isVerifiedDoctor = profile?.isVerifiedDoctor === true;
    const specialty = profile?.doctorProfile?.specialty;
    const hospital = profile?.doctorProfile?.hospitalName;

    const displayName = fullName
        ? (showRolePrefix && isDoctor ? `BS. ${fullName}` : fullName)
        : truncate(address) || '?';

    const subtitle = expanded
        ? (isDoctor && (specialty || hospital)
            ? [specialty, hospital].filter(Boolean).join(' · ')
            : null)
        : null;

    const onPress = interactive ? () => setSheetOpen(true) : undefined;
    const Wrapper: any = onPress ? Pressable : View;

    const RoleIcon = isDoctor ? Stethoscope : User;

    return (
        <>
            <Wrapper onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                    style={{
                        width: size === 'sm' ? 28 : 36,
                        height: size === 'sm' ? 28 : 36,
                        borderRadius: 999,
                        backgroundColor: palette.EHR_PRIMARY_FIXED,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                    }}
                >
                    <RoleIcon size={size === 'sm' ? 14 : 18} color={palette.EHR_PRIMARY} />
                </View>
                <YStack style={{ flex: 1 }}>
                    <XStack style={{ alignItems: 'center', gap: 6 }}>
                        <Text
                            fontSize={size === 'sm' ? '$3' : '$4'}
                            fontWeight="700"
                            color="$color12"
                            numberOfLines={1}
                            style={{ flex: 1 }}
                        >
                            {displayName}
                        </Text>
                        {isVerifiedDoctor ? (
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                backgroundColor: palette.EHR_PRIMARY_FIXED,
                                borderRadius: 999,
                                gap: 2,
                            }}>
                                <ShieldCheck size={10} color={palette.EHR_PRIMARY} />
                                <Text fontSize={9} fontWeight="800" style={{ color: palette.EHR_PRIMARY }}>XM</Text>
                            </View>
                        ) : null}
                    </XStack>
                    {subtitle ? (
                        <Text fontSize="$2" color="$color10" numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                    {showAddress && address ? (
                        <Text fontSize="$1" color="$color9" numberOfLines={1}>
                            {truncate(address)}
                        </Text>
                    ) : null}
                </YStack>
            </Wrapper>

            {interactive ? (
                <Modal visible={sheetOpen} animationType="slide" transparent onRequestClose={() => setSheetOpen(false)}>
                    <Pressable
                        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
                        onPress={() => setSheetOpen(false)}
                    >
                        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                            <Pressable onPress={(e) => e.stopPropagation()}>
                                <View style={{
                                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                                    borderTopLeftRadius: 20,
                                    borderTopRightRadius: 20,
                                    padding: 20,
                                    paddingBottom: 40,
                                }}>
                                    <XStack style={{ alignItems: 'center', marginBottom: 16 }}>
                                        <View style={{
                                            width: 56,
                                            height: 56,
                                            borderRadius: 28,
                                            backgroundColor: palette.EHR_PRIMARY_FIXED,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginRight: 14,
                                        }}>
                                            <RoleIcon size={28} color={palette.EHR_PRIMARY} />
                                        </View>
                                        <YStack style={{ flex: 1 }}>
                                            <XStack style={{ alignItems: 'center', gap: 6 }}>
                                                <Text fontSize="$6" fontWeight="800" color="$color12">
                                                    {displayName}
                                                </Text>
                                                {isVerifiedDoctor ? (
                                                    <View style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        paddingHorizontal: 8,
                                                        paddingVertical: 3,
                                                        backgroundColor: palette.EHR_PRIMARY_FIXED,
                                                        borderRadius: 999,
                                                        gap: 3,
                                                    }}>
                                                        <ShieldCheck size={12} color={palette.EHR_PRIMARY} />
                                                        <Text fontSize={10} fontWeight="800" style={{ color: palette.EHR_PRIMARY }}>
                                                            Đã xác minh
                                                        </Text>
                                                    </View>
                                                ) : null}
                                            </XStack>
                                            {isDoctor && specialty ? (
                                                <Text fontSize="$3" color="$color10">{specialty}</Text>
                                            ) : null}
                                            {isDoctor && hospital ? (
                                                <Text fontSize="$2" color="$color10">{hospital}</Text>
                                            ) : null}
                                        </YStack>
                                    </XStack>

                                    <View style={{
                                        backgroundColor: palette.EHR_SURFACE_LOW,
                                        borderRadius: 12,
                                        padding: 12,
                                        borderWidth: 1,
                                        borderColor: palette.EHR_OUTLINE_VARIANT,
                                    }}>
                                        <Text fontSize="$1" color="$color9" style={{ marginBottom: 4 }}>
                                            ĐỊA CHỈ VÍ
                                        </Text>
                                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                                            <Text fontSize="$3" color={palette.EHR_ON_SURFACE} style={{ flex: 1, fontFamily: 'monospace' }}>
                                                {address}
                                            </Text>
                                            <Pressable
                                                onPress={async () => {
                                                    if (address) await Clipboard.setStringAsync(address);
                                                }}
                                                style={{ padding: 6 }}
                                            >
                                                <Copy size={16} color={palette.EHR_ON_SURFACE_VARIANT} />
                                            </Pressable>
                                        </XStack>
                                    </View>

                                    {profile?.doctorProfile?.bio ? (
                                        <Text fontSize="$2" color="$color10" style={{ marginTop: 12, lineHeight: 18 }}>
                                            {profile.doctorProfile.bio}
                                        </Text>
                                    ) : null}
                                </View>
                            </Pressable>
                        </View>
                    </Pressable>
                </Modal>
            ) : null}
        </>
    );
}
