# PLAN VIẾT QUYỂN ĐATN — EHR Blockchain

> Last updated: 2026-06-01
> Template: `quyen.md` (LaTeX, 13pt, twoside, A4)
> Subfiles cần tạo: `Bia.tex`, `Bia_lot.tex`, `Tu_viet_tat.tex`, `Chuong/0_2_Loi_cam_on.tex`, `0_3_Tom_tat_noi_dung.tex`, `0_4_Tom_tat_noi_dung_English.tex`, `1_Gioi_thieu.tex`, `2_Khao_sat.tex`, `3_Cong_nghe.tex`, `4_Ket_qua_thuc_nghiem.tex`, `5_Giai_phap_dong_gop.tex`, `6_Ket_luan.tex`, `7_Luu_y_tai_lieu_tham_khao.tex`, `Phu_luc_A.tex`, `Phu_luc_B.tex`
> Bib: `Danh_sach_tai_lieu_tham_khao.bib` (IEEE style)

## 🔴 RULES (memory `feedback_thesis_writing_rules.md`)

1. **Bám sát code** — viết về features ĐÃ code, không tương lai
2. **Cite file:line** mỗi claim kỹ thuật
3. **KHÔNG BỊA** số liệu, scenario, test result
4. **Bám LaTeX template** quyen.md
5. **Sơ đồ Astah** → markdown spec + optional PlantUML

---

## Mục lục Quyển (theo quyen.md line 268-306)

| # | Tên chương | File | Trang ước |
|---|---|---|---|
| - | Bìa + Lời cảm ơn + Tóm tắt VN/EN + ToC + Danh mục hình/bảng/từ viết tắt | `Bia.tex`, `0_2_*`, `0_3_*`, `0_4_*` | i-x |
| **1** | GIỚI THIỆU ĐỀ TÀI | `1_Gioi_thieu.tex` | 10-15 |
| **2** | KHẢO SÁT VÀ PHÂN TÍCH YÊU CẦU | `2_Khao_sat.tex` | 15-20 |
| **3** | NỀN TẢNG LÝ THUYẾT VÀ CÔNG NGHỆ SỬ DỤNG | `3_Cong_nghe.tex` | 20-25 |
| **4** | PHÂN TÍCH THIẾT KẾ, TRIỂN KHAI VÀ ĐÁNH GIÁ HỆ THỐNG | `4_Ket_qua_thuc_nghiem.tex` | 30-40 |
| **5** | CÁC GIẢI PHÁP VÀ ĐÓNG GÓP NỔI BẬT | `5_Giai_phap_dong_gop.tex` | 8-12 |
| **6** | KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN | `6_Ket_luan.tex` | 3-5 |
| - | Tài liệu tham khảo + Phụ lục A/B | `*.bib`, `Phu_luc_*.tex` | 10-15 |

**Tổng**: 100-130 trang (chuẩn ĐATN ngành CNTT).

---

## CHƯƠNG 1 — Giới thiệu đề tài (10-15 trang)

### Sections
1.1 **Bối cảnh và tính cấp thiết**
1.2 **Mục tiêu và phạm vi đề tài**
1.3 **Đóng góp chính**
1.4 **Cấu trúc Quyển**

### Content + code citations cần đọc

**1.1 Bối cảnh** — focus 3 điểm:
- HSBA giấy → điện tử (cite VBPL):
  - **QĐ 586/QĐ-BYT 09/03/2026** — deadline **31/12/2026** + **01/01/2027 bỏ giấy** (load-bearing — cite chính)
  - **TT 13/2025/TT-BYT** (21/07/2025) — HSBA điện tử
  - **Luật KCB 15/2023/QH15** — HSBA giấy ≡ HSBA điện tử pháp lý
  - Source memory: `project_thesis_supervisor_guidance.md`
