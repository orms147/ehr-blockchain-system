# UI v2 — Claude Design port

Scratchpad for porting the redesigned UI (brand "ViEH", Fraunces + DM Sans, dark
mode default, cinnabar `#E63946`) generated in Claude Design.

## Migration approach (non-destructive)

1. Drop each ported screen into `screens-v2/` with the SAME export name as the
   original in `screens/`. Same for `components-v2/`.
2. `AppNavigator` reads `EXPO_PUBLIC_UI_V2` and picks the source folder:
   - `EXPO_PUBLIC_UI_V2=true` → import from `screens-v2/` if file exists,
     fall back to `screens/` for screens not yet ported.
   - unset / `false` → use `screens/` everywhere (current behaviour).
3. Run dev with `EXPO_PUBLIC_UI_V2=true` to test the new UI. Switch back by
   removing the env var if anything is broken.
4. When 100% ported and verified → swap default to v2, delete `screens/` and
   `components/`, rename `screens-v2/` → `screens/`.

## Why parallel folders, not git branch

- A git branch defers the integration risk to merge time. Parallel folders
  surface broken imports / missing event handlers / typos immediately because
  TypeScript checks both folders on every build.
- We also keep both versions runnable concurrently (just toggle the env flag),
  which is essential when porting 27 screens — hard to know if a regression
  is in the new code or the original.

## What MUST be preserved when porting

The old screens encode behaviour we cannot regress:

- **Function names**: `handleShare`, `handleClaim`, `handleRevoke` etc. are
  referenced from `navigation.navigate` callbacks and the screen's own state
  setters. Keep them identical to avoid wiring fatigue.
- **Navigation routes**: `navigation.navigate('TrustedContacts')`,
  `'EmergencyLookup'`, `'CreateRecord'`, `'RecordDetail'`,
  `'DoctorCreateUpdate'`, `'DoctorDelegatableRecords'`,
  `'DoctorDelegatedPatients'`, `'DoctorOutgoingShares'`, `'EditProfile'`,
  `'Delegation'`, `'Settings'`. Every Pressable that navigates needs the same
  route string.
- **Service imports**: `consentService`, `keyShareService`, `recordService`,
  `requestService`, `delegationService`, `trustedContactService`,
  `walletActionService`, `authService`, `profileService`. Each ported screen
  must re-import these.
- **EIP-712 + biometric gate**: signing flows go through `signGrantConsent` /
  `signDelegationPermit` / `signTrustedContactPermit` (already gated with
  `gateOrThrow` in `utils/eip712.js`). Direct `walletClient.writeContract`
  calls in screens need their own `gateOrThrow` (see DoctorCreateUpdate,
  DoctorRequestAccess, DoctorDashboard, OrgPendingVerifications).
- **TanStack Query keys**: `['trustedContacts', 'me']`, `['doctor',
  'sharedRecords']`, `['userProfile', address]`, `['recordMeta', cidHash]`.
  Re-using these means cross-screen invalidation keeps working.
- **Reusable components from `components/`**: `UserChip`, `RecordChip`,
  `QrAddressScanner`, `LoadingSpinner`, `EmptyState`, `LiabilityConfirmModal`.
  These were built before the redesign and should be migrated into
  `components-v2/` only when the new design changes their UX, otherwise
  import directly from `components/`.
- **Constants from `constants/uiColors.ts`**: define new tokens here once
  (cinnabar, dark-mode default), then `screens-v2/` reads from them.
- **Auth + role gating**: `useAuthStore`, `requireOnChainRoles` middleware
  on the backend. Don't move role checks around when porting.

## Status (Tầng 3 incremental port)

