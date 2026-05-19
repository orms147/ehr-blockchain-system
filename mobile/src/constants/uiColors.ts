// Brand "ViEH" tokens — Tầng 3 redesign + Phase G.4 light mode (2026-05-19).
//
// Source of truth: .design-bundle/reconciliation/viehp-g-pack-system.html §2.
// Both palettes (DARK + LIGHT) share the same 30+ token names; light is the
// inverse of dark on the surface elevation axis. Tertiary (jade) and *_FIXED
// tokens stay constant across themes.
//
// Cinnabar is reserved for legal-action moments (~3% pixel coverage). The
// LIGHT mode darkens cinnabar slightly (#C54A30) for contrast on rice paper.
//
// Usage:
//   - Hook-based (preferred, theme-aware): `useEhrPalette()` returns active palette
//   - Constant import (backward compat, always DARK): `import { EHR_PRIMARY } from ...`
//
// New screens should consume the hook. Existing screens stay dark until ported.

import { useColorScheme } from 'react-native';
import { useThemePreference } from './themeContext';

// ============ DARK palette (default) ============
export const DARK = {
    // surfaces
    EHR_SURFACE: '#0F1419',
    EHR_SURFACE_LOWEST: '#08080C',
    EHR_SURFACE_LOW: '#12181E',
    EHR_SURFACE_CONTAINER: '#181E25',
    EHR_SURFACE_HIGH: '#222831',
    EHR_SURFACE_HIGHEST: '#2A323D',
    EHR_SURFACE_DIM: '#0B0F13',

    // primary (cinnabar)
    EHR_PRIMARY: '#D45A3F',
    EHR_PRIMARY_CONTAINER: '#4A1D14',
    EHR_PRIMARY_FIXED: '#F2C7B8',
    EHR_PRIMARY_FIXED_DIM: '#E8A893',
    EHR_ON_PRIMARY: '#FBF8F1',
    EHR_ON_PRIMARY_CONTAINER: '#FFC4B0',
    EHR_ON_PRIMARY_FIXED_VARIANT: '#6E2A1B',

    // secondary (slate)
    EHR_SECONDARY: '#8B8FA3',
    EHR_SECONDARY_CONTAINER: '#2A2E38',
    EHR_ON_SECONDARY_CONTAINER: '#D5D8E2',

    // tertiary (jade — fixed across themes)
    EHR_TERTIARY: '#7BA88A',
    EHR_TERTIARY_FIXED: '#C2D9C9',
    EHR_ON_TERTIARY_FIXED: '#2A4536',

    // text + outlines
    EHR_ON_SURFACE: '#EDE7D9',
    EHR_ON_SURFACE_VARIANT: '#A09B8E',
    EHR_OUTLINE: '#2F3741',
    EHR_OUTLINE_VARIANT: '#252C35',
    EHR_OUTLINE_SOFT: '#1B2128',

    // status
    EHR_SUCCESS: '#7BA88A',
    EHR_WARNING: '#D4A24C',
    EHR_DANGER: '#C94637',
    EHR_ERROR: '#E07868',
    EHR_ERROR_CONTAINER: '#3D1612',

    // alias
    EHR_SLATE: '#8B8FA3',

    // shadows
    EHR_SHADOW: 'rgba(0,0,0,0.6)',
    EHR_SHADOW_SOFT: 'rgba(0,0,0,0.3)',
} as const;

// ============ LIGHT palette (rice paper) ============
export const LIGHT = {
    EHR_SURFACE: '#F5F2EC',
    EHR_SURFACE_LOWEST: '#EFEAE0',
    EHR_SURFACE_LOW: '#F0EBE0',
    EHR_SURFACE_CONTAINER: '#FBF8F1',
    EHR_SURFACE_HIGH: '#FFFFFF',
    EHR_SURFACE_HIGHEST: '#FFFEFB',
    EHR_SURFACE_DIM: '#E8E1D2',

    EHR_PRIMARY: '#C54A30',
    EHR_PRIMARY_CONTAINER: '#F8DDD0',
    EHR_PRIMARY_FIXED: '#F2C7B8',
    EHR_PRIMARY_FIXED_DIM: '#E8A893',
    EHR_ON_PRIMARY: '#FFFFFF',
    EHR_ON_PRIMARY_CONTAINER: '#6E2A1B',
    EHR_ON_PRIMARY_FIXED_VARIANT: '#6E2A1B',

    EHR_SECONDARY: '#6B6F83',
    EHR_SECONDARY_CONTAINER: '#E0E1E8',
    EHR_ON_SECONDARY_CONTAINER: '#2B2E3B',

    EHR_TERTIARY: '#4F8166',
    EHR_TERTIARY_FIXED: '#C2D9C9',
    EHR_ON_TERTIARY_FIXED: '#2A4536',

    EHR_ON_SURFACE: '#0F1419',
    EHR_ON_SURFACE_VARIANT: '#5C5C66',
    EHR_OUTLINE: '#DCD5C4',
    EHR_OUTLINE_VARIANT: '#E6DFCE',
    EHR_OUTLINE_SOFT: '#EBE6D8',

    EHR_SUCCESS: '#4F8166',
    EHR_WARNING: '#A57A2C',
    EHR_DANGER: '#A53420',
    EHR_ERROR: '#A53420',
    EHR_ERROR_CONTAINER: '#F8DBD3',

    EHR_SLATE: '#6B6F83',

    EHR_SHADOW: 'rgba(15,20,25,0.15)',
    EHR_SHADOW_SOFT: 'rgba(15,20,25,0.08)',
} as const;

