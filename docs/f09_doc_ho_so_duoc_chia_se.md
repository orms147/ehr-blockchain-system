# Chức năng — Đọc hồ sơ được chia sẻ (claim + giải mã)

## Tóm tắt 30 giây

Khi một bác sĩ (hoặc người được chia sẻ) mở một hồ sơ y tế mà bệnh nhân đã cấp quyền,
điều quan trọng nhất là: **backend không bao giờ tự giải mã được hồ sơ**. Backend chỉ làm
"hộp thư mù" (blind mailbox) — nó giữ một gói tin đã mã hoá (`encryptedPayload`), nhưng chỉ
trả gói đó cho người gọi **sau khi kiểm tra on-chain `canAccess`** (RecordDetailScreen →
`getKeyForRecord` → `GET /api/key-share/record/:cidHash` → `checkConsent` → đọc
`ConsentLedger.canAccess`). Sau khi nhận gói, **client tự giải mã 2 lớp**: (1) NaCl box mở
phong bì để lấy `{cid, aesKey}`, (2) tải ciphertext từ IPFS rồi AES-GCM giải mã ra nội dung
FHIR để hiển thị. Khoá AES không bao giờ rời khỏi gói mã hoá; nếu DB backend bị lộ, kẻ tấn
công chỉ thấy ciphertext + hash, không có khoá.

Nguồn chính:
- `mobile/src/screens-v2/RecordDetailScreen.tsx:633` (`handleDecrypt`)
- `mobile/src/screens-v2/RecordDetailScreen.tsx:232` (`decodeSharedKeyPayload`)
- `backend/src/routes/keyShare.routes.js:1203` (`GET /record/:cidHash`)
- `backend/src/routes/keyShare.routes.js:1362` (`POST /:id/claim`)
- `backend/src/config/blockchain.js:173` (`checkConsent` → `canAccess`)

---

## 1. Khái niệm nền (cho người không biết backend / mật mã)

Trước khi đi vào luồng, cần nắm 5 khái niệm. Người đọc rành blockchain nhưng quên mật mã/
backend, nên phần này giải thích kỹ.

| Khái niệm | Là gì | Vai trò trong chức năng này |
|---|---|---|
| **AES-GCM** | Mã hoá **đối xứng** — cùng một khoá dùng để mã hoá VÀ giải mã. GCM còn kèm "auth tag" để phát hiện dữ liệu bị sửa. | Nội dung hồ sơ FHIR thật (chẩn đoán, chỉ số…) được mã hoá bằng AES rồi lưu lên IPFS. `crypto.js:64` `decryptData`. |
| **NaCl box** (`nacl.box`) | Mã hoá **bất đối xứng** — mỗi người có một cặp khoá (public + secret). Người gửi dùng public key của người nhận để "đóng phong bì"; chỉ người nhận có secret key mới mở được. | Dùng để "bọc" cái khoá AES + CID lại, sao cho **chỉ đúng người nhận** mở ra được. `nacl-crypto.js:41` `decryptFromSender`. |
| **CID / cidHash** | CID = địa chỉ nội dung file trên IPFS (giống mã băm của file). `cidHash = keccak256(bytes(cid))`. | CID **không bao giờ** lên chain (vì nó tiết lộ vị trí file); chỉ `cidHash` lên chain. `crypto.js:10` `computeCidHash`. |
| **IPFS / Pinata** | Lưu trữ file phi tập trung; ở đây dùng Pinata làm gateway. | Chứa **ciphertext** (đã AES mã hoá) của hồ sơ. `ipfs.service.js:75` `download`. |
| **canAccess (on-chain)** | Hàm `view` trong `ConsentLedger`: cho `(patient, grantee, cidHash)` trả `true/false` rằng grantee có quyền đọc hay không. | **Quyết định cuối cùng** về phân quyền. Backend chỉ là người đọc lại kết quả này. `blockchain.js:10-21` (ABI). |

