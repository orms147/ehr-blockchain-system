# 04 — Mật mã & mô hình riêng tư (deep-dive cho người KHÔNG biết mã hoá)

> Đối tượng: lập trình viên smart-contract (rành Solidity/EVM nhưng không biết backend, **không biết mật mã**, ít biết mobile). Mục tiêu: đọc xong tự tin trả lời hội đồng về phần "an toàn & riêng tư on-chain" — vốn là **trọng tâm luận văn**.

## Tóm tắt 30 giây

Hệ thống dùng **mã hoá lai (hybrid / "envelope encryption")**: nội dung hồ sơ y tế (FHIR bundle) được mã hoá bằng khoá đối xứng **AES-256-GCM** rồi đẩy lên IPFS; cái khoá AES đó (cùng với CID) lại được bọc trong **NaCl box (X25519)** bằng *public key của người nhận* rồi gửi cho backend lưu trong bảng `KeyShare`. Backend **không bao giờ giải mã được** — nó chỉ là "hộp thư mù" (blind mailbox). **On-chain chỉ lưu HASH** (`cidHash`, `encKeyHash`), không lưu CID hay khoá. Cặp khoá NaCl của mỗi người được **suy ra (derive) tất định từ chữ ký ví** nên khôi phục được trên thiết bị mới. Mọi hành động cấp quyền được ký bằng **EIP-712 typed-data** rồi relayer đẩy lên contract. Kết luận: **leak DB → chỉ có ciphertext + hash; leak chain → chỉ có metadata, không có khoá** — không bên nào lộ dữ liệu y tế.

Nguồn neo: schema ghi rõ "Backend as blind mailbox" và "Backend CANNOT read this" (`backend/prisma/schema.prisma:184`; khối comment + field `encryptedPayload` ở `:182-185`).

---

## 1. Khái niệm nền (đọc kỹ nếu bạn quên mật mã)

### 1.1 Đối xứng vs bất đối xứng

| Loại | Khoá | Ai mã / ai giải | Ưu / nhược |
|---|---|---|---|
| **Đối xứng** (AES-256-GCM) | MỘT khoá bí mật duy nhất (32 byte) dùng cho cả mã hoá và giải mã | Cùng một khoá | Rất nhanh, gọn — nhưng phải có cách bí mật để gửi khoá cho người nhận |
| **Bất đối xứng / "hộp"** (NaCl box = X25519 + XSalsa20-Poly1305) | CẶP khoá: `publicKey` (công khai) + `secretKey` (giữ kín) | Người gửi mã bằng *public key người nhận*; chỉ *secret key người nhận* giải được | Giải bài toán "gửi khoá an toàn" — nhưng chậm, chỉ hợp với dữ liệu nhỏ |

Hệ quả thực tế: AES dùng để mã **dữ liệu lớn** (cả FHIR bundle, có thể kèm ảnh base64). NaCl box dùng để mã **dữ liệu nhỏ** (chỉ chuỗi JSON `{cid, aesKey}`). Đây chính là lý do dùng cả hai.

> **GCM (Galois/Counter Mode)** là chế độ AES *có xác thực* (authenticated encryption): ngoài ciphertext còn sinh ra một **auth tag** 16 byte. Khi giải mã, nếu ciphertext bị sửa một bit, tag không khớp → giải mã ném lỗi thay vì trả ra rác. Trong code mobile, nếu tag sai sẽ ném `'GCM Authentication Failed'` (`mobile/src/services/crypto.js:85-87`).

### 1.2 "Envelope encryption" (mã hoá phong bì)

Ý tưởng: thay vì mã trực tiếp dữ liệu lớn bằng khoá bất đối xứng (chậm), ta:
1. Sinh một khoá đối xứng ngẫu nhiên (gọi là **data key** / **DEK**) → mã dữ liệu lớn bằng nó.
2. Bọc (mã hoá) chính cái data key bằng khoá bất đối xứng của người nhận → đây là "cái phong bì".
3. Gửi kèm: ciphertext lớn + phong bì nhỏ. Người nhận mở phong bì lấy data key, rồi giải dữ liệu lớn.

