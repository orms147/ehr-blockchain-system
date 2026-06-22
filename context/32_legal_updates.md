# 32 — Cập nhật khung pháp lý (verified từ PDF gốc, 2026-06-22)

> **Nguồn:** owner gửi PDF gốc 4 văn bản → đã đọc trực tiếp, mọi trích dẫn dưới có **số điều/khoản** từ
> bản chính (RULE #0, không web-summary). Bổ sung cho [27](27_quyen_review_findings.md) #5/#9 và
> [31](31_full_report_audit.md) §6.
>
> **Áp dụng:** Phase C (viết Quyển). Đây là các căn cứ pháp lý MỚI rất trúng đồ án + danh sách văn bản
> đồ án đang cite đã bị thay thế.

---

## 1. Văn bản đã verify từ PDF gốc

| Văn bản | Số hiệu | Ngày ban hành | **Hiệu lực** | Vai trò |
|---|---|---|---|---|
| **Luật Dữ liệu** | 60/2024/QH15 | 30/11/2024 | **01/07/2025** | Luật khung về dữ liệu số (mã hoá, truy cập, chuỗi khối) |
| **Luật Bảo vệ DLCN** | 91/2025/QH15 | 26/6/2025 | **01/01/2026** | THAY Nghị định 13/2023 (cấp luật) |
| **NĐ hướng dẫn Luật BVDLCN** | 356/2025/NĐ-CP | 31/12/2025 | **01/01/2026** | THAY NĐ 13/2023; chi tiết DLCN nhạy cảm + chuỗi khối |
| **NĐ hướng dẫn Luật Dữ liệu** | 165/2025/NĐ-CP | 30/6/2025 | **01/07/2025** | Chi tiết mã hoá/giải mã + truy cập + IAM |
| **TT HSBA điện tử** (đã verify ở [31]) | 13/2025/TT-BYT | 06/6/2025 | **21/07/2025** | Đ3: sinh trắc học là 1/3 hình thức ký HSBA |
| **Luật KCB** (đã verify ở [31]) | 15/2023/QH15 | 09/01/2023 | 01/01/2024 | Đ69 K1: HSBA giấy/điện tử giá trị pháp lý như nhau |

---

## 2. STALE / phải sửa trong Quyển

- **NĐ 13/2023/NĐ-CP đã HẾT HIỆU LỰC 01/01/2026** (NĐ 356/2025 Đ42 k2 + Đ39 chuyển tiếp). → Mọi chỗ cite NĐ13/2023 (abstract, Ch2, Ch5) chuyển sang **Luật 91/2025/QH15 + NĐ 356/2025/NĐ-CP**. Lưu ý chuyển tiếp: hoạt động đã có đồng ý hợp lệ theo NĐ13/2023 trước 01/01/2026 vẫn tiếp tục (Luật 91/2025 Đ39 k1).
- **"TT 13/2026/TT-BYT"** (6_Ket_luan): SAI — 13/2026 là tiêm chủng. Đúng = **TT 13/2025/TT-BYT** (HSBA điện tử).
- **"xác thực mạnh của TT13/2025"** (6_Ket_luan): TT13/2025 chỉ cho sinh trắc làm hình thức KÝ, không bắt buộc MFA. NHƯNG nay có căn cứ mạnh hơn: **NĐ 356/2025 Đ9 k3b** (xem dưới) yêu cầu xác thực đa yếu tố gồm sinh trắc — dùng cái này thay.

---

## 3. ⭐ Điều khoản TRÚNG đồ án (verified, có số điều)

### 3.1 Killer: luật hoá đúng thiết kế on-chain

**NĐ 356/2025/NĐ-CP — Điều 11 (Bảo vệ DLCN trong công nghệ chuỗi khối), khoản 2:**
- điểm a) *"Chỉ áp dụng các thuật toán mã hóa, thuật toán băm, thuật toán ký số đảm bảo an toàn"*
- điểm b) *"**Không lưu trữ trực tiếp dữ liệu cá nhân trên chuỗi khối, chỉ lưu trữ khi dữ liệu cá nhân đã được khử nhận dạng hoặc lưu trữ giá trị băm của dữ liệu cá nhân**"*
- điểm c) đánh giá tuân thủ định kỳ 01 năm/lần.

→ Đồ án on-chain chỉ lưu `cidHash = keccak256(cid)` + `encKeyHash = keccak256(aesKey)`, KHÔNG plaintext → **đúng từng chữ Đ11 k2b**. Dùng làm luận điểm "thiết kế tuân thủ pháp luật" + đối chiếu 3-mức "đã hiện thực".

### 3.2 Mã hoá + phân quyền truy cập (E2E + canAccess)

| Căn cứ | Nội dung verified | Map đồ án |
|---|---|---|
| **NĐ 356/2025 Đ12 k4** | *"Dữ liệu cá nhân trên điện toán đám mây phải được mã hóa ở trạng thái nghỉ và truyền, kèm theo phân quyền truy cập nghiêm ngặt"* | ciphertext AES-GCM trên IPFS (at-rest) + gate `ConsentLedger.canAccess` |
| **Luật 91/2025 Đ30 k3** | hệ thống dùng **chuỗi khối**/đám mây *"phải được tích hợp các biện pháp bảo mật DLCN phù hợp; phải sử dụng phương thức xác thực, định danh phù hợp và **phân quyền truy cập**"* | NaCl box + Web3Auth định danh + on-chain authz |
| **NĐ 165/2025 Đ11 k1** | giải pháp mã hoá khi truyền/lưu trữ/trên thiết bị; **quy trình giải mã yêu cầu xác thực định danh + cấp quyền**; ghi log mã hoá/giải mã | claim KeyShare phải qua `canAccess` + NaCl secret key của recipient |
| **NĐ 165/2025 Đ6, Đ15** | quản lý phân quyền truy cập + lịch sử truy cập; rủi ro **IAM (nhận dạng & quản lý truy cập)** | AccessLog + canAccess + role bitwise |
| **Luật Dữ liệu 60/2024 Đ22 k3** | *"Chủ sở hữu dữ liệu... quyết định việc mã hóa, giải mã dữ liệu"* | bệnh nhân giữ khoá, tự quyết |