- Vấn đề privacy + đồng thuận patient:
  - VBPL: TT 32/2023 (Chương X HSBA), TT 26/2025 (đơn thuốc), TT 13/2026 (vaccination)
  - HIPAA US + GDPR EU (so sánh quốc tế) — cite tổng quan
- Tại sao blockchain:
  - Tamper-resistance — patient không thể bị bệnh viện sửa hồ sơ ngầm
  - Audit trail — mọi grant/revoke immutable
  - Self-sovereign — patient là chủ quyền, không phụ thuộc bệnh viện làm gateway

**1.2 Mục tiêu** — phải bám CODE:
- Mục tiêu chính: thiết kế hệ thống EHR phân tán cho phép patient tự quản lý quyền truy cập + cấp/thu hồi cho cơ sở y tế
- 4 đối tượng (verify từ AccessControl.sol bitwise role flags):
  - Patient (role=1)
  - Doctor (role=2)
  - Organization admin (role=4)
  - Ministry (role=8)
  - + flag verified (16, 32)
- Phạm vi:
  - Mobile React Native (Expo SDK 55)
  - 5 smart contract Solidity 0.8.24 trên Arbitrum Sepolia
  - Backend Node.js Express + Postgres
  - Subgraph indexer The Graph
  - IPFS lưu ciphertext qua Pinata
- KHÔNG bao gồm (transparent disclosure cho reviewer):
  - HL7 FHIR liên thông (defer post-thesis)
  - DICOM imaging server
  - PKI chữ ký số NEAC (thay bằng EIP-712 + on-chain verified flag)
  - XML BHYT QĐ 4210

**1.3 Đóng góp** — 3 điểm:
1. **Architecture envelope encryption + blind mailbox** — backend không bao giờ thấy plaintext. Cite [backend/src/routes/keyShare.routes.js](../backend/src/routes/keyShare.routes.js) (gate canAccess on-chain trước trả encryptedPayload).
2. **Delegation CHAIN topology with cascade revoke** — patient revoke A → walk chain → kill mọi quyền derived. Cite [contracts/src/ConsentLedger.sol:_hasValidNormalConsent](../contracts/src/ConsentLedger.sol).
3. **Trusted Contact emergency family registry** — replace 24h emergency access cũ. On-chain registry + auto pre-share KeyShare. Cite [contracts/src/ConsentLedger.sol setTrustedContact](../contracts/src/ConsentLedger.sol) + [mobile/src/services/trustedContact.service.js](../mobile/src/services/trustedContact.service.js).

**1.4 Cấu trúc Quyển** — liệt kê 6 chương + tóm tắt 2 dòng mỗi.

---

## CHƯƠNG 2 — Khảo sát và phân tích yêu cầu (15-20 trang)

### Sections (theo gợi ý giảng viên: so sánh 3 chiều)
2.1 **Khảo sát hệ thống EHR quốc tế** — 3 hệ:
- **Epic** (Mỹ, market leader) — closed-source, EHR centralized
- **OpenEMR** (open-source PHP/MySQL) — centralized
- **MedRec MIT** (academic prototype) — blockchain-based, predecessor reference

So sánh table: tính năng / decentralized / patient-control / open

2.2 **Khảo sát hệ thống EHR Việt Nam**:
- **Hồ sơ sức khoẻ điện tử VN** (sotaykcb.vn) — VietPharma centralized
- **VNeID Y tế** (Chỉ thị 17/CT-TTg) — quốc gia, KHÔNG mở data
- **Hệ thống nội bộ bệnh viện lớn** (Bạch Mai, Chợ Rẫy) — closed

2.3 **So sánh chi tiết** (bảng) — feature matrix:
| Tính năng | Epic | OpenEMR | MedRec | VN HSSKĐT | **App này** |
|---|---|---|---|---|---|
| On-chain consent | ✗ | ✗ | ✓ | ✗ | ✓ |
| Patient self-sovereign | partial | partial | ✓ | ✗ | ✓ |
| E2E encryption | ✗ | ✗ | partial | ✗ | ✓ |
| Vietnamese compliance | ✗ | ✗ | ✗ | ✓ | ✓ |

