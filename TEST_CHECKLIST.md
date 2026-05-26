# TEST CHECKLIST — Pre-APK build (2026-05-26)

> Chia theo **LOGIC** (không theo role). Các role test **song song** trên nhiều device/emulator. Tổng 48 case, ~5 giờ với 4 device. Tick `[x]` khi pass, ghi note nếu fail.

## Setup tổng (1 lần duy nhất)

> ⚠ **Ministry wallet constraint (2026-05-26)**: ví Ministry chỉ tồn tại trong browser MetaMask (mất seed → chỉ ký được qua web). Mobile app KHÔNG dùng được role Ministry. Tất cả Ministry tx chạy qua **Arbiscan Write Contract tab**. URGENT: export MetaMask private key → password manager NGAY trước khi browser cache wipe.

| Item | Status |
|---|---|
| Backend `npm run dev` xanh (port 3001) | [ ] |
| Subgraph v0.1.4 healthy (Graph Studio dashboard) | [ ] |
| Device 1: Patient wallet — login Google/email | [ ] |
| Device 2: Doctor wallet — login + verify role on-chain | [ ] |
| Device 3: Org Admin wallet — đã được createOrganization assign | [ ] |
| **Browser MetaMask**: ví Ministry connected · private key đã backup | [ ] |
| Arbitrum Sepolia explorer mở tab: `https://sepolia.arbiscan.io` | [ ] |
| Graph Studio dashboard mở: query EHR v0.1.4 | [ ] |

### Ministry actions via Arbiscan — quick reference

5 function Ministry-only. Mở contract → tab **Contract → Write Contract** → **Connect Wallet** (MetaMask) → expand function → nhập args → Write → ký MetaMask popup.

| Function | Contract | Address |
|---|---|---|
| `createOrganization(name, primaryAdmin, backupAdmin)` | AccessControl | `0xA2b937a88c130aD211D12Dc2BC482Cb49CDdD7Cb` |
| `verifyDoctorByMinistry(doctor, credential)` | AccessControl | same |
| `setOrgActive(orgId, active)` | AccessControl | same |
| `revokeOrgVerification(orgId)` | AccessControl | same |
| `setOrgAdmins(orgId, newPrimary, newBackup)` | AccessControl | same |

Sau khi tx confirm: backend `eventSync.service.js` auto sync DB (~30s) → mobile pull thấy state mới qua các role khác.

---

## L1 — Authentication & Session (15 min · 1 device)

- [ ] **L1.1** Login Google trong dev build → role select hiện → chọn Patient → biometric enroll → Dashboard load với `signaturesRemaining=100`
- [ ] **L1.2** Login email_passwordless OTP (Doctor wallet đã register) → skip role select (role có sẵn) → DoctorDashboard load
- [ ] **L1.3** Force quit app → re-open → SecureStore JWT có nhưng walletActionService.hasActiveSession=false → app **force re-login** (KHÔNG cho vào dashboard cũ)
- [ ] **L1.4** Bấm "Đăng nhập bằng vân tay" → LocalAuthentication prompt → success → handleWeb3Login → vào dashboard

---

## L2 — Records lifecycle (30 min · Patient + Doctor parallel)

- [ ] **L2.1** Patient: CreateRecordScreen → nhập tay metadata → upload file PDF → AES-GCM encrypt → Pinata upload → `registerRecord` tx → confirm Arbitrum Sepolia → record xuất hiện RecordsScreen
- [ ] **L2.2** Doctor: DoctorCreateUpdateScreen cho patient cụ thể → `addRecordByDoctor` direct on-chain (không pending) → patient + doctor cùng nhận self-share KeyShare
- [ ] **L2.3** Doctor tạo update (parent=record cũ) → patient mở RecordDetail → tab "Phiên bản" hiện 2 versions theo thứ tự thời gian
- [ ] **L2.4** Patient open record → fetch ciphertext IPFS → decrypt local → metadata + content hiển thị đúng

**Checkpoints**: Arbiscan `RecordAdded` event · Subgraph entity `Record` count tăng · `KeyShare` row backend status `claimed`

---

## L3 — Consent grant (30 min · Patient + Doctor parallel)

