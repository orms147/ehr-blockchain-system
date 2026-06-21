# Chức năng — Truy cập khẩn cấp & Trusted Contact

## Tóm tắt 30 giây

Cơ chế "break-glass" (truy cập khẩn cấp) **cũ** dựa trên `grantEmergencyAccess` (cấp quyền 24h kèm chứng nhân) **đã bị BỎ** ngày 2026-05-04 (`contracts/src/ConsentLedger.sol:87`, `backend/src/routes/emergency.routes.js:13`). Lý do: nó cấp `canAccess` on-chain nhưng **không có đường giao khoá giải mã off-chain** → bác sĩ vẫn không đọc được hồ sơ.

Thay thế bằng **Trusted Contact registry** + **CCCD lookup**:

1. **Người thân tin cậy (Trusted Contact)**: bệnh nhân chỉ định trước một số ví (vợ/con/cha mẹ...) lên on-chain. Khi chỉ định, app **pre-share** (mã hoá sẵn) khoá giải mã của TOÀN BỘ hồ sơ cho người thân đó. Người thân có thể đọc hồ sơ bất cứ lúc nào — kể cả khi bệnh nhân bất tỉnh không thể ký.
2. **Tra cứu CCCD (emergency lookup)**: bác sĩ ER nhập số CCCD của bệnh nhân → app băm `keccak256` trên máy → backend tra ra địa chỉ ví + thông tin cứu sinh (nhóm máu, dị ứng) + danh sách người thân tin cậy (có số điện thoại). Bác sĩ **gọi điện** cho người thân; người thân tự đăng nhập ví của họ và **ký uỷ quyền lại** (per-record delegate) cho bác sĩ.

Bác sĩ KHÔNG bao giờ tự cấp quyền cho mình. Mọi tra cứu CCCD/người thân đều bị **ghi log audit** và gửi thông báo hậu kiểm cho bệnh nhân.

---

## 1. Bối cảnh: cơ chế cũ đã bị bỏ

> Người đọc rành smart-contract: lưu ý CLAUDE.md vẫn ghi `DoctorUpdate.grantEmergencyAccess` (24h, 2-10 chứng nhân) — **đó là thông tin STALE**. Code thực tế không còn hàm này.

Bằng chứng:

- `contracts/src/DoctorUpdate.sol` hiện chỉ còn `addRecordByDoctor` + nội bộ `_grantDoctorAccess` + `getAccessLimits`. **Không có** `grantEmergencyAccess` trong file (đọc toàn bộ 176 dòng).
- `contracts/src/ConsentLedger.sol:87`: `// grantEmergencyAccess (dropped 2026-05-04).`
- `backend/src/routes/emergency.routes.js:12-15`: bảng `EmergencyAccess` đã bị drop; primitive on-chain `grantEmergencyAccess` cũng bị bỏ vì "it granted on-chain canAccess without an off-chain key delivery path".
- `contracts/src/interfaces/IConsentLedger.sol:70`: ghi rõ Trusted Contact "is the on-chain replacement for grantEmergencyAccess".

> ⚠️ Lưu ý code chết: `mobile/src/services/emergency.service.js` **vẫn còn** các hàm cũ (`requestEmergencyAccess` POST `/api/emergency/request`, `/active`, `/revoke/...`, `/check/...`). Nhưng backend `emergency.routes.js` **chỉ có duy nhất** `GET /lookup-by-cccd`. Các route kia không tồn tại ở backend → các hàm này là tàn dư, không nằm trong luồng đang chạy. Luồng thật dùng `mobile/src/services/trustedContact.service.js`.

---

## 2. Hai nửa của chức năng

| Nửa | Ai làm | Khi nào | Mục đích |
|---|---|---|---|
| **Chuẩn bị trước (Trusted Contact)** | Bệnh nhân | Lúc bình thường, chủ động | Chỉ định người thân + pre-share khoá giải mã toàn bộ hồ sơ |
| **Phá kính lúc khẩn (CCCD lookup)** | Bác sĩ ER | Khi bệnh nhân nhập viện/bất tỉnh | Từ thẻ CCCD vật lý → ra ví + người thân để gọi điện |

Hai nửa độc lập về kỹ thuật nhưng bổ trợ: nửa 1 đảm bảo **khoá đã sẵn ở ví người thân**; nửa 2 giúp bác sĩ **tìm được người thân đó**.

---

## 3. Khái niệm nền (cho người chưa rành backend/mã hoá)

