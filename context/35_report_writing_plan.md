# 35 — KẾ HOẠCH viết/sửa báo cáo DATN (Phase C)

> Lập 2026-06-23. **Chưa thực hiện** — đây là kế hoạch để owner duyệt. Backbone: [31](31_full_report_audit.md) (63 issue có path:line) + [34](34_report_ready_content.md) (nội dung sẵn-để-dán) + [30](30_diagram_review.md) (18 sơ đồ) + [32](32_legal_updates.md) (pháp lý) + 11 nhận xét thầy.

## 0. Nguyên tắc (đúng 5 yêu cầu owner)
1. **Giữ khung Quyển cũ** (`Bao Cao/` = bản chuẩn mới nhất) — chỉ sửa NỘI DUNG, không đổi cấu trúc chương/section.
2. **Bám code thật + văn phong học thuật như PDF, KHÔNG jargon coding.** Prose chính mô tả *cơ chế/nghiệp vụ*; tên hàm/endpoint/biến chỉ để trong `\texttt{}` ở mục kỹ thuật/phụ lục. (vd: KHÔNG "gọi `revokeBySig()`" → "bệnh nhân thu hồi quyền, bộ chuyển tiếp bảo trợ thay mặt gửi giao dịch").
3. **Rà từng chương; mỗi chương soát kỹ sơ đồ.**
4. **Sửa để cover feedback thầy** (11 điểm — đa số ĐÃ có cấu trúc, cần sửa cho ĐÚNG nội dung).
5. **Kế hoạch trước, làm sau** (file này).

