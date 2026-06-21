# Chức năng — Đăng nhập Web3Auth & mô hình quản lý khoá

> Tài liệu onboarding cho lập trình viên smart-contract. Phần backend & mobile được giải thích kỹ kèm khái niệm nền. Mọi khẳng định kỹ thuật đều dẫn nguồn `path:line` (đường dẫn từ gốc repo). Code là nguồn chân lý.

## Tóm tắt 30 giây

Người dùng đăng nhập bằng tài khoản quen thuộc (Email OTP, SMS OTP, hoặc 14 mạng xã hội Google/Apple/...). **Web3Auth** nhận xác thực OAuth/OTP đó rồi sinh ra một **private key Ethereum** đưa thẳng vào app (đây là "embedded wallet" — ví nhúng). App dùng private key này để ký lặng lẽ (không popup như MetaMask). Sau đó app làm một vòng **đăng nhập backend riêng**: xin `nonce`, ký message bằng ví, gửi chữ ký lên backend; backend dùng `viem.verifyMessage` để chứng minh user sở hữu ví đó, rồi cấp **JWT**. Hệ thống có 2 lớp khoá: (1) private key Ethereum để ký giao dịch/đăng nhập, (2) cặp khoá **NaCl** (mã hoá payload) suy ra tất định từ chữ ký ví. Hai điểm cần nhớ để trả lời hội đồng: **mỗi phương thức đăng nhập (verifier) cho ra một địa chỉ ví khác nhau**, và **Web3Auth KHÔNG hoàn toàn phi tập trung** vì mạng MPC của họ tham gia giữ/tái tạo khoá (khác MetaMask self-custody).

---

## 1. Khái niệm nền (cho người chưa biết mobile/crypto)

| Khái niệm | Giải thích ngắn |
|---|---|
| **Web3Auth** | Dịch vụ "social login → ví blockchain". User đăng nhập bằng Google/email, Web3Auth trả về một private key Ethereum cho app. SDK trong dự án: `@web3auth/react-native-sdk`, mạng `SAPPHIRE_DEVNET` (`mobile/src/config/web3authContext.ts:5,86`). |
| **Embedded wallet (ví nhúng)** | Ví mà private key nằm ngay trong app, không phải app ví ngoài. App tự cầm key → tự ký, **không có popup xác nhận** như MetaMask. |
| **Verifier** | "Bộ xác thực" của Web3Auth gắn với MỖI phương thức đăng nhập (Google là một verifier, email_passwordless là một verifier khác...). Verifier khác nhau → private key khác nhau → địa chỉ ví khác nhau. |
| **JWT** | "Vé thông hành" backend cấp sau khi xác thực ví. Mỗi request sau gửi kèm `Authorization: Bearer <token>` (`backend/src/middleware/auth.js:18,22`). Hết hạn mặc định 7 ngày (`backend/src/routes/auth.routes.js:165`). |
| **nonce** | Chuỗi ngẫu nhiên dùng một lần, chống replay attack. Backend sinh `crypto.randomUUID()` (`backend/src/routes/auth.routes.js:91`), nhúng vào message để user ký. |
| **viem** | Thư viện JS thao tác EVM (ký message, gọi contract). Dùng cả ở mobile (`walletClient.signMessage`) và backend (`verifyMessage`). |
| **NaCl box** | Sơ đồ mã hoá khoá-công-khai (tweetnacl). Trong dự án dùng để mã hoá payload chia sẻ hồ sơ. Cặp khoá NaCl suy ra tất định từ chữ ký ví (`mobile/src/services/nacl-crypto.js:135-136`). KHÁC private key Ethereum. |
| **SecureStore** | Kho lưu bí mật của thiết bị (Keychain iOS / Keystore Android). App lưu JWT, user_data, roles ở đây (`mobile/src/store/authStore.js:114-123`). Chỉ chấp nhận key ký tự `[a-zA-Z0-9._-]`. |
| **AsyncStorage** | Kho lưu thường (không bảo mật bằng SecureStore) — dùng cho cặp khoá NaCl đã mã hoá (`mobile/src/services/nacl-crypto.js:142-144`). |

---

## 2. Luồng đăng nhập end-to-end

