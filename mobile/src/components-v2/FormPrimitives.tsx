// FormPrimitives — shared form layout components per
// viehp-doctor-forms-v2.html mockup. Used by DoctorRequestAccessScreen,
// CreateRecordScreen, DoctorCreateUpdateScreen.
//
// Editorial style: hairline dividers, mono kicker labels, no card chrome.
// PageHeader: eyebrow + sans title 22pt + subtitle
// SectionLabel: uppercase mono kicker + optional "· bắt buộc" + optional trailing
// PickerRow: 20px radio + name + sub + allow/deny chips
// TimePresetRow: 20px radio + label + sub
// StickyFooter: primary CTA in ink (or cinnabar for danger) + secondary ghost + hint
//
// All colors come from useEhrPalette() — never hardcode hex.

import React from 'react';
import { Pressable, View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Check, X } from 'lucide-react-native';

import { useEhrPalette } from '../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

export function PageHeader({
    eyebrow,
    title,
    subtitle,
}: {
    eyebrow?: string;
    title: string;
    subtitle?: string;
}) {
    const palette = useEhrPalette();
    return (
        <View style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 18 }}>
            {eyebrow ? (
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: palette.EHR_TEXT_MUTED,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        fontWeight: '700',
                        marginBottom: 8,
                    }}
                >
                    {eyebrow}
                </Text>
            ) : null}
            <Text
                style={{
                    fontFamily: SANS_SEMI,
                    fontSize: 22,
                    fontWeight: '700',
                    color: palette.EHR_ON_SURFACE,
                    letterSpacing: -0.2,
                    lineHeight: 26,
                }}
            >
                {title}
            </Text>
            {subtitle ? (
                <Text
                    style={{
                        marginTop: 8,
                        fontFamily: SANS,
                        fontSize: 13.5,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        lineHeight: 21,
                        maxWidth: 320,
                    }}
                >
                    {subtitle}
                </Text>
            ) : null}
        </View>
    );
}

export function SectionLabel({
    children,
    trailing,
    required,
    badge,
}: {
    children: React.ReactNode;
    trailing?: React.ReactNode;
    required?: boolean;
    badge?: string;
}) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                paddingHorizontal: 22,
                paddingTop: 22,
                paddingBottom: 10,
                borderTopWidth: 0.5,
                borderTopColor: palette.EHR_OUTLINE_SOFT,
            }}
        >
            <XStack style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        letterSpacing: 1.2,
                        textTransform: 'uppercase',
                        fontWeight: '700',
                    }}
                >
                    {children}
                </Text>
                {required ? (
                    <Text
                        style={{
                            fontFamily: MONO,
                            fontSize: 9.5,
                            color: palette.EHR_TEXT_MUTED,
                            letterSpacing: 0.6,
                            fontWeight: '700',
                            textTransform: 'uppercase',
                        }}
                    >
                        · bắt buộc
                    </Text>
                ) : null}
                {badge ? (
                    <View
                        style={{
                            paddingVertical: 2,
                            paddingHorizontal: 7,
                            borderRadius: 3,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_SOFT,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: MONO,
                                fontSize: 9.5,
                                fontWeight: '700',
                                letterSpacing: 0.6,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                textTransform: 'uppercase',
                            }}
                        >
                            {badge}
                        </Text>
                    </View>
                ) : null}
            </XStack>
            {trailing ? (
                typeof trailing === 'string' ? (
                    <Text
                        style={{
                            fontFamily: SANS,
                            fontSize: 11,
                            color: palette.EHR_TEXT_MUTED,
                            letterSpacing: 0.3,
                        }}
                    >
                        {trailing}
                    </Text>
                ) : (
                    trailing
                )
            ) : null}
        </View>
    );
}

function Radio({ selected }: { selected: boolean }) {
    const palette = useEhrPalette();
    return (
        <View
            style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 1.25,
                borderColor: selected ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE,
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: 3,
            }}
        >
            {selected ? (
                <View
                    style={{
                        width: 9,
                        height: 9,
                        borderRadius: 5,
                        backgroundColor: palette.EHR_ON_SURFACE,
                    }}
                />
            ) : null}
        </View>
    );
}

export interface PickerRowProps {
    name: string;
    sub?: string;
    allow?: string | null;
    deny?: string | null;
    selected: boolean;
    last?: boolean;
    onPress: () => void;
}

export function PickerRow({ name, sub, allow, deny, selected, last, onPress }: PickerRowProps) {
    const palette = useEhrPalette();
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => ({
                paddingHorizontal: 22,
                paddingVertical: 14,
                borderBottomWidth: last ? 0 : 0.5,
                borderBottomColor: palette.EHR_OUTLINE_SOFT,
                flexDirection: 'row',
                gap: 14,
                alignItems: 'flex-start',
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <Radio selected={selected} />
            <YStack style={{ flex: 1, minWidth: 0 }}>
                <Text
                    style={{
                        fontFamily: SANS_SEMI,
                        fontSize: 15,
                        color: palette.EHR_ON_SURFACE,
                        fontWeight: '600',
                        letterSpacing: -0.1,
                    }}
                >
                    {name}
                </Text>
                {sub ? (
                    <Text
                        style={{
                            marginTop: 4,
                            fontFamily: SANS,
                            fontSize: 12.5,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 19,
                        }}
                    >
                        {sub}
                    </Text>
                ) : null}
                {allow || deny ? (
                    <XStack style={{ marginTop: 9, gap: 14, flexWrap: 'wrap' }}>
                        {allow ? (
                            <XStack style={{ alignItems: 'center', gap: 5 }}>
                                <Check size={12} color={palette.EHR_TERTIARY} strokeWidth={2.2} />
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 11.5,
                                        color: palette.EHR_TERTIARY,
                                        fontWeight: '600',
                                    }}
                                >
                                    Cho phép {allow}
                                </Text>
                            </XStack>
                        ) : null}
                        {deny ? (
                            <XStack style={{ alignItems: 'center', gap: 5 }}>
                                <X size={12} color={palette.EHR_TEXT_MUTED} strokeWidth={2} />
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 11.5,
                                        color: palette.EHR_TEXT_MUTED,
                                        fontWeight: '600',
                                    }}
                                >
                                    Không {deny}
                                </Text>
                            </XStack>
                        ) : null}
                    </XStack>
                ) : null}
            </YStack>
        </Pressable>
    );
}

