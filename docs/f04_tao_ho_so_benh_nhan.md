# Chức năng — Bệnh nhân tạo hồ sơ y tế

## Tóm tắt 30 giây

Bệnh nhân nhập dữ liệu y tế trên app → app **sinh khoá AES ngẫu nhiên** → **mã hoá** toàn bộ bundle (AES-GCM) → **upload ciphertext lên IPFS (Pinata)** nhận về một **CID** (địa chỉ nội dung) → tính **`cidHash = keccak256(cid)`** → ghi `cidHash` (KHÔNG ghi CID gốc) lên **`RecordRegistry.addRecord`** thông qua **relayer trả gas hộ** (sponsor) → lưu khoá AES vào máy (`ehr_local_records`) và tạo một **KeyShare cho chính mình** (bản sao khôi phục). Trước khi tạo, app bắt buộc **xác thực sinh trắc học**. Backend chỉ là "hòm thư mù": nó giữ ciphertext + hash nhưng không giải mã được. CID gốc không bao giờ lên chain vì nó là "chìa khoá" để tải ciphertext về từ IPFS — để nó on-chain (public) là rò rỉ vị trí dữ liệu.

---

## 1. Các khái niệm nền (cho người chưa biết backend / mã hoá / mobile)

Trước khi đi vào luồng, ba khái niệm cần nắm:

| Khái niệm | Giải thích ngắn | Vai trò trong chức năng này |
|---|---|---|
| **AES-GCM** | Mã hoá **đối xứng**: một khoá bí mật dùng cho cả mã hoá và giải mã. Nhanh, hợp để mã hoá khối dữ liệu lớn. GCM còn kèm "auth tag" để phát hiện ciphertext bị sửa. | Mã hoá nội dung hồ sơ FHIR (bundle) thành ciphertext. |
| **NaCl box** | Mã hoá **bất đối xứng** (public/secret key): mã hoá bằng public key của người nhận, chỉ secret key của người nhận giải được. | Bọc (`{cid, aesKey}`) gửi cho người nhận — kể cả gửi cho chính mình (bản backup). |
| **IPFS / CID** | IPFS là kho lưu trữ phi tập trung; mỗi file có một địa chỉ nội dung gọi là **CID** (giống "đường dẫn"). Biết CID là tải được file về. Pinata là dịch vụ "pin" (giữ) file trên IPFS. | Lưu ciphertext của hồ sơ. CID là thứ cần để tải lại. |
| **cidHash** | `keccak256(bytes(cid))` — băm một chiều của chuỗi CID. | Đây mới là thứ ghi lên blockchain (không lộ CID gốc). |
| **relayer / sponsor** | Backend dùng một ví "sponsor" trả tiền gas hộ người dùng để ghi giao dịch lên chain (gasless cho user). | Trả gas khi ghi `addRecord` lên chain. |
| **biometric gate** | Bắt người dùng quét vân tay/Face ID ngay trước thao tác ký, để thao tác có giá trị như chữ ký điện tử (TT 13/2025/TT-BYT Điều 3.2). | Chặn trước khi bắt đầu tạo hồ sơ. |

Tầng dữ liệu — ai đọc được gì:

```
   NỘI DUNG HỒ SƠ (FHIR bundle: tiêu đề, ICD-10, vitals, đơn thuốc, ảnh...)
        │  AES-GCM(payload, aesKey)
        ▼
   CIPHERTEXT ───upload──►  IPFS / Pinata        → trả về CID
        │
        ▼
   cidHash = keccak256(cid) ──ghi──► RecordRegistry (on-chain, PUBLIC)
        │
   aesKey + cid  ──lưu local──► ehr_local_records (AsyncStorage trên máy)
        │
   {cid, aesKey} ──NaCl box──► KeyShare (Postgres, backend) — bản backup cho chính mình
```

Quan trọng: **backend chỉ giữ ciphertext (qua CID) + hash + KeyShare đã mã hoá** — không có `aesKey` plaintext, nên không giải mã được. Đây là thiết kế "blind mailbox" (CLAUDE.md §4, được code phản ánh ở dưới).

---

## 2. Sơ đồ luồng end-to-end

