# Sơ đồ 15 — Activity: Cấp quyền (Grant Consent)

> Embed Chương 4 mục 4.4.2. Workflow patient share record cho doctor.

## Activity steps

1. **Start** — Patient mở RecordDetail → bấm "Chia sẻ"
2. Mở ShareSheet → nhập ví doctor + chọn thời hạn + allowDelegate
3. **Decision**: ví hợp lệ (regex 0x40hex)?
   - NO → highlight error, không cho submit → quay lại bước 2
   - YES → tiếp tục
4. **Decision**: ví trùng patient (self-share)?
   - YES → Alert "Không thể tự share" → quay lại bước 2
   - NO → tiếp tục
5. (audit fix bc2953c + §11) **Decision**: doctor đã có consent active dài hơn?
   - YES → Alert "Bác sĩ đã có quyền dài hạn hơn — thu hồi trước nếu muốn rút ngắn" → end (early return)
   - NO → tiếp tục
6. Bấm "Chia sẻ" → biometric MFA gate (nếu bật)
7. Build EIP-712 `ConsentPermit` typed data + nonce
8. Mobile sign typed data
9. **Decision**: User cancel ký?
   - YES → end
   - NO → tiếp tục
10. POST `/api/relayer/grant-consent` với signature
11. Backend verify EIP-712 (domain separator + nonce)
12. Backend submit `ConsentLedger.grantBySig(...)` sponsored
13. Contract `_grantConsent(...)`:
    - Store `_consents[consentKey]`
    - **Clear `recordDelegationSource[consentKey]`** (Footgun #1 fix 2026-06-01)
    - Emit `ConsentGranted`
14. **Decision**: tx revert?
   - YES → backend trả error → mobile friendlyChainError
   - NO → tiếp tục
15. Mobile cascade share keys cho mọi version trong chain:
    - For each `cidHash` in record chain:
      - Encrypt `(cid, aesKey)` cho doctor's NaCl pubkey
      - POST `/api/key-share` với encryptedPayload
16. Subgraph index `ConsentGranted` event
17. Backend mirror `Consent` table + WebSocket push tới doctor
18. Doctor's mobile invalidate query → dashboard refresh
19. Mobile show "Đã cấp quyền" + invalidate ShareSheet recipients
20. **End**

## Decision summary
- 5 decision nodes: regex validation, self-share guard, downgrade guard, cancel ký, tx revert

## Code references
- Mobile entry: [RecordDetailScreen.tsx](../../mobile/src/screens-v2/RecordDetailScreen.tsx) `handleShare`
- Downgrade guard: [RecordDetailScreen.tsx](../../mobile/src/screens-v2/RecordDetailScreen.tsx) line ~527 `oldStillActive`
- Sign: [eip712.js](../../mobile/src/utils/eip712.js) `signConsentPermit`
- Contract: [ConsentLedger.sol](../../contracts/src/ConsentLedger.sol) `_grantConsent` (Footgun #1)
- Sync: [consentLedgerSync.service.js](../../backend/src/services/consentLedgerSync.service.js) `handleConsentGranted`

## PlantUML

Xem [15-activity-grant-consent.puml](15-activity-grant-consent.puml).