(Verify từng cột bằng web search trước khi write)

2.4 **Phân tích pháp lý VN** (theo gợi ý giảng viên #3):
- Luật KCB 15/2023 → HSBA điện tử ≡ giấy
- TT 13/2025 → tiêu chuẩn HSBA điện tử
- TT 32/2023 Chương X → nội dung 29 mẫu
- TT 26/2025 → đơn thuốc multi-drug
- TT 13/2026 → vaccination (HPV bắt buộc)
- QĐ 586/QĐ-BYT 09/03/2026 → deadline 31/12/2026
- Source: memory `project_thesis_supervisor_guidance.md` (5 VBPL load-bearing + 8 indirect)

2.5 **Use Case Diagram** → vẽ Astah (xem section "SƠ ĐỒ" dưới)

2.6 **Yêu cầu chức năng + phi chức năng**:
- Functional: 4 đối tượng × actions (Patient: tạo/share/revoke record; Doctor: requestAccess/decrypt/addUpdate; Org: verifyDoctor; Ministry: createOrg/verifyDoctorByMinistry)
- Non-functional: bảo mật (privacy, integrity), khả năng mở rộng, compliance pháp luật VN, UX cho người lớn tuổi (font 15pt+)

---

## CHƯƠNG 3 — Nền tảng lý thuyết và công nghệ (20-25 trang)

### Sections
3.1 **Cơ sở mật mã**:
- AES-256-GCM (cite NIST SP 800-38D)
- NaCl box / x25519 + xsalsa20-poly1305 (cite Bernstein "Cryptography in NaCl 2009")
- EIP-712 (cite EIP-712 spec)
- keccak256 (Ethereum hash)
- Code refs: [mobile/src/services/crypto.js](../mobile/src/services/crypto.js), [nacl-crypto.js](../mobile/src/services/nacl-crypto.js), [eip712.js](../mobile/src/utils/eip712.js)

3.2 **Blockchain Ethereum + L2**:
- EVM basics (cite Yellow Paper Wood 2014)
- Arbitrum (cite Optimistic Rollup paper) — chọn vì gas thấp, finality nhanh, Ethereum security
- Tại sao Arbitrum Sepolia testnet (thesis demo, không cần mainnet)

3.3 **Smart contract pattern**:
- Solidity 0.8.24 + Foundry (Forge build/test)
- EIP-712 meta-tx (gasless cho patient)
- Bitwise role flags (gas efficient)
- Code refs: [contracts/src/AccessControl.sol bitwise flags](../contracts/src/AccessControl.sol)

3.4 **The Graph indexing**:
- Vì sao subgraph thay vì RPC poll (avoid 429 storm)
- Subgraph poll backend → DB cache (30s interval)
- Code refs: [subgraph/subgraph.yaml 4 dataSources](../subgraph/subgraph.yaml), [backend/src/services/subgraphSync.service.js](../backend/src/services/subgraphSync.service.js)

3.5 **IPFS + Pinata**:
- Content-addressed storage (CID = hash content)
- Decentralization vs Bộ TT&TT centralized argument (cite kèm)
- Code refs: [mobile/src/services/ipfs.service.js](../mobile/src/services/ipfs.service.js)

3.6 **Mobile stack**:
- React Native + Expo SDK 55 dev client (KHÔNG Expo Go)
- Web3Auth Sapphire v8.1.0 (7 OAuth providers + email_passwordless + sms_passwordless)
- Tamagui design system
- TanStack Query data fetching
- Code refs: [mobile/package.json](../mobile/package.json), [mobile/src/services/walletAction.service.js](../mobile/src/services/walletAction.service.js)

3.7 **Backend stack**:
- Node.js + Express + Prisma + PostgreSQL (Neon serverless)
- Socket.io real-time + Expo push notifications
- viem RPC client
- Code refs: [backend/src/app.js](../backend/src/app.js), [backend/prisma/schema.prisma](../backend/prisma/schema.prisma)

3.8 **EIP-712 sponsor relayer pattern**:
- User ký typed data, backend submit tx + trả gas
- Mỗi tháng 100 sponsored signatures free per patient
- Code refs: [backend/src/services/relayer.service.js](../backend/src/services/relayer.service.js)

---

## CHƯƠNG 4 — Phân tích thiết kế, triển khai, đánh giá (30-40 trang — chương lớn nhất)

### Sections
4.1 **Kiến trúc tổng thể** (Architecture Overview):
- 3 layer: Mobile / Backend / Blockchain
- 4 component bổ trợ: IPFS, Subgraph, Web3Auth, Postgres
- **SƠ ĐỒ DEPLOYMENT** (Astah)

4.2 **Thiết kế smart contracts** (theo memory `project_contracts_architecture.md`):
- 5 contracts: AccessControl, RecordRegistry, ConsentLedger, DoctorUpdate, EHRSystemSecure
- **SƠ ĐỒ CLASS** (Astah — 5 contract + interactions)
- Mỗi contract: 1 section nhỏ với
  - Mục đích
  - State variables chính
  - Function chính (cite từ Solidity source)
  - Events emit

4.3 **Database schema (off-chain)**:
- Prisma model: User, DoctorProfile, RecordMetadata, KeyShare, Consent (cache), TrustedContact, OrganizationMember, ...
- Cite [backend/prisma/schema.prisma](../backend/prisma/schema.prisma)
- **SƠ ĐỒ ER** (Astah)
- Important note: Consent table chỉ cache — luôn check on-chain canAccess

4.4 **Mobile flows critical** (mỗi flow 1 subsection):
- 4.4.1 **Flow Tạo hồ sơ** — encrypt AES → upload IPFS → registerRecord on-chain → subgraph index. **SƠ ĐỒ SEQUENCE**
- 4.4.2 **Flow Cấp quyền (Grant Consent)** — ShareSheet → EIP-712 → relayer sponsor → KeyShare blind mailbox → cascade keys. **SƠ ĐỒ SEQUENCE**
- 4.4.3 **Flow Doctor yêu cầu (Request Access)** — 3 bước: doctor request → patient approve → doctor claim. **SƠ ĐỒ SEQUENCE**
- 4.4.4 **Flow Thu hồi cascade** — revoke walk chain to root + cascade descendant + cascade delegation. **SƠ ĐỒ SEQUENCE**
- 4.4.5 **Flow Trusted Contact emergency** — patient setTC → TC mở record fresh device → canAccess on-chain bypass. **SƠ ĐỒ SEQUENCE**

Mỗi flow: list step-by-step + cite file:line từng step.

4.5 **Backend gates + middlewares**:
- `authenticate` middleware (JWT verify)
- `onChainRole` middleware (role cache 10min, refresh subgraph event)
- `canAccess` gate trong /record/:cidHash route
- Cite [backend/src/middleware/auth.js](../backend/src/middleware/auth.js), [onChainRole.js](../backend/src/middleware/onChainRole.js), [keyShare.routes.js](../backend/src/routes/keyShare.routes.js)

4.6 **Bảo mật & tuân thủ pháp luật VN**:
- Compliance TT 13/2025/TT-BYT (HSBA điện tử): biometric MFA 8 sign site
- Compliance TT 26/2025: đơn thuốc multi-drug (RxCard component)
- Compliance TT 13/2026: vaccination schema (VaccCard component)
- Cite memory `project_g12_forms_complete.md`

4.7 **Đánh giá hiệu năng** (theo gợi ý giảng viên #5):
- Forge test results: 96/100 pass (cite test output)
- Load test k6: từ `load-test/RESULTS.md` (USER FILL sau khi run scenarios)
- Bảng số liệu p50/p95/p99 cho 3 scenario (Light 10/Medium 50/Stress 200 VUs)
- Bottleneck analysis
- Conclusion về scalability

---

## CHƯƠNG 5 — Các giải pháp và đóng góp nổi bật (8-12 trang)

### Sections
5.1 **Đóng góp 1: Blind mailbox pattern** — backend không bao giờ thấy plaintext, chỉ là sink encrypted payload + canAccess gate. So sánh với MedRec MIT (backend giải mã được).

5.2 **Đóng góp 2: Delegation CHAIN topology với epoch cascade** — patient revoke ancestor → walk chain (max 8 hops) → kill mọi descendant. Cite [_hasValidNormalConsent](../contracts/src/ConsentLedger.sol).

5.3 **Đóng góp 3: Trusted Contact registry on-chain** — emergency family access immutable, không cần backend confirm. Replace older 24h emergency flow (đã drop 2026-05-04). Cite [setTrustedContact + canAccess fix #2](../contracts/src/ConsentLedger.sol).

5.4 **Đóng góp 4: EIP-712 sponsor relayer** — patient zero-gas (100 signatures/tháng), doctor/org tự pay. Mass adoption barrier removed.

5.5 **Đóng góp 5: Biometric MFA gate cho on-chain sign** — TT 13/2025 compliance (8 sign sites in app). Cite [biometricGate.ts](../mobile/src/utils/biometricGate.ts).

5.6 **So sánh với hệ thống quốc tế/VN** (gợi ý giảng viên #1) — feature matrix lặp lại từ Ch 2 với phân tích "khác biệt rõ rệt" của app.

---

## CHƯƠNG 6 — Kết luận và hướng phát triển (3-5 trang)

### Sections
6.1 **Kết luận** — recap:
- 5 contract deploy live testnet Arbitrum Sepolia (cite addresses)
- App mobile demo 4 role end-to-end
- Compliance 5 VBPL load-bearing VN

6.2 **Hạn chế hiện tại** (transparent disclosure):
- Chưa liên thông HL7 FHIR
- Chưa DICOM imaging
- 29 mẫu HSBA chuyên khoa — generic form
- XML BHYT QĐ 4210 — không output (app không thanh toán BHYT)
- 4 test contract failing setUp() baseline (pre-existing, không block)
- Subgraph indexer phụ thuộc The Graph Studio (centralized)

6.3 **Hướng phát triển** (future work):
- HL7 FHIR integration
- DICOM imaging support
- 29 mẫu HSBA chuyên khoa
- PKI chữ ký số NEAC tích hợp (bổ sung EIP-712, không thay)
- Apple Pay / Google Pay tích hợp BHYT
- Multi-chain support (Ethereum mainnet + Polygon)
- Federated subgraph (decentralized indexer)

---

## PHỤ LỤC

### Phụ lục A — Hướng dẫn cài đặt và sử dụng
- Setup backend (npm install + DATABASE_URL + npm run dev)
- Setup mobile (npm install + .env + npm run android)
- Setup contracts (foundry + forge build + deploy script)
- Setup subgraph (graph deploy)
- 5 contract addresses live (cite từ subgraph.yaml)

### Phụ lục B — Đặc tả Use Case chi tiết
- Use case 1: Patient tạo hồ sơ
- Use case 2: Patient cấp quyền cho bác sĩ
- Use case 3: Patient thu hồi quyền
- Use case 4: Doctor yêu cầu quyền
- Use case 5: Doctor cập nhật phiên bản hồ sơ
- Use case 6: Org admin thêm/verify doctor
- Use case 7: Ministry tạo cơ sở y tế
- Use case 8: Trusted Contact emergency access

Mỗi use case: tên / actor / pre-condition / main flow / alternate flow / post-condition.

---

## 📐 SƠ ĐỒ CHO ASTAH (18 sơ đồ — updated 2026-06-01)

Mỗi sơ đồ có 2 file trong `figures/`:
- **Markdown spec** — elements + relationships + code citation
- **PlantUML source** — for Astah PlantUML plugin / online render

### Use Case (5)
| # | Loại | Chương | File |
|---|---|---|---|
| 01 | **Tổng quan** (high-level) | 2.5 | `01-usecase-overview` |
| 10 | Phân rã Patient (18 UC) | 2.6.1 | `10-usecase-patient` |
| 11 | Phân rã Doctor (10 UC) | 2.6.2 | `11-usecase-doctor` |
| 12 | Phân rã Org Admin (8 UC) | 2.6.3 | `12-usecase-org` |
| 13 | Phân rã Ministry (6 UC) | 2.6.4 | `13-usecase-ministry` |

### Activity (5)
| # | Loại | Chương | File |
|---|---|---|---|
| 14 | Tạo hồ sơ | 4.4.1 | `14-activity-create-record` |
| 15 | Cấp quyền | 4.4.2 | `15-activity-grant-consent` |
| 16 | Yêu cầu truy cập 3 phase | 4.4.3 | `16-activity-request-access` |
| 17 | Thu hồi cascade | 4.4.4 | `17-activity-revoke-cascade` |
| 18 | Trusted Contact emergency | 4.4.5 | `18-activity-trusted-contact` |

### Architecture + Data (4)
| # | Loại | Chương | File |
|---|---|---|---|
| 02 | Component 3-layer | 4.1 | `02-component-3-layer` |
| 03 | Deployment | 4.1 | `03-deployment` |
| 04 | Class (5 contract) | 4.2 | `04-class-contracts` |
| 05 | ER (Prisma) | 4.3 | `05-er-prisma` |

### Sequence (4)
| # | Loại | Chương | File |
|---|---|---|---|
| 06 | Grant Consent | 4.4.2 | `06-seq-grant-consent` |
| 07 | Request Access 3-step | 4.4.3 | `07-seq-request-access` |
| 08 | Trusted Contact | 4.4.5 | `08-seq-trusted-contact` |
| 09 | Revoke Cascade | 4.4.4 | `09-seq-revoke-cascade` |

**Đặc tả use case** (Phụ lục B): skeleton có sẵn ở `Chuong/Phu_luc_B.tex` — fill content sau khi vẽ xong 18 sơ đồ trên (Stage E).

---

## 📚 BIBLIOGRAPHY plan (Danh_sach_tai_lieu_tham_khao.bib)

Cần ~25-35 entries IEEE style. Categories:

**A. Smart contract + blockchain**:
1. Wood G., "Ethereum Yellow Paper" 2014
2. Buterin V., "Ethereum White Paper" 2013
3. Kalra P. et al., "Arbitrum Nitro" 2022
4. Bernstein D., "Cryptography in NaCl" 2009
5. Daemen J., Rijmen V., "AES" NIST 2001
6. EIP-712 spec
7. Solidity 0.8 documentation

**B. Healthcare blockchain**:
8. Azaria A. et al., "MedRec: Using Blockchain for Medical Data Access" MIT 2016
9. Vora J. et al., "BHEEM: Blockchain-Based for HSBA" 2018
10. (Tìm thêm 2-3 paper IEEE/ACM 2022-2025)

**C. Privacy + encryption**:
11. NIST SP 800-38D — AES-GCM
12. HIPAA US 1996 Privacy Rule
13. GDPR EU 2016/679

**D. Vietnamese legal documents**:
14. Luật KCB 15/2023/QH15
15. TT 13/2025/TT-BYT
16. TT 26/2025/TT-BYT
17. TT 32/2023/TT-BYT
18. TT 13/2026/TT-BYT
19. QĐ 586/QĐ-BYT 09/03/2026
20. Chỉ thị 17/CT-TTg (VNeID)
21. QĐ 965/QĐ-BYT (HL7/FHIR/DICOM roadmap)

**E. Vietnam EHR existing systems** (web sources):
22. sotaykcb.vn — Hồ sơ sức khoẻ điện tử VN
23. neac.gov.vn — NEAC PKI hướng dẫn
24. (...)

**F. Framework + tool**:
25. React Native + Expo docs
26. Tamagui design system
27. The Graph protocol whitepaper
28. Pinata + IPFS docs
29. Web3Auth Sapphire SDK

Source memory: `project_thesis_supervisor_guidance.md` có sẵn list 5 VBPL load-bearing + 8 indirect + ~40 web sources.

---

## 🛠 WORKFLOW VIẾT (suggested order)

### Stage 1 — Setup (1 ngày)
- Tạo folder structure: `Bao Cao/Chuong/`, `Bao Cao/figures/`, `Bao Cao/code/`
- Tạo subfile skeleton (placeholder content): `Bia.tex`, `Bia_lot.tex`, `Tu_viet_tat.tex`, `0_2_*.tex`, ..., `Phu_luc_B.tex`
- Build LaTeX lần đầu (`pdflatex quyen` → fix package error nếu có)
- Setup `Danh_sach_tai_lieu_tham_khao.bib` với 5-10 entry đầu

### Stage 2 — Foundation chapters (3-5 ngày)
- Chương 1 (Giới thiệu) — viết trước, cite VBPL
- Chương 2 (Khảo sát) — bảng so sánh + use case diagram
- Chương 3 (Công nghệ) — list stack với citation

### Stage 3 — Core technical (5-7 ngày, chương lớn nhất)
- Chương 4 (Thiết kế + triển khai + đánh giá) — viết theo từng section
- Yêu cầu user run load test trước (k6) → fill số liệu mục 4.7
- Yêu cầu Astah diagram trước section 4.1/4.2/4.3 (component/class/ER) + section 4.4 (sequence × 5)

### Stage 4 — Contributions + Conclusion (2-3 ngày)
- Chương 5 (Đóng góp) — recap từ Ch 4 với góc nhìn "đóng góp khoa học"
- Chương 6 (Kết luận) — ngắn, transparent về hạn chế

### Stage 5 — Phụ lục + Polish (2 ngày)
- Phụ lục A (Hướng dẫn cài) — bám CLAUDE.md commands
- Phụ lục B (Use case spec)
- Bibliography hoàn chỉnh
- Glossary `Tu_viet_tat.tex`
- Re-build LaTeX lần cuối, kiểm trang/format

**Tổng**: 13-20 ngày làm việc đều đặn cho 1 người.

---

## ⚙ HELP từ tôi sẽ làm

Khi user ping "viết Ch X" hoặc "vẽ sơ đồ Y":
1. ĐỌC code liên quan trước (file:line cụ thể)
2. Drop draft LaTeX với citation
3. ĐÁNH DẤU `<TODO: cần đo>` nếu thiếu data
4. ĐÁNH DẤU `<CITE: tìm reference>` nếu chưa có source academic
5. KHÔNG bịa số liệu

Khi user ping "sơ đồ X":
1. ĐỌC code structure
2. Drop markdown spec (elements/relationships) → user vẽ Astah
3. Drop PlantUML source (optional, nếu user dùng Astah plugin)

---

## TIẾP THEO

User chọn 1 trong các option:
- **A**: Tôi tạo skeleton subfiles (`Bia.tex`, `Tu_viet_tat.tex`, ... placeholders) để LaTeX compile được
- **B**: Tôi viết Chương 1 (Giới thiệu) đầu tiên (sau khi user verify Phase C OK)
- **C**: Tôi vẽ 7 sơ đồ Astah trước (Use case + Class + ER + 4 Sequence) — visualize trước, viết content sau
- **D**: User chỉ định section/chương cụ thể