```
┌─ MOBILE: CreateRecordScreen.tsx ─────────────────────────────────────────┐
│ 1. User nhập (mode Nhanh / Đầy đủ) → buildPayload() dựng object bundle    │
│ 2. handleSubmit():                                                        │
│    a. validate (tiêu đề, nội dung, đơn thuốc, vaccine)                    │
│    b. gateOrThrow('Xác thực để tạo hồ sơ y tế mới')   ◄── SINH TRẮC HỌC   │
│    c. aesKey   = generateAESKey()         (crypto.js)                     │
│    d. encryptData(payload, aesKey)        (AES-GCM → base64 ciphertext)   │
│    e. ipfsService.uploadEncrypted(...)    → { cid }    (Pinata)           │
│    f. cidHash        = keccak256(toBytes(cid))                            │
│       recordTypeHash = keccak256(toBytes(recordType))                     │
│    g. localRecordStore.setKey(cidHash, {cid, aesKey, ...})  pending       │
│    h. withSelfPayFallback(                                                │
│         relayer: recordService.createRecord(...)   ──┐                    │
│         self-pay: RecordRegistry.addRecord(...)      │  (nếu hết quota)   │
│       )                                              │                    │
└──────────────────────────────────────────────────────┼──────────────────┘
                                                        │
        ┌───────────── đường SPONSOR (mặc định) ────────┘
        ▼
┌─ BACKEND: POST /api/records (record.routes.js) ──────────────────────────┐
│ - validate body (zod), check trùng cidHash, check quota                   │
│ - tạo RecordMetadata (syncStatus=pending)                                 │
│ - relayerService.sponsorUploadRecord(...)                                 │
│      └─► consumeQuota (trừ 1/100) → addRecordFor(cidHash,parent,type,pt)  │
│            (ví sponsor trả gas)                                           │
│ - cập nhật RecordMetadata.syncStatus=confirmed + txHash                   │
│ - ghi AccessLog action=CREATE_RECORD                                      │
└──────────────────────────────────────────────────────┬──────────────────┘
                                                        ▼
                              ┌─ ON-CHAIN: RecordRegistry.addRecordFor ─────┐
                              │ - require sponsor authorized + isPatient    │
                              │ - _addRecord: lưu Record{cidHash,...}       │
                              │ - emit RecordAdded                          │
                              └─────────────────────────────────────────────┘
        ┌──────────────── sau khi tạo xong (mobile) ───────────────────────┐
        │ i. autoPreShareNewRecord(...)  → chia sẻ cho Trusted Contact      │
        │ j. self-KeyShare: NaCl box {cid,aesKey} cho chính mình            │
        │    → keyShareService.shareKey() → POST /api/key-share             │
        │ k. (nếu update) propagate KeyShare cho recipients của bản gốc     │
        │ l. clear draft, điều hướng RecordDetail                           │
        └──────────────────────────────────────────────────────────────────┘
```

---

## 3. Bước chi tiết (theo code)

### 3.1. Màn hình nhập liệu — `CreateRecordScreen.tsx`

- Hai chế độ: **Nhanh** (`simpleMode=true`: tiêu đề + ảnh + ghi chú) và **Đầy đủ** (vitals, đơn thuốc, ICD-10). Mode switch ở `mobile/src/screens-v2/CreateRecordScreen.tsx:780-813`.
- `buildPayload()` dựng object bundle gồm `meta`, `summary`, `observations` (vitals), `diagnoses` (ICD-10), `prescriptions`, `vaccinations`, và ảnh đính kèm (`imageData` base64) — `mobile/src/screens-v2/CreateRecordScreen.tsx:161-248`.
- Hồ sơ tự khai được đánh dấu rõ "chưa được xác minh bởi tổ chức y tế" (banner) — `mobile/src/screens-v2/CreateRecordScreen.tsx:755-778`.

### 3.2. Validate + Sinh trắc học (gate)

- `handleSubmit` validate tiêu đề/nội dung, validate đơn thuốc (`validateDrug`) và vaccine (`validateShot`) trước khi tiếp tục — `mobile/src/screens-v2/CreateRecordScreen.tsx:372-413`.
- **Gate sinh trắc học bắt buộc** ngay trước khi sinh khoá:
  `await gateOrThrow('Xác thực để tạo hồ sơ y tế mới');` — `mobile/src/screens-v2/CreateRecordScreen.tsx:439`.
