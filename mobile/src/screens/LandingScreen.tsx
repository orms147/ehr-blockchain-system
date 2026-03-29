import React, { useEffect, useRef } from 'react';
import { ScrollView, Dimensions, StyleSheet, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YStack, XStack, Text, Button, View } from 'tamagui';
import { Sparkles, ArrowRight, ShieldCheck, Activity, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const STATS = [
    { value: '100K+', label: 'Nguoi dung', Icon: Activity },
    { value: '99.9%', label: 'Uptime', Icon: ShieldCheck },
    { value: '256-bit', label: 'Bao mat', Icon: Lock },
];

export default function LandingScreen({ navigation }: any) {
    const heroAnim = useRef(new Animated.Value(0)).current;
    const statsAnim = useRef(new Animated.Value(0)).current;
    const ctaAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.stagger(140, [
            Animated.timing(heroAnim, {
                toValue: 1,
                duration: 420,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(statsAnim, {
                toValue: 1,
                duration: 470,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(ctaAnim, {
                toValue: 1,
                duration: 520,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();
    }, [heroAnim, statsAnim, ctaAnim]);

    return (
        <View flex={1} background="black">
            <LinearGradient
                colors={['#0f172a', '#1e3a8a', '#0d9488']}
                style={StyleSheet.absoluteFillObject}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
            />

            <View style={{ position: 'absolute', top: -100, left: -50, width: width * 1.5, height: width * 1.5, borderRadius: width, backgroundColor: '#3b82f6', opacity: 0.15 }} />
            <View style={{ position: 'absolute', bottom: -100, right: -50, width, height: width, borderRadius: width / 2, backgroundColor: '#14b8a6', opacity: 0.15 }} />

            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
                    <YStack style={{ flex: 1, padding: 20, paddingBottom: 30, justifyContent: 'center' }}>
                        <Animated.View
                            style={{
                                opacity: heroAnim,
                                transform: [
                                    {
                                        translateY: heroAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [20, 0],
                                        }),
                                    },
                                ],
                            }}
                        >
                            <XStack
                                background="rgba(255,255,255,0.1)"
                                borderColor="rgba(255,255,255,0.2)"
                                style={{ alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', marginBottom: 24 }}
                            >
                                <Sparkles size={16} color="#67e8f9" style={{ marginRight: 8 }} />
                                <Text fontSize="$3" fontWeight="700" color="#67e8f9" style={{ letterSpacing: 0.5 }}>
                                    Y TE TREN BLOCKCHAIN
                                </Text>
                            </XStack>

                            <YStack style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 44, fontWeight: '900', color: 'white', lineHeight: 52 }}>Ho so Y te</Text>
                                <Text style={{ fontSize: 44, fontWeight: '900', color: '#2dd4bf', lineHeight: 52 }}>An toan &</Text>
                                <Text style={{ fontSize: 44, fontWeight: '900', color: '#93c5fd', lineHeight: 52 }}>Tien loi</Text>
                            </YStack>

                            <Text fontSize="$5" color="$gray5" style={{ lineHeight: 28, marginBottom: 28, paddingRight: 16 }}>
                                Quan ly ho so suc khoe theo cach cua tuong lai: minh bach, phan tan va bao mat cao.
                            </Text>
                        </Animated.View>

                        <Animated.View
                            style={{
                                opacity: statsAnim,
                                transform: [
                                    {
                                        translateY: statsAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [24, 0],
                                        }),
                                    },
                                ],
                            }}
                        >
                            <XStack style={{ justifyContent: 'space-between', marginBottom: 28, paddingRight: 20 }}>
                                {STATS.map((stat) => (
                                    <YStack key={stat.label} style={{ alignItems: 'flex-start' }}>
                                        <View background="rgba(255,255,255,0.1)" style={{ width: 44, height: 44, borderRadius: 22, marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}>
                                            <stat.Icon size={22} color="#67e8f9" />
                                        </View>
                                        <Text fontSize="$6" fontWeight="700" color="white">{stat.value}</Text>
                                        <Text fontSize="$2" color="$gray6">{stat.label}</Text>
                                    </YStack>
                                ))}
                            </XStack>
                        </Animated.View>

                        <Animated.View
                            style={{
                                opacity: ctaAnim,
                                transform: [
                                    {
                                        translateY: ctaAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [26, 0],
                                        }),
                                    },
                                ],
                            }}
                        >
                            <YStack style={{ gap: 10, marginTop: 'auto' }}>
                                <Button
                                    size="$6"
                                    background="white"
                                    pressStyle={{ background: '$gray3' }}
                                    onPress={() => navigation.navigate('Login')}
                                    style={{ borderRadius: 14 }}
                                >
                                    <XStack style={{ alignItems: 'center', justifyContent: 'center' }}>
                                        <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 20 }}>Bat dau ngay</Text>
                                        <ArrowRight size={20} color="#0f172a" style={{ marginLeft: 8 }} />
                                    </XStack>
                                </Button>

                                <Button
                                    size="$6"
                                    variant="outlined"
                                    borderColor="rgba(255,255,255,0.35)"
                                    background="transparent"
                                    pressStyle={{ background: 'rgba(255,255,255,0.1)' }}
                                    onPress={() => navigation.navigate('Login', { mode: 'login' })}
                                    style={{ borderRadius: 14 }}
                                >
                                    <Text color="white" fontWeight="600" fontSize="$5">Dang nhap</Text>
                                </Button>
                            </YStack>
                        </Animated.View>
                    </YStack>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}
