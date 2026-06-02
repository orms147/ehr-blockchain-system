# PLAN VIẾT QUYỂN ĐATN — EHR Blockchain

> Last updated: 2026-06-01 (revised theo reference TOC khoá trên)
> Template: `quyen.md` (LaTeX, 13pt, twoside, A4)

## 🔴 RULES (memory `feedback_thesis_writing_rules.md`)

1. **Bám sát code** — viết về features ĐÃ code, không tương lai
2. **Cite file:line** mỗi claim kỹ thuật
3. **KHÔNG BỊA** số liệu, scenario, test result
4. **Bám LaTeX template** quyen.md + reference TOC style
5. **Sơ đồ Astah** → markdown spec + PlantUML

---

## 📑 TOC (revised theo reference)

### Chương 1 — Giới thiệu đề tài (10-15 trang)
- 1.1 Đặt vấn đề
- 1.2 Mục tiêu và phạm vi đề tài
- 1.3 Định hướng giải pháp
- 1.4 Bố cục đồ án

### Chương 2 — Khảo sát và Phân tích yêu cầu (20-25 trang)
- **2.1 Khảo sát hiện trạng**
  - 2.1.1 Hệ thống EHR quốc tế (Epic / OpenEMR / MedRec MIT)
  - 2.1.2 Hệ thống EHR Việt Nam (sotaykcb.vn / VNeID Y tế)
  - 2.1.3 Khung pháp lý Việt Nam (Luật KCB / 5 TT load-bearing / QĐ 586)
- **2.2 Tổng quan chức năng**
  - 2.2.1 Biểu đồ use case tổng quan
  - 2.2.2 Biểu đồ use case phân rã Bệnh nhân
  - 2.2.3 Biểu đồ use case phân rã Bác sĩ
  - 2.2.4 Biểu đồ use case phân rã Quản trị viên Tổ chức
  - 2.2.5 Biểu đồ use case phân rã Bộ Y tế
  - 2.2.6 Quy trình nghiệp vụ Tạo hồ sơ y tế
  - 2.2.7 Quy trình nghiệp vụ Cấp quyền truy cập
  - 2.2.8 Quy trình nghiệp vụ Yêu cầu truy cập 3 bước
  - 2.2.9 Quy trình nghiệp vụ Thu hồi cascade
  - 2.2.10 Quy trình nghiệp vụ Người thân tin cậy
- **2.3 Đặc tả chức năng** (11 UC Tier 1 full spec)
  - 2.3.1 Đặc tả UC Tạo hồ sơ y tế (UC001)
  - 2.3.2 Đặc tả UC Cấp quyền truy cập (UC002)
  - 2.3.3 Đặc tả UC Thu hồi quyền + cascade (UC003)
  - 2.3.4 Đặc tả UC Đăng ký Người thân tin cậy (UC004)
  - 2.3.5 Đặc tả UC Uỷ quyền bác sĩ Full Delegation (UC005)
  - 2.3.6 Đặc tả UC Yêu cầu truy cập hồ sơ (UC006)
  - 2.3.7 Đặc tả UC Đọc + giải mã hồ sơ (UC007)
  - 2.3.8 Đặc tả UC Tạo phiên bản cập nhật hồ sơ (UC008)
  - 2.3.9 Đặc tả UC Uỷ quyền lại cho bác sĩ khác (UC009)
  - 2.3.10 Đặc tả UC Tạo tổ chức y tế mới (UC010)
  - 2.3.11 Đặc tả UC Xác minh bác sĩ (UC011)
- **2.4 Yêu cầu phi chức năng**
  - 2.4.1 Bảo mật + Privacy
  - 2.4.2 Tuân thủ pháp luật Việt Nam
  - 2.4.3 Hiệu năng + Khả năng mở rộng
  - 2.4.4 Độ tin cậy + Tính toàn vẹn
  - 2.4.5 Yêu cầu kỹ thuật

### Chương 3 — Công nghệ sử dụng (15-20 trang, 7 mục flat)
- 3.1 Mật mã đối xứng AES-GCM + bất đối xứng NaCl
- 3.2 Blockchain Ethereum và Layer 2 Arbitrum
- 3.3 Smart Contract Solidity 0.8 + Foundry
- 3.4 EIP-712 typed data + Sponsor Relayer
- 3.5 The Graph indexer + IPFS Pinata
- 3.6 Mobile React Native + Expo + Web3Auth
- 3.7 Backend Node.js + Express + Prisma + PostgreSQL

### Chương 4 — Thiết kế, Triển khai và Đánh giá (30-35 trang)
- **4.1 Thiết kế kiến trúc**
  - 4.1.1 Lựa chọn kiến trúc (3-layer + Layer 2 blockchain)
  - 4.1.2 Thiết kế tổng quan (Component + Deployment)
  - 4.1.3 Thiết kế chi tiết gói (Mobile services / Backend routes / Smart contracts)
