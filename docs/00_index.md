# 00 — MỤC LỤC & ĐIỂM BẮT ĐẦU (bộ tài liệu onboarding EHR-on-blockchain)

> **Đối tượng đọc:** lập trình viên smart-contract — rành blockchain/Solidity/EVM (nhưng đã quên kha
> khá), **không biết backend**, **không biết mật mã**, **ít biết mobile nhất**.
> **Mục tiêu:** đọc xong đủ tự tin TRÌNH BÀY và TRẢ LỜI HỘI ĐỒNG về bất kỳ phần nào của hệ thống.
>
> **Quy tắc của cả bộ tài liệu (RULE #0):** chỉ viết điều đọc được từ code thật; mọi khẳng định kỹ thuật
> đều dẫn nguồn dạng `path:line`. CLAUDE.md có thể đã cũ (stale) — **code là nguồn chân lý**. Các điểm
> CLAUDE.md lệch code đã được đánh dấu "⚠️ Drift" ngay trong từng tài liệu.

---

## 0. Hệ thống này là gì (1 đoạn để mở bài)

Hệ thống Hồ sơ Y tế điện tử (EHR) trên blockchain, mô phỏng mô hình quản lý ngành Y tế Việt Nam 2 tầng
(**Bộ Y tế → Cơ sở y tế → Bác sĩ**). Trọng tâm luận văn là **an toàn & riêng tư**: nội dung hồ sơ được
mã hoá đầu-cuối; blockchain chỉ giữ **metadata + HASH** (không bao giờ giữ nội dung hay khoá); backend chỉ
là **"hòm thư mù" (blind mailbox)** chuyển phát gói đã niêm phong mà bản thân nó không mở được; **quyền
truy cập là quyết định on-chain** (`ConsentLedger.canAccess`), backend chỉ thi hành. Người dùng đăng nhập
không mật khẩu (Web3Auth → ví Ethereum nhúng) và **không phải trả gas** (backend tài trợ 100 chữ
ký/tháng, hết quota thì tự trả).

---

## 1. Lộ trình đọc khuyến nghị (tuỳ mục tiêu)

Bộ tài liệu gồm **4 tài liệu nền** (`01`–`04`) giải thích từng tầng kỹ thuật, và **13 tài liệu chức năng**
(`f01`–`f13`) đi theo từng use-case end-to-end (UI → service mobile → backend → contract → IPFS/DB).

### Lộ trình A — "Hiểu nhanh để bảo vệ" (nếu ít thời gian)
1. `00` (file này) — bức tranh tổng + thuật ngữ.
2. `04_ma_hoa.md` — **mô hình riêng tư 3 lớp** (trái tim luận văn; hội đồng hỏi nhiều nhất).
3. `01_smart_contracts.md` — 5 contract (bạn rành SC, đọc nhanh).
4. `f06` (chia sẻ) + `f09` (đọc hồ sơ) — luồng thể hiện rõ nhất "on-chain gate + blind mailbox + giải mã 2 lớp".

### Lộ trình B — "Theo tầng kỹ thuật" (hiểu hệ thống bài bản)
`01_smart_contracts` → `04_ma_hoa` → `02_backend` → `03_mobile` → rồi quét các `f*` theo nhu cầu.
(Đặt `04` ngay sau contract vì mã hoá là khái niệm nền mà cả backend lẫn mobile đều dựa vào.)

### Lộ trình C — "Theo dòng đời dữ liệu" (kể chuyện mạch lạc cho hội đồng)
`f01` đăng nhập → `f02` đăng ký vai trò → `f03` tạo org & xác minh bác sĩ → `f04` bệnh nhân tạo hồ sơ →
`f05` bác sĩ tạo/cập nhật → `f06` chia sẻ (consent) → `f07` yêu cầu truy cập 2 bên → `f08` uỷ quyền →
`f09` đọc hồ sơ được chia sẻ → `f10` thu hồi → `f11` khẩn cấp & Trusted Contact → `f12` gas/quota →
`f13` đồng bộ event & subgraph.

> Gợi ý: dù theo lộ trình nào, hãy đọc **mục "Tóm tắt 30 giây"** đầu mỗi tài liệu trước — nó cho bạn câu
> trả lời gọn cho hội đồng; chi tiết `path:line` để tra cứu khi bị hỏi sâu.

---

## 2. Sơ đồ kiến trúc tổng thể (ASCII)

```
        ┌────────────────────────────────────────────────────────────────────────┐
        │                         MOBILE (React Native / Expo)                     │
        │   Web3Auth login → ví Ethereum nhúng (private key trong RAM)            │
        │   Crypto trên máy:  AES-GCM (nội dung)  +  NaCl box (khoá)  +  keccak256 │
        │   EIP-712 ký consent/delegation/trusted-contact   |  biometric gate      │
        └───────┬───────────────────┬───────────────────────────────┬────────────┘
                │ (1) HTTP + JWT     │ (2) upload/download ciphertext │ (3) self-pay tx
                │                    │     TRỰC TIẾP từ mobile        │ (khi hết quota)
                ▼                    ▼                                ▼
   ┌────────────────────────┐  ┌──────────────┐          ┌──────────────────────────┐
   │  BACKEND (Node/Express) │  │  IPFS/Pinata │          │  BLOCKCHAIN (Arb Sepolia) │
   │  "blind mailbox"        │  │  ciphertext  │          │  5 contract Solidity      │
   │  • gate canAccess       │  │  AES-GCM     │          │  AccessControl            │
   │  • relayer trả gas hộ   │  └──────────────┘          │  RecordRegistry           │
   │  • cache + realtime     │        ▲                   │  ConsentLedger (canAccess)│
   └───┬──────────┬─────────┘        │ CID               │  DoctorUpdate             │
       │          │ relayer ký+gửi tx (sponsored)         │  EHRSystemSecure          │
       │          └───────────────────────────────────────►  (chỉ cidHash, encKeyHash│
       │                                                   │   = HASH, KHÔNG nội dung)│
       │ đọc on-chain canAccess / role                     └───────────┬──────────────┘
       │ (viem publicClient)                                           │ phát event
       ▼                                                               ▼
   ┌────────────────────────┐                            ┌──────────────────────────┐
   │  POSTGRES (Prisma)     │◄───────────────────────────│  SUBGRAPH (The Graph)     │
   │  CACHE + KeyShare      │   subgraphSync poll 30s     │  index event → GraphQL    │
   │  (encryptedPayload =   │   ghi cache consent/        └──────────────────────────┘
   │   NaCl box, backend MÙ)│   delegation/trusted-contact
   └────────────────────────┘
```

Điểm mấu chốt để nói với hội đồng:
- **3 đường ra từ mobile**: (1) HTTP có JWT tới backend; (2) ciphertext lên/xuống **IPFS trực tiếp** (không
  qua backend); (3) khi hết quota, mobile **tự broadcast** transaction (self-pay).
- **Phân tách trách nhiệm**: nội dung ở IPFS (mã hoá), khoá ở Postgres (mã hoá phong bì), quyền ở chain
  (hash + metadata). Không thành phần đơn lẻ nào đủ để lộ dữ liệu y tế.
- **Backend không quyết định quyền** — nó đọc `ConsentLedger.canAccess` on-chain trước khi trả khoá.
- **Postgres chỉ là cache** (đồng bộ từ Subgraph); chân lý là on-chain.

---

## 3. Mô hình riêng tư 3 lớp (tóm tắt — chi tiết ở `04_ma_hoa.md`)

Đây là **envelope encryption** (mã hoá phong bì): khoá đối xứng nhanh mã nội dung lớn; khoá bất đối xứng
bọc cái khoá đó để gửi an toàn cho từng người nhận.

| Lớp | Lưu ở đâu | Nội dung cụ thể | Ai đọc được |
|---|---|---|---|
| **Nội dung** | IPFS / Pinata | `base64(IV ‖ ciphertext ‖ tag)` của FHIR bundle, mã bằng **AES-256-GCM** (khoá ngẫu nhiên / record) | Bất kỳ ai tải file, nhưng thiếu `aesKey` → chỉ là rác |
| **Khoá** | Postgres bảng `KeyShare` | `encryptedPayload` = **NaCl box** của `{cid, aesKey}` mã cho **public key người nhận** | **CHỈ người nhận** (có NaCl secret key). Backend MÙ — không có secret key |
| **Quyền** | On-chain `ConsentLedger` | `cidHash = keccak256(cid)`, `encKeyHash = keccak256(aesKey)`, grantee, expireAt, cờ — **toàn HASH/metadata** | Public (ai cũng đọc) nhưng không có CID/khoá → không lần ra nội dung |

Kết luận an toàn (câu chốt cho hội đồng): **leak Postgres → chỉ có ciphertext + hash; leak IPFS → chỉ có
ciphertext; đọc toàn bộ chain → chỉ có metadata.** Muốn đọc 1 hồ sơ cần **đồng thời** secret key NaCl của
người nhận (chỉ tái lập được từ chữ ký ví của họ) **và** ciphertext trên IPFS. Cặp khoá NaCl được **suy ra
tất định từ chữ ký ví** nên mất máy vẫn khôi phục được (`mobile/src/services/nacl-crypto.js`).

---

## 4. BẢNG thuật ngữ (tra nhanh)

| Thuật ngữ | Giải thích ngắn (1–2 câu) |
|---|---|
| **cidHash** | `keccak256(bytes(cid))` — băm một chiều của CID. Đây là thứ duy nhất đại diện hồ sơ được ghi lên chain; **CID plaintext không bao giờ on-chain** (để CID public = lộ con trỏ tải ciphertext từ IPFS). |
| **CID** | Content IDentifier của IPFS — "địa chỉ nội dung" để tải file ciphertext về. Nằm off-chain, được niêm phong trong KeyShare. |
| **consent** | Quyền đọc 1 hồ sơ (cả chuỗi version) mà bệnh nhân cấp cho 1 grantee, lưu on-chain ở `ConsentLedger`, key = `keccak256(patient, grantee, rootCidHash)`. 1 consent phủ toàn bộ cây version (medical-episode model). |
| **delegation** | Uỷ quyền BULK: bệnh nhân trao quyền đọc **TẤT CẢ** hồ sơ cho 1 bác sĩ. Nhiều tầng tạo thành **CHAIN** (parent pointer + epoch); thu hồi 1 mắt xích làm cascade vô hiệu toàn nhánh dưới. Khác với `allowDelegate` của 1 record. |
| **key-share** | 1 dòng trong bảng `KeyShare` (Postgres) chứa `encryptedPayload` = NaCl box của `{cid, aesKey}` cho 1 người nhận cụ thể. Đây là "cái chìa" off-chain để mở hồ sơ. |
| **NaCl box** | Mã hoá **bất đối xứng** (X25519 + XSalsa20-Poly1305, thư viện tweetnacl): mã bằng public key người nhận, chỉ secret key người nhận giải được. Dùng bọc khoá AES gửi cho từng người. |
| **AES-GCM** | Mã hoá **đối xứng** (AES-256-GCM): 1 khoá bí mật mã/giải nội dung lớn (FHIR bundle), nhanh. "GCM" kèm auth tag để phát hiện ciphertext bị sửa. |
| **EIP-712** | Chuẩn ký **dữ liệu có cấu trúc (typed-data)** + domain separator (chống replay). Bệnh nhân ký consent/delegation off-chain (không cần ETH); contract `ecrecover` xác minh → relayer trả gas thay vẫn an toàn. |
| **relayer / meta-tx** | "Giao dịch uỷ thác": bệnh nhân ký off-chain, **ví sponsor của backend** ký + gửi transaction lên chain và **trả gas hộ**. Hiện thực qua các hàm `*BySig` / `*For` trên contract. |
| **quota** | Hạn mức **100 chữ ký miễn phí / tháng / user** (cột `signaturesThisMonth`), gộp chung 1 pool, reset đầu tháng. Hết quota → lỗi `QUOTA_EXHAUSTED` → mobile chuyển self-pay. |
| **verifier** | (1) Trong Web3Auth: "bộ xác thực" gắn với mỗi phương thức đăng nhập (Google, email_passwordless...) — **verifier khác nhau ⇒ ví khác nhau**. (2) Trong hệ vai trò: ví đã `verifyDoctor` cho 1 bác sĩ. |
| **blind mailbox** | "Hòm thư mù": backend giữ và chuyển phát `encryptedPayload` (NaCl box) nhưng **không có secret key → không giải mã được**. Nó chỉ *gate* bằng `canAccess`, không *đọc* nội dung. |
| **bitwise role** | Vai trò nén trong 1 byte `uint8`, mỗi quyền là 1 bit: `PATIENT=1, DOCTOR=2, ORGANIZATION=4, MINISTRY=8, VERIFIED_DOCTOR=16, VERIFIED_ORG=32`. Cộng quyền = OR, gỡ = AND-NOT. `VERIFIED_*` là **cờ**, không phải role riêng. |

Bổ trợ thường gặp khác: **canAccess** (hàm on-chain trả lời "X có được đọc hồ sơ của Y không" — thẩm
quyền cuối cùng); **encKeyHash** (`keccak256(aesKey)` — chứng minh consent gắn đúng khoá, không đảo
ngược); **biometric gate** (bắt xác thực vân tay/khuôn mặt trước mỗi lần ký, theo TT 13/2025/TT-BYT Điều
3.2); **self-pay** (user tự trả gas bằng ví Web3Auth khi hết quota).

---

## 5. Bảng liên kết tới từng tài liệu

### Tài liệu nền (theo tầng kỹ thuật)

| # | File | Nội dung | Dành cho ai đọc |
|---|---|---|---|
| 01 | [01_smart_contracts.md](01_smart_contracts.md) | 5 contract (AccessControl, RecordRegistry, ConsentLedger, DoctorUpdate, EHRSystemSecure) + interfaces, wiring, state machine, sơ đồ `canAccess` | SC dev đọc nhanh (sơ bộ từng hàm) |
| 02 | [02_backend.md](02_backend.md) | Node/Express/Prisma cho người **chưa biết backend**: route/middleware/service, vòng đời request, "blind mailbox", relayer & quota, schema cache | Giải thích kỹ + khái niệm nền |
| 03 | [03_mobile.md](03_mobile.md) | React Native/Expo cho người **chưa biết mobile**: Web3Auth, điều hướng theo vai trò, Zustand + TanStack Query, AsyncStorage/SecureStore, service & screen | Giải thích kỹ + khái niệm nền |
| 04 | [04_ma_hoa.md](04_ma_hoa.md) | Mật mã & mô hình riêng tư cho người **KHÔNG biết mã hoá**: đối xứng vs bất đối xứng, envelope encryption, 3 lớp, derive khoá từ chữ ký ví, EIP-712, kịch bản tấn công | Trọng tâm luận văn — đọc kỹ |

### Tài liệu chức năng (theo use-case, end-to-end)

| # | File | Chức năng | Điểm nhấn để bảo vệ |
|---|---|---|---|
| f01 | [f01_dang_nhap_web3auth.md](f01_dang_nhap_web3auth.md) | Đăng nhập Web3Auth & quản lý khoá | Login không mật khẩu → ví nhúng; nonce + `verifyMessage` → JWT; 1 verifier = 1 ví; Web3Auth dùng MPC (không hoàn toàn self-custody) |
| f02 | [f02_dang_ky_vai_tro.md](f02_dang_ky_vai_tro.md) | Đăng ký vai trò (patient/doctor) & public key | 2 thứ "đăng ký" độc lập: role bit on-chain (relayer trả gas) vs NaCl public key off-chain; doctor đăng ký xong vẫn **chưa verified** |
| f03 | [f03_tao_org_va_xac_minh_bac_si.md](f03_tao_org_va_xac_minh_bac_si.md) | Bộ Y tế tạo cơ sở & cơ sở xác minh bác sĩ (CCHN) | Mô hình 2 tầng; CCHN mã hoá off-chain, on-chain chỉ hash; `VERIFIED_DOCTOR` là điều kiện đọc record (audit #3); Ministry/Org **tự trả gas** |
| f04 | [f04_tao_ho_so_benh_nhan.md](f04_tao_ho_so_benh_nhan.md) | Bệnh nhân tạo hồ sơ y tế | AES → IPFS → cidHash → `addRecord` (sponsored); self KeyShare backup; vì sao CID không lên chain |
| f05 | [f05_bac_si_tao_va_cap_nhat.md](f05_bac_si_tao_va_cap_nhat.md) | Bác sĩ tạo / cập nhật hồ sơ cho bệnh nhân | Ghi **không cần consent**; facade `DoctorUpdate.addRecordByDoctor`; chuỗi version cha–con; bác sĩ **tự trả gas** |
| f06 | [f06_chia_se_ho_so_consent.md](f06_chia_se_ho_so_consent.md) | Chia sẻ hồ sơ (consent on-chain + key-share) | 2 việc song song: EIP-712 `grantBySig` (on-chain) + NaCl KeyShare (off-chain); `shareType` → cờ `allowDelegate` |
| f07 | [f07_yeu_cau_truy_cap.md](f07_yeu_cau_truy_cap.md) | Yêu cầu truy cập 2 bên (EHRSystemSecure) | State machine `requestAccess`; **cả 2 bên duyệt**, delay ≥15s; 3 `RequestType` → 3 loại consent; bệnh nhân ký EIP-712 |
| f08 | [f08_uy_quyen_delegation.md](f08_uy_quyen_delegation.md) | Uỷ quyền (delegation chain) | BULK toàn bộ hồ sơ; CHAIN nhiều tầng (parent + epoch); cascade revoke khi thu hồi mắt xích; phân biệt với record-`allowDelegate` |
| f09 | [f09_doc_ho_so_duoc_chia_se.md](f09_doc_ho_so_duoc_chia_se.md) | Đọc hồ sơ được chia sẻ (claim + giải mã) | Backend gate `canAccess` trước khi trả; client **giải mã 2 lớp** (NaCl → AES); revalidate on-chain lúc claim |
| f10 | [f10_thu_hoi_quyen.md](f10_thu_hoi_quyen.md) | Thu hồi quyền (revoke consent / delegation) | Revoke consent gasless (`revokeFor`); revoke delegation **không có BySig** (tự trả gas); epoch bump cascade; backend xoá `encryptedPayload` |
| f11 | [f11_khan_cap_va_trusted_contact.md](f11_khan_cap_va_trusted_contact.md) | Truy cập khẩn cấp & Trusted Contact | `grantEmergencyAccess` cũ **đã bỏ**; thay bằng Trusted Contact (pre-share khoá) + CCCD lookup; bác sĩ không tự cấp quyền; audit-logged |
| f12 | [f12_gas_sponsor_va_self_pay.md](f12_gas_sponsor_va_self_pay.md) | Tài trợ gas (quota 100/tháng) & tự trả phí | Sponsor wallet; pool `signaturesThisMonth`; `QUOTA_EXHAUSTED` → self-pay; bác sĩ/org không được sponsor |
| f13 | [f13_dong_bo_su_kien_va_subgraph.md](f13_dong_bo_su_kien_va_subgraph.md) | Đồng bộ event on-chain → DB cache & Subgraph | Worker `subgraphSync` (poll 30s) là worker DUY NHẤT đang chạy; DB chỉ là cache; quyền vẫn gọi on-chain |

---

## 6. Câu chốt nhanh khi bị hỏi bất chợt

- **"Backend đọc trộm hồ sơ được không?"** → Không. Blind mailbox: chỉ giữ `encryptedPayload` (NaCl box),
  không có secret key người nhận. Nó chỉ *gate* bằng `canAccess`, không *giải* được (`04_ma_hoa.md`, `f09`).
- **"Leak DB / leak chain thì sao?"** → Leak DB: chỉ ciphertext + hash. Leak chain: chỉ metadata + hash.
  Cần đồng thời secret key NaCl + ciphertext IPFS mới đọc được (`04_ma_hoa.md` §5).
- **"Ai quyết định quyền?"** → On-chain `ConsentLedger.canAccess`. Backend & DB chỉ thi hành/cache (`f13`).
- **"Mất máy có mất hồ sơ không?"** → Không. Khoá NaCl derive tất định từ chữ ký ví; KeyShare self-backup
  trên backend khôi phục được `aesKey` (`03_mobile.md` §6.2, `04_ma_hoa.md` §4.3).
- **"Bác sĩ chưa verified đọc record được share không?"** → Không. `canAccess` từ chối doctor chưa verified
  (audit #3) (`01_smart_contracts.md`, `f03`).

---

> **Lưu ý drift đã ghi nhận trong bộ tài liệu (so với CLAUDE.md):** `includeUpdates` đã bị bỏ (medical-
> episode model); `grantEmergencyAccess`/emergency-witness đã bỏ → Trusted Contact; chỉ còn 1 worker
> `subgraphSync` (3 worker RPC cũ đã tắt); `ipfs.service.js` backend có nhánh Pinata thật khi có
> `PINATA_JWT`; screen sống ở `mobile/src/screens-v2/` (không phải `screens/`). Chi tiết + `path:line` nằm
> trong từng tài liệu tương ứng.
