// SharedRecordCard — text-rhythm row for doctor-side "Hồ sơ đã nhận" (G.12.a).
// Mirror pattern of RecordCard with sender resolution + expiry status + inline
// "Cập nhật" link (instead of large button).
//
// Visual contract:
//   [Date 2-line]  | [Hairline]  Title (serif 15pt 550)
//    18 (mono)     |             BN. <patient name> · <hospital> (12.5pt secondary)
//    04 (serif)    |             Type · vN · Hết hạn DD/MM
//                  |             [Cập nhật version →] inline link if action available
//                  |             [Đã thu hồi / Hết hạn] meta tag if inactive
//   ─────────────────────────────────────  bottom 0.5px hairline
//
// Inactive rows render with opacity 0.6 and no press handler.

import React from 'react';
import { Pressable, View } from 'react-native';
import { XStack, YStack, Text } from 'tamagui';
import { FilePlus2 } from 'lucide-react-native';

import { useEhrPalette } from '../constants/uiColors';
import { useUserProfile } from './UserChip';
import { formatExpiry, getExpiryUrgency } from '../utils/dateFormatting';

interface SharedRecordCardProps {
    record: any;
    onView?: (record: any) => void;
    onCreateUpdate?: (record: any) => void;
}

const SERIF = 'Fraunces_400Regular';
const SERIF_MEDIUM = 'Fraunces_500Medium';
const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

const TYPE_LABEL: Record<string, string> = {
    checkup: 'Khám tổng quát',
    diagnosis: 'Khám chuyên khoa',
    prescription: 'Đơn thuốc',
    lab_result: 'Xét nghiệm',
    imaging: 'Chẩn đoán hình ảnh',
    vaccination: 'Tiêm chủng',
    vital_signs: 'Chỉ số sinh tồn',
};

function splitDate(input?: string): { day: string; month: string } {
    if (!input) return { day: '—', month: '' };
    const dm = input.match(/^(\d{1,2})\/(\d{1,2})\//);
    if (dm) return { day: dm[1].padStart(2, '0'), month: dm[2].padStart(2, '0') };
    try {
        const d = new Date(input);
        if (Number.isNaN(d.getTime())) return { day: '—', month: '' };
        return {
            day: String(d.getDate()).padStart(2, '0'),
            month: String(d.getMonth() + 1).padStart(2, '0'),
        };
    } catch {
        return { day: '—', month: '' };
    }
}

export default function SharedRecordCard({ record, onView, onCreateUpdate }: SharedRecordCardProps) {
    const palette = useEhrPalette();

    // Patient is the OWNER of the record (whose record was shared with the doctor).
    const patientAddress = record?.record?.ownerAddress || record?.senderAddress;
    const { data: patientProfile } = useUserProfile(patientAddress);

    const { day, month } = splitDate(record?.createdAt);
    const recordType = record?.record?.recordType || record?.recordType || record?.type;
    const typeKey = String(recordType || '').toLowerCase();
    const typeLabel = TYPE_LABEL[typeKey] || (typeKey ? typeKey : 'Hồ sơ y tế');
    const title = record?.record?.title || `CID ${String(record?.cidHash || '').slice(0, 10)}…`;

    const statusLower = String(record?.status || '').toLowerCase();
    const isRevoked = statusLower === 'revoked' || statusLower === 'rejected';
    const isExpiredByTime = !!record?.expiresAt && new Date(record.expiresAt).getTime() < Date.now();
    const isExpired = statusLower === 'expired' || isExpiredByTime;
    const isInactive = record?.active === false || isRevoked || isExpired;
    const isPending = record?.status === 'pending';

    const patientName = patientProfile?.fullName
        ? `BN. ${patientProfile.fullName}`
        : (patientAddress ? `${patientAddress.slice(0, 6)}…${patientAddress.slice(-4)}` : '—');
    const subtitleLine = patientName;

    const versionCount = Number(record?.versionCount) || 1;
    const urgency = getExpiryUrgency(record?.expiresAt);
    const isUrgent = urgency === 'urgent' || urgency === 'soon';
    const expiryColor = isExpired || isRevoked
        ? palette.EHR_OUTLINE
        : (isUrgent ? palette.EHR_DANGER : palette.EHR_OUTLINE);
    const expiryLabel = isRevoked
        ? 'Đã thu hồi'
        : isExpired ? 'Đã hết hạn' : `Hết hạn ${formatExpiry(record?.expiresAt)}`;

    return (
        <Pressable
            onPress={isInactive ? undefined : () => onView?.(record)}
            disabled={isInactive}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 14,
                paddingVertical: 14,
                paddingHorizontal: 0,
                borderBottomWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_VARIANT,
                opacity: isInactive ? 0.55 : (pressed ? 0.55 : 1),
            })}
        >
            {/* Date stamp 2-line */}
            <YStack style={{ width: 42, alignItems: 'flex-end', marginTop: 4 }}>
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: palette.EHR_OUTLINE,
                        letterSpacing: 0.4,
                    }}
                >
                    {day}
                </Text>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        marginTop: 1,
                    }}
                >
                    {month}
                </Text>
            </YStack>

            {/* Hairline divider */}
            <View
                style={{
                    width: 1,
                    alignSelf: 'stretch',
                    backgroundColor: palette.EHR_OUTLINE_VARIANT,
                    marginTop: 2,
                }}
            />

            {/* Content */}
            <YStack style={{ flex: 1, minWidth: 0 }}>
                <Text
                    style={{
                        fontFamily: SERIF_MEDIUM,
                        fontSize: 15,
                        fontWeight: '500',
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.1,
                    }}
                    numberOfLines={1}
                >
                    {title}
                </Text>
                <Text
                    style={{
                        fontFamily: SANS,
                        fontSize: 12.5,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        marginTop: 3,
                    }}
                    numberOfLines={1}
                >
                    {subtitleLine}
                </Text>
                <XStack style={{ gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE }}>
                        {typeLabel}
                    </Text>
                    {versionCount > 1 ? (
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_OUTLINE }}>
                            · v{versionCount}
                        </Text>
                    ) : null}
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 11,
                            color: expiryColor,
                            fontWeight: isUrgent ? '700' : '400',
                        }}
                    >
                        · {expiryLabel}
                    </Text>
                    {isPending ? (
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 11,
                                color: palette.EHR_WARNING,
                                fontWeight: '700',
                            }}
                        >
                            · Cần nhận
                        </Text>
                    ) : null}
                </XStack>

                {/* Inline "Cập nhật" link (replaces large button) */}
                {!isInactive && onCreateUpdate ? (
                    <Pressable
                        onPress={(e) => {
                            e.stopPropagation();
                            onCreateUpdate(record);
                        }}
                        hitSlop={4}
                        style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5,
                            marginTop: 8,
                            alignSelf: 'flex-start',
                            opacity: pressed ? 0.55 : 1,
                        })}
                    >
                        <FilePlus2 size={12} color={palette.EHR_TERTIARY} />
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 12,
                                color: palette.EHR_TERTIARY,
                                fontWeight: '600',
                            }}
                        >
                            Cập nhật version →
                        </Text>
                    </Pressable>
                ) : null}
            </YStack>
        </Pressable>
    );
}