- **4.2 Thiết kế chi tiết**
  - 4.2.1 Thiết kế giao diện (screenshots key flows)
  - 4.2.2 Thiết kế lớp Smart Contract (Class diagram + 5 contract)
  - 4.2.3 Thiết kế cơ sở dữ liệu Prisma (ER diagram)
- **4.3 Xây dựng ứng dụng**
  - 4.3.1 Thư viện và công cụ sử dụng
  - 4.3.2 Kết quả đạt được
  - 4.3.3 Minh hoạ các chức năng chính (sequence + screenshots)
- **4.4 Kiểm thử**
  - 4.4.1 Forge test smart contract (96/100 pass)
  - 4.4.2 Load test backend với k6 (3 scenario)
  - 4.4.3 Kiểm thử thủ công golden path
- **4.5 Triển khai**
  - 4.5.1 Deploy smart contract Arbitrum Sepolia
  - 4.5.2 Deploy subgraph The Graph Studio
  - 4.5.3 Deploy backend + mobile

### Chương 5 — Các giải pháp và đóng góp nổi bật (10-15 trang, 4 contributions)
Mỗi contribution có pattern: **Vấn đề / Giải pháp / Kết quả**

- **5.1 Kiến trúc Envelope Encryption + Blind Mailbox**
- **5.2 Cơ chế Uỷ quyền dây chuyền và Thu hồi cascade** (gồm Footgun #1)
- **5.3 Người thân tin cậy On-chain** (gồm Footgun #2)
- **5.4 Patient zero-gas qua EIP-712 Sponsor Relayer + Biometric MFA**

### Chương 6 — Kết luận và Hướng phát triển (3-5 trang)
- 6.1 Kết luận
- 6.2 Hướng phát triển

### Phụ lục
- **Phụ lục A** — Hướng dẫn cài đặt và sử dụng
- **Phụ lục B** — Đặc tả UC Tier 2 (9 UC compact) + mention Tier 3 (4 UC)

---

## 📐 18 sơ đồ trong figures/ (giữ nguyên)

| # | Loại | Chương |
|---|---|---|
| 01 | Use Case tổng quan | 2.2.1 |
| 10-13 | Use Case phân rã (4 actor) | 2.2.2 → 2.2.5 |
| 14-18 | Activity (5 quy trình) | 2.2.6 → 2.2.10 |
| 02 | Component 3-layer | 4.1.2 |
| 03 | Deployment | 4.1.2 |
| 04 | Class 5 smart contract | 4.2.2 |
| 05 | ER Prisma | 4.2.3 |
| 06-09 | Sequence diagrams | 4.3.3 |

---

## 🔢 UC numbering convention

Linear `UC001 → UC024`:
- **UC001-UC011** (Tier 1): full spec ở Chương 2.3
- **UC012-UC020** (Tier 2): compact spec ở Phụ lục B
- **UC021-UC024** (Tier 3): 1 dòng mention

---

## 📚 Bibliography (~25-35 entries)

Đã có ở `Danh_sach_tai_lieu_tham_khao.bib` — 6 category:
- A. Blockchain (Ethereum, Arbitrum, EIP-712)
- B. Healthcare blockchain (MedRec, BHEEM)
- C. Cryptography (NIST AES-GCM, NaCl, HIPAA, GDPR)
- D. VBPL Việt Nam (Luật KCB, 5 TT, QĐ 586, Chỉ thị 17)
- E. VN EHR existing (sotaykcb.vn, kcb.vn)
- F. Framework + tool (RN, Expo, Tamagui, The Graph, Pinata, Web3Auth, viem, Foundry, k6)

---

## 🛠 Workflow viết (revised)

### Stage F (hiện tại — 1 ngày)
- ✅ Update PLAN
- ⏳ Rewrite 6 chương + Phụ lục B skeleton theo TOC mới
- ⏳ Fill Chương 1 (full content ~10-15 trang) làm mẫu style
- ⏳ Commit + user verify

### Stage G — Fill Chương 2-6 (5-7 ngày)
Theo thứ tự: Ch.2 (lớn nhất sau Ch.4) → Ch.3 → Ch.4 → Ch.5 → Ch.6

### Stage H — Polish + Phụ lục (1-2 ngày)
- Phụ lục A hoàn chỉnh
- Phụ lục B fill 9 UC Tier 2
- Bibliography refine
- Final LaTeX build verify

### Stage I — Render sơ đồ → PNG → embed LaTeX (1 ngày)
- 18 PUML → PNG qua plantuml.com/online hoặc Astah
- Update mỗi chapter `\includegraphics`

---

## ⚙ HELP từ tôi sẽ làm

Khi user ping "viết Ch X" hoặc "viết UC YYY":
1. ĐỌC code liên quan trước (file:line cụ thể)
2. Drop draft LaTeX với citation IEEE `\cite{...}`
3. ĐÁNH DẤU `<TODO: cần đo>` nếu thiếu data thật
4. KHÔNG bịa số liệu

Khi user verify Phase D xong → fill Chương 4.4 Kiểm thử với số liệu thật.
