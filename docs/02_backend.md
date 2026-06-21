# 02 — Backend (Node / Express / Prisma) cho người chưa biết backend

> Tài liệu onboarding. Đối tượng: lập trình viên smart-contract đã quen blockchain/Solidity nhưng **không biết backend**, **không biết mật mã**, **ít biết mobile**. Mục tiêu: đọc xong hiểu kiến trúc backend đủ để trình bày + trả lời hội đồng.
>
> Mọi khẳng định kỹ thuật đều kèm citation dạng `path:line` (đường dẫn tương đối từ gốc repo). Code là nguồn chân lý — nếu CLAUDE.md mâu thuẫn, tin code.

---

## Tóm tắt 30 giây

Backend là một **server HTTP** viết bằng Node.js + framework Express. Nó **KHÔNG phải nơi quyết định quyền truy cập** — quyền do smart contract `ConsentLedger.canAccess` quyết định. Backend đóng 3 vai:

1. **"Blind mailbox" (hòm thư mù)**: lưu các gói `encryptedPayload` đã mã hoá (chứa `{cid, aesKey}`) mà bản thân backend **không giải mã được**, chỉ trao đúng người nhận sau khi đã hỏi on-chain `canAccess` (`backend/src/routes/keyShare.routes.js:1273`).
2. **Gas relayer**: thay bệnh nhân trả phí gas khi gửi giao dịch on-chain (mỗi user 100 chữ ký/tháng) (`backend/src/services/relayer.service.js:21`).
3. **Cache + realtime**: đồng bộ sự kiện on-chain (qua subgraph) vào Postgres để mobile đọc nhanh, và đẩy thông báo realtime (Socket.io + push) (`backend/src/app.js:115`, `backend/src/services/socket.service.js:14`).

Database (Postgres) **chỉ là cache** — không bao giờ là cơ sở để cấp quyền.

---

## 1. Khái niệm nền (cho người chỉ biết smart contract)

Nếu bạn quen viết contract, hãy ánh xạ như sau:

| Khái niệm SC | Khái niệm backend tương đương |
|---|---|
| Contract = chương trình chạy trên EVM, ai gọi cũng được | **Backend server** = chương trình chạy trên 1 máy chủ, nghe các "cuộc gọi" qua mạng (HTTP) |
| `function foo(...) public` | **route / endpoint** = 1 đường dẫn URL + method (GET/POST/...) ánh xạ tới 1 hàm xử lý |
| `msg.sender` (ví đã ký giao dịch) | **`req.user.walletAddress`** = ví đã đăng nhập, lấy từ JWT |
| `require(msg.sender == owner)` | **middleware** chặn trước khi vào handler (vd `authenticate`, `requireOnChainRoles`) |
| `revert("...")` | trả về **HTTP status code** lỗi (401/403/404/500) + JSON `{ code, error, message }` |
| Storage on-chain (vĩnh viễn, public) | **Postgres** qua **Prisma** (riêng tư, có thể xoá/sửa) — đây là CACHE |
| `event Xxx(...)` + indexer | **3 worker sync** đọc event chain → ghi vào Postgres |

### HTTP API là gì
Client (app mobile) gửi một **request** gồm: method (GET = đọc / POST = tạo / DELETE = xoá...), một URL (vd `/api/records/my`), header (vd `Authorization: Bearer <token>`), và body (JSON). Server trả về một **response**: status code (200 OK, 401 chưa đăng nhập, 403 không đủ quyền, 404 không tìm thấy, 429 quá nhiều request) + body JSON.

### Route là gì
Một dòng kiểu `router.get('/my', authenticate, handler)` (`backend/src/routes/record.routes.js:518`) nghĩa là: "khi có GET tới `/api/records/my`, chạy `authenticate` trước, rồi chạy `handler`". `/api/records` là tiền tố được gắn ở `app.js` (`backend/src/app.js:83`).

### Middleware là gì
Hàm chạy **trước** handler chính, có thể chặn request hoặc bổ sung dữ liệu vào `req`. Chữ ký luôn là `(req, res, next)`: gọi `next()` để đi tiếp, hoặc `res.status(...).json(...)` để chặn. Giống `modifier` trong Solidity nhưng ghép nối tự do.

### Service là gì
Module chứa logic nghiệp vụ tái sử dụng, **không gắn vào HTTP**. Route gọi service. Vd route `/api/relayer/grant` gọi `relayerService.sponsorGrantConsent(...)` (`backend/src/routes/relayer.routes.js:315`).

