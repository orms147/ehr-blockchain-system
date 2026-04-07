import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withDelay,
    interpolate,
    Extrapolation,
} from 'react-native-reanimated';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Circle,
    HeartPulse,
    ShieldCheck,
    Stethoscope,
} from 'lucide-react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import useAuthStore, { ROLE_CONFIG } from '../store/authStore';
import roleRegistrationService from '../services/roleRegistration.service';
import {
    EHR_ON_PRIMARY,
    EHR_ON_PRIMARY_CONTAINER,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SECONDARY,
    EHR_SECONDARY_CONTAINER,
    EHR_SHADOW,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

/* ───────── constants ───────── */

const ROLE_CONFIG_MAP = ROLE_CONFIG as Record<string, { label: string; emoji: string }>;

const FALLBACK_ROLE = {
    label: 'Vai tr\u00f2',
    emoji: '👤',
};

const REGISTRATION_OPTIONS = [
    {
        role: 'patient',
        label: 'B\u1ec7nh nh\u00e2n',
        description: 'Lưu giữ hồ sơ khám bệnh, đơn thuốc và kết quả xét nghiệm.',
        emoji: '👤',
        badge: 'Quy\u1ec1n truy c\u1eadp c\u00e1 nh\u00e2n',
        Icon: HeartPulse,
        iconBg: EHR_PRIMARY_FIXED,
        iconColor: EHR_PRIMARY,
    },
    {
        role: 'doctor',
        label: 'B\u00e1c s\u0129',
        description: 'G\u1eedi v\u00e0 y\u00eau c\u1ea7u truy c\u1eadp h\u1ed3 s\u01a1 b\u1ec7nh nh\u00e2n.',
        emoji: '🩺',
        badge: 'X\u00e1c minh ch\u1ee9ng ch\u1ec9',
        Icon: Stethoscope,
        iconBg: EHR_SECONDARY_CONTAINER,
        iconColor: EHR_SECONDARY,
    },
] as const;

const SPRING_CONFIG = { damping: 18, stiffness: 120, mass: 0.8 };
const CARD_STAGGER = 100;

/* ───────── error helper ───────── */

function mapRegistrationError(error: any) {
    if (error?.code === 'BACKEND_UNREACHABLE') {
        return 'Kh\u00f4ng k\u1ebft n\u1ed1i \u0111\u01b0\u1ee3c backend. H\u00e3y b\u1eadt backend v\u00e0 ki\u1ec3m tra EXPO_PUBLIC_API_URL.';
    }

    const raw = String(error?.message || '').toLowerCase();
    if (raw.includes('relayer') && raw.includes('not configured')) {
        return 'Backend ch\u01b0a c\u1ea5u h\u00ecnh relayer. C\u1ea7n thi\u1ebft l\u1eadp SPONSOR_PRIVATE_KEY v\u00e0 contract address.';
    }

    if (raw.includes('not authorized') || raw.includes('authorize')) {
        return 'V\u00ed relayer ch\u01b0a \u0111\u01b0\u1ee3c c\u1ea5p quy\u1ec1n tr\u00ean AccessControl. Vui l\u00f2ng ki\u1ec3m tra authorizedRelayers.';
    }

    return error?.message || 'Kh\u00f4ng th\u1ec3 \u0111\u0103ng k\u00fd role on-chain. Vui l\u00f2ng th\u1eed l\u1ea1i.';
}

/* ───────── animated card wrapper ───────── */

function AnimatedCard({
    index,
    selected,
    disabled,
    onPress,
    children,
}: {
    index: number;
    selected: boolean;
    disabled: boolean;
    onPress: () => void;
    children: React.ReactNode;
}) {
    const enter = useSharedValue(0);
    const pressed = useSharedValue(0);

    useEffect(() => {
        enter.value = withDelay(
            300 + index * CARD_STAGGER,
            withSpring(1, SPRING_CONFIG),
        );
    }, []);

    const animStyle = useAnimatedStyle(() => {
        const translateY = interpolate(enter.value, [0, 1], [30, 0], Extrapolation.CLAMP);
        const rotateX = `${interpolate(enter.value, [0, 1], [8, 0], Extrapolation.CLAMP)}deg`;
        const opacity = interpolate(enter.value, [0, 0.3, 1], [0, 0.5, 1], Extrapolation.CLAMP);
        const scale = interpolate(pressed.value, [0, 1], [1, 0.97], Extrapolation.CLAMP);

        return {
            opacity,
            transform: [
                { perspective: 1000 },
                { translateY },
                { rotateX },
                { scale },
            ],
        };
    });

    const handlePressIn = () => {
        pressed.value = withSpring(1, { damping: 20, stiffness: 300 });
    };
    const handlePressOut = () => {
        pressed.value = withSpring(0, { damping: 20, stiffness: 300 });
    };

    return (
        <Pressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
        >
            <Animated.View
                style={[
                    styles.roleCard,
                    selected && styles.roleCardSelected,
                    !selected && styles.roleCardUnselected,
                    disabled && !selected && { opacity: 0.55 },
                    animStyle,
                ]}
            >
                {children}
            </Animated.View>
        </Pressable>
    );
}

/* ───────── main screen ───────── */

export default function RoleSelectionScreen() {
    const {
        availableRoles,
        needsRoleRegistration,
        completeRoleSelection,
        refreshAuthSession,
    } = useAuthStore();

    const [busyRole, setBusyRole] = useState<string | null>(null);
    const [selectedRole, setSelectedRole] = useState<string | null>(null);

    const roles = useMemo(() => {
        if (!Array.isArray(availableRoles)) return [];
        return availableRoles.filter(Boolean);
    }, [availableRoles]);

    const registrationMode = needsRoleRegistration || roles.length === 0;

    // Auto-select first role if in registration mode
    useEffect(() => {
        if (registrationMode && !selectedRole) {
            setSelectedRole(REGISTRATION_OPTIONS[0].role);
        } else if (!registrationMode && roles.length > 0 && !selectedRole) {
            setSelectedRole(roles[0]);
        }
    }, [registrationMode, roles]);

    /* ── animation shared values ── */
    const headerEnter = useSharedValue(0);
    const ctaEnter = useSharedValue(0);
    const footerEnter = useSharedValue(0);

    useEffect(() => {
        headerEnter.value = withSpring(1, SPRING_CONFIG);
        ctaEnter.value = withDelay(
            300 + (registrationMode ? REGISTRATION_OPTIONS.length : roles.length) * CARD_STAGGER + 150,
            withSpring(1, SPRING_CONFIG),
        );
        footerEnter.value = withDelay(
            300 + (registrationMode ? REGISTRATION_OPTIONS.length : roles.length) * CARD_STAGGER + 300,
            withSpring(1, SPRING_CONFIG),
        );
    }, []);

    const headerAnimStyle = useAnimatedStyle(() => {
        const translateY = interpolate(headerEnter.value, [0, 1], [24, 0], Extrapolation.CLAMP);
        const opacity = interpolate(headerEnter.value, [0, 0.4, 1], [0, 0.6, 1], Extrapolation.CLAMP);
        return { opacity, transform: [{ translateY }] };
    });

    const ctaAnimStyle = useAnimatedStyle(() => {
        const translateY = interpolate(ctaEnter.value, [0, 1], [20, 0], Extrapolation.CLAMP);
        const opacity = interpolate(ctaEnter.value, [0, 0.4, 1], [0, 0.6, 1], Extrapolation.CLAMP);
        const scale = interpolate(ctaEnter.value, [0, 1], [0.95, 1], Extrapolation.CLAMP);
        return { opacity, transform: [{ translateY }, { scale }] };
    });

    const footerAnimStyle = useAnimatedStyle(() => {
        const opacity = interpolate(footerEnter.value, [0, 0.5, 1], [0, 0.5, 1], Extrapolation.CLAMP);
        return { opacity };
    });

    /* ── handlers ── */

    const handleSelectRole = async (role: string) => {
        if (busyRole) return;

        setBusyRole(role);
        try {
            await completeRoleSelection(role);
        } finally {
            setBusyRole(null);
        }
    };

    const handleRegisterRole = async (role: 'patient' | 'doctor') => {
        if (busyRole) return;

        setBusyRole(role);
        try {
            await roleRegistrationService.register(role);

            // Poll with exponential backoff: 1s, 2s, 4s
            const BACKOFF_DELAYS = [1000, 2000, 4000];
            let synced: any = null;

            for (const delay of BACKOFF_DELAYS) {
                await new Promise((resolve) => setTimeout(resolve, delay));
                synced = await refreshAuthSession();
                if (synced?.roles?.length) break;
            }

            if (!synced?.roles?.length) {
                // Role registered on-chain but not yet synced -- go to Dashboard
                // Backend will catch up on next /auth/me call
                Alert.alert(
                    '\u0110ang \u0111\u1ed3ng b\u1ed9',
                    'Role \u0111\u00e3 \u0111\u0103ng k\u00fd on-chain nh\u01b0ng ch\u01b0a sync. H\u1ec7 th\u1ed1ng s\u1ebd t\u1ef1 c\u1eadp nh\u1eadt trong v\u00e0i gi\u00e2y.',
                );
                await completeRoleSelection(role);
                return;
            }

            Alert.alert('Th\u00e0nh c\u00f4ng', '\u0110\u0103ng k\u00fd role on-chain th\u00e0nh c\u00f4ng.');
        } catch (error: any) {
            Alert.alert('\u0110\u0103ng k\u00fd th\u1ea5t b\u1ea1i', mapRegistrationError(error));
        } finally {
            setBusyRole(null);
        }
    };

    const handleContinue = () => {
        if (!selectedRole) return;
        if (registrationMode) {
            handleRegisterRole(selectedRole as 'patient' | 'doctor');
        } else {
            handleSelectRole(selectedRole);
        }
    };

    /* ── render helpers ── */

    const renderRegistrationCards = () =>
        REGISTRATION_OPTIONS.map((item, index) => {
            const isSelected = selectedRole === item.role;
            const IconComp = item.Icon;

            return (
                <AnimatedCard
                    key={item.role}
                    index={index}
                    selected={isSelected}
                    disabled={Boolean(busyRole)}
                    onPress={() => setSelectedRole(item.role)}
                >
                    <XStack style={styles.cardContent}>
                        {/* Icon circle */}
                        <View
                            style={[
                                styles.iconCircle,
                                { backgroundColor: item.iconBg },
                            ]}
                        >
                            <IconComp size={28} color={item.iconColor} />
                        </View>

                        {/* Text content */}
                        <YStack style={styles.cardTextWrap}>
                            <Text
                                style={[
                                    styles.cardTitle,
                                    isSelected && { color: EHR_ON_PRIMARY_CONTAINER },
                                ]}
                            >
                                {item.label}
                            </Text>
                            <Text style={styles.cardDescription}>{item.description}</Text>

                            {/* Badge chip */}
                            <View
                                style={[
                                    styles.badgeChip,
                                    {
                                        backgroundColor: isSelected
                                            ? EHR_PRIMARY_FIXED
                                            : EHR_SURFACE_LOW,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.badgeChipText,
                                        {
                                            color: isSelected
                                                ? EHR_ON_PRIMARY_CONTAINER
                                                : EHR_ON_SURFACE_VARIANT,
                                        },
                                    ]}
                                >
                                    {item.badge}
                                </Text>
                            </View>
                        </YStack>

                        {/* Selection indicator */}
                        <View style={styles.selectionIndicator}>
                            {isSelected ? (
                                <View style={styles.checkCircle}>
                                    <Check size={14} color={EHR_ON_PRIMARY} strokeWidth={3} />
                                </View>
                            ) : (
                                <Circle size={24} color={EHR_OUTLINE_VARIANT} strokeWidth={1.5} />
                            )}
                        </View>
                    </XStack>

                    {/* Loading overlay */}
                    {busyRole === item.role && (
                        <View style={styles.loadingOverlay}>
                            <ActivityIndicator size="small" color={EHR_PRIMARY} />
                            <Text style={styles.loadingText}>Đang đăng ký...</Text>
                        </View>
                    )}
                </AnimatedCard>
            );
        });

    const renderSelectionCards = () =>
        roles.map((role: string, index: number) => {
            const roleConfig = ROLE_CONFIG_MAP[role] || FALLBACK_ROLE;
            const isSelected = selectedRole === role;

            // Determine icon and colors based on role
            const isDoctor = role === 'doctor';
            const IconComp = isDoctor ? Stethoscope : HeartPulse;
            const iconBg = isDoctor ? EHR_SECONDARY_CONTAINER : EHR_PRIMARY_FIXED;
            const iconColor = isDoctor ? EHR_SECONDARY : EHR_PRIMARY;
            const badge = isDoctor ? 'X\u00e1c minh ch\u1ee9ng ch\u1ec9' : 'Quy\u1ec1n truy c\u1eadp c\u00e1 nh\u00e2n';

            return (
                <AnimatedCard
                    key={role}
                    index={index}
                    selected={isSelected}
                    disabled={Boolean(busyRole)}
                    onPress={() => setSelectedRole(role)}
                >
                    <XStack style={styles.cardContent}>
                        {/* Icon circle */}
                        <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
                            <IconComp size={28} color={iconColor} />
                        </View>

                        {/* Text content */}
                        <YStack style={styles.cardTextWrap}>
                            <Text
                                style={[
                                    styles.cardTitle,
                                    isSelected && { color: EHR_ON_PRIMARY_CONTAINER },
                                ]}
                            >
                                {roleConfig.label}
                            </Text>
                            <Text style={styles.cardDescription}>
                                Đăng nhập với quyền {String(roleConfig.label).toLowerCase()}
                            </Text>

                            {/* Badge chip */}
                            <View
                                style={[
                                    styles.badgeChip,
                                    {
                                        backgroundColor: isSelected
                                            ? EHR_PRIMARY_FIXED
                                            : EHR_SURFACE_LOW,
                                    },
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.badgeChipText,
                                        {
                                            color: isSelected
                                                ? EHR_ON_PRIMARY_CONTAINER
                                                : EHR_ON_SURFACE_VARIANT,
                                        },
                                    ]}
                                >
                                    {badge}
                                </Text>
                            </View>
                        </YStack>

                        {/* Selection indicator */}
                        <View style={styles.selectionIndicator}>
                            {isSelected ? (
                                <View style={styles.checkCircle}>
                                    <Check size={14} color={EHR_ON_PRIMARY} strokeWidth={3} />
                                </View>
                            ) : (
                                <Circle size={24} color={EHR_OUTLINE_VARIANT} strokeWidth={1.5} />
                            )}
                        </View>
                    </XStack>

                    {/* Loading overlay */}
                    {busyRole === role && (
                        <View style={styles.loadingOverlay}>
                            <ActivityIndicator size="small" color={EHR_PRIMARY} />
                            <Text style={styles.loadingText}>Đang xử lý...</Text>
                        </View>
                    )}
                </AnimatedCard>
            );
        });

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[EHR_SURFACE, EHR_SURFACE_LOW]}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            <SafeAreaView style={styles.safe}>
                {/* Header */}
                <Animated.View style={[styles.header, headerAnimStyle]}>
                    <XStack style={styles.headerRow}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={18} color={EHR_ON_SURFACE_VARIANT} />
                        </View>
                        <XStack style={styles.brandWrap}>
                            <ShieldCheck size={18} color={EHR_PRIMARY} />
                            <Text style={styles.brandText}>Sổ sức khoẻ</Text>
                        </XStack>
                        <View style={{ width: 36 }} />
                    </XStack>
                </Animated.View>

                {/* Title + Subtitle */}
                <Animated.View style={[styles.titleBlock, headerAnimStyle]}>
                    <Text style={styles.screenTitle}>
                        Bạn là ai?
                    </Text>
                    <Text style={styles.screenSubtitle}>
                        Chọn vai trò phù hợp để chúng tôi hiển thị đúng nội dung cho bạn.
                    </Text>
                </Animated.View>

                {/* Role cards */}
                <YStack style={styles.cardsContainer}>
                    {registrationMode ? renderRegistrationCards() : renderSelectionCards()}
                </YStack>

                {/* CTA Button */}
                <Animated.View style={[styles.ctaWrap, ctaAnimStyle]}>
                    <Pressable
                        onPress={handleContinue}
                        disabled={!selectedRole || Boolean(busyRole)}
                        style={({ pressed }) => [
                            styles.ctaButton,
                            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                            (!selectedRole || Boolean(busyRole)) && { opacity: 0.5 },
                        ]}
                    >
                        <LinearGradient
                            colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.ctaGradient}
                        >
                            {busyRole ? (
                                <ActivityIndicator size="small" color={EHR_ON_PRIMARY} />
                            ) : (
                                <XStack style={styles.ctaContent}>
                                    <Text style={styles.ctaText}>Tiếp tục</Text>
                                    <ArrowRight size={20} color={EHR_ON_PRIMARY} />
                                </XStack>
                            )}
                        </LinearGradient>
                    </Pressable>
                </Animated.View>

                {/* Footer */}
                <Animated.View style={[styles.footer, footerAnimStyle]}>
                    <Text style={styles.footerText}>
                        Bằng cách tiếp tục, bạn đồng ý với{' '}
                        <Text style={styles.footerLink}>Chính sách Bảo mật</Text>
                        {' '}của chúng tôi.
                    </Text>
                </Animated.View>
            </SafeAreaView>
        </View>
    );
}

