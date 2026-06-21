# Chức năng — Tài trợ gas (quota 100/tháng) & tự trả phí

## Tóm tắt 30 giây

Mọi giao dịch on-chain do **bệnh nhân** khởi xướng (đăng ký, tạo/cập nhật hồ sơ, cấp quyền, thu hồi, uỷ quyền, thêm người thân tin cậy) đều được **backend trả gas hộ** thông qua một ví đặc biệt gọi là **sponsor wallet (relayer)**. Mỗi user có hạn mức (quota) **100 chữ ký miễn phí mỗi tháng**, đếm chung 1 "túi" (pool) bằng cột `signaturesThisMonth`, tự reset đầu mỗi tháng. Khi **hết quota**, backend trả lỗi `QUOTA_EXHAUSTED` (HTTP 429, hoặc 402 ở luồng thu hồi) và mobile tự động chuyển sang **self-pay**: gửi đúng giao dịch đó nhưng ký + phát từ **ví cá nhân của user** (ví nhúng Web3Auth) và user tự trả gas bằng ETH của mình. **Bác sĩ và tổ chức KHÔNG được tài trợ** cho các hành động cần `msg.sender` đúng là chính họ (`verifyDoctor`, `subDelegate`, `grantUsingDelegation`...) — họ luôn tự trả gas.

Nguồn chính:
- Quota & sponsor: `backend/src/services/relayer.service.js:21-23`, `backend/src/services/relayer.service.js:266-307`
- Self-pay: `mobile/src/utils/selfPayFallback.js:43-75`
- Cột DB: `backend/prisma/schema.prisma:100-105`

---

## 1. Khái niệm nền (cho người không biết backend/mobile)

### 1.1. Gas là gì, vì sao là vấn đề

Trên blockchain (ở đây là Arbitrum Sepolia), **mọi giao dịch ghi state phải trả phí gas** bằng đồng coin của mạng (ETH testnet). Người ký giao dịch (`msg.sender`) phải có sẵn ETH trong ví. Với bệnh nhân — người dùng thường, đăng nhập bằng email/mạng xã hội — bắt họ tự nạp ETH testnet để dùng app là rào cản lớn. Vì vậy hệ thống dùng mô hình **relayer / meta-transaction** để bệnh nhân "không phải đụng tới gas".

### 1.2. Meta-transaction & các hàm `*BySig`

Ý tưởng: **tách việc "đồng ý" khỏi việc "trả tiền gas"**.

- Bệnh nhân chỉ **ký** một thông điệp có cấu trúc (EIP-712) bằng khoá riêng của mình — đây là chữ ký **off-chain**, KHÔNG tốn gas.
- Backend (sponsor wallet) cầm chữ ký đó, gọi một biến thể hàm có hậu tố `BySig` trên contract và **trả gas**.
- Contract kiểm tra chữ ký để xác nhận "đúng là bệnh nhân X đồng ý", rồi mới thực thi — dù `msg.sender` là sponsor chứ không phải bệnh nhân.

Các hàm `*BySig` được relayer gọi (đều trên `ConsentLedger` / `EHRSystemSecure`):

| Hành động | Hàm contract gọi qua relayer | Nguồn |
|---|---|---|
| Cấp quyền đọc 1 hồ sơ | `grantBySig` | `backend/src/services/relayer.service.js:515` |
| Uỷ quyền (delegation gốc) | `delegateAuthorityBySig` | `backend/src/services/relayer.service.js:567` |
| Thêm/huỷ người thân tin cậy | `setTrustedContactBySig` | `backend/src/services/relayer.service.js:668` |
| Từ chối yêu cầu truy cập | `rejectRequestBySig` | `backend/src/services/relayer.service.js:831` |

Một số hành động KHÔNG cần chữ ký EIP-712 vì contract dựa trên cờ "relayer được uỷ quyền" thay vì chữ ký — backend gọi hàm `*For`:

| Hành động | Hàm contract | Nguồn |
|---|---|---|
| Đăng ký bệnh nhân | `registerPatientFor` | `backend/src/services/relayer.service.js:363` |
| Đăng ký bác sĩ | `registerDoctorFor` | `backend/src/services/relayer.service.js:409` |
| Tải hồ sơ lên | `addRecordFor` | `backend/src/services/relayer.service.js:456` |
| Thu hồi quyền | `revokeFor` | `backend/src/services/relayer.service.js:486` |

> Lưu ý cho người đọc rành SC: `*For` an toàn được vì contract chỉ chấp nhận lời gọi từ địa chỉ đã đăng ký vào registry "authorizedRelayers"/"authorizedSponsors" (xem kiểm tra `authorizedRelayers` ở `relayer.service.js:208-212` và `authorizedSponsors` ở `relayer.service.js:435-440`), và bệnh nhân-đích được truyền tường minh làm tham số. `*BySig` thì gắt hơn — bảo vệ bằng chữ ký + `nonce` + `deadline`.

### 1.3. Sponsor wallet (relayer) là gì

Là một ví EOA duy nhất, khoá riêng nằm trong biến môi trường `SPONSOR_PRIVATE_KEY` của backend (`backend/src/services/relayer.service.js:32-34`). Backend dùng thư viện `viem` tạo `walletClient` từ ví này (`relayer.service.js:50-54`) để phát giao dịch và trả gas. Ví này đã được wiring vào contract như "relayer/sponsor được phép" lúc deploy.

> An toàn nonce: tất cả lệnh gửi từ sponsor wallet được **xếp hàng tuần tự** qua `sponsorWrite()` (`relayer.service.js:61-67`) để hai giao dịch song song không cùng dùng một nonce (nếu trùng nonce, một tx sẽ bị thay/drop). Ở quy mô đồ án, ưu tiên đúng đắn hơn throughput.

---

## 2. Quota thống nhất 100 chữ ký/tháng

### 2.1. Mô hình "một túi duy nhất"

Trước đây quota tách theo từng loại hành động (upload riêng, revoke riêng), gây ra lỗi 429 khó hiểu giữa luồng. Quyết định 2026-06-21 gộp lại **một pool duy nhất 100 chữ ký/tháng** cho mọi hành động on-chain của bệnh nhân (`relayer.service.js:17-23`, `schema.prisma:96-99`).

Hằng số:

```js
const QUOTA_LIMITS = { SIGNATURES_PER_MONTH: 100 };   // relayer.service.js:21-23
```

### 2.2. Lưu ở đâu (model `User`)

`backend/prisma/schema.prisma:100-105`:

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `registrationSponsored` | Boolean (default false) | Đã được tài trợ đăng ký 1 lần chưa |
| `signaturesThisMonth` | Int (default 0) | Số chữ ký đã dùng tháng này, trần 100 |
| `quotaResetDate` | DateTime (default now) | Mốc để biết khi nào sang tháng mới |
| `hasSelfWallet` | Boolean (default false) | Nếu true → bỏ qua giới hạn quota (user dùng ETH thật) |

### 2.3. Reset hàng tháng

Mỗi lần dùng quota, hàm `checkAndResetQuota` so **tháng/năm** hiện tại với `quotaResetDate`; nếu khác → đặt `signaturesThisMonth = 0` và cập nhật `quotaResetDate = now` (`relayer.service.js:247-262`). Đây là reset "lazy" (chỉ chạy khi user hành động), không có cron job.

### 2.4. Gate-and-reserve nguyên tử (chống race condition)

`consumeQuota` là cửa duy nhất tiêu quota (`relayer.service.js:266-307`). Điểm quan trọng (fix F15):

```js
// relayer.service.js:292-298 — tăng counter CHỈ KHI còn dưới trần, trong 1 updateMany có điều kiện
const reserved = await prisma.user.updateMany({
    where: { walletAddress: address, signaturesThisMonth: { lt: 100 } },
    data: { signaturesThisMonth: { increment: 1 } },
});
if (reserved.count === 0) {
    throw createRelayerError('Đã hết quota...', { code: 'QUOTA_EXHAUSTED', statusCode: 429, ... });
}
```