### Prisma + Postgres
**Postgres** = cơ sở dữ liệu quan hệ (bảng, dòng, cột). **Prisma** = thư viện giúp viết truy vấn DB bằng JavaScript thay vì SQL thô, vd `prisma.user.findUnique({ where: { walletAddress } })` (`backend/src/middleware/auth.js:26`). Cấu trúc bảng định nghĩa trong `backend/prisma/schema.prisma`.

---

## 2. Vòng đời một request Express (sơ đồ)

```
   App mobile
       │  HTTP GET /api/records/my
       │  Header: Authorization: Bearer <JWT>
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Express app (backend/src/app.js)                             │
│                                                             │
│  1. helmet()         → set security headers   (app.js:55)   │
│  2. cors()           → kiểm tra origin        (app.js:60)   │
│  3. rateLimit (IP)   → tối đa 1000 req/15min  (app.js:66)   │
│  4. express.json()   → parse body JSON        (app.js:74)   │
│  5. router theo prefix /api/records           (app.js:83)   │
│        │                                                     │
│        ▼                                                     │
│   route handler: router.get('/my', authenticate, fn)        │
│        │                                                     │
│        ├─ middleware authenticate  (verify JWT, load user)  │
│        │     ↳ thất bại → res 401, dừng                     │
│        │                                                     │
│        ├─ [tuỳ route] requireOnChainRoles(...)              │
│        │     ↳ đọc role on-chain, thiếu quyền → res 403     │
│        │                                                     │
│        └─ handler chính: query Prisma / gọi service / RPC   │
│              ↳ res.json(...)  hoặc  next(err)               │
│                                                             │
│  6. errorHandler(err,...) ← bắt mọi next(err) (app.js:105)  │
└─────────────────────────────────────────────────────────────┘
       │  HTTP 200 + JSON  (hoặc 4xx/5xx + {code,error,message})
       ▼
   App mobile
```

Thứ tự đăng ký middleware toàn cục: `helmet` → `cors` → `rateLimit` → `express.json` (`backend/src/app.js:55-74`). `errorHandler` đăng ký **cuối cùng** (`backend/src/app.js:105`) nên nó hứng mọi lỗi được `next(error)` ném ra từ route.

> Một chi tiết quan trọng ngay dòng đầu `app.js`: `BigInt.prototype.toJSON` được patch để serialize BigInt thành chuỗi, vì Prisma có cột BigInt (vd `Delegation.epoch`) mà `res.json()` mặc định không serialize được sẽ 500 (`backend/src/app.js:1-6`).

---

## 3. `app.js` khởi động những gì

`backend/src/app.js` tạo Express app, gắn middleware + tất cả route, rồi `server.listen` (`backend/src/app.js:108`). Hai điểm "khởi động nền" cần nhớ:

1. **Socket.io** khởi tạo NGAY khi tạo HTTP server: `initSocket(server)` (`backend/src/app.js:49-52`). Đây là kênh WebSocket realtime.
2. **Worker đồng bộ event** chạy SAU khi server listen: `startSubgraphSync()` (`backend/src/app.js:115`).

> ⚠️ **Drift so với CLAUDE.md**: CLAUDE.md nói có "3 worker sync RPC" (`eventSync` + `recordRegistrySync` + `consentLedgerSync`) được start trong `app.js`. **Code hiện tại KHÔNG đúng vậy.** `startEventSync` đã bị tắt (comment) do gây 429 storm trên Alchemy free tier (`backend/src/app.js:32-39`). Thay vào đó chỉ còn **1 worker: `startSubgraphSync()`** đọc từ The Graph subgraph (`backend/src/app.js:110-115`). Các file `eventSync.service.js`, `recordRegistrySync.service.js`, `consentLedgerSync.service.js` vẫn tồn tại nhưng: `consentLedgerSync` giờ chỉ EXPORT các hàm handler (`handleConsentGranted`...) để `subgraphSync` gọi (`backend/src/services/subgraphSync.service.js:24-32`); `recordRegistrySync` không được start; `eventSync` import bị comment.

Các route được mount (`backend/src/app.js:82-100`):

```
/api/auth, /api/records, /api/key-share, /api/access-logs, /api/relayer,
/api/requests, /api/verification, /api/emergency, /api/trusted-contacts,
/api/delegation, /api/push, /api/org, /api/admin, /api/profile
```