Trong dự án: **data key = khoá AES per-record**, **phong bì = NaCl box chứa `{cid, aesKey}`**. Mỗi record có một khoá AES riêng (sinh mới mỗi lần tạo record — `generateAESKey()` tại `mobile/src/services/crypto.js:15-18`, gọi ở `mobile/src/screens-v2/CreateRecordScreen.tsx:440`).

---

## 2. Ba lớp lưu trữ — ai lưu gì, ai đọc được gì

```
                        +--------------------------------------------------+
   FHIR bundle (JSON)   |  PLAINTEXT — chỉ tồn tại trong RAM của app mobile|
   {meta, diagnoses,    |  ngay trước khi mã hoá / sau khi giải mã         |
    prescriptions,...}  +--------------------------------------------------+
            |
            | AES-256-GCM với aesKey (32 byte, random per-record)
            v
   +----------------------+        +-----------------------------------------+
   |  IPFS (Pinata)       |        |  encryptedData = base64( IV | CT | TAG ) |
   |  lưu ciphertext      | <----- |  ipfsService.upload(...) -> trả về CID   |
   +----------------------+        +-----------------------------------------+
            |  CID (vd "Qm...")               aesKey  (base64, 32 byte)
            |                                   |
            +------------------+----------------+
                               |  gộp thành JSON {cid, aesKey}
                               v
                     NaCl box( {cid,aesKey}, nonce, recipientPublicKey, senderSecretKey )
                               |
                               v
   +-------------------------------------------------------------+
   |  Postgres  bảng KeyShare                                     |
   |    encryptedPayload = {nonce, ciphertext}  (backend MÙ)      |
   |    senderPublicKey  = pubkey người gửi (để người nhận mở)    |
   +-------------------------------------------------------------+

   ----- SONG SONG, trên blockchain chỉ lưu HASH -----
   +-------------------------------------------------------------+
   |  ConsentLedger (on-chain)                                    |
   |    cidHash   = keccak256(bytes(cid))      <-- KHÔNG có CID   |
   |    encKeyHash= keccak256(bytes(aesKey))   <-- KHÔNG có khoá  |
   |    grantee, expireAt, allowDelegate, active                  |
   +-------------------------------------------------------------+
```

Bảng đối chiếu 3 lớp:

| Lớp | Lưu gì cụ thể | Ai đọc được nội dung y tế | Nguồn |
|---|---|---|---|
| **IPFS (Pinata)** | `base64(IV ‖ ciphertext ‖ authTag)` của FHIR bundle | Bất kỳ ai cũng tải được file, nhưng **không có aesKey → chỉ là rác** | `mobile/src/services/ipfs.service.js:31-72` (upload), `crypto.js:36-56` (định dạng IV+CT+TAG) |
| **Postgres `KeyShare`** | `encryptedPayload` = NaCl box của `{cid, aesKey}` + `senderPublicKey` | **CHỈ người nhận** (có NaCl secret key tương ứng). Backend KHÔNG đọc được | `backend/prisma/schema.prisma:176-209`; comment "Backend CANNOT read this" dòng 184 |
| **On-chain `ConsentLedger`** | `cidHash`, `encKeyHash`, grantee, `expireAt`, flags — toàn HASH/metadata | Public (ai cũng đọc) nhưng **không có CID, không có khoá → không lần ra dữ liệu** | `backend/src/config/blockchain.js:22-44` (output tuple của hàm `getConsent` trong ABI; `encKeyHash bytes32` ở dòng 37) |

`encKeyHash` chỉ dùng để **chứng minh** consent on-chain gắn với đúng khoá nào (one-way hash, không đảo ngược): tính bằng `keccak256(toBytes(aesKey))` ở `mobile/src/utils/eip712.js:227-230`. `cidHash` tính bằng `keccak256(toBytes(cid))` ở `mobile/src/utils/eip712.js:220-222` và `mobile/src/services/crypto.js:10-12`.

---

## 3. Lớp 1 — AES-256-GCM cho FHIR bundle

### 3.1 Mã hoá (lúc tạo record)

Tại `mobile/src/services/crypto.js`, dùng thư viện **node-forge** (vì React Native không có Web Crypto API — comment dòng 4):