**Ý tưởng "blind mailbox":** backend lưu `encryptedPayload` = một phong bì NaCl box. Backend
KHÔNG có secret key của người nhận, nên dù có cầm phong bì cũng không mở được. Backend chỉ
quyết định **có đưa phong bì cho người gọi hay không**, dựa trên `canAccess` on-chain.

Đối chiếu 3 lớp dữ liệu (đây là kiến trúc cốt lõi của luận văn):

```
  Lớp            Lưu cái gì                              Ai đọc được nội dung
  ───────────    ──────────────────────────────────     ─────────────────────────
  On-chain       grantee, cidHash, expireAt, flags,      Public (chỉ là metadata,
  (ConsentLedger) encKeyHash (CHỈ là hash)                không có khoá → vô hại)
  ───────────    ──────────────────────────────────     ─────────────────────────
  Backend DB     encryptedPayload = NaCl box của         KHÔNG AI ở backend
  (KeyShare)     {cid, aesKey}                            (backend không có secret key)
  ───────────    ──────────────────────────────────     ─────────────────────────
  IPFS (Pinata)  AES-GCM ciphertext của bundle FHIR      Cần aesKey (nằm trong phong bì)
```

Nếu DB rò rỉ → kẻ tấn công chỉ có phong bì NaCl + hash, không giải được.
Nếu chain rò rỉ → chỉ có metadata + hash, không có khoá.

---

## 2. Luồng end-to-end (UI → service → backend → IPFS → màn hình)

### 2.1 Sơ đồ luồng

```
 BÁC SĨ (người được chia sẻ) bấm "Giải mã nội dung"
        │
        ▼
 [MOBILE] RecordDetailScreen.handleDecrypt()                 RecordDetailScreen.tsx:633
        │  - Nếu là owner & có khoá AES cache local → dùng luôn (bỏ qua backend)
        │  - Nếu KHÔNG phải owner → gọi decodeSharedKeyPayload()
        ▼
 [MOBILE] decodeSharedKeyPayload(cidHash)                    RecordDetailScreen.tsx:232
        │  1) keyShareService.getKeyForRecord(cidHash)
        ▼
 [MOBILE service] keyShareService.getKeyForRecord            keyShare.service.js:48
        │  GET /api/key-share/record/:cidHash
        ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ [BACKEND] GET /api/key-share/record/:cidHash               keyShare.routes.js:1203 │
 │   a) Tìm KeyShare row (recipient = caller, chưa revoke/expire)  :1217          │
 │   b) Nếu caller KHÔNG phải owner/creator:                                       │
 │        checkConsent(owner, caller, cidHash)  ── on-chain canAccess ──┐          │
 │        (fallback: TrustedContact bypass / báo lỗi nếu doctor chưa verify)       │
 │   c) Nếu pass → trả { encryptedPayload, senderPublicKey, senderAddress }  :1348 │
 └────────────────────────────────────────────│──────────────────────────────────┘
                                               │ on-chain read
                                               ▼
                          [CHAIN] ConsentLedger.canAccess(patient, grantee, cidHash)
                                  blockchain.js:173 checkConsent → :187 canAccess
        │
        │ (song song, fire-and-forget) nếu status='pending' → keyShareService.claimKey(id)
        │    POST /api/key-share/:id/claim  → flip status sang 'claimed'   keyShare.routes.js:1362
        ▼
 [MOBILE] NaCl mở phong bì                                   RecordDetailScreen.tsx:255
        │  decryptFromSender(encryptedPayload, senderPublicKey, mySecretKey)
        │  → JSON { cid, aesKey }                            nacl-crypto.js:41
        ▼
 [MOBILE] ipfsService.download(cid)  → ciphertext base64     ipfs.service.js:75
        ▼
 [MOBILE] AES-GCM giải mã                                    RecordDetailScreen.tsx:666
        │  decryptData(ciphertext, aesKey) → object FHIR     crypto.js:64
        ▼
 [MOBILE] setDecryptedData(...) → render DecryptedContent    RecordDetailScreen.tsx:679, :1261
```