`/api/test` chỉ mount khi `ENABLE_TEST_ROUTES === 'true'` (mặc định TẮT, fail-closed) (`backend/src/app.js:99-102`). Có route `/health` không cần auth (`backend/src/app.js:77`).

---

## 4. Middleware chi tiết

### 4.1 `authenticate` — kiểm tra JWT
`backend/src/middleware/auth.js:14`.

**JWT (JSON Web Token) là gì**: một chuỗi do server ký bằng `JWT_SECRET`, client gửi kèm mỗi request trong header `Authorization: Bearer <token>`. Server verify chữ ký để biết ai đang gọi mà không cần lưu session. Token chứa `walletAddress` + các role flag.

Luồng:
1. Lấy header `Authorization`, phải bắt đầu `Bearer ` (`auth.js:18`). Thiếu → 401 "No token provided".
2. `jwt.verify(token, JWT_SECRET)` (`auth.js:23`). Hết hạn → 401 "Token expired"; sai → 401 "Invalid token" (`auth.js:38-43`).
3. Load user từ DB theo `walletAddress` (`auth.js:26`). Không có → 401.
4. Gắn `req.auth` (claims) + `req.user` (user DB + claims, ưu tiên `walletAddress` của DB) (`auth.js:34-35`).

Có biến thể `optionalAuth` — không có token thì vẫn cho qua, không gắn `req.user` (`backend/src/middleware/auth.js:49`).

### 4.2 `onChainRole` — kiểm tra role bằng cách ĐỌC CONTRACT
`backend/src/middleware/onChainRole.js`. Đây là điểm cốt lõi thể hiện "quyền do on-chain quyết định".

- `requireOnChainRoles('patient')` trả về một middleware. Nó gọi `getUserRoleStrict(wallet)` → đọc role flag từ contract `AccessControl` (`onChainRole.js:48`, `backend/src/config/blockchain.js:282`).
- Map role → check (`onChainRole.js:6-13`):

| role string | điều kiện (flags) |
|---|---|
| `patient` | `isPatient` |
| `doctor` | `isDoctor` HOẶC `isVerifiedDoctor` |
| `verifiedDoctor` | `isVerifiedDoctor` |
| `org` | `isOrg` HOẶC `isVerifiedOrg` HOẶC `isActiveOrgAdmin` |
| `orgAdmin` | `isActiveOrgAdmin` |
| `ministry` | `isMinistry` |

- Không đủ quyền → 403 `ONCHAIN_ROLE_FORBIDDEN` (`onChainRole.js:92`). Nếu không đọc được on-chain (RPC lỗi) → 503 `ONCHAIN_ROLE_UNAVAILABLE` (`onChainRole.js:60-64`) — fail-closed, KHÔNG đoán role.
- Kết quả role flag được cache trong `req.onChainRoles` để các middleware sau dùng lại (`onChainRole.js:38-40`).

### 4.3 `rateLimit` (per-wallet) — chống burst giao dịch
`backend/src/middleware/rateLimit.js:21`. Khác với rate limit toàn cục trong `app.js` (keyed theo IP), cái này keyed theo **ví đã xác thực** (`rateLimit.js:30`), nên phải mount SAU `authenticate`. Mặc định 20 request/60s; vượt → 429 + header `Retry-After` (`rateLimit.js:50-57`). Dùng cho các route relayer (sponsor tx) để 1 ví không thể bắn hàng chục giao dịch được tài trợ trong vài giây (`backend/src/routes/relayer.routes.js:19-24`). Bộ nhớ là `Map` trong process (thesis-scale; production cần Redis) (`rateLimit.js:13-15`).

### 4.4 `errorHandler` — chuẩn hoá lỗi
`backend/src/middleware/errorHandler.js:8`. Mọi `next(error)` đổ về đây. Map lỗi thành response chuẩn `{ code, error, message, details?, txHash? }`:

| Loại lỗi | Status | code |
|---|---|---|
| Prisma P2002 (trùng unique) | 409 | `RESOURCE_DUPLICATE` (`errorHandler.js:10`) |
| Prisma P2025 (không tìm thấy) | 404 | `RESOURCE_NOT_FOUND` (`errorHandler.js:22`) |
| ZodError (validate body sai) | 400 | `VALIDATION_ERROR` (`errorHandler.js:32`) |
| MulterError (upload file) | 400 | `UPLOAD_*` (`errorHandler.js:43`) |
| còn lại / `AppError` | `err.statusCode` hoặc 500 | `err.code` hoặc `INTERNAL_ERROR` (`errorHandler.js:55`) |

