# Mobile Runtime Runbook

## Supported Environment
- Node.js: 20.x LTS
- Java: 17
- Expo SDK: 55
- React Native: 0.83.x

## Required `.env`
- `EXPO_PUBLIC_WEB3AUTH_CLIENT_ID`
- `EXPO_PUBLIC_API_URL`

## Important Notes
- Social login with Web3Auth does **not** support Expo Go reliably.
- Use a development client (`expo run:android`) or release build.
- Redirect URL for native build should be `erhsystem://auth` and must be allowlisted in Web3Auth Dashboard.

## Stable Commands
1. Install dependencies:
   `npm install`
2. Start clean Metro:
   `npm run start:clear`
3. Run Android dev client:
   `npm run android:dev`

## Fast Checks
- Type check:
  `npm run type-check`
- Preflight only:
  `npm run preflight`

## Common Failure
### Error: `Cannot read property 'reload' of undefined`
- Cause: old Web3Auth RN SDK edge case around redirect flow.
- Mitigation in project:
  - fixed redirect generation
  - startup pre-initialization
  - one fallback login attempt without explicit redirect URL

---

## APK Build (Wave I — release for Android devices)

`eas.json` configured at `mobile/eas.json` with 3 profiles: `development` (dev client), `preview` (release APK for internal testing), `production` (release APK for distribution). All Android profiles build APK (not AAB) to allow side-load testing without Play Store.

### One-time setup (do once per machine)
1. Install EAS CLI globally:
   ```
   npm install -g eas-cli
   ```
2. Login to your Expo account (creates EAS account if needed):
   ```
   eas login
   ```
3. From `mobile/`, link the project:
   ```
   cd mobile && eas init
   ```
   This writes `extra.eas.projectId` into `app.json` (commit this).

### Web3Auth dashboard config (CRITICAL for social login on APK)
EAS auto-generates an Android signing keystore on first build. You MUST register its SHA-1 fingerprint in Web3Auth Dashboard before Google/Apple login works on the APK build.

1. After first `eas build`, get SHA-1:
   ```
   eas credentials
   ```
   Pick Android → production → show credentials → copy SHA-1.
2. In [Web3Auth Dashboard](https://dashboard.web3auth.io/) → Project Settings → Verifier "Google" → add Android client with:
   - Package name: `com.ehrchain.mobile`
   - SHA-1: (paste from step 1)
3. Repeat for Apple/Discord/Twitter/Facebook verifiers if you'll use them.

### Backend prod URL
Before building, set `mobile/.env` (or `mobile/.env.production`):
```
EXPO_PUBLIC_API_URL=https://your-backend.onrender.com
EXPO_PUBLIC_WEB3AUTH_CLIENT_ID=BNqxxxxxx...  (Web3Auth prod client_id)
EXPO_PUBLIC_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS=0x...
EXPO_PUBLIC_RECORD_REGISTRY_ADDRESS=0x...
EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS=0x...
EXPO_PUBLIC_DOCTOR_UPDATE_ADDRESS=0x...
EXPO_PUBLIC_EHR_SYSTEM_ADDRESS=0x...
```
The dev URL `192.168.x.x` will NOT be reachable from a built APK. You need either:
- Production backend deployed (Render/Railway/etc), OR
- Tunnel via `ngrok` to expose local backend (paid for stable subdomain)

### Build commands

**Preview APK (recommended for thesis demo)** — internal-distribution APK, install via QR code:
```
cd mobile && eas build --platform android --profile preview
```
- Build runs on EAS cloud (~10–15 min).
- When done, EAS prints a URL + QR code. Scan QR on Android to install APK.

**Production APK** — same but channel=production (for proper EAS Update OTA later):
```
cd mobile && eas build --platform android --profile production
```

### Local build (fallback if EAS quota exhausted)
Requires Java 17 + Android SDK installed locally:
```
cd mobile
npx expo prebuild --platform android --clean
npx expo run:android --variant release
```
APK lands at `mobile/android/app/build/outputs/apk/release/app-release.apk`. Copy to your Android device via USB/email/Drive and install (allow "install from unknown sources").

### Version bump for each release
Increment `expo.android.versionCode` in `app.json` (integer) and optionally `expo.version` (semver string) before each new build. EAS rejects builds with duplicate versionCode.

### Smoke test checklist on installed APK
- [ ] Login Google OAuth (Web3Auth) — fails if SHA-1 not registered → see Web3Auth setup above
- [ ] Patient: tạo record + share with doctor + accept request
- [ ] Patient: từ chối request (Wave A)
- [ ] Doctor: request access + tạo update record
- [ ] Org admin: thêm bác sĩ + thu hồi xác minh (Wave C, G)
- [ ] Ministry: tạo organization + verify doctor + pause/revoke org (Wave D, E, F)
- [ ] Emergency lookup CCCD → patient info appears
- [ ] Biometric prompt fires on all sign sites (8 places)

If social login fails on APK only (works in dev client):
1. Verify `eas credentials` SHA-1 matches what's in Web3Auth Dashboard
2. Verify `EXPO_PUBLIC_WEB3AUTH_CLIENT_ID` in `.env` is the same client_id used to register the SHA-1
3. Try Email passwordless login (doesn't depend on SHA-1) to isolate — if email works, problem IS the SHA-1 mismatch
