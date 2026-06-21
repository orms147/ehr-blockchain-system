# Chức năng — Yêu cầu truy cập 2 bên (EHRSystemSecure)

## Tóm tắt 30 giây

Khi một **bác sĩ** (hoặc tổ chức) muốn xem hồ sơ của một **bệnh nhân**, họ không tự cấp quyền cho mình được. Thay vào đó họ gọi `requestAccess` trên contract `EHRSystemSecure` → tạo ra một "đơn xin truy cập" (`AccessRequest`) ở trạng thái `Pending`. Đơn này chỉ hoàn tất khi **CẢ HAI BÊN** xác nhận (bác sĩ + bệnh nhân), cách nhau tối thiểu 15 giây (`MIN_APPROVAL_DELAY`). Bệnh nhân thường xác nhận bằng **chữ ký EIP-712** (ký off-chain, không cần ETH) qua `confirmAccessRequestWithSignature`. Khi đủ 2 phía, contract gọi `_completeRequest` → mint consent thật trên `ConsentLedger` theo 1 trong 3 loại quyền (`RequestType`). Bệnh nhân cũng có thể **từ chối** (`rejectRequest` / `rejectRequestBySig`).

Đây là một trong những "khoảnh khắc đồng ý" (consent moment) quan trọng nhất của hệ thống: quyền đọc hồ sơ y tế được trao chỉ khi chủ hồ sơ ký xác nhận.

> Nguồn enum & struct: `contracts/src/interfaces/IEHRSystemSecure.sol:9-22` (lưu ý: tên file là `IEHRSystemSecure.sol` nhưng interface khai báo bên trong thực tế là `interface IEHRSystem` — `:8`).

---

## 1. Khái niệm nền (cho người chưa quen backend/mobile)

Trước khi đọc luồng, cần nắm vài khái niệm:

| Khái niệm | Giải thích ngắn |
|---|---|
| **EIP-712 (typed-data signature)** | Một chuẩn cho phép ký một *cấu trúc dữ liệu có ý nghĩa* (không phải hash mù). Ví khi ký sẽ hiển thị rõ "bạn đang xác nhận request nào, cho ai, hồ sơ nào". Chữ ký này có thể được người khác (relayer) đem lên chain broadcast giúp → người ký KHÔNG cần có ETH trả gas. |
| **Relayer / sponsor (gas sponsorship)** | Backend giữ một ví có ETH. Khi bệnh nhân ký off-chain, backend đem chữ ký đó lên chain và **tự trả phí gas** thay bệnh nhân. Đây là lý do bệnh nhân từ chối/duyệt mà không cần nạp ETH. |
| **`cidHash`** | Hồ sơ y tế thật nằm trên IPFS, định danh bằng "CID" (chuỗi). On-chain KHÔNG bao giờ lưu CID plaintext — chỉ lưu `keccak256(bytes(cid))` = `cidHash` (`contracts/src/EHRSystemSecure.sol:17-20`). |
| **`KeyShare` (off-chain)** | Bản ghi trong Postgres chứa "khoá đã mã hoá" để người nhận giải mã hồ sơ. Backend giữ nó nhưng KHÔNG đọc được (chỉ người nhận có khoá NaCl mới mở được). |
| **Consent vs Request** | *Request* = đơn xin (state machine 2 bên duyệt, sống trong `EHRSystemSecure`). *Consent* = quyền truy cập thật (sống trong `ConsentLedger`). Request hoàn tất → mới sinh ra Consent. |

---

## 2. State machine của một AccessRequest

Trạng thái on-chain (`enum RequestStatus`, `contracts/src/interfaces/IEHRSystemSecure.sol:10`):

```
Pending(0) → RequesterApproved(1) ─┐
          → PatientApproved(2)  ───┤→ (đủ 2 bên + chờ ≥15s) → Completed(3)
                                    │
          (bất kỳ lúc nào còn hạn) → Rejected(4)
```

Sơ đồ chi tiết: ai bấm gì, gọi hàm nào.