### 2.1 Sơ đồ tổng quát

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ MOBILE (React Native)                                                         │
│                                                                              │
│  [LoginScreen v2]  user chọn provider (email / sms / 14 social)              │
│   screens-v2/LoginScreen.tsx:181 handleWeb3Login                            │
│        │                                                                     │
│        │ (email/sms → modal nhập loginHint trước)                           │
│        ▼                                                                     │
│  walletActionService.ensureWeb3AuthReady()   ──► web3auth.init()           │
│   walletAction.service.js:155,126                                           │
│        ▼                                                                     │
│  walletActionService.loginWithWeb3Auth(provider, {loginHint})              │
│   walletAction.service.js:304 (hàm) → web3auth.login(loginParams) :333      │
│        │   (mở Custom Tab/trình duyệt: OAuth Google hoặc nhập OTP)         │
│        ▼                                                                     │
│  Web3Auth trả private key ──► getWalletContext()                            │
│   walletAction.service.js:171 (hàm) → privateKeyToAccount → walletClient,address :221-227 │
└─────────────────────────────────────────────────────────────────────────────┘
        │  address (địa chỉ ví)
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ BACKEND ĐĂNG NHẬP (chứng minh sở hữu ví)                                      │
│                                                                              │
│  authService.ping()                          auth.service.js                │
│  GET /api/auth/nonce/:address  ──► message có "Nonce: <uuid>"              │
│   auth.routes.js:74 (tạo user nếu chưa có + sinh nonce)                     │
│        ▼                                                                     │
│  walletClient.signMessage(message)   (ký LẶNG LẼ, không popup)             │
│   walletAction.service.js:256                                               │
│        ▼                                                                     │
│  POST /api/auth/login {walletAddress, message, signature}                  │
│   auth.routes.js:114                                                        │
│     ├─ check message chứa đúng nonce       auth.routes.js:132-135          │
│     ├─ viem.verifyMessage(addr,msg,sig)    auth.routes.js:137              │
│     ├─ rotate nonce + update lastLogin     auth.routes.js:147-154          │
│     ├─ getUserRole(address) ◄── đọc on-chain  auth.routes.js:156          │
│     └─ jwt.sign({walletAddress, ...roleFlags})  auth.routes.js:159        │
│        ▼                                                                     │
│  trả {token, user, roles}                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ MOBILE LƯU PHIÊN + ĐĂNG KÝ KHOÁ MÃ HOÁ                                        │
│                                                                              │
│  authStore.login(token, user, roles)   store/authStore.js:85              │
│    ├─ clear cache cũ (tránh leak account A→B)  authStore.js:99-111         │
│    ├─ SecureStore: jwt_token, user_data, auth_roles  authStore.js:114-123 │
│    └─ set isAuthenticated=true + activeRole                                 │
│        ▼                                                                     │
│  getOrCreateEncryptionKeypair(walletClient, address)  LoginScreen:230      │
│    (ký message tất định → suy ra cặp khoá NaCl)                            │
│        ▼                                                                     │
│  POST /api/auth/encryption-key {pubKey, sig, msg}  auth.routes.js:241     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Diễn giải từng bước

**Bước 1 — Chọn provider (UI).** `LoginScreen` cho 3 lựa chọn lớn: Email OTP (mặc định), SMS OTP, và lưới 14 mạng xã hội (3 primary Google/Apple/Facebook + "Xem thêm" 11 cái) — `mobile/src/screens-v2/LoginScreen.tsx:79-98,468-508`. Với email/sms, app mở modal hỏi `loginHint` (email hoặc số điện thoại E.164) trước khi gọi Web3Auth — `LoginScreen.tsx:194-199,141`. SMS bắt buộc có `loginHint`, email thì khuyến nghị (để bỏ qua form nhập của Web3Auth) — `walletAction.service.js:300-302`.

**Bước 2 — Khởi tạo + đăng nhập Web3Auth.** `ensureWeb3AuthReady` gọi `web3auth.init()` một lần (có timeout 30s) — `walletAction.service.js:155,115,15`. Sau đó `loginWithWeb3Auth` gọi `web3auth.login({loginProvider, redirectUrl, extraLoginOptions})` (timeout 120s) — `walletAction.service.js:304,332-336,16`. Với social OAuth chuẩn, app thêm `prompt: 'select_account'` để **bắt user chọn lại tài khoản** (tránh bug "logout xong login user khác vẫn vào dashboard cũ" do browser cache cookie) — `walletAction.service.js:318-328`.

