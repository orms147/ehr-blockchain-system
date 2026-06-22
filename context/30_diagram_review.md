# 30 — Review TOÀN BỘ biểu đồ (.puml) + đối chiếu góp ý thầy (2026-06-22)

> **Bối cảnh**: owner báo "đã có lỗi biểu đồ trước đó" + gửi lại 11 góp ý thầy. Doc này soi
> **18 sơ đồ PlantUML** trong `Bao Cao/figures/` ĐỐI CHIẾU **CODE HIỆN TẠI** (không tin audit cũ —
> code đã đổi trong phiên 2026-06-22, vd create-record nay ĐÃ gate sinh trắc).
>
> **Phương pháp**: 5 sub-agent song song (Kiến trúc+Data / Use Case / Activity / Sequence / Envelope+Threat),
> mỗi claim dẫn `path:line`, RULE #0. Các điểm "dễ sai của agent" đã được tự verify tay (đính chính inline).
>
> **Quan hệ với review cũ**: [27](27_quyen_review_findings.md) soi TEXT báo cáo + map 11 góp ý;
> [29](29_report_code_consistency_audit.md) soi use-case↔code. Doc 30 này soi **NỘI DUNG .puml** —
> lớp mà 27/29 chưa phủ. **Thứ tự làm vẫn là Phase C** (sau freeze code) như 27 quy định.
>
> **Lưu ý gitignore**: `context/` + `Bao Cao/` đều KHÔNG track. File này được `git add -f` riêng để bền.

---

## 0. TÓM TẮT ĐIỀU HÀNH

**Kết luận**: nội dung kỹ thuật của các sơ đồ phần lớn ĐÚNG bản chất (đặc biệt sơ đồ 17 & 18 vẽ chuẩn
invariant cascade — phần khó nhất luận văn). Nhưng có **một lớp lỗi "viva-dangerous" lặp lại**:

| Loại lỗi | Mô tả | Mức |
|---|---|---|
| **Tên hàm/permit BỊA** | `revokeBySig`, `RevokePermit`, `RecordPermit`, `approveRequestBySig`, `grantDelegation`, `walkToRoot` — **không tồn tại trong code** | 🔴 CRITICAL |
| **Số liệu STALE** | 5 địa chỉ contract cũ (pre-redeploy), subgraph `v0.1.5`→`0.3.0`, "27 Screens"→34, sai signature hàm | 🔴 CRITICAL |
| **Sai precondition/modifier** | `addRecordByDoctor <<onlyVerifiedDoctor>>` (thật: `onlyDoctor`); requestAccess/verifyDoctor đòi "verified" (không enforce) | 🟠 MAJOR |
| **Sai endpoint/event/nguồn sync** | `/api/relayer/grant-consent`→`/grant`; `consent:updated`→`consentUpdated`; "subgraph 30s"→RPC watch 15s | 🟠 MAJOR |
| **Sai kiến trúc luồng** | SĐ 07: approve do **doctor** broadcast 2-step, không phải backend sponsor; SĐ 08: thiếu hẳn lookup CCCD | 🔴 CRITICAL |
| **ER sai entity/field** | SĐ 05: `Notification` không tồn tại; nhiều field/PK sai; thiếu ~7 bảng (đáng kể: `Delegation`) | 🟠 MAJOR |
| **Đọc-được A4 (#10)** | 0/18 render; SĐ 04/05/07/08/18 quá dày khi in A4 — cần tách + đẩy chi tiết sang bảng | 🟡 |
| **Thiếu sơ đồ** | Chưa có `19-envelope` (góp ý #1) + chưa có bảng/hình threat model (#11 — là bảng, không phải hình) | 🟠 |

**Bản chất**: hầu hết là **lỗi tài liệu, KHÔNG phải lỗi code** — chức năng tồn tại đúng, chỉ là sơ đồ viết
"tên đẹp theo trí nhớ" (BySig) thay tên thật, và số liệu chưa cập nhật sau redeploy.

---

## A. 🔴 CRITICAL — phải sửa trước bảo vệ (examiner mở file/contract là thấy sai)

1. **SĐ 03 — 5 địa chỉ contract STALE 100%** (verify tay). `.puml:16-20` ghi địa chỉ cũ; đúng hiện tại
   (khớp `backend/.env` + `mobile/.env`):
   - AccessControl `0x9141ff77c1ef3544C29Fa1dAe5c085185b4FAf5A`
   - ConsentLedger `0x13485F54Cd5bC0C3d06D87B118B0369741b509B0`
   - RecordRegistry `0x3d44D8f5438aF5Bc47b88FE289A699743C9Ef53a`
   - EHRSystemSecure `0x8C03A46022C94D82a863BA2E2fb55f6C488708cb`
   - DoctorUpdate `0x83D7Bd3DCC05307Ed130f0F7331606462d1dD17c`
   - Subgraph `…/120096/ehr/0.3.0` (đang ghi `v0.1.5`). **Đề xuất**: thay đúng, HOẶC chỉ ghi tên + trỏ "xem Phụ lục A" để khỏi stale lần sau.
2. **SĐ 04 — `RecordRegistry.walkToRoot()` không tồn tại** → thật là `parentOf(bytes32)` (`RecordRegistry.sol:312`); walk là internal `_walkToRoot` của `ConsentLedger.sol:191`.
3. **SĐ 04 — `ConsentLedger.revokeBySig()` không tồn tại** → `revoke(grantee,cid)` (`ConsentLedger.sol:345`, msg.sender=patient) hoặc `revokeFor(patient,grantee,cid)` (`:362`, sponsor). Không có BySig.
4. **SĐ 04 — `EHRSystemSecure.approveRequestBySig()` không tồn tại** → `confirmAccessRequestWithSignature(reqId,deadline,sig)` (`EHRSystemSecure.sol:233`) + `confirmAccessRequest(reqId)` (`:178`). (`rejectRequestBySig` thì CÓ thật, `:292`.)
5. **SĐ 04 — `DoctorUpdate.addRecordByDoctor <<onlyVerifiedDoctor>>` SAI** → modifier thật `onlyDoctor` = `isDoctor` (`DoctorUpdate.sol:64-67,87`). Write path KHÔNG đòi verified. (Đúng điểm thầy #2 cần làm rõ.)
6. **SĐ 05 — entity `Notification` không tồn tại** trong `schema.prisma` (`.puml:125-132`). Push token nằm ở `User.expoPushToken` (`schema.prisma:108`). Bỏ entity.
7. **SĐ 07 — sai KIẾN TRÚC duyệt request**: `.puml` vẽ Patient ký → Backend `approveRequestBySig` (sponsored) → consent mint ngay. Thật: Patient ký `ConfirmRequest` → `POST /api/requests/approve-with-sig` chỉ **lưu DB** (`status='signed'`, `request.routes.js:431-491`); **DOCTOR** mới broadcast on-chain 2-step `confirmAccessRequestWithSignature` + `confirmAccessRequest` (delay ≥15s) và **tự trả gas** (`DoctorDashboardScreen.tsx:304`). Không có endpoint `/api/relayer/approve-request`.
8. **SĐ 07 — `requestAccess` sai chữ ký**: `.puml:16` `(patient,cidHash,type,deadline)`. Thật 6 tham số `(patient, rootCidHash, RequestType, encKeyHash, consentDurationHours, validForHours)` — KHÔNG có `deadline` (`EHRSystemSecure.sol:77-84`).
9. **SĐ 14 — "RecordPermit/signRecordPermit" không tồn tại** (grep repo = 0). Tạo hồ sơ KHÔNG ký EIP-712; chỉ `POST /api/records` (relayer) + fallback self-pay `addRecord` (`CreateRecordScreen.tsx:372-483`, `record.routes.js:94`). Gate sinh trắc CÓ nhưng là `gateOrThrow` chạy trước encrypt, KHÔNG gắn permit (`CreateRecordScreen.tsx:439`).
10. **SĐ 16 — "approveRequestBySig"** (như #4) + thiếu bước doctor-claim-on-chain (như #7).
11. **SĐ 17 & 09 — "RevokePermit" + "revokeBySig"** không tồn tại. Revoke chỉ gate **sinh trắc** (`gateOrThrow`) rồi `DELETE /api/records/:cid/access/:grantee` (sponsor `revokeFor`) / self-pay `revoke` — KHÔNG ký EIP-712 (`consent.service.js:218-278`, `ConsentLedger.sol:345,362`).
12. **SĐ 08 — thiếu hẳn entry-point khẩn cấp**: flow thật bắt đầu bằng doctor tra `GET /api/emergency/lookup-by-cccd` (verified-doctor + rate-limit 5/phút, `emergency.routes.js:56`) → `GET /api/trusted-contacts/by-patient/:address` (ghi AccessLog `EMERGENCY_CONTACT_LOOKUP` + push patient, `trustedContact.routes.js:85-124`). Sơ đồ bỏ qua → đúng cái thầy #6 hỏi (ai truy cập, có log/notify không).

---

## B. REVIEW TỪNG SƠ ĐỒ (18)

> Mức: 🔴 critical · 🟠 major · 🟡 minor · 📐 đọc-được A4. Mọi bằng chứng `path:line` từ code hiện tại.

### Kiến trúc & Dữ liệu

#### 02-component-3-layer
- 🟠 **"[27 Screens]" STALE → 34** (verify tay: `screens-v2/*.tsx`=34 = bộ active theo AppNavigator + đúng số báo cáo; `screens/`=27 là thư mục chết). Sửa "27"→"34".
- 🔴 **`[consentLedgerSync]` + `[recordRegistrySync]` vẽ như đang chạy — sai**. `app.js:115` CHỈ start `startSubgraphSync()`; `eventSync` disable (`app.js:32-39`); `recordRegistrySync` "disabled entirely" (`subgraphSync.service.js:12-13`). subgraphSync chỉ **import handlers** của consentLedgerSync rồi dispatch. Sửa: gộp 1 box `[subgraphSync (poll)]`, bỏ/đánh dấu 2 cái kia "(disabled)".
- 🟡 `.md:21` liệt kê `/api/consent`, `/api/notification` — không tồn tại; thật là `/api/access-logs`, `/api/trusted-contacts`, `/api/profile`, `/api/test` (`app.js:82-102`). "[15 routes]" thì đúng (15 file).
- 📐 Mật độ ổn cho A4.

#### 03-deployment
- 🔴 5 địa chỉ + subgraph version STALE — xem mục A.1.
- 🟡 Web3Auth scheme `erhsystem://` nghi gõ nhầm `ehrsystem` — verify `mobile/app.json` trước khi sửa.
- 🟡 `localhost:3001` đúng default (`app.js:46`); các số hạ tầng (Alchemy CU/s, Neon region) không verify từ code — ghi "demo" cho trung thực.
- 📐 Thoáng, dễ đọc.

#### 04-class-contracts (DÀY & SAI NHẤT)
- 🔴 `walkToRoot`, `revokeBySig`, `approveRequestBySig`, `<<onlyVerifiedDoctor>>` — xem A.2–A.5.
- 🟠 `addMember/removeMember(orgId,doctor)` là **DEPRECATED luôn revert** (`AccessControl.sol:401-410`, signature `address org`). Thật: `addOrgMember(uint256,address)` (`:345`) + `removeOrgMember(uint256,address)` (`:364`), gate `isActiveOrgAdmin` inline.
- 🟠 State AccessControl sai: `mapping(address=>uint8) _roles` (không uint256, `:36`); không có `address public ministry` → là `address immutable MINISTRY_OF_HEALTH` (`:33`); members là `isMemberOfOrgById`/`orgMembersByOrgId` (`:43-44`), `orgMembers` là mapping DEPRECATED.
- 🟠 View thật: `isOrganization`/`isVerifiedOrganization` (KHÔNG phải `isOrg`/`isVerifiedOrg`) (`:438-462`).
- 🟠 ConsentLedger thiếu state CHAIN-topology cốt lõi cho invariant: `delegationParent` (`:64`), `delegationEpoch` (`:70`), `delegationParentEpochAtCreate` (`:74`), `consentDelegatorEpochAtGrant` (`:78`), `consentDelegationSource` (`:59`), `recordDelegationSource` (`:106`).
- 🟠 ConsentLedger thiếu hàm: `delegateAuthorityBySig` (`:397`), `grantDelegationInternal` (`:388`), `subDelegate` (`:493`), `revokeSubDelegation` (`:534`), `grantUsingDelegation` (`:563`), `grantUsingRecordDelegation` (`:614`), `setTrustedContact(BySig)` (`:854/:818`), `revokeFor` (`:362`). `grantDelegation` (`:380`) có thật.
- 🟠 EHRSystemSecure: `requestAccess` 6 tham số (A.8); thiếu `confirmAccessRequest`/`rejectRequest`/`pause`. `<<doctor gas>>/<<sponsored>>` không phải solidity modifier — modifier thật `whenNotPaused nonReentrant`; role gate INLINE (`:105-110`).
- 📐 **DÀY NHẤT** — 5 class, ConsentLedger ~16 hàm. **Tách**: (a) 1 class diagram rút gọn (tên class + quan hệ + 3-4 hàm/class), (b) đẩy chi tiết hàm/state/event sang **BẢNG** (đúng yêu cầu thầy #2 — xem mục D).

#### 05-er-prisma
- 🔴 `Notification` không tồn tại (A.6).
- 🟠 `DoctorProfile.verificationStatus` không tồn tại — trạng thái ở `VerificationRequest.status` (`schema.prisma:313-338`).
- 🟠 `Organization`: PK là `id String uuid` (không `orgId Int`); admin = `address`+`backupAdminAddress`; cờ = `isVerified`/`isActive` (không `verified`/`active`); có `chainOrgId BigInt?` (`:430-457`).
- 🟠 `OrganizationMember`: PK `id`; field `memberAddress` (không `walletAddress`), `joinedAt/leftAt` (không `addedAt`) (`:460-473`).
- 🟠 `KeyShare`: **không có cột `source`** (đó là `KeyShareMutationLog.source`, `:223`); thiếu `allowDelegate`; status có cả `pending` (`:176-209`).
- 🟠 `Consent`: **không có `allowDelegate`** (sơ đồ ghi nhầm — allowDelegate ở KeyShare); thiếu `parentConsentId` (`:304`), `grantedAt` (`:290`).
- 🟠 `AccessRequest`: thật `requestId`/`requesterAddress`/`requestType Int`/`signatureDeadline`/`pendingCascadePayloads`; **không có `rejectionReason`** (`:250-279`).
- 🟠 `RecordMetadata`: không có `status`; có `syncStatus` (pending/confirmed/failed) + `txHash`/`recordTypeHash` (`:147-172`).
- 🟠 `User`: **không có cột `role`** (role suy ra on-chain); có `encryptionPublicKey`/`signaturesThisMonth`/`hasSelfWallet`/`expoPushToken` (`:60-117`).
- 🟠 Thiếu ~7 bảng thật: `OrgApplication`, `KeyShareMutationLog`, `AccessLog`, `ArchivedRequest`, `VerificationRequest`, **`Delegation`** (cache CHAIN topology — rất liên quan chương phân quyền), `EventSyncState`, `DoctorCredential`. Schema = 17 model; sơ đồ vẽ 11 (1 sai). Ghi chú "lược bớt" HOẶC tách 2 ER (core / phụ trợ).
- 📐 11 entity ổn; thêm đủ 17 sẽ quá dày → tách 2.

### Use Case

#### 01-usecase-overview
- 🟠 `.md` khai "4+1 actor System" + UC tự động UC-G13/14/15, nhưng `.puml` chỉ vẽ 4 actor + 9 UC (không có System/UC-G13-15). Đồng bộ .md↔.puml.
- 🟡 `.md:69` "12 nhóm" vs `.md:25` "15 nhóm" — thống nhất.
- 📐 Thoáng.

#### 10-usecase-patient
- 🔴 "Web3Auth **7 providers**" không verify-từ-code — `web3authContext.ts:84-92` KHÔNG có `loginConfig`/`uiConfig` (dùng modal mặc định). Đổi thành "các phương thức mặc định của Web3Auth", bỏ con số đếm. (Báo cáo nơi khác dùng 16 — cũng cần soften, xem [29](29_report_code_consistency_audit.md) #13.)
- 🟡 `.md` "18 UC" nhưng `.puml` vẽ 11 — ghi rõ .puml là tập rút gọn.
- ℹ️ UC tạo hồ sơ: create-record **NAY ĐÃ gate sinh trắc** (`CreateRecordScreen.tsx:439`) → đính chính [29](29_report_code_consistency_audit.md) #14 (đã STALE); nếu §5 báo cáo đã bỏ "tạo hồ sơ" khỏi list gate sinh trắc thì **phải thêm lại**.
- 📐 OK A4.

#### 11-usecase-doctor
- 🟠 `.md:54` cite `doctor/DoctorRecordDetailScreen.tsx` **không tồn tại** → dùng chung `RecordDetailScreen.tsx`.
- 🟠 `.md:39-40` "UC-D03/UC-D06 chỉ work khi verified" SAI — `requestAccess` chỉ check `isDoctor||isOrg` (`EHRSystemSecure.sol:105-110`); `addRecordByDoctor` chỉ `onlyDoctor` (`DoctorUpdate.sol:64-67`). Chỉ READ/canAccess cần verified.
- 🟠 `.md:40` "UC-D06 precond: doctor đã được grant record gốc" SAI — write không cần consent.
- 📐 OK; .md "10 UC" vs .puml 11 — ghi rõ.

#### 12-usecase-org
- 🔴 UC "Loại bỏ thành viên bác sĩ" — **chức năng không có trong app**: `removeMember` revert (`AccessControl.sol:407-409`); `removeOrgMember` tồn tại nhưng **không màn nào gọi** (OrgMembersScreen chỉ `addOrgMember` + `revokeDoctorVerification`). Bỏ UC HOẶC wire `removeOrgMember` (quyết định code — xem [29](29_report_code_consistency_audit.md) #3).
- 🟠 `.md:9,31` precond verifyDoctor "org verified=true" SAI — code check `adminToOrgId!=0 && organizations[orgId].active` (`AccessControl.sol:315-317`), tức **active**, không phải verified.
- 📐 Thoáng.

#### 13-usecase-ministry
- 🟠 `.md:33` "UC-M04 setOrgActive: typeword THU HOI" SAI — pause dùng confirm thường; typeword chỉ ở UC-M05 `revokeOrgVerification` (`MinistryOrgDetailScreen.tsx:167-243`).
- 🟠 `.md:49-50` cite `MinistryDashboardScreen` → thật ở `MinistryOrgDetailScreen.tsx`.
- 🟡 `.md:40` "revoke org → mọi doctor mất canAccess" SAI — chỉ gỡ VERIFIED_ORG của ví admin; doctor đã verified KHÔNG ảnh hưởng (UI ghi rõ `:115,187`).
- 🟡 `.md:28` precond "khác Ministry wallet" + "backup bắt buộc" SAI — code không check 2 điều này; backup optional (`AccessControl.sol:109-119`).
- 📐 Thoáng.

### Activity

#### 14-activity-create-record
- 🔴 "RecordPermit/signRecordPermit" — A.9.
- 🟡 Endpoint `/api/relayer/register-record` SAI → `POST /api/records` (`record.routes.js:94`).
- 🟡 Gate sinh trắc đặt sai chỗ: đổi nhãn "ký RecordPermit" → "gateOrThrow trước khi tạo".
- 🟡 (tuỳ chọn) thêm nhánh self-KeyShare backup (`CreateRecordScreen.tsx:525-539`).
- 📐 OK.

#### 15-activity-grant-consent
- 🟠 Endpoint `/api/relayer/grant-consent` → `/api/relayer/grant` (`consent.service.js:163`).
- 🟡 Tên hàm ký `signConsentPermit` → `signGrantConsent` (primaryType `ConsentPermit`) (`eip712.js:71`).
- 🟡 Thiếu nhánh self-pay fallback `grantBySig` (`consent.service.js:162-178`).
- ℹ️ `includeUpdates` đã bỏ — không vẽ field này nếu thuyết minh.
- 📐 OK.

#### 16-activity-request-access
- 🔴 "approveRequestBySig" → `confirmAccessRequestWithSignature` (A.10).
- 🔴 Thiếu bước doctor broadcast on-chain (A.7) — Phase 2 chỉ lưu DB `status='signed'`.
- 🟡 "deadline 7 ngày" SAI — mobile truyền `validForHours=24` (hạn duyệt) khác `consentDurationHours` (thời hạn quyền) (`DoctorRequestAccessScreen.tsx:252`).
- 📐 Dài; **tách** (a) Request+Approve, (b) Doctor claim on-chain + decrypt.

#### 17-activity-revoke-cascade
- 🔴 "RevokePermit/revokeBySig" — A.11.
- ✅ **Invariant vẽ ĐÚNG** (điểm mạnh): B qua A mất khi revoke A; C có direct grant của P vẫn còn (`recordDelegationSource=0` → skip walk). Khớp `_hasValidNormalConsent` (`ConsentLedger.sol:727-734`) + clear-on-direct-grant (`:322`). **Vẽ đúng record-delegation, không nhầm authority-delegation.**
- 📐 Dày (while+nested if) nhưng chấp nhận; có thể gộp 2 if lồng thành 1 guard.

#### 18-activity-trusted-contact
- ✅ Gần như CHÍNH XÁC HOÀN TOÀN: `setTrustedContact(BySig)`, `TrustedContactPermit`/`signTrustedContactPermit`, event `TrustedContactSet/Revoked`, canAccess bypass (Footgun #2, `ConsentLedger.sol:693`), pre-share ceremony — đều khớp code.
- 🟡 source-tag `'trusted-contact'` → thật `'trusted-contact-pre-share'` (`keyShare.routes.js:444`).
- ℹ️ TC là always-on (không TTL) — đúng; khác emergency-witness 24h cũ (đã bỏ).
- 📐 **DÀI NHẤT** — tách (A) đăng ký+ceremony+auto pre-share, (B) TC truy cập+revoke+limitation.

### Sequence

#### 06-seq-grant-consent
- 🟠 Endpoint `/api/relayer/grant-consent` → `/api/relayer/grant` (`relayer.routes.js:311`).
- 🟠 "Footgun #1 fix" nửa vế: `_grantConsent` clear cả `recordDelegationSource` (`:322`) LẪN `consentDelegationSource`+`consentDelegatorEpochAtGrant` (`:331-332`).
- 🟠 Nguồn sync "subgraph 30s" SAI → RPC `watchContractEvent` 15s + catchup 5 phút (`consentLedgerSync.service.js:926,31`).
- 🟠 `POST /api/key-share` ghi **1 row/cidHash**, không tự cascade nhiều version; status mặc định `pending` (không `claimed`) cho share thủ công (`keyShare.routes.js:85,300`).
- 🟡 Bước "backend verify signature" — thật chữ ký verify **on-chain** trong `grantBySig` (`ConsentLedger.sol:266-269`); backend chỉ submit.
- 🟡 `signConsentPermit` → `signGrantConsent`.
- 📐 OK A4.

#### 07-seq-request-access
- 🔴 `approveRequestBySig` + sai kiến trúc 2-step + `requestAccess` thiếu param — A.7, A.8, A.10.
- 🟠 Endpoint reject `/api/relayer/reject-request` không tồn tại → `POST /api/requests/:id/reject` (+ `GET /:id/reject-message`) (`request.routes.js:695,753`); contract-fn `rejectRequestBySig` thì đúng.
- 🟠 Event `consent:updated` → `consentUpdated` (action `granted_to_me`) (`consentLedgerSync.service.js:491`).
- 🟡 Thứ tự enum: DirectAccess=0, **FullDelegation=1, RecordDelegation=2** (`request.service.js:4-5`).
- 📐 **DÀI + 7 cột** → tách Request vs Approve-on-chain+claim.

#### 08-seq-trusted-contact
- 🔴 Thiếu entry-point CCCD lookup + AccessLog/notify — A.12.
- 🟠 source-tag `'trusted-contact'` → `'trusted-contact-pre-share'`; cascade revoke lọc theo (sender=patient, recipient=contact), KHÔNG theo source (`consentLedgerSync.service.js:769-786`).
- ✅ `setTrustedContactBySig` (`:818`), Footgun #2 (`:693`) đúng.
- 📐 Tách Phase A (đăng ký) khỏi Phase B (ER lookup→access).

#### 09-seq-revoke-cascade
- 🔴 "RevokePermit/revokeBySig" — A.11.
- 🟠 Endpoint `/api/relayer/revoke-consent` → `DELETE /api/records/:cidHash/access/:grantee` (walk root rồi `revokeFor`) (`consent.service.js:255`).
- 🟠 Event `consent:updated` → `consentUpdated` (action `revoked/revoked_me/cascade_revoked`) (`consentLedgerSync.service.js:690-691`).
- 🟠 Nguồn sync "subgraph 30s" → RPC watch 15s + catchup 5 phút.
- 🟠 "Tầng 2" thiếu điều kiện `rootCidHash` + lớp cascade-by-sender (`consentLedgerSync.service.js:549-600`).
- ✅ **Footgun #1 (direct grant B sống sót) vẽ ĐÚNG** (`ConsentLedger.sol:322,727-734`).
- 🟡 `.md:67` cite test `test_BugC_...` — verify file `contracts/test/` tồn tại trước khi để trong Quyển.
- 📐 7 cột + note dài → render landscape hoặc gói Phase A thành note.

---

## C. SƠ ĐỒ / BẢNG CÒN THIẾU

### C.1 — `19-envelope-encryption.puml` (góp ý thầy #1) — CHƯA CÓ, cần tạo

Bảng **a–g → sự thật code** (để vẽ ĐÚNG, không bịa):

| # | Yêu cầu thầy | Sự thật code | `path:line` |
|---|---|---|---|
| a | AES-256-GCM khoá đối xứng | Key random **32B**, `'AES-GCM'`, plaintext = JSON FHIR | `crypto.js:16,40,44` |
| b | Niêm phong khoá cho từng người nhận = public key | **NaCl box** (X25519+XSalsa20-Poly1305) seal `{cid,aesKey}`, 1 row/recipient | `crypto.js:98-104`, `nacl-crypto.js:27-39`, `keyShareWriter.service.js:178-198` |
| c | KeyShare gồm trường gì | `cidHash, senderAddress, recipientAddress, encryptedPayload, senderPublicKey, allowDelegate, status, claimedAt, expiresAt` | `schema.prisma:176-209` |
| d | Nonce/IV sinh & lưu | **2 nonce random, KHÔNG KDF**: AES-GCM **IV 12B** prepend → `base64(IV‖ct‖tag)`; NaCl **nonce 24B** lưu `{nonce,ciphertext}` = `encryptedPayload` | IV `crypto.js:38,51-55`; NaCl `nacl-crypto.js:28,35-38` |
| e | AAD có chứa recordId/version/CID? | **KHÔNG CÓ AAD** — `cipher.start({iv})` không truyền `additionalData`. (Bind dữ liệu bằng `cidHash` on-chain + `KeyShare.cidHash`, không bằng GCM AAD.) | `crypto.js:41,77-80` |
| f | Revoke → KeyShare vô hiệu ra sao | `status='revoked'` **VÀ xoá `encryptedPayload=''`**; mọi GET filter status + gate `canAccess` | `keyShareWriter.service.js:401-407`, `keyShare.routes.js:1217-1221` |
| g | GIỚI HẠN: revoke chỉ chặn future | ĐÚNG, code thừa nhận: doctor `createdBy` bị loại khỏi revoke ("cannot un-know it") | `consentLedgerSync.service.js:505-521` |

Bổ sung: `encKeyHash = keccak256(aesKey)` tính **client-side**, lưu on-chain (chỉ hash) (`eip712.js:227-230`, `ConsentLedger.sol:308`).

**ĐỪNG VẼ**: mũi tên AAD (không có); cột `includeUpdates`/`source` trong KeyShare (không tồn tại — drift CLAUDE.md §7).
**Nhãn limitation (g) bắt buộc**: "revoke chặn truy cập TƯƠNG LAI; KHÔNG thu hồi bản người nhận đã giải mã & sao chép."

### C.2 — Bảng threat model (góp ý thầy #11) — là BẢNG (không phải hình)

| # | Đe doạ | Cơ chế phòng / Giới hạn (`path:line`) | Mức |
|---|---|---|---|
| T1 | Máy chủ độc hại / DB leak | Blind mailbox: chỉ NaCl box + cidHash, không secret key (`schema.prisma:184`); TC lưu on-chain backend không tự set (`ConsentLedger.sol:89-96`) | Mitigated |
| T2 | Bác sĩ revoked đã tải data | **Giới hạn thật** — không thu hồi được; chặn future + loại creator khỏi revoke (`consentLedgerSync.service.js:505-521`) | Partial/Out-of-scope |
| T3 | Mất thiết bị bệnh nhân | NaCl secret không persist plaintext (mã at-rest, derive từ chữ ký ví, `nacl-crypto.js:82-94`); Web3Auth cold-start mất key; biometric gate. Mất app=mất AES local (mitigation self key-share) | Partial |
| T4 | Người thân tin cậy bị lạm dụng | canAccess cho TC quyền rộng (`ConsentLedger.sol:686-693`) NHƯNG audit log `TRUSTED_CONTACT_CLAIM` + push patient (`keyShare.routes.js:1493-1539`) + revoke EIP-712 | Partial |
| T5 | Relayer DoS | self-pay fallback (`selfPayFallback.js:43-74`) + rate-limit per-wallet (`rateLimit.js:21-62`); **giới hạn**: rate-limit in-memory, multi-instance cần Redis | Mitigated |
| T6 | IPFS/Pinata mất data | **Chưa xử lý** — không multi-pin/backup; mất CID=mất ciphertext (chain chỉ có cidHash) | Out-of-scope |
| T7 | Replay signature | `nonces[patient]++` + `deadline` + domain bind chainId/contract (`ConsentLedger.sol:249,271,138`); EHRSystem dùng reqId-1-lần + deadline (`:239,261`) | Mitigated |
| T8 | Lộ khoá client | NaCl secret derive + mã at-rest; KHÔNG persist private key Web3Auth; AES qua NaCl box. **Giới hạn**: device root + ví lộ → giải mã được | Partial |
| T9 | Tấn công smart contract | `nonReentrant` + `onlyAuthorized` + ECDSA signer-check + canAccess verified-doctor (audit #3) + epoch walk; 137 test/11 file | Mitigated (trong phạm vi fix) |
| T10 | Race/stale overwrite | timestamp guard `keyShareWriter` + `KeyShareMutationLog` (`keyShareWriter.service.js:129-149`) | Mitigated |

> ⚠️ Cần verify thêm trước khi dùng làm khẳng định mạnh: nội dung `ipfs.service.js` (T6) và `authStore` Web3Auth cold-start (T3/T8) — agent dẫn theo CLAUDE.md, chưa mở file.

---

## D. DỮ LIỆU ĐÚNG để dựng lại SĐ 04 + BẢNG 5 contract & invariant (góp ý thầy #2)

**Bảng 5 contract** (tên/trách nhiệm/state/hàm/ai gọi/revert) — dùng tên đã verify:

- **AccessControl** (`contracts/src/AccessControl.sol`): roles bitwise; `createOrganization onlyMinistry` (`:104`); `verifyDoctor` (caller=active org admin, `:314`); `verifyDoctorByMinistry onlyMinistry` (`:321`); `revokeDoctorVerification` (verifier|Ministry, `:414`); `addOrgMember`/`removeOrgMember` (`isActiveOrgAdmin`, `:345/:364`); `setOrgActive`/`revokeOrgVerification onlyMinistry` (`:220/:429`); DEPRECATED-revert: `addMember/removeMember/registerAsOrganization/verifyOrganization`. View: `isVerifiedDoctor` (`:446`), `isVerifiedOrganization` (`:455`).
- **RecordRegistry**: `addRecord onlyPatient` (`:87`); `addRecordFor` (authorizedSponsors, `:106`); `addRecordByDoctor` (`isDoctor||authorizedContracts`, `:128`); `updateRecordCID` (owner|creator≤1d, `:198`); `parentOf` view (`:312`).
- **ConsentLedger** (trái tim): `grantInternal onlyAuthorized` (`:214`); `grantBySig` EIP-712 (`:239`); `revoke` (patient, `:345`)/`revokeFor` sponsor (`:362`); `grantDelegation` (`:380`)/`grantDelegationInternal` (`:388`)/`delegateAuthorityBySig` (`:397`); `revokeDelegation` bump epoch (`:468`); `subDelegate` (cần parent active+allowSubDelegate, `:493`); `revokeSubDelegation` (direct parent, `:534`); `grantUsingDelegation` (`:563`); `grantUsingRecordDelegation` (cần `allowDelegate=true`, consent mới hardcode `allowDelegate=false`, `:614,651`); `canAccess` (`:679`); `setTrustedContact`/`BySig` (`:854/:818`).
- **DoctorUpdate**: `addRecordByDoctor(cidHash,parent,typeHash,patient,encKeyHash,hours)` **`onlyDoctor` + `nonReentrant`** (`:80-87`); grant doctor-access chỉ khi ROOT (`parent==0`, `:104`). **6 tham số.**
- **EHRSystemSecure**: `requestAccess(...6 args...) whenNotPaused nonReentrant`, role gate inline (`:77-110`); `confirmAccessRequest` (`:178`); `confirmAccessRequestWithSignature` (signer=patient, `:233`); `rejectRequest` (`:266`)/`rejectRequestBySig` (`:292`); `_completeRequest` map 3 RequestType→grantInternal/grantDelegationInternal (`:324-357`); `pause/unpause onlyOwner`.

**Bảng INVARIANT — đã verify khớp code**:

| Invariant thầy yêu cầu | Khớp code? | Bằng chứng |
|---|---|---|
| Chỉ bệnh nhân cấp/thu hồi consent trực tiếp | ✅ | `revoke` đòi `c.patient==msg.sender` (`:351`); `grantBySig` đòi `signer==patient` (`:269`) |
| Bác sĩ chỉ re-delegate khi allowDelegate/allowSubDelegate=true | ✅ | `grantUsingRecordDelegation` revert nếu `!allowDelegate` (`:632`); `subDelegate` revert nếu bit ALLOW_SUB_DELEGATE=0 (`:504`) |
| Quyền phái sinh mất khi gốc revoke (cascade) | ✅ | revoke bump `delegationEpoch` (`:481`); `canAccess` so epoch/source → false (`:727-742`) |
| Quyền DIRECT bệnh nhân KHÔNG bị cascade nhầm | ✅ (Footgun fix) | `_grantConsent` clear `recordDelegationSource`/`consentDelegationSource`/epoch (`:322,331-332`) |

→ SĐ 04 hiện **không** phản ánh các invariant này (thiếu epoch/parent/source + logic canAccess). Bổ sung khi dựng bảng.

---

## E. MAP 11 GÓP Ý THẦY → trạng thái (diagram vs text)

| # | Góp ý | Liên quan biểu đồ? | Trạng thái / việc |
|---|---|---|---|
| 1 | Mã hoá phong bì + sơ đồ + AAD/IV/KeyShare/revoke/limitation | ✅ TẠO `19-envelope` | Mục C.1 (đã có truth-table a–g). Text §4.x: thêm AAD="không có", limitation (g) |
| 2 | Bảng 5 contract + invariant | ✅ SĐ 04 + bảng | Mục D (data đã verify). Sửa SĐ 04 (mục B) + thêm 2 bảng |
| 3 | property/fuzz chain delegation | ❌ text/test | context/27 #3 ✅ đủ (4 test verified) — không phải việc biểu đồ |
| 4 | k6 đủ điều kiện đo | ❌ text/bảng | context/27 #4 🟡 — chờ chạy k6 (bước 4); version "2.0" bịa |
| 5 | compliance 3 mức | ❌ text | context/27 #5 🟡 — reframe "đối chiếu" + 3 mức A/B/C |
| 6 | trusted contact controls + ai truy cập/log/notify | ✅ SĐ 08 + bảng | SĐ 08 thiếu CCCD lookup+log (A.12); "immutable log" overstate (DB mutable) context/27 #4 |
| 7 | relayer anti-replay (domain/nonce/deadline/rate) | 🟡 SĐ 06/07 | context/27 #7 ✅; bảo đảm SĐ thể hiện nonce++/deadline đúng (T7) |
| 8 | bằng chứng triển khai | 🟡 SĐ 03 | SĐ 03 sửa địa chỉ (A.1); thêm demo accounts/.env.example/Docker/QR (sau freeze) context/27 #7 |
| 9 | trích dẫn pháp lý | ❌ text | context/27 #5/#9 — bỏ TT13/2026, sửa ngày TT13/2025 |
| 10 | hình đọc-được A4 | ✅ TẤT CẢ | render 18 puml hi-res; tách SĐ 04/05/07/08/18; bỏ prefix `Hinhve/` (context/27 #8) |
| 11 | threat model | ✅ bảng (không phải hình) | Mục C.2 (T1–T10) |

---

## F. ƯU TIÊN & THỨ TỰ (Phase C — sau freeze code)

1. **Sửa địa chỉ SĐ 03** (A.1) — nhanh, ngăn examiner thấy địa chỉ chết.
2. **Sửa tên hàm/permit toàn bộ SĐ** (A.2–A.5, A.9–A.12) — đồng bộ với code; đây là rủi ro phản biện cao nhất.
3. **Dựng lại SĐ 04** + 2 bảng contract/invariant (mục D) — ăn điểm 2.2.
4. **Tạo `19-envelope`** (C.1) + thêm caveat AAD/limitation vào text.
5. **Sửa SĐ 07/08** kiến trúc (doctor-broadcast 2-step; CCCD lookup+log).
6. **Render 18+1 puml hi-res + tách** SĐ dày (04/05/07/08/18); bỏ prefix `Hinhve/`.
7. Các điểm text (#3–#5,#7–#9) theo [27](27_quyen_review_findings.md).

> **Điểm sáng giữ nguyên**: SĐ 17 & 18 vẽ ĐÚNG invariant cascade + trusted-contact (phần khó nhất) — chỉ sửa tên permit ở 17.