- `generateAESKey()` (dòng 15-18): sinh 32 byte ngẫu nhiên → trả base64 = khoá AES-256.
- `encryptData(data, base64Key)` (dòng 36-56):
  1. `JSON.stringify(data)` → mã UTF-8.
  2. Sinh **IV** 12 byte ngẫu nhiên (dòng 38).
  3. AES-GCM mã hoá; lấy `tag` 16 byte (dòng 48-49).
  4. **Ghép `IV ‖ ciphertext ‖ tag`** rồi base64 (dòng 53-55). Định dạng cố ý khớp với Web Crypto API để liên thông.

### 3.2 Giải mã (lúc xem record)

`decryptData(encryptedBase64, base64Key)` (dòng 64-95): tách 12 byte đầu = IV, 16 byte cuối = tag, phần giữa = ciphertext (dòng 70-74); nếu tag không khớp ném `'GCM Authentication Failed'` (dòng 85-87). Được gọi tại màn chi tiết record `mobile/src/screens-v2/RecordDetailScreen.tsx:666` và `:676`.

> Lưu ý gotcha: `importAESKey`/`exportAESKey` ở mobile chỉ **trả nguyên chuỗi base64** (dòng 21-28) — trên mobile khoá AES được truyền dưới dạng chuỗi, không bọc thành object như Web Crypto.

---

## 4. Lớp 2 — NaCl box (X25519) để chia sẻ khoá

File: `mobile/src/services/nacl-crypto.js`, dùng thư viện **tweetnacl**.

### 4.1 Mã / giải hộp

- `encryptForRecipient(message, recipientPublicKey, senderSecretKey)` (dòng 27-39): sinh `nonce` ngẫu nhiên, gọi `nacl.box(...)`, trả JSON `{nonce, ciphertext}` (cả hai base64). Đây chính là `encryptedPayload` lưu vào `KeyShare`.
- `decryptFromSender(encryptedJson, senderPublicKey, recipientSecretKey)` (dòng 41-62): `nacl.box.open(...)`; nếu sai khoá hoặc bị sửa → trả `null` → ném `'Decryption failed: invalid key or tampered message'` (dòng 57-59).

Vì sao cần `senderPublicKey`? NaCl box là **authenticated**: người nhận cần public key người gửi để vừa giải mã vừa xác thực ai gửi. Vì vậy `KeyShare.senderPublicKey` được lưu kèm (`schema.prisma:187-188`) và được gửi lại trong API claim.

### 4.2 Public key NaCl lưu ở đâu để người khác mã cho mình?

Trong `User.encryptionPublicKey` (`backend/prisma/schema.prisma:64`, comment "NaCl x25519 public key for data encryption"). Khi muốn chia sẻ record cho một người, mobile lấy `encryptionPublicKey` của người đó (qua endpoint recipients) rồi `encryptForRecipient(...)` — xem flow tạo version mới `mobile/src/screens-v2/CreateRecordScreen.tsx:543-558` (lấy `recipients[].encryptionPublicKey`, mã cho từng người).

### 4.3 Cặp khoá NaCl được DERIVE từ chữ ký ví (điểm quan trọng nhất với hội đồng)

Vấn đề: nếu cặp khoá NaCl sinh ngẫu nhiên rồi lưu đâu đó, mất máy = mất khoá = mất hết hồ sơ. Giải pháp của dự án: **derive tất định (deterministic) từ chữ ký ví**, nên cùng một ví luôn sinh ra cùng cặp khoá → khôi phục được.

Cơ chế (`mobile/src/services/nacl-crypto.js`):

```
message = "EHR-Sign-Encryption-Key-v1\nWallet: <địa chỉ ví>"      (getKeyDerivationMessage, dòng 121-123)
signature = walletClient.signMessage({ message })                   (getOrCreateEncryptionKeypair, dòng 129)
seed = keccak256( toBytes(signature) ‖ toBytes(addr.lowercase) ‖ toBytes(APP_SALT) ).slice(0,32)
                                                            (deriveKeyFromWalletSignature, dòng 72-80)
keypair = nacl.box.keyPair.fromSecretKey(seed)             (generateEncryptionKeypair, dòng 12-23)
```

