# Sơ đồ 18 — Activity: Trusted Contact emergency

> Embed Chương 4 mục 4.4.5. Workflow Người thân tin cậy đăng ký + truy cập + revoke.

## 3 phase + 1 background

### Phase A — Patient đăng ký TC + encryption ceremony
1. **Start** — Patient mở `TrustedContactsScreen`
2. Bấm "Thêm người thân tin cậy"
3. Paste/scan ví TC + nhập label (max 120 chars, vd "Mẹ")
4. **Decision**: ví hợp lệ + khác patient?
   - NO → highlight + stop
   - YES → tiếp tục
5. Biometric MFA gate
6. Sign `TrustedContactPermit(active=true)` EIP-712
7. POST `/api/relayer/trusted-contact` (sponsored)
8. Contract `setTrustedContactBySig`:
   - `isTrustedContact[P][TC] = true`
   - Emit `TrustedContactSet`
9. **Decision**: TC đã activate encryption key (`encryptionPublicKey` đăng ký với backend)?
   - NO → error "TC chưa kích hoạt khoá. Yêu cầu họ đăng nhập app trước" → stop
   - YES → tiếp tục
10. `runEncryptionCeremony(TC)`:
    - Fetch all current records của patient
    - For each record:
      - Get `(cid, aesKey)` từ localRecordStore
      - Encrypt cho TC's NaCl pubkey
    - POST `/api/key-share/bulk-trusted-contact`
    - Backend lưu KeyShare rows source='trusted-contact'

### Phase A+ — Auto pre-share khi tạo record mới (background)
11. Patient tạo record mới (Activity 14)
12. Sau khi `RecordAdded` event success:
    - `autoPreShareNewRecord(cidHash, cid, aesKey, patientAddress)`
    - GET `/api/trusted-contacts/me`
    - For each TC active: encrypt + POST `/api/key-share/bulk-trusted-contact`
13. TC luôn có KeyShare row cho mọi record mới (không cần TC online)

### Phase B — TC truy cập record (emergency)
14. TC mở app → login Web3Auth
15. TC vào tab "Người tin cậy" hoặc tab Records (nếu TC cũng là patient/doctor)
16. TC bấm vào record của patient
17. GET `/api/key-share/record/:cidHash`
18. Backend gate `canAccess(P, TC, cidHash)`:
    - Contract check `isTrustedContact[P][TC]` (Footgun #2 fix)
    - **Decision**: TC active?
      - YES → return true → trả encryptedPayload
      - NO → return false → 403
19. TC mobile: decrypt NaCl box (TC's private key + sender pubkey) → `(cid, aesKey)`
20. Fetch IPFS ciphertext → decrypt AES-GCM
21. Render record

### Phase C — Patient revoke TC
22. Patient mở `TrustedContactsScreen` → chọn TC → bấm thu hồi
23. Sign `TrustedContactPermit(active=false)` EIP-712 + biometric
24. POST `/api/relayer/trusted-contact` sponsored
25. Contract `isTrustedContact[P][TC] = false` + emit `TrustedContactRevoked`
26. Backend `consentLedgerSync.handleTrustedContactRevoked`:
    - Mark `TrustedContact.status='revoked'` table
    - Cascade revoke KeyShare rows source='trusted-contact' (sender=P, recipient=TC)
27. TC mở record sau revoke:
    - canAccess trả false (Footgun #2 đảm bảo)
    - Backend trả 403
28. **Architectural limitation**: TC vẫn có thể decrypt OFFLINE nếu local cache còn — KHÔNG thể un-share data đã offline (envelope encryption nature)
29. **End**

## Code references
- TC service: [trustedContact.service.js](../../mobile/src/services/trustedContact.service.js) `addContact`, `runEncryptionCeremony`, `autoPreShareNewRecord`, `removeContact`
- Backend bulk endpoint: [keyShare.routes.js](../../backend/src/routes/keyShare.routes.js) `/bulk-trusted-contact`
- Contract: [ConsentLedger.sol](../../contracts/src/ConsentLedger.sol) `setTrustedContact`, `canAccess` (Footgun #2)
- Test: [ConsentLedgerTrustedContact.t.sol](../../contracts/test/ConsentLedgerTrustedContact.t.sol) `test_CanAccess_TrustedContact_BypassesNormalConsent`

## PlantUML

Xem [18-activity-trusted-contact.puml](18-activity-trusted-contact.puml).