Có class `AppError(message, statusCode, code, extra)` để code khác ném lỗi có cấu trúc (`errorHandler.js:76`).

**Zod là gì**: thư viện validate dữ liệu. Mỗi route khai báo schema (vd `loginSchema`, `backend/src/routes/auth.routes.js:12`) rồi `schema.parse(req.body)`; sai định dạng sẽ ném ZodError → errorHandler trả 400.

---

## 5. `config/` — kết nối ra ngoài

### 5.1 `blockchain.js` — viem client + đọc on-chain
`backend/src/config/blockchain.js`.

**viem là gì**: thư viện JavaScript để nói chuyện với blockchain (giống ethers.js). `createPublicClient` tạo client **chỉ-đọc** trỏ tới Arbitrum Sepolia qua `RPC_URL` (`blockchain.js:128-134`).

Hai hàm xương sống:

- **`checkConsent(patient, grantee, cidHash)`** (`blockchain.js:173`): đọc `ConsentLedger.canAccess` on-chain (`blockchain.js:184-189`). Đây là **cổng cấp quyền thật**. Trống `cidHash` → từ chối (`blockchain.js:174-177`). Có retry 3 lần khi gặp 429 (`blockchain.js:182-205`); lỗi cuối → trả `false` (fail-closed).
- **`getUserRoleStrict` / `getUserRole`** (`blockchain.js:282`, `298`): đọc 8 flag role từ `AccessControl` (`isPatient`, `isDoctor`, `isVerifiedDoctor`, `isMinistry`, `isOrganization`, `isVerifiedOrganization`, `isActiveOrgAdmin`, `getAdminOrgId`) (`blockchain.js:230-248`), kèm tên org nếu là admin (`blockchain.js:252-265`).

**Cache role**: vì middleware đọc role mỗi request (8+ lời gọi RPC), có `roleCache` TTL mặc định 10 phút (`blockchain.js:146-161`) để khỏi vượt quota RPC. Khi role đổi (vd doctor vừa verified) gọi `invalidateRoleCache(address)` để xoá cache (`blockchain.js:290`); subgraphSync gọi hàm này khi phát hiện doctor mới verified (`backend/src/services/subgraphSync.service.js:23,45-52`).

`CONTRACT_ADDRESSES` đọc từ env (`blockchain.js:164-170`).

### 5.2 `database.js` — Prisma client
`backend/src/config/database.js`. Chỉ tạo 1 `PrismaClient` dùng chung (singleton), bật log query ở môi trường development (`database.js:3-5`). Mọi file `import prisma from '../config/database.js'`.

### 5.3 `contractABI.js` — ABI đầy đủ của 5 contract
`backend/src/config/contractABI.js`. Export 5 ABI: `ACCESS_CONTROL_ABI` (`:5`), `CONSENT_LEDGER_ABI` (`:1239`), `RECORD_REGISTRY_ABI` (`:2575`), `DOCTOR_UPDATE_ABI` (`:3189`), `EHR_SYSTEM_SECURE_ABI` (`:3418`). File này là ABI "đầy đủ" cho relayer/admin gửi giao dịch. Lưu ý `blockchain.js` lại định nghĩa ABI tối giản RIÊNG (chỉ vài hàm view) ngay trong file (`blockchain.js:10-121`) — đây là 2 nguồn ABI khác nhau cùng tồn tại.

---

## 6. Vì sao backend là "blind mailbox" (hòm thư mù)

Đây là luận điểm an toàn trung tâm của đồ án — phải nắm chắc để trả lời hội đồng.

```
   Hồ sơ FHIR (plaintext)
        │  AES-GCM encrypt (key = aesKey, sinh trên mobile)
        ▼
   ciphertext ───────────────► IPFS/Pinata  → trả về CID
        │
        │  gói {cid, aesKey}
        ▼
   NaCl box encrypt cho public key của NGƯỜI NHẬN
        ▼
   encryptedPayload ─────────► Backend lưu vào bảng KeyShare
                                     │
                                     │  Backend KHÔNG có NaCl secret key
                                     │  → KHÔNG mở được {cid, aesKey}
                                     ▼
                          Chỉ NGƯỜI NHẬN (có secret key) giải mã được
```