- `APP_SALT = 'EHR-NACL-KEY-DERIVATION-v1'` (dòng 70) — salt cố định để buộc seed gắn riêng với ứng dụng này.
- Vì chữ ký ECDSA của ví trên cùng một message là **tất định ⇒ tái lập được** → cùng ví, cài lại app vẫn ra đúng keypair cũ → vẫn giải được mọi `KeyShare` cũ.

> Lưu thêm để khỏi ký lại mỗi lần mở app: secret key NaCl được mã hoá-tại-chỗ bằng `nacl.secretbox` với khoá cũng derive từ chữ ký rồi cất AsyncStorage (`encryptSecretKeyForStorage`, dòng 82-94; `getOrCreateEncryptionKeypair` ghi `STORAGE_KEY_ENCRYPTED`/`STORAGE_KEY_PUBLIC`, dòng 140-144). Public key cache để dùng nhanh (`getCachedPublicKey`, dòng 149-151).

---

## 5. Vì sao backend là "blind mailbox" — và vì sao leak DB / leak chain đều an toàn

**Backend chỉ giữ phong bì đã niêm phong, không có chìa.** `encryptedPayload` là NaCl box mã bằng public key người nhận; backend không có secret key người nhận → không mở được. Schema nói thẳng điều này (`schema.prisma:184`: "Backend CANNOT read this"; khối comment ở `:182-185`). Backend cũng không tự đọc IPFS để giải vì không có aesKey (aesKey nằm bên trong cái phong bì nó không mở được).

| Kịch bản tấn công | Kẻ tấn công có gì | Có lộ dữ liệu y tế không? |
|---|---|---|
| **Leak toàn bộ Postgres** | `encryptedPayload` (NaCl box) + `senderPublicKey` + `cidHash` | **KHÔNG.** Thiếu secret key người nhận → không mở phong bì → không có CID/aesKey |
| **Leak toàn bộ IPFS/Pinata** | `base64(IV‖CT‖TAG)` của FHIR bundle | **KHÔNG.** Thiếu aesKey → chỉ là ciphertext |
| **Đọc toàn bộ blockchain** | `cidHash`, `encKeyHash`, grantee, expireAt | **KHÔNG.** Toàn hash/metadata; không có CID plaintext, không có khoá |
| **Leak DB + IPFS cùng lúc** | Ciphertext FHIR + box chứa aesKey | **KHÔNG.** Vẫn cần secret key người nhận để mở box lấy aesKey |

Phòng thủ phải đạt được: muốn đọc một hồ sơ, kẻ tấn công cần **đồng thời** (a) secret key NaCl của người nhận (chỉ tái lập được từ chữ ký ví của người đó) và (b) ciphertext trên IPFS. Không thành phần đơn lẻ nào (DB, chain, IPFS) đủ để lộ dữ liệu.

> Backup tự-gửi: lúc tạo record, app còn tự tạo một `KeyShare` mã cho **chính chủ** (`encryptForRecipient(selfPayload, selfKeypair.publicKey, selfKeypair.secretKey)`) để nếu mất key local vẫn khôi phục được — `mobile/src/screens-v2/CreateRecordScreen.tsx:525-539`.

### 5.1 Backend vẫn phải GATE bằng `canAccess` on-chain

Backend không đọc được nội dung, nhưng nó vẫn **giữ và trả** `encryptedPayload` cho người gọi. Nếu trả bừa thì người bị revoke vẫn lấy được phong bì (rồi tự giải nếu còn key). Vì vậy backend gate bằng on-chain trước khi trả/đánh dấu claim.