- Việc "kiểm tra còn quota" và "tăng counter" gộp thành **một câu lệnh DB có điều kiện** → hai request đồng thời ở ranh giới 99 không thể cùng vượt trần.
- Counter được **trừ trước khi gửi tx** (reserve). Hệ quả: nếu tx sponsored thất bại thì vẫn mất 1 slot — đánh đổi an toàn để **trần không bao giờ bị vượt**. Hàm `bumpSignatureCounter` cũ giờ là no-op (`relayer.service.js:309-313`).
- Quan trọng: **mọi user dùng chung pool**, KHÔNG special-case ví ngoài. Hết quota thì tự trả gas (`relayer.service.js:281-284`).

### 2.5. Đọc trạng thái quota — `getQuotaStatus`

`relayer.service.js:315-338` trả về cho UI/precheck:

```
{ registrationAvailable, signaturesRemaining, signaturesLimit, hasSelfWallet, quotaResetDate }
```

`signaturesRemaining = max(0, 100 - signaturesThisMonth)`. Route công khai: `GET /api/relayer/quota` (`backend/src/routes/relayer.routes.js:36-48`), kèm message tiếng Việt mô tả pool.

### 2.6. Hai lớp chống lạm dụng (đừng nhầm với quota)

| Lớp | Mục đích | Nếu chạm |
|---|---|---|
| Quota 100/tháng (`consumeQuota`) | Trần **chi phí** gas/tháng | `QUOTA_EXHAUSTED` → kích hoạt self-pay |
| Rate-limit theo ví (`rateLimitByWallet`) | Trần **tốc độ** burst, mặc định 20 tx/phút | `RELAYER_RATE_LIMITED` → **KHÔNG** self-pay, user còn quota, chỉ cần chờ |

Rate-limit: `backend/src/routes/relayer.routes.js:19-24`. Mobile phân biệt rõ: `isQuotaExhausted` chỉ trả true cho `QUOTA_EXHAUSTED`, không cho `RELAYER_RATE_LIMITED` (`mobile/src/utils/selfPayFallback.js:23-31`).

---

## 3. Self-pay fallback (tự trả phí khi hết quota)

### 3.1. Cơ chế

Ví nhúng Web3Auth của user là **EOA thật** mà app giữ được khoá riêng (qua `walletAction.service` `getWalletContext`) — nên nó có thể **vừa ký vừa phát** giao dịch, chỉ cần có ETH (`mobile/src/utils/selfPayFallback.js:6-11`). Helper `withSelfPayFallback` bọc mọi hành động sponsored:

`mobile/src/utils/selfPayFallback.js:43-75`:
1. Chạy `relayerCall()` (luồng gasless qua backend). Thành công → trả `{ txHash, selfPaid: false }`.
2. Nếu lỗi **không phải** quota-exhausted → ném lại (không fallback).
3. Nếu là quota-exhausted (`isQuotaExhausted`):
   - Lấy ví cá nhân, kiểm tra số dư. Nếu **balance = 0** → ném lỗi `NO_ETH_FOR_SELF_PAY` với thông điệp tiếng Việt rõ ràng (`selfPayFallback.js:62-69`).
   - Ngược lại: `walletClient.writeContract({ account, ...selfPayWrite })` — gửi **đúng giao dịch on-chain** từ ví user, chờ receipt, trả `{ txHash, selfPaid: true }` (`selfPayFallback.js:71-73`).

### 3.2. Điều kiện nhận biết "hết quota" — `isQuotaExhausted`

`mobile/src/utils/selfPayFallback.js:25-31` nhận biết 1 trong 3:
- `err.code === 'QUOTA_EXHAUSTED'`
- `err.data.code === 'QUOTA_EXHAUSTED'`
- `err.status === 402 && err.data.requiresOwnWallet === true`

Các trường này được mobile `api.js` gắn vào error từ HTTP response (`error.status`, `error.data`, `error.code` lấy từ `data.code`) — `mobile/src/services/api.js:52-58`.