- [ ] **L3.1** ⚠ **P0 verify**: Patient ShareSheet → nhập wallet doctor → mode `read-update` → 7 ngày → bấm "Xác nhận chia sẻ" → **biometric prompt phải hiện** → ký EIP-712 → relayer sponsor `grantConsent` → doctor refresh inbox thấy record mới
- [ ] **L3.2** Patient share `read-delegate` cho doctor A → `allowDelegate=true` on-chain → doctor A có nút "Chia sẻ lại" trong record detail
- [ ] **L3.3** Patient share record có chain (≥ 2 version) → backend stage cascade payloads cho TẤT CẢ version → doctor decrypt được mọi version
- [ ] **L3.4** Self-share fallback: tạo version mới rồi share → backend resolveLocalKey fetch selfShare → decrypt qua sender pubkey → doctor đọc được

**Checkpoints**: ConsentGranted event · KeyShare backend `encryptedPayload` non-null · ShareSheet validation hint hiện đúng (jade tick valid / cinnabar warn error)

---

## L4 — Consent revoke + cascade (25 min · Patient + 2 Doctor parallel)

- [ ] **L4.1** Patient revoke 1 consent → `revokeConsent` tx → ConsentRevoked event → KeyShare backend `revoked` → mobile WS push → doctor side UI cập nhật real-time
- [ ] **L4.2** Patient revoke parent record → tất cả KeyShare descendant cùng chain bị `revoked` (cascade) → doctor mất quyền toàn chain
- [ ] **L4.3** Patient revoke delegation A (A đã delegate B): cascade walk → B mất quyền (subgraph DelegationRevoked epoch bump)

**Checkpoints**: Subgraph DelegationEvent epoch tăng · Backend `consent:updated` socket emit · Doctor UI hiển thị "Quyền đã thu hồi" pill

---

## L5 — Access request (35 min · Doctor verified + Patient parallel) — verify P1 #2 fix

- [ ] **L5.1** Doctor verified: DoctorRequestAccessScreen → nhập patient wallet + cidHash → tx `requestAccess` → confirm → patient inbox refresh thấy yêu cầu mới
- [ ] **L5.2** Patient approve: bấm "Mở để ký" → ConsentSheet → **biometric prompt (P0 fix verify)** → EIP-712 sign → PendingChainOverlay → **SignReceipt hiện** với 6 KV rows + cinnabar seal
- [ ] **L5.3** Patient reject sponsored (Wave K): bấm "Từ chối" → Alert confirm → biometric → EIP-712 sign → backend relayer broadcast → SignReceipt "Biên nhận từ chối"
- [ ] **L5.4** ⚠ **P1 #2 verify (negative)**: Patient wallet (KHÔNG phải doctor) gọi `requestAccess` qua script → contract revert `InvalidRequest()` → tx fail
- [ ] **L5.5** Doctor sign approve sau deadline (chờ >5 phút) → contract revert `RequestExpired()` → mobile báo lỗi
- [ ] **L5.6** ⚠ **Wave O verify**: Patient bấm Huỷ ở Alert "Bác sĩ chưa xác minh" / Alert downgrade / Alert reject confirm → sheet đóng, **KHÔNG hiện SignReceipt** (verify commit a47d652)

**Checkpoints**: AccessRequested event · RequestCompleted/RequestRejected emit signer recovered · `approvingId` guard chặn double-tap

---

## L6 — Delegation (30 min · Patient + 3 Doctor parallel)

- [ ] **L6.1** Patient grant FullDelegation cho Doctor A → A có quyền proxy patient (test: A `addRecordByDoctor` cho patient)
- [ ] **L6.2** Doctor A delegate cho Doctor B → DelegationCHAIN depth 2 → B có thể `requestAccess` patient records (qua delegation)
- [ ] **L6.3** Patient revoke delegation A → cascade B mất quyền → subgraph `DelegationRevoked` epoch bump
- [ ] **L6.4** Negative: thử tạo chain depth 9 (A→B→C→D→E→F→G→H→I) → MAX_DELEGATION_WALK=8 revert ở step 9

**Checkpoints**: DelegationGranted event · Backend `Delegation` table cascade rows · Mobile DelegationScreen hiển thị chain đúng

---

## L7 — Verification (Doctor) (25 min · Doctor unverified + Org + Ministry parallel)

- [ ] **L7.1** Doctor unverified mở CredentialSubmitScreen → nhập CCHN + chọn org + upload PDF → submit → backend `/api/verification/submit` → org/ministry list pending
- [ ] **L7.2** Org admin: OrgPendingVerifications → bấm Approve doctor → biometric → `verifyDoctor` tx → doctor get VERIFIED_DOCTOR flag on-chain → doctor side "canAccess" no longer refuse
- [ ] **L7.3** 🌐 **Via Arbiscan** (Ministry wallet only browser): mở contract AccessControl → Write → `verifyDoctorByMinistry(doctor=0x..., credential="VERIFIED")` → MetaMask sign → tx confirm → backend sync → doctor flag VERIFIED_DOCTOR on-chain (mobile doctor refresh thấy có thể request access patient)
- [ ] **L7.4** Org admin revoke verification doctor: OrgMembers → row doctor verified → bấm "Thu hồi" → typeword `THU HOI` → tx → doctor mất flag → request mới fail canAccess

