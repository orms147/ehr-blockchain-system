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