### 3.3. 429 vs 402 — vì sao có hai mã

| Mã | Khi nào | Route phát |
|---|---|---|
| **429** `QUOTA_EXHAUSTED` | `consumeQuota` thất bại ở các luồng grant/upload/delegate | `relayer.service.js:299-303`; upload `record.routes.js:176-182` & `:236` |
| **402** `requiresOwnWallet: true` | Luồng **thu hồi** (DELETE access): bắt cả `QUOTA_EXHAUSTED` lẫn message cũ → trả 402 sạch | `backend/src/routes/record.routes.js:913-919` |

Cả hai đều được `isQuotaExhausted` bắt → cùng kích hoạt self-pay.

### 3.4. Tinh tế: self-pay KHÔNG tiêu quota miễn phí

Khi rơi vào self-pay, relayer đã **ném lỗi trước khi gửi tx** (counter chưa bị reserve cho lần này — vì reserve nằm trong `consumeQuota` mà chính nó là cái ném lỗi). Do đó mobile không trừ `signaturesRemaining` khi `selfPaid === true` (`mobile/src/services/consent.service.js:186-190`).

### 3.5. `msg.sender` đổi — vì sao vẫn hợp lệ

- **grant/delegate (`*BySig`)**: hàm được **gate bằng chữ ký**, không phải bằng `msg.sender`. Self-pay gửi **cùng signature** đó nhưng từ ví user → vẫn pass (`consent.service.js:159-178`, `delegation.service.js:91-112`).
- **revoke**: self-pay gọi thẳng `ConsentLedger.revoke(grantee, cidHash)` — contract yêu cầu `c.patient == msg.sender`, mà giờ `msg.sender` = chính ví bệnh nhân → hợp lệ (`consent.service.js:249-264`).
- **upload**: self-pay gọi `RecordRegistry.addRecord` (bản tự gửi) thay cho `addRecordFor` (bản relayer gửi hộ), rồi mirror metadata qua `saveOnly` không-relayer (`mobile/src/screens-v2/CreateRecordScreen.tsx:468-495`).

---

## 4. Ai KHÔNG được tài trợ — bác sĩ / tổ chức tự trả

Các hành động mà contract yêu cầu `msg.sender` **đúng là chính người gọi** (không thể để relayer đứng tên) thì **không thể sponsor** — bác sĩ/tổ chức tự trả gas từ ví của mình. Trong code mobile, các hàm này gọi `walletClient.writeContract` trực tiếp (KHÔNG đi qua `withSelfPayFallback`, KHÔNG đi qua backend relayer):

| Hành động (vai trò) | Hàm contract | `msg.sender` phải là | Nguồn |
|---|---|---|---|
| Bác sĩ A re-share 1 hồ sơ cho bác sĩ B | `grantUsingRecordDelegation` | bác sĩ A | `mobile/src/services/consent.service.js:72-84` |
| Bác sĩ chuyển tiếp uỷ quyền | `subDelegate` | bác sĩ cha (delegatee) | `mobile/src/services/delegation.service.js:186-201` |
| Bác sĩ thu hồi sub-delegation | `revokeSubDelegation` | người đã cấp (parentDelegator) | `delegation.service.js:217-227` |
| Bác sĩ mint consent từ uỷ quyền | `grantUsingDelegation` | delegatee | `delegation.service.js:256-273` |

Comment trong code nói rõ lý do, ví dụ: "Requires `msg.sender == doctorA`, so we cannot use the relayer (which would make relayer the sender)" (`consent.service.js:14-17`).

> Ngoại lệ đặc biệt — **revoke uỷ quyền gốc của BỆNH NHÂN** cũng tự trả: hàm `revokeDelegation` **không có biến thể BySig**, nên bệnh nhân phải tự gọi và tự trả gas (rất nhỏ) — `mobile/src/services/delegation.service.js:118-151`. Đây không phải vì `msg.sender`, mà vì thiếu hàm BySig.