### 2.2 Hai endpoint backend có liên quan — đừng nhầm

Đây là điểm dễ gây hiểu lầm. **Gói `encryptedPayload` dùng để giải mã được lấy qua
`GET /record/:cidHash`, KHÔNG phải qua `/claim`.** `/claim` chỉ để chuyển trạng thái.

| Endpoint | Khi nào gọi | Mục đích | Có gate canAccess? | Trả encryptedPayload? |
|---|---|---|---|---|
| `GET /api/key-share/record/:cidHash` | Mỗi lần `decodeSharedKeyPayload` (tức mỗi lần giải mã) | Lấy gói NaCl để giải mã | Có — `checkConsent` nếu không phải owner/creator (`keyShare.routes.js:1273`) | Có (`keyShare.routes.js:1351`) |
| `POST /api/key-share/:id/claim` | Chỉ khi share đang `pending`, gọi fire-and-forget để đánh dấu đã nhận | Flip `pending → claimed` + ghi AccessLog + báo bệnh nhân nếu là Trusted Contact | Có — `checkConsent` lại lần nữa (`keyShare.routes.js:1428`) | Có (`keyShare.routes.js:1545`) nhưng UI read path không dùng payload từ đây |

Trong `decodeSharedKeyPayload`, `claimKey` được gọi **không `await`** (`keyShare.routes.js`
phía mobile `RecordDetailScreen.tsx:242-248`) — nó chỉ để cập nhật trạng thái nền, còn payload
dùng để giải mã là cái lấy từ `getKeyForRecord` ngay trước đó.

---

## 3. Chi tiết phía MOBILE (giải thích kỹ — người đọc ít biết mobile nhất)

### 3.1 `handleDecrypt` — điểm vào (RecordDetailScreen.tsx:633)

Khi bấm nút "Giải mã nội dung", `handleDecrypt` chạy. Logic chính:

1. Lấy địa chỉ ví của chính mình từ `walletActionService.getWalletContext()`
   (`RecordDetailScreen.tsx:641`).
2. Xác định mình có phải owner/creator không (`isOwnerLocal`, `RecordDetailScreen.tsx:645`).
3. **Đường tắt cho chủ sở hữu:** nếu là owner VÀ có khoá AES trong cache local
   (`localRecordStore.getKey`), dùng luôn `{cid, aesKey}` từ local, **không gọi backend**
   (`RecordDetailScreen.tsx:649-651`). Đây là lý do chủ hồ sơ đọc được kể cả offline gate.
4. **Đường của người được chia sẻ:** nếu KHÔNG phải owner → gọi
   `decodeSharedKeyPayload(record.cidHash)` để round-trip qua backend gate
   (`RecordDetailScreen.tsx:652-656`).
5. Có `{cid, aesKey}` rồi → tải ciphertext từ IPFS (`ipfsService.download(cid)`,
   `RecordDetailScreen.tsx:664`) → `decryptData(ciphertext, aesKey)` (`:666`).
6. Nếu giải mã ném lỗi `GCM Authentication Failed` và trước đó dùng khoá local (có thể
   stale), thử lại bằng khoá lấy từ backend (`RecordDetailScreen.tsx:667-677`).
7. `setDecryptedData(decrypted)` → render (`RecordDetailScreen.tsx:679`).
8. `saveLocalKey(...)` chỉ lưu khoá xuống local **nếu là owner** (`RecordDetailScreen.tsx:685`,
   định nghĩa `:279-287` — `if (!isOwner) return;`). Người được chia sẻ KHÔNG lưu khoá local
   → đảm bảo khi bị thu hồi quyền là mất khả năng đọc, không cache vĩnh viễn.

### 3.2 `decodeSharedKeyPayload` — lấy + mở phong bì (RecordDetailScreen.tsx:232)

