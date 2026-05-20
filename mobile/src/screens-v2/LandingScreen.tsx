// LandingScreen v2 — port of .design-bundle/project/screens-patient.jsx
// OnboardingScreen step 0 (the "ink + paper" splash).
//
// Behaviour preserved from screens/LandingScreen.tsx:
//   - "Bắt đầu" → navigation.navigate('Login')
//   - "Tôi đã có tài khoản" → navigation.navigate('Login', { mode: 'login' })
// Visual replaced: gone are the feature cards / animated flourishes; the
// design uses a single quiet wordmark + serif headline + neutral CTAs.
// Cinnabar is intentionally absent here — first run has no legal action yet.

import React from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, YStack } from 'tamagui';

import ViWordmark from '../components-v2/ViWordmark';
import { useEhrPalette } from '../constants/uiColors';

export default function LandingScreen({ navigation }: any) {
    const palette = useEhrPalette();
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }}>
            <View
                style={{
                    flex: 1,
                    paddingHorizontal: 28,
                    paddingTop: 60,
                    paddingBottom: 28,
                }}
            >
                {/* Wordmark + serif tagline take vertical center */}
                <YStack style={{ flex: 1, justifyContent: 'center' }}>
                    <ViWordmark size={56} color={palette.EHR_ON_SURFACE} />

                    <Text
                        style={{
                            marginTop: 28,
                            fontFamily: 'Fraunces_500Medium',
                            fontSize: 28,
                            lineHeight: 33,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.4,
                        }}
                    >
                        Hồ sơ của bạn.{'\n'}
                        <Text style={{ fontFamily: 'Fraunces_400Regular_Italic', fontStyle: 'italic' }}>
                            Chữ ký
                        </Text>{' '}
                        của bạn.
                    </Text>

                    <Text
                        style={{
                            marginTop: 18,
                            fontFamily: 'DMSans_400Regular',
                            fontSize: 14.5,
                            lineHeight: 24,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            maxWidth: 320,
                        }}
                    >
                        Một nơi giữ hồ sơ y tế của bạn. Chỉ những người bạn đồng ý mới có thể xem.
                    </Text>
                </YStack>

                {/* CTAs — no cinnabar; this is the moment before legal action */}
                <YStack style={{ gap: 12 }}>
                    <Pressable
                        onPress={() => navigation.navigate('Login')}
                        style={({ pressed }) => ({
                            paddingVertical: 16,
                            paddingHorizontal: 18,
                            backgroundColor: palette.EHR_ON_SURFACE,
                            borderRadius: 12,
                            alignItems: 'center',
                            transform: [{ scale: pressed ? 0.985 : 1 }],
                            opacity: pressed ? 0.9 : 1,
                        })}
                    >
                        <Text
                            style={{
                                color: palette.EHR_SURFACE,
                                fontFamily: 'DMSans_600SemiBold',
                                fontSize: 16,
                                letterSpacing: 0.1,
                            }}
                        >
                            Bắt đầu
                        </Text>
                    </Pressable>

                    <Pressable
                        onPress={() => navigation.navigate('Login', { mode: 'login' })}
                        style={({ pressed }) => ({
                            paddingVertical: 14,
                            paddingHorizontal: 18,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            borderColor: palette.EHR_OUTLINE_VARIANT,
                            borderWidth: 0.75,
                            borderRadius: 12,
                            alignItems: 'center',
                            transform: [{ scale: pressed ? 0.985 : 1 }],
                        })}
                    >
                        <Text
                            style={{
                                color: palette.EHR_ON_SURFACE,
                                fontFamily: 'DMSans_500Medium',
                                fontSize: 14,
                                letterSpacing: 0.1,
                            }}
                        >
                            Tôi đã có tài khoản
                        </Text>
                    </Pressable>

                    <Text
                        style={{
                            fontFamily: 'DMSans_400Regular',
                            fontSize: 11.5,
                            color: palette.EHR_OUTLINE,
                            textAlign: 'center',
                            lineHeight: 18,
                            paddingHorizontal: 12,
                            marginTop: 4,
                        }}
                    >
                        Bằng cách tiếp tục, bạn đồng ý với{' '}
                        <Text style={{ color: palette.EHR_ON_SURFACE_VARIANT, textDecorationLine: 'underline' }}>
                            Điều khoản
                        </Text>{' '}
                        và{' '}
                        <Text style={{ color: palette.EHR_ON_SURFACE_VARIANT, textDecorationLine: 'underline' }}>
                            Chính sách quyền riêng tư
                        </Text>
                        .
                    </Text>
                </YStack>
            </View>
        </SafeAreaView>
    );
}
