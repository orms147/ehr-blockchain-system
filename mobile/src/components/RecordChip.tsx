// RecordChip — render a record cidHash as "Khám tim mạch định kỳ · v3 ·
// bafybe…bzdi" instead of raw hash. Used in lists where a record is
// referenced (audit log entries, share lists, etc.).
//
// Backed by GET /api/records/:cidHash/meta — lightweight, no AccessLog write.
// Multiple chips in a list dedupe through React Query cache (5min stale).

import React from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';

import api from '../services/api';
import { useEhrPalette } from '../constants/uiColors';
import { resolveRecordType } from '../constants/recordTypes';

export type RecordMeta = {
    cidHash: string;
    parentCidHash: string | null;
    title: string | null;
    description: string | null;
    recordType: string | null;
    versionNote?: string | null;
    ownerAddress: string;
    createdBy: string;
    createdAt: string;
};

const truncate = (h?: string | null) =>
    h ? `${h.slice(0, 6)}…${h.slice(-4)}` : '';

export function useRecordMeta(cidHash: string | null | undefined) {
    return useQuery<RecordMeta | null>({
        queryKey: ['recordMeta', cidHash?.toLowerCase()],
        queryFn: async () => {
            if (!cidHash) return null;
            try {
                const data = await api.get(`/api/records/${cidHash.toLowerCase()}/meta`);
                return data || null;
            } catch {
                return null;
            }
        },
        staleTime: 5 * 60 * 1000,
        enabled: !!cidHash,
    });
}

export interface RecordChipProps {
    cidHash?: string | null;
    fallbackTitle?: string | null;
    showHash?: boolean;
    onPress?: () => void;
}

export default function RecordChip({
    cidHash,
    fallbackTitle = null,
    showHash = true,
    onPress,
}: RecordChipProps) {
    const palette = useEhrPalette();
    const { data: meta } = useRecordMeta(cidHash);

    const title = meta?.title || fallbackTitle || `Hồ sơ ${truncate(cidHash)}`;
    const recordType = meta?.recordType || null;
    const spec = resolveRecordType(recordType);
    const typeLabel = recordType ? spec.label : null;
    const Icon = spec.icon;

    const Wrapper: any = onPress ? Pressable : View;

    return (
        <Wrapper onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: palette.EHR_PRIMARY_FIXED,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                }}
            >
                <Icon size={18} color={palette.EHR_PRIMARY} />
            </View>
            <YStack style={{ flex: 1 }}>
                <Text fontSize="$4" fontWeight="700" color="$color12" numberOfLines={1}>
                    {title}
                </Text>
                <XStack style={{ alignItems: 'center', gap: 6 }}>
                    {typeLabel ? (
                        <Text fontSize="$2" color="$color10">{typeLabel}</Text>
                    ) : null}
                    {showHash && cidHash ? (
                        <Text fontSize="$1" style={{ color: palette.EHR_ON_SURFACE_VARIANT, fontFamily: 'monospace' }}>
                            {truncate(cidHash)}
                        </Text>
                    ) : null}
                </XStack>
            </YStack>
        </Wrapper>
    );
}