- `gateOrThrow` gọi `requireBiometric`: nếu user bật toggle (mặc định ON) và máy có vân tay/đã enroll → bắt quét; nếu máy **không có phần cứng / chưa enroll** thì **graceful degrade** (cho qua, không chặn — vd emulator) — `mobile/src/utils/biometricGate.ts:100-137`. Nếu user **bấm Huỷ** thì throw `BIOMETRIC_CANCELLED` và dừng tạo hồ sơ — `mobile/src/utils/biometricGate.ts:130-137`.
- Ý nghĩa pháp lý: biometric đặt ngay trước thao tác ký để biến nó thành chữ ký điện tử hợp lệ (TT 13/2025 Điều 3.2) — comment đầu file `mobile/src/utils/biometricGate.ts:1-19`.

### 3.3. Sinh khoá AES + mã hoá bundle

- `const aesKey = await generateAESKey();` → 32 byte ngẫu nhiên (256-bit) bằng `forge.random`, trả về **base64** — `mobile/src/services/crypto.js:15-18`.
- `const encryptedData = await encryptData(payload, aesKey);` → AES-GCM, output là base64 của `[IV(12) | Ciphertext | Tag(16)]` — `mobile/src/services/crypto.js:36-56`.
- Mỗi hồ sơ một khoá AES riêng (sinh mới mỗi lần tạo) — gọi tại `mobile/src/screens-v2/CreateRecordScreen.tsx:440-441`.

### 3.4. Upload IPFS (Pinata) lấy CID

- `const { cid } = await ipfsService.uploadEncrypted({ encryptedData, metadata })` — `mobile/src/screens-v2/CreateRecordScreen.tsx:442-445`.
- `uploadEncrypted` → `upload()` POST ciphertext lên `https://api.pinata.cloud/pinning/pinFileToIPFS` với header `Authorization: Bearer <EXPO_PUBLIC_PINATA_JWT>`, trả về `result.IpfsHash` (chính là CID). Có retry exponential backoff — `mobile/src/services/ipfs.service.js:31-72`, `mobile/src/services/ipfs.service.js:101-108`.
- Lưu ý: **mobile upload thẳng lên Pinata**, không qua backend. Backend có một `ipfs.service.js` nhưng đó là **MOCK** (CLAUDE.md §12) — không nằm trong luồng này.

### 3.5. Tính cidHash + recordTypeHash

- `const cidHash = keccak256(toBytes(cid));` — `mobile/src/screens-v2/CreateRecordScreen.tsx:447`.
- `const recordTypeHash = keccak256(toBytes(draft.recordType));` — `mobile/src/screens-v2/CreateRecordScreen.tsx:448`.
- `keccak256`/`toBytes` từ `viem` — import ở `mobile/src/screens-v2/CreateRecordScreen.tsx:26`.

### 3.6. Lưu local trước khi ghi chain (an toàn khôi phục)

- Trước khi gọi backend, app lưu `{cid, aesKey, title, recordType, parentCidHash, ...}` vào `localRecordStore` với `syncStatus: 'pending'` — `mobile/src/screens-v2/CreateRecordScreen.tsx:451-466`.
- `localRecordStore` là chủ sở hữu DUY NHẤT của AsyncStorage key `ehr_local_records`, serialize ghi qua mutex để tránh race — `mobile/src/services/localRecordStore.ts:1-30`, `mobile/src/services/localRecordStore.ts:84-90`.
- **Cảnh báo mất khoá**: `aesKey` chỉ nằm trong máy + bản backup KeyShare. Mất app mà chưa có KeyShare = mất khoá giải mã. Đó là lý do có bước self-KeyShare (3.9).

### 3.7. Ghi on-chain — sponsor (mặc định) hoặc self-pay

Mobile bọc lời gọi trong `withSelfPayFallback` — `mobile/src/screens-v2/CreateRecordScreen.tsx:472-495`:

- **Đường mặc định (sponsor)**: gọi `recordService.createRecord(cidHash, recordTypeHash, parentCidHash, title, description, recordType)` → `POST /api/records` — `mobile/src/services/record.service.js:5-14`.
- **Đường dự phòng (self-pay)**: nếu backend trả `QUOTA_EXHAUSTED` (hết 100 lượt/tháng), app tự gửi `RecordRegistry.addRecord(cidHash, parent||ZERO_HASH, recordTypeHash)` từ ví Web3Auth của chính user (user tự trả ETH) — `mobile/src/utils/selfPayFallback.js:43-74`; định nghĩa selfPay write ở `mobile/src/screens-v2/CreateRecordScreen.tsx:476-482`. Khi self-pay xong, mobile gọi `recordService.saveOnly(...)` để backend chỉ mirror metadata (không trả gas) — `mobile/src/screens-v2/CreateRecordScreen.tsx:484-495`.

**Backend `POST /api/records`** (`backend/src/routes/record.routes.js:94-290`):
1. Validate body bằng zod (`cidHash` đúng định dạng 0x+64 hex) — `backend/src/routes/record.routes.js:65-73`, `record.routes.js:96`.
2. Chống trùng: nếu `cidHash` đã `confirmed` → `409 RECORD_EXISTS`; đang `pending` → `409 UPLOAD_ALREADY_PENDING`; thuộc owner khác → `409 CID_RESERVED` — `record.routes.js:108-135`.
3. Nếu là bản cập nhật (có `parentCidHash`): kiểm tra parent tồn tại, giới hạn `MAX_CHILDREN=100`, và caller phải là owner hoặc có KeyShare hợp lệ — `record.routes.js:137-173`.
4. Kiểm tra quota (`signaturesRemaining > 0`), hết thì `429 QUOTA_EXHAUSTED` — `record.routes.js:175-182`.
5. Tạo `RecordMetadata` (`syncStatus=pending`) — `record.routes.js:207-223`.
6. Gọi `relayerService.sponsorUploadRecord(walletAddress, cidHash, parent||ZERO_HASH, recordTypeHash||ZERO_HASH)` — `record.routes.js:226-232`.
7. Thành công → cập nhật `syncStatus=confirmed` + `txHash`; ghi `AccessLog` action `CREATE_RECORD`; trả `{ id, cidHash, txHash, onChain:true }` — `record.routes.js:257-286`.

**`relayerService.sponsorUploadRecord`** (`backend/src/services/relayer.service.js:427-462+`):
- `consumeQuota(address, 'upload')` — **trừ 1 lượt** trong pool 100/tháng, atomic (chống vượt cap khi đua) — `relayer.service.js:431`, định nghĩa `relayer.service.js:266-307`, hằng `SIGNATURES_PER_MONTH=100` ở `relayer.service.js:21-23`.
- Bảo đảm patient đã register, kiểm tra ví sponsor đã được authorize trong `RecordRegistry.authorizedSponsors` — `relayer.service.js:433-447`.
- `simulateContract` + `sponsorWrite` gọi **`addRecordFor(cidHash, parentCidHash, recordTypeHash, address)`** — ví sponsor là `msg.sender`, trả gas hộ patient — `relayer.service.js:451-459`.

> **Ai trả gas?** Mặc định **ví sponsor của backend** (qua `addRecordFor`). Chỉ khi hết 100 lượt/tháng thì **chính user** trả gas (qua `addRecord` từ ví Web3Auth của họ — `selfPayFallback.js`).

### 3.8. On-chain — `RecordRegistry`

- **Sponsor path** dùng `addRecordFor`: chỉ ví trong `authorizedSponsors` được gọi, patient phải là `isPatient`, `cidHash != 0` — `contracts/src/RecordRegistry.sol:106-119`.
- **Self-pay path** dùng `addRecord`: `msg.sender` phải là `isPatient`, `cidHash != 0` — `contracts/src/RecordRegistry.sol:87-96`.
- Cả hai vào `_addRecord(...)`: chặn trùng (`RecordExists`), nếu có parent thì tính `version = parent.version + 1` và đẩy vào `_parentChildren` (giới hạn `MAX_CHILDREN=100`), lưu `Record{cidHash, parentCidHash, createdBy, owner, recordTypeHash, createdAt, version, exists}`, emit `RecordAdded(patient, cidHash, parentCidHash, recordTypeHash, now)` — `contracts/src/RecordRegistry.sol:150-191`.
- **On-chain chỉ lưu `cidHash` (bytes32), KHÔNG bao giờ lưu CID gốc** — đúng tên contract "Privacy-Safe Version", comment `contracts/src/RecordRegistry.sol:8-15`.

