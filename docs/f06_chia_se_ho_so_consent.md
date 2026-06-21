# Chức năng — Chia sẻ hồ sơ (consent on-chain + key-share)

> Tài liệu onboarding. Đối tượng: dev smart-contract (rành Solidity/EVM nhưng KHÔNG biết backend/mật mã/mobile).
> Mọi khẳng định kỹ thuật đều dẫn nguồn `path:line` (đường dẫn tương đối từ gốc repo). Code là nguồn chân lý.

## Tóm tắt 30 giây

Khi bệnh nhân (patient) muốn cho một bác sĩ đọc 1 hồ sơ, hệ thống làm **hai việc song song**:

1. **On-chain (quyền hợp pháp, public, audit được):** patient ký một thông điệp EIP-712 (`signGrantConsent`), backend đem chữ ký đó gọi `ConsentLedger.grantBySig` và **trả gas hộ** (relayer). On-chain chỉ lưu *metadata + HASH của khóa* — KHÔNG có khóa thật, KHÔNG có nội dung hồ sơ.
2. **Off-chain (cái khóa để mở):** mobile mã hóa cặp `{cid, aesKey}` bằng **public key của người nhận** (NaCl box) rồi gửi lên backend lưu thành 1 dòng `KeyShare`. Backend giữ ciphertext này nhưng **không giải mã được** ("blind mailbox").

Người nhận về sau gọi backend xin `KeyShare`; backend **gate bằng `canAccess` on-chain** trước khi trả, rồi mobile dùng NaCl secret key của mình giải ra `aesKey`, tải ciphertext từ IPFS và giải mã AES để xem hồ sơ.

UI mobile cho 2 mức chia sẻ (`shareType`): `read-update` và `read-delegate`, map sang cờ on-chain `allowDelegate` (false/true). Consent on-chain được lưu theo key `keccak256(patient, grantee, rootCidHash)` — 1 consent phủ toàn bộ chuỗi version của hồ sơ.

---

## 0. Các khái niệm nền (cho người không rành backend/mật mã)

| Khái niệm | Giải thích ngắn |
|---|---|
| **CID** | "Content ID" của IPFS — chuỗi định danh file ciphertext FHIR đã upload lên IPFS. Là plaintext, KHÔNG bao giờ lên chain. |
| **cidHash** | `keccak256(bytes(cid))` — cái duy nhất đại diện cho hồ sơ trên chain. `mobile/src/utils/eip712.js:220-222` tính bằng `keccak256(toBytes(cid))`. |
| **aesKey** | Khóa đối xứng AES-GCM dùng mã hóa nội dung FHIR. Ai có khóa này + tải được ciphertext IPFS thì đọc được hồ sơ. |
| **encKeyHash** | `keccak256(aesKey)` — chỉ là HASH của khóa, đẩy lên chain để audit/đối chiếu, KHÔNG cho phép suy ngược ra khóa (`mobile/src/utils/eip712.js:227-230`). |
| **NaCl box** | Mã hóa bất đối xứng (public-key). Người gửi mã hóa bằng `recipientPublicKey + senderSecretKey`, chỉ người nhận (có `recipientSecretKey`) mở được (`mobile/src/services/nacl-crypto.js:27-39`). Đây là "phong bì" bọc lấy `{cid, aesKey}`. |
| **KeyShare** | 1 dòng trong DB Postgres của backend, chứa "phong bì" NaCl đã mã hóa. Backend lưu được nhưng không mở được. |
| **EIP-712** | Chuẩn ký dữ liệu có cấu trúc (typed data) của Ethereum. Patient ký off-chain, không tốn gas; chữ ký được người khác (relayer) đem nộp on-chain. |
| **Relayer / sponsor** | Ví của backend đứng ra **trả phí gas** thay user. User chỉ ký, backend nộp tx. |

**Tách lớp dữ liệu (rất quan trọng — đừng nhầm):**