```
   BÁC SĨ (requester)                         BỆNH NHÂN (patient)
   ─────────────────                          ───────────────────
   requestAccess(...)
   tạo AccessRequest = Pending
   emit AccessRequested
        │
        │  (đơn hiện trên app bệnh nhân)
        ▼
   confirmAccessRequest  ───────►  status = RequesterApproved
   (DEV: tự gọi sau 17s)           firstApprovalTime = now
                                           │
                                           ▼
                              confirmAccessRequestWithSignature
                              (bệnh nhân ký EIP-712, relayer broadcast)
                                           │
                                  now ≥ firstApprovalTime + 15s ?
                                           │ có
                                           ▼
                                   _completeRequest
                                   → ConsentLedger.grant*  (mint quyền)
                                   status = Completed
                                   emit RequestCompleted
```

Lưu ý thứ tự 2 phía là **linh hoạt**: bệnh nhân có thể duyệt trước (→ `PatientApproved`), sau đó bác sĩ duyệt phần mình để hoàn tất. Logic xử lý cả 2 chiều ở `_processConfirmation` (`contracts/src/EHRSystemSecure.sol:182-225`).

---

## 3. Phía contract — `EHRSystemSecure.sol` (sơ bộ từng hàm)

Người đọc rành Solidity, nên đây chỉ điểm danh từng hàm + điều đáng chú ý.

### 3.1 `requestAccess(patient, rootCidHash, reqType, encKeyHash, consentDurationHours, validForHours)`
`contracts/src/EHRSystemSecure.sol:77-174`

- Validate: không tự xin (`msg.sender == patient` revert), patient phải `isPatient` (`:86-89`).
- **Audit P1 (2026-05-26)**: requester PHẢI là `isDoctor` HOẶC `isOrganization` cho MỌI `RequestType` (trước đây chỉ FullDelegation mới check) — chặn EOA bất kỳ spam/phishing request (`:101-110`).
- Ràng buộc `rootCidHash` theo loại (`:113-117`):
  - `DirectAccess` / `RecordDelegation` → `rootCidHash` phải khác `bytes32(0)`.
  - `FullDelegation` → `rootCidHash` PHẢI là `bytes32(0)` (không gắn hồ sơ cụ thể).
- `reqId = keccak256(abi.encode(msg.sender, patient, rootCidHash, reqType, _requestNonce++))` (`:119-125`).
- Tính `expiry` (hạn của ĐƠN) và `consentDuration` (hạn của QUYỀN sau khi duyệt). Default consent: `DirectAccess`→30 ngày, còn lại→365 ngày (`:131-135`). FullDelegation < 1 ngày bị từ chối (`:148-150`).
- Lưu `_accessRequests[reqId]`, `status = Pending`, emit `AccessRequested` (`:154-173`).

### 3.2 `confirmAccessRequest(reqId)` + `_processConfirmation(reqId, approver)`
`contracts/src/EHRSystemSecure.sol:178-225`

- Người gọi phải là `requester` HOẶC `patient`, ngược lại revert `NotParty` (`:190`).
- Approval đầu tiên (đang `Pending`): set `RequesterApproved` hoặc `PatientApproved` + ghi `firstApprovalTime` + emit event tương ứng (`:196-207`).
- Approval thứ hai (đủ 2 phía): kiểm `now ≥ firstApprovalTime + MIN_APPROVAL_DELAY (15s)`, nếu sớm quá revert `ApprovalTooSoon` (`:220-222`), rồi gọi `_completeRequest` (`:224`).

### 3.3 `confirmAccessRequestWithSignature(reqId, deadline, signature)` — EIP-712
`contracts/src/EHRSystemSecure.sol:233-264`

- Check `deadline` trước (`:239`).
- Dựng `structHash` từ `CONFIRM_TYPEHASH` với FULL context: `reqId, requester, patient, rootCidHash, reqType, deadline` (`:248-256`). Đây là dữ liệu ví bệnh nhân nhìn thấy khi ký.
- `signer = ECDSA.recover(...)`, **bắt buộc `signer == req.patient`** (`:259-261`) → chỉ bệnh nhân mới được duyệt-bằng-chữ-ký (bác sĩ vẫn phải tự gọi `confirmAccessRequest`).
- Gọi `_processConfirmation(reqId, signer)`.
- `CONFIRM_TYPEHASH` định nghĩa ở `:26-28`; domain = `EIP712("EHR System Secure", "2")` (`:56`).

### 3.4 `rejectRequest(reqId)` và `rejectRequestBySig(reqId, deadline, signature)`
`contracts/src/EHRSystemSecure.sol:266-320`