### 3.9. Tạo KeyShare cho chính mình (backup khôi phục)

Sau khi ghi chain xong, mobile tạo một bản KeyShare gửi cho **chính địa chỉ ví của mình** — `mobile/src/screens-v2/CreateRecordScreen.tsx:525-539`:
1. Lấy keypair NaCl của chính mình (`getOrCreateEncryptionKeypair`) — `CreateRecordScreen.tsx:526-527`.
2. `selfEncrypted = encryptForRecipient(JSON.stringify({cid, aesKey}), selfPublicKey, selfSecretKey)` → bọc NaCl box `{cid, aesKey}` — `CreateRecordScreen.tsx:528-529`, hàm `encryptForRecipient` dùng `nacl.box` ở `mobile/src/services/nacl-crypto.js:27-39`.
3. `keyShareService.shareKey({ cidHash, recipientAddress: self, encryptedPayload: selfEncrypted, senderPublicKey, expiresAt:null })` → `POST /api/key-share` — `CreateRecordScreen.tsx:530-536`, service `mobile/src/services/keyShare.service.js:13-22`.

Tại backend `POST /api/key-share` (`backend/src/routes/keyShare.routes.js:85-110`): vì người gửi chính là `createdBy`/owner của record (`isCreator`/`isOwner`), đi nhánh **creator bypass — không cần check consent on-chain**, lưu KeyShare. Lý do tồn tại self-KeyShare: nếu mất máy (mất `ehr_local_records`), user vẫn khôi phục được `{cid, aesKey}` từ KeyShare đã mã hoá bằng public key của chính mình (chỉ secret key của họ giải được).

> Bước này được bọc `try/catch` "non-fatal" — nếu lỗi vẫn không làm hỏng việc tạo hồ sơ — `CreateRecordScreen.tsx:537-539`.

### 3.10. Các bước phụ sau khi tạo

- `autoPreShareNewRecord(...)`: tự chia sẻ trước cho **Trusted Contact** (nếu có), chạy bất đồng bộ, lỗi không chặn — `CreateRecordScreen.tsx:520-523`.
- Nếu là **bản cập nhật** (`isUpdateMode`): propagate KeyShare cho mọi recipient đang có quyền với bản gốc, để họ vẫn đọc được version mới — `CreateRecordScreen.tsx:541-570`.
- Cập nhật lại `localRecordStore` sang `syncStatus: 'confirmed'` + `txHash` + `recordId` — `CreateRecordScreen.tsx:497-505`.
- Xoá draft, báo thành công, điều hướng sang `RecordDetail` — `CreateRecordScreen.tsx:572-585`.

### 3.11. Xử lý lỗi (đáng nói khi bảo vệ)

- Nếu ghi chain thất bại, app đã lưu local nên đánh dấu `syncStatus: 'failed'` + cho user "Mở chi tiết" để xem/giải mã/thử lại sau — `CreateRecordScreen.tsx:586-629`.
- Backend dịch mã lỗi sang thông báo tiếng Việt: `QUOTA_EXHAUSTED`, `RECORD_EXISTS`, `CID_RESERVED`, `MAX_CHILDREN_REACHED`... — `CreateRecordScreen.tsx:140-151`.

---

## 4. Vì sao plaintext CID KHÔNG bao giờ lên chain

- **CID là "chìa khoá định vị" dữ liệu**: ai biết CID thì tải được **ciphertext** từ IPFS gateway (`ipfsService.download(cid)` chỉ cần CID — `mobile/src/services/ipfs.service.js:75-99`). Blockchain là **công khai và bất biến**; nếu để CID gốc on-chain thì bất kỳ ai cũng biết chính xác file nào trên IPFS thuộc về bệnh nhân nào, lộ metadata vị trí dữ liệu vĩnh viễn.
- Giải pháp: chỉ ghi **`cidHash = keccak256(cid)`** — băm một chiều, không suy ngược ra CID. On-chain dùng `cidHash` làm khoá định danh/`canAccess`; còn CID thật chỉ tồn tại ở **máy user (local) + KeyShare đã mã hoá**. Contract khẳng định điều này trong header: "This version NEVER receives plaintext CID on-chain... The CID only exists in frontend/IPFS, never in blockchain calldata." — `contracts/src/RecordRegistry.sol:11-15`, hàm `addRecord` nhận `bytes32 cidHash` chứ không phải string — `contracts/src/RecordRegistry.sol:87-91`.
- Kết hợp với mã hoá: kể cả ai đó có CID + tải được ciphertext, họ vẫn cần `aesKey` (không bao giờ on-chain, chỉ trong NaCl box gửi đúng người nhận) → defense-in-depth. Nếu DB backend leak: chỉ có ciphertext + hash + KeyShare đã mã hoá. Nếu chain leak: chỉ có `cidHash` + metadata, không có CID, không có key (CLAUDE.md §4 — và được code xác nhận như trên).