```
┌──────────────┬───────────────────────────────────┬─────────────────────────────┐
│ Lớp          │ Lưu gì                            │ Ai đọc/giải mã được         │
├──────────────┼───────────────────────────────────┼─────────────────────────────┤
│ On-chain     │ patient, grantee, rootCidHash,    │ Ai cũng đọc metadata (audit)│
│ ConsentLedger│ encKeyHash (HASH), expireAt,      │ nhưng không có khóa thật    │
│              │ allowDelegate                     │                             │
├──────────────┼───────────────────────────────────┼─────────────────────────────┤
│ Off-chain    │ encryptedPayload = NaCl box bọc   │ CHỈ recipient (có NaCl      │
│ KeyShare(DB) │ {cid, aesKey}                     │ secret key) — backend KHÔNG │
├──────────────┼───────────────────────────────────┼─────────────────────────────┤
│ IPFS         │ AES-GCM ciphertext của FHIR       │ Cần aesKey (nằm trong       │
│              │                                   │ encryptedPayload trên)      │
└──────────────┴───────────────────────────────────┴─────────────────────────────┘
```

Nếu DB bị lộ → attacker chỉ có ciphertext NaCl + hash. Nếu chain bị lộ → chỉ có metadata + hash, không có khóa.

---

## 1. Hai mức chia sẻ (`shareType`) → cờ on-chain

UI hiện chỉ còn **2** giá trị `shareType` (lưu ý: CLAUDE.md nói 3 mức `read-only/read-update/read-delegate` — đã **stale**, code thực tế chỉ có 2):

```ts
type ShareType = 'read-update' | 'read-delegate';
const [shareType, setShareType] = useState<ShareType>('read-update');
```
Nguồn: `mobile/src/screens-v2/RecordDetailScreen.tsx:222-223`.

| `shareType` (UI) | `allowDelegate` (on-chain) | Ngữ nghĩa |
|---|---|---|
| `read-update` (mặc định) | `false` | Người nhận đọc hồ sơ + tự động thấy các phiên bản mới của cùng chuỗi. KHÔNG chia sẻ lại được. |
| `read-delegate` | `true` | Như trên + người nhận được phép **chia sẻ lại** record cho người thứ 3 (qua `grantUsingRecordDelegation`). |

Cách map trong code (cả on-chain lẫn dòng KeyShare đều dùng cùng 1 cờ):

```js
allowDelegate: shareType === 'read-delegate',   // gọi grantConsentOnChain
...
const allowDelegateFlag = shareType === 'read-delegate';  // ghi vào KeyShare
```
Nguồn: `mobile/src/screens-v2/RecordDetailScreen.tsx:362` và `:393`.

> **Lưu ý về quyền hiển thị tùy chọn delegate:** ô chọn `read-delegate` chỉ hiện khi `isRecordOwner` (đúng chủ hồ sơ) — tham số `showDelegateOption={isRecordOwner}` truyền vào ShareModal (`mobile/src/screens-v2/RecordDetailScreen.tsx:1079`). Bác sĩ re-share đi theo nhánh khác (`delegateOnChain`, mục 6).

> **Không còn `includeUpdates`:** type EIP-712 đã **bỏ** field `includeUpdates` (chú thích "medical episode model" tại `mobile/src/utils/eip712.js:20-32`). Bây giờ 1 consent lưu ở **root của chuỗi record** nên mặc nhiên phủ mọi version.

---

## 2. Sơ đồ luồng end-to-end (patient → bác sĩ)