/* ───────── styles ───────── */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: EHR_SURFACE,
    },
    safe: {
        flex: 1,
        paddingHorizontal: 20,
    },

    /* Header */
    header: {
        paddingTop: 8,
        paddingBottom: 4,
    },
    headerRow: {
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: EHR_SURFACE_LOWEST,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandWrap: {
        alignItems: 'center',
        gap: 6,
    },
    brandText: {
        fontSize: 14,
        fontWeight: '700',
        color: EHR_PRIMARY,
        letterSpacing: 0.3,
    },

    /* Title section */
    titleBlock: {
        paddingTop: 28,
        paddingBottom: 8,
    },
    screenTitle: {
        fontSize: 30,
        fontWeight: '800',
        color: EHR_ON_SURFACE,
        lineHeight: 38,
        marginBottom: 8,
    },
    screenSubtitle: {
        fontSize: 15,
        color: EHR_ON_SURFACE_VARIANT,
        lineHeight: 22,
        paddingRight: 8,
    },

    /* Cards */
    cardsContainer: {
        gap: 12,
        paddingTop: 24,
        flex: 1,
    },
    roleCard: {
        borderRadius: 20,
        padding: 16,
        backgroundColor: EHR_SURFACE_LOWEST,
    },
    roleCardSelected: {
        borderWidth: 2,
        borderColor: EHR_PRIMARY_CONTAINER,
        shadowColor: EHR_PRIMARY,
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
    },
    roleCardUnselected: {
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        shadowColor: EHR_SHADOW,
        shadowOpacity: 1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    cardContent: {
        alignItems: 'flex-start',
        gap: 14,
    },

    /* Icon */
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },

    /* Text */
    cardTextWrap: {
        flex: 1,
        gap: 4,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: EHR_ON_SURFACE,
    },
    cardDescription: {
        fontSize: 13,
        color: EHR_ON_SURFACE_VARIANT,
        lineHeight: 19,
    },

    /* Badge */
    badgeChip: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        marginTop: 6,
    },
    badgeChipText: {
        fontSize: 11,
        fontWeight: '700',
    },

    /* Selection indicator */
    selectionIndicator: {
        paddingTop: 2,
    },
    checkCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: EHR_PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
    },

    /* Loading overlay */
    loadingOverlay: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingTop: 12,
    },
    loadingText: {
        fontSize: 13,
        color: EHR_PRIMARY,
        fontWeight: '600',
    },

    /* CTA */
    ctaWrap: {
        paddingTop: 20,
        paddingBottom: 8,
    },
    ctaButton: {
        borderRadius: 18,
        overflow: 'hidden',
    },
    ctaGradient: {
        height: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaContent: {
        alignItems: 'center',
        gap: 8,
    },
    ctaText: {
        fontSize: 17,
        fontWeight: '800',
        color: EHR_ON_PRIMARY,
    },

    /* Footer */
    footer: {
        paddingBottom: 12,
        paddingTop: 4,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: EHR_ON_SURFACE_VARIANT,
        textAlign: 'center',
    },
    footerLink: {
        fontSize: 12,
        color: EHR_PRIMARY,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
});