---

## 5. Bảng tóm tắt: dữ liệu nằm ở đâu, ai đọc được

| Dữ liệu | Nơi lưu | Dạng | Ai đọc/giải được |
|---|---|---|---|
| Nội dung hồ sơ (FHIR bundle) | IPFS/Pinata | Ciphertext AES-GCM | Chỉ ai có `aesKey` |
| `aesKey` + `cid` | Máy user (`ehr_local_records`) | Plaintext local | Chỉ chủ máy |
| `aesKey` + `cid` (backup) | KeyShare (Postgres) | NaCl box (mã hoá cho public key người nhận) | Chỉ secret key của người nhận |
| `cidHash`, owner, version, type | On-chain `RecordRegistry` | bytes32 / address (PUBLIC) | Mọi người (nhưng vô dụng nếu thiếu CID + key) |
| Metadata (title, txHash, syncStatus) | Postgres `RecordMetadata` | Plaintext | Backend + user qua API |

---

## 6. Những điểm dễ bị hỏi khi bảo vệ

- **"Backend có đọc được hồ sơ không?"** Không. Backend là blind mailbox — chỉ giữ ciphertext (qua IPFS) + `cidHash` + KeyShare đã mã hoá NaCl box. Không có `aesKey` plaintext (xác nhận: backend POST `/api/records` không hề nhận `aesKey` — `backend/src/routes/record.routes.js:65-73`).
- **"Ai trả phí gas?"** Mặc định ví sponsor backend (`addRecordFor`); hết 100 lượt/tháng thì user tự trả (`addRecord`). — `relayer.service.js:427-459`, `selfPayFallback.js:43-74`.
- **"Mất điện thoại thì mất hồ sơ?"** Không hẳn — có self-KeyShare mã hoá bằng public key của chính user; đăng nhập lại (cùng ví Web3Auth) tái tạo được keypair NaCl deterministic và giải lại được — `CreateRecordScreen.tsx:525-536`, `nacl-crypto.js:125-143`.
- **"Tại sao băm CID chứ không mã hoá CID?"** Vì on-chain chỉ cần một định danh duy nhất, không cần phục hồi CID; băm một chiều rẻ và an toàn hơn — `RecordRegistry.sol:11-15`.

---

## Nguồn đã đọc

- `mobile/src/screens-v2/CreateRecordScreen.tsx` (đọc dòng 1-1382; logic tạo hồ sơ: `handleSubmit` 372-633, `buildPayload` 161-248)
- `mobile/src/services/record.service.js`
- `mobile/src/services/crypto.js`
- `mobile/src/services/ipfs.service.js`
- `mobile/src/services/pinService.ts` (đọc — không nằm trong luồng tạo hồ sơ, chỉ hạ tầng PIN fallback)
- `mobile/src/services/keyShare.service.js`
- `mobile/src/services/localRecordStore.ts`
- `mobile/src/services/nacl-crypto.js` (grep: `encryptForRecipient`, `getOrCreateEncryptionKeypair`)
- `mobile/src/utils/biometricGate.ts`
- `mobile/src/utils/selfPayFallback.js`
- `backend/src/routes/record.routes.js`
- `backend/src/routes/keyShare.routes.js` (đọc dòng 1-130)
- `backend/src/services/relayer.service.js` (grep + đọc dòng 266-465: `consumeQuota`, `sponsorUploadRecord`)
- `contracts/src/RecordRegistry.sol` (`addRecord`, `addRecordFor`, `_addRecord`)