```
sharedKey = await keyShareService.getKeyForRecord(cidHash)   // GET gated endpoint  :233
if (sharedKey.isAncestorKey) setAncestorKeyWarning(true)      // cảnh báo khoá phiên bản cũ :238
if (sharedKey.status === 'pending') keyShareService.claimKey(sharedKey.id)  // fire&forget :242
myKeypair = await getOrCreateEncryptionKeypair(walletClient, address)        // :251
decryptedPayload = decryptFromSender(sharedKey.encryptedPayload,
                                     sharedKey.senderPublicKey,
                                     myKeypair.secretKey)       // NaCl mở phong bì :255
keyData = JSON.parse(decryptedPayload)                          // { cid, aesKey } :256
return { cid: keyData.cid, aesKeyString: keyData.aesKey }       // :271
```

Lưu ý: có nhiều `try/catch` fallback (`RecordDetailScreen.tsx:257-268`) cho dữ liệu cũ
(payload chưa mã hoá NaCl, hoặc base64 thuần) — nhưng đường chính là NaCl box.

### 3.3 Khoá NaCl của người nhận từ đâu ra? (nacl-crypto.js)

Người nhận cần **secret key NaCl** để mở phong bì. Khoá này **không lưu sẵn dạng thô** mà được
**dẫn xuất tất định (deterministic) từ chữ ký ví**:

- `getOrCreateEncryptionKeypair` (`nacl-crypto.js:125`): yêu cầu ví ký một thông điệp cố định
  `EHR-Sign-Encryption-Key-v1\nWallet: <addr>` (`nacl-crypto.js:69, :121-123`).
- Từ chữ ký đó → `deriveKeyFromWalletSignature` băm keccak256 ra 32 byte làm seed
  (`nacl-crypto.js:72-80`).
- Seed → `nacl.box.keyPair.fromSecretKey(seed)` ra cặp khoá (`nacl-crypto.js:12-23`).
- Vì tất định, cùng ví → luôn ra cùng cặp khoá → **khôi phục được** kể cả cài lại app
  (miễn là còn ví). Secret key được lưu mã hoá vào AsyncStorage (`nacl-crypto.js:140-144`),
  nhưng nguồn gốc vẫn là chữ ký ví.

`decryptFromSender` (`nacl-crypto.js:41`): dùng `nacl.box.open(ciphertext, nonce,
senderPublicKey, recipientSecretKey)`; nếu sai khoá / dữ liệu bị sửa → trả `null` → ném lỗi
`Decryption failed: invalid key or tampered message` (`nacl-crypto.js:57-59`).

### 3.4 Tải IPFS + AES-GCM (ipfs.service.js, crypto.js)

- `ipfsService.download(cid)` (`ipfs.service.js:75`): `fetch(<gateway>/ipfs/<cid>)` → lấy
  `arrayBuffer` → trả về base64 (có nhánh tương thích ngược cho bản ghi cũ lưu base64 text,
  `ipfs.service.js:88-98`).
- `decryptData(encryptedBase64, base64Key)` (`crypto.js:64`): tách layout
  `[IV(12) | ciphertext | tag(16)]` (`crypto.js:70-74`), giải AES-GCM bằng `node-forge`
  (`crypto.js:76-83`). Nếu auth tag không khớp → ném `GCM Authentication Failed`
  (`crypto.js:85-87`) → UI map thành thông báo "Khóa giải mã không khớp..."
  (`RecordDetailScreen.tsx:136-138`).

### 3.5 Người dùng vào màn này từ đâu?

- Bệnh nhân: `RecordsScreen` → `handleRecordPress` → `navigation.navigate('RecordDetail',
  {record})` (`RecordsScreen.tsx:212-221`).
- Bác sĩ: `DoctorDashboardScreen` cũng điều hướng tới cùng `RecordDetail` (xác nhận bằng
  Grep: `mobile/src/screens-v2/doctor/DoctorDashboardScreen.tsx` có `RecordDetail`), dùng
  chung `handleDecrypt`/`decodeSharedKeyPayload` ở trên.

---

## 4. Chi tiết phía BACKEND (giải thích kỹ)

