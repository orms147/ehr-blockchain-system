import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  interpolate,
} from 'react-native-reanimated';
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
  Mail,
  MessageSquareText,
  ShieldCheck,
  ChevronRight,
  HeartPulse,
  Lock,
  Wallet,
  ShieldOff,
} from 'lucide-react-native';

import useAuthStore from '../store/authStore';
import authService from '../services/auth.service';
import walletActionService from '../services/walletAction.service';
import { getOrCreateEncryptionKeypair } from '../services/nacl-crypto';
import { deriveRolesFromUser } from '../utils/authRoles';
import {
  EHR_PRIMARY,
  EHR_PRIMARY_CONTAINER,
  EHR_PRIMARY_FIXED,
  EHR_ON_PRIMARY,
  EHR_ON_PRIMARY_CONTAINER,
  EHR_SURFACE,
  EHR_SURFACE_LOWEST,
  EHR_SURFACE_LOW,
  EHR_SURFACE_CONTAINER,
  EHR_ON_SURFACE,
  EHR_ON_SURFACE_VARIANT,
  EHR_OUTLINE_VARIANT,
} from '../constants/uiColors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PROVIDERS = [
  { key: 'google', label: 'Google', brandIcon: 'google' as const },
  { key: 'facebook', label: 'Facebook', brandIcon: 'facebook-f' as const },
  { key: 'twitter', label: 'X', brandIcon: 'x-twitter' as const },
  { key: 'apple', label: 'Apple ID', brandIcon: 'apple' as const },
  { key: 'discord', label: 'Discord', brandIcon: 'discord' as const },
  { key: 'email_passwordless', label: 'Email OTP', brandIcon: null },
  { key: 'sms_passwordless', label: 'SMS OTP', brandIcon: null },
] as const;

type ProviderKey = (typeof PROVIDERS)[number]['key'];

