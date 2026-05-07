// Brand "ViEH" tokens — S18 redesign (2026-05-04, Tầng 2 pre-flight).
//
// Dark mode is the design default. These constants are read by every screen
// that pre-dates the redesign and the new screens-v2/ ports. When porting,
// keep importing these names so a token tweak here propagates everywhere.
//
// Cinnabar #E63946 is reserved for moments of legal action (signing consent,
// adding a Trusted Contact, calling an emergency contact). Don't apply it to
// generic CTAs.

// ============ SURFACES (DARK PRIMARY) ============
export const EHR_SURFACE = '#0D0D0D';            // root background
export const EHR_SURFACE_LOWEST = '#141414';     // shallow card
export const EHR_SURFACE_LOW = '#1A1A1A';        // standard card
export const EHR_SURFACE_CONTAINER = '#212121';  // raised card
export const EHR_SURFACE_HIGH = '#2A2A2A';       // input bg
export const EHR_SURFACE_HIGHEST = '#363636';    // modal bg
export const EHR_SURFACE_DIM = '#0A0A0A';        // pressed state

// ============ PRIMARY — Cinnabar ============
export const EHR_PRIMARY = '#E63946';            // legal-action accent
export const EHR_PRIMARY_CONTAINER = '#7A1D24';  // pressed/hover
export const EHR_PRIMARY_FIXED = '#3A1414';      // tinted surface for primary buttons in dark
export const EHR_PRIMARY_FIXED_DIM = '#2A0E0E';
export const EHR_ON_PRIMARY = '#FFFFFF';         // text on cinnabar
export const EHR_ON_PRIMARY_CONTAINER = '#FFD9DB';
export const EHR_ON_PRIMARY_FIXED_VARIANT = '#FFB3B7';

// ============ SECONDARY — Earth muted (used for secondary accents, low contrast) ============
export const EHR_SECONDARY = '#B89478';          // warm tan accent
export const EHR_SECONDARY_CONTAINER = '#3A2E26';
export const EHR_ON_SECONDARY_CONTAINER = '#F0E2D5';

// ============ TERTIARY — Jade muted (used for verified/active states) ============
export const EHR_TERTIARY = '#7A9985';
export const EHR_TERTIARY_FIXED = '#1F2C24';
export const EHR_ON_TERTIARY_FIXED = '#D5EAD9';

// ============ TEXT ============
export const EHR_ON_SURFACE = '#EFF2EA';            // primary text
export const EHR_ON_SURFACE_VARIANT = '#B0B0B0';    // secondary text, labels
export const EHR_OUTLINE = '#5C5C5C';
export const EHR_OUTLINE_VARIANT = '#363636';

// ============ ERROR (different from cinnabar — error has yellower tint) ============
export const EHR_ERROR = '#FF6B6B';
export const EHR_ERROR_CONTAINER = '#3A1414';

// ============ SHADOWS ============
export const EHR_SHADOW = 'rgba(0, 0, 0, 0.32)';
export const EHR_SHADOW_SOFT = 'rgba(0, 0, 0, 0.16)';