```
 PATIENT (mobile)                BACKEND (Express)              CHAIN / DB / IPFS
 ─────────────────              ──────────────────             ──────────────────
 RecordDetailScreen
   handleShare()
     │  validate địa chỉ ví 0x… (regex)
     │  authService.getEncryptionKey(addr) ──► GET pubkey người nhận
     │  fetchGrantContext(addr) ───────────► GET /api/relayer/grant-context
     │                                          → trả nonce, isDoctor,
     │                                            isVerifiedDoctor, quota
     │  (cảnh báo nếu không phải BS / BS chưa verify / downgrade)
     ▼
   performShare()
     │  resolveLocalKey() → lấy {cid, aesKey} từ local (hoặc self-share)
     │
     │  consentService.grantConsentOnChain():
     │    cidHash    = keccak256(cid)
     │    encKeyHash = keccak256(aesKey)
     │    signGrantConsent()  ── BIOMETRIC GATE ──► chữ ký EIP-712
     │    │                                         (ConsentPermit)
     │    └─ withSelfPayFallback:
     │         POST /api/relayer/grant ───────────► sponsorGrantConsent()
     │                                                 consumeQuota('grant')
     │                                                 sponsorWrite →
     │                                                   ConsentLedger.grantBySig()
     │                                                     verify sig == patient
     │                                                     _grantConsent():
     │                                                       root = walkToRoot(cid)
     │                                                       key  = keccak256(
     │                                                         patient,grantee,root)
     │                                                       _consents[key] = Consent{…}
     │                                                       emit ConsentGranted
     │         (nếu hết quota → 429 → patient TỰ nộp grantBySig, tự trả gas)
     │
     │  encryptForRecipient({cid,aesKey}, recipientPubKey)  ◄ NaCl box
     │  keyShareService.shareKey() ───────────────► POST /api/key-share
     │                                                 checkConsent (on-chain) gate
     │                                                 applyShare() → KeyShare row
     │
     │  CASCADE: với mỗi version khác trong chuỗi → shareKey() lần nữa
     ▼
   Alert "Chia sẻ thành công" (+ số chữ ký miễn phí còn lại)
```

Toàn bộ orchestration nằm ở `performShare` (`mobile/src/screens-v2/RecordDetailScreen.tsx:292-480`) và `handleShare` (`:485-628`).

---

## 3. Bước 1 — UI: tiền kiểm tra trước khi chia sẻ (`handleShare`)

`handleShare` (`mobile/src/screens-v2/RecordDetailScreen.tsx:485-628`) làm các bước:

1. **Validate địa chỉ ví:** phải khớp regex `^0x[a-fA-F0-9]{40}$`, nếu không → Alert (`:491-497`).
2. **Lấy public key người nhận:** `authService.getEncryptionKey(address)`; nếu chưa đăng ký khóa → chặn, báo "Người nhận chưa đăng ký" (`:503-514`).
3. **Lấy ngữ cảnh grant:** `consentService.fetchGrantContext(address)` (`:518`).
4. **Cảnh báo theo vai trò người nhận:**
   - Không phải bác sĩ (`!ctx.isDoctor`) → hỏi xác nhận "Vẫn chia sẻ?" (`:521-534`).
   - Bác sĩ nhưng chưa xác minh (`ctx.isDoctor && !ctx.isVerifiedDoctor`) → cảnh báo "Hồ sơ chỉ đọc được sau khi họ được xác minh" (`:536-552`).
5. **Chặn "downgrade":** nếu người nhận đã có quyền cao hơn (đang `allowDelegate=true` mà nay định hạ xuống, hoặc thời hạn cũ dài hơn), yêu cầu **thu hồi trước rồi chia sẻ lại** (`:554-603`). Dữ liệu so sánh lấy từ `keyShareService.getRecordRecipients` (đã cross-check bảng Consent on-chain, backend tại `keyShare.routes.js:1156-1192`).
6. Đạt hết → gọi `performShare(address, recipientPub)` (`:605`).

Lỗi được phân loại: hết quota → "Hết lượt miễn phí", còn lại → `formatChainError` (`:606-627`).

---

## 4. Bước 2 — Ký EIP-712 + grant on-chain (`grantConsentOnChain`)

Hàm `grantConsentOnChain` (`mobile/src/services/consent.service.js:128-191`):

1. **Lấy nonce + trạng thái + quota:** `GET /api/relayer/grant-context?grantee=…` (`:138`). Backend đọc `nonces[patient]`, `isDoctor(grantee)`, `isVerifiedDoctor(grantee)` từ chain + quota DB (`backend/src/services/relayer.service.js:736-780`).
2. **Tính field EIP-712:** `cidHash = computeCidHash(cid)`, `encKeyHash = computeEncKeyHash(aesKey)`, `expireAt` (giây; 0 = vĩnh viễn), `deadline = getDeadline(1)` (1 giờ) (`:142-145`).
3. **Patient ký `ConsentPermit`** bằng `signGrantConsent` (`:148-157`).
4. **Nộp on-chain với fallback tự trả gas:** `withSelfPayFallback` (`:162-178`).

