# Sơ đồ 8 — Sequence: Flow Trusted Contact Emergency (Đóng góp #3)

> Embed Chương 4 mục 4.4.5. Trace flow Người thân tin cậy truy cập hồ sơ trong tình huống khẩn cấp.

## Actors / Components
- **Patient** (mobile user, chủ hồ sơ)
- **PatientMobile** (Patient's app)
- **TC** (Người thân tin cậy — wallet riêng, có thể là Bệnh nhân khác hoặc Bác sĩ)
- **TCMobile** (TC's app)
- **Backend** (Express + relayer)
- **ConsentLedger** (smart contract)
- **KeyShare DB**

## Step trace

### Phase A — Patient đăng ký TC + pre-share KeyShare
1. Patient mở `TrustedContactsScreen` → bấm "Thêm người thân tin cậy"
2. Patient paste/scan QR ví của TC + nhập label ("Mẹ", "Con trai", ...)
3. Patient biometric MFA gate → ký EIP-712 `TrustedContactPermit`
4. POST `/api/relayer/trusted-contact` → backend submit `setTrustedContactBySig(...)` (sponsored)
5. Contract `isTrustedContact[patient][TC] = true` + lưu label + emit `TrustedContactSet`
6. Mobile `runEncryptionCeremony(TC)`:
   - Fetch all current records của patient
   - Encrypt mỗi `(cid, aesKey)` cho TC's NaCl pubkey
   - POST `/api/key-share/bulk-trusted-contact` → backend lưu KeyShare rows source='trusted-contact'

### Phase A+ — Auto pre-share record mới
7. Patient tạo record mới (Flow #6)
8. `autoPreShareNewRecord` cascade ngay sau khi tạo:
   - Get list `/api/trusted-contacts/me`
   - Encrypt key cho mỗi TC active → POST `/api/key-share/bulk-trusted-contact`
9. TC luôn có KeyShare row updated cho mọi record mới (không cần TC online)

### Phase B — TC truy cập khẩn cấp (TC online lần đầu hoặc cần đọc record)
10. TC login app → vào dashboard "Người tin cậy" (hoặc tab Records nếu TC cũng là patient)
11. TC bấm vào record của Patient → GET `/api/key-share/record/:cidHash`
12. Backend gate trước khi serve:
    - Check on-chain `canAccess(patient, TC, cidHash)`
    - **Footgun #2 fix**: contract tự return true vì `isTrustedContact[patient][TC]=true`
    - Backend còn defensive double-check `TrustedContact` table (commit 3e53fcf không cần nữa nhưng giữ làm safety)
13. Backend trả `encryptedPayload` cho TC
14. TCMobile decrypt NaCl box (TC's private key + Patient's senderPublicKey) → get `(cid, aesKey)`
15. TCMobile fetch ciphertext từ IPFS gateway → decrypt AES-GCM → render record

### Phase C — Patient thu hồi TC
16. Patient mở `TrustedContactsScreen` → bấm thu hồi TC
17. Ký `TrustedContactPermit(active=false)` → backend submit `setTrustedContactBySig(..., active=false)`
18. Contract `isTrustedContact[patient][TC] = false` + emit `TrustedContactRevoked`
19. Backend `consentLedgerSync.handleTrustedContactRevoked`:
    - Mark `TrustedContact.status='revoked'` table
    - Cascade revoke tất cả KeyShare rows source='trusted-contact' (sender=patient, recipient=TC)
20. TC mở record sau khi revoke → backend canAccess on-chain trả false → 403 (Footgun #2 đảm bảo)
21. TC vẫn có thể decrypt offline nếu local cache còn — limitation architectural (envelope encryption)

## File references
- Mobile TC service: [mobile/src/services/trustedContact.service.js](../../mobile/src/services/trustedContact.service.js) `addContact`, `runEncryptionCeremony`, `autoPreShareNewRecord`, `removeContact`
- Backend relayer endpoint: [backend/src/routes/relayer.routes.js](../../backend/src/routes/relayer.routes.js) `/trusted-contact`
- Backend bulk pre-share: [backend/src/routes/keyShare.routes.js](../../backend/src/routes/keyShare.routes.js) `/bulk-trusted-contact`
- Contract: [contracts/src/ConsentLedger.sol](../../contracts/src/ConsentLedger.sol) `setTrustedContact`, `setTrustedContactBySig`, `canAccess` (Footgun #2)
- Event handlers: [backend/src/services/consentLedgerSync.service.js](../../backend/src/services/consentLedgerSync.service.js) `handleTrustedContactSet`, `handleTrustedContactRevoked`
- Test: [contracts/test/ConsentLedgerTrustedContact.t.sol](../../contracts/test/ConsentLedgerTrustedContact.t.sol) `test_CanAccess_TrustedContact_BypassesNormalConsent`

## PlantUML

Xem [08-seq-trusted-contact.puml](08-seq-trusted-contact.puml).