**Bước 3 — Lấy private key & dựng ví (`getWalletContext`).** Sau login, Web3Auth lưu private key vào `privateKeyProvider.state.privateKey`. App đọc TRỰC TIẾP từ state làm nguồn chính (vì route RPC `eth_private_key` đôi khi trả null ngay sau login) — `walletAction.service.js:192-210`. Từ private key, dùng viem `privateKeyToAccount` + `createWalletClient` để dựng `walletClient` và lấy `address` — `walletAction.service.js:220-244`. **Private key chỉ nằm trong RAM**, không bao giờ ghi xuống đĩa — `walletAction.service.js:20-25`. Có check chéo: địa chỉ suy từ private key phải khớp `eth_accounts` — `walletAction.service.js:229-236`.

**Bước 4 — Đăng nhập backend (nonce + ký + verify).** Đây là bước quan trọng cần hiểu rõ:

1. `GET /api/auth/nonce/:address` — backend tìm/ tạo user theo địa chỉ ví, sinh `nonce = crypto.randomUUID()`, rồi trả về một **message** dạng `Sign this message to login to EHR System.\n\nNonce: <nonce>\nTimestamp: <Date.now()>` — `backend/src/routes/auth.routes.js:74,91,103`. Lưu ý: chính endpoint nonce là nơi **tạo user lần đầu** trong DB nếu chưa có — `auth.routes.js:87-94`.
2. App ký message này bằng `walletClient.signMessage` — `LoginScreen.tsx:216`, `walletAction.service.js:256-272`. **Ký lặng lẽ, không có popup** (vì app cầm private key).
3. `POST /api/auth/login {walletAddress, message, signature}` — backend:
   - kiểm tra message chứa đúng `Nonce: <nonce>` đang lưu — `auth.routes.js:132-135`;
   - gọi `verifyMessage({address, message, signature})` của viem để xác minh chữ ký thực sự do chủ ví ký — `auth.routes.js:137-141`;
   - **rotate nonce** (sinh UUID mới) + cập nhật `lastLogin` để chữ ký cũ không tái sử dụng được — `auth.routes.js:147-154`;
   - đọc role on-chain qua `getUserRole(address)` — `auth.routes.js:156`;
   - ký JWT chứa `{walletAddress, ...roleFlags}` — `auth.routes.js:159-166`;
   - trả `{token, user, roles}` — `auth.routes.js:168-172`.

**Bước 5 — Lưu phiên (mobile).** `authStore.login` xoá sạch cache của user trước (chống rò rỉ chéo account), lưu `jwt_token`/`user_data`/`auth_roles` vào SecureStore, set `isAuthenticated=true` — `mobile/src/store/authStore.js:85,99-123,125-134`.

**Bước 6 — Đăng ký khoá mã hoá NaCl.** App gọi `getOrCreateEncryptionKeypair`, ký một message tất định, suy ra cặp khoá NaCl, rồi `POST /api/auth/encryption-key` gửi public key + chữ ký lên backend — `LoginScreen.tsx:230-233`. Backend verify chữ ký và bắt message phải chứa 20 ký tự đầu của public key (chống đăng ký khoá rác) rồi lưu vào `encryptionPublicKey` — `backend/src/routes/auth.routes.js:241,245-262`. Bước này nằm trong `try/catch` riêng — nếu lỗi vẫn cho đăng nhập, chỉ log cảnh báo — `LoginScreen.tsx:234-236`.

### 2.3 Ai trả gas / ai đọc được gì

| Hạng mục | Trả lời (có nguồn) |
|---|---|
| **Gas khi đăng nhập** | KHÔNG tốn gas. Toàn bộ luồng đăng nhập chỉ là ký message off-chain + verify (`signMessage`/`verifyMessage`), không có transaction on-chain — `walletAction.service.js:256`, `auth.routes.js:137`. |
| **Backend đọc role từ đâu** | On-chain qua `getUserRole` (đọc AccessControl), KHÔNG tin role do client gửi — `auth.routes.js:156`, `backend/src/config/blockchain.js:298`. |
| **Private key ai cầm** | Chỉ nằm trong RAM app phiên hiện tại, không persist — `walletAction.service.js:20-25`. (Nhưng xem §5: Web3Auth/MPC network về lý thuyết có thể tái tạo.) |
| **Khoá NaCl ai đọc được** | Secret key NaCl được mã hoá rồi mới lưu AsyncStorage; chỉ tái tạo được từ chữ ký ví của chính user — `nacl-crypto.js:140-142,135`. |

