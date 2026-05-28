// VaccCard — 1 mũi tiêm trong session (multi-shot C2, plan §15).
//
// Pattern song song RxCard:
//   collapsed: index + vaccineName + 1-line summary
//   expanded: form 6 required + 3 optional fields
//
// Single-expand accordion (parent quản lý expandedId).
// TT 13/2026/TT-BYT compliance:
//   - HPV vaccine có badge "Bắt buộc" cinnabar
//   - NIP vaccine có badge "Chương trình" jade/tertiary
//   - HSD < ngày tiêm = HARD validation (block ký)
//   - Số lô vaccine REQUIRED (truy xuất lô lỗi)
//
// Design ref: viehp-vaccination-form.html Phương án B (multi-shot accordion).

import React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { ChevronDown, X as XIcon, Syringe, Lock } from 'lucide-react-native';

import { useEhrPalette } from '../constants/uiColors';
import {
    type Vaccination,
    type VaccinationError,
    VACC_SITES,
    VACC_DOSE_LABELS,
    VACCINE_PRESETS,
    findPreset,
    shotSummary,
} from '../constants/vaccines';

const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

interface VaccCardProps {
    shot: Vaccination;
    index: number;
    expanded: boolean;
    errors: VaccinationError[];
    autoFillAdministrator?: string;  // doctor session
    autoFillFacility?: string;       // doctor.hospitalName
    onToggleExpand: () => void;
    onChange: (patch: Partial<Vaccination>) => void;
    onRequestDelete: () => void;
}

