import { defaultConfig } from '@tamagui/config/v5'
import { createTamagui, createFont } from 'tamagui'

// Brand "ViEH" — S18 redesign tokens (2026-05-04, Tầng 2 pre-flight).
//
// Cinnabar #E63946 is reserved for moments of legal action (signing consent,
// adding a Trusted Contact, calling an emergency contact). Using it for
// generic CTAs erodes its meaning, so screens default to neutral surfaces
// and bring cinnabar in only at the action button.
//
// Dark mode is the design default. Patient demographics skew young-pro and
// the brand brief explicitly calls for it. We respect the system color
// scheme as a light-mode override.
export const CINNABAR = '#E63946'
export const CINNABAR_FIXED = '#3A1414'  // surface tint for cinnabar buttons in dark mode

// ============ FONTS ============
//
// Heading: Fraunces serif (400/500/600/700 + 400 italic).
// Body:    DM Sans (400/500/600/700).
// Fallback (Vietnamese diacritics): Be Vietnam Pro for sans, Noto Serif for serif.
//
// Why fallbacks: Fraunces glyphs cover Latin Extended-A but combine VN tone
// marks via composite glyphs that some renderers fail to assemble cleanly.
// Be Vietnam Pro is purpose-built for Vietnamese; we list it AFTER the brand
// fonts so brand wins for ASCII text and only the diacritic-only glyphs
// fall through.

const headingFont = createFont({
  family: 'Fraunces_400Regular, NotoSerif_400Regular, Georgia, serif',
  size: {
    1: 11, 2: 12, 3: 14, 4: 16, 5: 18, 6: 20, 7: 24, 8: 30, 9: 36, 10: 48, 11: 60, 12: 72,
  },
  lineHeight: {
    1: 14, 2: 16, 3: 18, 4: 22, 5: 24, 6: 28, 7: 32, 8: 38, 9: 44, 10: 56, 11: 68, 12: 80,
  },
  weight: {
    4: '400', 5: '500', 6: '600', 7: '700',
  },
  face: {
    400: { normal: 'Fraunces_400Regular', italic: 'Fraunces_400Regular_Italic' },
    500: { normal: 'Fraunces_500Medium' },
    600: { normal: 'Fraunces_600SemiBold' },
    700: { normal: 'Fraunces_700Bold' },
  },
})

const bodyFont = createFont({
  family: 'DMSans_400Regular, BeVietnamPro_400Regular, system-ui, sans-serif',
  size: {
    1: 11, 2: 12, 3: 14, 4: 16, 5: 18, 6: 20, 7: 24, 8: 30, 9: 36, 10: 48, 11: 60, 12: 72,
  },
  lineHeight: {
    1: 14, 2: 16, 3: 18, 4: 22, 5: 24, 6: 28, 7: 32, 8: 38, 9: 44, 10: 56, 11: 68, 12: 80,
  },
  weight: {
    4: '400', 5: '500', 6: '600', 7: '700',
  },
  face: {
    400: { normal: 'DMSans_400Regular' },
    500: { normal: 'DMSans_500Medium' },
    600: { normal: 'DMSans_600SemiBold' },
    700: { normal: 'DMSans_700Bold' },
  },
})

// ============ THEMES ============

const lightTheme = {
  ...defaultConfig.themes.light,
  background: '#F8FAF3',
  color: '#191C18',
  borderColor: '#C5C8BE',
  color1: '#FFFFFF',
  color2: '#F2F4ED',
  color3: '#ECEFE8',
  color4: '#E7E9E2',
  color5: '#E1E3DC',
  color6: '#D8DBD4',
  color7: '#C5C8BE',
  color8: '#A4A298',
  color9: '#757870',
  color10: '#5E635A',
  color11: '#444841',
  color12: '#191C18',
  primary: CINNABAR,
  cinnabar: CINNABAR,
  cinnabarFixed: '#FCDDDF',
}

const darkTheme = {
  ...defaultConfig.themes.dark,
  background: '#0D0D0D',
  color: '#EFF2EA',
  borderColor: '#2A2A2A',
  color1: '#0D0D0D',
  color2: '#141414',
  color3: '#1A1A1A',
  color4: '#212121',
  color5: '#2A2A2A',
  color6: '#363636',
  color7: '#444444',
  color8: '#5C5C5C',
  color9: '#888888',
  color10: '#B0B0B0',
  color11: '#D4D4D4',
  color12: '#EFF2EA',
  primary: CINNABAR,
  cinnabar: CINNABAR,
  cinnabarFixed: CINNABAR_FIXED,
}

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  fonts: {
    ...defaultConfig.fonts,
    heading: headingFont,
    body: bodyFont,
  },
  themes: {
    ...defaultConfig.themes,
    light: lightTheme,
    dark: darkTheme,
  },
  defaultTheme: 'dark',
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
