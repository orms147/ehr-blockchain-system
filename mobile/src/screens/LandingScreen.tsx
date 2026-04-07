import React, { useEffect } from 'react';
import {
    Dimensions,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import {
    ActivitySquare,
    ArrowRight,
    CheckCircle2,
    FileLock2,
    HeartPulse,
    Key,
    Lock,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    Wallet,
    Zap,
} from 'lucide-react-native';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

import {
    EHR_ON_PRIMARY,
    EHR_ON_PRIMARY_CONTAINER,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_CONTAINER,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const FEATURES = [
    {
        Icon: FileLock2,
        title: 'Riêng tư tuyệt đối',
        subtitle: 'Chỉ bạn mới xem được hồ sơ của mình',
        accent: '#4CAF8E',
    },
    {
        Icon: Wallet,
        title: 'Không thể giả mạo',
        subtitle: 'Mỗi kết quả khám đều được xác thực',
        accent: '#6B8EF5',
    },
    {
        Icon: Key,
        title: 'Bạn quyết định',
        subtitle: 'Cho ai xem, lúc nào — chỉ 1 chạm',
        accent: '#E8995A',
    },
];

const STATS = [
    { value: '100%', label: 'Riêng tư\ncho bạn' },
    { value: '24/7', label: 'Xem mọi lúc,\nmọi nơi' },
    { value: 'Miễn\nphí', label: 'Không tốn\nchi phí' },
];

/* ── Entrance hook ── */
function useEntrance(delay: number, distance = 24) {
    const v = useSharedValue(0);
    useEffect(() => {
        v.value = withDelay(delay, withSpring(1, { damping: 18, stiffness: 120, mass: 0.8 }));
    }, []);
    return useAnimatedStyle(() => ({
        opacity: interpolate(v.value, [0, 1], [0, 1]),
        transform: [{ translateY: interpolate(v.value, [0, 1], [distance, 0]) }],
    }));
}

/* ── Floating / orbit hook ── */
function useFloat(duration = 3000, distance = 6) {
    const v = useSharedValue(0);
    useEffect(() => {
        v.value = withRepeat(
            withSequence(
                withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
                withTiming(0, { duration, easing: Easing.inOut(Easing.quad) }),
            ),
            -1,
            false,
        );
    }, []);
    return useAnimatedStyle(() => ({
        transform: [{ translateY: interpolate(v.value, [0, 1], [0, -distance]) }],
    }));
}

/* ── Pulsing ring ── */
function usePulse(delay = 0) {
    const v = useSharedValue(0);
    useEffect(() => {
        v.value = withDelay(
            delay,
            withRepeat(
                withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }),
                -1,
                false,
            ),
        );
    }, []);
    return useAnimatedStyle(() => ({
        opacity: interpolate(v.value, [0, 0.6, 1], [0.5, 0.2, 0]),
        transform: [{ scale: interpolate(v.value, [0, 1], [0.9, 1.6]) }],
    }));
}

