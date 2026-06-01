# Sơ đồ 9 — Sequence: Flow Thu hồi Cascade (Đóng góp #2)

> Embed Chương 4 mục 4.4.4. Trace flow patient revoke doctor A → cascade kill mọi quyền doctor B/C nhận derived qua A.

## Scenario load-bearing

Patient (P) đã share record cho doctor A với `allowDelegate=true`. A delegate cho B qua `grantUsingRecordDelegation`. P quyết định thu hồi A.

Expected (sau Footgun #1+#2 fix 2026-06-01):
- A mất quyền
- B mất quyền **NẾU CHỈ** nhận quyền via A (delegation-derived) ✓ cascade
- B GIỮ quyền **NẾU** P đã direct grant B (recordDelegationSource cleared) — Footgun #1 fix

## Step trace

### Phase A — Setup ban đầu
1. P grant A `allowDelegate=true` (Flow #6 — Sơ đồ 6)
2. A delegate B → contract lưu `recordDelegationSource[B's key] = A`
3. Backend lưu `DelegationAccessLog(patient=P, byDelegatee=A, newGrantee=B, root=...)`
4. B claim KeyShare từ A → có quyền đọc record

### Phase B — Patient revoke A
5. P mở `AccessLogScreen` (hoặc ShareSheet) → tìm A → bấm "Thu hồi"
6. P biometric MFA → ký EIP-712 `RevokePermit`
7. POST `/api/relayer/revoke-consent` (sponsored)
8. Backend submit `ConsentLedger.revokeBySig(...)` → contract mark `_consents[P,A,root].active = false`
9. Contract emit `ConsentRevoked(P, A, root, timestamp)`

### Phase C — Backend cascade (subgraph + sync)
10. Subgraph index event `ConsentRevoked`
11. Backend `consentLedgerSync.handleConsentRevoked(P, A, root)`:
    - Walk record chain từ root → collect tất cả descendant cidHash
    - **Tầng 1** — query KeyShare rows sender=A, mark all revoked
    - **Tầng 2 (§13 fix)** — query `DelegationAccessLog` WHERE patientAddress=P AND byDelegatee=A
      - Get list newGrantee (B, C, ...) — những người nhận quyền via A
      - Cho mỗi recipient: cascade revoke ALL KeyShare rows (kể cả sender=P cascade-share)
12. Backend update `Consent` table: `(P, A, root)` status='revoked'
13. Backend update `Consent` table: `(P, B, root)` status='revoked' nếu B chỉ có delegation-derived
    - **Skip nếu** P direct grant B (Footgun #1: recordDelegationSource[B's key]=0 → B's consent độc lập)
14. Backend emit Socket.io `consent:updated` → push mobile cho B, C

### Phase D — On-chain check
15. B refresh dashboard → GET `/api/key-share/record/:cidHash`
16. Backend gate `canAccess(P, B, cidHash)` on-chain
17. Contract `_hasValidNormalConsent` walk:
    - Read `recordDelegationSource[B's key]` = A
    - Check A's consent → revoked
    - return false → B refused
18. Backend trả 403

### Phase D' — Edge case Direct grant B (Footgun #1 verify)
19. **Nếu** P sau bước 1 đã direct grant B (vd 30 ngày) → `recordDelegationSource[B's key] = 0` (Footgun #1 fix)
20. B refresh → canAccess walk B's consent độc lập → ACTIVE → return true
21. B vẫn xem được record (đúng ý P — P chỉ revoke A, không revoke B)

## File references
- Mobile entry: [mobile/src/screens-v2/AccessLogScreen.tsx](../../mobile/src/screens-v2/AccessLogScreen.tsx) `handleRevoke`
- Backend relayer: [backend/src/routes/relayer.routes.js](../../backend/src/routes/relayer.routes.js) `/revoke-consent`
- Contract revoke: [contracts/src/ConsentLedger.sol](../../contracts/src/ConsentLedger.sol) `revoke`, `revokeBySig`
- Cascade handler: [backend/src/services/consentLedgerSync.service.js](../../backend/src/services/consentLedgerSync.service.js) `handleConsentRevoked` (Tầng 1 + Tầng 2)
- Cascade applier: [backend/src/services/keyShareWriter.service.js](../../backend/src/services/keyShareWriter.service.js) `applyRevoke`
- On-chain walk: [contracts/src/ConsentLedger.sol](../../contracts/src/ConsentLedger.sol) `_hasValidNormalConsent`
- Tests:
  - [contracts/test/ConsentLedgerPhase1Fixes.t.sol](../../contracts/test/ConsentLedgerPhase1Fixes.t.sol):
    - `test_BugC_RevokeA_CascadesToB` (delegation-only B mất quyền)
    - `test_DirectGrantClearsDelegationSource` (Footgun #1 — direct grant B GIỮ quyền)
    - `test_BugC_A_ExpiresNaturally_BLosesAccess` (time-based cascade)

## PlantUML

Xem [09-seq-revoke-cascade.puml](09-seq-revoke-cascade.puml).