- **CID**: định danh file trên IPFS (lưu trữ phi tập trung). Hồ sơ FHIR được mã hoá AES-GCM rồi đẩy lên IPFS → ra CID.
- **AES key**: khoá đối xứng dùng giải mã ciphertext của hồ sơ. Ai có AES key + CID là đọc được hồ sơ.
- **NaCl box (mã hoá bất đối xứng)**: mỗi user có 1 cặp khoá NaCl (public/secret) suy ra từ chữ ký ví. Để gửi bí mật cho người B, ta mã hoá `{cid, aesKey}` bằng **public key của B** → chỉ B (có secret key) giải được. Đây gọi là **encryptedPayload** trong KeyShare.
- **KeyShare (bảng Postgres)**: 1 dòng = "đã gửi encryptedPayload từ ví A cho ví B cho 1 cidHash". Backend giữ encryptedPayload nhưng **không giải mã được** (blind mailbox).
- **EIP-712**: chuẩn ký dữ liệu có cấu trúc bằng ví. Bệnh nhân ký một "permit" off-chain, **relayer (backend) trả gas** đẩy lên chain. Bệnh nhân không cần ETH.
- **canAccess** (`ConsentLedger.sol`): hàm on-chain quyết định ví X có được đọc hồ sơ của bệnh nhân P hay không. Backend gọi nó trước khi trả encryptedPayload.

---

## 4. Nửa 1 — Đăng ký Trusted Contact (end-to-end)

### 4.1 Sơ đồ luồng

```
 [Bệnh nhân] màn TrustedContactsScreen
      │  nhập/quét ví người thân + nhãn ("Vợ"), bấm "Tiếp tục ký"
      ▼
 trustedContact.service.addContact()                  (mobile/src/services/trustedContact.service.js:34)
      │  1. GET /api/relayer/grant-context?grantee=...  → lấy nonce hiện tại
      │  2. signTrustedContactPermit(...)  ← KÝ EIP-712 (gate vân tay/biometric)
      ▼
 POST /api/relayer/trusted-contact                    (backend relayer.routes.js:350)
      │  requirePatientRole + sponsoredWriteLimit
      ▼
 relayerService.sponsorSetTrustedContact()            (relayer.service.js:648)
      │  consumeQuota(patient,'trustedContact') → đếm vào pool 100/tháng
      │  SPONSOR ví trả gas → ConsentLedger.setTrustedContactBySig(...)
      ▼
 ConsentLedger.setTrustedContactBySig()               (ConsentLedger.sol:818)
      │  verify chữ ký == patient, nonce++, _applyTrustedContact()
      │  isTrustedContact[patient][contact]=true; emit TrustedContactSet
      ▼  (tx mined)  ──────────────────────────────────────────────
      │
 trustedContact.service: runEncryptionCeremony(contact)  (service:104)  ← "lễ mã hoá"
      │  - lấy NaCl publicKey của người thân (authService.getEncryptionKey)
      │  - duyệt tất cả record của bệnh nhân, lấy {cid, aesKey} từ local store
      │  - encryptForRecipient({cid,aesKey}, contactPubKey, mySecret) cho từng record
      ▼
 POST /api/key-share/bulk-trusted-contact             (keyShare.routes.js:365)
      │  gate: recipient PHẢI là active trusted contact của sender (DB)
      │  gate: từng cidHash phải do sender sở hữu/tạo
      │  applyShare(... status:'claimed', expiresAt:null, allowDelegate:true,
      │            source:'trusted-contact-pre-share')                (keyShare.routes.js:435-446)
      ▼
 KeyShare rows sẵn sàng → người thân đăng nhập app là đọc được ngay
 + push "Bạn đã nhận khoá hồ sơ" cho người thân                      (keyShare.routes.js:461)
```

### 4.2 Vì sao registry phải nằm ON-CHAIN

`ConsentLedger.sol:88-91`: nếu danh sách người thân chỉ ở DB backend, một backend bị chiếm quyền có thể **lén chèn người thân giả** rồi kích hoạt pre-share khoá tới ví attacker. On-chain, chỉ chữ ký EIP-712 của bệnh nhân mới sửa được danh sách → "patient sovereignty enforced cryptographically".

### 4.3 Đặc tính KeyShare của Trusted Contact

| Trường | Giá trị | Ý nghĩa (`keyShare.routes.js:441-444`) |
|---|---|---|
| `status` | `'claimed'` | Auto-claim, người thân không cần thao tác claim |
| `expiresAt` | `null` | FOREVER — đến khi bị thu hồi |
| `allowDelegate` | `true` | Người thân được **re-share lại** cho bác sĩ ER (đây là mấu chốt của break-glass) |
| `source` | `'trusted-contact-pre-share'` | Tag để cascade revoke nhắm đúng các dòng này |

