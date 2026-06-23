# 33 — Checklist chặng cuối (tổng hợp, 2026-06-23)

> **Nguồn DUY NHẤT cho chặng cuối.** Code app gần như **đóng băng**; phần lớn còn lại = **sửa báo cáo (Phase C)** + **1 deliverable test** (#3). Tổng hợp 11 nhận xét mới nhất của thầy + [16](16_advisor_feedback_and_rubric.md) [27](27_quyen_review_findings.md) [29](29_report_code_consistency_audit.md) [30](30_diagram_review.md) [31](31_full_report_audit.md) [32](32_legal_updates.md). RULE #0: trạng thái dưới đây đã verify từ code trong phiên 2026-06-23.

---

## 0. CODE ĐÃ XONG phiên này (APK HEAD `6a59317` = bản để test, KHÔNG cần rebuild thêm)
- **Verify bác sĩ**: `POST /api/verification/confirm` finalize tức thì + mobile chờ receipt; revoke chờ receipt; `subgraphSync` theo dõi `VerificationRevoked`. (commits `07074c9`, `475aff7`, `e47f82d`, `15561e8`, `b222bd9`)
- **Backend deploy**: `trust proxy` + gql graceful (`f129b86`); Render live (`ehr-blockchain-system.onrender.com`); `SUBGRAPH_URL=…/ehr/0.3.0`; địa chỉ contract trên Render + eas.json = bộ LIVE 21/06.
- **APK login**: pin `EXPO_PUBLIC_WEB3AUTH_REDIRECT_URL=erhsystem://auth` (`2976ec7`) — đã fix lỗi login.
- **Biometric/PIN**: gate **device-level BẮT BUỘC** cho patient/doctor (org/ministry/admin miễn), bỏ mọi bypass, gỡ UI app-PIN (`56fbdff`, `af2b648`, `6a59317`).
- **Pháp lý**: [context/32](32_legal_updates.md) verified từ PDF gốc; deep-research xác nhận **không có luật bắt buộc bio/PIN per-account cho app y tế**.

→ **Không còn việc code BẮT BUỘC nào cần rebuild.** Chỉ #1b/#6 (optional) mới cần rebuild nếu làm.

> **TIẾN ĐỘ Phase C (cập nhật 2026-06-23, sửa thẳng `Bao Cao/*.tex` + compile sạch):**
> - **Pha 0 (build)**: ✅ XONG — quyen.pdf compile exit=0, 0 lỗi; fix ✓/✗ pifont, subfile master, placeholder hình, lstlisting UTF-8 (ASCII hoá Phụ lục A), `---`/`—`/`–`→`-`.
> - **Ch4**: ✅ XONG — 141/141 test (re-run), địa chỉ+startBlock LIVE 21/06, deployer ví Bộ Y tế `0x4564f2Fc…`, subgraph 0.3.0, 1 worker subgraphSync, Prisma 6, gỡ expo-server-sdk/graphql-request→express-rate-limit/helmet, `_accessRequests`, NĐ13→Luật91, +mô tả test ABC.
> - **Ch2 (code-path)**: ✅ XONG — bỏ `RecordPermit`/`RevokePermit` (bịa), `revokeBySig`→`revoke/revokeFor`, `grantDelegationBySig`→`delegateAuthorityBySig`, `approveRequestBySig`→`confirmAccessRequestWithSignature`, `_requests`→`_accessRequests`, UC008 bỏ over-claim "verified+canAccess parent" (chỉ onlyDoctor), error code thật, `addRecordFor` cho sponsored.
> - **CÒN LẠI Ch2 (LEGAL — chờ pass pháp lý #9, PHẢI web-verify, không đoán):** bảng `tab:compliance` còn keyed NĐ13/2023 → re-key Luật 91/2025+NĐ356/2025 (dùng [34 #5], thêm ❌ FHIR/DICOM/BHYT/VNeID/CA); TT13/2026 (tiêm chủng — nghi sai, line 45/284/825); QĐ586 (date/deadline, line 47/826). + minor: self-share/downgrade guard (m3), "21 vị trí ký".
> - **Pass PHÁP LÝ (#9)**: ✅ XONG (web-verified, không đoán). TT13/2026 (tiêm chủng/HPV, 01/7/2026) + QĐ586 (09/03/2026, deadline 31/12/2026) trong Ch2 = ĐÚNG, giữ. Sửa: TT32/2023 ngày 01/01→01/03/2024 + bỏ "29 mẫu"; TT26/2025 đúng tiêu đề; THÊM khung DLCN vào §2.1.3 (Luật91/2025+NĐ356/2025, killer NĐ356 Đ11 k2b chỉ-hash); **re-key toàn bộ bảng `tab:compliance`** NĐ13→Luật91/NĐ356/Luật60/NĐ165 + thêm hàng killer & scope-out (FHIR/DICOM/BHYT/VNeID/CA); re-key prose 3 rủi ro C; .bib +4 entry luật mới. Lan sang **Tóm tắt VN/EN** (140→141, NĐ13→Luật91/NĐ356, hạ giọng k6), **Ch1** (bỏ "29 mẫu"), **Ch5** (sửa 2 chỗ STALE: biometric "có thể tắt"→bắt buộc, bỏ "mã PIN dự phòng 6 số" → device-level), **Ch6** (140→141, "xác thực mạnh TT13/2025"→NĐ356 Đ9 k3b, "đã đáp ứng"→"đối chiếu"+thêm DLCN). Build exit=0, 131 trang. Backup `BaoCao_postLegal_20260623.tgz`.
> - **Ch5**: ✅ XONG — fix T3 threat-model STALE (bỏ "mã PIN dự phòng 6 số"+"suy biến mềm" → device-level bắt buộc), 140→141, "ví Ministry Sponsor"→ví bảo trợ tách deployer, "21 vị trí"→"các vị trí ký". §Envelope/§Cascade/§Trusted-contact/§Relayer giữ (đã chính xác).
> - **Phụ lục B**: ✅ XONG — UC012 `approveRequestBySig`→`confirmAccessRequestWithSignature`; UC013 bỏ "lý do từ chối" (M18); UC016 `revokeDelegationBySig`(bịa)→`revokeDelegation` self-pay + epoch 2-key; UC018 mock CID (M20)+`VerificationRequest` model (M21); UC020 typeword+MinistryOrgDetailScreen (M22); UC021 `removeMember`→`removeOrgMember` (C9). Verify: AccessControl.sol/ConsentLedger.sol/schema.prisma/CredentialSubmitScreen.
> - **Ch3**: ✅ XONG — m17 (AES-GCM "không cần lib ngoài" SAI → node-forge vì RN thiếu Web Crypto), m18 (socket foreground + push background song song, không phải fallback). m19/m20 giữ.
> - **Ch7/.bib**: ✅ XONG — thêm `\cite{luatgddt2023}` (§2.1.3), `\cite{luatanm2018,nd53_2022}` (prose rủi ro C) → 3 luật load-bearing giờ vào danh mục TLTK; thêm url QĐ586.
> - **PHASE C TEXT = XONG** toàn bộ chương (Pha0 + Ch1-6 + Phụ lục A/B + Tóm tắt VN/EN + .bib). Build exit=0, 131 trang, 0 lỗi/UTF-8/cite-undef. Backups: `BaoCao_postPhuLucB_20260623.tgz`, `BaoCao_postLegal_20260623.tgz`.
> - **CÒN LẠI (owner-driven, không phải viết text):** (1) **Sơ đồ #10** — render `figures/*.puml`→`Hinhve/*.png` (cần Java+PlantUML; chưa cài) + sửa nội dung .puml (M24-27 figure03/04/05/06/07/09 theo tên hàm/state thật) — placeholder tự thành ảnh khi render; (2) **F3** điền cá nhân (Bia/Bia_lot/Loi_cam_on/Phu_luc_A:100 demo accounts); (3) **k6 #4** chạy thật → điền Bảng 4.7 (hiện placeholder). (4) optional: ct17_ttg thiếu year (chưa web-verify — không bịa).

---

## A. CÒN LẠI: CODE / TEST (nhỏ, đa số không đụng app)
> **Nội dung báo cáo sẵn-để-dán → [context/34](34_report_ready_content.md)** (bảng contract/invariant, threat model, đối chiếu 3 mức, relayer, envelope+puml, deployment, sửa pháp lý).
> **KẾ HOẠCH viết/sửa báo cáo chi tiết (Phase C) → [context/35](35_report_writing_plan.md)** (phân pha + từng chương + sơ đồ + văn phòng + giao thức).

| # | Việc | Loại | Rebuild? | Trạng thái |
|---|---|---|---|---|
| **3** | **Property/fuzz test cascade** (BN→A→B→C + trực tiếp→C; revoke A ⇒ chain chết, direct còn) | test | ❌ | ✅ **XONG** — 5 property + 1 invariant (128k calls) PASS; đã thêm test `..._ABC_...` đúng chữ thầy |
| 4 | **k6** đo + ghi bảng | đo | ❌ | 🟡 **Script sẵn** `loadtest/read-path.k6.js` → owner chạy (cần JWT + endpoint DB) + điền bảng; nêu rõ chưa đo on-chain/crypto |
| 1b | **AAD = cidHash** cho AES-GCM (`mobile/src/services/crypto.js` encrypt+decrypt) | app code | ✅ nếu làm | THẤP/opt — ⚠️ data cũ giải mã lỗi → phải tạo lại data test |
| 6 | Trusted-contact: TTL khẩn cấp / xác minh danh tính người thân / log per-access **bất biến on-chain** (log+thông báo backend ĐÃ có) | app code | ✅ nếu làm | THẤP/opt — để "future work" |

## B. CÒN LẠI: SỬA BÁO CÁO (Phase C) — 11 nhận xét thầy × hành động
| # | Nhận xét | Hành động | Loại | Vật liệu |
|---|---|---|---|---|
| 1 | Mã hoá phong bì | Vẽ **sơ đồ #19 envelope** (AES→seal NaCl per-recipient→KeyShare→IPFS; revoke path) + nêu giới hạn "revoke chỉ chặn về sau, không xoá bản đã copy" | viết+vẽ | crypto.js, schema KeyShare:176, [30] |
| 2 | 5 contract + invariant | Thêm **bảng contract** (tên/state/event/hàm/ai gọi/điều kiện/revert) + **bảng invariant** (chỉ BN cấp/thu hồi; allowDelegate; epoch cascade; consent trực tiếp không bị cascade) | viết | CLAUDE §3, [31], ConsentLedger.sol |
| 3 | Test cascade | (xem mục A#3) + mô tả kịch bản trong Quyển | viết+test | — |
| 4 | k6 đủ điều kiện | (xem A#4) + bảng + caveat | viết+đo | [12] |
| 5 | Pháp lý: đối chiếu, **3 mức** | Bảng 2.10 chia ✅đã hiện thực / ⚠️một phần / ❌ngoài phạm vi (FHIR/DICOM/BHYT/VNeID/CA/lưu trữ chính thức = ❌) | viết | [32], deep-research |
| 6 | Trusted-contact kiểm soát | **ĐÃ CÓ** (chỉ trình bày): canAccess on-chain (ConsentLedger.sol:693), log riêng `TRUSTED_CONTACT_CLAIM` (keyShare.routes.js:1532), **thông báo realtime+push cho bệnh nhân** (:1521), chỉ định người thân = event on-chain bất biến. Future: TTL/xác minh danh tính/per-access on-chain | viết | keyShare.routes.js:1500-1539, ConsentLedger.sol:693/818 |
| 7 | Relayer chống replay | **ĐÃ CÓ**: nonce+deadline EIP-712 (ConsentLedger.sol:26-38, check :249/:271/:405/:428) + quota 100/tháng + rate-limit → chỉ **trình bày** + self-pay fallback | viết | ConsentLedger.sol, relayer.service.js, CLAUDE §6 |
| 8 | Bằng chứng triển khai | Gom: 5 địa chỉ + arbiscan link, subgraph 0.3.0, API URL Render, APK/QR (EAS), 4 tài khoản demo, `.env.example`, ghi "chạy npm (không Docker)" | viết | [[ehr-deploy-targets]], [[ehr-data-loss-state]] |
| 9 | Rà văn bản pháp lý | Sửa **TT13/2026→TT13/2025** (06/06/2025, hiệu lực 21/07/2025); rà QĐ586; thêm Luật 91/2025+NĐ356 (NĐ13/2023 hết hiệu lực 01/01/2026) | viết | [32] |
| 10 | Hình nhỏ khó đọc A4 | Xuất lại PNG/SVG độ phân giải cao + cỡ chữ lớn; tách use-case/activity dày | xuất hình | [30] |
| 11 | Threat model | Thêm **bảng threat model** (server độc hại / bác sĩ revoked đã tải / mất thiết bị / trusted-contact lạm dụng / relayer DoS / IPFS mất / replay / lộ khoá client / tấn công contract) | viết | bảng ở [31]+phiên này |

## C. Quy tắc ĐÓNG BĂNG code (tránh hồi quy trước bảo vệ)
- **KHÔNG** đụng logic contract / backend / mobile core. Chỉ được: **file test** (#3), **k6 script** (#4), **text báo cáo**, **hình**, và (tuỳ chọn, cân nhắc kỹ) **#1b AAD** (kèm tạo lại data test).
- Nếu làm #1b hoặc #6 → mới rebuild APK; còn lại build hiện tại là cuối.

## D. Thứ tự đề xuất
1. **#3 property test** (đóng góp mạnh, an toàn, không rebuild).
2. Sửa báo cáo cụm "viết nhanh": #11 threat model, #5 bảng 3 mức, #1 sơ đồ envelope, #2 bảng contract/invariant, #7 relayer, #9 pháp lý, #8 bằng chứng.
3. #4 k6 (đo + bảng).
4. #10 xuất lại hình.
5. (tuỳ chọn) #1b AAD, #6 trusted-contact.