- `rejectRequest`: `msg.sender` phải là requester hoặc patient → set `Rejected`, emit `RequestRejected` (`:266-277`).
- `rejectRequestBySig`: phiên bản **sponsored** — relayer broadcast, signer (recover từ chữ ký) phải là patient HOẶC requester (`:313-315`). Event ghi `signer` (không phải relayer) để giữ ý nghĩa audit về ai thực sự từ chối (`:319`). `REJECT_TYPEHASH` ở `:32-34`.

### 3.5 `_completeRequest(reqId, req)` — nơi mint consent thật
`contracts/src/EHRSystemSecure.sol:324-365`

Đây là điểm nối Request → Consent. Tuỳ `reqType`:

| `RequestType` | Hàm gọi trên ConsentLedger | Tham số cờ | Ngữ nghĩa |
|---|---|---|---|
| `DirectAccess` (0) | `grantInternal(patient, requester, rootCidHash, encKeyHash, expireAt, false)` (`:332-339`) | `allowDelegate = false` | Đọc 1 hồ sơ (+ version cùng root). KHÔNG re-share. |
| `RecordDelegation` (2) | `grantInternal(..., true)` (`:341-348`) | `allowDelegate = true` | Đọc 1 hồ sơ + được chia sẻ lại cho người thứ 3. |
| `FullDelegation` (1) | `grantDelegationInternal(patient, requester, consentDuration, true)` (`:351-356`) | `allowSubDelegate = true` | Uỷ quyền BULK toàn bộ hồ sơ của patient. |

Sau đó `status = Completed`, emit `RequestCompleted` (`:325, :359-364`).

> Chữ ký 2 hàm đích đã verify: `grantInternal(patient, grantee, rootCidHash, encKeyHash, expireAt, allowDelegate)` ở `contracts/src/ConsentLedger.sol:214-221`; `grantDelegationInternal(patient, delegatee, duration, allowSubDelegate)` ở `contracts/src/ConsentLedger.sol:388-395`.

> ⚠️ **Bẫy thứ tự enum**: trong code, giá trị số là `DirectAccess=0, FullDelegation=1, RecordDelegation=2` (`contracts/src/interfaces/IEHRSystemSecure.sol:9`). FullDelegation đứng GIỮA (=1), KHÔNG phải cuối. Backend mirror đúng giá trị này (`backend/src/constants/contractEnums.js:7-11`).

### 3.6 Hằng số & view
`getSystemConstants` trả `MIN_APPROVAL_DELAY=15s`, `MAX_REQUEST_VALIDITY=30 days`, `DEFAULT_CONSENT_DURATION=30 days`, `MAX_DELEGATION_DURATION=365 days` (`contracts/src/EHRSystemSecure.sol:46-49, 390-402`).

---

## 4. Luồng end-to-end (mobile → service → backend → contract → DB)

### 4.1 Bác sĩ gửi yêu cầu

**(1) UI mobile — màn `DoctorRequestAccessScreen`**
`mobile/src/screens-v2/doctor/DoctorRequestAccessScreen.tsx`

Bác sĩ nhập: địa chỉ ví bệnh nhân, `cidHash` hồ sơ (trống nếu FullDelegation), chọn 1 trong 3 "Loại quyền", chọn thời hạn. Ánh xạ UI → `reqType` (`:104-129`):

| Lựa chọn UI | `reqType` |
|---|---|
| "Đọc và cập nhật hồ sơ" (`rw`) | 0 = DirectAccess |
| "Đọc và chia sẻ lại" (`rsh`) | 2 = RecordDelegation |
| "Uỷ quyền toàn bộ hồ sơ" (`full`) | 1 = FullDelegation |

Khi bấm "Ký và gửi yêu cầu" (`handleSubmit`, `:195-368`):
- Pre-check off-chain: không tự xin (`:202-205`), gọi `isPatient` trên `AccessControl` (`:209-227`).
- FullDelegation → ép `cidHash = bytes32(0)` (zeroHash) (`:243-244`).
- `gateOrThrow` = cổng sinh trắc học trước khi ký giao dịch (`:248`).
- `walletClient.writeContract(... functionName: 'requestAccess' ...)` — **bác sĩ TỰ TRẢ GAS** (không sponsor) (`:254-269`). `validForHours` hardcode = 24 (`:252`).
- Đọc `reqId` từ event `AccessRequested` trong receipt (`:271-302`).
- **(DEV-only)** sau 17s tự gọi `confirmAccessRequest` để duyệt phần "phía bác sĩ" cho tiện test; production thì bác sĩ duyệt rõ ràng hoặc fallback lúc claim (`:316-338`).