### 4.1. Cấu trúc thông điệp EIP-712 (`signGrantConsent`)

Domain (`mobile/src/utils/eip712.js:12-17`): `name='EHR Consent Ledger'`, `version='2'`, `chainId`, `verifyingContract = CONSENT_LEDGER_ADDRESS`.

Type `ConsentPermit` (`mobile/src/utils/eip712.js:21-32`):

| Field | Type |
|---|---|
| `patient` | address |
| `grantee` | address |
| `rootCidHash` | bytes32 |
| `encKeyHash` | bytes32 |
| `expireAt` | uint256 |
| `allowDelegate` | bool |
| `deadline` | uint256 |
| `nonce` | uint256 |

Chữ ký được tạo bằng `walletClient.signTypedData(...)` với `account` cục bộ (ký offline, **không** qua RPC vì Arbitrum không hỗ trợ `eth_signTypedData_v4`) — `mobile/src/utils/eip712.js:84-116`.

> **Biometric gate = "ký pháp lý":** ngay trước khi ký, `gateOrThrow('Để cấp quyền truy cập hồ sơ y tế')` bắt xác thực sinh trắc (TT 13/2025) — `mobile/src/utils/eip712.js:104-107`. Chữ ký ECDSA của Web3Auth là primitive kỹ thuật; biometric là sự kiện ký mà người dùng nhìn thấy.

> **Nonce dùng chung:** `nonce` này dùng chung slot `nonces[patient]` với `DelegationPermit` và `TrustedContactPermit` (`mobile/src/utils/eip712.js:37-38, 52-53`).

### 4.2. Ai trả gas? (sponsor hoặc self-pay)

`withSelfPayFallback` (`mobile/src/utils/selfPayFallback.js:43-75`):

- **Đường chính (sponsor):** gọi `POST /api/relayer/grant`; backend `sponsorGrantConsent` consume 1 lượt quota rồi nộp `grantBySig` bằng **ví sponsor của backend** (user không tốn gas).
- **Đường fallback (self-pay):** nếu backend trả `QUOTA_EXHAUSTED` (HTTP 429) → mobile tự nộp **cùng chữ ký đó** qua `walletClient.writeContract(grantBySig)` từ ví Web3Auth của chính user, user tự trả ETH. Được vì `grantBySig` xác thực bằng **chữ ký** chứ không bằng `msg.sender` (recover signer rồi `require signer == patient` — `contracts/src/ConsentLedger.sol:267-269`).
- Nếu ví user không có ETH (`balance === 0n`) → ném lỗi `NO_ETH_FOR_SELF_PAY` với thông điệp rõ ràng (`selfPayFallback.js:62-69`).

Quota: 100 lượt/tháng, atomic reserve để không vượt cap (`backend/src/services/relayer.service.js:266-307`). Self-pay **không** tốn quota (relayer ném lỗi trước khi nộp) — phản ánh ở `signaturesRemaining` (`mobile/src/services/consent.service.js:186-189`).

### 4.3. Backend relayer (`POST /api/relayer/grant`)

Route: `backend/src/routes/relayer.routes.js:311-335` — middleware `authenticate`, `sponsoredWriteLimit`, `requirePatientRole`; parse `grantSchema`; gọi `relayerService.sponsorGrantConsent(...)`.

Service `sponsorGrantConsent` (`backend/src/services/relayer.service.js:496-537`):
- `consumeQuota(patient, 'grant')` (`:509`),
- `sponsorWrite` gọi `ConsentLedger.grantBySig` với args `[patient, grantee, cidHash, encKeyHash, expireAt, allowDelegate, deadline, signature]` (`:511-528`),
- đợi receipt, trả `{ txHash, receipt }`.

---

## 5. Bước 3 — Contract: `grantBySig` → `_grantConsent`

### 5.1. `grantBySig` (`contracts/src/ConsentLedger.sol:239-281`)