### 3.3 Dữ liệu y tế = nhạy cảm + đồng ý + không chia sẻ bên thứ ba

| Căn cứ | Nội dung verified | Map đồ án |
|---|---|---|
| **NĐ 356/2025 Đ4** | DLCN nhạy cảm gồm **d) tình trạng sức khỏe**; **đ) dữ liệu sinh trắc học, đặc điểm di truyền** | dữ liệu y tế + sinh trắc |
| **Luật 91/2025 Đ26 k2** | lĩnh vực sức khoẻ *"**không cung cấp dữ liệu cá nhân cho bên thứ ba**... trừ trường hợp có yêu cầu bằng văn bản của chủ thể..."*; k1a phải có đồng ý; k3 **ứng dụng y tế phải tuân thủ đầy đủ** | consent model + blind mailbox (backend không đọc được) |
| **Luật 91/2025 Đ9** | đồng ý phải rõ ràng, in/sao chép văn bản (kể cả điện tử); **k4đ im lặng ≠ đồng ý** | grant consent EIP-712 (chủ động ký) |
| **Luật Dữ liệu 60/2024 Đ26 k1** | *"Chủ thể dữ liệu có quyền yêu cầu... **thu hồi, xóa hoặc hủy** dữ liệu"* | revoke consent + xoá KeyShare |

### 3.4 Xác thực mạnh / sinh trắc (căn cứ cấp Nghị định)

- **NĐ 356/2025 Đ9 k3b**: *"Sử dụng phương thức **xác thực mạnh, yêu cầu tối thiểu xác thực đa yếu tố** (mật khẩu, mã PIN kết hợp với mật khẩu dùng một lần, thiết bị ký số hoặc **yếu tố sinh trắc học**)"*.
- **Luật 91/2025 Đ31 k4a**: dữ liệu sinh trắc học phải *"có biện pháp bảo mật vật lý đối với thiết bị lưu trữ và truyền tải... hạn chế quyền truy cập"*.
→ Cơ sở mạnh hơn TT13/2025 cho biometric gate (gateOrThrow). Lưu ý: hệ thống hiện gate sinh trắc khi KÝ, chưa wire PIN/MFA đầy đủ ([31] m16) → nói "hỗ trợ một phần / hướng phát triển".

### 3.5 Chế tài (động cơ + threat model)

- **Luật 91/2025 Đ8**: mua bán DLCN phạt tới 10 lần khoản thu (k3); chuyển xuyên biên giới tới **5% doanh thu năm trước** (k4); vi phạm khác tới **3 tỷ đồng** (k5). Đ7 k6 cấm mua/bán DLCN.

---

## 4. Đề xuất cite theo chương (Phase C)

- **Ch1 Đặt vấn đề**: thêm Luật 91/2025 + NĐ 356/2025 (DLCN nhạy cảm y tế) + Luật Dữ liệu 60/2024 (chuỗi khối là nền tảng được luật công nhận) → động cơ pháp lý cấp thiết.
- **Ch2 Đối chiếu khung pháp lý (3 mức)**: bảng compliance bổ sung NĐ 356/2025 Đ11 (chuỗi khối → chỉ hash), Đ12 (mã hoá at-rest/transit + phân quyền), Đ4 (nhạy cảm); Luật 91/2025 Đ26/Đ30; NĐ 165/2025 Đ11/Đ6.
- **Ch5 Đóng góp / Threat model**: NĐ 356/2025 Đ11 k2b là luận điểm "kiến trúc tuân thủ"; Luật 91/2025 Đ8 (chế tài) cho threat model.
- **Ch6 Kết luận**: bỏ TT13/2026; "xác thực mạnh" gắn NĐ 356/2025 Đ9 k3b; "đã đáp ứng"→"đối chiếu".

## 5. .bib cần thêm/sửa

- THÊM: `luatdulieu2024` (Luật Dữ liệu 60/2024/QH15, 30/11/2024, hiệu lực 01/07/2025); `luatbvdlcn2025` (91/2025/QH15, 26/6/2025, hiệu lực 01/01/2026); `nd356_2025` (356/2025/NĐ-CP, 31/12/2025); `nd165_2025` (165/2025/NĐ-CP, 30/6/2025).
- SỬA: `nd13_2023` — note "hết hiệu lực 01/01/2026, thay bởi Luật 91/2025 + NĐ 356/2025" (giữ làm bối cảnh lịch sử nếu cần); `tt13_2025_byt` thêm ngày 06/6/2025 + giữ hậu tố `/TT-BYT`; bổ sung url `qd586_2026_byt`.
- Wire `blds2015` (Đ38 BLDS — CSDL điện tử) vào mục E2EE nếu còn mồ côi ([27] #12).