**(2) Mirror vào backend** — `POST /api/requests/create` (`:304-314`).

**(3) Route backend** — `backend/src/routes/request.routes.js:308-372`
- `requireDoctorRole` (`:309`). Lưu `AccessRequest` vào Postgres status `pending`, kèm `consentDurationHours`, `deadline` (`:342-354`).
- Gửi push notification tới bệnh nhân (fire-and-forget) (`:356-361`).

Ai trả gas: **bác sĩ** (write `requestAccess`). Dữ liệu nào mã hoá: chưa có payload ở bước này — mới chỉ là đơn xin.

### 4.2 Bệnh nhân duyệt (consent moment)

**(1) UI mobile — màn `RequestsScreen`** (`mobile/src/screens-v2/RequestsScreen.tsx`)
- `useRequests` hook tải danh sách qua `GET /api/requests/incoming` (`backend/src/routes/request.routes.js:91-153`).
- Bấm "Mở để ký" → ConsentSheet → `handleApprove` (`mobile/src/screens-v2/RequestsScreen.tsx:427-634`):
  - Pre-check: nếu bác sĩ **chưa verified** → cảnh báo "hồ sơ chỉ đọc được sau khi họ được xác minh" (`:435-451`).
  - Pre-check: cảnh báo "ghi đè quyền cũ" nếu quyền mới giảm cờ/thời hạn (`:453-495`).
  - `gateOrThrow` (sinh trắc học) TRƯỚC khi ký — Audit P0 (`:502`).
  - Lấy typed data: `getApprovalMessage` (`mobile/src/services/request.service.js:22-24`).
  - Ký EIP-712: `walletActionService.signTypedData(...)` (`:504-509`).
  - **Mã hoá khoá**: lấy public key NaCl của bác sĩ, encrypt `{cid, aesKey}` của hồ sơ cho bác sĩ (`encryptForRecipient`) → `encryptedKeyPayload` (`:541-556`).
  - **Cascade**: chuẩn bị payload mã hoá cho CÁC version KHÁC cùng chain để bác sĩ đọc được lịch sử (`:558-593`).
  - `approveWithSignature(reqId, signature, deadline, encryptedKeyPayload, cidHash, senderPublicKey, cascadePayloads)` (`:595-603`).

**(2) Service mobile** — `requestService.approveWithSignature` → `POST /api/requests/approve-with-sig` (`mobile/src/services/request.service.js:32-42`).

**(3) Route backend** — `POST /api/requests/approve-with-sig` (`backend/src/routes/request.routes.js:431-539`)
- `requirePatientRole`. Xác minh bệnh nhân sở hữu đơn + đơn đang `pending` (`:449-469`).
- Lưu chữ ký + `signatureDeadline`, đổi status DB → `signed`, stash `pendingCascadePayloads` (`:483-491`).
- Tạo `KeyShare` cho bác sĩ với status `awaiting_claim` (chưa active) — qua `applyShare` (`:511-529`). `allowDelegate` = (requestType === 2) (`:524`).

> Điểm tinh tế (S11.C, `:501-510`): bệnh nhân ký chỉ là "ý định". **Consent thật chỉ được mint khi bác sĩ gọi `confirmAccessRequestWithSignature` on-chain** → vì vậy `expiresAt`/`allowDelegate` được "hoãn" tới bước mark-claimed.

**(4) Bác sĩ claim on-chain** → `POST /api/requests/mark-claimed` (`backend/src/routes/request.routes.js:541-687`)
- Đổi status DB → `claimed`, flip `KeyShare` từ `awaiting_claim` → `pending` (active), set `expiresAt`/`allowDelegate` thật (`:557-604`).
- Apply các cascade payload đã stage → version khác cũng đọc được (`:606-649`).
- Phát hiện "bệnh nhân thu hồi sau duyệt nhưng trước claim" → trả code `REVOKED_AFTER_APPROVAL` (`:651-673`).

Ai trả gas ở bước duyệt: **bác sĩ**. `confirmAccessRequestWithSignature` được chính bác sĩ broadcast lúc claim (`mobile/src/screens-v2/doctor/DoctorDashboardScreen.tsx:301-311` → sau đó `markClaimed` `:336`); KHÔNG có đường sponsor/relayer cho hàm confirm (relayer chỉ sponsor reject). Bệnh nhân chỉ KÝ off-chain (không cần ETH). Dữ liệu mã hoá: `encryptedKeyPayload` (NaCl box `{cid, aesKey}` mã hoá bằng public key bác sĩ) — backend giữ nhưng không đọc được.