- Bảng `KeyShare` lưu `encryptedPayload` = gói NaCl đã mã hoá cho public key người nhận (`backend/prisma/schema.prisma:185`). Comment trong schema ghi rõ "Backend as blind mailbox" ngay trên khai báo model (`schema.prisma:174-176`).
- Backend **không lưu** secret key của ai → không giải mã được. Nếu DB leak, attacker chỉ có ciphertext + hash.
- On-chain chỉ lưu `cidHash = keccak256(cid)` và `encKeyHash` (hash), không lưu key thật.
- Khi người nhận xin payload, backend BẮT BUỘC hỏi on-chain trước: route `GET /api/key-share/record/:cidHash` gọi `checkConsent(owner, requester, cidHash)`, fail → 403 (`backend/src/routes/keyShare.routes.js:1273-1344`). Owner/creator được bypass (họ là chủ) (`keyShare.routes.js:1267-1270`).

Như vậy backend chỉ là nơi **chuyển phát gói đã niêm phong**; việc cho phép hay không là do contract; nội dung chỉ người nhận đọc được.

---

## 7. BẢNG: tất cả route file

Tất cả nằm ở `backend/src/routes/`, mount tại `backend/src/app.js:82-100`.

| Prefix | File | Vai trò (1 dòng) |
|---|---|---|
| `/api/auth` | `auth.routes.js` | Đăng nhập bằng chữ ký ví (nonce → verifyMessage → JWT), lưu/đọc public key mã hoá (`auth.routes.js:74,114,241`) |
| `/api/records` | `record.routes.js` | Tạo record (sponsor on-chain) + `save-only` (doctor đã tự gửi tx), liệt kê record của tôi, chuỗi version, thu hồi quyền (`record.routes.js:94,295,518,847`) |
| `/api/key-share` | `keyShare.routes.js` | Chia sẻ `encryptedPayload`, lấy key theo record (có gate `canAccess`), danh sách nhận/gửi, pre-share cho Trusted Contact (`keyShare.routes.js:85,365,1203`) |
| `/api/access-logs` | `accessLog.routes.js` | Đọc nhật ký truy cập 1 record (chỉ owner) + hoạt động của chính mình (`accessLog.routes.js:8,37`) |
| `/api/relayer` | `relayer.routes.js` | Tài trợ gas: register, grant, revoke, delegate-authority, trusted-contact; xem quota; archive request (`relayer.routes.js:36,120,220,311`) |
| `/api/requests` | `request.routes.js` | Quy trình xin quyền 2 bên (EHRSystemSecure), đọc trạng thái request on-chain (`request.routes.js:91,244,309`) |
| `/api/verification` | `verification.routes.js` | Org/Ministry xác minh bác sĩ; danh sách pending; tính 4-check outcome (`verification.routes.js:14,25-29,41`) |
| `/api/emergency` | `emergency.routes.js` | Tra cứu ví bệnh nhân theo `cccdHash` trong cấp cứu (chỉ verifiedDoctor, có rate-limit) (`emergency.routes.js:31,56`) |
| `/api/trusted-contacts` | `trustedContact.routes.js` | Đọc danh sách Người thân tin cậy (cache); mutation đi qua `/api/relayer/trusted-contact` (`trustedContact.routes.js:1-15,31`) |
| `/api/delegation` | `delegation.routes.js` | Đọc-only các uỷ quyền CHAIN topology (my-delegates / delegated-to-me); mutation đi qua relayer hoặc contract (`delegation.routes.js:1-11,30,50`) |
| `/api/push` | `push.routes.js` | Đăng ký / huỷ Expo push token của user (`push.routes.js:16,34`) |
| `/api/org` | `org.routes.js` | Quản lý tổ chức y tế (Ministry tạo org), upload giấy phép (multer 50MB) (`org.routes.js:18,47,54`) |
| `/api/admin` | `admin.routes.js` | Endpoint chỉ-Ministry: duyệt org bằng ví ministry (= ví sponsor) gửi tx (`admin.routes.js:22,39`) |
| `/api/profile` | `profile.routes.js` | Đọc/cập nhật hồ sơ cá nhân (tên, BHYT, nhóm máu, dị ứng) + hồ sơ bác sĩ (`profile.routes.js:11,32,43`) |
| `/api/test` | `test.routes.js` | DEV-only (cần `ENABLE_TEST_ROUTES=true`): cấp JWT giả không cần chữ ký (`test.routes.js:13`, mount `app.js:99`) |

---

## 8. BẢNG: tất cả service

