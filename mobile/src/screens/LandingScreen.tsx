import React, { useEffect } from 'react';
import { ScrollView, Dimensions, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack, XStack, Text, View } from 'tamagui';
import { Shield, Lock, Wallet, Key, ArrowRight, Database } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withDelay,
    withSpring,
    interpolate,
} from 'react-native-reanimated';

import {
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_PRIMARY_FIXED_DIM,
    EHR_SHADOW,
    EHR_SURFACE,
    EHR_SURFACE_CONTAINER,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

const { width: SCREEN_W } = Dimensions.get('window');

/* ── Spring config matching project standard ── */
const SPRING_CONFIG = { damping: 18, stiffness: 120, mass: 0.8 };

/* ── Trust highlights data ── */
const TRUST_ITEMS = [
    {
        Icon: Lock,
        title: 'Mã hóa đầu cuối',
        subtitle: 'Dữ liệu chỉ dành cho bạn',
    },
    {
        Icon: Wallet,
        title: 'Xác thực blockchain',
        subtitle: 'Tính toàn vẹn không thể sửa đổi',
    },
    {
        Icon: Key,
        title: 'Bệnh nhân kiểm soát',
        subtitle: 'Toàn quyền cấp phép truy cập',
    },
];

/* ── Reusable stagger entrance hook ── */
function useStaggerEntrance(delay: number) {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withDelay(delay, withSpring(1, SPRING_CONFIG));
    }, []);

    const style = useAnimatedStyle(() => {
        const opacity = interpolate(progress.value, [0, 0.4, 1], [0, 0.6, 1]);
        const translateY = interpolate(progress.value, [0, 1], [20, 0]);
        const scale = interpolate(progress.value, [0, 1], [0.95, 1]);
        const rotateX = `${interpolate(progress.value, [0, 1], [8, 0])}deg`;

        return {
            opacity,
            transform: [
                { perspective: 800 },
                { rotateX },
                { translateY },
                { scale },
            ],
        };
    });

    return style;
}

/* ── Medical pattern dot ── */
function PatternDot({ top, left, size, opacity }: { top: number; left: number; size: number; opacity: number }) {
    return (
        <View
            style={{
                position: 'absolute',
                top,
                left,
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: EHR_PRIMARY,
                opacity,
            }}
        />
    );
}

