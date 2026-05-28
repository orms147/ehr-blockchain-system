// RxCard — 1 thuốc trong đơn (multi-drug C1, plan §15).
//
// States:
//   collapsed (default): chỉ index + tên + nồng độ + summary line "1 viên × 1 lần / ngày · 30 ngày · uống"
//   expanded: form đầy đủ 9 trường TT 26/2025/TT-BYT
//
// Single-expand pattern: chỉ 1 card mở tại 1 thời điểm. Parent quản lý
// `expandedId` state, RxCard nhận prop `expanded: boolean` + `onToggleExpand`.
//
// Validation: cinnabar border + index badge nếu drug có errors. Inline error
// messages dưới input bị invalid. Helper validateDrug() từ constants/drugs.
//
// Design ref: viehp-prescription-multi.html Phương án A (recommended).

import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { ChevronDown, X as XIcon } from 'lucide-react-native';

import { useEhrPalette } from '../constants/uiColors';
import {
    type Drug,
    type DrugError,
    DRUG_ROUTES,
    DRUG_TIMINGS,
    DRUG_QUANTITY_UNITS,
    drugSummary,
    drugTotal,
} from '../constants/drugs';

const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

interface RxCardProps {
    drug: Drug;
    index: number;          // 1-based position trong list (01..N)
    expanded: boolean;
    errors: DrugError[];    // chỉ errors của drug này (filtered từ list cha)
    onToggleExpand: () => void;
    onChange: (patch: Partial<Drug>) => void;
    onRequestDelete: () => void;  // parent show confirm sheet
}