```
- Kiểm tra block.timestamp <= deadline  (DeadlinePassed)        :249
- rootCidHash != 0                       (EmptyCID)              :250
- Lấy currentNonce = nonces[patient]                            :252
- structHash = keccak256(abi.encode(CONSENT_PERMIT_TYPEHASH, …))  :254-264
- digest = _hashTypedDataV4(structHash); signer = recover(sig)  :266-267
- require signer == patient              (InvalidSignature)     :269
- nonces[patient] = currentNonce + 1     (chống replay)         :271
- _grantConsent(patient, grantee, rootCidHash, encKeyHash, expireAt, allowDelegate)  :273-280
```

`CONSENT_PERMIT_TYPEHASH` định nghĩa tại `contracts/src/ConsentLedger.sol:25` (khớp 8 field type ở mobile).

### 5.2. `_grantConsent` (`contracts/src/ConsentLedger.sol:283-335`) — nơi tạo Consent key

```
- grantee != 0; inputCidHash != 0; nếu expireAt!=0 thì phải > now (InvalidExpire)  :291-293
- root = _walkToRoot(inputCidHash)   ← chuẩn hóa về ROOT của chuỗi record         :298
- consentKey = keccak256(abi.encode(patient, grantee, root))                       :299
- finalExpiry = expireAt == 0 ? FOREVER : expireAt                                 :301
- _consents[consentKey] = Consent{ patient, grantee, rootCidHash:root, encKeyHash,
                                    issuedAt, expireAt:finalExpiry, active:true,
                                    allowDelegate }                                 :304-313
- clear recordDelegationSource[consentKey] = 0   (footgun fix #1)                  :322
- clear consentDelegationSource / consentDelegatorEpochAtGrant                     :331-332
- emit ConsentGranted(patient, grantee, root, finalExpiry, allowDelegate)          :334
```

**Consent key = `keccak256(abi.encode(patient, grantee, root))`** (`:299`) — đây chính là câu "key = keccak256(patient, grantee, rootCidHash)". Vì lưu ở `root` (đã `_walkToRoot`), một consent duy nhất phủ mọi version trong chuỗi → bỏ được `includeUpdates`.

### 5.3. `struct Consent` (`contracts/src/interfaces/IConsentLedger.sol:15-24`)

| Field | Type | Ghi chú |
|---|---|---|
| `patient` | address | chủ hồ sơ |
| `grantee` | address | người được cấp |
| `rootCidHash` | bytes32 | root chuỗi record (đã walk) |
| `encKeyHash` | bytes32 | HASH của aesKey (không phải khóa) |
| `issuedAt` | uint40 | thời điểm cấp |
| `expireAt` | uint40 | hết hạn (FOREVER nếu 0) |
| `active` | bool | còn hiệu lực |
| `allowDelegate` | bool | cho re-share không |

> On-chain **không** có `cid` plaintext, **không** có `aesKey` — chỉ có `encKeyHash`. Đây là điểm cốt lõi bảo mật của luận văn.

---

## 6. Bước 4 — Tạo dòng KeyShare (off-chain, mã hóa tới người nhận)

Sau khi grant on-chain, mobile bọc khóa và gửi backend (`mobile/src/screens-v2/RecordDetailScreen.tsx:391-402`):

```js
const payload = JSON.stringify({ cid: local.cid, aesKey: local.aesKey });
const encryptedPayload = encryptForRecipient(payload, recipientPubKey, myKeypair.secretKey);
await keyShareService.shareKey({
    cidHash, recipientAddress, encryptedPayload,
    senderPublicKey: myKeypair.publicKey,
    expiresAt, allowDelegate: allowDelegateFlag,
});
```

- `encryptForRecipient` = **NaCl box**: random nonce + `nacl.box(message, nonce, recipientPubKey, senderSecretKey)`, trả `{nonce, ciphertext}` base64 (`mobile/src/services/nacl-crypto.js:27-39`). Chỉ người nhận (có secret key) mở được bằng `decryptFromSender` (`:41-62`).
- `shareKey` → `POST /api/key-share` với `senderPublicKey` để sau này người nhận giải mã (`mobile/src/services/keyShare.service.js:13-22`).