Tất cả ở `backend/src/services/`.

| File | Vai trò (1 dòng) |
|---|---|
| `relayer.service.js` | Tài trợ gas: ví sponsor ký + gửi tx thay user; quản lý quota 100/tháng; serialize tx qua 1 queue tránh trùng nonce (`relayer.service.js:21,56-67`) |
| `keyShareWriter.service.js` | **Writer DUY NHẤT** của bảng KeyShare; mọi mutation đi qua đây + so `sourceTimestamp` để bỏ event cũ (chống race) (`keyShareWriter.service.js:1-13`) |
| `subgraphSync.service.js` | Worker DUY NHẤT đang chạy: poll subgraph mỗi 30s, gọi các handler để cập nhật cache consent/delegation/trusted-contact + invalidate role cache (`subgraphSync.service.js:1-32,36`) |
| `subgraphClient.service.js` | Client GraphQL mỏng gọi The Graph subgraph; strict mode (lỗi thì ném, không fallback RPC) (`subgraphClient.service.js:1-10,29`) |
| `consentLedgerSync.service.js` | Định nghĩa các handler `handleConsentGranted/Revoked/...` ghi cache; comment nhấn mạnh DB chỉ là CACHE (`consentLedgerSync.service.js:1-15`) |
| `recordRegistrySync.service.js` | (Worker RPC cũ, **không được start** trong app.js) đồng bộ event RecordAdded/Updated (`recordRegistrySync.service.js:1,30-39`) |
| `eventSync.service.js` | (Worker RPC AccessControl cũ, **đã bị tắt** — import comment ở app.js) Member/Doctor/Org events (`eventSync.service.js:1,22-30`; `app.js:32-39`) |
| `socket.service.js` | Socket.io realtime: xác thực handshake bằng JWT, mỗi user join 1 room theo ví, `emitToUser` đẩy event (`socket.service.js:14,24,41,61`) |
| `push.service.js` | Gửi Expo push notification qua HTTP API, no-op nếu user chưa có token (`push.service.js:10,18`) |
| `ipfs.service.js` | Upload IPFS qua Pinata khi có `PINATA_JWT`, ngược lại trả CID giả (MOCK) (`ipfs.service.js:1,11-17`) |

> ⚠️ **Drift CLAUDE.md**: CLAUDE.md nói `ipfs.service.js` là MOCK hoàn toàn. **Code mới hơn**: có nhánh Pinata thật khi set `PINATA_JWT`, chỉ mock khi thiếu key (`ipfs.service.js:11-17`).

---

## 9. Relayer & quota gas (chi tiết, vì là điểm hỏi thường gặp)

`backend/src/services/relayer.service.js`.

- Ví **sponsor** (`SPONSOR_PRIVATE_KEY`) tạo `walletClient` để ký + gửi tx (`relayer.service.js:32-54`).
- **Quota**: `SIGNATURES_PER_MONTH = 100`, gộp mọi hành động on-chain của bệnh nhân vào 1 pool (`relayer.service.js:21-23`). Tracking ở `User.signaturesThisMonth` + `quotaResetDate`; nếu `hasSelfWallet` thì bỏ qua quota (`backend/prisma/schema.prisma:96-105`).
- **Tránh trùng nonce**: tất cả tx sponsor xếp hàng qua `sponsorWrite()` (1 hàng đợi promise in-process) — ví sponsor không bao giờ gán cùng nonce cho 2 tx song song (`relayer.service.js:56-67`).

Các hàm sponsor (mỗi cái = 1 loại giao dịch on-chain được tài trợ):

| Hàm | path:line | Dùng bởi route |
|---|---|---|
| `sponsorRegisterPatient` | `relayer.service.js:340` | `POST /api/relayer/register` (role=patient) |
| `sponsorRegisterDoctor` | `relayer.service.js:385` | `POST /api/relayer/register` (role=doctor) |
| `sponsorUploadRecord` | `relayer.service.js:427` | `POST /api/records` (`record.routes.js:227`) |
| `sponsorRevoke` | `relayer.service.js:476` | `POST /api/relayer/revoke`, `DELETE /api/records/.../access/...` |
| `sponsorGrantConsent` | `relayer.service.js:496` | `POST /api/relayer/grant` |
| `sponsorDelegateAuthority` | `relayer.service.js:546` | `POST /api/relayer/delegate-authority` |
| `sponsorSetTrustedContact` | `relayer.service.js:648` | `POST /api/relayer/trusted-contact` |
| `sponsorReject` | `relayer.service.js:821` | quy trình request |