### 4.4 Tự động pre-share record MỚI

Khi bệnh nhân tạo record mới sau này, `autoPreShareNewRecord()` (`trustedContact.service.js:166`) tự mã hoá khoá record mới cho mọi người thân đang active. Nếu record do **bác sĩ** tạo hộ bệnh nhân, hàm này **bỏ qua** (service:170-175) vì bác sĩ không có quyền với danh sách người thân của bệnh nhân.

### 4.5 canAccess on-chain bỏ qua mọi cổng cho Trusted Contact

`ConsentLedger.sol:684-693`:
```solidity
if (patient == grantee) return true;
// FOOTGUN FIX #2 (2026-06-01): Trusted Contact ...
if (isTrustedContact[patient][grantee]) return true;
```
Trusted Contact được coi như "always-on family access" — bỏ qua kiểm tra consent + role thông thường. Đây là lý do người thân (kể cả không phải bác sĩ) vẫn đọc được hồ sơ.

### 4.6 Ai trả gas / Dữ liệu gì được mã hoá

- **Gas**: SPONSOR ví trả (gas-free cho bệnh nhân), tính vào pool **100 chữ ký/tháng** (`relayer.service.js:643,660`).
- **Mã hoá**: `{cid, aesKey}` mã hoá bằng NaCl box cho public key người thân → chỉ người thân giải được. Backend chỉ giữ ciphertext (encryptedPayload).
- **On-chain công khai**: chỉ địa chỉ ví người thân + nhãn (label) + cờ active. Không có khoá, không có CID gốc.

---

## 5. Nửa 2 — Đăng ký CCCD & tra cứu khẩn cấp (end-to-end)

### 5.1 Bệnh nhân opt-in CCCD (chuẩn bị)

Màn `TrustedContactsScreen` → modal "Mã định danh khẩn cấp":

```
[Bệnh nhân] nhập 9-12 chữ số CCCD
      │  keccak256(toBytes(cccd)) TÍNH TRÊN MÁY                 (TrustedContactsScreen.tsx:177)
      ▼  chỉ gửi HASH, số gốc không rời thiết bị
 PUT /api/profile/me/national-id { nationalIdHash }            (profile.routes.js:90)
      │  lưu vào User.nationalIdHash (lowercase)
      └─ unique constraint → 409 NATIONAL_ID_TAKEN nếu trùng    (profile.routes.js:108-114)
```

`profile.routes.js:79-86`: plaintext CCCD không bao giờ tới backend; chỉ keccak256 hash được lưu, dùng cùng scheme với màn tra cứu nên khớp khi lookup. Bệnh nhân huỷ bằng cách gửi `nationalIdHash: null`.

### 5.2 Bác sĩ ER tra cứu (break-glass)

Màn `doctor/EmergencyLookupScreen.tsx`:

```
[Bác sĩ ER] nhập số CCCD trên thẻ vật lý của bệnh nhân
      │  validate 9-12 số → keccak256(toBytes(raw))            (EmergencyLookupScreen.tsx:72,82)
      ▼
 trustedContactService.lookupByCccd(cccdHash)
      ▼
 GET /api/emergency/lookup-by-cccd?cccdHash=0x...              (emergency.routes.js:56)
      │  GATE: authenticate + requireOnChainRoles('verifiedDoctor')   (line 31,56)
      │  GATE: rate-limit 5 lượt/phút/ví bác sĩ → 429 LOOKUP_RATE_LIMITED  (line 37-38,60)
      │  tra User theo nationalIdHash
      ▼  trả: walletAddress, fullName, gender, bloodType, allergies, avatarUrl  (line 69-76)
      │  (404 PATIENT_NOT_FOUND nếu chưa đăng ký CCCD)
      ▼
 trustedContactService.getContactsForPatient(walletAddress)
      ▼
 GET /api/trusted-contacts/by-patient/:address                (trustedContact.routes.js:85)
      │  GATE: authenticate + requireOnChainRoles('verifiedDoctor')   (line 31,85)
      │  KHÔNG cần quan hệ consent với bệnh nhân: trong cấp cứu, BẤT KỲ
      │  bác sĩ verified nào cũng cần xem danh sách để gọi (line 81-84)
      │  → ghi AccessLog action='EMERGENCY_CONTACT_LOOKUP'             (line 102-109)
      │  → emit socket + push hậu kiểm cho bệnh nhân                   (line 115-124)
      ▼  trả: contactAddress, label, fullName, avatarUrl, PHONE        (listContactsForPatient :56-64)
      ▼
 [Bác sĩ] thấy nhóm máu + dị ứng + danh sách người thân (nút "Gọi")
      │  Linking.openURL('tel:...')                            (EmergencyLookupScreen.tsx:110)
      ▼
 [Người thân] nghe điện → tự đăng nhập app của HỌ → ký uỷ quyền lại
      │  per-record delegate (allowDelegate=true từ KeyShare pre-share)
      ▼
 [Bác sĩ] nhận quyền đọc hồ sơ qua luồng share thông thường
```

