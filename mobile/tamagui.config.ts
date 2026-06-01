import { defaultConfig } from '@tamagui/config/v5'
import { createTamagui, createFont } from 'tamagui'

// Brand "ViEH" — Tầng 3 redesign tokens (2026-05-07).
//
// Source: .design-bundle/project/tokens.jsx from Claude Design handoff
// (qFVplj_v4ZzjFd8o6_lHqA). Hex values match exactly. Three semantic
// accents — cinnabar for legal action, jade for medical-green, clay for
// warm-data.
//
// Cinnabar is reserved for moments of legal action (signing consent,
// adding a Trusted Contact, calling an emergency contact). Don't apply it
// to generic CTAs.
export const CINNABAR = '#D45A3F'
export const CINNABAR_DEEP = '#B84628'
export const CINNABAR_FIXED = '#3A1E18'  // surface tint for cinnabar buttons in dark
export const JADE = '#7BA88A'             // medical green — verified/active states
export const CLAY = '#D4A87C'             // warm data accent
export const SLATE = '#8B8FA3'            // info chips, non-action

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

// A11y elderly bump 2026-06-01: $1/$2/$3 +1pt + line-height bump.
// Pre-bump baseline: 11/12/14 (too small per WCAG AA for 50+ users).
// Post-bump: 12/13/15 (still hits brand visual hierarchy, more readable).
const headingFont = createFont({
  family: 'Fraunces_400Regular, NotoSerif_400Regular, Georgia, serif',
  size: {
    1: 12, 2: 13, 3: 15, 4: 16, 5: 18, 6: 20, 7: 24, 8: 30, 9: 36, 10: 48, 11: 60, 12: 72,
  },
  lineHeight: {
    1: 16, 2: 18, 3: 20, 4: 22, 5: 24, 6: 28, 7: 32, 8: 38, 9: 44, 10: 56, 11: 68, 12: 80,
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
    1: 12, 2: 13, 3: 15, 4: 16, 5: 18, 6: 20, 7: 24, 8: 30, 9: 36, 10: 48, 11: 60, 12: 72,
  },
  lineHeight: {
    1: 16, 2: 18, 3: 20, 4: 22, 5: 24, 6: 28, 7: 32, 8: 38, 9: 44, 10: 56, 11: 68, 12: 80,
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
  background: '#F5F2EC',
  color: '#0F1419',
  borderColor: '#DCD5C4',
  color1: '#FFFFFF',
  color2: '#FBF8F1',
  color3: '#F5F2EC',
  color4: '#EFEBE0',
  color5: '#E6DFCE',
  color6: '#DCD5C4',
  color7: '#C9C2AF',
  color8: '#A89F87',
  color9: '#8B8678',
  color10: '#6B6760',
  color11: '#3D3A33',
  color12: '#0F1419',
  primary: CINNABAR,
  cinnabar: CINNABAR,
  cinnabarFixed: '#FCDDDF',
  jade: JADE,
  clay: CLAY,
  slate: SLATE,
}

const darkTheme = {
  ...defaultConfig.themes.dark,
  background: '#0F1419',     // ink
  color: '#EDE7D9',          // paper-on-ink
  borderColor: '#2F3741',
  color1: '#0F1419',
  color2: '#181E25',         // surface
  color3: '#1D2530',
  color4: '#222831',         // elevated
  color5: '#2A323D',
  color6: '#2F3741',         // border
  color7: '#3A4350',
  color8: '#5C6470',
  color9: '#6B6760',         // textMuted
  color10: '#A09B8E',        // textSecondary
  color11: '#D0CABA',
  color12: '#EDE7D9',
  primary: CINNABAR,
  cinnabar: CINNABAR,
  cinnabarFixed: CINNABAR_FIXED,
  jade: JADE,
  clay: CLAY,
  slate: SLATE,
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