### 4.1 `GET /api/key-share/record/:cidHash` — cổng trả payload (keyShare.routes.js:1203)

Đây là **cổng (gate)** quan trọng nhất của chức năng đọc. Trình tự:

1. **Tìm KeyShare row khớp chính xác cidHash** cho người gọi, loại trạng thái chết và đã hết
   hạn (`keyShare.routes.js:1217-1231`):
   ```
   where: cidHash = :cidHash, recipientAddress = caller,
          status NOT IN ('revoked','awaiting_claim','rejected'),
          (expiresAt IS NULL OR expiresAt > now)
   ```
   Cố ý **không** fallback sang khoá phiên bản cha/con (`keyShare.routes.js:1209-1216`): trả
   nhầm payload phiên bản khác sẽ gây "cache poisoning" (bác sĩ tưởng đang xem V2 nhưng giải
   ra nội dung V1). Không có row đúng → trả 404 với code rõ ràng
   (`KEY_NOT_SHARED_FOR_VERSION` / `CREATOR_KEY_LOST` / `OWNER_KEY_MISSING`,
   `keyShare.routes.js:1233-1261`).

2. **Kiểm tra quyền on-chain** nếu người gọi KHÔNG phải owner cũng KHÔNG phải creator
   (`keyShare.routes.js:1267-1273`):
   ```
   hasOnChainConsent = await checkConsent(ownerAddress, requesterAddress, cidHash)
   ```
   `checkConsent` đọc `ConsentLedger.canAccess` on-chain (xem §4.3). Hợp đồng tự đi ngược
   chuỗi version đến root để xác thực (mô hình "medical episode"), nên backend chỉ cần **một
   lời gọi**, không phải tự đi chuỗi (`keyShare.routes.js:1263-1268`).