---

## 3. Vì sao MỖI phương thức đăng nhập cho ra MỘT địa chỉ ví khác nhau

Đây là câu hội đồng hay hỏi. Cơ chế:

- Web3Auth gắn mỗi phương thức đăng nhập với **một verifier riêng**. SDK lưu session theo `sessionId` + **TÊN VERIFIER** — chú thích trong code nêu rõ điều này: *"Web3Auth lưu session keyed bằng 'sessionId' + TÊN VERIFIER (KeyStore.set(verifier, …))"* — `mobile/src/config/web3authContext.ts:69-73`.
- Private key được Web3Auth dẫn xuất gắn với identity của verifier đó. Đăng nhập Google (verifier A) và Email OTP (verifier B) là **hai identity khác nhau** → hai private key khác nhau → **hai địa chỉ ví khác nhau** → backend coi là **hai user khác nhau** (vì backend định danh user bằng `walletAddress` — `auth.routes.js:82,119`).

**Hệ quả thực tế cần nói với hội đồng:** nếu user lần đầu đăng nhập bằng Google rồi lần sau đăng nhập bằng Email, họ sẽ "mất" hồ sơ cũ vì đó là ví/tài khoản khác. App KHÔNG có cơ chế gộp các verifier về cùng một ví. Đây là đặc tính của thiết kế Web3Auth dùng trong dự án (không tự bịa giải pháp aggregate verifier ở đây — ⚠️ chưa thấy code aggregate verifier trong repo).

```
 Đăng nhập Google     ──► verifier "google"            ──► privKey₁ ──► 0xAAA... ──► User A
 Đăng nhập Email OTP  ──► verifier "email_passwordless"──► privKey₂ ──► 0xBBB... ──► User B
 Đăng nhập SMS OTP    ──► verifier "sms_passwordless"  ──► privKey₃ ──► 0xCCC... ──► User C
        (cùng một con người, nhưng hệ thống thấy 3 ví / 3 user khác nhau)
```

---

## 4. Embedded wallet: ký lặng lẽ vs MetaMask

- **MetaMask (self-custody):** key nằm trong extension/ app ví; mỗi lần ký hiện **popup** để user duyệt; dApp KHÔNG bao giờ thấy private key.
- **Web3Auth embedded wallet (dự án này):** Web3Auth đưa private key **vào trong app**. App đọc key (`privateKeyProvider.state.privateKey`), tự dựng `walletClient` viem, và **tự ký không cần hỏi user** — `walletAction.service.js:193,221-227,256`.

Ưu điểm: UX mượt cho người không rành crypto (đăng nhập như app thường, không cần seed phrase). Nhược điểm về bảo mật: vì app cầm key, **mọi chữ ký xảy ra ngầm** — nếu app bị chèn mã độc, key có thể bị trích xuất. Dự án giảm thiểu bằng cách: chỉ giữ key trong RAM, không persist (`walletAction.service.js:20-25`), và xoá `cachedWalletContext` khi logout (`walletAction.service.js:380`).

---

## 5. Web3Auth có thực sự phi tập trung? (trả lời trung thực cho hội đồng)

**Không hoàn toàn.** Cần trình bày thẳng:

- Web3Auth dùng **mạng MPC / key management network** của họ để dẫn xuất và tái tạo private key từ phương thức đăng nhập (đăng nhập lại bằng cùng verifier → ra lại đúng key). Nghĩa là **việc tạo và tái tạo khoá phụ thuộc hạ tầng bên thứ ba của Web3Auth**, không phải thuần self-custody như MetaMask.
- Dự án chạy trên mạng `SAPPHIRE_DEVNET` (mạng devnet của Web3Auth) — `mobile/src/config/web3authContext.ts:86`. Phụ thuộc `clientId` của Web3Auth (`web3authContext.ts:10-15`) và phải whitelist `redirectUrl` (`erhsystem://auth`) trên Web3Auth Dashboard — `walletAction.service.js:13-14`.
- Tài liệu của Web3Auth gọi mô hình của họ là MPC/threshold — không lưu key tập trung ở một chỗ, nhưng mạng của họ vẫn tham gia vào quy trình. **⚠️ Chi tiết kiến trúc MPC nội bộ của Web3Auth nằm ngoài repo này (không có trong code) → chưa kiểm chứng từ code; chỉ nên trình bày ở mức "phụ thuộc dịch vụ bên thứ ba, không thuần self-custody".**

