import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import Constants from 'expo-constants';

// True when running inside Expo Go (not a dev/prod build)
const isExpoGo = Constants.appOwnership === 'expo';
// Social OAuth providers blocked in Expo Go (exp:// scheme rejected by Google/Apple)
const OAUTH_SOCIAL_PROVIDERS = new Set(['google', 'apple', 'twitter', 'facebook', 'discord']);
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome6 } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  ArrowLeft,
  Fingerprint,
  KeyRound,
  Mail,
  MessageSquareText,
  ShieldCheck,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react-native';

import useAuthStore from '../store/authStore';
import authService from '../services/auth.service';
import walletActionService from '../services/walletAction.service';

const PROVIDERS = [
  { key: 'google', label: 'Google', brandIcon: 'google' as const },
  { key: 'facebook', label: 'Facebook', brandIcon: 'facebook-f' as const },
  { key: 'twitter', label: 'X', brandIcon: 'x-twitter' as const },
  { key: 'apple', label: 'Apple', brandIcon: 'apple' as const },
  { key: 'discord', label: 'Discord', brandIcon: 'discord' as const },
  { key: 'email_passwordless', label: 'Email OTP', brandIcon: null },
  { key: 'sms_passwordless', label: 'SMS OTP', brandIcon: null },
] as const;

type ProviderKey = (typeof PROVIDERS)[number]['key'];

const WALLET_OPTIONS: Array<{
  id: string;
  title: string;
  subtitle: string;
  provider: ProviderKey;
  badge?: string;
  brandIcon?: 'google' | 'apple';
  icon?: 'mail' | 'message';
}> = [
  {
    id: 'wallet-google',
    title: 'Embedded Wallet',
    subtitle: 'Sign in with Google',
    provider: 'google',
    badge: 'Recommended',
    brandIcon: 'google',
  },
  {
    id: 'wallet-apple',
    title: 'Embedded Wallet',
    subtitle: 'Sign in with Apple',
    provider: 'apple',
    brandIcon: 'apple',
  },
  {
    id: 'wallet-email',
    title: 'Email OTP Wallet',
    subtitle: 'Passwordless via email code',
    provider: 'email_passwordless',
    icon: 'mail',
  },
  {
    id: 'wallet-sms',
    title: 'SMS OTP Wallet',
    subtitle: 'Passwordless via SMS code',
    provider: 'sms_passwordless',
    icon: 'message',
  },
];