## 0b. Hiện trạng đã khảo sát (RULE #0)
- **Cấu trúc Quyển đã cover feedback thầy**: Ch5 có §Envelope+bảng KeyShare+hình+§giới hạn-revoke (#1), §Cascade (#3), §Trusted-contact+bảng kiểm soát (#6), §Relayer+Biometric (#7), §Threat model bảng A+B (#11); Ch2 có bảng `tab:compliance` 3 mức (#5) + UC001-011 + 10 sơ đồ; Ch4 có §Thiết kế contract (#2), §Foundry (#3), §k6 (#4), §Triển khai (#8); Ch6 Hạn chế/Hướng phát triển (out-of-scope honest).
- **NHƯNG độ chính xác CHƯA sửa**: spot-check thấy **44 hit** lỗi context/31 còn nguyên (`revokeBySig`, `0x5Fb8…` địa chỉ cũ, `getPatientRecords`, `grant-consent`, `0.2.6`…). → Phase C = **SỬA ĐỘ CHÍNH XÁC + HÌNH + VĂN PHONG**, không phải viết mới.
- ⚠️ **Số dòng trong context/31 là của 22/06; Quyển có thể đã đổi vài chỗ → PHẢI re-grep vị trí trong `Bao Cao/` hiện tại trước mỗi lần sửa.**
- ⚠️ `Bao Cao/` gitignored, không git-backup → **backup trước mỗi đợt sửa** (đã có zip 23/06; owner tự cloud).

## 1. PHÂN PHA (ưu tiên)
| Pha | Nội dung | Vì sao trước |
|---|---|---|
| **0. Build + form** | F1 (render 10 hình `Hinhve/*.png` thiếu → pdflatex GÃY), F2 (14 subfile sai master → `[../quyen]`), F3 (placeholder `<…>` front matter + Phu_luc_A:100), F4 (`[H]`→`[htbp]`, optional) | Quyển hiện **không compile được** (F1) |
| **1. CRITICAL chính xác (9)** | C1-C9: địa chỉ stale, tên hàm/permit bịa, chữ ký/precondition sai (C7/C8 nguy hiểm nhất — luận văn lấy on-chain làm lõi) | Rủi ro lớn nhất khi bảo vệ |
| **2. MAJOR (27)** | M1-M27: NĐ13 abstract, endpoint sai, error code bịa, model sai, state figure sai | Sai sự thật, thầy/hội đồng dễ bắt |
| **3. MINOR + pháp lý + k6 (27+)** | m1-m27, bib orphan (\cite 3 luật), qd586 url, hạ giọng "xác thực mạnh/đo tải", k6 chạy thật | Hoàn thiện |
| **4. Sơ đồ** | render high-res + sửa nội dung (M24-27, m25/m26, figure03/04/05) + tách hình dày (#10) | Phụ thuộc .puml + công cụ render |

## 2. KẾ HOẠCH TỪNG CHƯƠNG
*(mỗi mục: cover feedback nào · issue context/31 cần sửa · sơ đồ · ghi chú)*

### Tóm tắt VN/EN (`0_3`, `0_4`)
- M1: thêm caveat NĐ13/2023 hết hiệu lực (hoặc thay Luật 91/2025) — đồng bộ footnote thân quyển.
- m1: hạ giọng "được đánh giá hiệu năng bằng k6" → "thiết kế kịch bản k6" (đến khi chạy thật).
- Xoá comment `% R9`.

### Ch1 Giới thiệu
- Pháp lý: §6 context/31 đã web-verify **Luật KCB Đ69K1, TT13/2025 Đ3 ĐÚNG** → giữ. Bổ sung Luật 91/2025+NĐ356. QĐ586: thêm url .bib.
- Văn phong: phần "Định hướng giải pháp" rà jargon.

### Ch2 Khảo sát (NẶNG NHẤT — 9 hit)
- **Bảng compliance 3 mức (#5)**: đối chiếu với [34 mục #5] — phân đúng ✅/⚠️/❌ (FHIR/DICOM/BHYT/VNeID/CA = ❌).
- **UC specs (C2/C3/C4/C5/C7/C8 + M9-M17 + m3-m12)**: sửa tên hàm bịa (`revokeBySig`→`revoke`/`revokeFor`; `approveRequestBySig`→`confirmAccessRequestWithSignature`; `grantDelegationBySig`→`delegateAuthorityBySig`; bỏ `RecordPermit`), chữ ký `addRecordByDoctor` 6 tham số (C7), bỏ over-claim "verified+canAccess parent" (C8 — QUAN TRỌNG), error code bịa (`DOCTOR_NOT_VERIFIED`/`CID_RESERVED`→thật), default 7 ngày (m4), bỏ self-share guard (m3).
- **Sơ đồ (10 use-case/activity)**: F1 render `figures/NN-*.puml`→`Hinhve/NN-*.png`; sửa nội dung activity (revoke/request/create theo tên hàm thật); #10 tách hình dày + phóng chữ.

### Ch3 Công nghệ (4 mục minor)
- m17: "AES-GCM không cần thư viện ngoài" → SAI, RN dùng `node-forge`; sửa lý do, hardware-accel chỉ phía máy chủ.
- m18: "phát hiện offline rồi fallback socket→push" → "đồng thời socket (foreground) + push (background)".
- m19: số kết nối Neon → thêm url pricing hoặc hạ giọng.
- m20: Web3Auth MPC/threshold — kiểm `\cite{web3auth}` trỏ đúng.

### Ch4 Kết quả thực nghiệm (4 hit)
- **C1 địa chỉ stale** → bộ LIVE 21/06 ([34 #8]); M-deployer: đổi câu deployer → ví Bộ Y tế `0x4564f2fc…` (tách sponsor).
- **M2 startBlock**, **M3 subgraph 0.3.0**, **M4 "3 worker"→1 worker subgraph**.
- **Bảng thiết kế contract (#2)** → dùng [34 #2] (5 contract + invariant test-backed); M24 (figure/bảng state `_accessRequests` không `_requests`, bỏ `nonces`), M25 enum order, m23 (2 hàm register), m26 (kiểu state).
- **§Foundry (#3)** → cập nhật: **5 property + 1 invariant cascade PASS** (đã chạy, 128k calls), thêm test `..._ABC_...`; tổng test (đếm lại; context/31 ghi 140/140 ở 22/06 — re-run đếm).
- **§k6 (#4)** → chạy `loadtest/read-path.k6.js` điền bảng (server/DB/VU/ramp/p50-95-99/error/throughput) HOẶC hạ giọng + nêu chưa đo on-chain/crypto (m1b).
- **§Triển khai (#8)** → [34 #8] (địa chỉ + arbiscan + subgraph + APK + npm-not-docker); m24 caption "đã verify Arbiscan" → kiểm tay.
- Thư viện: m21 prisma 6.x, m22 bỏ expo-server-sdk/graphql-request.
- Sơ đồ package/component: M27 "27 screens"→~34.

### Ch5 Giải pháp đóng góp (1 hit)
- **§Envelope (#1)**: đối chiếu [34 #1] (AES-256-GCM/IV12B/base64 IV‖ct‖tag; KeyShare fields; NaCl; encKeyHash); **AAD hiện rỗng** → ghi "hướng phát triển" hoặc thêm code (owner quyết); giữ §giới hạn-revoke (đã có, tốt). Sơ đồ envelope: dùng PlantUML ở [34 #1].
- **§Cascade (#3)**: khớp test đã PASS; M19 (`delegationEpoch` 2 chiều + clear cờ active).
- **§Trusted-contact (#6)**: cập nhật theo phát hiện thật — **đã có log `TRUSTED_CONTACT_CLAIM` + thông báo realtime/push cho bệnh nhân + chỉ định on-chain bất biến** (keyShare.routes.js:1500-1539); m13 source `-pre-share`; bảng `tab:tc-controls` ghi "hiện có vs future (TTL/xác minh danh tính)".
- **§Relayer (#7)**: [34 #7] (EIP-712 domain+nonce+deadline ĐÃ có; quota; self-pay); M5 endpoint `/grant`; m16 PIN "hạ tầng dự phòng" (không ngụ ý đã wired) — *lưu ý: gate biometric nay đã đổi sang device-level bắt buộc patient/doctor (commit 56fbdff…) → cập nhật mô tả MFA cho khớp*; m14 bỏ "nhận khoá được biometric gate".
- **§Threat model (#11)**: [34 #11] (9 dòng A+B).
- m15: ngày 2026-05-05 (hoặc bỏ).

### Ch6 Kết luận
- m1b: "được đo tải… kết quả 4.4.2" → "thiết kế 3 kịch bản (10/50/200)".
- §6 context/31: hạ giọng "yêu cầu xác thực mạnh của TT13/2025" (TT13/2025 KHÔNG bắt buộc MFA).
- Xoá comment `% R4` (32,34,44,83,91).
- Hạn chế/Hướng phát triển: đã tốt (out-of-scope honest) — giữ.

### Ch7 + .bib
- Citation: **\cite 3 luật load-bearing** (`luatgddt2023, luatanm2018, nd53_2022`) + xử lý 2 entry mồ côi (`blds2015, kcb_vn`); ct17_ttg thiếu year/url; tt13_2025_byt thêm ngày 06/06/2025 + giữ hậu tố `/TT-BYT`; qd586 url.
- Ch7:14 "paper khảo sát 2022-2025" + Ch7:16 "FHIR/DICOM" chưa có entry → hoàn thành hoặc sửa câu.

### Phụ lục A
- C1 địa chỉ (5) → LIVE; §Tài khoản demo: điền 4 tài khoản (#8) thay placeholder `<…>` (F3); §Load test: lệnh k6 thật.

### Phụ lục B (UC012-023 — C6/C9 + M18-M23 + m9-m12)
- C6 `revokeDelegation` self-pay (bỏ permit/BySig); C9 `removeMember` deprecated → `removeOrgMember`/`revokeDoctorVerification`; M18 bỏ "lý do từ chối"; M19 epoch; M20 mock credential (bỏ retry); M21 model `VerificationRequest`; M22 `MinistryOrgDetailScreen` + bỏ typeword pause; M23 status `signed/claimed`; m9-m12 handler/source/field.

## 3. KẾ HOẠCH SƠ ĐỒ (#10 + nội dung)
- **Render**: `figures/*.puml` → `Hinhve/NN-*.png` (độ phân giải cao, cỡ chữ lớn). **F1 = build-break, làm trước.** (Bản `latex (cũ)/Hinhve/*.png` có thể tái dùng nếu nội dung còn đúng — KIỂM lại từng hình.)
- **Sửa nội dung**: figure 03 (địa chỉ+subgraph), figure 04 (state `_accessRequests`, enum order, `getOwnerRecords`, `delegationEpoch` kiểu), figure 05 ER (bỏ Notification/User.role/verificationStatus, tên cột thật), figure 06/07/09/14/16/17 (endpoint+tên hàm thật), figure 02 (~34 screens). Thêm **sơ đồ envelope** ([34 #1]).
- **Readability (#10)**: tách use-case/activity quá dày; tăng cỡ chữ; giảm chi tiết.

## 4. VĂN PHONG (yêu cầu #2)
- Prose: mô tả *nghiệp vụ*, không liệt kê API trong câu văn. Tên kỹ thuật → `\texttt{}` trong bảng/phụ lục.
- Tham khảo giọng ở `Quyen DATN/latex (cũ)/` (DoAn.pdf compile được) cho phong cách trình bày.
- Mỗi đoạn sửa: đảm bảo vẫn bám đúng code (RULE #0), không thêm số liệu chưa đo.

## 5. GIAO THỨC THỰC HIỆN (khi owner duyệt)
1. Thứ tự đề xuất: **Pha 0 (build) → Ch4 → Ch2 → Ch5 → Phụ lục B → Ch3 → Ch6 → Ch1 → Tóm tắt → Ch7/.bib → Sơ đồ.** (Ch4/Ch2/Ch5 nặng nhất, làm khi còn "tươi".)
2. **Mỗi chương**: re-grep vị trí trong `Bao Cao/` hiện tại (line context/31 có thể lệch) → sửa → owner compile thử → tick checklist.
3. **KHÔNG đụng** các mục ở context/31 §4 ("đã verify đúng") — vd hằng số, 5 contract, AES/NaCl, 16 login, 34 screens, `grantDelegation`/`_walkToRoot` (CÓ thật — đừng gắn "bịa").
4. Tôi soạn nội dung/diff; **owner tự dán vào `.tex`** (hoặc tôi sửa trực tiếp nếu owner cho phép, kèm backup trước).

## 6. VIỆC OWNER TỰ LÀM (ngoài viết)
- Chạy **k6** (#4) → số liệu thật cho Ch4/Phụ lục A.
- **Render `.puml`→`.png`** (PlantUML) cho `Hinhve/`.
- **Verify source contract** trên sepolia.arbiscan.io (bộ LIVE).
- Đối chiếu lần cuối **văn bản luật gốc** đã liệt kê (đa số §6 đã web-verify).
- **Backup `Bao Cao/`** lên cloud sau mỗi đợt.