`checkConsent(patient, grantee, cidHash)` đọc `ConsentLedger.canAccess(...)` qua viem (`backend/src/config/blockchain.js:173-208`, ABI `canAccess` dòng 11-21). Tại route claim, **revalidate on-chain ngay lúc claim** (`backend/src/routes/keyShare.routes.js:1428`): nếu `canAccess=false` thì từ chối; trường hợp đặc biệt bác sĩ **chưa verified** trả mã `DOCTOR_NOT_VERIFIED` nhưng **không** revoke KeyShare (vì consent vẫn hợp lệ, chỉ chờ verify — dòng 1430-1458, đúng FIX audit #3). 3 lớp phòng thủ: (a) UI cảnh báo, (b) backend `checkConsent` gate, (c) on-chain `canAccess` là thẩm quyền cuối.

---

## 6. EIP-712 — chữ ký dữ liệu có cấu trúc (typed-data)

### 6.1 EIP-712 là gì (cho người quên)

`personal_sign` thường ký một chuỗi tự do, người dùng không biết mình đang ký cái gì. **EIP-712** chuẩn hoá việc ký một **struct có kiểu rõ ràng** kèm một **domain separator** (`name`, `version`, `chainId`, `verifyingContract`). Lợi ích:
- Ví hiển thị từng trường (patient, grantee, expireAt...) → người dùng thấy rõ nội dung.
- `domain` chống **replay**: chữ ký cho contract/chain này không dùng lại được ở contract/chain khác.
- Contract dùng `ecrecover` trên cùng hash để xác minh chính chủ patient đã ký → cho phép **relayer trả gas thay** mà vẫn an toàn (patient ký off-chain, không cần ETH).

### 6.2 Dùng ở đâu trong dự án

File `mobile/src/utils/eip712.js`. Domain (dòng 12-17): `name: 'EHR Consent Ledger'`, `version: '2'`, `chainId` từ env, `verifyingContract = EXPO_PUBLIC_CONSENT_LEDGER_ADDRESS` — comment ghi rõ "MUST match contract constructor".

| Hàm ký | primaryType | Trường chính | Dùng để | Nguồn |
|---|---|---|---|---|
| `signGrantConsent` | `ConsentPermit` | patient, grantee, rootCidHash, **encKeyHash**, expireAt, allowDelegate, deadline, nonce | Cấp quyền đọc 1 record cho grantee | `eip712.js:21-32` (types), `:71-119` (hàm) |
| `signDelegationPermit` | `DelegationPermit` | patient, delegatee, duration (uint40), allowSubDelegate, deadline, nonce | Uỷ quyền BULK cho bác sĩ; relayer gọi `delegateAuthorityBySig` | `eip712.js:39-48`, `:135-170` |
| `signTrustedContactPermit` | `TrustedContactPermit` | patient, contact, label, active, deadline, nonce | Chỉ định/thu hồi người thân tin cậy; relayer gọi `setTrustedContactBySig` | `eip712.js:54-63`, `:185-215` |

Điểm cần nhớ để trả hội đồng:
- **`nonce` dùng chung** cho cả 3 permit (cùng slot `nonces[patient]` trong contract) — comment `eip712.js:36-38`, `:52`. Chống replay theo thứ tự.
- Ký bằng **local account** (`walletClient.account`) để ký **offline**, không dispatch `eth_signTypedData_v4` qua RPC (RPC Arbitrum không hỗ trợ) — comment `eip712.js:83-90`.
- Trước khi ký có **cổng sinh trắc** `gateOrThrow(...)` (vd `eip712.js:107`, `:159`): chữ ký Web3Auth là primitive kỹ thuật, sinh trắc là "sự kiện ký hợp pháp" hiển thị cho người dùng (theo TT 13/2025 Điều 3.2).
- `includeUpdates` **đã bị bỏ** khỏi `ConsentPermit` (chuyển sang mô hình "medical episode", comment `eip712.js:20`) — đừng nói hệ thống còn dùng `includeUpdates` trong consent permit.

---

## 7. Backend còn một lớp AES riêng (đừng nhầm với AES của hồ sơ)

`backend/src/utils/crypto.js` có `encryptAES`/`decryptAES` dùng **AES-256-GCM với một khoá server** (`CREDENTIAL_ENCRYPTION_KEY` 64-char hex, dòng 9-35). Đây là chuyện **khác hoàn toàn** với mã hoá hồ sơ y tế:
- Khoá nằm ở server (env) → server **đọc được** dữ liệu mã bằng nó.
- Dùng cho **thông tin nhạy cảm phía server**, ví dụ `DoctorCredential` (comment dòng 14, khối 13-15), KHÔNG dùng cho FHIR bundle hay KeyShare.
- Định dạng output là `iv:encrypted:authTag` dạng hex (dòng 51-52) — khác định dạng base64 `IV‖CT‖TAG` của mobile.

Tóm lại: **lớp AES của mobile (crypto.js)** bảo vệ hồ sơ y tế end-to-end (server mù); **lớp AES của backend (utils/crypto.js)** chỉ bảo vệ vài secret hạ tầng và server có chìa. Đừng lẫn hai cái.

---

## 8. Luồng end-to-end (gắn UI → service → backend → IPFS/DB/chain)

### 8.1 Tạo & lưu một hồ sơ (patient tự khai)

Màn: `CreateRecordScreen` (`mobile/src/screens-v2/CreateRecordScreen.tsx`, `handleSubmit` dòng 372).

```
[UI] patient nhập form -> buildPayload() ráp FHIR-like bundle
  -> gateOrThrow('Xác thực để tạo hồ sơ...')            (dòng 439)  [sinh trắc]
  -> aesKey = generateAESKey()                          (dòng 440)  [AES random/record]
  -> encryptedData = encryptData(payload, aesKey)       (dòng 441)  [LỚP 1: AES-GCM]
  -> ipfsService.uploadEncrypted(encryptedData) -> CID  (dòng 442)  [IPFS]
  -> cidHash = keccak256(toBytes(cid))                  (dòng 447)
  -> localRecordStore.setKey(cidHash,{cid,aesKey})      (dòng 466)  [cache local AsyncStorage]
  -> recordApi.createRecord(cidHash, recordTypeHash...) (dòng 472-483)
        | qua relayer (sponsored) HOẶC self-pay addRecord nếu hết quota (withSelfPayFallback)
        v  [ON-CHAIN] RecordRegistry lưu cidHash (KHÔNG có CID)
  -> self KeyShare: encryptForRecipient({cid,aesKey} cho chính mình) (dòng 525-539) [LỚP 2 backup]
  -> nếu là version mới: lấy recipients của parent, mã KeyShare cho từng người (dòng 541-570)
```

- Ai trả gas: **patient KHÔNG trả** (relayer sponsor; nếu hết 100 lượt/tháng thì self-pay) — comment dòng 467-471.
- Dữ liệu gì mã hoá: **toàn bộ FHIR bundle** (AES-GCM) lên IPFS; **`{cid, aesKey}`** (NaCl box) vào KeyShare.
- Ai đọc được: lúc này chỉ chính chủ (self KeyShare + local cache).

### 8.2 Chia sẻ record cho người khác

Màn: `RecordDetailScreen` (`mobile/src/screens-v2/RecordDetailScreen.tsx`, `performShare` dòng 292).

```
[UI] chọn người nhận -> lấy recipientPubKey (encryptionPublicKey của họ)
  -> myKeypair = getOrCreateEncryptionKeypair(...)           (dòng 294)
  -> resolve {cid, aesKey} của record (local hoặc self-share) (dòng 296-...)
  -> encryptedPayload = encryptForRecipient(payload, recipientPubKey, myKeypair.secretKey)  (dòng 392)  [LỚP 2]
  -> keyShareService.shareKey({cidHash, recipientAddress, encryptedPayload, senderPublicKey})(dòng 395)
        v  POST /api/key-share  -> backend kiểm checkConsent rồi applyShare (KeyShareWriter)
  + SONG SONG: ký EIP-712 ConsentPermit (signGrantConsent) -> relayer grant on-chain ConsentLedger
```

Lưu `KeyShare` đi qua **một writer duy nhất** `applyShare(...)` (`backend/src/services/keyShareWriter.service.js:86-212`) với **timestamp guard**: nếu row hiện tại mới hơn nguồn ghi → bỏ qua (chống event cũ ghi đè share mới — sự cố S14, dòng 129-149).

### 8.3 Người nhận xem record được chia sẻ

Màn: `RecordDetailScreen`, `decodeSharedKeyPayload` (`mobile/src/screens-v2/RecordDetailScreen.tsx:232`).

```
[UI] mở record -> keyShareService.getKeyForRecord(cidHash)   (dòng 233)
        v  backend trả encryptedPayload + senderPublicKey (sau khi qua canAccess gate)
  -> nếu status 'pending': keyShareService.claimKey(id)       (dòng 242-248)
        v  POST /api/key-share/:id/claim
        v  backend REVALIDATE: checkConsent -> canAccess on-chain (keyShare.routes.js:1428)
        v     canAccess=false + bác sĩ chưa verified -> DOCTOR_NOT_VERIFIED (1453-1458), KHÔNG revoke
  -> myKeypair = getOrCreateEncryptionKeypair(...)            (dòng 251)
  -> {cid, aesKey} = decryptFromSender(encryptedPayload, senderPublicKey, myKeypair.secretKey) (dòng 255) [mở LỚP 2]
  -> tải ciphertext từ IPFS theo cid
  -> decryptData(encryptedContent, aesKey)                    (dòng 666) [mở LỚP 1 -> ra FHIR bundle]
```

- Ai trả gas: với claim thuần off-chain (đánh dấu DB) không tốn gas; phần grant on-chain do relayer/patient lo theo flow consent.
- Ai đọc được: **chỉ người nhận** vì chỉ họ có secret key NaCl để mở `encryptedPayload`. Backend gate thêm bằng `canAccess` để không phát phong bì cho người đã bị revoke.

---

## 9. Những điểm dễ bị hỏi & câu trả lời ngắn

- **"Nếu hacker lấy được DB thì sao?"** → Chỉ có ciphertext + hash. KeyShare là NaCl box mã bằng public key người nhận, backend không có secret key → không mở được (`schema.prisma:184`; comment `:182-185`).
- **"Khoá NaCl mất máy thì sao?"** → Derive tất định từ chữ ký ví + salt (`nacl-crypto.js:72-80, 125-147`), cài lại app vẫn ra đúng keypair, giải được KeyShare cũ.
- **"On-chain có lộ hồ sơ không?"** → Không. Chỉ `cidHash`/`encKeyHash` (keccak256, một chiều) + metadata; CID/khoá không bao giờ lên chain (`eip712.js:220-230`, `blockchain.js:22-44`).
- **"Vì sao cần CẢ AES và NaCl?"** → Envelope encryption: AES nhanh cho dữ liệu lớn (FHIR); NaCl giải bài toán gửi khoá AES an toàn cho từng người nhận (mục 1.2).
- **"EIP-712 để làm gì?"** → Patient ký consent/delegation off-chain (typed-data, có domain chống replay), relayer trả gas đẩy lên contract; contract `ecrecover` xác minh chính chủ (mục 6).
- **"Backend có thể tự đọc trộm không?"** → Không, nó là blind mailbox; nó chỉ *gate* bằng `canAccess` chứ không *giải* được nội dung (mục 5, 5.1).

---

## Nguồn đã đọc

- `mobile/src/services/crypto.js` — AES-256-GCM (node-forge), generate/encrypt/decrypt, computeCidHash, payload helpers.
- `mobile/src/services/nacl-crypto.js` — NaCl box X25519, derive keypair từ chữ ký ví, lưu khoá mã hoá-tại-chỗ.
- `mobile/src/utils/eip712.js` — domain + 3 typed-data permit (Consent/Delegation/TrustedContact), computeCidHash/computeEncKeyHash.
- `mobile/src/utils/base64.ts` — normalizeBase64 (chuẩn hoá input ảnh trước AES).
- `mobile/src/services/keyShare.service.js` — client API tới `/api/key-share` (share/claim/getKeyForRecord/recipients).
- `mobile/src/services/ipfs.service.js` — upload/download Pinata; định dạng base64 ciphertext.
- `mobile/src/screens-v2/CreateRecordScreen.tsx` — luồng tạo record end-to-end (AES → IPFS → cidHash → KeyShare self/recipients).
- `mobile/src/screens-v2/RecordDetailScreen.tsx` — performShare, decodeSharedKeyPayload, giải mã 2 lớp.
- `backend/src/utils/crypto.js` — lớp AES server riêng (CREDENTIAL_ENCRYPTION_KEY) cho secret hạ tầng.
- `backend/src/services/keyShareWriter.service.js` — single-writer KeyShare + timestamp guard (S14/S15.1).
- `backend/src/config/blockchain.js` — checkConsent → ConsentLedger.canAccess, ABI output tuple của `getConsent` (encKeyHash).
- `backend/src/routes/keyShare.routes.js` — POST /:id/claim revalidate on-chain, xử lý DOCTOR_NOT_VERIFIED.
- `backend/prisma/schema.prisma` — model User (encryptionPublicKey), model KeyShare (encryptedPayload/senderPublicKey, "blind mailbox").