export default function LoginScreen({ navigation }: any) {
  const [activeTab, setActiveTab] = useState<'social' | 'wallet'>('social');
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('google');
  const [showMoreSocial, setShowMoreSocial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const { login } = useAuthStore();

  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enterAnim, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enterAnim]);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setIsBiometricSupported(compatible);
    })();
  }, []);

  const selectedLabel = useMemo(
    () => PROVIDERS.find((p) => p.key === selectedProvider)?.label || 'Provider',
    [selectedProvider]
  );

  const topSocialProviders = PROVIDERS.filter(
    (p) => p.key === 'google' || p.key === 'twitter' || p.key === 'facebook'
  );
  const moreSocialProviders = PROVIDERS.filter(
    (p) => p.key !== 'google' && p.key !== 'twitter' && p.key !== 'facebook'
  );

  const handleWeb3Login = async (providerKey?: ProviderKey) => {
    const providerToUse = providerKey || selectedProvider;

    // Warn developers: Expo Go blocks Google/Apple OAuth (exp:// scheme not allowed)
    if (isExpoGo && OAUTH_SOCIAL_PROVIDERS.has(providerToUse)) {
      Alert.alert(
        'Ã¢Å¡Â Ã¯Â¸Â Expo Go Limitation',
        `"${providerToUse}" OAuth khÃƒÂ´ng hoÃ¡ÂºÂ¡t Ã„â€˜Ã¡Â»â„¢ng trong Expo Go vÃƒÂ¬ Google/Apple block URL exp://\n\nHÃƒÂ£y thÃ¡Â»Â­:\nÃ¢â‚¬Â¢ Email OTP (hoÃ¡ÂºÂ¡t Ã„â€˜Ã¡Â»â„¢ng Ã„â€˜Ã†Â°Ã¡Â»Â£c)\nÃ¢â‚¬Â¢ Build dev client: npx expo run:android`,
        [
          { text: 'DÃƒÂ¹ng Email OTP', onPress: () => handleWeb3Login('email_passwordless') },
          { text: 'Ã„ÂÃƒÂ³ng', style: 'cancel' },
        ]
      );
      return;
    }

    try {
      setLoading(true);
      setSelectedProvider(providerToUse);

      const { walletClient, address } = await walletActionService.loginWithWeb3Auth(providerToUse);
      const { message } = await authService.getNonce(address);
      const signature = await walletActionService.signMessage(walletClient, message);
      const loginResult = await authService.login(address, message, signature);

      if (loginResult.token) {
        await login(loginResult.token, loginResult.user, loginResult.user?.roles || ['patient']);
      }
    } catch (error: any) {
      console.error('Web3Auth Login error:', error);
      Alert.alert('Dang nhap that bai', error?.message || 'Loi khong xac dinh');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricAuth = async () => {
    try {
      const biometricAuth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Xac thuc sinh trac hoc',
        fallbackLabel: 'Su dung mat khau',
      });
      if (biometricAuth.success) {
        await handleWeb3Login();
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#F8FAF3', '#F2F4ED', '#ECEFE8']} style={StyleSheet.absoluteFillObject} />
      <View style={styles.bgBubbleTop} />
      <View style={styles.bgBubbleBottom} />

      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
            disabled={loading}
          >
            <ArrowLeft size={20} color="#334155" />
          </TouchableOpacity>

          <Animated.View
            style={[
              styles.card,
              {
                opacity: enterAnim,
                transform: [
                  {
                    translateY: enterAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.logoWrap}>
              <ShieldCheck size={30} color="#55624D" />
            </View>

            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Secure access to your health records</Text>

            <View style={styles.segmentWrap}>
              <TouchableOpacity
                style={[styles.segmentBtn, activeTab === 'social' && styles.segmentBtnActive]}
                onPress={() => setActiveTab('social')}
                activeOpacity={0.9}
              >
                <Text style={[styles.segmentText, activeTab === 'social' && styles.segmentTextActive]}>
                  Social Login
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentBtn, activeTab === 'wallet' && styles.segmentBtnActive]}
                onPress={() => setActiveTab('wallet')}
                activeOpacity={0.9}
              >
                <Text style={[styles.segmentText, activeTab === 'wallet' && styles.segmentTextActive]}>
                  Web3 Wallet
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'social' ? (
              <>
                <Text style={styles.sectionLabel}>CHOOSE LOGIN METHOD</Text>

                <View style={styles.socialTopRow}>
                  {topSocialProviders.map((provider) => {
                    const active = selectedProvider === provider.key;
                    return (
                      <TouchableOpacity
                        key={provider.key}
                        style={[styles.iconOnlyBtn, active && styles.iconOnlyBtnActive]}
                        onPress={() => setSelectedProvider(provider.key)}
                        activeOpacity={0.9}
                        disabled={loading}
                      >
                        <FontAwesome6
                          name={provider.brandIcon}
                          size={19}
                          color={active ? '#FFFFFF' : '#334155'}
                        />
                      </TouchableOpacity>
                    );
                  })}

                  <TouchableOpacity
                    style={[styles.iconOnlyBtn, showMoreSocial && styles.iconOnlyBtnActive]}
                    onPress={() => setShowMoreSocial((prev) => !prev)}
                    activeOpacity={0.9}
                    disabled={loading}
                  >
                    <MoreHorizontal size={20} color={showMoreSocial ? '#FFFFFF' : '#334155'} />
                  </TouchableOpacity>
                </View>

                {showMoreSocial ? (
                  <View style={styles.chipRow}>
                    {moreSocialProviders.map((provider) => (
                      <TouchableOpacity
                        key={provider.key}
                        style={[
                          styles.chip,
                          selectedProvider === provider.key && styles.chipActive,
                        ]}
                        onPress={() => {
                          setSelectedProvider(provider.key);
                          setShowMoreSocial(false);
                        }}
                        activeOpacity={0.9}
                        disabled={loading}
                      >
                        <View style={styles.chipInner}>
                          {provider.brandIcon ? (
                            <FontAwesome6
                              name={provider.brandIcon}
                              size={12}
                              color={selectedProvider === provider.key ? '#3E4A37' : '#334155'}
                            />
                          ) : provider.key === 'email_passwordless' ? (
                            <Mail
                              size={12}
                              color={selectedProvider === provider.key ? '#3E4A37' : '#334155'}
                            />
                          ) : (
                            <MessageSquareText
                              size={12}
                              color={selectedProvider === provider.key ? '#3E4A37' : '#334155'}
                            />
                          )}
                          <Text
                            style={[
                              styles.chipText,
                              selectedProvider === provider.key && styles.chipTextActive,
                            ]}
                          >
                            {provider.label}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => handleWeb3Login()}
                  activeOpacity={0.9}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <KeyRound size={18} color="#FFFFFF" />
                      <Text style={styles.primaryBtnText}>Continue with {selectedLabel}</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => handleWeb3Login('email_passwordless')}
                  activeOpacity={0.9}
                  disabled={loading}
                >
                  <Mail size={18} color="#55624D" />
                  <Text style={styles.secondaryBtnText}>Continue with Email / Phone</Text>
                </TouchableOpacity>

                {isBiometricSupported ? (
                  <TouchableOpacity
                    style={styles.bioBtn}
                    onPress={handleBiometricAuth}
                    activeOpacity={0.9}
                    disabled={loading}
                  >
                    <Fingerprint size={19} color="#55624D" />
                    <Text style={styles.bioBtnText}>Biometric Login</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>WALLET OPTIONS</Text>
                <View style={styles.walletList}>
                  {WALLET_OPTIONS.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.walletItem}
                      onPress={() => handleWeb3Login(item.provider)}
                      activeOpacity={0.9}
                      disabled={loading}
                    >
                      <View style={styles.walletLeft}>
                        <View style={styles.walletIconWrap}>
                          {item.brandIcon ? (
                            <FontAwesome6 name={item.brandIcon} size={16} color="#55624D" />
                          ) : item.icon === 'mail' ? (
                            <Mail size={16} color="#55624D" />
                          ) : (
                            <MessageSquareText size={16} color="#55624D" />
                          )}
                        </View>
                        <View>
                          <Text style={styles.walletTitle}>{item.title}</Text>
                          <Text style={styles.walletSubtitle}>{item.subtitle}</Text>
                        </View>
                      </View>

                      {item.badge ? (
                        <View style={styles.badgeWrap}>
                          <Text style={styles.badgeText}>{item.badge}</Text>
                        </View>
                      ) : (
                        <ChevronRight size={18} color="#64748B" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </Animated.View>

          <Text style={styles.footerText}>
            By signing in, you agree to our Terms of Service and Privacy Policy
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ECEFE8' },
  safe: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  bgBubbleTop: {
    position: 'absolute',
    top: -110,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 160,
    backgroundColor: 'rgba(85, 98, 77, 0.14)',
  },
  bgBubbleBottom: {
    position: 'absolute',
    bottom: -140,
    left: -120,
    width: 300,
    height: 300,
    borderRadius: 180,
    backgroundColor: 'rgba(152, 166, 142, 0.16)',
  },
  backBtn: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  card: {
    marginTop: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  logoWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#D9E7CD',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
  },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#55624D',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#55624D',
    textAlign: 'center',
    marginBottom: 10,
  },
  socialTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconOnlyBtn: {
    width: '23.5%',
    height: 60,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOnlyBtnActive: {
    backgroundColor: '#55624D',
    borderColor: '#55624D',
  },
  providerBtn: {
    width: '47.5%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  providerBtnActive: {
    backgroundColor: '#55624D',
    borderColor: '#55624D',
  },
  providerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  providerTextActive: {
    color: '#FFFFFF',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  chipActive: {
    backgroundColor: '#D9E7CD',
    borderColor: '#60A5FA',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  chipTextActive: {
    color: '#3E4A37',
  },
  chipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtn: {
    marginTop: 2,
    borderRadius: 14,
    backgroundColor: '#55624D',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BDCBB2',
    backgroundColor: '#F2F4ED',
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  bioBtn: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#98A68E',
    backgroundColor: '#D9E7CD',
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  bioBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#55624D',
  },
  walletList: {
    gap: 10,
  },
  walletItem: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  walletLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  walletIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#D9E7CD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  walletSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  badgeWrap: {
    backgroundColor: '#D9E7CD',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    color: '#55624D',
    fontWeight: '700',
  },
  footerText: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 12,
    color: '#475569',
    paddingHorizontal: 8,
  },
});