export type EhrPalette = typeof DARK;
export type ThemePreference = 'auto' | 'light' | 'dark';

/**
 * Hook returning the active palette based on (a) user override from
 * ThemeProvider and (b) OS color scheme. Falls back to dark when both unset.
 */
export function useEhrPalette(): EhrPalette {
    const scheme = useColorScheme();
    const { preference } = useThemePreference();
    const effective = preference === 'auto' ? (scheme ?? 'dark') : preference;
    return (effective === 'light' ? LIGHT : DARK) as EhrPalette;
}

// ============ Backward-compat exports — always DARK ============
// Existing screens import these as constants. They keep rendering dark until
// they are migrated to `useEhrPalette()`. New screens should use the hook.
export const EHR_SURFACE = DARK.EHR_SURFACE;
export const EHR_SURFACE_LOWEST = DARK.EHR_SURFACE_LOWEST;
export const EHR_SURFACE_LOW = DARK.EHR_SURFACE_LOW;
export const EHR_SURFACE_CONTAINER = DARK.EHR_SURFACE_CONTAINER;
export const EHR_SURFACE_HIGH = DARK.EHR_SURFACE_HIGH;
export const EHR_SURFACE_HIGHEST = DARK.EHR_SURFACE_HIGHEST;
export const EHR_SURFACE_DIM = DARK.EHR_SURFACE_DIM;

export const EHR_PRIMARY = DARK.EHR_PRIMARY;
export const EHR_PRIMARY_CONTAINER = DARK.EHR_PRIMARY_CONTAINER;
export const EHR_PRIMARY_FIXED = DARK.EHR_PRIMARY_FIXED;
export const EHR_PRIMARY_FIXED_DIM = DARK.EHR_PRIMARY_FIXED_DIM;
export const EHR_ON_PRIMARY = DARK.EHR_ON_PRIMARY;
export const EHR_ON_PRIMARY_CONTAINER = DARK.EHR_ON_PRIMARY_CONTAINER;
export const EHR_ON_PRIMARY_FIXED_VARIANT = DARK.EHR_ON_PRIMARY_FIXED_VARIANT;

export const EHR_SECONDARY = DARK.EHR_SECONDARY;
export const EHR_SECONDARY_CONTAINER = DARK.EHR_SECONDARY_CONTAINER;
export const EHR_ON_SECONDARY_CONTAINER = DARK.EHR_ON_SECONDARY_CONTAINER;

export const EHR_TERTIARY = DARK.EHR_TERTIARY;
export const EHR_TERTIARY_FIXED = DARK.EHR_TERTIARY_FIXED;
export const EHR_ON_TERTIARY_FIXED = DARK.EHR_ON_TERTIARY_FIXED;

export const EHR_ON_SURFACE = DARK.EHR_ON_SURFACE;
export const EHR_ON_SURFACE_VARIANT = DARK.EHR_ON_SURFACE_VARIANT;
export const EHR_OUTLINE = DARK.EHR_OUTLINE;
export const EHR_OUTLINE_VARIANT = DARK.EHR_OUTLINE_VARIANT;
export const EHR_OUTLINE_SOFT = DARK.EHR_OUTLINE_SOFT;

export const EHR_SUCCESS = DARK.EHR_SUCCESS;
export const EHR_WARNING = DARK.EHR_WARNING;
export const EHR_DANGER = DARK.EHR_DANGER;
export const EHR_ERROR = DARK.EHR_ERROR;
export const EHR_ERROR_CONTAINER = DARK.EHR_ERROR_CONTAINER;

export const EHR_SLATE = DARK.EHR_SLATE;

export const EHR_SHADOW = DARK.EHR_SHADOW;
export const EHR_SHADOW_SOFT = DARK.EHR_SHADOW_SOFT;