Sponsor functions hiện có (chỉ cho hành động bệnh nhân khởi xướng): `sponsorRegisterPatient`, `sponsorRegisterDoctor`, `sponsorUploadRecord`, `sponsorRevoke`, `sponsorGrantConsent`, `sponsorDelegateAuthority`, `sponsorSetTrustedContact`, `sponsorReject` — `relayer.service.js:846-861`.

---

## 5. Sơ đồ luồng end-to-end (ví dụ: bệnh nhân cấp quyền đọc 1 hồ sơ)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MOBILE (UI)  — màn chia sẻ hồ sơ / RecordDetail → handleShare              │
└──────────────────────────────────────────────────────────────────────────┘
        │ gọi grantConsentOnChain()  (consent.service.js:128)
        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ MOBILE (service) consent.service.js                                        │
│  1. GET /api/relayer/grant-context  → nonce + isVerifiedDoctor + quota     │
│  2. Bệnh nhân KÝ EIP-712 ConsentPermit (off-chain, KHÔNG tốn gas)         │
│  3. withSelfPayFallback( relayerCall , selfPayWrite )                      │
└──────────────────────────────────────────────────────────────────────────┘
        │
        ├── (A) CÒN QUOTA ─────────────────────────────────────────────┐
        │   POST /api/relayer/grant  (relayer.routes.js:311)            │
        │        ▼                                                       │
        │   BACKEND relayer.service.sponsorGrantConsent                 │
        │     consumeQuota() → reserve +1 (relayer.service.js:509)      │
        │     sponsor wallet gọi ConsentLedger.grantBySig() + TRẢ GAS   │
        │        ▼                                                       │
        │   CONTRACT verify chữ ký → ghi consent on-chain               │
        │   → trả { txHash }, selfPaid=false                            │
        │
        └── (B) HẾT QUOTA → backend ném 429 QUOTA_EXHAUSTED ───────────┐
            isQuotaExhausted(err)=true (selfPayFallback.js:25)         │
              ví user có ETH? ── không → lỗi NO_ETH_FOR_SELF_PAY       │
                              └─ có  → walletClient.writeContract(      │
                                        ConsentLedger.grantBySig,       │
                                        cùng signature, ví user trả gas)│
              → trả { txHash }, selfPaid=true (KHÔNG trừ quota)         │
                                                                        ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ KẾT QUẢ: consent ghi on-chain. Off-chain KeyShare (payload mã hoá NaCl)    │