/* ── Heartbeat SVG line ── */
function HeartbeatLine() {
    return (
        <Svg width={SCREEN_W - 48} height={42} viewBox={`0 0 ${SCREEN_W - 48} 42`}>
            <Defs>
                <SvgLinearGradient id="hbGrad" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={EHR_PRIMARY} stopOpacity="0" />
                    <Stop offset="0.15" stopColor={EHR_PRIMARY} stopOpacity="0.6" />
                    <Stop offset="0.5" stopColor={EHR_PRIMARY} stopOpacity="1" />
                    <Stop offset="0.85" stopColor={EHR_PRIMARY} stopOpacity="0.6" />
                    <Stop offset="1" stopColor={EHR_PRIMARY} stopOpacity="0" />
                </SvgLinearGradient>
            </Defs>
            <Path
                d={`M0 21 L${(SCREEN_W - 48) * 0.3} 21 L${(SCREEN_W - 48) * 0.36} 6 L${(SCREEN_W - 48) * 0.42} 36 L${(SCREEN_W - 48) * 0.48} 2 L${(SCREEN_W - 48) * 0.54} 40 L${(SCREEN_W - 48) * 0.6} 21 L${SCREEN_W - 48} 21`}
                stroke="url(#hbGrad)"
                strokeWidth="2.2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}

export default function LandingScreen({ navigation }: any) {
    /* entrance */
    const chipStyle = useEntrance(0, 16);
    const heroStyle = useEntrance(100);
    const heartbeatStyle = useEntrance(200, 12);
    const titleStyle = useEntrance(260);
    const statsStyle = useEntrance(360);
    const featuresStyle = useEntrance(460);
    const ctaStyle = useEntrance(600);

    /* ambient animations */
    const floatStyle = useFloat(3200, 8);
    const orbitSlow = useFloat(4200, 4);
    const pulseA = usePulse(0);
    const pulseB = usePulse(800);

    return (
        <View style={styles.root}>
            {/* ── Layered mesh background ── */}
            <LinearGradient
                colors={[EHR_SURFACE, EHR_SURFACE_LOW, EHR_SURFACE_CONTAINER]}
                style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.meshA} />
            <View style={styles.meshB} />
            <View style={styles.meshC} />

            {/* Floating decorative icons */}
            <Animated.View style={[styles.floatIconA, floatStyle]}>
                <View style={styles.floatPill}>
                    <Stethoscope size={14} color={EHR_PRIMARY} strokeWidth={2.2} />
                </View>
            </Animated.View>
            <Animated.View style={[styles.floatIconB, orbitSlow]}>
                <View style={styles.floatPill}>
                    <ActivitySquare size={14} color={EHR_PRIMARY} strokeWidth={2.2} />
                </View>
            </Animated.View>
            <Animated.View style={[styles.floatIconC, floatStyle]}>
                <View style={styles.floatPill}>
                    <Zap size={14} color={EHR_PRIMARY} strokeWidth={2.2} />
                </View>
            </Animated.View>

            <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    showsVerticalScrollIndicator={false}
                >
                    {/* ── Top brand chip + live status ── */}
                    <Animated.View style={[styles.topRow, chipStyle]}>
                        <View style={styles.brandChip}>
                            <View style={styles.brandDot}>
                                <HeartPulse size={14} color={EHR_ON_PRIMARY} strokeWidth={2.4} />
                            </View>
                            <Text style={styles.brandChipText}>Sổ sức khoẻ</Text>
                        </View>
                        <View style={styles.liveChip}>
                            <View style={styles.liveDotOuter}>
                                <View style={styles.liveDotInner} />
                            </View>
                            <Text style={styles.liveText}>Đang hoạt động</Text>
                        </View>
                    </Animated.View>

                    {/* ── Hero ── */}
                    <Animated.View style={[styles.heroWrap, heroStyle]}>
                        {/* Pulsing rings */}
                        <Animated.View style={[styles.pulseRing, pulseA]} />
                        <Animated.View style={[styles.pulseRing, pulseB]} />
                        <View style={styles.heroGlow} />

                        {/* Shield circle */}
                        <LinearGradient
                            colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroCircle}
                        >
                            <ShieldCheck size={54} color={EHR_ON_PRIMARY} strokeWidth={1.8} />
                        </LinearGradient>

                        {/* Orbit badges */}
                        <View style={[styles.orbitBadge, styles.orbitBadgeTL]}>
                            <Lock size={12} color={EHR_PRIMARY} strokeWidth={2.6} />
                        </View>
                        <View style={[styles.orbitBadge, styles.orbitBadgeTR]}>
                            <Sparkles size={12} color={EHR_PRIMARY} strokeWidth={2.6} />
                        </View>
                        <View style={[styles.orbitBadge, styles.orbitBadgeBR]}>
                            <CheckCircle2 size={12} color={EHR_PRIMARY} strokeWidth={2.6} />
                        </View>
                    </Animated.View>

                    {/* ── Heartbeat line ── */}
                    <Animated.View style={[styles.heartbeatWrap, heartbeatStyle]}>
                        <HeartbeatLine />
                    </Animated.View>

                    {/* ── Title ── */}
                    <Animated.View style={titleStyle}>
                        <Text style={styles.title}>
                            Sức khoẻ của bạn{'\n'}
                            <Text style={styles.titleAccent}>trong tay bạn</Text>
                            <Text style={styles.titlePeriod}>.</Text>
                        </Text>
                        <Text style={styles.subtitle}>
                            Lưu giữ toàn bộ hồ sơ khám bệnh, đơn thuốc và kết quả xét nghiệm ở một nơi duy nhất — an toàn, dễ tra cứu, và chỉ bạn mới có quyền chia sẻ.
                        </Text>
                    </Animated.View>

                    {/* ── Stats strip ── */}
                    <Animated.View style={[styles.statsRow, statsStyle]}>
                        {STATS.map((s, i) => (
                            <React.Fragment key={s.value}>
                                <View style={styles.statCol}>
                                    <Text style={styles.statValue}>{s.value}</Text>
                                    <Text style={styles.statLabel}>{s.label}</Text>
                                </View>
                                {i < STATS.length - 1 && <View style={styles.statDivider} />}
                            </React.Fragment>
                        ))}
                    </Animated.View>

                    {/* ── Feature cards ── */}
                    <Animated.View style={[styles.featuresGrid, featuresStyle]}>
                        {FEATURES.map((item, i) => (
                            <View key={item.title} style={styles.featureCard}>
                                <View style={[styles.featureIcon, { backgroundColor: `${item.accent}22` }]}>
                                    <item.Icon size={18} color={item.accent} strokeWidth={2.2} />
                                </View>
                                <Text style={styles.featureTitle}>{item.title}</Text>
                                <Text style={styles.featureSubtitle}>{item.subtitle}</Text>
                                <View style={[styles.featureAccentBar, { backgroundColor: item.accent }]} />
                            </View>
                        ))}
                    </Animated.View>

                    {/* ── CTAs ── */}
                    <Animated.View style={[styles.ctaWrap, ctaStyle]}>
                        <Pressable
                            onPress={() => navigation.navigate('Login')}
                            style={({ pressed }) => [
                                styles.primaryCta,
                                pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 },
                            ]}
                        >
                            <LinearGradient
                                colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.primaryCtaInner}
                            >
                                <Text style={styles.primaryCtaText}>Bắt đầu ngay</Text>
                                <View style={styles.ctaArrowCircle}>
                                    <ArrowRight size={16} color={EHR_PRIMARY} strokeWidth={2.8} />
                                </View>
                            </LinearGradient>
                        </Pressable>

                        <Pressable
                            onPress={() => navigation.navigate('Login', { mode: 'login' })}
                            style={({ pressed }) => [
                                styles.secondaryCta,
                                pressed && { backgroundColor: EHR_SURFACE_LOW },
                            ]}
                        >
                            <Text style={styles.secondaryCtaText}>Tôi đã có tài khoản</Text>
                        </Pressable>

                        <Text style={styles.legalText}>
                            Bằng việc tiếp tục, bạn đồng ý với{' '}
                            <Text style={styles.legalLink}>Điều khoản</Text> &{' '}
                            <Text style={styles.legalLink}>Bảo mật</Text>
                        </Text>
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const HERO_SIZE = 112;

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: EHR_SURFACE },
    safe: { flex: 1 },
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 28,
    },

    /* ── mesh background ── */
    meshA: {
        position: 'absolute',
        top: -SCREEN_H * 0.12,
        right: -SCREEN_W * 0.35,
        width: SCREEN_W * 1.0,
        height: SCREEN_W * 1.0,
        borderRadius: SCREEN_W * 0.5,
        backgroundColor: EHR_PRIMARY_FIXED,
        opacity: 0.6,
    },
    meshB: {
        position: 'absolute',
        bottom: -SCREEN_H * 0.08,
        left: -SCREEN_W * 0.3,
        width: SCREEN_W * 0.85,
        height: SCREEN_W * 0.85,
        borderRadius: SCREEN_W * 0.425,
        backgroundColor: EHR_PRIMARY_CONTAINER,
        opacity: 0.2,
    },
    meshC: {
        position: 'absolute',
        top: SCREEN_H * 0.28,
        right: -40,
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: EHR_PRIMARY,
        opacity: 0.06,
    },

    /* ── floating decorations ── */
    floatPill: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: `${EHR_SURFACE_LOWEST}EE`,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        shadowColor: EHR_PRIMARY,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 3,
    },
    floatIconA: {
        position: 'absolute',
        top: SCREEN_H * 0.18,
        left: 28,
    },
    floatIconB: {
        position: 'absolute',
        top: SCREEN_H * 0.14,
        right: 40,
    },
    floatIconC: {
        position: 'absolute',
        top: SCREEN_H * 0.32,
        right: 24,
    },

    /* ── top row ── */
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    brandChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: `${EHR_SURFACE_LOWEST}F0`,
        paddingLeft: 5,
        paddingRight: 12,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
    },
    brandDot: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: EHR_PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandChipText: {
        fontSize: 13,
        fontWeight: '800',
        color: EHR_ON_SURFACE,
        letterSpacing: 0.3,
    },
    liveChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: `${EHR_SURFACE_LOWEST}F0`,
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
    },
    liveDotOuter: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#4CAF8E33',
        alignItems: 'center',
        justifyContent: 'center',
    },
    liveDotInner: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#4CAF8E',
    },
    liveText: {
        fontSize: 11,
        fontWeight: '700',
        color: EHR_ON_SURFACE_VARIANT,
        letterSpacing: 0.3,
    },

    /* ── hero ── */
    heroWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        height: HERO_SIZE + 40,
        marginBottom: 6,
    },
    pulseRing: {
        position: 'absolute',
        width: HERO_SIZE,
        height: HERO_SIZE,
        borderRadius: HERO_SIZE / 2,
        borderWidth: 2,
        borderColor: EHR_PRIMARY,
    },
    heroGlow: {
        position: 'absolute',
        width: HERO_SIZE + 60,
        height: HERO_SIZE + 60,
        borderRadius: (HERO_SIZE + 60) / 2,
        backgroundColor: EHR_PRIMARY_FIXED,
        opacity: 0.7,
    },
    heroCircle: {
        width: HERO_SIZE,
        height: HERO_SIZE,
        borderRadius: HERO_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: EHR_PRIMARY,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 14,
    },
    orbitBadge: {
        position: 'absolute',
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: EHR_SURFACE_LOWEST,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: EHR_OUTLINE_VARIANT,
        shadowColor: EHR_ON_SURFACE,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
        elevation: 4,
    },
    orbitBadgeTL: {
        top: 10,
        left: SCREEN_W / 2 - HERO_SIZE / 2 - 40,
    },
    orbitBadgeTR: {
        top: 0,
        right: SCREEN_W / 2 - HERO_SIZE / 2 - 36,
    },
    orbitBadgeBR: {
        bottom: 22,
        right: SCREEN_W / 2 - HERO_SIZE / 2 - 38,
    },

    /* ── heartbeat ── */
    heartbeatWrap: {
        alignItems: 'center',
        marginBottom: 8,
        marginTop: -4,
    },

    /* ── title ── */
    title: {
        fontSize: 36,
        fontWeight: '900',
        color: EHR_ON_SURFACE,
        textAlign: 'center',
        letterSpacing: -1,
        lineHeight: 44,
    },
    titleAccent: {
        color: EHR_PRIMARY,
    },
    titlePeriod: {
        color: EHR_PRIMARY,
    },
    subtitle: {
        marginTop: 12,
        marginBottom: 22,
        fontSize: 14,
        color: EHR_ON_SURFACE_VARIANT,
        textAlign: 'center',
        lineHeight: 21,
        paddingHorizontal: 4,
    },

    /* ── stats ── */
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: `${EHR_SURFACE_LOWEST}F5`,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        paddingVertical: 16,
        paddingHorizontal: 8,
        marginBottom: 18,
        shadowColor: EHR_ON_SURFACE,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
        elevation: 3,
    },
    statCol: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '900',
        color: EHR_PRIMARY,
        letterSpacing: -0.4,
    },
    statLabel: {
        marginTop: 4,
        fontSize: 10,
        fontWeight: '600',
        color: EHR_ON_SURFACE_VARIANT,
        textAlign: 'center',
        lineHeight: 13,
    },
    statDivider: {
        width: 1,
        height: 28,
        backgroundColor: EHR_OUTLINE_VARIANT,
    },

    /* ── feature grid ── */
    featuresGrid: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 24,
    },
    featureCard: {
        flex: 1,
        backgroundColor: `${EHR_SURFACE_LOWEST}F5`,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        paddingHorizontal: 10,
        paddingTop: 14,
        paddingBottom: 16,
        minHeight: 118,
        overflow: 'hidden',
        shadowColor: EHR_ON_SURFACE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    featureIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    featureTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: EHR_ON_SURFACE,
        lineHeight: 15,
    },
    featureSubtitle: {
        marginTop: 4,
        fontSize: 10,
        color: EHR_ON_SURFACE_VARIANT,
        lineHeight: 14,
    },
    featureAccentBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        opacity: 0.7,
    },

    /* ── CTAs ── */
    ctaWrap: {
        gap: 10,
    },
    primaryCta: {
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: EHR_PRIMARY,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.32,
        shadowRadius: 18,
        elevation: 10,
    },
    primaryCtaInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 18,
        paddingHorizontal: 20,
    },
    primaryCtaText: {
        color: EHR_ON_PRIMARY,
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    ctaArrowCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: EHR_SURFACE_LOWEST,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryCta: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        backgroundColor: `${EHR_SURFACE_LOWEST}CC`,
    },
    secondaryCtaText: {
        color: EHR_ON_SURFACE,
        fontSize: 15,
        fontWeight: '700',
    },
    legalText: {
        marginTop: 10,
        textAlign: 'center',
        fontSize: 11,
        color: EHR_ON_SURFACE_VARIANT,
        lineHeight: 16,
    },
    legalLink: {
        color: EHR_PRIMARY,
        fontWeight: '700',
    },
});