### 4.3 Bệnh nhân từ chối (sponsored — không tốn ETH)

`mobile/src/screens-v2/RequestsScreen.tsx:642-699` (`handleReject`):
1. `gateOrThrow` (`:663`).
2. `getRejectMessage(reqId)` → backend trả EIP-712 typed data (`mobile/src/services/request.service.js:52-54`; backend `GET /api/requests/:requestId/reject-message` `backend/src/routes/request.routes.js:695-745`, `REJECT_TYPEHASH` mirror `:721-739`).
3. Ký off-chain, POST `rejectWithSignature` → `POST /api/requests/:requestId/reject` (`mobile/src/services/request.service.js:58-64`).
4. Backend gọi `relayerService.sponsorReject(caller, requestId, deadline, signature)` (`backend/src/routes/request.routes.js:786-792`) → broadcast `rejectRequestBySig` bằng ví sponsor (`backend/src/services/relayer.service.js:821-844`).
5. Backend đồng bộ DB → `rejected`, dọn `KeyShare` `awaiting_claim` → `revoked` + xoá payload, notify bác sĩ (socket + push) (`:802-848`).

Ai trả gas: **backend relayer (sponsor)**. Bệnh nhân chỉ ký EIP-712.

---

## 5. Kết quả & cache

| Lớp | Lưu gì sau khi Completed |
|---|---|
| **On-chain ConsentLedger** | Consent thật (grantee, cidHash, expireAt, cờ allowDelegate / delegation bulk). Đây là nguồn chân lý cho quyền đọc. |
| **DB Postgres `AccessRequest`** | Mirror trạng thái: `pending → signed → claimed` (hoặc `rejected`). Map từ on-chain status: `backend/src/constants/contractEnums.js:43-49`. |
| **DB Postgres `KeyShare`** | Khoá đã mã hoá cho bác sĩ; `awaiting_claim` → `pending` (active) khi claim. |
| **Mobile UI** | Refresh danh sách qua `useRequests`; hiển thị pill trạng thái (`mobile/src/screens-v2/RequestsScreen.tsx:136-142`). |

Ai đọc được hồ sơ cuối cùng: chỉ **bác sĩ được cấp consent** — vì chỉ họ có NaCl secret key để mở `encryptedKeyPayload` → lấy `aesKey` → giải mã ciphertext FHIR trên IPFS. Backend không đọc được (blind mailbox).

---

## 6. Bảng tổng hợp "ai trả gas / ai ký"

| Hành động | Ai ký | Ai trả gas | Hàm contract |
|---|---|---|---|
| Tạo yêu cầu | Bác sĩ (tx) | **Bác sĩ** | `requestAccess` |
| Bác sĩ duyệt phần mình | Bác sĩ (tx) | Bác sĩ | `confirmAccessRequest` |
| Bệnh nhân duyệt | Bệnh nhân (EIP-712 off-chain) | **Bác sĩ broadcast (claim)** | `confirmAccessRequestWithSignature` |
| Bệnh nhân từ chối | Bệnh nhân (EIP-712 off-chain) | **Relayer (sponsor)** | `rejectRequestBySig` |
| Từ chối trực tiếp | Bác sĩ/bệnh nhân (tx) | Người gọi | `rejectRequest` |

---

## Nguồn đã đọc

- `contracts/src/EHRSystemSecure.sol` (toàn bộ, 1-413)
- `contracts/src/interfaces/IEHRSystemSecure.sol` (1-104)
- `contracts/src/ConsentLedger.sol` (grep `grantInternal` :214-221, `grantDelegationInternal` :388-395)
- `backend/src/routes/request.routes.js` (toàn bộ, 1-923)
- `backend/src/constants/contractEnums.js` (1-49)
- `backend/src/services/relayer.service.js` (`sponsorReject` :821-861)
- `mobile/src/services/request.service.js` (1-83)
- `mobile/src/screens-v2/RequestsScreen.tsx` (toàn bộ, 1-1025)
- `mobile/src/screens-v2/doctor/DoctorRequestAccessScreen.tsx` (toàn bộ, 1-686)