**So sánh ngắn để bảo vệ:**

| Tiêu chí | MetaMask | Web3Auth (dự án) |
|---|---|---|
| Ai giữ/tái tạo key | User (seed phrase) | Mạng MPC Web3Auth + đăng nhập social/OTP |
| Popup khi ký | Có | Không (ký ngầm trong app) |
| UX cho người thường | Khó (seed phrase) | Dễ (login như app thường) |
| Mức phi tập trung | Cao (self-custody) | Trung bình (phụ thuộc dịch vụ bên thứ ba) |
| Nguồn trong repo | — | `web3authContext.ts:84-92`, `walletAction.service.js:193,256` |

**Cách "chốt" trước hội đồng:** chọn Web3Auth là đánh đổi *usability ↔ decentralization*. Trọng tâm thesis là **an toàn & riêng tư on-chain của hồ sơ** (consent, mã hoá payload), còn lớp ví chỉ là phương tiện ký; nếu cần phi tập trung tuyệt đối có thể thay bằng ví self-custody mà không đổi phần on-chain.

---

## 6. Caveat: SDK không tự restore session sau cold start

Đây là gotcha quan trọng (đúng với CLAUDE.md #10, đã verify trong code):

- Khi app khởi động lại (cold start), **JWT vẫn còn trong SecureStore** → backend vẫn tin user. NHƯNG Web3Auth SDK v8.1.0 **KHÔNG tự khôi phục private key** vào RAM → `privateKeyProvider.state.privateKey` rỗng → **không ký/giải mã được gì** (trạng thái "đăng nhập nửa vời").
- `hasActiveSession()` trả `true` chỉ khi state thực sự có private key — `walletAction.service.js:373-375`.
- `authStore.loadToken` xử lý: sau khi restore JWT và sync `/api/auth/me`, nó gọi `ensureWeb3AuthReady()` rồi kiểm tra `hasActiveSession()`. Nếu Web3Auth chưa có key → **coi như chưa đăng nhập**: clear JWT, đưa user thẳng về LoginScreen (không nhấp nháy dashboard rồi mới redirect) — `mobile/src/store/authStore.js:399-432`.
- Nếu `getWalletContext` được gọi mà không có key, nó ném lỗi mã `WEB3AUTH_SESSION_EXPIRED` để caller buộc đăng nhập lại — `walletAction.service.js:163,211-218`.

```
Cold start
  │
  ▼
loadToken: đọc jwt_token từ SecureStore  ──► có
  │
  ▼  GET /api/auth/me  (backend OK vì JWT còn hạn)
  │
  ▼  ensureWeb3AuthReady() + hasActiveSession()?
        ├─ true  → set isAuthenticated=true (vào app)
        └─ false → clear JWT + về LoginScreen   (authStore.js:401-416)
```

---

## 7. Multi-role (một ví, nhiều vai trò)

- Backend suy role từ on-chain flags qua `buildAppRoles` → mảng `roles` thứ tự ưu tiên `['ministry','org','doctor','patient']` — `backend/src/routes/auth.routes.js:38-56`. Cùng một logic ưu tiên ở mobile (`mobile/src/utils/authRoles.js:1,28-48`).
- `authStore` giữ `availableRoles` (tất cả role user có) và `activeRole` (role đang dùng) — `store/authStore.js:80-83`.
- Khi user có **nhiều hơn 1 role** và chưa chọn lần nào → `needsRoleSelection=true` → hiện `RoleSelectionScreen` ở chế độ chọn — `store/authStore.js:64-66`, `screens-v2/RoleSelectionScreen.tsx:120-128,383-398`.
- Khi user **chưa có role nào** on-chain → `needsRoleRegistration=true` → `RoleSelectionScreen` ở chế độ đăng ký (patient/doctor) — `store/authStore.js:55-62`, `RoleSelectionScreen.tsx:48-63,159-185`.
- Đăng ký role gọi `roleRegistrationService.register` rồi poll backoff 1s/2s/4s chờ event sync về DB — `RoleSelectionScreen.tsx:163-178`.
- Chọn role xong → `completeRoleSelection` lưu `auth_roles` + đánh dấu đã chọn (`markRoleSelectionDone`) — `store/authStore.js:254-274`. Đổi role lúc đang dùng app: `switchRole` — `store/authStore.js:276-287`.

---

## 8. Sanitize SecureStore key (bug fix quan trọng)

SecureStore của Expo chỉ chấp nhận key gồm ký tự `[a-zA-Z0-9._-]`. Có hai chỗ từng gây crash đăng nhập:

1. **Key session của Web3Auth.** Web3Auth lưu session theo tên verifier; một số verifier (đặc biệt `email_passwordless`) chứa ký tự SecureStore từ chối → ném *"Invalid key"* → crash login (trong khi Google vẫn chạy). Fix: bọc SecureStore bằng `secureStoreSafe`, chuẩn hoá key qua `sanitizeSecureStoreKey` (thay ký tự lạ thành `_`, rỗng thì dùng `w3a_default`) rồi truyền vào constructor Web3Auth — `mobile/src/config/web3authContext.ts:69-92`.
2. **Key đánh dấu đã chọn role.** Hàm `roleSelectionDoneKey` dùng format `role_selection_done_<address>` (KHÔNG dùng dấu `:` vì sẽ gây "Invalid key") — `mobile/src/store/authStore.js:25-30`. Đây là fix cho bug tài khoản multi-role crash khi login.

> Mẹo trả lời hội đồng: cả hai đều là cùng một class bug — *key của SecureStore có ký tự không hợp lệ* — và được xử lý bằng cách chuẩn hoá / tránh ký tự cấm.

---

## 9. Bảo mật của vòng đăng nhập backend (điểm mạnh để nêu)

| Cơ chế | Tác dụng | Nguồn |
|---|---|---|
| nonce dùng-một-lần + rotate sau login | chống replay chữ ký | `auth.routes.js:91,132-135,150` |
| `verifyMessage` (ECDSA recover) | chứng minh chủ ví thật sự ký, không cần gửi private key | `auth.routes.js:137-141` |
| role đọc on-chain, không tin client | client không tự nâng quyền | `auth.routes.js:156`, `blockchain.js:298` |
| JWT verify mọi request được bảo vệ | gate route | `backend/src/middleware/auth.js:14-46` |
| đăng ký encryption key buộc chữ ký + tham chiếu pubkey | chống đăng ký khoá giả | `auth.routes.js:245-257` |
| clear cache + abort request khi login/logout | chống rò rỉ dữ liệu account A sang B | `store/authStore.js:99-111,146-204` |

---

## Nguồn đã đọc

- `mobile/src/config/web3authContext.ts` — khởi tạo Web3Auth, verifier, sanitize SecureStore key, mạng SAPPHIRE_DEVNET, redirectUrl.
- `mobile/src/store/authStore.js` — login/logout/loadToken, multi-role, kiểm tra `hasActiveSession` chống cold-start nửa vời, roleSelectionDoneKey.
- `mobile/src/services/auth.service.js` — client gọi nonce/login/encryption-key.
- `mobile/src/services/walletAction.service.js` — init/login Web3Auth, getWalletContext (đọc private key, dựng walletClient), signMessage/signTypedData, WEB3AUTH_SESSION_EXPIRED, logout.
- `mobile/src/screens-v2/LoginScreen.tsx` — UI chọn provider, loginHint modal, luồng handleWeb3Login, đăng ký encryption key.
- `mobile/src/screens-v2/RoleSelectionScreen.tsx` — chế độ đăng ký vs chọn role, backoff poll.
- `backend/src/routes/auth.routes.js` — endpoint nonce/login/me/pubkey/encryption-key, buildAppRoles, verifyMessage, JWT sign.
- `backend/src/middleware/auth.js` — authenticate/optionalAuth JWT verify.
- `backend/src/config/blockchain.js` (phần `getUserRole`) — đọc role on-chain + retry 429.
- `mobile/src/utils/authRoles.js` — chuẩn hoá/ưu tiên role.
- `mobile/src/services/nacl-crypto.js` — dẫn xuất cặp khoá NaCl tất định từ chữ ký ví, lưu mã hoá, getOrCreateEncryptionKeypair.