### 6.1. Backend `POST /api/key-share` — gate consent + ghi row

Route `backend/src/routes/keyShare.routes.js:85-359`:
- Parse `createKeyShareSchema` (`:58-65`).
- Xác định vai trò: nếu sender là **creator** → bypass (`:108-110`); nếu là **owner (patient)** → **bắt buộc có consent on-chain** cho recipient qua `checkConsent(owner, recipient, cidHash)` (có thêm fallback inheritance theo chuỗi cha/con) (`:113-178`); nếu là **grantee re-share** → sender phải có consent (`:181-214`). Không đạt → 403.
- **Chỉ Owner/Creator mới được set `allowDelegate=true`** (`:217`).
- Ghi row qua `applyShare(...)` với `status='pending'` (hoặc `claimed` nếu self-share/kế thừa), `expiresAt`, `allowDelegate` (`:303-316`).
- Ghi `AccessLog action='SHARE_KEY'` (`:319-326`), emit socket `record:shared` + push notification cho người nhận (`:337-354`).

### 6.2. Cascade — chia sẻ mọi version trong chuỗi

Sau dòng KeyShare chính, `performShare` lặp qua **các version khác** của chuỗi (lấy từ `recordService.getChainCids`) và `shareKey` cho từng cái với cùng `recipientPubKey/expiresAt/allowDelegateFlag` (`mobile/src/screens-v2/RecordDetailScreen.tsx:404-454`). Version nào không có khóa cục bộ → đưa vào `cascadeSkipped`; lỗi gửi → `cascadeFailures`; báo "Chia sẻ một phần" nếu có (`:471-479`).

### 6.3. Nhánh bác sĩ re-share (`delegateOnChain`) — KHÁC nhánh patient

Khi người chia sẻ **không phải owner** (bác sĩ có `allowDelegate`), `performShare` đi nhánh `delegateOnChain` thay vì `grantConsentOnChain` (`mobile/src/screens-v2/RecordDetailScreen.tsx:356-389`):

