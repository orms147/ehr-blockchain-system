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

---

## A. CÒN LẠI: CODE / TEST (nhỏ, đa số không đụng app)
> **Nội dung báo cáo sẵn-để-dán cho TẤT CẢ mục viết → [context/34](34_report_ready_content.md)** (bảng contract/invariant, threat model, đối chiếu 3 mức, relayer, envelope+puml, deployment, sửa pháp lý).

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