│ được tạo riêng để recipient claim sau. UI cập nhật signaturesRemaining.    │
└──────────────────────────────────────────────────────────────────────────┘
```

(Luồng `grant-context`: `consent.service.js:138`; quyết định self-pay: `consent.service.js:162-178`; backend route: `relayer.routes.js:311-335`.)

### Ai trả gas / dữ liệu gì mã hoá

| Tình huống | Ai trả gas | Ai khởi xướng |
|---|---|---|
| Còn quota | Sponsor wallet (backend) | Bệnh nhân (chỉ ký EIP-712) |
| Hết quota → self-pay | Ví cá nhân của user (ETH thật) | User tự ký + phát |
| Bác sĩ/tổ chức (verify, subDelegate, grantUsingDelegation...) | Luôn tự trả từ ví của họ | Chính họ |

> Lưu ý mã hoá (ngoài phạm vi tài liệu này nhưng liên quan): on-chain chỉ lưu **hash** (`encKeyHash`), khoá AES thật nằm trong payload NaCl off-chain. Backend là "blind mailbox", không giải mã được. Tài trợ gas không đụng tới phần mã hoá — nó chỉ trả phí cho việc ghi metadata/consent on-chain.

---

## 6. UI quota ở Dashboard

Màn `DashboardScreen` (v2) hiển thị thanh quota tháng:

- Query `GET /api/relayer/quota`, cache 30s — `mobile/src/screens-v2/DashboardScreen.tsx:55-59`.
- Tính `signaturesUsed = max(0, signaturesLimit - signaturesRemaining)` và `quotaPct` cho thanh progress — `DashboardScreen.tsx:75-79`.
- Khối UI "Chữ ký · tháng này" với `signaturesUsed / signaturesLimit` + thanh jade + message từ backend — `DashboardScreen.tsx:491-549`.

Ngoài Dashboard, quota cũng đi kèm precheck chia sẻ qua `grant-context` (`relayer.service.js:773-782` trả `signaturesRemaining`, `signaturesLimit`, `hasSelfWallet`) để UI cảnh báo trước khi user thao tác.

---

## 7. Bảng tổng hợp luồng theo hành động

| Hành động | Khởi xướng | Sponsor được? | Hàm relayer (nếu có) | Self-pay write tương ứng |
|---|---|---|---|---|
| Đăng ký patient/doctor | Bệnh nhân | Có (không tính quota) | `registerPatientFor`/`registerDoctorFor` | — (không có fallback) |
| Tải hồ sơ lên | Bệnh nhân | Có (tính quota) | `addRecordFor` | `RecordRegistry.addRecord` |
| Cấp quyền đọc | Bệnh nhân | Có (tính quota) | `grantBySig` | `ConsentLedger.grantBySig` |
| Thu hồi quyền | Bệnh nhân | Có (tính quota) | `revokeFor` | `ConsentLedger.revoke` |
| Uỷ quyền gốc | Bệnh nhân | Có (tính quota) | `delegateAuthorityBySig` | `ConsentLedger.delegateAuthorityBySig` |
| Người thân tin cậy | Bệnh nhân | Có (tính quota) | `setTrustedContactBySig` | (chưa thấy self-pay fallback ở service này) |
| Từ chối yêu cầu | Bệnh nhân/requester | Có (tính quota) | `rejectRequestBySig` | (chưa thấy self-pay fallback) |
| Thu hồi uỷ quyền gốc | Bệnh nhân | **Không** (thiếu BySig) | — | `ConsentLedger.revokeDelegation` (tự trả) |
| Re-share record / sub-delegate / grantUsingDelegation | Bác sĩ | **Không** (`msg.sender`) | — | luôn tự trả từ ví bác sĩ |

> ⚠️ Các ô "chưa thấy self-pay fallback" (trusted-contact, reject): tôi chỉ xác minh self-pay được dùng ở `consent.service.js`, `delegation.service.js`, `CreateRecordScreen.tsx` (kết quả Grep `withSelfPayFallback`). Nếu cần khẳng định chắc chắn, phải mở service gọi `trusted-contact`/`reject` để kiểm tra — chưa kiểm chứng trong tài liệu này.

---

## Nguồn đã đọc

- `backend/src/services/relayer.service.js` (toàn bộ — QUOTA_LIMITS, sponsorWrite, consumeQuota, checkAndResetQuota, getQuotaStatus, các sponsor*, getGrantContext)
- `backend/src/routes/relayer.routes.js` (toàn bộ — /quota, /grant, /revoke, /delegate-authority, /trusted-contact, rate-limit)
- `backend/src/routes/record.routes.js` (đoạn 160-249 luồng upload + quota; đoạn 890-929 luồng revoke 402)
- `backend/prisma/schema.prisma:90-117` (User: signaturesThisMonth, quotaResetDate, hasSelfWallet, registrationSponsored)
- `mobile/src/utils/selfPayFallback.js` (toàn bộ — isQuotaExhausted, withSelfPayFallback)
- `mobile/src/services/consent.service.js` (toàn bộ — grantConsentOnChain, delegateOnChain, revokeConsent)
- `mobile/src/services/delegation.service.js` (toàn bộ — grantAuthority, revokeAuthority, subDelegate, revokeSubDelegation, grantUsingDelegation)
- `mobile/src/services/api.js:51-85` (buildHttpError: gắn error.status/data/code)
- `mobile/src/screens-v2/DashboardScreen.tsx` (toàn bộ — UI quota)
- `mobile/src/screens-v2/CreateRecordScreen.tsx:33-39, 455-514` (self-pay upload)
- Grep `withSelfPayFallback` toàn `mobile/src` (4 file dùng)