> Lưu ý mô hình: bệnh nhân **ký EIP-712 off-chain** trên mobile (vd `signGrantConsent`), gửi chữ ký lên backend; backend gọi hàm `...BySig` on-chain và TRẢ GAS. Bác sĩ/Org **không** được sponsor — họ tự trả gas (vì các check on-chain cần `msg.sender` đúng ví của họ). Đây là lý do nhiều route relayer gắn `requirePatientRole` (`relayer.routes.js:311,285,220`).

---

## 10. Luồng end-to-end mẫu: bệnh nhân chia sẻ hồ sơ cho bác sĩ

Minh hoạ cách UI → service mobile → route backend → contract/IPFS/DB ráp lại (chi tiết mobile xem tài liệu 03; ở đây tập trung phần backend).

```
[Mobile] Patient mở RecordDetail, chọn bác sĩ + shareType
   │
   │ 1) Ký EIP-712 ConsentPermit (off-chain, ví patient)  → chữ ký
   ▼
[Backend] POST /api/relayer/grant   (relayer.routes.js:311)
   │   middleware: authenticate → rateLimit → requirePatientRole
   │   → relayerService.sponsorGrantConsent(...)  (relayer.service.js:496)
   │   → ví SPONSOR trả gas, gọi ConsentLedger ...BySig on-chain
   ▼
[Chain] ConsentLedger lưu Consent (cidHash, expireAt, allowDelegate, encKeyHash=HASH)
   │   phát event ConsentGranted
   ▼
[Mobile] 2) NaCl-encrypt {cid, aesKey} cho public key bác sĩ → encryptedPayload
   ▼
[Backend] POST /api/key-share       (keyShare.routes.js:85)
   │   kiểm tra record tồn tại + owner/creator/grantee
   │   nếu owner share: checkConsent(owner, recipient, cid) phải PASS
   │       (keyShare.routes.js:113-178, có cả kế thừa ancestor/descendant)
   │   → applyShare(...) ghi 1 row KeyShare (keyShareWriter)
   │   → emitToUser(recipient,'record:shared') + push notification
   ▼
[DB] KeyShare row (status pending/claimed) — backend KHÔNG đọc nổi payload
   ▼
[Backend←Subgraph] subgraphSync thấy ConsentGranted → ghi cache Consent (đọc nhanh)
   ▼
[Mobile bác sĩ] GET /api/key-share/record/:cidHash   (keyShare.routes.js:1203)
   │   checkConsent(owner, doctor, cid) on-chain phải PASS (1273)
   │   → trả encryptedPayload → bác sĩ giải mã bằng NaCl secret key của mình
```

**Ai trả gas**: ví sponsor (bước grant). **Dữ liệu gì mã hoá**: hồ sơ FHIR mã hoá AES-GCM lưu IPFS; gói `{cid, aesKey}` mã hoá NaCl lưu DB. **Ai đọc được**: chỉ bác sĩ được cấp (có secret key) + được on-chain `canAccess` cho phép. **Cache**: bảng `Consent`, `KeyShare` (cache + mailbox), `AccessLog` (audit).

---

## 11. Tiện ích (`utils/`)

- `normalize.js`: `normalizeAddress` (lowercase địa chỉ, null nếu không phải chuỗi) (`normalize.js:11`); `normalizeHash` (lowercase + regex `0x[64 hex]`, null nếu sai) (`normalize.js:24`). Dùng khắp nơi để chuẩn hoá address/cidHash trước khi so sánh hoặc ghi DB.
- `rpcRetry.js`: `withRpcRetry(fn)` retry với exponential backoff khi gặp 429 hoặc lỗi mạng tạm thời (mặc định 5 lần, cap 8s) (`rpcRetry.js:16-18,56`). Phân biệt rate-limit (`isRateLimit`, `:24`) vs lỗi mạng (`isTransientNetwork`, `:31`).
- `logger.js`, `crypto.js`: tiện ích log + AES helper (vd `org.routes.js:12` import `encryptAES`).

---

## 12. Postgres schema (cache — KHÔNG dùng để cấp quyền)

Định nghĩa ở `backend/prisma/schema.prisma`. Các model (`schema.prisma`):