### 5.3 Vì sao bác sĩ không tự đọc được ngay

Tra cứu CCCD **chỉ trả metadata cứu sinh + thông tin liên hệ**, KHÔNG trả khoá giải mã hồ sơ. Bác sĩ phải qua người thân (người đã có khoá nhờ pre-share ở Nửa 1) để được ký uỷ quyền. Đây chính là điểm sửa so với cơ chế cũ: `grantEmergencyAccess` cấp `canAccess` nhưng không giao khoá → vô dụng (`emergency.routes.js:13-15`). UI nhắc rõ điều này: "Liên hệ người thân để họ ký uỷ quyền cho bạn" (`EmergencyLookupScreen.tsx:371`).

### 5.4 Bảo vệ chống brute-force CCCD

`emergency.routes.js:17-20`: CCCD thật chỉ 9-12 chữ số (~10^12 không gian) nên có thể quét hash trong vài giây nếu không giới hạn. Do đó endpoint gắn **rate-limit 5 lượt/phút/ví bác sĩ** (in-memory bucket, `emergency.routes.js:36-49`) và bắt buộc bác sĩ đã `isVerifiedDoctor` on-chain.

---

## 6. Thu hồi Trusted Contact (cascade)

```
[Bệnh nhân] màn TrustedContactsScreen → "Thu hồi"
      ▼
 removeContact() → ký TrustedContactPermit(active=false)       (trustedContact.service.js:74)
      ▼
 POST /api/relayer/trusted-contact (active:false)  → sponsor gas
      ▼
 ConsentLedger.setTrustedContactBySig → isTrustedContact=false; emit TrustedContactRevoked
      ▼  (event được subgraph/sync index)
 consentLedgerSync handleTrustedContactRevoked()               (consentLedgerSync.service.js)
      │  - đánh dấu TrustedContact.status='revoked' (DB cache)         (:755-761)
      │  - CASCADE: applyRevoke mọi KeyShare (sender=patient,recipient=contact)
      │            → người thân mất khả năng giải mã                    (:763-786)
```

`canAccess` cũng tự fail vì `isTrustedContact` đã false (`ConsentLedger.sol:693`). Mảng `_trustedContactList` giữ entry cũ để tiết kiệm gas; `getTrustedContacts()` lọc theo cờ active khi đọc (`ConsentLedger.sol:899-907`).

---

## 7. Sổ tay smart-contract: các hàm Trusted Contact

> File: `contracts/src/ConsentLedger.sol`, interface `contracts/src/interfaces/IConsentLedger.sol`.

| Hàm | Dòng | Mô tả ngắn |
|---|---|---|
| `setTrustedContactBySig(patient, contact, label, active, deadline, signature)` | `:818` | Bệnh nhân ký EIP-712, relayer submit (gas-free). Verify signer==patient, nonce++, gọi `_applyTrustedContact`. |
| `setTrustedContact(contact, label, active)` | `:854` | Bệnh nhân tự gọi trực tiếp (msg.sender=patient), tự trả gas. |
| `_applyTrustedContact(...)` (internal) | `:863` | Set `isTrustedContact`/`trustedContactLabel`; chỉ push vào `_trustedContactList` lần kích hoạt đầu (idempotent); emit `TrustedContactSet`/`TrustedContactRevoked`. |
| `getTrustedContacts(patient) view` | `:899` | Trả mảng contact đang active (lọc entry đã revoke). O(n). |
| `isTrustedContact[patient][contact]` (public mapping) | `:96` | Cờ trạng thái, dùng trực tiếp trong `canAccess`. |
| `trustedContactLabel[patient][contact]` (public mapping) | `:97` | Nhãn ("Vợ", "Con"...). |
| `canAccess(patient, grantee, queryCidHash) view` | `:679` | Tại `:693` short-circuit `return true` nếu grantee là trusted contact. |

EIP-712 typehash (`ConsentLedger.sol:38`):
```
TrustedContactPermit(address patient,address contact,string label,bool active,uint256 deadline,uint256 nonce)
```
Nonce **dùng chung** slot `nonces[patient]` với ConsentPermit/DelegationPermit (mobile `eip712.js:55`, contract verify ở `:829-846`). Test bao phủ: `contracts/test/ConsentLedgerTrustedContact.t.sol`.