export interface TimePresetRowProps {
    label: string;
    sub?: string;
    selected: boolean;
    last?: boolean;
    onPress: () => void;
}

export function TimePresetRow({ label, sub, selected, last, onPress }: TimePresetRowProps) {
    const palette = useEhrPalette();
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => ({
                paddingHorizontal: 22,
                paddingVertical: 14,
                borderBottomWidth: last ? 0 : 0.5,
                borderBottomColor: palette.EHR_OUTLINE_SOFT,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                opacity: pressed ? 0.7 : 1,
            })}
        >
            <Radio selected={selected} />
            <YStack style={{ flex: 1, minWidth: 0 }}>
                <Text
                    style={{
                        fontFamily: SANS_SEMI,
                        fontSize: 15,
                        fontWeight: '600',
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.1,
                    }}
                >
                    {label}
                </Text>
                {sub ? (
                    <Text
                        style={{
                            marginTop: 2,
                            fontFamily: SANS,
                            fontSize: 12,
                            color: palette.EHR_TEXT_MUTED,
                        }}
                    >
                        {sub}
                    </Text>
                ) : null}
            </YStack>
        </Pressable>
    );
}

export interface StickyFooterProps {
    primary: string;
    secondary?: string;
    hint?: string;
    danger?: boolean;
    primaryDisabled?: boolean;
    primaryLoading?: boolean;
    onPrimary: () => void;
    onSecondary?: () => void;
}

export function StickyFooter({
    primary,
    secondary,
    hint,
    danger,
    primaryDisabled,
    primaryLoading,
    onPrimary,
    onSecondary,
}: StickyFooterProps) {
    const palette = useEhrPalette();
    const primaryBg = danger ? palette.EHR_CINNABAR_DEEP : palette.EHR_ON_SURFACE;
    const primaryFg = palette.EHR_SURFACE;
    const disabled = primaryDisabled || primaryLoading;
    return (
        <View
            style={{
                paddingHorizontal: 22,
                paddingTop: 14,
                paddingBottom: 18,
                borderTopWidth: 0.5,
                borderTopColor: palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE,
            }}
        >
            <XStack style={{ gap: 10 }}>
                {secondary ? (
                    <Pressable
                        onPress={onSecondary}
                        style={({ pressed }) => ({
                            paddingVertical: 14,
                            paddingHorizontal: 18,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE,
                            borderRadius: 12,
                            minHeight: 50,
                            justifyContent: 'center',
                            opacity: pressed ? 0.7 : 1,
                        })}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 14,
                                fontWeight: '600',
                                color: palette.EHR_ON_SURFACE,
                            }}
                        >
                            {secondary}
                        </Text>
                    </Pressable>
                ) : null}
                <Pressable
                    onPress={onPrimary}
                    disabled={disabled}
                    style={({ pressed }) => ({
                        flex: 1,
                        paddingVertical: 14,
                        paddingHorizontal: 18,
                        backgroundColor: primaryBg,
                        borderRadius: 12,
                        minHeight: 50,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
                    })}
                >
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 15,
                            fontWeight: '700',
                            color: primaryFg,
                            letterSpacing: 0.1,
                        }}
                    >
                        {primaryLoading ? 'Đang xử lý…' : primary}
                    </Text>
                </Pressable>
            </XStack>
            {hint ? (
                <XStack
                    style={{
                        marginTop: 8,
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    <View
                        style={{
                            width: 4,
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: palette.EHR_TEXT_MUTED,
                        }}
                    />
                    <Text
                        style={{
                            fontFamily: SANS,
                            fontSize: 11.5,
                            color: palette.EHR_TEXT_MUTED,
                            letterSpacing: 0.2,
                        }}
                    >
                        {hint}
                    </Text>
                </XStack>
            ) : null}
        </View>
    );
}

/**
 * Convenience wrapper — SafeArea + KeyboardAvoidingView + ScrollView for the
 * form body, with optional sticky footer. Use for all 3 form screens for
 * consistent spacing + behavior.
 */
export function FormShell({
    children,
    footer,
    saveStatusLabel,
}: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    /** Optional "Tự lưu" indicator rendered at top-right of scroll header strip */
    saveStatusLabel?: string;
}) {
    const palette = useEhrPalette();
    return (
        <SafeAreaView
            style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }}
            edges={['right', 'left']}
        >
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingBottom: 24 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {saveStatusLabel ? (
                        <View
                            style={{
                                paddingHorizontal: 22,
                                paddingTop: 8,
                                alignItems: 'flex-end',
                            }}
                        >
                            <Text
                                style={{
                                    fontFamily: MONO,
                                    fontSize: 11,
                                    color: palette.EHR_TEXT_MUTED,
                                    letterSpacing: 0.4,
                                }}
                            >
                                {saveStatusLabel}
                            </Text>
                        </View>
                    ) : null}
                    {children}
                </ScrollView>
                {footer}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
