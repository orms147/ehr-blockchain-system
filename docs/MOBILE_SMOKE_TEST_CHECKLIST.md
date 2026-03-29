# Mobile Smoke Test Checklist

- Date: 2026-03-22
- Scope: `mobile/` app role-based flows after migration hardening
- Preconditions:
  - Backend is running and reachable at `EXPO_PUBLIC_API_URL`
  - Wallet/Web3Auth config valid in app env
  - Test accounts exist for roles: patient, doctor, org, ministry

## A. Build & Boot

1. Start app: `cd mobile && npm run start`
- Expected: Expo starts without runtime red screen.

2. Type check: `cd mobile && npx tsc --noEmit`
- Expected: pass.

3. Login routing
- Open app unauthenticated.
- Expected: `Landing -> Login` stack only.

## B. Patient Flow

1. Login via Web3Auth
- Expected: token is stored, patient tabs visible.

2. Dashboard load
- Expected: summary cards render, no crash.

3. Records list
- Open Records tab.
- Pull-to-refresh.
- Expected: list/empty state works.

4. Requests list
- Open Requests tab.
- Approve one request if available.
- Archive one request if available.
- Expected: actions complete and list refreshes.

5. AccessLog
- Open AccessLog tab.
- Revoke one active consent (if any).
- Expected: state changes to revoked/inactive.

6. Record detail decrypt
- Open a record detail.
- Click decrypt.
- Expected: either decrypted payload shows or handled error message (no crash).

## C. Doctor Flow

1. Switch role to doctor
- Expected: doctor tab set appears.

2. Doctor dashboard
- Expected: shared records list loads.

3. Request access
- Fill patient address.
- Submit request.
- Expected: success state shown.

4. Outgoing requests
- Expected: outgoing list renders statuses.

5. Expired records
- Expected: expired/revoked records list or empty state.

## D. Org Flow

1. Switch role to org
- Expected: org tab set appears.

2. Org dashboard
- Expected: organization info + members list or pending/no-org state.

3. Org members
- Search/filter members.
- Expected: filter works, list stable.

4. Pending verifications
- Approve/reject one pending item if available.
- Expected: action feedback and list refresh.

## E. Ministry Flow

1. Switch role to ministry/admin
- Expected: ministry tab set appears.

2. Organizations tab
- Expected: organization list renders.

3. Pending applications tab
- Approve/reject one application if available.
- Expected: backend call success and UI refresh.

4. System tab
- Expected: static system section renders.

## F. Profile & Settings

1. Profile
- Open Profile tab.
- Expected: user summary + health block + menu actions render.

2. Settings
- Open Settings screen.
- Copy address.
- Open explorer.
- Open faucet link.
- Expected: all actions work, no crash.

## G. Regression & Safety

1. Dev login visibility
- In production build, dev role buttons must NOT appear.
- In dev build, buttons appear and function as dev-only.

2. Biometric login
- If supported, biometric triggers real Web3 login flow, not mock bypass.

3. Error paths
- Disconnect backend and retry selected actions.
- Expected: user-friendly alerts, no fatal crash.

4. Navigation sanity
- Deep navigate: Dashboard -> RecordDetail -> back -> Settings -> back.
- Expected: stack works without orphan screens.

## Exit Criteria

- All high-priority role flows run without crash.
- `tsc` pass.
- No `@ts-nocheck` remaining in `mobile/src`.