---

## 8. Bảng ai-thấy-gì (privacy)

| Dữ liệu | Lưu ở đâu | Ai đọc được |
|---|---|---|
| Số CCCD gốc | KHÔNG lưu đâu cả | Chỉ trên thiết bị bệnh nhân/thẻ vật lý |
| `nationalIdHash` (keccak256) | `User` (Postgres) | Backend (để lookup); không suy ngược ra CCCD trong vài giây nhờ rate-limit |
| Nhóm máu, dị ứng, tên, giới tính | `User` (Postgres) | Bác sĩ verified qua lookup CCCD; bệnh nhân |
| Danh sách trusted contact (ví + label) | On-chain `ConsentLedger` + cache DB | Công khai on-chain; bác sĩ verified qua API; bệnh nhân |
| Số điện thoại người thân | `User` của người thân | Bệnh nhân (màn của mình) + bác sĩ ER qua endpoint by-patient (`trustedContact.routes.js:42-43,63`) |
| `encryptedPayload` (cid+aesKey) | `KeyShare` (Postgres) | CHỈ người thân (có NaCl secret key). Backend mù. |
| Nội dung hồ sơ (FHIR) | IPFS (ciphertext AES) | Ai có aesKey: bệnh nhân, người thân; bác sĩ chỉ sau khi người thân ký uỷ quyền lại |

---

## 9. Tổng kết "ai trả gas"

| Hành động | Người ký | Người trả gas | Quota |
|---|---|---|---|
| Thêm/thu hồi Trusted Contact | Bệnh nhân (EIP-712) | SPONSOR ví | Tính vào pool 100/tháng (`relayer.service.js:660`) |
| Pre-share khoá (ceremony) | — (chỉ ghi DB) | Không có on-chain tx | Không |
| Opt-in/huỷ CCCD | — (chỉ PUT DB) | Không có on-chain tx | Không |
| Tra cứu CCCD / danh sách người thân | — (chỉ GET) | Không có on-chain tx | Không (nhưng rate-limit + audit) |
| Người thân uỷ quyền lại cho bác sĩ | Người thân | Theo luồng share thông thường | Theo luồng đó |

---

## Nguồn đã đọc

- `contracts/src/DoctorUpdate.sol` (toàn bộ — xác nhận KHÔNG còn `grantEmergencyAccess`)
- `contracts/src/ConsentLedger.sol` (vùng `:36-119`, `:679-766`, `:800-917` — trusted contact registry, canAccess, EIP-712 typehash)
- `contracts/src/interfaces/IConsentLedger.sol` (grep: typehash, events, function sigs `:70,75,81,268,281,289`)
- `contracts/test/ConsentLedgerTrustedContact.t.sol` (grep — xác nhận test bao phủ)
- `backend/src/routes/emergency.routes.js` (toàn bộ — chỉ có `lookup-by-cccd`; ghi chú drop grantEmergencyAccess)
- `backend/src/routes/trustedContact.routes.js` (toàn bộ — `/me`, `/by-patient/:address`, audit log)
- `backend/src/routes/relayer.routes.js` (`:338-376` — POST `/trusted-contact`)
- `backend/src/routes/keyShare.routes.js` (`:355-477` — bulk-trusted-contact ceremony; grep source tags)
- `backend/src/routes/profile.routes.js` (`:75-149` — national-id opt-in, NATIONAL_ID_TAKEN)
- `backend/src/services/relayer.service.js` (`:641-695` — sponsorSetTrustedContact, gas + quota)
- `backend/src/services/consentLedgerSync.service.js` (`:755-794` — handleTrustedContactRevoked cascade)
- `backend/src/app.js` (grep — mount `/api/emergency`, `/api/trusted-contacts`)
- `mobile/src/services/trustedContact.service.js` (toàn bộ — addContact/removeContact/ceremony/lookup)
- `mobile/src/services/emergency.service.js` (toàn bộ — xác nhận là code chết/tàn dư)
- `mobile/src/screens-v2/TrustedContactsScreen.tsx` (toàn bộ — add/remove/CCCD modal, hash on-device)
- `mobile/src/screens-v2/EmergencyProfileScreen.tsx` (toàn bộ — ER preview, blood/allergies, CCCD enrol)
- `mobile/src/screens-v2/doctor/EmergencyLookupScreen.tsx` (toàn bộ — lookup flow, tel: call)
- `mobile/src/utils/eip712.js` (grep — `signTrustedContactPermit`, typehash `:51-55,185`)