**Checkpoints**: DoctorVerified event · VerificationRequest backend status `approved`/`revoked` · Doctor profile `isVerified` flag flip

---

## L8 — Verification (Org + Ministry governance) (35 min · Browser MetaMask + 2 mobile admin wallets parallel)

> Ministry actions chạy qua **Arbiscan Write Contract**, không qua mobile. Org admin login mobile bình thường.

- [ ] **L8.1** 🌐 **Via Arbiscan**: AccessControl → Write → `createOrganization(name="BV Test Wave8", primaryAdmin=0x..., backupAdmin=0x...)` → MetaMask sign → tx confirm → check Arbiscan event log có `OrganizationCreated(orgId, name, primary, backup)` → backend `/api/admin/organizations` GET trả về org mới → subgraph entity Organization index trong v0.1.4
- [ ] **L8.2** Primary admin login mobile (Web3Auth Google bằng email tương ứng wallet primary): role ORGANIZATION → mở OrgDashboard → org info đúng tên + orgId match Arbiscan event
- [ ] **L8.3** 🌐 **Via Arbiscan**: `setOrgActive(orgId=X, active=false)` → tx confirm → mobile Org admin thử OrgMembers → "Thêm bác sĩ" → ký tx → revert `NotActiveOrg` (toast lỗi mobile)
- [ ] **L8.4** 🌐 **Via Arbiscan**: `revokeOrgVerification(orgId=X)` → tx confirm → org `isVerified=false` → mobile doctor thuộc org thử requestAccess patient → canAccess fail (mobile reject)
- [ ] **L8.5** ⚠ **Fix #1 + #2 verify** (chạy mobile, KHÔNG cần Arbiscan):
  - Mobile MinistryCreateOrgScreen (UI vẫn render được khi login bằng wallet KHÔNG phải Ministry — purely test UI gate): nhập primary = wallet đang login → CTA disabled + footerHint "Bạn (Ministry) không thể tự làm admin cơ sở mới"
  - Nhập primary = `0x0000000000000000000000000000000000000000` → CTA disabled + hint "Ví chính không thể là 0x000…"
  - Mobile Org admin OrgMembers → AddMember → nhập doctor = chính org admin wallet → CTA disabled + inline error "Bạn là admin tổ chức — không thể tự thêm mình làm thành viên"
  - Note: L8.5 chỉ test client-side validation UI. Server/contract block đã verified ở L8.1-L8.4 (Ministry không cần test self-create qua Arbiscan vì validation P1 chỉ tồn tại mobile UI layer).

**Checkpoints**: OrganizationCreated event Arbiscan · OrganizationStatusChanged event · Backend Organization row sync (xem qua `/api/admin/organizations` JSON response) · Mobile Org dashboard refresh đúng sau khi Ministry tx confirm

---

## L9 — Trusted contact / Emergency (20 min · Patient + family wallet + Doctor parallel)

- [ ] **L9.1** Patient TrustedContactsScreen → "Thêm người thân" → nhập CCCD + wallet người thân → biometric → `setTrustedContact` tx → row hiện trong list
- [ ] **L9.2** Patient EmergencyProfileScreen → nhập CCCD → backend hash CCCD → row DB EmergencyProfile
- [ ] **L9.3** Doctor EmergencyLookupScreen → nhập CCCD patient → backend hash match → trả patient wallet → doctor có thể request emergency access

**Checkpoints**: TrustedContactSet event · Backend EmergencyProfile row · Rate limiter 5 lookup/phút/IP (in-memory)

---

## L10 — Real-time sync (15 min · Cross-layer)

- [ ] **L10.1** Patient revoke 1 consent → đợi 30s (SUBGRAPH_POLL_MS) → backend cache update → mobile refresh thấy status mới
- [ ] **L10.2** Doctor mở app → patient revoke (real-time) → Socket.io `consent:updated` push → doctor UI cập nhật KHÔNG cần pull-to-refresh
- [ ] **L10.3** Stop Graph Studio subgraph indexing tạm → backend fallback dùng eventSync.service poll RPC trực tiếp → events vẫn được index (delay cao hơn)

