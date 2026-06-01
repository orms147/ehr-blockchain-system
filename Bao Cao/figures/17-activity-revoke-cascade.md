# Sơ đồ 17 — Activity: Thu hồi cascade (Revoke Cascade)

> Embed Chương 4 mục 4.4.4. Workflow patient revoke doctor A → cascade B/C.

## Activity steps

### Phase A — Patient revoke
1. **Start** — Patient mở `AccessLogScreen`
2. Tìm doctor A → bấm "Thu hồi"
3. Alert xác nhận → bấm OK
4. Biometric MFA gate
5. Sign `RevokePermit` EIP-712
6. **Decision**: User cancel?
   - YES → stop
   - NO → tiếp tục
7. POST `/api/relayer/revoke-consent` sponsored
8. Backend submit `ConsentLedger.revokeBySig(...)`
9. Contract mark `_consents[P,A,root].active = false`
10. Contract emit `ConsentRevoked(P, A, root, timestamp)`

### Phase B — Backend cascade handler
11. Subgraph index event `ConsentRevoked`
12. Backend `consentLedgerSync.handleConsentRevoked(P, A, root)`:
    - Walk record chain root → descendant cidHashes
    - **Tầng 1**: query KeyShare WHERE sender=A → revoke
    - **Tầng 2** (§13 fix): query `DelegationAccessLog` WHERE byDelegatee=A
13. For each derived recipient (B, C, ...) trong DelegationAccessLog:
    14. **Decision**: B chỉ có quyền qua A (delegation-derived)?
        - YES → cascade revoke ALL KeyShare rows cho B (kể cả sender=P cascade-share)
        - NO (B có direct grant từ P sau khi A delegate B — Footgun #1) → SKIP (B's direct grant không bị touch)
    15. Update `Consent` table cho B → status='revoked' (nếu cascade)
    16. Emit Socket.io `consent:updated` cho B

### Phase C — B kiểm tra access lần kế (nếu có)
17. B refresh dashboard → GET `/api/key-share/record/:cidHash`
18. Backend gate `canAccess(P, B, cidHash)`
19. Contract `_hasValidNormalConsent`:
    - Read `recordDelegationSource[B's key]`
    - **Decision**: recordDelegationSource = A?
      - YES → walk A's consent → revoked → return false → B 403
      - NO (= address(0) — Footgun #1 cleared) → check B's own consent → active → return true → B vẫn xem được
20. **End**

## Key insight (Footgun #1)
Behavior khác biệt giữa "B chỉ có delegation" vs "B có direct grant":
- Cũ (trước fix): cả 2 đều cascade kill ngầm
- Mới (fix 2026-06-01): chỉ delegation-derived bị kill; direct grant survive

## Code references
- Mobile: [AccessLogScreen.tsx](../../mobile/src/screens-v2/AccessLogScreen.tsx) `handleRevoke`
- Backend cascade: [consentLedgerSync.service.js](../../backend/src/services/consentLedgerSync.service.js) `handleConsentRevoked` (§13 fix)
- Contract: [ConsentLedger.sol](../../contracts/src/ConsentLedger.sol) `_hasValidNormalConsent` (walk chain)
- Footgun #1 patch: [ConsentLedger.sol](../../contracts/src/ConsentLedger.sol) `_grantConsent` clear delegation source
- Test: [ConsentLedgerPhase1Fixes.t.sol](../../contracts/test/ConsentLedgerPhase1Fixes.t.sol) `test_DirectGrantClearsDelegationSource`

## PlantUML

Xem [17-activity-revoke-cascade.puml](17-activity-revoke-cascade.puml).
