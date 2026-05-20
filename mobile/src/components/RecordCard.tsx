// RecordCard — text-rhythm row per Claude Design `screens-patient.jsx#L321-353` (G.12.a)
//
// Visual contract:
//   [Date 2-line]  | [Hairline]  Title (serif 15pt 550)
//    18 (mono)     |             Author · Hospital (12.5pt secondary)
//    04 (serif)    |             Type · N đính kèm · N phiên bản (11pt muted)
//   ─────────────────────────────────────  bottom 0.5px hairline
//
// No card chrome, no icon box, no 3D animation, no verified badge. Editorial.
// Author + Hospital resolved lazily via UserChip's `useUserProfile` hook.

import React from 'react';
import { Pressable, View } from 'react-native';
import { XStack, YStack, Text } from 'tamagui';

import { useEhrPalette } from '../constants/uiColors';
import { useUserProfile } from './UserChip';

interface RecordCardProps {
    record: any;
    onPress?: (record: any) => void;
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
    // Already DD/MM/YYYY form (legacy)
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

export default function RecordCard({ record, onPress }: RecordCardProps) {
    const palette = useEhrPalette();
    const authorAddress = record?.createdBy || record?.ownerAddress;
    const { data: authorProfile } = useUserProfile(authorAddress);

    const { day, month } = splitDate(record?.date || record?.createdAt);
    const typeKey = String(record?.recordType || record?.type || '').toLowerCase();
    const typeLabel = TYPE_LABEL[typeKey] || (typeKey ? typeKey : 'Hồ sơ y tế');
    const title = record?.title || typeLabel || 'Hồ sơ y tế';

    const authorName = authorProfile?.fullName
        ? (authorProfile.isDoctor ? `BS. ${authorProfile.fullName}` : authorProfile.fullName)
        : null;
    const orgName = authorProfile?.doctorProfile?.hospitalName || null;
    const authorLine = [authorName, orgName].filter(Boolean).join(' · ');

    const versionCount = Number(record?.versionCount) || 1;
    const attachmentsCount = Number(record?.attachmentsCount) || 0;

    const isPending = record?.syncStatus === 'pending';
    const isFailed = record?.syncStatus === 'failed';

    return (
        <Pressable
            onPress={() => onPress?.(record)}
            style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 14,
                paddingVertical: 14,
                paddingHorizontal: 0,
                borderBottomWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_VARIANT,
                opacity: pressed ? 0.55 : 1,
            })}
        >
            {/* Date stamp 2-line */}
            <YStack style={{ width: 42, alignItems: 'flex-end', marginTop: 4 }}>
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: palette.EHR_TEXT_MUTED,
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
                {authorLine ? (
                    <Text
                        style={{
                            fontFamily: SANS,
                            fontSize: 12.5,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            marginTop: 3,
                        }}
                        numberOfLines={1}
                    >
                        {authorLine}
                    </Text>
                ) : null}
                <XStack style={{ gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                        {typeLabel}
                    </Text>
                    {attachmentsCount > 0 ? (
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                            · {attachmentsCount} đính kèm
                        </Text>
                    ) : null}
                    {versionCount > 1 ? (
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                            · {versionCount} phiên bản
                        </Text>
                    ) : null}
                    {isPending ? (
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 11,
                                color: palette.EHR_WARNING,
                                fontWeight: '700',
                            }}
                        >
                            · Đang đồng bộ
                        </Text>
                    ) : null}
                    {isFailed ? (
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 11,
                                color: palette.EHR_DANGER,
                                fontWeight: '700',
                            }}
                        >
                            · Lỗi đồng bộ
                        </Text>
                    ) : null}
                </XStack>
            </YStack>
        </Pressable>
    );
}