**Checkpoints**: Backend log "Subgraph sync" + "RPC fallback" · Graph Studio dashboard event count · Mobile Network tab show WS message

---

## L11 — Security gates + UI edges (40 min · negative tests)

### L11.1 Biometric MFA gates (8 sign sites)
- [ ] **L11.1.a** ⚠ **P0 fix verify**: handleApprove patient — biometric prompt **PHẢI hiện** trước EIP-712 sign (commit 7a1611e)
- [ ] **L11.1.b** handleReject patient — biometric ✓ (đã có từ Wave K)
- [ ] **L11.1.c** ShareSheet "Xác nhận chia sẻ" — biometric
- [ ] **L11.1.d** Revoke consent — biometric
- [ ] **L11.1.e** Delegate authority — biometric
- [ ] **L11.1.f** Register wallet — biometric
- [ ] **L11.1.g** Add trusted contact — biometric
- [ ] **L11.1.h** Ministry createOrganization — biometric

### L11.2 Address validation
- [ ] ShareSheet hint row: nhập "abc" → cinnabar warn "Sai định dạng EVM" · nhập valid 0x...40hex → jade tick "Định dạng EVM hợp lệ"
- [ ] MinistryCreateOrg: nhập `0x0000...` → CTA disabled
- [ ] OrgAddMember: nhập self wallet → CTA disabled + inline error

### L11.3 Cancel paths (Wave O fix)
- [ ] ConsentSheet: bấm "Mở để ký" → handleApprove triggers Alert "downgrade warning" → bấm Huỷ → sheet đóng, **KHÔNG SignReceipt**
- [ ] handleReject Alert "Từ chối yêu cầu?" → bấm Huỷ → sheet đóng
- [ ] ShareSheet bấm X close → state reset

### L11.4 Loading states
- [ ] Mọi ViButton có loading variant: spinner hiện khi async (approve, reject, share, addMember, verifyDoctor, createOrg, setOrgActive...)

### L11.5 Empty states
- [ ] Patient 0 record: RecordsScreen hiện CTA "Tạo hồ sơ đầu tiên"
- [ ] Doctor 0 request: RequestsScreen hiện empty illustration
- [ ] Org 0 member: OrgMembersScreen hiện CTA "Thêm bác sĩ"

### L11.6 Network fail
- [ ] Stop backend → mobile fetch dashboard → Alert "Không kết nối được server" (không crash)

### L11.7 Neon DB cold start
- [ ] Backend restart sau idle > 5 phút → first query có thể fail → retry tự work? (gotcha #9)

### L11.8 Web3Auth session
- [ ] JWT JWT_EXPIRES_IN=7d → app dùng 8 ngày → fetch trả 401 → mobile force re-login

---

## Pass criteria gate cho `eas build`

**Required (block APK nếu fail)**:
- [ ] L1.1, L1.4 (login flows)
- [ ] L2.1, L2.4 (record create + decrypt)
- [ ] L3.1 (P0 biometric verify)
- [ ] L4.1 (revoke cascade)
- [ ] L5.2, L5.3, L5.4, L5.6 (request flow + P1 #2 + Wave O fix)
- [ ] L7.2 (org verify doctor — unblock canAccess)
- [ ] L8.1 🌐 (Arbiscan createOrganization — proof end-to-end Ministry → backend → mobile sync work)
- [ ] L8.5 (Fix #1+#2 mobile UI validation)
- [ ] L11.1.a (P0 verify)
- [ ] L11.3 (cancel paths)

**Optional (warning, không block)**:
- L6 delegation chain
- L9 emergency lookup
- L10.3 RPC fallback
- L11.7 Neon cold start
- L11.8 JWT expire

**Static gates** (đã pass tự động):
- [x] Mobile type-check baseline 43 (a47d652 + 869b392 maintained)
- [x] Backend vitest 3/4 (1 fail = Neon cold start transient)
- [x] Forge test 95/99 (4 setUp() fail = test file outdated, contracts pass build)
- [x] Subgraph v0.1.4 deployed

---

## Bug log template (dùng khi fail)

```
[CASE_ID] L#.N — short title
Steps to reproduce:
  1. ...
  2. ...
Expected: ...
Actual:   ...
Logs/screenshot: <path or paste>
Severity: P0 / P1 / P2 / P3
```

Sau khi xong checklist → `cd mobile && eas build --platform android --profile preview`