| Source (`.design-bundle/project/`) | Target | Status |
|---|---|---|
| screens-patient.jsx → OnboardingScreen step 0 | `screens-v2/LandingScreen.tsx` | ✓ ported |
| screens-patient.jsx → HomeScreen | `screens-v2/DashboardScreen.tsx` | TODO |
| screens-patient.jsx → RecordsScreen | `screens-v2/RecordsScreen.tsx` | TODO |
| screens-patient.jsx → RecordDetailScreen | `screens-v2/RecordDetailScreen.tsx` | TODO |
| screens-patient.jsx → PermissionsScreen | `screens-v2/AccessLogScreen.tsx` (tab "Quyền") | TODO |
| screens-patient.jsx → AuditScreen | `screens-v2/AccessLogScreen.tsx` (tab "Nhật ký") | TODO |
| screens-patient.jsx → ProfileScreen | `screens-v2/ProfileScreen.tsx` | TODO |
| screens-patient.jsx → ConsentSheet | reuse in RecordDetail / Requests | TODO |
| screens-patient.jsx → ReceiptScreen | new component or modal | TODO |
| screens-doctor.jsx → DoctorHomeScreen | `screens-v2/doctor/DoctorDashboardScreen.tsx` | TODO |
| screens-doctor.jsx → RequestAccessScreen | `screens-v2/doctor/DoctorRequestAccessScreen.tsx` | TODO |
| screens-doctor.jsx → CreateRecordScreen | `screens-v2/doctor/DoctorCreateUpdateScreen.tsx` | TODO |
| screens-doctor.jsx → OrgScreen / MinistryScreen | stub variants | TODO |
| screens-extras.jsx → DelegationScreen | `screens-v2/DelegationScreen.tsx` | TODO |
| screens-extras.jsx → RequestsScreen | `screens-v2/RequestsScreen.tsx` | TODO |
| screens-extras.jsx → PatientCreateRecordScreen | `screens-v2/CreateRecordScreen.tsx` | TODO |
| screens-extras.jsx → EditProfileScreen | `screens-v2/EditProfileScreen.tsx` | TODO |
| screens-extras.jsx → SettingsScreen | `screens-v2/SettingsScreen.tsx` | TODO |
| screens-extras.jsx → DoctorOutgoingScreen | `screens-v2/doctor/DoctorOutgoingScreen.tsx` | TODO |
| screens-extras.jsx → DoctorDelegatableRecordsScreen | `screens-v2/doctor/DoctorDelegatableRecordsScreen.tsx` | TODO |
| screens-extras.jsx → DoctorDelegatedPatientsScreen | `screens-v2/doctor/DoctorDelegatedPatientsScreen.tsx` | TODO |
| screens-emergency.jsx → TrustedContactsScreen | `screens-v2/TrustedContactsScreen.tsx` | TODO |

### v2 primitives (`components-v2/`)

- `ViButton.tsx` — primary / cinnabar / ghost / danger variants × sm / md / lg.
- `ViCard.tsx` — surface card with optional press scale.
- `ViChips.tsx` — `ViSectionLabel` / `ViModeChip` / `ViStatusChip` / `ViSourceChip`.
- `ViWordmark.tsx` — "ViEH" brand logotype, mixed Fraunces italic + bold.

### Token alignment

`src/constants/uiColors.ts` and `tamagui.config.ts` already point at the
exact Claude Design hex values from `.design-bundle/project/tokens.jsx`:
- Cinnabar `#D45A3F`
- Ink (root bg) `#0F1419`
- Surface `#181E25`
- Elevated `#222831`
- Jade `#7BA88A`, Clay `#D4A87C`, Slate `#8B8FA3`

When porting a screen, prefer the existing `EHR_*` exports — they already
resolve to the correct hex. Add new tokens only when the design introduces
something not yet covered.

## Pitfalls observed during P1-P5

- Tamagui prop type warnings for `marginTop` / `backgroundColor` on
  `<Button>` and `<Text>` are baseline noise (~43 errors in typecheck);
  not regressions.
- `useNavigation<any>` is used everywhere because the project doesn't have a
  typed navigator. Keep `<any>` to avoid pulling in nav types.
- Mobile reads contract addresses from `EXPO_PUBLIC_*` envs — port screens
  must keep those env reads if doing direct `writeContract`.
