// ViSectionLabel + ViModeChip + ViStatusChip — labels & pills for the
// redesign port (Tầng 3). Source: .design-bundle/project/ui.jsx.

import React from 'react';
import { View } from 'react-native';
import { Text, XStack } from 'tamagui';

import {
    EHR_OUTLINE,
    EHR_OUTLINE_VARIANT,
    EHR_ON_SURFACE_VARIANT,
    EHR_SURFACE_CONTAINER,
    EHR_SLATE,
    EHR_WARNING,
    EHR_SUCCESS,
    EHR_DANGER,
} from '../constants/uiColors';

// ───────── Section header ─────────
export function ViSectionLabel({
    children,
    trailing,
}: {
    children: React.ReactNode;
    trailing?: React.ReactNode;
}) {
    return (
        <XStack
            style={{
                alignItems: 'baseline',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                marginBottom: 10,
            }}
        >
            <Text
                style={{
                    fontSize: 11,
                    fontWeight: '600',
                    letterSpacing: 1.2,
                    color: EHR_OUTLINE,
                    textTransform: 'uppercase',
                }}
            >
                {children}
            </Text>
            {trailing ? (
                <Text style={{ fontSize: 12, color: EHR_OUTLINE }}>{trailing}</Text>
            ) : null}
        </XStack>
    );
}

// ───────── Permission mode chip ─────────
//
// Mirrors the on-chain Consent.allowDelegate flag:
//   read-update    — patient cleared a doctor for normal episode reads/updates
//   read-delegate  — patient additionally cleared the doctor to re-share
export type ViMode = 'read-update' | 'read-delegate';

export function ViModeChip({ mode }: { mode: ViMode | string }) {
    const map: Record<string, { label: string; dot: string }> = {
        'read-update': { label: 'Đọc · Cập nhật', dot: EHR_SLATE },
        'read-delegate': { label: 'Đọc · Uỷ quyền', dot: EHR_WARNING },
    };
    const m = map[mode] || { label: mode, dot: EHR_OUTLINE };

    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 999,
                borderWidth: 0.5,
                borderColor: EHR_OUTLINE_VARIANT,
                backgroundColor: EHR_SURFACE_CONTAINER,
                alignSelf: 'flex-start',
            }}
        >
            <View
                style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: m.dot,
                }}
            />
            <Text style={{ fontSize: 11, fontWeight: '500', color: EHR_ON_SURFACE_VARIANT }}>
                {m.label}
            </Text>
        </View>
    );
}

// ───────── Status chip (active / expiring / expired / verified / pending) ─────────
export type ViStatus = 'active' | 'expiring' | 'expired' | 'verified' | 'pending' | 'revoked' | 'rejected';

export function ViStatusChip({ status }: { status: ViStatus | string }) {
    const map: Record<string, { label: string; color: string }> = {
        active: { label: 'Còn hiệu lực', color: EHR_SUCCESS },
        expiring: { label: 'Sắp hết hạn', color: EHR_WARNING },
        expired: { label: 'Đã hết hạn', color: EHR_OUTLINE },
        verified: { label: 'Đã xác minh', color: EHR_SUCCESS },
        pending: { label: 'Chờ duyệt', color: EHR_WARNING },
        revoked: { label: 'Đã thu hồi', color: EHR_DANGER },
        rejected: { label: 'Đã từ chối', color: EHR_OUTLINE },
    };
    const m = map[status];
    if (!m) return null;

    return (
        <XStack style={{ alignItems: 'center', gap: 5 }}>
            <View
                style={{
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: m.color,
                }}
            />
            <Text style={{ fontSize: 11, fontWeight: '500', color: m.color }}>{m.label}</Text>
        </XStack>
    );
}

// ───────── Source chip (Trực tiếp / Qua uỷ quyền) ─────────
export function ViSourceChip({ source }: { source: 'direct' | 'via-delegate' }) {
    if (source === 'direct') {
        return (
            <View
                style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    borderWidth: 0.5,
                    borderColor: EHR_OUTLINE_VARIANT,
                    backgroundColor: EHR_SURFACE_CONTAINER,
                    alignSelf: 'flex-start',
                }}
            >
                <Text style={{ fontSize: 10, fontWeight: '600', color: EHR_SUCCESS }}>
                    ● Trực tiếp
                </Text>
            </View>
        );
    }

    return (
        <View
            style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 999,
                borderWidth: 0.5,
                borderColor: EHR_WARNING,
                backgroundColor: EHR_SURFACE_CONTAINER,
                alignSelf: 'flex-start',
            }}
        >
            <Text style={{ fontSize: 10, fontWeight: '600', color: EHR_WARNING }}>
                ↻ Qua uỷ quyền
            </Text>
        </View>
    );
}