export default function VaccCard({
    shot,
    index,
    expanded,
    errors,
    autoFillAdministrator,
    autoFillFacility,
    onToggleExpand,
    onChange,
    onRequestDelete,
}: VaccCardProps) {
    const palette = useEhrPalette();
    const hardErrors = errors.filter((e) => e.severity === 'hard');
    const hasErrors = hardErrors.length > 0;
    const ixPadded = String(index).padStart(2, '0');

    const errorFor = (field: keyof Vaccination | 'general'): VaccinationError | undefined =>
        errors.find((e) => e.field === field);

    const preset = findPreset(shot.vaccineName);

    // Auto-fill antigens khi user pick từ preset
    const handleVaccinePick = (name: string) => {
        const p = findPreset(name);
        const patch: Partial<Vaccination> = { vaccineName: name };
        if (p) patch.antigens = p.antigens;
        onChange(patch);
    };

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
            {/* Header */}
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
                    <XStack style={{ alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 14,
                                color: palette.EHR_ON_SURFACE,
                                fontWeight: '700',
                            }}
                            numberOfLines={1}
                        >
                            {shot.vaccineName || 'Vaccine chưa chọn'}
                        </Text>
                        {preset?.category === 'mandatory_hpv' ? (
                            <CategoryTag label="Bắt buộc" color={palette.EHR_PRIMARY} />
                        ) : preset?.category === 'nip' ? (
                            <CategoryTag label="Chương trình" color={palette.EHR_TERTIARY} />
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
                            {shotSummary(shot)}
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

            {/* Body */}
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
                    {/* Vaccine name + autocomplete chip suggestions */}
                    <Field label="Tên vaccine" required errorMsg={errorFor('vaccineName')?.message}>
                        <ViInput
                            value={shot.vaccineName}
                            onChangeText={(v) => onChange({ vaccineName: v })}
                            placeholder="Chọn từ gợi ý hoặc nhập tay"
                            hasError={!!errorFor('vaccineName')}
                        />
                        <VaccineSuggestions
                            currentName={shot.vaccineName}
                            onPick={handleVaccinePick}
                        />
                    </Field>

                    {/* Antigens (auto-filled, display only) */}
                    {shot.antigens && shot.antigens.length > 0 ? (
                        <Field label="Kháng nguyên" hint="tự suy ra từ vaccine">
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                                {shot.antigens.map((a) => (
                                    <View
                                        key={a}
                                        style={{
                                            paddingHorizontal: 9,
                                            paddingVertical: 4,
                                            borderRadius: 6,
                                            backgroundColor: palette.EHR_SURFACE,
                                            borderWidth: 0.5,
                                            borderColor: palette.EHR_OUTLINE_SOFT,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                fontFamily: MONO,
                                                fontSize: 10.5,
                                                color: palette.EHR_ON_SURFACE_VARIANT,
                                            }}
                                        >
                                            {a}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </Field>
                    ) : null}

                    {/* Lot number + HSD (2 cột) */}
                    <XStack style={{ gap: 10, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Field label="Số lô" required errorMsg={errorFor('lotNumber')?.message}>
                                <ViInput
                                    value={shot.lotNumber}
                                    onChangeText={(v) => onChange({ lotNumber: v })}
                                    placeholder="VD: GR9-2025-01"
                                    hasError={!!errorFor('lotNumber')}
                                />
                            </Field>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Field label="HSD vaccine" required errorMsg={errorFor('expirationDate')?.message}>
                                <ViInput
                                    value={shot.expirationDate}
                                    onChangeText={(v) => onChange({ expirationDate: v })}
                                    placeholder="DD/MM/YYYY"
                                    hasError={!!errorFor('expirationDate')}
                                />
                            </Field>
                        </View>
                    </XStack>

                    {/* Ngày tiêm + Mũi (2 cột) */}
                    <XStack style={{ gap: 10, marginBottom: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Field label="Ngày tiêm" required errorMsg={errorFor('administeredAt')?.message}>
                                <ViInput
                                    value={shot.administeredAt}
                                    onChangeText={(v) => onChange({ administeredAt: v })}
                                    placeholder="DD/MM/YYYY"
                                    hasError={!!errorFor('administeredAt')}
                                />
                            </Field>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Field label="Số mũi" hint="tuỳ chọn">
                                <ChipRow
                                    options={VACC_DOSE_LABELS as unknown as string[]}
                                    value={shot.doseNumber || ''}
                                    onChange={(v) => onChange({ doseNumber: v === shot.doseNumber ? undefined : v })}
                                />
                            </Field>
                        </View>
                    </XStack>

                    {/* Vị trí tiêm */}
                    <Field label="Vị trí tiêm" required errorMsg={errorFor('site')?.message}>
                        <ChipRow
                            options={VACC_SITES as unknown as string[]}
                            value={shot.site}
                            onChange={(v) => onChange({ site: v })}
                        />
                    </Field>

                    {/* Auto-filled administrator + facility */}
                    {(autoFillAdministrator || autoFillFacility) ? (
                        <View
                            style={{
                                marginBottom: 10,
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                borderRadius: 8,
                                borderWidth: 0.5,
                                borderStyle: 'dashed',
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                backgroundColor: palette.EHR_SURFACE,
                            }}
                        >
                            <XStack style={{ alignItems: 'center', gap: 5, marginBottom: 4 }}>
                                <Lock size={11} color={palette.EHR_TEXT_MUTED} />
                                <Text
                                    style={{
                                        fontFamily: MONO,
                                        fontSize: 10,
                                        color: palette.EHR_TEXT_MUTED,
                                        letterSpacing: 0.8,
                                        textTransform: 'uppercase',
                                        fontWeight: '600',
                                    }}
                                >
                                    Tự điền · không sửa
                                </Text>
                            </XStack>
                            {autoFillAdministrator ? (
                                <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_ON_SURFACE }}>
                                    Người tiêm: <Text style={{ fontWeight: '700' }}>{autoFillAdministrator}</Text>
                                </Text>
                            ) : null}
                            {autoFillFacility ? (
                                <Text style={{ fontFamily: SANS, fontSize: 12.5, color: palette.EHR_ON_SURFACE, marginTop: 2 }}>
                                    Cơ sở tiêm: <Text style={{ fontWeight: '700' }}>{autoFillFacility}</Text>
                                </Text>
                            ) : null}
                        </View>
                    ) : null}

                    {/* Adverse reaction (optional) */}
                    <Field label="Phản ứng sau tiêm" hint="tuỳ chọn">
                        <TextInput
                            value={shot.adverseReaction || ''}
                            onChangeText={(v) => onChange({ adverseReaction: v })}
                            placeholder="VD: sốt nhẹ, sưng đỏ vị trí tiêm, tự khỏi sau 24h"
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
                </View>
            ) : null}
        </View>
    );
}

// ─────────── helpers ───────────

function CategoryTag({ label, color }: { label: string; color: string }) {
    return (
        <View
            style={{
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: `${color}1A`,
                borderWidth: 0.5,
                borderColor: `${color}60`,
            }}
        >
            <Text
                style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    color,
                    fontWeight: '700',
                    letterSpacing: 0.4,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

function VaccineSuggestions({
    currentName,
    onPick,
}: {
    currentName: string;
    onPick: (name: string) => void;
}) {
    const palette = useEhrPalette();
    const query = currentName.trim().toLowerCase();
    // Show all if empty, filter by substring if user typed
    const suggestions = query.length === 0
        ? VACCINE_PRESETS.slice(0, 8)  // top 8 most common
        : VACCINE_PRESETS.filter((p) => p.name.toLowerCase().includes(query)).slice(0, 8);
    if (suggestions.length === 0) return null;
    return (
        <View
            style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 5,
                marginTop: 6,
            }}
        >
            {suggestions.map((p) => {
                const active = currentName.trim().toLowerCase() === p.name.toLowerCase();
                const color = p.category === 'mandatory_hpv'
                    ? palette.EHR_PRIMARY
                    : palette.EHR_TERTIARY;
                return (
                    <Pressable
                        key={p.name}
                        onPress={() => onPick(p.name)}
                        style={({ pressed }) => ({
                            paddingHorizontal: 9,
                            paddingVertical: 4,
                            borderRadius: 999,
                            borderWidth: 0.5,
                            borderColor: active ? color : palette.EHR_OUTLINE_SOFT,
                            backgroundColor: active ? `${color}1A` : 'transparent',
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_MEDIUM,
                                fontSize: 11,
                                color: active ? color : palette.EHR_ON_SURFACE_VARIANT,
                                fontWeight: active ? '700' : '500',
                            }}
                        >
                            {p.name}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

function Field({
    label,
    required,
    hint,
    errorMsg,
    children,
}: {
    label: string;
    required?: boolean;
    hint?: string;
    errorMsg?: string;
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
                <Text
                    style={{
                        marginTop: 4,
                        fontFamily: SANS,
                        fontSize: 11,
                        color: palette.EHR_PRIMARY,
                    }}
                >
                    {errorMsg}
                </Text>
            ) : null}
        </YStack>
    );
}

function ViInput({
    value,
    onChangeText,
    placeholder,
    hasError,
}: {
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    hasError?: boolean;
}) {
    const palette = useEhrPalette();
    return (
        <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={palette.EHR_TEXT_MUTED}
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