| Model | line | Ghi chú |
|---|---|---|
| `User` | `:60` | Ví + public key NaCl (`encryptionPublicKey`) + quota gas + push token + `nationalIdHash` (keccak CCCD, không lưu plaintext) (`:62-108`) |
| `DoctorProfile` | `:120` | Thông tin bác sĩ (chuyên khoa, số giấy phép) |
| `RecordMetadata` | `:147` | Cache metadata record: `cidHash` (hash, KHÔNG plaintext CID), `parentCidHash` (chuỗi version), `syncStatus` (`:149-158`) |
| `KeyShare` | `:176` | **Blind mailbox**: `encryptedPayload` (`:185`) + `allowDelegate` (`:191`) + `status` (`:193`) + `expiresAt` (`:200`); comment "blind mailbox" ở `:174-176` |
| `KeyShareMutationLog` | `:216` | Audit mọi lần ghi KeyShare (để debug race) |
| `AccessLog` | `:233` | Nhật ký truy cập (CREATE_RECORD, VIEW_METADATA, SHARE_KEY, REVOKE_ACCESS...) |
| `AccessRequest` | `:250` | Cache request xin quyền 2 bên |
| `Consent` | `:285` | **Cache** consent on-chain — comment & CLAUDE.md cảnh báo: đừng check quyền bằng bảng này, luôn gọi `checkConsent` on-chain |
| `VerificationRequest` | `:313` | Hồ sơ xin xác minh bác sĩ |
| `TrustedContact` | `:353` | Cache Người thân tin cậy (mirror event TrustedContactSet/Revoked) |
| `Delegation` | `:380` | Cache CHAIN topology uỷ quyền (`parentDelegator`, `chainDepth`, `epoch`, `expiresAt`) |
| `DelegationAccessLog` | `:413` | Mirror event AccessGrantedViaDelegation |
| `Organization` / `OrganizationMember` | `:430`, `:460` | Cache tổ chức + thành viên |
| `EventSyncState` | `:482` | Con trỏ (cursor) đồng bộ — subgraphSync nhét timestamp vào đây (`subgraphSync.service.js:54-59`) |
| `DoctorCredential` | `:492` | Chứng chỉ hành nghề |

Câu nhớ cho hội đồng: **"DB là bản sao để đọc nhanh; quyền truy cập luôn được xác thực lại on-chain qua `canAccess` mỗi lần trả key."** (`keyShare.routes.js:1273`).

---

## Nguồn đã đọc

- `backend/src/app.js`
- `backend/src/config/blockchain.js`
- `backend/src/config/database.js`
- `backend/src/config/contractABI.js` (qua Grep export)
- `backend/src/middleware/auth.js`
- `backend/src/middleware/onChainRole.js`
- `backend/src/middleware/rateLimit.js`
- `backend/src/middleware/errorHandler.js`
- `backend/src/utils/normalize.js`
- `backend/src/utils/rpcRetry.js`
- `backend/src/routes/auth.routes.js`
- `backend/src/routes/record.routes.js`
- `backend/src/routes/keyShare.routes.js` (lines 1-1350)
- `backend/src/routes/relayer.routes.js`
- `backend/src/routes/accessLog.routes.js`
- `backend/src/routes/request.routes.js` (đầu file)
- `backend/src/routes/verification.routes.js` (đầu file)
- `backend/src/routes/emergency.routes.js` (đầu file)
- `backend/src/routes/trustedContact.routes.js` (đầu file)
- `backend/src/routes/delegation.routes.js` (đầu file)
- `backend/src/routes/push.routes.js`
- `backend/src/routes/org.routes.js` (đầu file)
- `backend/src/routes/admin.routes.js` (đầu file)
- `backend/src/routes/profile.routes.js` (đầu file)
- `backend/src/routes/test.routes.js` (đầu file)
- `backend/src/services/relayer.service.js` (đầu file + Grep hàm sponsor)
- `backend/src/services/keyShareWriter.service.js` (đầu file)
- `backend/src/services/subgraphSync.service.js` (đầu file)
- `backend/src/services/subgraphClient.service.js` (đầu file)
- `backend/src/services/consentLedgerSync.service.js` (đầu file)
- `backend/src/services/recordRegistrySync.service.js` (đầu file)
- `backend/src/services/eventSync.service.js` (đầu file)
- `backend/src/services/socket.service.js` (đầu file + Grep export)
- `backend/src/services/push.service.js` (đầu file)
- `backend/src/services/ipfs.service.js` (đầu file)
- `backend/prisma/schema.prisma` (Grep model + lines 60-180)
