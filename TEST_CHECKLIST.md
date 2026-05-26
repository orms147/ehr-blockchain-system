# TEST CHECKLIST — Pre-APK build (2026-05-26)

> Chia theo **LOGIC** (không theo role). Các role test **song song** trên nhiều device/emulator. Tổng 48 case, ~5 giờ với 4 device. Tick `[x]` khi pass, ghi note nếu fail.

## Setup tổng (1 lần duy nhất)

| Item | Status |
|---|---|
| Backend `npm run dev` xanh (port 3001) | [ ] |
| Subgraph v0.1.4 healthy (Graph Studio dashboard) | [ ] |
| Device 1: Patient wallet — login Google/email | [ ] |
| Device 2: Doctor wallet — login + verify role on-chain | [ ] |
| Device 3: Org Admin wallet — đã được createOrganization assign | [ ] |
| Device 4: Ministry wallet — JWT có role MINISTRY | [ ] |
| Arbitrum Sepolia explorer mở tab: `https://sepolia.arbiscan.io` | [ ] |
| Graph Studio dashboard mở: query EHR v0.1.4 | [ ] |

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
- [ ] **L7.3** Ministry: MinistryVerifyDoctor → list independent doctors → verify 1 doctor không thuộc org → `verifyDoctorByMinistry` → cùng kết quả VERIFIED_DOCTOR
- [ ] **L7.4** Org admin revoke verification doctor: OrgMembers → row doctor verified → bấm "Thu hồi" → typeword `THU HOI` → tx → doctor mất flag → request mới fail canAccess

**Checkpoints**: DoctorVerified event · VerificationRequest backend status `approved`/`revoked` · Doctor profile `isVerified` flag flip

---

## L8 — Verification (Org + Ministry governance) (35 min · Ministry + 2 admin wallets parallel)

- [ ] **L8.1** Ministry: MinistryCreateOrgScreen → tên "BV Test Wave8" + 2 wallet admin (primary + backup) → biometric → `createOrganization` tx → org appear `/api/admin/organizations` → subgraph index Organization entity
- [ ] **L8.2** Primary admin login: thấy role ORGANIZATION → mở OrgDashboard → org info đúng tên
- [ ] **L8.3** Ministry: MinistryOrgDetail → bấm "Tạm dừng" (setOrgActive false) → tx → org admin thử addOrgMember → revert `NotActiveOrg`
- [ ] **L8.4** Ministry: revokeOrgVerification typeword `THU HOI` → org `isVerified=false` → doctor thuộc org thử request → canAccess fail
- [ ] **L8.5** ⚠ **Fix #1 + #2 verify**:
  - Ministry tạo org với primary = chính Ministry's wallet → CTA disabled + footerHint "Bạn (Ministry) không thể tự làm admin cơ sở mới"
  - Ministry tạo org với primary = `0x000…0000` → CTA disabled + hint "Ví chính không thể là 0x000…"
  - Org admin add member với doctor = chính org admin wallet → CTA disabled + inline error "Bạn là admin tổ chức — không thể tự thêm mình làm thành viên"

**Checkpoints**: OrganizationCreated event · OrganizationStatusChanged event · Backend Organization row sync · Mobile Ministry/Org dashboards refresh đúng

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
- [ ] L8.1, L8.5 (Ministry create + Fix #1+#2)
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
