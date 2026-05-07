// Brand "ViEH" tokens — Tầng 3 redesign port (2026-05-07).
//
// Source of truth: .design-bundle/project/tokens.jsx from Claude Design handoff
// (qFVplj_v4ZzjFd8o6_lHqA). Hex values match exactly. When the design picks
// new accents (jade for medical-green / clay for warm-data), they live here
// so screens-v2/ ports compose against the same surface.
//
// Cinnabar #D45A3F is reserved for moments of legal action (signing consent,
// adding a Trusted Contact, calling an emergency contact). Don't apply it to
// generic CTAs — the design intentionally lets neutral surfaces carry most
// of the visual weight and reserves cinnabar for ~3% of pixel coverage.
//
// Dark mode is the default per the brand brief. Backwards-compatible export
// names so screens that pre-date the redesign keep importing the same
// constants and pick up the new look automatically.

// ============ SURFACES — ink (dark) ============
export const EHR_SURFACE = '#0F1419';            // root bg ("ink")
export const EHR_SURFACE_LOWEST = '#181E25';     // standard card surface
export const EHR_SURFACE_LOW = '#181E25';        // alias for surface
export const EHR_SURFACE_CONTAINER = '#222831';  // elevated card
export const EHR_SURFACE_HIGH = '#222831';       // alias for elevated
export const EHR_SURFACE_HIGHEST = '#2F3741';    // modal background
export const EHR_SURFACE_DIM = '#0A0F14';        // pressed state

// ============ PRIMARY — Cinnabar (legal-action accent) ============
export const EHR_PRIMARY = '#D45A3F';            // cinnabar
export const EHR_PRIMARY_CONTAINER = '#B84628';  // cinnabarDeep — pressed/hover
export const EHR_PRIMARY_FIXED = '#3A1E18';      // tinted surface for cinnabar buttons in dark
export const EHR_PRIMARY_FIXED_DIM = '#2A1410';
export const EHR_ON_PRIMARY = '#FFFFFF';
export const EHR_ON_PRIMARY_CONTAINER = '#FFD9D2';
export const EHR_ON_PRIMARY_FIXED_VARIANT = '#FFB5A6';

// ============ SECONDARY — Clay (warm data accent, low contrast) ============
export const EHR_SECONDARY = '#D4A87C';          // clay
export const EHR_SECONDARY_CONTAINER = '#3A2E20';
export const EHR_ON_SECONDARY_CONTAINER = '#F0E2D5';

// ============ TERTIARY — Jade (medical green, used for verified/active) ============
export const EHR_TERTIARY = '#7BA88A';           // jade
export const EHR_TERTIARY_FIXED = '#1F2C24';
export const EHR_ON_TERTIARY_FIXED = '#D5EAD9';

// ============ TEXT ============
export const EHR_ON_SURFACE = '#EDE7D9';            // textPrimary — paper-on-ink
export const EHR_ON_SURFACE_VARIANT = '#A09B8E';    // textSecondary
export const EHR_OUTLINE = '#6B6760';               // textMuted (often outline)
export const EHR_OUTLINE_VARIANT = '#2F3741';       // border
export const EHR_OUTLINE_SOFT = '#252C35';          // borderSoft

// ============ STATUS ============
export const EHR_SUCCESS = '#7BA88A';   // jade — also success
export const EHR_WARNING = '#D4A24C';
export const EHR_DANGER = '#C94637';

// ============ ERROR (alias for danger; kept for backwards compat) ============
export const EHR_ERROR = '#C94637';
export const EHR_ERROR_CONTAINER = '#3A1814';

// ============ ACCENT (slate — for non-action info chips) ============
export const EHR_SLATE = '#8B8FA3';

// ============ SHADOWS ============
export const EHR_SHADOW = 'rgba(0, 0, 0, 0.40)';
export const EHR_SHADOW_SOFT = 'rgba(0, 0, 0, 0.20)';