export default function LandingScreen({ navigation }: any) {
    /* stagger entrance animations */
    const shieldStyle = useStaggerEntrance(0);
    const titleStyle = useStaggerEntrance(100);
    const subtitleStyle = useStaggerEntrance(200);
    const trust0Style = useStaggerEntrance(300);
    const trust1Style = useStaggerEntrance(400);
    const trust2Style = useStaggerEntrance(500);
    const ctaStyle = useStaggerEntrance(600);

    const trustStyles = [trust0Style, trust1Style, trust2Style];

    return (
        <View flex={1} backgroundColor={EHR_SURFACE}>
            {/* ── Background gradient ── */}
            <LinearGradient
                colors={[EHR_SURFACE, EHR_SURFACE_LOW, EHR_SURFACE_CONTAINER]}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            {/* ── Decorative blur circles ── */}
            <View
                style={{
                    position: 'absolute',
                    top: -80,
                    right: -60,
                    width: SCREEN_W * 0.8,
                    height: SCREEN_W * 0.8,
                    borderRadius: SCREEN_W * 0.4,
                    backgroundColor: EHR_PRIMARY_FIXED,
                    opacity: 0.5,
                }}
            />
            <View
                style={{
                    position: 'absolute',
                    bottom: -40,
                    left: -70,
                    width: SCREEN_W * 0.65,
                    height: SCREEN_W * 0.65,
                    borderRadius: SCREEN_W * 0.325,
                    backgroundColor: EHR_PRIMARY_FIXED_DIM,
                    opacity: 0.25,
                }}
            />

            {/* ── Medical pattern dots ── */}
            <PatternDot top={120} left={30} size={4} opacity={0.08} />
            <PatternDot top={180} left={SCREEN_W - 50} size={5} opacity={0.06} />
            <PatternDot top={300} left={60} size={3} opacity={0.07} />
            <PatternDot top={400} left={SCREEN_W - 80} size={4} opacity={0.05} />
            <PatternDot top={500} left={100} size={3} opacity={0.06} />
            <PatternDot top={250} left={SCREEN_W - 30} size={6} opacity={0.04} />
            <PatternDot top={550} left={40} size={5} opacity={0.05} />
            <PatternDot top={160} left={SCREEN_W * 0.5} size={3} opacity={0.06} />

            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
                    showsVerticalScrollIndicator={false}
                >
                    <YStack paddingHorizontal={24} paddingVertical={32} gap={28}>
                        {/* ── Hero: Shield icon with glow ── */}
                        <Animated.View style={shieldStyle}>
                            <View style={styles.heroIconContainer}>
                                {/* Subtle glow behind shield */}
                                <View style={styles.shieldGlow} />
                                <View style={styles.shieldCircle}>
                                    <Shield
                                        size={48}
                                        color={EHR_ON_PRIMARY}
                                        strokeWidth={1.8}
                                    />
                                </View>
                                {/* Floating database icon */}
                                <View style={styles.databaseBadge}>
                                    <Database
                                        size={16}
                                        color={EHR_PRIMARY}
                                        strokeWidth={2}
                                    />
                                </View>
                            </View>
                        </Animated.View>

                        {/* ── Title ── */}
                        <Animated.View style={titleStyle}>
                            <Text
                                style={{
                                    fontSize: 32,
                                    fontWeight: '800',
                                    color: EHR_ON_SURFACE,
                                    letterSpacing: -0.5,
                                    textAlign: 'center',
                                    lineHeight: 40,
                                }}
                            >
                                Chủ quyền hồ sơ{'\n'}y tế số
                            </Text>
                        </Animated.View>

                        {/* ── Subtitle ── */}
                        <Animated.View style={subtitleStyle}>
                            <Text
                                style={{
                                    fontSize: 16,
                                    color: EHR_ON_SURFACE_VARIANT,
                                    textAlign: 'center',
                                    lineHeight: 24,
                                    paddingHorizontal: 12,
                                }}
                            >
                                Nền tảng lưu trữ bệnh án phi tập trung,{'\n'}an toàn và minh bạch tuyệt đối.
                            </Text>
                        </Animated.View>

                        {/* ── Trust highlights ── */}
                        <YStack gap={12} paddingHorizontal={4}>
                            {TRUST_ITEMS.map((item, index) => (
                                <Animated.View key={item.title} style={trustStyles[index]}>
                                    <XStack
                                        style={styles.trustRow}
                                        backgroundColor={EHR_SURFACE_LOWEST}
                                        borderColor={EHR_OUTLINE_VARIANT}
                                    >
                                        <View style={styles.trustIcon}>
                                            <item.Icon
                                                size={20}
                                                color={EHR_PRIMARY}
                                                strokeWidth={2}
                                            />
                                        </View>
                                        <YStack flex={1} gap={2}>
                                            <Text
                                                style={{
                                                    fontSize: 15,
                                                    fontWeight: '700',
                                                    color: EHR_ON_SURFACE,
                                                }}
                                            >
                                                {item.title}
                                            </Text>
                                            <Text
                                                style={{
                                                    fontSize: 13,
                                                    color: EHR_ON_SURFACE_VARIANT,
                                                    lineHeight: 18,
                                                }}
                                            >
                                                {item.subtitle}
                                            </Text>
                                        </YStack>
                                    </XStack>
                                </Animated.View>
                            ))}
                        </YStack>

                        {/* ── CTAs ── */}
                        <Animated.View style={ctaStyle}>
                            <YStack gap={12} paddingTop={4}>
                                {/* Primary CTA */}
                                <Pressable
                                    onPress={() => navigation.navigate('Login')}
                                    style={({ pressed }) => [
                                        styles.primaryCta,
                                        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                                    ]}
                                >
                                    <LinearGradient
                                        colors={[EHR_PRIMARY, EHR_PRIMARY_CONTAINER]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 0 }}
                                        style={styles.primaryCtaGradient}
                                    >
                                        <Text
                                            style={{
                                                color: EHR_ON_PRIMARY,
                                                fontSize: 17,
                                                fontWeight: '700',
                                            }}
                                        >
                                            Bắt đầu ngay
                                        </Text>
                                        <ArrowRight
                                            size={20}
                                            color={EHR_ON_PRIMARY}
                                            style={{ marginLeft: 8 }}
                                        />
                                    </LinearGradient>
                                </Pressable>

                                {/* Secondary CTA */}
                                <Pressable
                                    onPress={() => navigation.navigate('Login', { mode: 'login' })}
                                    style={({ pressed }) => [
                                        styles.secondaryCta,
                                        pressed && {
                                            backgroundColor: EHR_SURFACE_LOW,
                                            transform: [{ scale: 0.98 }],
                                        },
                                    ]}
                                >
                                    <Text
                                        style={{
                                            color: EHR_ON_SURFACE,
                                            fontSize: 16,
                                            fontWeight: '600',
                                        }}
                                    >
                                        Tìm hiểu thêm
                                    </Text>
                                </Pressable>
                            </YStack>
                        </Animated.View>
                    </YStack>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    /* Hero icon */
    heroIconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    shieldGlow: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: EHR_PRIMARY_FIXED,
        opacity: 0.6,
    },
    shieldCircle: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: EHR_PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: EHR_PRIMARY,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 8,
    },
    databaseBadge: {
        position: 'absolute',
        bottom: 2,
        right: SCREEN_W / 2 - 88,
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: EHR_SURFACE_LOWEST,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: EHR_SURFACE,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },

    /* Trust rows */
    trustRow: {
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 14,
        shadowColor: EHR_SHADOW,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 2,
    },
    trustIcon: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: EHR_PRIMARY_FIXED,
        alignItems: 'center',
        justifyContent: 'center',
    },

    /* CTA buttons */
    primaryCta: {
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: EHR_PRIMARY,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 6,
    },
    primaryCtaGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
    },
    secondaryCta: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        backgroundColor: EHR_SURFACE_LOWEST,
    },
});