- Gọi trực tiếp `ConsentLedger.grantUsingRecordDelegation(patient, grantee, rootCidHash, encKeyHash, requestedExpireAtSec)` (`mobile/src/services/consent.service.js:72-84`).
- **`msg.sender` phải = bác sĩ A** → KHÔNG dùng relayer (relayer sẽ thành sender) → bác sĩ **tự trả gas** (`consent.service.js:14-17`).
- Có biometric gate riêng (`gateOrThrow('Để uỷ quyền hồ sơ cho bác sĩ khác')` — `consent.service.js:67`).
- Contract **âm thầm cap** thời hạn của B xuống ≤ thời hạn của A (FIX audit #8 — `contracts/src/ConsentLedger.sol:634-642`); sau tx, hàm **đọc lại** `getConsent` để lấy `actualExpireAtSec` thật → UI cảnh báo nếu bị rút ngắn (`consent.service.js:88-114`, hiển thị `clampWarn` ở `RecordDetailScreen.tsx:462-467`).

---

## 7. Mặt người nhận (đọc hồ sơ) — để hiểu vì sao chia sẻ "đủ"

Khi bác sĩ mở hồ sơ (`handleDecrypt`, `mobile/src/screens-v2/RecordDetailScreen.tsx:633-694`):

1. Gọi `decodeSharedKeyPayload` → `keyShareService.getKeyForRecord(cidHash)` = `GET /api/key-share/record/:cidHash` (`mobile/.../RecordDetailScreen.tsx:232-277`, `keyShare.service.js:48-50`).
2. **Backend gate `canAccess`:** route `GET /record/:cidHash` tìm KeyShare còn hiệu lực; nếu requester không phải owner/creator thì gọi `checkConsent(owner, requester, cidHash)` (đọc `ConsentLedger.canAccess`). Fail → 403 (`CONSENT_REVOKED` / `DOCTOR_NOT_VERIFIED`), có bypass cho Trusted Contact (`backend/src/routes/keyShare.routes.js:1203-1346`).
3. Mobile lấy `encryptedPayload + senderPublicKey`, giải bằng NaCl secret key của mình (`decryptFromSender`) → ra `{cid, aesKey}` (`RecordDetailScreen.tsx:250-276`).
4. Tải ciphertext từ IPFS theo `cid`, `importAESKey(aesKey)` + `decryptData` (AES-GCM) → nội dung FHIR (`RecordDetailScreen.tsx:664-677`).

→ Nghĩa là: grant on-chain cho phép **vượt cổng** `canAccess`; KeyShare cung cấp **cái khóa** để giải mã thật. Thiếu một trong hai thì không đọc được.

---

## 8. Ai trả gas / ai mã hóa / ai đọc được gì (tóm tắt)

| Hành động | Ai trả gas | Dữ liệu mã hóa | Ai đọc được |
|---|---|---|---|
| Patient grant (`grantBySig`) | Sponsor (backend); hết quota → patient tự trả | On-chain chỉ có HASH (`encKeyHash`) | Metadata public; khóa không lộ |
| Tạo KeyShare | Không (off-chain DB) | `encryptedPayload` = NaCl box `{cid,aesKey}` | CHỈ recipient (có NaCl secret key) |
| Bác sĩ re-share (`grantUsingRecordDelegation`) | Bác sĩ A tự trả (msg.sender phải đúng) | như trên | recipient mới |
| Nội dung hồ sơ (IPFS) | — | AES-GCM ciphertext | ai có `aesKey` (từ KeyShare) |

---

## 9. Sai khác so với CLAUDE.md (đã verify bằng code)

- CLAUDE.md ghi **3** `shareType` gồm `read-only`; code v2 chỉ có **2** (`read-update`, `read-delegate`) — `mobile/src/screens-v2/RecordDetailScreen.tsx:222-223`.
- CLAUDE.md mô tả `includeUpdates` trong consent/EIP-712; thực tế đã **bỏ** field này (medical episode model) — `mobile/src/utils/eip712.js:20-32`, contract `_grantConsent` không còn dùng — `contracts/src/ConsentLedger.sol:295-297`.
- File màn hình thực thi là `mobile/src/screens-v2/RecordDetailScreen.tsx` (bản v2), không phải `mobile/src/screens/RecordDetailScreen.tsx` mà CLAUDE.md trỏ tới.
- ⚠️ **Chưa kiểm chứng:** consent key dùng `abi.encode` (không phải `abi.encodePacked`) — đã xác minh ở `ConsentLedger.sol:299`; nhưng các hàm delegation khác (`grantUsingRecordDelegation` chi tiết internal) chỉ đọc lướt, nếu cần trình bày sâu nên mở `ConsentLedger.sol:614-662` (cap audit #8 cụ thể ở `:634-642`).

---

## Nguồn đã đọc

- `mobile/src/screens-v2/RecordDetailScreen.tsx` (handleShare, performShare, handleDecrypt, shareType, ShareModal props)
- `mobile/src/services/consent.service.js` (grantConsentOnChain, delegateOnChain, fetchGrantContext, revokeConsent)
- `mobile/src/utils/eip712.js` (signGrantConsent, CONSENT_PERMIT_TYPES, EIP712_DOMAIN, computeCidHash, computeEncKeyHash, getDeadline)
- `mobile/src/utils/selfPayFallback.js` (withSelfPayFallback, isQuotaExhausted)
- `mobile/src/services/keyShare.service.js` (shareKey, getKeyForRecord, getRecordRecipients)
- `mobile/src/services/nacl-crypto.js` (encryptForRecipient, decryptFromSender)
- `backend/src/routes/keyShare.routes.js` (POST /api/key-share, GET /record/:cidHash, GET /recipients/:cidHash)
- `backend/src/routes/relayer.routes.js` (GET /grant-context, POST /grant)
- `backend/src/services/relayer.service.js` (sponsorGrantConsent, getGrantContext, consumeQuota, getQuotaStatus)
- `contracts/src/ConsentLedger.sol` (grantBySig, _grantConsent, CONSENT_PERMIT_TYPEHASH)
- `contracts/src/interfaces/IConsentLedger.sol` (struct Consent)