export default function RxCard({
    drug,
    index,
    expanded,
    errors,
    onToggleExpand,
    onChange,
    onRequestDelete,
}: RxCardProps) {
    const palette = useEhrPalette();
    const hasErrors = errors.length > 0;
    const ixPadded = String(index).padStart(2, '0');

    const errorFor = (field: keyof Drug): DrugError | undefined =>
        errors.find((e) => e.field === field);

    return (
        <View
            style={{
                marginHorizontal: 22,
                marginBottom: 10,
                borderRadius: 14,
                borderWidth: hasErrors ? 1 : 0.5,
                borderColor: hasErrors
                    ? `${palette.EHR_PRIMARY}80`
                    : palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE_LOWEST,
                overflow: 'hidden',
            }}
        >
            {/* Header — luôn hiện */}
            <Pressable
                onPress={onToggleExpand}
                style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    opacity: pressed ? 0.7 : 1,
                })}
            >
                <View
                    style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        backgroundColor: hasErrors
                            ? `${palette.EHR_PRIMARY}30`
                            : `${palette.EHR_OUTLINE}40`,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Text
                        style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            color: hasErrors ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE_VARIANT,
                            fontWeight: '700',
                        }}
                    >
                        {ixPadded}
                    </Text>
                </View>
                <YStack style={{ flex: 1 }}>
                    <XStack style={{ alignItems: 'baseline', gap: 6 }}>
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 14,
                                color: palette.EHR_ON_SURFACE,
                                fontWeight: '700',
                            }}
                            numberOfLines={1}
                        >
                            {drug.medication || 'Thuốc chưa đặt tên'}
                        </Text>
                        {drug.strength ? (
                            <Text
                                style={{
                                    fontFamily: MONO,
                                    fontSize: 11.5,
                                    color: palette.EHR_TEXT_MUTED,
                                }}
                            >
                                {drug.strength}
                            </Text>
                        ) : null}
                    </XStack>
                    {!expanded ? (
                        <Text
                            style={{
                                marginTop: 3,
                                fontFamily: SANS,
                                fontSize: 12,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                            }}
                            numberOfLines={1}
                        >
                            {drugSummary(drug)}
                        </Text>
                    ) : null}
                </YStack>
                {expanded ? (
                    <Pressable
                        onPress={(e) => {
                            e.stopPropagation();
                            onRequestDelete();
                        }}
                        hitSlop={8}
                        style={({ pressed }) => ({
                            width: 26,
                            height: 26,
                            borderRadius: 13,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.6 : 1,
                        })}
                    >
                        <XIcon size={14} color={palette.EHR_PRIMARY} />
                    </Pressable>
                ) : null}
                <ChevronDown
                    size={16}
                    color={palette.EHR_TEXT_MUTED}
                    style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
                />
            </Pressable>

            {/* Expanded body */}
            {expanded ? (
                <View
                    style={{
                        paddingHorizontal: 14,
                        paddingBottom: 14,
                        paddingTop: 4,
                        borderTopWidth: 0.5,
                        borderTopColor: palette.EHR_OUTLINE_SOFT,
                    }}
                >
                    {/* Tên thuốc */}
                    <Field label="Tên thuốc" required errorMsg={errorFor('medication')?.message}>
                        <ViInput
                            value={drug.medication}
                            onChangeText={(v) => onChange({ medication: v })}
                            placeholder="Paracetamol, Amlodipin…"
                            hasError={!!errorFor('medication')}
                        />
                    </Field>

                    <Field label="Tên thương mại" hint="nếu khác">
                        <ViInput
                            value={drug.brandName || ''}
                            onChangeText={(v) => onChange({ brandName: v })}
                            placeholder="Vd: Amlor 5mg (Pfizer)"
                        />
                    </Field>

                    {/* Nồng độ + Số lượng (2 cột) */}
                    <XStack style={{ gap: 10, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Field label="Nồng độ" required errorMsg={errorFor('strength')?.message}>
                                <ViInput
                                    value={drug.strength}
                                    onChangeText={(v) => onChange({ strength: v })}
                                    placeholder="500mg"
                                    hasError={!!errorFor('strength')}
                                />
                            </Field>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Field
                                label="Số lượng"
                                required
                                errorMsg={errorFor('quantity')?.message}
                                autoFix={errorFor('quantity')?.autoFix}
                                onAutoFix={(suggestion) => onChange({ quantity: suggestion })}
                            >
                                <ViInputWithSuffix
                                    value={drug.quantity}
                                    onChangeText={(v) => onChange({ quantity: v })}
                                    placeholder="30"
                                    suffix={drug.quantityUnit}
                                    keyboardType="number-pad"
                                    hasError={!!errorFor('quantity')}
                                />
                            </Field>
                        </View>
                    </XStack>

                    {/* Mỗi lần / Lần / Số ngày (3 cột) */}
                    <XStack style={{ gap: 8, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Field label="Mỗi lần" required errorMsg={errorFor('doseAmount')?.message}>
                                <ViInputWithSuffix
                                    value={drug.doseAmount}
                                    onChangeText={(v) => onChange({ doseAmount: v })}
                                    placeholder="1"
                                    suffix={drug.doseUnit}
                                    keyboardType="number-pad"
                                    hasError={!!errorFor('doseAmount')}
                                />
                            </Field>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Field label="Lần/ngày" required errorMsg={errorFor('timesPerDay')?.message}>
                                <ViInputWithSuffix
                                    value={drug.timesPerDay}
                                    onChangeText={(v) => onChange({ timesPerDay: v })}
                                    placeholder="2"
                                    suffix="lần"
                                    keyboardType="number-pad"
                                    hasError={!!errorFor('timesPerDay')}
                                />
                            </Field>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Field label="Số ngày" required errorMsg={errorFor('durationDays')?.message}>
                                <ViInputWithSuffix
                                    value={drug.durationDays}
                                    onChangeText={(v) => onChange({ durationDays: v })}
                                    placeholder="7"
                                    suffix="ngày"
                                    keyboardType="number-pad"
                                    hasError={!!errorFor('durationDays')}
                                />
                            </Field>
                        </View>
                    </XStack>

                    {/* Đường dùng — chip selector */}
                    <Field label="Đường dùng" required errorMsg={errorFor('route')?.message}>
                        <ChipRow
                            options={DRUG_ROUTES as unknown as string[]}
                            value={drug.route}
                            onChange={(v) => onChange({ route: v })}
                        />
                    </Field>

                    {/* Thời điểm dùng — chip selector, optional */}
                    <Field label="Thời điểm dùng" hint="tuỳ chọn">
                        <ChipRow
                            options={DRUG_TIMINGS as unknown as string[]}
                            value={drug.timing || ''}
                            onChange={(v) => onChange({ timing: v === drug.timing ? undefined : v })}
                        />
                    </Field>

                    {/* Đơn vị số lượng — small select chip (advanced) */}
                    <Field label="Đơn vị" hint="mặc định viên">
                        <ChipRow
                            options={DRUG_QUANTITY_UNITS as unknown as string[]}
                            value={drug.quantityUnit}
                            onChange={(v) => onChange({ quantityUnit: v, doseUnit: v })}
                        />
                    </Field>

                    {/* Hướng dẫn đặc biệt */}
                    <Field label="Hướng dẫn đặc biệt" hint="tuỳ chọn">
                        <TextInput
                            value={drug.instruction || ''}
                            onChangeText={(v) => onChange({ instruction: v })}
                            placeholder="VD: theo dõi mạch — báo lại nếu < 50"
                            placeholderTextColor={palette.EHR_TEXT_MUTED}
                            multiline
                            textAlignVertical="top"
                            style={{
                                minHeight: 60,
                                borderRadius: 8,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                backgroundColor: palette.EHR_SURFACE,
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                color: palette.EHR_ON_SURFACE,
                                fontFamily: SANS,
                                fontSize: 13,
                            }}
                        />
                    </Field>

                    {/* Footer summary */}
                    <View
                        style={{
                            marginTop: 4,
                            paddingTop: 10,
                            borderTopWidth: 0.5,
                            borderTopColor: palette.EHR_OUTLINE_SOFT,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: MONO,
                                fontSize: 11.5,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                            }}
                        >
                            {drugTotal(drug) || '—'}
                        </Text>
                    </View>
                </View>
            ) : null}
        </View>
    );
}

// ─────────── helpers ───────────

function Field({
    label,
    required,
    hint,
    errorMsg,
    autoFix,
    onAutoFix,
    children,
}: {
    label: string;
    required?: boolean;
    hint?: string;
    errorMsg?: string;
    autoFix?: { field: string; suggestion: string };
    onAutoFix?: (suggestion: string) => void;
    children: React.ReactNode;
}) {
    const palette = useEhrPalette();
    return (
        <YStack style={{ marginBottom: 10 }}>
            <XStack style={{ alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: palette.EHR_TEXT_MUTED,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                        fontWeight: '600',
                    }}
                >
                    {label}
                </Text>
                {required ? (
                    <Text style={{ color: palette.EHR_PRIMARY, fontSize: 12, fontWeight: '700' }}>*</Text>
                ) : null}
                {hint ? (
                    <Text style={{ fontFamily: SANS, fontSize: 10.5, color: palette.EHR_TEXT_MUTED }}>
                        · {hint}
                    </Text>
                ) : null}
            </XStack>
            {children}
            {errorMsg ? (
                <XStack style={{ marginTop: 4, alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <Text
                        style={{
                            fontFamily: SANS,
                            fontSize: 11,
                            color: palette.EHR_PRIMARY,
                            flex: 1,
                        }}
                    >
                        {errorMsg}
                    </Text>
                    {autoFix && onAutoFix ? (
                        <Pressable
                            onPress={() => onAutoFix(autoFix.suggestion)}
                            style={({ pressed }) => ({
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                borderRadius: 6,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_PRIMARY,
                                opacity: pressed ? 0.6 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 11,
                                    color: palette.EHR_PRIMARY,
                                    fontWeight: '700',
                                }}
                            >
                                Sửa thành {autoFix.suggestion}
                            </Text>
                        </Pressable>
                    ) : null}
                </XStack>
            ) : null}
        </YStack>
    );
}

function ViInput({
    value,
    onChangeText,
    placeholder,
    hasError,
    keyboardType,
}: {
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    hasError?: boolean;
    keyboardType?: 'default' | 'number-pad';
}) {
    const palette = useEhrPalette();
    return (
        <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={palette.EHR_TEXT_MUTED}
            keyboardType={keyboardType}
            style={{
                borderRadius: 8,
                borderWidth: 0.5,
                borderColor: hasError ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: palette.EHR_ON_SURFACE,
                fontFamily: SANS,
                fontSize: 13.5,
            }}
        />
    );
}

function ViInputWithSuffix({
    value,
    onChangeText,
    placeholder,
    suffix,
    hasError,
    keyboardType,
}: {
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    suffix: string;
    hasError?: boolean;
    keyboardType?: 'default' | 'number-pad';
}) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 8,
                borderWidth: 0.5,
                borderColor: hasError ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE,
                paddingHorizontal: 12,
            }}
        >
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={palette.EHR_TEXT_MUTED}
                keyboardType={keyboardType}
                style={{
                    flex: 1,
                    paddingVertical: 10,
                    color: palette.EHR_ON_SURFACE,
                    fontFamily: SANS,
                    fontSize: 13.5,
                }}
            />
            <Text
                style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    color: hasError ? palette.EHR_PRIMARY : palette.EHR_TEXT_MUTED,
                    marginLeft: 4,
                }}
            >
                {suffix}
            </Text>
        </View>
    );
}

function ChipRow({
    options,
    value,
    onChange,
}: {
    options: string[];
    value: string;
    onChange: (v: string) => void;
}) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
            }}
        >
            {options.map((opt) => {
                const active = value === opt;
                return (
                    <Pressable
                        key={opt}
                        onPress={() => onChange(opt)}
                        style={({ pressed }) => ({
                            paddingHorizontal: 11,
                            paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 0.5,
                            borderColor: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_SOFT,
                            backgroundColor: active ? `${palette.EHR_PRIMARY}1A` : 'transparent',
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_MEDIUM,
                                fontSize: 12,
                                color: active ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE_VARIANT,
                                fontWeight: active ? '700' : '500',
                            }}
                        >
                            {opt}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}