3. **Nếu canAccess = false**, có hai nhánh xử lý đặc biệt trước khi từ chối:
   - **Trusted Contact bypass** (`keyShare.routes.js:1286-1300`): `canAccess` không kiểm tra
     mapping `isTrustedContact`; nếu người gọi là Trusted Contact đang active của bệnh nhân
     (bảng `trustedContact` — mirror của event on-chain) thì vẫn cho qua (KeyShare đã
     pre-share sẵn).
   - **Bác sĩ chưa xác minh** (`keyShare.routes.js:1302-1335`): đọc `isDoctor` +
     `isVerifiedDoctor`; nếu là doctor nhưng chưa verified → trả 403 `DOCTOR_NOT_VERIFIED`
     (đây là hệ quả của FIX audit #3: `canAccess` từ chối mọi doctor chưa verified). Ngược
     lại → 403 `CONSENT_REVOKED`.

4. **Pass** → trả về (`keyShare.routes.js:1348-1355`):
   ```
   { id, cidHash, encryptedPayload, senderPublicKey, senderAddress, status }
   ```
   `encryptedPayload` chính là phong bì NaCl mà client sẽ mở. Backend **không** đụng vào nội
   dung bên trong.

> Ghi chú bảo mật bổ sung: endpoint danh sách `GET /api/key-share/my` **cố tình KHÔNG** trả
> `encryptedPayload` cho hồ sơ của người khác (`keyShare.routes.js:678-685`) — payload chỉ
> được phục vụ qua endpoint có gate canAccess này. Self-share (sender == recipient, backup
> của chính bệnh nhân) là ngoại lệ được trả thẳng.

### 4.2 `POST /api/key-share/:id/claim` — đánh dấu đã nhận (keyShare.routes.js:1362)

Endpoint này **không phải nguồn payload để giải mã trong read path**, mà để:

1. Xác thực người gọi đúng là recipient (`keyShare.routes.js:1376-1378`).
2. Chặn nếu `revoked` / `expired` / `awaiting_claim` (`keyShare.routes.js:1380-1400`).
3. **Kiểm lại canAccess on-chain** ngay lúc claim (`keyShare.routes.js:1428`) — vì row DB có
   thể vẫn `pending` dù một delegator cha trong chuỗi đã revoke (epoch bump). Nếu false:
   - doctor chưa verified → 403 `DOCTOR_NOT_VERIFIED`, **không** revoke row
     (`keyShare.routes.js:1453-1458`);
   - verified mà vẫn false → 403 `ONCHAIN_CONSENT_MISSING`, cũng **không** tự revoke (tránh
     phá dữ liệu vì lỗi RPC tạm thời; tin tưởng worker đồng bộ event xử lý revoke thật)
     (`keyShare.routes.js:1460-1481`).
4. `applyStatusFlip` đổi sang `claimed` + ghi `claimedAt` (`keyShare.routes.js:1484-1491`).
5. Nếu người claim là Trusted Contact → ghi AccessLog dạng `TRUSTED_CONTACT_CLAIM` + bắn
   socket/push báo bệnh nhân (`keyShare.routes.js:1501-1539`). Ngược lại AccessLog là
   `CLAIM_KEY` (`keyShare.routes.js:1536`). Đây là **audit trail bất biến** của việc truy cập.

### 4.3 `checkConsent` → `canAccess` (blockchain.js:173)

- `checkConsent(patientAddress, granteeAddress, cidHash)` (`blockchain.js:173`): gọi
  `publicClient.readContract({ ..., functionName: 'canAccess', args:[patient, grantee,
  cidHash] })` (`blockchain.js:184-189`).
- Có retry tối đa 3 lần với backoff khi gặp RPC 429 (`blockchain.js:179-205`); cidHash rỗng
  → từ chối ngay (`blockchain.js:174-177`); lỗi cuối cùng → trả `false` (an toàn mặc định).
- ABI `canAccess` nhận `(address patient, address grantee, bytes32 cidHash)` trả `bool`
  (`blockchain.js:10-21`). Đây là **nguồn chân lý** về phân quyền; backend chỉ đọc lại.

---

## 5. Ai trả gas? Dữ liệu nào mã hoá? Ai đọc được gì?

| Câu hỏi | Trả lời | Nguồn |
|---|---|---|
| Đọc hồ sơ có tốn gas không? | **Không.** Toàn bộ read path chỉ gồm lời gọi `view` `canAccess` (không tốn gas) + đọc DB + tải IPFS + giải mã trên thiết bị. Không có giao dịch ghi on-chain. | `blockchain.js:184` (`readContract`, view) |
| `encryptedPayload` mã hoá bằng gì, ai mở được? | NaCl box, mã bằng **public key của người nhận**; chỉ người nhận (có secret key dẫn xuất từ ví) mở được. | `nacl-crypto.js:41`, `RecordDetailScreen.tsx:255` |
| Nội dung hồ sơ trên IPFS mã hoá bằng gì? | AES-GCM bằng `aesKey`; `aesKey` chỉ nằm bên trong phong bì NaCl. | `crypto.js:64`, `RecordDetailScreen.tsx:666` |
| Backend đọc được nội dung không? | **Không.** Backend không có secret key NaCl → không mở phong bì → không có aesKey → không giải IPFS. | §1 bảng 3 lớp |
| Ai quyết định cho/không cho đọc? | `ConsentLedger.canAccess` on-chain; backend chỉ thực thi lại quyết định đó. | `blockchain.js:173-189` |
| Chủ hồ sơ (bệnh nhân) đọc thế nào? | Đường tắt local AES cache, không qua gate backend (vì luôn `canAccess` chính mình). | `RecordDetailScreen.tsx:649-651` |

---

## 6. Các trường hợp lỗi & thông báo (đối chiếu code)

| Tình huống | Backend trả | UI hiển thị |
|---|---|---|
| Chưa có khoá cho đúng version | 404 `KEY_NOT_SHARED_FOR_VERSION` (`keyShare.routes.js:1256-1260`) | "Bệnh nhân chưa chia sẻ khoá... cho đúng phiên bản này" (`RecordDetailScreen.tsx:142-144`) |
| Bác sĩ chưa được xác minh | 403 `DOCTOR_NOT_VERIFIED` (`keyShare.routes.js:1329-1334`) | "Tài khoản bác sĩ... chưa được xác minh" (`RecordDetailScreen.tsx:154-155`) |
| Quyền đã bị thu hồi | 403 `CONSENT_REVOKED` (`keyShare.routes.js:1337-1342`) | "Bệnh nhân đã thu hồi quyền truy cập..." (`RecordDetailScreen.tsx:145-147`) |
| Người tạo mất khoá AES local | 404 `CREATOR_KEY_LOST` (`keyShare.routes.js:1242-1246`) | "Khoá mã hoá... chỉ lưu trên thiết bị đã tạo" (`RecordDetailScreen.tsx:157-159`) |
| Sai khoá AES / dữ liệu hỏng | — (lỗi client) | "Khóa giải mã không khớp..." từ `GCM Authentication Failed` (`crypto.js:85`, `RecordDetailScreen.tsx:136-138`) |
| Khoá là của phiên bản cũ (ancestor) | trả cờ `isAncestorKey` | banner cảnh báo "Nội dung hiển thị là của phiên bản trước..." (`RecordDetailScreen.tsx:238-240`, `:1296-1298`) |

---

## 7. Câu hỏi hội đồng có thể hỏi & cách trả lời ngắn

- **"Nếu hacker chiếm DB backend thì sao?"** → Họ chỉ có `encryptedPayload` (phong bì NaCl) +
  `cidHash` (hash, không phải CID) + `encKeyHash` on-chain. Không có secret key người nhận →
  không mở phong bì → không có `aesKey` → ciphertext IPFS vô dụng. Backend là blind mailbox
  (§1, §5).
- **"Backend có thể tự ý trả hồ sơ cho người không có quyền không?"** → Không, vì payload chỉ
  ra qua endpoint có gate `canAccess` on-chain (`keyShare.routes.js:1273`); và kể cả trả nhầm
  phong bì thì người nhận sai không có secret key để mở.
- **"Vì sao kiểm `canAccess` cả ở `getKeyForRecord` LẪN `/claim`?"** → Phòng thủ nhiều lớp +
  trạng thái có thể đổi giữa hai thời điểm (delegator cha revoke, epoch bump). `/claim` còn
  ghi audit log bất biến (`keyShare.routes.js:1532-1539`).
- **"Khoá giải mã của người nhận lưu ở đâu, mất máy có sao không?"** → Dẫn xuất tất định từ
  chữ ký ví (`nacl-crypto.js:125-146`); còn ví là khôi phục được cặp khoá → mất máy không mất
  khả năng giải mã hồ sơ được chia sẻ.

---

## Nguồn đã đọc

- `mobile/src/screens-v2/RecordDetailScreen.tsx` (đọc dòng 1–1317; trọng tâm `handleDecrypt`
  :633, `decodeSharedKeyPayload` :232, `saveLocalKey` :279, mapping lỗi :133-167)
- `mobile/src/screens-v2/RecordsScreen.tsx` (điều hướng vào RecordDetail :212-221)
- `mobile/src/services/keyShare.service.js` (`getKeyForRecord` :48, `claimKey` :36)
- `mobile/src/services/crypto.js` (`decryptData` :64, `computeCidHash` :10)
- `mobile/src/services/nacl-crypto.js` (`decryptFromSender` :41, `getOrCreateEncryptionKeypair`
  :125, derive seed :72-80)
- `mobile/src/services/ipfs.service.js` (`download` :75)
- `backend/src/routes/keyShare.routes.js` (`GET /record/:cidHash` :1203, `POST /:id/claim`
  :1362, `GET /my` không trả payload :678-685)
- `backend/src/config/blockchain.js` (`checkConsent` :173, ABI `canAccess` :10-21)
- Xác nhận bằng Grep: `mobile/src/screens-v2/doctor/DoctorDashboardScreen.tsx` cũng điều hướng
  tới `RecordDetail` (dùng chung read path)
```
