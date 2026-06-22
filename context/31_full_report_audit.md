# 31 — Audit toàn bộ Quyển báo cáo DATN (tổng hợp 2 lớp adversarial)

> **Ngày:** 2026-06-22
> **Phương pháp:** Kiểm chứng 2 lớp (LỚP-1 sơ duyệt → LỚP-2 đối kháng tự mở lại code/file, cố lật ngược từng verdict). Tuân thủ **RULE #0**: mọi verdict phải có bằng chứng `path:line` / output lệnh / URL văn bản gốc. Claim về nội dung điều/khoản luật bên ngoài codebase được đánh dấu *unverifiable từ repo* (đã web-verify riêng ở mục pháp lý).
> **Mức tin cậy tổng thể:** **high** trên 13/13 mục audit (tất cả `confidence=high`). Mọi issue dưới đây do LỚP-2 đích thân grep/đọc/dẫn `path:line`; một số còn được corroborate bằng `forge test` chạy thực (140/140) và broadcast artifact.
> **Nguồn:** mảng 13 object AUDIT_SCHEMA (đã reconciled) phủ: Tóm tắt VN/EN, Ch1–Ch7, Phụ lục A, Phụ lục B, 18 figures/*.puml, trích dẫn pháp lý + .bib, và hình thức LaTeX/biên dịch.

---

## 1. Bảng tóm tắt

| Mức | Số issue (sau gộp) |
|---|---|
| **CRITICAL** | 9 |
| **MAJOR** | 27 |
| **MINOR** | 27 |
| **Tổng** | **63** |
| verifiedCorrect (spot-check khớp code, cộng dồn các mục) | ~325 |

**Mục cần soát tay (confidence ≠ high):** KHÔNG có. Toàn bộ 13 mục đều `confidence=high`.

**Việc tay BẮT BUỘC trước khi nộp (ngoài phạm vi verify-từ-code):**
- Đối chiếu **nội dung điều/khoản** các văn bản luật cụ thể (Luật KCB 15/2023 Đ69K1, TT 13/2025 Đ3, TT 32/2023 Phụ lục XXVIII, QĐ 586/QĐ-BYT). *Lưu ý:* mục pháp lý LỚP-2 đã **web-verify** và FLIP nhiều mục sang ĐÚNG — xem §3-MINOR-pháp-lý + §6.
- Xác nhận trạng thái **verify source trên Arbiscan** cho bộ địa chỉ LIVE (ngoài repo).
- **Chạy k6** + điền `load-test/RESULTS.md` (hiện là template) hoặc hạ giọng các câu "được đo tải".

---

## 2. DANH SÁCH ISSUES (gộp theo severity, đã gộp trùng giữa các mục)

### 2.A — CRITICAL (9)

> Nhóm "tên hàm/permit/luồng bịa" và "địa chỉ deploy stale" lặp ở NHIỀU file (UC-spec + figures). Sửa một lần, áp dụng đồng bộ mọi vị trí liệt kê.

**C1 — Địa chỉ 5 hợp đồng STALE ở Bảng 4.8, Phụ lục A, figure 03-deployment**
- type: stale-data / stale-address
- claim: Bộ địa chỉ "đang deploy" = AccessControl `0xc6eA2543…251E`, ConsentLedger `0xC316eA3F…436A`, RecordRegistry `0x638365dd…2a69`, EHRSystemSecure `0xc0448D65…DCf1`, DoctorUpdate `0x61cb8e14…f766` (đây là bộ **19/06/2026**). Figure 03 còn dùng **bộ cũ hơn nữa** (`0x5Fb8…`, `0xBFEb…`, `0x910d…`, `0xC17c…`, `0x2549…`).
- truth: Bộ LIVE (redeploy **21/06/2026**, đồng nhất 3 file config + broadcast artifact): AccessControl `0x9141ff77c1ef3544C29Fa1dAe5c085185b4FAf5A`, ConsentLedger `0x13485F54Cd5bC0C3d06D87B118B0369741b509B0`, RecordRegistry `0x3d44D8f5438aF5Bc47b88FE289A699743C9Ef53a`, EHRSystemSecure `0x8C03A46022C94D82a863BA2E2fb55f6C488708cb`, DoctorUpdate `0x83D7Bd3DCC05307Ed130f0F7331606462d1dD17c`.
- evidence: `contracts/broadcast/DeployAll.s.sol/421614/run-latest.json` (5 CREATE tx, mtime Jun 21 21:49); `backend/.env:23-27` ACCESS_CONTROL_ADDRESS=0x9141ff77…; `mobile/.env:16-20`; `subgraph/subgraph.yaml:11,36,62,98`; git `2a8b482` (2026-06-21). 5 prefix trong báo cáo grep ra 0 hit trong mọi config.
- vị trí: `Bao Cao/Chuong/4_Ket_qua_thuc_nghiem.tex:556,562,568-572`; `Phu_luc_A.tex:90-96`; `figures/03-deployment.puml:16-20` + `.md`.
- fix: Thay 5 địa chỉ ở cả 3 nơi bằng bộ LIVE; đổi ngày caption → 21/06/2026. **Nếu cập nhật sang bộ 21/06 thì PHẢI sửa luôn câu "deployer" (xem M-deployer ở §2.B) — bộ 21/06 do ví khác deploy.**

**C2 — `revokeBySig` / `RevokePermit` KHÔNG TỒN TẠI (bịa hàm + bịa permit)**
- type: fabricated-function / fabricated-permit
- claim: Thu hồi consent gửi sponsored tx `revokeBySig`; bệnh nhân ký EIP-712 `RevokePermit`; backend verify chữ ký.
- truth: `revokeBySig`/`RevokePermit` grep toàn repo = 0. Thực tế: `revoke(grantee, cidHash)` (self-pay, `ConsentLedger.sol:345`) và `revokeFor(patient, grantee, cidHash)` (sponsored, `:362`). **Revoke KHÔNG ký EIP-712** — chỉ gate biometric `gateOrThrow`; relayer broadcast `revokeFor`. Route body chỉ nhận `{granteeAddress, cidHash}` (không signature).
- evidence: `ConsentLedger.sol:345,362`; `relayer.service.js:485` functionName `revokeFor`; `consent.service.js:239` comment "user không ký EIP-712 nào" + `:242` gateOrThrow + `:261` self-pay `revoke`; `relayer.routes.js:220-238`; `IConsentLedger.sol:42` event ConsentRevoked (tồn tại đúng).
- vị trí: `2_Khao_sat.tex:200,382,383,402`; `5_Giai_phap_dong_gop.tex` (luồng revoke, qua endpoint — xem C-endpoint); `figures/04-class-contracts.puml:48`, `09-seq-revoke-cascade.puml:21-23`, `17-activity-revoke-cascade.puml:8-11`.
- fix: `revokeBySig`→`revokeFor` (sponsored) / `revoke` (self-pay); xoá bước ký RevokePermit.

**C3 — `approveRequestBySig` / `ApprovePermit` KHÔNG TỒN TẠI**
- type: fabricated-function / fabricated-permit
- claim: Phê duyệt yêu cầu truy cập dùng `approveRequestBySig` + ký EIP-712 `ApprovePermit`.
- truth: Cả hai grep = 0. Hàm thật: `confirmAccessRequestWithSignature(reqId, deadline, signature)` (`EHRSystemSecure.sol:233`); primaryType EIP-712 là **`ConfirmRequest`** (CONFIRM_TYPEHASH `:26-28`). Kiến trúc 2 bước: bệnh nhân ký off-chain (status `signed`) → **bác sĩ broadcast on-chain lúc claim, TỰ TRẢ GAS** (không sponsored).
- evidence: `EHRSystemSecure.sol:233,26-28`; `IEHRSystemSecure.sol:90`; `request.routes.js:400-409` primaryType `ConfirmRequest`, `:483-491` set status `signed`, comment `:505` "consent minted when doctor submits confirmAccessRequest on-chain".
- vị trí: `2_Khao_sat.tex:161,246-248,266` (luồng tạo + approve), `Phu_luc_B.tex:39,53`; `figures/04-class-contracts.puml:71`, `07-seq-request-access.puml:28,30`, `16-activity-request-access.puml:36`.
- fix: `approveRequestBySig`→`confirmAccessRequestWithSignature`; `ApprovePermit`→`ConfirmRequest`; làm rõ bác sĩ tự trả gas khi confirm.

**C4 — `RecordPermit` + "ký EIP-712 khi tạo hồ sơ" KHÔNG TỒN TẠI**
- type: fabricated-api / fabricated-flow-step
- claim: Luồng tạo hồ sơ bệnh nhân ký EIP-712 `RecordPermit` (biometric MFA) rồi gửi sponsored tx `RecordRegistry.addRecord`.
- truth: `RecordPermit`/`RECORD_PERMIT` grep = 0. Tạo hồ sơ **KHÔNG ký EIP-712** — chỉ biometric `gateOrThrow` (xác nhận chủ ý). Nhánh sponsored gọi **`addRecordFor`** (gate `authorizedSponsors`), KHÔNG phải `addRecord`. `addRecord` chỉ là nhánh self-pay (msg.sender phải là patient).
- evidence: `CreateRecordScreen.tsx:439` gateOrThrow, `:472-483` self-pay functionName `addRecord`; `record.service.js:6` `api.post('/api/records', …)` (không signTypedData); `relayer.service.js:427,455` `sponsorUploadRecord`→`addRecordFor`; `RecordRegistry.sol:91-95` (addRecord: isPatient), `:106-118` (addRecordFor: authorizedSponsors).
- vị trí: `2_Khao_sat.tex:161,246-248,266`; `figures/14-activity-create-record.puml:20,23,26`.
- fix: Bỏ "RecordPermit"/"ký EIP-712" khỏi tạo hồ sơ → "xác nhận sinh trắc (gateOrThrow)". Nhánh sponsored = `addRecordFor`; self-pay = `addRecord`.

**C5 — `grantDelegationBySig` KHÔNG TỒN TẠI (UC005)**
- type: fabricated-function-name
- claim: Full delegation gửi sponsored tx `grantDelegationBySig`.
- truth: grep = 0. Hàm sponsored thật là **`delegateAuthorityBySig`** (`ConsentLedger.sol:397`). `grantDelegation` (`:380`) là biến thể patient tự gọi (KHÔNG BySig — nhưng CÓ tồn tại).
- evidence: `ConsentLedger.sol:397,380`; `relayer.service.js:567` functionName `delegateAuthorityBySig`.
- vị trí: `2_Khao_sat.tex:491,507`.
- fix: `grantDelegationBySig`→`delegateAuthorityBySig`.

**C6 — `revokeDelegationBySig` / `RevokeDelegationPermit` KHÔNG TỒN TẠI (UC016)**
- type: wrong-function-name / fabricated-permit
- claim: Thu hồi uỷ quyền ký `RevokeDelegationPermit` + sponsored tx `revokeDelegationBySig`.
- truth: Cả hai grep = 0. Chỉ có **`revokeDelegation(address delegatee)`** — KHÔNG BySig, **KHÔNG sponsored**: mobile gọi trực tiếp bằng ví bệnh nhân, **bệnh nhân tự trả gas**, không ký permit.
- evidence: `ConsentLedger.sol:468`; `IConsentLedger.sol:177`; `delegation.service.js:120-121` "no BySig variant, so the patient pays (tiny) gas", `:144` functionName `revokeDelegation`, `:148` writeContract bằng ví bệnh nhân.
- vị trí: `Phu_luc_B.tex:194-195,208`.
- fix: Bỏ permit + BySig; mô tả `revokeDelegation(delegatee)` gọi trực tiếp, self-pay.

**C7 — Chữ ký `addRecordByDoctor` SAI (UC008): thiếu/đảo tham số**
- type: wrong-signature
- claim: `DoctorUpdate.addRecordByDoctor(patient, cidHash, parentCidHash, recordType)` — 4 tham số, patient đứng đầu, tên `recordType`.
- truth: Hàm thật **6 tham số, thứ tự khác**: `addRecordByDoctor(bytes32 cidHash, bytes32 parentCidHash, bytes32 recordTypeHash, address patient, bytes32 doctorEncKeyHash, uint40 doctorAccessHours)`. Báo cáo đảo thứ tự, thiếu `doctorEncKeyHash`+`doctorAccessHours`, dùng `recordType` thay `recordTypeHash`.
- evidence: `DoctorUpdate.sol:80-87`; lời gọi mobile `DoctorCreateUpdateScreen.tsx:420-428` args `[cidHash, parentCidHash, recordTypeHash, patientAddress, doctorEncKeyHash, 0]`.
- vị trí: `2_Khao_sat.tex:639`.
- fix: Sửa đủ 6 tham số đúng thứ tự.

**C8 — UC008 over-claim cơ chế an toàn ON-CHAIN: "verified + canAccess parent"**
- type: over-claim-precondition
- claim: Bước 5 "Hợp đồng kiểm tra bác sĩ verified + có canAccess hồ sơ parent"; luồng 4a "không canAccess parent → revert Unauthorized"; tiền điều kiện "đã có Consent + đã xác minh chuyên môn".
- truth: Hợp đồng **KHÔNG kiểm cả hai**. `addRecordByDoctor` chỉ có modifier `onlyDoctor` = `isDoctor` (KHÔNG yêu cầu VERIFIED_DOCTOR); thân hàm chỉ validate `patient!=0`, `isPatient(patient)`, `cidHash!=0`. `RecordRegistry._addRecord` chỉ check `cidHash` + parent `exists` (revert `ParentNotExist`). **KHÔNG có lời gọi canAccess/consent trên parent**, KHÔNG có revert `Unauthorized`. Bác sĩ chưa verified vẫn tạo child record. (Đây là over-claim nghiêm trọng vì luận văn lấy on-chain làm core.)
- evidence: `DoctorUpdate.sol:64-66,80-123`; `AccessControl.sol:442-444` (isDoctor) ≠ `:446-448` (isVerifiedDoctor); `RecordRegistry.sol:150-170`.
- vị trí: `2_Khao_sat.tex:631,640,648`.
- fix: Bước 5 → "kiểm role DOCTOR + patient đã đăng ký + parent tồn tại"; xoá 4a; bỏ "verified + Consent" khỏi tiền điều kiện ON-CHAIN (nếu giữ thì ghi rõ là gating tầng UI).

**C9 — UC021 `removeMember` là STUB DEPRECATED (revert) + mâu thuẫn hành vi màn hình**
- type: wrong-function-deprecated-stub
- claim: Org admin gọi `AccessControl.removeMember(orgId, doctor)` để gỡ bác sĩ; bác sĩ KHÔNG mất flag VERIFIED_DOCTOR. Code ref `OrgMembersScreen.tsx`.
- truth: `removeMember(address org, address doctor)` là **STUB**: luôn `emit DeprecatedFunctionCalled` + `revert NotAuthorized()`. Hàm hoạt động là **`removeOrgMember(uint256 orgId, address doctor)`**. Hơn nữa `OrgMembersScreen` thực tế gọi **`revokeDoctorVerification`** (CÓ gỡ flag) — trái với "không mất VERIFIED_DOCTOR".
- evidence: `AccessControl.sol:407-410` (removeMember→deprecated+revert), `:364` (removeOrgMember thật); `OrgMembersScreen.tsx:516` functionName `revokeDoctorVerification`, `:871` addOrgMember.
- vị trí: `Phu_luc_B.tex:376`.
- fix: Thống nhất: nếu "gỡ thành viên thuần (giữ flag)" → `removeOrgMember(orgId,doctor)`; nếu mô tả đúng hành vi màn hình → `revokeDoctorVerification` (CÓ mất flag, trùng UC022).

---

### 2.B — MAJOR (27)

> Nhóm "21 vị trí ký" (xem M-21vs22) lặp ở 4 vị trí (`2_Khao_sat.tex:39,822,840` + `5_Giai_phap_dong_gop.tex:254,272`) — xếp **minor** theo bản chất nhưng ghi chú vì xuất hiện dày.

**M1 — NĐ 13/2023 trong abstract: stale-legal + MÂU THUẪN NỘI BỘ với thân quyển**
- type: stale-legal-citation / internal-inconsistency
- claim: Abstract VN+EN liệt kê "Nghị định 13/2023/NĐ-CP" là văn bản pháp luật trọng yếu, KHÔNG kèm ghi chú hết hiệu lực.
- truth: NĐ 13/2023 **hết hiệu lực 01/01/2026** (thay bởi Luật 91/2025/QH15 + NĐ 356/2025). Thân báo cáo ĐÃ nêu đúng caveat → abstract mâu thuẫn chính thân quyển.
- evidence: `.bib:160` note nd13_2023 "hết hiệu lực 01/01/2026…"; `2_Khao_sat.tex:847,852`; `5_Giai_phap_dong_gop.tex:265` footnote; ĐỐI LẬP `0_3:18`, `0_4:17`.
- fix: Thêm caveat (hoặc thay bằng Luật 91/2025/QH15) vào cả 2 abstract, đồng bộ với footnote đã có.

**M-deployer — "Toàn bộ tx triển khai do ví bảo trợ 0x71aDE459 thực hiện"**
- type: wrong-fact (CHỈ áp dụng nếu cập nhật sang bộ 21/06) — **xem ghi chú FLIP §6**
- claim: Mọi giao dịch triển khai do ví bảo trợ `0x71aDE459…A955` thực hiện.
- truth: **Hai chiều, tuỳ deploy nào báo cáo mô tả:**
  - Nếu báo cáo mô tả deploy **19/06** (như hiện tại, `4_Ket_qua:556`): **CLAIM ĐÚNG** — broadcast 19/06 (`run-1781887024012.json`, từ `0x71ade459…`) = chính ví bảo trợ (`cast wallet address` từ SPONSOR_PRIVATE_KEY = 0x71aDE459). → KHÔNG phải lỗi hiện tại.
  - Bộ **21/06** (`run-latest.json`) do ví khác `0x4564f2fca49afe73aae6ae7691e2a6e8f161281d` (Web3Auth/ministry, tách sponsor) deploy.
- evidence: `run-1781887024012.json` from=0x71ade459…; `run-latest.json` from=0x4564f2fc…; `DeployAll.s.sol:14` deployer=`vm.envAddress('DEPLOYER_ADDR')` (tách `SPONSOR_ADDRESS` `:52`); git `2a8b482`.
- vị trí: `4_Ket_qua_thuc_nghiem.tex:556`.
- fix: Nếu giữ deploy 19/06 → không sửa. Nếu cập nhật địa chỉ sang 21/06 (C1) → ĐỔI câu deployer thành ví Bộ Y tế `0x4564f2fc…`, tách khỏi ví bảo trợ.

**M2 — startBlock 4 dataSources STALE**
- type: stale-data
- claim: Khối khởi đầu dải `278.925.8xx` (AC 825, CL 834, RR 839, EHR 849) — đây là bộ 19/06.
- truth: Bộ LIVE 21/06 dải `279.590.6xx`: AC 279590649, CL 279590663, RR 279590671, EHR 279590680.
- evidence: `subgraph.yaml:13,38,64,100`; `run-latest.json` blockNumber `0x10aa36f9`=279590649; (bộ cũ `run-1781887024012.json` `0x10a01201`=278925825).
- vị trí: `4_Ket_qua_thuc_nghiem.tex:568-571`.
- fix: Cập nhật 4 startBlock theo subgraph.yaml hiện tại, gán đúng contract.

**M3 — Subgraph endpoint version STALE/không nhất quán**
- type: stale-data / inconsistent
- claim: `…/120096/ehr/0.2.6` (Ch4); figure `03-deployment.md` ghi `/ehr/v0.1.5`.
- truth: Config LIVE trỏ **0.3.0** (project id 120096 nhất quán, version lệch).
- evidence: `mobile/.env`/`backend/.env` SUBGRAPH_URL `…/ehr/0.3.0`; `4_Ket_qua:581` "0.2.6"; `figures/03-deployment.md:32` "v0.1.5".
- vị trí: `4_Ket_qua_thuc_nghiem.tex:581`; `figures/03-deployment.md:32`.
- fix: Dùng một version nhất quán (config = 0.3.0) hoặc "phiên bản mới nhất trên Studio".

**M4 — "3 tiến trình đồng bộ blockchain" STALE → thực tế 1 worker subgraph**
- type: stale / stale-flow
- claim: Máy chủ chạy "ba tiến trình đồng bộ sự kiện blockchain" (poll 30s qua 3 worker).
- truth: RPC event-sync workers **đã TẮT từ 2026-04-30 (S17)**; chỉ còn MỘT worker `startSubgraphSync` poll subgraph. 3 file `*Sync*.service.js` cũ còn tồn tại nhưng không được start.
- evidence: `backend/src/app.js:32-39` (comment tắt RPC + import startEventSync bị comment), `:110-115` "zero RPC polling. All event sync via subgraph" + chỉ gọi `startSubgraphSync()`; `subgraphSync.service.js:1,4-13,36` (POLL_MS=30_000, "replaces … RPC polling (S17 2026-04-30)").
- vị trí: `4_Ket_qua_thuc_nghiem.tex:46,70,581`.
- fix: "một tiến trình đồng bộ qua bộ chỉ mục The Graph" (giữ chu kỳ 30s). **Đây là DRIFT cũng tồn tại trong CLAUDE.md — xem §4.**

**M5 — Endpoint sai: `/api/relayer/grant-consent` (thực: `/grant`)**
- type: wrong-endpoint
- claim: Mobile POST `/api/relayer/grant-consent`.
- truth: Route thật `POST /api/relayer/grant` (→ sponsorGrantConsent → on-chain grantBySig). `/grant-consent` không tồn tại (chỉ có GET `/grant-context`).
- evidence: `relayer.routes.js:311` post `/grant`, `:253` get `/grant-context`; `consent.service.js:163` `api.post('/api/relayer/grant', …)`; `relayer.service.js:496,515` sponsorGrantConsent→grantBySig.
- vị trí: `5_Giai_phap_dong_gop.tex:245`; `figures/06-seq-grant-consent.puml:21`.
- fix: → `POST /api/relayer/grant`.

**M6 — Endpoint sai: `/api/relayer/approve-request` (thực: `/api/requests/approve-with-sig`)**
- type: wrong-endpoint
- evidence: `request.routes.js:431` post `/approve-with-sig` (mount `/api/requests`).
- vị trí: `figures/07-seq-request-access.puml:29`.
- fix: → `POST /api/requests/approve-with-sig`.

**M7 — Endpoint sai: `/api/relayer/reject-request` (thực: `/api/requests/:requestId/reject`)**
- type: wrong-endpoint
- truth: On-chain `rejectRequestBySig` đúng tên; permit primaryType là **`RejectRequest`** (không phải RejectPermit).
- evidence: `request.routes.js:753,734`; `EHRSystemSecure.sol:292`.
- vị trí: `figures/07-seq-request-access.puml:39`.
- fix: → `/api/requests/:requestId/reject`; `RejectPermit`→`RejectRequest`.

**M8 — Endpoint sai: `/api/relayer/revoke-consent` (thực: `/revoke`)**
- type: wrong-endpoint
- evidence: `relayer.routes.js:220` post `/revoke`; grep `revoke-consent`=0.
- vị trí: `figures/09-seq-revoke-cascade.puml:22`.
- fix: → `POST /api/relayer/revoke`.

**M9 — UC013 luồng phê duyệt "cả hai nhánh đều sponsored" SAI**
- type: wrong-flow
- claim: Bước 2 "phê duyệt hoặc từ chối, cả hai đều sponsored qua relayer".
- truth: Chỉ nhánh **TỪ CHỐI** sponsored (`rejectRequestBySig`). Nhánh **PHÊ DUYỆT**: bệnh nhân ký off-chain (status `signed`, consent CHƯA mint); confirm on-chain do **bác sĩ broadcast lúc claim (tự trả gas)**, KHÔNG có hàm sponsor relayer cho nó.
- evidence: `relayer.service.js:831` (chỉ rejectRequestBySig sponsored); `request.routes.js:483-491,505`; `confirmAccessRequestWithSignature` grep relayer = 0.
- vị trí: `2_Khao_sat.tex:187`.
- fix: Tách rõ 2 nhánh như truth.

**M10 — Error code bịa: `CID_RESERVED` / `PATIENT_NOT_REGISTERED` (UC001 9a)**
- type: fabricated-error-code
- truth: Custom error thật RecordRegistry: `NotPatient()`, `EmptyCID()`, `RecordExists()`, `NotOwner`/`ParentNotExist`/`RecordNotExist`.
- evidence: `RecordRegistry.sol:92,93,158`; grep CID_RESERVED/PATIENT_NOT_REGISTERED = 0.
- vị trí: `2_Khao_sat.tex:260`.
- fix: → `RecordExists` / `NotPatient`.

**M11 — Error code bịa `DOCTOR_NOT_VERIFIED` + SAI mô hình (UC002 9a)**
- type: fabricated-error-code / wrong-model
- claim: Grant cho bác sĩ chưa verified → revert `DOCTOR_NOT_VERIFIED`, không tạo KeyShare.
- truth: `DOCTOR_NOT_VERIFIED` grep=0. `grantBySig`/`_grantConsent` **KHÔNG revert** vì grantee chưa verified — chỉ revert `grantee==address(0)`/`EmptyCID`/`InvalidExpire`. Grant tx **VẪN THÀNH CÔNG** (KeyShare vẫn tạo); chặn nằm ở `canAccess` read-time trả `false`.
- evidence: `_grantConsent` revert `ConsentLedger.sol:291-293`; verified-doctor gate ở canAccess `:700` (return false, không revert).
- vị trí: `2_Khao_sat.tex:331`.
- fix: Bỏ error; mô tả đúng cơ chế read-time gate.

**M12 — code-ref bịa `eip712.js(signConsentPermit)` (thực: `signGrantConsent`)**
- type: fabricated-function-name
- evidence: grep signConsentPermit=0; `eip712.js:71` `export async function signGrantConsent`.
- vị trí: `2_Khao_sat.tex:337`.
- fix: → `signGrantConsent`.

**M13 — code-ref bịa `approveRequestBySig` (UC006) (thực: `confirmAccessRequestWithSignature`)**
- type: fabricated-function-name
- evidence: grep=0; `EHRSystemSecure.sol:233`.
- vị trí: `2_Khao_sat.tex:567`.
- fix: → `confirmAccessRequestWithSignature`.

**M14 — File không tồn tại: `DoctorRecordDetailScreen.tsx`**
- type: nonexistent-file
- truth: `screens-v2/doctor/` không có file này; màn đọc/giải mã là `screens-v2/RecordDetailScreen.tsx` (dùng chung mọi role).
- evidence: ls `screens-v2/doctor/`; `RecordDetailScreen.tsx:485` handleShare.
- vị trí: `2_Khao_sat.tex:612`.
- fix: → `mobile/src/screens-v2/RecordDetailScreen.tsx`.

**M15 — UC005 over-claim "VERIFIED_DOCTOR" cho full delegation**
- type: overclaim / wrong-precondition
- claim: Precondition/step3/3a/field yêu cầu bác sĩ uỷ quyền "đã verified (VERIFIED_DOCTOR)".
- truth: Mobile chỉ check `ctx.isDoctor === false` (`delegation.service.js:75`), KHÔNG check isVerifiedDoctor. Contract `delegateAuthorityBySig` cũng không enforce verified. Bác sĩ chưa verified vẫn được full delegation (chỉ không đọc do canAccess audit #3 ở READ path).
- evidence: `delegation.service.js:75`; grep verified trong DelegationScreen.tsx=0; `relayer.service.js:766` isVerifiedDoctor (trả nhưng không gate); `ConsentLedger.sol:397-431`.
- vị trí: `2_Khao_sat.tex:481,488,499,518`.
- fix: → "đã đăng ký vai trò Bác sĩ (isDoctor)"; bỏ VERIFIED_DOCTOR.

**M16 — UC008 precondition/modifier sai (lặp class với C8) + `Unauthorized` không tồn tại**
- type: wrong-precondition/modifier
- evidence: `DoctorUpdate.sol:64-65,89-91`; `RecordRegistry.sol:135`; grep `Unauthorized` trong EHRSystemSecure/DoctorUpdate = 0.
- vị trí: `2_Khao_sat.tex:631,640,648`.
- fix: Như C8 (gộp).

**M17 — `grantUsingRecordDelegation` CAP-not-revert (UC009 4a)**
- type: wrong-behavior
- claim: Thời hạn dài hơn của A → revert.
- truth: KHÔNG revert — hợp đồng **CAP** xuống `expireAt` của A. Chỉ revert `InvalidExpire` khi finalExpiry đã quá khứ.
- evidence: `ConsentLedger.sol:637-642` (finalExpiry=senderConsent.expireAt khi >), `:643` revert chỉ cho quá khứ.
- vị trí: `2_Khao_sat.tex:691`.
- fix: → "tự cắt xuống bằng thời hạn của A (không revert)".

**M18 — UC013 "lưu lý do từ chối off-chain" CHƯA implement**
- type: unimplemented-feature
- truth: Reject access-request KHÔNG lưu lý do; route chỉ update `{status:'rejected', txHash}`; model `AccessRequest` KHÔNG có `rejectionReason` (field đó ở model `VerificationRequest`). Mobile truyền `null` (comment "defer until UX Q3").
- evidence: `request.routes.js:802-805,752`; `schema.prisma:250-279` vs `:331`; `RequestsScreen.tsx:683`.
- vị trí: `Phu_luc_B.tex:71,77,80,91`.
- fix: Bỏ claim "nhập lý do"/"lưu rejectionReason" hoặc đánh dấu dự kiến.

**M19 — UC016 `delegationEpoch` mô tả sai chiều + `_delegations` không bị xoá**
- type: wrong-state-variable
- claim: Tăng `delegationEpoch[patient]`; xoá `_delegations[patient][grantee]`.
- truth: `delegationEpoch` là mapping 2 chiều `[patient][delegatee]` (uint64); bump `delegationEpoch[msg.sender][delegatee]+=1`. `_delegations` chỉ **clear bit ACTIVE** (`data & ~(1<<ACTIVE_BIT)`), không xoá.
- evidence: `ConsentLedger.sol:70,481,475`.
- vị trí: `Phu_luc_B.tex:196`.
- fix: Mô tả đúng chiều + clear cờ active.

**M20 — UC018 "upload ảnh Pinata + retry 3 lần" CHƯA implement (mock)**
- type: unimplemented-feature
- truth: `CredentialSubmitScreen` KHÔNG upload Pinata; comment "Mock IPFS upload", `fakeCid='mock-…'`; không có retry.
- evidence: `CredentialSubmitScreen.tsx:221,223,231,232`; grep retry=0.
- vị trí: `Phu_luc_B.tex:274,281`.
- fix: → "documentCid là placeholder mock IPFS (chưa upload thật)"; bỏ retry.

**M21 — UC018 lưu vào model sai: `DoctorProfile` (thực: `VerificationRequest`)**
- type: wrong-model
- evidence: `verification.routes.js:208` `prisma.verificationRequest.create`; `schema.prisma:313,328`.
- vị trí: `Phu_luc_B.tex:275`.
- fix: → `VerificationRequest`.

**M22 — UC020 màn hình + luồng typeword sai**
- type: wrong-screen-and-flow
- claim: Mở `MinistryDashboardScreen`; pause/resume yêu cầu gõ "THU HOI".
- truth: `setOrgActive` ở `MinistryOrgDetailScreen.tsx` (grep trong Dashboard=0). Typeword "THU HOI" CHỈ gate `revokeOrgVerification` (modal danger), KHÔNG gate pause/resume (modal pause "warn — no typeword").
- evidence: `MinistryOrgDetailScreen.tsx:73,17,40,236,203,218`.
- vị trí: `Phu_luc_B.tex:350,352,366`.
- fix: → `MinistryOrgDetailScreen.tsx`; bỏ typeword khỏi pause/resume.

**M23 — UC012 hậu điều kiện "status: approved" (không tồn tại)**
- type: wrong-state-variable
- truth: Không có status `approved`. Enum: `pending, signed, claimed, rejected, expired`. Ký duyệt → `signed`; claim xong → `claimed`. Backend có comment loại bỏ `approved`.
- evidence: `schema.prisma:257`; `request.routes.js:486,560,892,884-887`.
- vị trí: `Phu_luc_B.tex:49`.
- fix: → `signed`/`claimed`.

**M24 — figure 04: `_requests`/`Request` + `nonces` sai (EHRSystemSecure state)**
- type: fabricated-state / wrong-name
- truth: State là `_accessRequests` → `IEHRSystem.AccessRequest` (`:42`); EHRSystemSecure **KHÔNG có** mapping `nonces` (replay chống bằng reqId+status+deadline). (Bảng 4.x Ch4 cũng ghi `_requests` — gộp.)
- evidence: `EHRSystemSecure.sol:42`; grep nonce trong file=0.
- vị trí: `figures/04-class-contracts.puml:67-68`; `4_Ket_qua_thuc_nghiem.tex:169`.
- fix: → `_accessRequests`/`AccessRequest`; xoá nonces.

**M25 — figure 04: enum `RequestType` SAI THỨ TỰ (ordinal)**
- type: wrong-enum-order
- claim: `{DirectAccess, RecordDelegation, FullDelegation}`.
- truth: `{DirectAccess, FullDelegation, RecordDelegation}` → DirectAccess=0, FullDelegation=1, RecordDelegation=2. reqType cast uint8 nên ordinal load-bearing.
- evidence: `IEHRSystemSecure.sol:9` (và `IEHRSystem.sol`).
- vị trí: `figures/04-class-contracts.puml:76-80`.
- fix: Đổi thứ tự.

**M26 — figure 04: `getPatientRecords` + `walkToRoot` trên RecordRegistry SAI**
- type: fabricated-function / wrong-location-visibility
- truth: RecordRegistry KHÔNG có `getPatientRecords` (getter thật `getOwnerRecords:316`); KHÔNG có `walkToRoot` — root-walk là `_walkToRoot` **internal** của ConsentLedger (`:191`) gọi `recordRegistry.parentOf` (`:195,312`).
- evidence: `RecordRegistry.sol:305,316,324,312`; `ConsentLedger.sol:191,195`.
- vị trí: `figures/04-class-contracts.puml:33,34,88`.
- fix: `getPatientRecords`→`getOwnerRecords`; bỏ walkToRoot khỏi RecordRegistry; arrow → `parentOf`.

**M27 — figure 05 ER Prisma: thực thể/trường BỊA (Notification, User.role, DoctorProfile.verificationStatus)**
- type: fabricated-entity / fabricated-field
- truth: KHÔNG có model `Notification` (push qua `User.expoPushToken:108` + socket.io). User KHÔNG có cột `role` (role on-chain bitwise). DoctorProfile KHÔNG có `verificationStatus` (status ở `VerificationRequest.status`).
- evidence: grep `model Notification`=0; `schema.prisma` User:60-117, DoctorProfile:120-132, VerificationRequest:313.
- vị trí: `figures/05-er-prisma.puml:19,32,125-132,149`.
- fix: Xoá Notification + 2 field bịa.

---

### 2.C — MINOR (27)

**m1 — Abstract over-claim "được đánh giá hiệu năng bằng k6"** — k6 framework tồn tại nhưng CHƯA chạy: `load-test/results/` chỉ `.gitkeep`; `RESULTS.md` là template (`vX.Y.Z`, `<CPU>`, "fill sau khi run"). Comment R9 (`0_3:12`, `0_4:11`) tự nói số sẽ bổ sung sau. → hạ giọng "được thiết kế kịch bản k6". `0_3:18`, `0_4:17`.

**m1b — Ch6 over-claim "được đo tải … kết quả ở 4.4.2"** (cùng gốc m1): tự mâu thuẫn mục 4.4.2 đang là placeholder (`4_Ket_qua:488` "[CHƯA ĐO LẠI]", bảng tab:k6-results toàn ⟨đo⟩; `context/24:39` "TODO — cần backend live"). `6_Ket_luan.tex:30`. → đổi "được đo tải" → "được thiết kế ba kịch bản (10/50/200)".

**m2 — "21 vị trí ký" lệch đếm thô (=22)** — đếm thẳng `gateOrThrow(` trong active set (screens-v2 + services + utils/eip712.js, loại screens/ chết + biometricGate.ts) = **22**, không phải 21. Con số phụ thuộc tiêu chí gộp service↔screen. Vị trí: `2_Khao_sat.tex:39,822,840`; `5_Giai_phap_dong_gop.tex:254,272`. → sửa 21→22 ở CẢ 5 chỗ hoặc nêu rõ tiêu chí đếm.

**m3 — "self-share guard / không thể tự chia sẻ" KHÔNG tồn tại + "3 lớp kiểm tra"** — `handleShare` không so address với ví user; chuỗi "Không thể tự chia sẻ" không có (chỉ "Không thể tự yêu cầu" ở luồng BÁC SĨ `DoctorRequestAccessScreen.tsx:203`). Contract `_grantConsent` chỉ cấm `grantee==address(0)`. `RecordDetailScreen.tsx:485-589`; `ConsentLedger.sol:291`. Vị trí: `2_Khao_sat.tex:174,314,328`. → bỏ self-share guard, sửa "3 lớp"→"2 lớp" (định dạng ví + downgrade).

**m4 — UC002 default thời hạn "30 ngày" (thực: 7 ngày)** — `shareExpiryHours` default `24*7`=7 ngày; 30 ngày chỉ là option picker. (KHÁC UC005 nơi default 30 ngày ĐÚNG.) `RecordDetailScreen.tsx:217,1687-1688`. Vị trí: `2_Khao_sat.tex:312`. → "mặc định 7 ngày".

**m5 — UC006 step3a "revert Unauthorized" (thực: InvalidRequest) + precondition verified** — `requestAccess` không check verified; sai role → `InvalidRequest` (không `Unauthorized`). `EHRSystemSecure.sol:105,109`; grep Unauthorized=0. Vị trí: `2_Khao_sat.tex:560`. → `InvalidRequest`; ghi rõ "đã xác minh" là yêu cầu nghiệp vụ.

**m6 — UC006 step8 bỏ sót nhánh FullDelegation** — `_completeRequest` gọi `grantInternal` cho DirectAccess/RecordDelegation nhưng `grantDelegationInternal` cho FullDelegation. `EHRSystemSecure.sol:332,341,351`. Vị trí: `2_Khao_sat.tex:553`. → bổ sung FullDelegation→grantDelegationInternal.

**m7 — UC010 field name "≤ 200 ký tự" (thực: ≤120 UI; contract chỉ không-rỗng)** — `MinistryCreateOrgScreen.tsx:202` slice(0,120), `:228` "/ 120"; `AccessControl.sol:110` chỉ check không rỗng. Vị trí: `2_Khao_sat.tex:753`. → "≤120 ký tự (UI)".

**m8 — UC011 từ chối "không trong scope demo" misleading** — `rejectVerification` ĐÃ implement (off-chain): `OrgPendingVerificationsScreen.tsx:371,380`→`verification.service.js:28-33` POST `/api/verification/review` (approved:false); KHÔNG phải hàm contract. Vị trí: `2_Khao_sat.tex:793`. → "Từ chối được hỗ trợ off-chain, không có thao tác on-chain".

**m9 — UC014 handler name `handleCccdSave` (thực: `handleSaveCccd`)** — `TrustedContactsScreen.tsx:168,654`. Vị trí: `Phu_luc_B.tex:130`. → `handleSaveCccd`.

**m10 — UC015 cascade source value sai + chạy ở worker (không relayer route)** — pre-share tag `trusted-contact-pre-share`, revoke ghi `trusted-contact-revoked` (không có `trusted-contact` trơn); query cascade lọc theo sender+recipient+status (KHÔNG theo source). Cascade ở `consentLedgerSync.service.js:749,769-776,783` khi nhận event `TrustedContactRevoked`, không ở `relayer.routes.js:350-371`; pre-share tag `keyShare.routes.js:444`. Vị trí: `Phu_luc_B.tex:158`. → mô tả đúng worker + source value.

**m11 — UC018 fields thừa "năm kinh nghiệm, mô tả"; "tên bệnh viện" là dropdown** — schema/form chỉ thu `fullName, licenseNumber, specialty, organization(dropdown)`. `verification.routes.js:114-121`; `CredentialSubmitScreen.tsx:105-107`. Vị trí: `Phu_luc_B.tex:272`. → bỏ 2 field; "tên bệnh viện"→chọn tổ chức.

**m12 — UC023 `revokeOrgVerification(orgId)` sai kiểu tham số (thực: address org)** — `AccessControl.sol:429` `revokeOrgVerification(address org)`; mobile `MinistryOrgDetailScreen.tsx:106,185`. Vị trí: `Phu_luc_B.tex:378`. → `revokeOrgVerification(org)` (address admin tổ chức).

**m13 — `5_Giai_phap`: source pre-share = `'trusted-contact'` (thực: `'trusted-contact-pre-share'`)** — `keyShare.routes.js:444,73`. Vị trí: `5_Giai_phap_dong_gop.tex:182`. → thêm hậu tố `-pre-share`.

**m14 — `5_Giai_phap`: "nhận khoá hồ sơ được chia sẻ" được biometric gate (SAI)** — claim path KHÔNG có gate: `keyShare.service.js` grep gateOrThrow/requireBiometric = 0; `claimKey:36` chỉ post. Gate bác sĩ thật chỉ: lưu cập nhật, gửi yêu cầu, xác nhận yêu cầu. Vị trí: `5_Giai_phap_dong_gop.tex:258`. → bỏ "nhận khoá".

**m15 — `5_Giai_phap`: emergency access loại bỏ "commit 2026-05-04" (thực: 2026-05-05)** — `git log | grep 2026-05-04`=rỗng; commit `e2d2788`/`ce6a9c7`/`9a7543b` đều 2026-05-05. Vị trí: `5_Giai_phap_dong_gop.tex:165`. → 2026-05-05 (hoặc bỏ ngày).

**m16 — `5_Giai_phap`: PIN "làm lớp xác thực thứ hai bên cạnh chữ ký" over-claim mức tích hợp** — hạ tầng PIN tồn tại đúng (SHA-256+salt, SecureStore) NHƯNG chưa nối vào luồng ký; khi `!hasHardware||!isEnrolled` thì `requireBiometric` chỉ `return true` (không gọi PIN). `pinService.ts:14-17` "infrastructure-only"; `biometricGate.ts:104-108`. Vị trí: `5_Giai_phap_dong_gop.tex:266`. → "cung cấp hạ tầng PIN dự phòng" (tránh ngụ ý đã wired).

**m17 — Ch3:27 "AES-GCM không cần thư viện ngoài" MÂU THUẪN code** — RN không có Web Crypto nên BẮT BUỘC dùng `node-forge` (external). `crypto.js:4` comment "Web Crypto API is unavailable", `:7` import forge; `package.json:62` node-forge dependency. expo-crypto chỉ hashing (`pinService.ts:20`). Vị trí: `3_Cong_nghe.tex:27`. → sửa lý do; nêu hardware-accel chỉ áp dụng phía máy chủ.

**m18 — Ch3:99 "phát hiện offline rồi fallback socket→push" SAI** — code gọi `emitToUser` + `await sendPushToWallet` VÔ ĐIỀU KIỆN song song; không có check online. `request.routes.js:830,841`; `socket.service.js` (1-77, không có isUserOnline). Vị trí: `3_Cong_nghe.tex:99`. → "đồng thời socket (foreground) + push (background)".

**m19 — Ch3:97 số kết nối Neon (3-5 / >100) không nguồn + không \cite** — đặc tính gói nhà cung cấp, không có trong repo; câu không \cite. Vị trí: `3_Cong_nghe.tex:97`. → thêm URL pricing Neon hoặc hạ giọng.

**m20 — Ch3:81 MPC/threshold-key Web3Auth (đặc tính bên thứ ba)** — không hiện diện trong repo (chỉ `network=SAPPHIRE_DEVNET` + whiteLabel `web3authContext.ts:86,89`); câu CÓ `\cite{web3auth}` → kiểm cite trỏ đúng trang mô tả cơ chế. Vị trí: `3_Cong_nghe.tex:81`.

**m21 — Bảng 4.5/4.x thư viện: prisma "5.x" (thực: 6.x)** — `backend/package.json` `@prisma/client`/`prisma` đều `^6.0.0`. Vị trí: `4_Ket_qua_thuc_nghiem.tex:317`. → "6.x".

**m22 — Bảng thư viện: `expo-server-sdk` + `graphql-request` KHÔNG có trong backend/package.json** — push dùng Expo HTTP API trực tiếp (`push.service.js:2-3,10` "no SDK dependency"); subgraph dùng helper `gql` nội bộ (`subgraphSync.service.js:206`). Vị trí: `4_Ket_qua_thuc_nghiem.tex:320,323`. → bỏ/đổi mô tả.

**m23 — Bảng 4.x: `registerAsPatient/Doctor` ký hiệu slash gây hiểu nhầm là 1 hàm** — thực 2 hàm riêng. `AccessControl.sol:258,264`. Vị trí: `4_Ket_qua_thuc_nghiem.tex:161`. → ghi rõ 2 hàm.

**m24 — Bảng 4.8 caption: "đã verify source trên Arbiscan" unverifiable từ repo** — broadcast chỉ chứng minh DEPLOY, không VERIFY. Cần kiểm tay với bộ địa chỉ LIVE. Vị trí: `4_Ket_qua_thuc_nghiem.tex:556,562`.

**m25 — figure 05 ER: nhiều field/PK lệch tên** (gộp các finding ER minor):
- KeyShare có `allowDelegate` (`:191`), KHÔNG `source` (source ở `KeyShareMutationLog:223`); Consent KHÔNG có `allowDelegate`. (`05-er-prisma.puml:75,87`)
- AccessRequest: `requestId`(`:252`) not onChainRequestId; `requesterAddress`(`:253`) not doctorAddress; `requestType Int`(`:256`) not Enum; KHÔNG có reason/rejectionReason. (`:104-112`)
- RecordMetadata: `syncStatus`(`:158`) not status enum. (`:62`)
- User PK=`id`(uuid,`:61`), walletAddress @unique; Organization PK=`id`(`:431`), fields `address/backupAdminAddress/isActive/isVerified/chainOrgId`; OrganizationMember dùng `memberAddress`(`:463`)/`joinedAt`(`:466`). (`:5,36-50`)
- → dùng tên cột thật hoặc đánh dấu ER khái niệm.

**m26 — figure 04: chữ ký/kiểu lệch** (gộp):
- `delegationEpoch` là `mapping(address=>mapping(address=>uint64)) public`(`:70`), không phải `mapping(address=>uint256)`. (`04:43`)
- AccessControl: `addMember/removeMember/revokeOrgVerification` nhận **address** (không orgId); role check `isOrganization()`(`:451`) không `isOrg`. (`AccessControl.sol:401/407/429/451`)
- AccessControl state box: `_roles uint8`(`:36`) không `roles uint256`; `orgMembersByOrgId mapping(uint256=>address[])`(`:43`), bare `orgMembers`(`:47`) DEPRECATED; `MINISTRY_OF_HEALTH` immutable(`:33`) không `ministry`. (`04:6,8,9,17,18,20`)
- `requestAccess` 6-param: `(patient, rootCidHash, reqType, encKeyHash, consentDurationHours, validForHours)` — KHÔNG có `deadline`. (`EHRSystemSecure.sol:77-84`; `04:70`, `07:16`, `16:16`)

**m27 — figure 02: "27 Screens" (thực: ~34)** — 27 là số file thư mục CHẾT `mobile/src/screens/`; active `screens-v2/`=34; AppNavigator=39 `.Screen`. Vị trí: `figures/02-component-3-layer.puml:7`. → ~34.

**Pháp lý (unverifiable từ code; LỚP-2 đã web-verify nhiều mục — xem §6):**
- Luật KCB 15/2023 Đ69K1 hiệu lực 01/01/2024 (`1_Gioi_thieu.tex:24`); TT 13/2025 Đ3 sinh trắc học (`:25`); TT 32/2023 Phụ lục XXVIII 29 mẫu (`:49`, web-verify ĐÚNG); QĐ 586/QĐ-BYT (`1_Gioi_thieu.tex:17`, `.bib qd586` thiếu url). → đối chiếu văn bản gốc, bổ sung url cho qd586.

**Citation integrity (LaTeX):**
- **5 entry .bib KHÔNG được \cite + không \nocite{*}** → biblatex sẽ KHÔNG in chúng trong references: `luatgddt2023, luatanm2018, nd53_2022, blds2015, kcb_vn`. 3 luật đầu là **căn cứ load-bearing** ở bảng compliance (`2_Khao_sat.tex:39,844,846`) nhưng nêu bằng tên trong prose mà không \cite → references thiếu căn cứ. `quyen.tex:60,312`; `.bib:164-196,171-176,209-213`. → \cite 3 luật (tối thiểu), xử lý 2 entry mồ côi.
- ct17_ttg thiếu year/ngày/url (`.bib:192-196`); tt13_2025_byt note thiếu ngày ban hành 06/06/2025, url trỏ trang giới thiệu (`.bib:122-123`).
- Ch7:14 liệt kê "paper khảo sát 2022-2025" CHƯA tồn tại trong .bib (`.bib:72` còn comment TODO; chỉ có MedRec 2016 + BHEEM 2018). Ch7:16 xếp "HL7 FHIR R4, DICOM" vào "Tiêu chuẩn quốc tế" nhưng KHÔNG có entry FHIR/DICOM/HL7 (grep=0). → hoàn thành TODO hoặc sửa câu.
- Leftover comment tác giả trong .tex (không in PDF nhưng là dấu chưa đóng): `% R4: verify điều luật` (`6_Ket_luan.tex:32,34,44,83,91`), `% R9` (`0_3:18`, `0_4:17`), `% TODO` (`.bib:72`).

---

### 2.D — LaTeX / biên dịch / hình thức (CRITICAL build-break + MAJOR placeholder)

> Đây là nhóm hình thức; **F1 là CRITICAL build-break** (đã xếp gộp vào tổng critical? KHÔNG — giữ riêng để rõ; tổng critical §1 KHÔNG gồm F1 vì là lỗi LaTeX, không phải lỗi nội dung. Nếu tính cả F1 thì critical = 10).

**F1 (CRITICAL build-break) — 10 `\includegraphics{Hinhve/NN-*.png}` lỗi File not found**
- 10 hình use case/activity ở `2_Khao_sat.tex:91,104,117,130,143,156,169,182,195,208` dùng prefix `Hinhve/` KHÔNG có trong `\graphicspath{{figures/}{../figures/}}` (`quyen.tex:144`); `find` ảnh trên toàn `Bao Cao` = RỖNG, thư mục `Hinhve` = RỖNG. pdflatex SẼ lỗi.
- fix: Render `figures/NN-*.puml`→`.png`, đổi đường dẫn → `NN-*.png` (khớp graphicspath), HOẶC tạm dùng `\framebox` placeholder như Ch4 (`4_Ket_qua:37`).

**F2 (MAJOR) — 14 subfile sai master `\documentclass[../DoAn]{subfiles}`** (DoAn.tex không tồn tại) — ảnh hưởng compile ĐỘC LẬP từng chương (build qua quyen.tex vẫn OK). 14 file `Chuong/*.tex:1` (gồm `7_Luu_y_tai_lieu_tham_khao.tex:1` mà LỚP-1 bỏ sót); chỉ `Bia/Bia_lot` trỏ đúng `[../quyen]`. → đổi 14 dòng → `[../quyen]`.

**F3 (MAJOR) — Front matter còn placeholder `<...>` (sẽ in ra PDF):**
- `Bia.tex:25,28` (Lớp, GVHD).
- `Bia_lot.tex:8,9,22,23,24,25,26,27` (8 trường).
- `0_2_Loi_cam_on.tex:16,18,31` (+ sai master `:1`).
- `Phu_luc_A.tex:100` (`<Liệt kê tài khoản test…>` dưới `\section{Tài khoản demo}` `:98`) — LỚP-1 bỏ sót.
- *(Lưu ý: `<<extend>>` trong `2_Khao_sat.tex:100,109,113` là UML notation trong `\texttt{}`, KHÔNG phải placeholder.)*

**F4 (MINOR) — Lạm dụng `[H]`** = 51 lần ([h]=11, [htbp]=0, [p]=4); `\usepackage{float}` đã load (`quyen.tex:34`) nên không lỗi build, chỉ vỡ layout. → cân nhắc đổi sang `[htbp]`.

---

## 3. CLAUDE.md / memory DRIFT cần sửa

> Các chỗ tài liệu nội bộ (CLAUDE.md / context cũ) lệch code thực tế mà audit phát hiện. **5 drift quan trọng nhất:**

1. **`subgraphSync` thay 3 RPC workers (S17, 2026-04-30).** CLAUDE.md §7 vẫn ghi "3 worker đồng bộ event chain → DB cache (started bởi app.js)". Thực tế: chỉ 1 worker `startSubgraphSync` (poll 30s); `startEventSync` đã comment/disable. Nguồn: `app.js:32-39,110-115`, `subgraphSync.service.js:1,36`.

2. **Emergency-witness / `grantEmergencyAccess` đã BỎ → Trusted Contact registry on-chain (2026-05-05).** CLAUDE.md §3 vẫn mô tả `DoctorUpdate.grantEmergencyAccess` (24h, 2-10 chứng nhân). Thực tế: grep chỉ thấy `addRecordByDoctor`; cơ chế khẩn cấp = `isTrustedContact`/`setTrustedContactBySig` (`ConsentLedger.sol:96,818,854`). Commit `e2d2788`/`ce6a9c7`/`9a7543b`.

3. **`ipfs.service.js` mock CHỈ ở backend; mobile upload Pinata THẬT.** CLAUDE.md §7 ghi đúng "ipfs.service.js MOCK", nhưng cần ghi rõ mobile `ipfs.service.js:58 pinFileToIPFS` là đường upload thật (figure/UC từng nhầm credential upload qua Pinata trong khi `CredentialSubmitScreen` lại mock). Nguồn: `mobile/.../ipfs.service.js:3,6,31,58` vs `CredentialSubmitScreen.tsx:221`.

4. **Địa chỉ deploy LIVE = bộ 21/06/2026** (`0x9141ff77 / 0x13485F54 / 0x3d44D8f5 / 0x8C03A460 / 0x83D7Bd3D`), deployer = ví Bộ Y tế `0x4564f2fc…` (TÁCH sponsor `0x71aDE459…`). memory `ehr-data-loss-state.md` cần chốt bộ này + phân biệt deployer vs sponsor. Nguồn: `run-latest.json`, `backend/.env`, `subgraph.yaml`, git `2a8b482`.

5. **Tên hàm chuẩn (chống lỗi "đặt tên theo công thức X+Permit"):** consent revoke = `revoke`/`revokeFor` (KHÔNG revokeBySig); approve = `confirmAccessRequestWithSignature` + primaryType `ConfirmRequest` (KHÔNG approveRequestBySig/ApprovePermit); full delegation sponsored = `delegateAuthorityBySig` (KHÔNG grantDelegationBySig); revoke delegation = `revokeDelegation` (self-pay, KHÔNG BySig); tạo hồ sơ KHÔNG có RecordPermit; record getter = `getOwnerRecords` (KHÔNG getPatientRecords). Các permit THẬT chỉ có: `ConsentPermit, DelegationPermit, TrustedContactPermit` (mobile eip712.js) + `ConfirmRequest, RejectRequest` (backend typedData).

*Phụ:* CLAUDE.md §4/§5 nói `includeUpdates`/cascade — vẫn cần lưu ý `grantUsingRecordDelegation` hardcode `includeUpdates=false, allowDelegate=false` (đúng CLAUDE.md gotcha) và CAP-not-revert thời hạn (`ConsentLedger.sol:637-643`).

---

## 4. ĐÃ VERIFY ĐÚNG (ĐỪNG ĐỤNG)

> Các claim đã được LỚP-2 đích thân verify khớp code — KHÔNG sửa nhầm.

**Kỹ thuật cốt lõi (verified khắp Ch1/Ch3/Ch4/Ch5/PLA/PLB):**
- 5 hợp đồng Solidity `^0.8.24`; 4 vai trò bitwise `PATIENT=1<<0 … MINISTRY=1<<3` + VERIFIED_DOCTOR/VERIFIED_ORG (`AccessControl.sol:23-30`).
- **34 màn hình** `screens-v2`; **16 phương thức đăng nhập** Web3Auth (14 social + email/sms passwordless, `LoginScreen.tsx:60-70`); **5 contract / 15 routes / 18 prisma models / 11 test files**.
- **140/140 forge test PASS** (chạy thực 2 lần; per-suite 41/26/18/15/15/7/6/6/4/1/1); 23/23 tên test invariant cited tồn tại; 4 tên test cascade nâng cao đúng path:line.
- AES-256-GCM (key 32B, tag 16B, IV 12B, `crypto.js:16,40,49,72`); NaCl box Curve25519 (`nacl-crypto.js:5,33`); cidHash=`keccak256(toBytes(cid))` (`crypto.js:11`); on-chain NEVER plaintext CID.
- canAccess gate-ordering: `isTrustedContact return true` (`ConsentLedger.sol:693`) ĐẶT TRƯỚC verified-doctor gate audit#3 (`:698-703`, return false).
- Footgun#1 (`_grantConsent` clear recordDelegationSource `:322`), Footgun#2 (TrustedContact bypass), cascade revoke 2 tầng (`consentLedgerSync.service.js:543-629`).
- Hằng số: MAX_DELEGATION_WALK=8 (`:130`), MAX_RECORD_DEPTH=20 (`:135`), MIN_APPROVAL_DELAY=15s (`EHRSystemSecure.sol:46`), DoctorUpdate 1h-90d default 7d (`:24-26`), quota 100 chữ ký/tháng (`relayer.service.js:22`), rate limit 1000/15min (`app.js:67-68`), subgraph poll 30s (`subgraphSync.service.js:36`).
- 3 RequestType, requestAccess 2-step, EIP-712 domain `('EHR Consent Ledger','2')` + nonce dùng chung ConsentPermit/DelegationPermit; grantBySig/delegateAuthorityBySig/grantUsingRecordDelegation/rejectRequestBySig/`_hasValidNormalConsent`(`:711`)/`_walkToRoot`(`:191`)/setTrustedContactBySig/verifyDoctorByMinistry/setOrgActive/addRecord/revokeOrgVerification đều TỒN TẠI đúng tên.
- Version thư viện mobile (react-native 0.83.2, expo ~55.0.5, tamagui 2.0.0-rc.26, web3auth 8.1.0, viem 2.47.0, tweetnacl 1.0.3, react-query 5.96.2, zustand 5.0.11, sentry 8.7.0) khớp 100% package.json.

**LaTeX form đúng:** section numbering không sinh `X.0.Y` (`quyen.tex:97,107,151`); 0 undefined ref (48 keys); 0 undefined cite (28 keys); `float` loaded; framebox placeholder Ch4 build-safe; graphicspath syntax đúng.

**Pháp lý đã web-verify ĐÚNG (xem §6):** NĐ13/2023 Đ2K4 + Đ28; Luật ANM 24/2018 Đ26 + NĐ53/2022 Đ26; Luật GDĐT 20/2023 hiệu lực 01/07/2024; QĐ586/QĐ-BYT ngày + deadline; TT32/2023 Phụ lục XXVIII = mẫu bệnh án + "29 mẫu".

---

## 5. Đối chiếu context/27, /29, /30 (audit cũ): cái nào SAI/STALE

> **FLIP quan trọng — đừng lặp lỗi của audit cũ:**

- **context/30 (diagram review) SAI về `grantDelegation` + `_walkToRoot`:** context/30 từng gắn nhãn "fabricated" cho `grantDelegation` và `walkToRoot`. **SAI** — `grantDelegation` IS public (`ConsentLedger.sol:380`), `_walkToRoot` IS internal (`:191`). LỚP-1+LỚP-2 đã đúng khi KHÔNG lặp. Tương tự `_hasValidNormalConsent` (`:711`) + `consentDelegatorEpochAtGrant` (`:78`) + `grantUsingRecordDelegation` (`:614`) đều TỒN TẠI THẬT — không gắn lỗi cho chúng.

- **context/30 còn các issue ĐÚNG (giữ):** stale addresses figure 03, fabricated `revokeBySig`/`approveRequestBySig`/`getPatientRecords`/`RecordPermit`, endpoint sai (grant-consent/approve-request/reject-request/revoke-consent), permit name bịa, enum RequestType sai thứ tự, Notification entity bịa, "27 screens" stale. Tất cả đã reconcile vào §2.

- **LỚP-1 deployer issue (run-latest) SAI → FLIPPED:** một audit LỚP-1 kết luận deployer ≠ sponsor là "wrong-fact". **FLIP**: báo cáo mô tả deploy **19/06**, mà broadcast 19/06 (`run-1781887024012.json`) from = `0x71ade459…` = chính ví bảo trợ (xác nhận `cast wallet address` từ SPONSOR_PRIVATE_KEY). → câu báo cáo hiện tại ĐÚNG. `0x4564f2fc…` chỉ deploy bộ 21/06 (`run-latest.json`) — báo cáo không mô tả. Xem M-deployer + §6.

- **context/29 (report↔code consistency):** các issue tên hàm/permit/error code đều tái xác nhận đúng; không phát hiện FLIP. Nhiều FALSE NEGATIVE của lớp đầu đã được LỚP-2 bổ sung (UC002 status `approved`, signConsentPermit, UC008 UC002 DOCTOR_NOT_VERIFIED, prisma 6.x, expo-server-sdk, source `-pre-share`, k6 over-claim, file 7_Luu_y master, Phu_luc_A:100 placeholder, 5 orphan bib entry, /revoke-consent split).

- **context/27 (quyen review):** legal mục được LỚP-2 web-verify FLIP nhiều mục từ "unverified" sang ĐÚNG (NĐ13 Đ2K4/Đ28, ANM/NĐ53, GDĐT, TT32 Phụ lục XXVIII) — không còn là issue mở; nhưng phát sinh issue MỚI (orphan bib entry) nghiêm trọng hơn.

---

## 6. Ghi chú nguồn ngoài-repo (pháp lý) — đã web-verify riêng

LỚP-2 mục pháp lý đã đối chiếu toàn văn nguồn chính phủ và xác nhận ĐÚNG (không còn là issue mở, đã chuyển sang §4 verified): NĐ13/2023 Điều 2 khoản 4 (định nghĩa DLCN nhạy cảm gồm hồ sơ bệnh án/sinh trắc) + Điều 28; Luật ANM 24/2018 Điều 26 (nội địa hoá) + NĐ53/2022 Điều 26; Luật GDĐT 20/2023/QH15 hiệu lực 01/07/2024; QĐ586/QĐ-BYT ban hành 09/03/2026 / deadline 31/12/2026 / bỏ giấy 01/01/2027; TT32/2023 Phụ lục XXVIII = mẫu HSBA + "29 mẫu". **Còn cần kiểm tay:** Luật KCB 15/2023 Đ69K1 và TT 13/2025 Đ3 (nội dung điều/khoản cụ thể, chưa fetch toàn văn trong các vòng này) + bổ sung url cho `qd586_2026_byt` trong .bib.

---

*Hết. Mọi issue giữ nguyên evidence `path:line` từ 2 lớp audit. Không bịa thêm dữ liệu ngoài 13 object AUDIT_SCHEMA nhận được.*