const SOCIAL_GRID = [
  { key: 'google' as ProviderKey, label: 'Google', brandIcon: 'google' as const, lucideIcon: null },
  { key: 'apple' as ProviderKey, label: 'Apple ID', brandIcon: 'apple' as const, lucideIcon: null },
  { key: 'twitter' as ProviderKey, label: 'X Twitter', brandIcon: 'x-twitter' as const, lucideIcon: null },
  { key: 'facebook' as ProviderKey, label: 'Facebook', brandIcon: 'facebook-f' as const, lucideIcon: null },
  { key: 'email_passwordless' as ProviderKey, label: 'Email OTP', brandIcon: null, lucideIcon: 'mail' as const },
  { key: 'sms_passwordless' as ProviderKey, label: 'SMS OTP', brandIcon: null, lucideIcon: 'sms' as const },
];

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

  const enterProgress = useSharedValue(0);
  const logoEnter = useSharedValue(0);

  useEffect(() => {
    enterProgress.value = withSpring(1, { damping: 16, stiffness: 90, mass: 0.9 });
    logoEnter.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 100, mass: 0.7 }));
  }, []);

  const cardAnimStyle = useAnimatedStyle(() => {
    const translateY = interpolate(enterProgress.value, [0, 1], [40, 0]);
    const opacity = interpolate(enterProgress.value, [0, 0.3, 1], [0, 0.5, 1]);
    const rotateX = `${interpolate(enterProgress.value, [0, 1], [12, 0])}deg`;
    const scale = interpolate(enterProgress.value, [0, 1], [0.92, 1]);

    return {
      opacity,
      transform: [
        { perspective: 1200 },
        { translateY },
        { rotateX },
        { scale },
      ],
    };
  });

  const logoAnimStyle = useAnimatedStyle(() => {
    const scale = interpolate(logoEnter.value, [0, 1], [0.3, 1]);
    const rotate = `${interpolate(logoEnter.value, [0, 1], [-180, 0])}deg`;
    const opacity = interpolate(logoEnter.value, [0, 0.5, 1], [0, 0.8, 1]);

    return {
      opacity,
      transform: [{ scale }, { rotateY: rotate }],
    };
  });

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

  const shouldRetryAuthStep = (error: any) => {
    if (!error) return false;

    if (error?.code === 'BACKEND_UNREACHABLE') return true;

    const status = Number(error?.status || 0);
    if (status >= 500) return true;

    const raw = String(error?.message || '').toLowerCase();
    return raw.includes('qua thoi gian')
      || raw.includes('timeout')
      || raw.includes('timed out')
      || raw.includes('failed to fetch')
      || raw.includes('network');
  };

  const runAuthStepWithRetry = async <T,>(task: () => Promise<T>, retries = 1): Promise<T> => {
    let lastError: any = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await task();
      } catch (error: any) {
        lastError = error;
        const canRetry = attempt < retries && shouldRetryAuthStep(error);
        if (!canRetry) break;

        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    throw lastError;
  };

  const handleWeb3Login = async (providerKey?: ProviderKey) => {
    const providerToUse = providerKey || selectedProvider;

    // Warn developers: Expo Go blocks Google/Apple OAuth (exp:// scheme not allowed)
    if (isExpoGo && OAUTH_SOCIAL_PROVIDERS.has(providerToUse)) {
      Alert.alert(
        'Expo Go limitation',
        `"${providerToUse}" OAuth khong hoat dong trong Expo Go vi Google/Apple chan URL exp://\n\nHay thu:\n- Email OTP (hoat dong trong Expo Go)\n- Build dev client: npx expo run:android`,
        [
          { text: 'Dung Email OTP', onPress: () => handleWeb3Login('email_passwordless') },
          { text: 'Dong', style: 'cancel' },
        ]
      );
      return;
    }

    try {
      setLoading(true);
      setSelectedProvider(providerToUse);

      await walletActionService.ensureWeb3AuthReady();
      const { walletClient, address } = await walletActionService.loginWithWeb3Auth(providerToUse);

      await runAuthStepWithRetry(() => authService.ping(), 1);

      const nonceRes = await runAuthStepWithRetry(() => authService.getNonce(address), 1);
      const message = nonceRes?.message;

      if (!message) {
        throw new Error('Khong lay duoc nonce tu backend.');
      }

      const signature = await walletActionService.signMessage(walletClient, message);
      const loginResult = await runAuthStepWithRetry(() => authService.login(address, message, signature), 1);

      if (!loginResult?.token) {
        throw new Error('Backend khong tra ve token dang nhap hop le.');
      }

      const availableRoles = deriveRolesFromUser(loginResult.user);
      await login(loginResult.token, loginResult.user, availableRoles);

      // Register NaCl encryption public key with backend so others can share records with this user
      try {
        const keypair = await getOrCreateEncryptionKeypair(walletClient, address);
        const regMessage = `Register EHR encryption key: ${keypair.publicKey.substring(0, 20)}`;
        const regSignature = await walletActionService.signMessage(walletClient, regMessage);
        await authService.registerEncryptionKey(keypair.publicKey, regSignature, regMessage);
      } catch (keyErr) {
        console.warn('[Login] Failed to register encryption public key:', keyErr);
      }
    } catch (error: any) {
      console.error('Web3Auth Login error:', error);

      const raw = String(error?.message || '').toLowerCase();
      let message = error?.message || 'Loi khong xac dinh';

      if (error?.code === 'BACKEND_UNREACHABLE') {
        message = 'Khong ket noi duoc backend. Hay bat backend va kiem tra EXPO_PUBLIC_API_URL.';
      } else if (raw.includes('cannot connect to expo cli') || raw.includes('could not load bundle')) {
        message = 'Ung dung khong ket noi duoc Metro. Hay chay expo start va adb reverse tcp:8081 tcp:8081 roi thu lai.';
      }

      Alert.alert('Dang nhap that bai', message);
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

  const renderSocialGridItem = (item: typeof SOCIAL_GRID[number]) => {
    const active = selectedProvider === item.key;
    return (
      <TouchableOpacity
        key={item.key}
        style={[styles.gridCard, active && styles.gridCardActive]}
        onPress={() => {
          setSelectedProvider(item.key);
          handleWeb3Login(item.key);
        }}
        activeOpacity={0.85}
        disabled={loading}
      >
        <View style={[styles.gridIconWrap, active && styles.gridIconWrapActive]}>
          {item.brandIcon ? (
            <FontAwesome6
              name={item.brandIcon}
              size={20}
              color={active ? EHR_ON_PRIMARY : EHR_ON_PRIMARY_CONTAINER}
            />
          ) : item.lucideIcon === 'mail' ? (
            <Mail size={20} color={active ? EHR_ON_PRIMARY : EHR_ON_PRIMARY_CONTAINER} />
          ) : (
            <MessageSquareText size={20} color={active ? EHR_ON_PRIMARY : EHR_ON_PRIMARY_CONTAINER} />
          )}
        </View>
        <Text style={[styles.gridLabel, active && styles.gridLabelActive]} numberOfLines={1}>
          {item.label}
        </Text>
        {loading && selectedProvider === item.key && (
          <ActivityIndicator
            size="small"
            color={EHR_PRIMARY}
            style={{ position: 'absolute', top: 6, right: 6 }}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[EHR_SURFACE, EHR_SURFACE_LOW, EHR_SURFACE_CONTAINER]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Blurred gradient background circles */}
      <View style={styles.bgBubbleTop} />
      <View style={styles.bgBubbleBottom} />
      <View style={styles.bgBubbleAccent} />

      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Glass-effect header bar */}
          <View style={styles.headerBar}>
            <View style={styles.headerLeft}>
              <View style={styles.headerLogoWrap}>
                <HeartPulse size={18} color={EHR_ON_PRIMARY} />
              </View>
              <Text style={styles.headerBrand}>EHR Chain Mobile</Text>
            </View>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.8}
              disabled={loading}
            >
              <ArrowLeft size={18} color={EHR_ON_SURFACE_VARIANT} />
            </TouchableOpacity>
          </View>

          {/* Main animated card */}
          <ReAnimated.View style={[styles.card, cardAnimStyle]}>
            {/* Logo */}
            <ReAnimated.View style={[styles.logoWrap, logoAnimStyle]}>
              <ShieldCheck size={32} color={EHR_PRIMARY} />
            </ReAnimated.View>

            <Text style={styles.title}>Chao mung tro lai</Text>
            <Text style={styles.subtitle}>
              Truy cap ho so y te bao mat cua ban thong qua so cai EHR Chain.
            </Text>

            {/* Segment control */}
            <View style={styles.segmentWrap}>
              <TouchableOpacity
                style={[styles.segmentBtn, activeTab === 'social' && styles.segmentBtnActive]}
                onPress={() => setActiveTab('social')}
                activeOpacity={0.9}
              >
                <Text style={[styles.segmentText, activeTab === 'social' && styles.segmentTextActive]}>
                  Dang nhap xa hoi
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.segmentBtn, activeTab === 'wallet' && styles.segmentBtnActive]}
                onPress={() => setActiveTab('wallet')}
                activeOpacity={0.9}
              >
                <Text style={[styles.segmentText, activeTab === 'wallet' && styles.segmentTextActive]}>
                  Vi Web3
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'social' ? (
              <>
                <Text style={styles.sectionLabel}>CHON PHUONG THUC DANG NHAP</Text>

                {/* 2x3 Social Grid */}
                <View style={styles.socialGrid}>
                  {SOCIAL_GRID.map(renderSocialGridItem)}
                </View>

                {/* Biometric button */}
                {isBiometricSupported ? (
                  <TouchableOpacity
                    style={styles.bioBtn}
                    onPress={handleBiometricAuth}
                    activeOpacity={0.85}
                    disabled={loading}
                  >
                    <Fingerprint size={19} color={EHR_PRIMARY} />
                    <Text style={styles.bioBtnText}>Dang nhap sinh trac hoc</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Divider */}
                <View style={styles.dividerWrap}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>Hoac dang nhap Web3</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Full-width gradient blockchain wallet button */}
                <TouchableOpacity
                  style={styles.walletGradientBtn}
                  onPress={() => setActiveTab('wallet')}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={[EHR_PRIMARY, EHR_ON_PRIMARY_CONTAINER]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.walletGradientInner}
                  >
                    <Wallet size={20} color={EHR_ON_PRIMARY} />
                    <Text style={styles.walletGradientText}>Ket noi Vi Blockchain</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>TUY CHON VI</Text>
                <View style={styles.walletList}>
                  {WALLET_OPTIONS.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.walletItem}
                      onPress={() => handleWeb3Login(item.provider)}
                      activeOpacity={0.85}
                      disabled={loading}
                    >
                      <View style={styles.walletLeft}>
                        <View style={styles.walletIconWrap}>
                          {item.brandIcon ? (
                            <FontAwesome6 name={item.brandIcon} size={16} color={EHR_PRIMARY} />
                          ) : item.icon === 'mail' ? (
                            <Mail size={16} color={EHR_PRIMARY} />
                          ) : (
                            <MessageSquareText size={16} color={EHR_PRIMARY} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.walletTitle}>{item.title}</Text>
                          <Text style={styles.walletSubtitle}>{item.subtitle}</Text>
                        </View>
                      </View>

                      {item.badge ? (
                        <View style={styles.badgeWrap}>
                          <Text style={styles.badgeText}>{item.badge}</Text>
                        </View>
                      ) : (
                        <ChevronRight size={18} color={EHR_ON_SURFACE_VARIANT} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </ReAnimated.View>

          {/* Trust badges */}
          <View style={styles.trustRow}>
            <View style={styles.trustBadge}>
              <Lock size={13} color={EHR_PRIMARY} />
              <Text style={styles.trustText}>Ma hoa dau cuoi</Text>
            </View>
            <View style={styles.trustBadge}>
              <ShieldOff size={13} color={EHR_PRIMARY} />
              <Text style={styles.trustText}>Khong luu mat khau</Text>
            </View>
          </View>

          {/* Footer */}
          <Text style={styles.footerText}>
            Bang viec dang nhap, ban dong y voi Dieu khoan Dich vu va Chinh sach Bao mat cua chung
            toi.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const GRID_GAP = 10;
const GRID_COLS = 3;
const CARD_HPAD = 22;
// Approximate card width for grid calculation
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - 40 - CARD_HPAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: EHR_SURFACE_CONTAINER,
  },
  safe: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },

  /* ---- Background blurred circles ---- */
  bgBubbleTop: {
    position: 'absolute',
    top: -100,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(85, 98, 77, 0.12)',
  },
  bgBubbleBottom: {
    position: 'absolute',
    bottom: -120,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(152, 166, 142, 0.14)',
  },
  bgBubbleAccent: {
    position: 'absolute',
    top: '40%',
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(117, 87, 84, 0.07)',
  },

  /* ---- Glass header bar ---- */
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogoWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: EHR_PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBrand: {
    fontSize: 16,
    fontWeight: '700',
    color: EHR_ON_SURFACE,
    letterSpacing: 0.2,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${EHR_SURFACE_LOWEST}CC`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: EHR_OUTLINE_VARIANT,
  },

  /* ---- Main card ---- */
  card: {
    backgroundColor: `${EHR_SURFACE_LOWEST}F2`,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: EHR_OUTLINE_VARIANT,
    paddingHorizontal: CARD_HPAD,
    paddingTop: 28,
    paddingBottom: 24,
    shadowColor: EHR_ON_SURFACE,
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },

  /* ---- Logo ---- */
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: EHR_PRIMARY_FIXED,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: EHR_PRIMARY_CONTAINER,
  },

  /* ---- Title / Subtitle ---- */
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: EHR_ON_SURFACE,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 14,
    lineHeight: 20,
    color: EHR_ON_SURFACE_VARIANT,
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  /* ---- Segment control ---- */
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: EHR_SURFACE_CONTAINER,
    borderRadius: 16,
    padding: 4,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: EHR_OUTLINE_VARIANT,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: EHR_PRIMARY,
    shadowColor: EHR_ON_SURFACE,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: EHR_ON_SURFACE_VARIANT,
  },
  segmentTextActive: {
    color: EHR_ON_PRIMARY,
  },

  /* ---- Section label ---- */
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: EHR_PRIMARY_CONTAINER,
    textAlign: 'center',
    marginBottom: 14,
    textTransform: 'uppercase',
  },

  /* ---- 2x3 Social grid ---- */
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    marginBottom: 14,
  },
  gridCard: {
    width: GRID_ITEM_WIDTH,
    backgroundColor: EHR_SURFACE_LOWEST,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: EHR_OUTLINE_VARIANT,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: EHR_ON_SURFACE,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  gridCardActive: {
    borderColor: EHR_PRIMARY,
    borderWidth: 2,
    backgroundColor: EHR_PRIMARY_FIXED,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  gridIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: EHR_PRIMARY_FIXED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridIconWrapActive: {
    backgroundColor: EHR_PRIMARY,
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: EHR_ON_SURFACE_VARIANT,
    textAlign: 'center',
  },
  gridLabelActive: {
    color: EHR_ON_PRIMARY_CONTAINER,
    fontWeight: '700',
  },

  /* ---- Biometric button ---- */
  bioBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EHR_PRIMARY_CONTAINER,
    backgroundColor: EHR_PRIMARY_FIXED,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  bioBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: EHR_PRIMARY,
  },

  /* ---- Divider ---- */
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: EHR_OUTLINE_VARIANT,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: EHR_ON_SURFACE_VARIANT,
  },

  /* ---- Gradient wallet CTA button ---- */
  walletGradientBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: EHR_ON_SURFACE,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  walletGradientInner: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  walletGradientText: {
    fontSize: 15,
    fontWeight: '800',
    color: EHR_ON_PRIMARY,
    letterSpacing: 0.2,
  },

  /* ---- Wallet tab list ---- */
  walletList: {
    gap: 10,
  },
  walletItem: {
    borderWidth: 1,
    borderColor: EHR_OUTLINE_VARIANT,
    backgroundColor: EHR_SURFACE_LOWEST,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: EHR_ON_SURFACE,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  walletLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  walletIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: EHR_PRIMARY_FIXED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: EHR_ON_SURFACE,
  },
  walletSubtitle: {
    fontSize: 12,
    color: EHR_ON_SURFACE_VARIANT,
    marginTop: 2,
  },
  badgeWrap: {
    backgroundColor: EHR_PRIMARY_FIXED,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: EHR_PRIMARY_CONTAINER,
  },
  badgeText: {
    fontSize: 10,
    color: EHR_PRIMARY,
    fontWeight: '700',
  },

  /* ---- Trust badges ---- */
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: 20,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${EHR_SURFACE_LOWEST}E6`,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: EHR_OUTLINE_VARIANT,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '600',
    color: EHR_ON_SURFACE_VARIANT,
  },

  /* ---- Footer ---- */
  footerText: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 12,
    color: EHR_ON_SURFACE_VARIANT,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
});
