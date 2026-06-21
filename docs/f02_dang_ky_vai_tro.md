# Chức năng — Đăng ký vai trò (patient/doctor) & public key

## Tóm tắt 30 giây

Sau khi đăng nhập (Web3Auth → ví), nếu tài khoản **chưa có vai trò nào on-chain**, app đưa người dùng vào màn `RoleSelectionScreen` để **đăng ký** vai trò `patient` hoặc `doctor`. App gọi backend `POST /api/relayer/register`, backend dùng **ví sponsor** ký và gửi transaction `registerPatientFor` / `registerDoctorFor` lên contract `AccessControl` (người dùng **KHÔNG trả gas**). Contract set **role bit** bằng phép OR bitwise (cho phép giữ nhiều vai trò). Việc đăng ký vai trò **không tốn quota** (quota 100 chữ ký/tháng chỉ áp cho các hành động sau này như upload/share/revoke).

Song song với đó, mỗi lần đăng nhập app sinh một **NaCl public key** (khoá mã hoá, khác với địa chỉ ví) và lưu lên backend qua `POST /api/auth/encryption-key`. Public key này là cách để **người khác mã hoá key-share gửi đến mình** — bắt buộc có thì người khác mới chia sẻ hồ sơ mã hoá cho bạn được.

> Lưu ý điều dễ nhầm: doctor đăng ký xong chỉ là **DOCTOR (chưa verified)**. Cần Tổ chức/Bộ Y tế gọi `verifyDoctor` thì mới đọc được hồ sơ được share. Đó là 2 bước tách biệt — tài liệu này chỉ nói bước **đăng ký**.

---

## 1. Bức tranh tổng thể: 2 thứ "đăng ký" khác nhau

Người đọc rành smart-contract cần phân biệt rõ 2 khái niệm bị gọi chung là "đăng ký", chúng **độc lập** nhau:

| | (A) Đăng ký vai trò on-chain | (B) Đăng ký NaCl public key (off-chain) |
|---|---|---|
| Lưu ở đâu | Contract `AccessControl` (`_roles[address]`) | Postgres (`User.encryptionPublicKey`) |
| Là gì | Role bit (PATIENT=1, DOCTOR=2...) | Khoá công khai mã hoá (curve25519) |
| Ai trả gas | Ví sponsor backend (miễn phí cho user) | Không có gas — chỉ là HTTP ghi DB |
| Mục đích | Phân quyền: ai được làm gì on-chain | Để người khác mã hoá payload key-share gửi cho mình |
| Khi nào xảy ra | Lần đầu, ở `RoleSelectionScreen` | Mỗi lần đăng nhập (idempotent, ghi đè) |

> ⚠️ Đừng nhầm "public key" của ví (dùng để ký/verify chữ ký, suy ra địa chỉ) với "NaCl encryption public key" (dùng để mã hoá hộp NaCl box). Backend lưu cả hai field riêng: `User.publicKey` và `User.encryptionPublicKey`. Field thực sự dùng cho key-share là `encryptionPublicKey`. Nguồn: `backend/src/routes/auth.routes.js:184` (publicKey) vs `backend/src/routes/auth.routes.js:261` (encryptionPublicKey).

---

## 2. Khái niệm nền (cho người không biết backend/mật mã)

**Relayer / gas sponsor.** Người dùng đăng nhập bằng tài khoản mạng xã hội (Web3Auth) thường không có ETH để trả phí gas. Giải pháp: backend giữ một ví riêng (`SPONSOR_PRIVATE_KEY`) có ETH; ví này thay mặt user gửi transaction và trả gas. Contract có cơ chế cho phép "đăng ký hộ": hàm `registerPatientFor(user)` chỉ cho phép địa chỉ nằm trong danh sách `authorizedRelayers` gọi. Nguồn: `backend/src/services/relayer.service.js:32-34`, `contracts/src/AccessControl.sol:280`.

**NaCl box (mã hoá bất đối xứng).** Thư viện `tweetnacl`. Mỗi user có cặp khoá (publicKey, secretKey). Ai biết `publicKey` của bạn thì mã hoá được dữ liệu mà **chỉ bạn (có secretKey) giải mã được**. Trong hệ thống này, khi A chia sẻ hồ sơ cho B, A mã hoá `{cid, aesKey}` bằng `encryptionPublicKey` của B → đó là "key-share". Vì vậy B **phải** đã đăng ký `encryptionPublicKey` lên backend trước. Nguồn: `mobile/src/services/nacl-crypto.js:27-39` (`encryptForRecipient`).

**Khoá NaCl được sinh thế nào — và tại sao khôi phục được.** Khoá KHÔNG random. Nó được suy ra **deterministically** từ chữ ký ví: app yêu cầu ví ký message cố định `EHR-Sign-Encryption-Key-v1\nWallet: <addr>`, lấy `keccak256(signature + address + salt)` làm seed cho `nacl.box.keyPair.fromSecretKey`. Cùng ví → cùng chữ ký → cùng khoá. Nhờ vậy mất máy vẫn lấy lại được khoá (chỉ cần đăng nhập lại ví). Nguồn: `mobile/src/services/nacl-crypto.js:72-80`, `:121-147`.

---

## 3. Role bits trên contract `AccessControl`

Vai trò biểu diễn bằng **bitwise flags** trên một `uint8` (`mapping(address => uint8) private _roles`). Nguồn: `contracts/src/AccessControl.sol:23-36`.

| Cờ | Giá trị | Bit |
|---|---|---|
| PATIENT | `1 << 0` = 1 | `0000 0001` |
| DOCTOR | `1 << 1` = 2 | `0000 0010` |
| ORGANIZATION | `1 << 2` = 4 | `0000 0100` |
| MINISTRY | `1 << 3` = 8 | `0000 1000` |
| VERIFIED_DOCTOR | `1 << 4` = 16 | `0001 0000` |
| VERIFIED_ORG | `1 << 5` = 32 | `0010 0000` |

Nguồn: `contracts/src/AccessControl.sol:23-30`.

- **Thêm vai trò = OR.** `_roles[user] |= PATIENT;` → giữ nguyên các cờ cũ, chỉ bật thêm. Vì vậy một người có thể vừa là patient vừa là doctor. Nguồn: `contracts/src/AccessControl.sol:282`, `:290`, và comment giải thích bitwise tại `:14-20`.
- **Kiểm tra vai trò = AND.** `isPatient` trả `(_roles[user] & PATIENT) != 0`. Nguồn: `contracts/src/AccessControl.sol:438-440`.
- **VERIFIED_DOCTOR là FLAG, không phải role riêng.** `isVerifiedDoctor` yêu cầu CẢ cờ VERIFIED_DOCTOR **VÀ** `doctorVerifications[user].active == true`. Nguồn: `contracts/src/AccessControl.sol:446-449`.

### Các hàm đăng ký trên contract

Có 2 nhóm hàm — quan trọng: flow thực tế của app dùng nhóm **relayer**, không phải nhóm self.

| Hàm | Ai gọi được | Set cờ | Event | Nguồn |
|---|---|---|---|---|
| `registerAsPatient()` | bất kỳ ai (self, tự trả gas) | `\|= PATIENT` | `UserRegistered(sender, "PATIENT")` | `AccessControl.sol:258-262` |
| `registerAsDoctor()` | bất kỳ ai (self) | `\|= DOCTOR` | `UserRegistered(sender, "DOCTOR_UNVERIFIED")` | `AccessControl.sol:264-268` |
| **`registerPatientFor(user)`** | **chỉ relayer** (`onlyRelayer`) | `\|= PATIENT` | `UserRegistered(user, "PATIENT")` | `AccessControl.sol:280-284` |
| **`registerDoctorFor(user)`** | **chỉ relayer** (`onlyRelayer`) | `\|= DOCTOR` | `UserRegistered(user, "DOCTOR_UNVERIFIED")` | `AccessControl.sol:286-292` |

`onlyRelayer` chặn bằng `if (!authorizedRelayers[msg.sender]) revert NotAuthorized();`. Nguồn: `contracts/src/AccessControl.sol:85-88`. Ví sponsor được set vào `authorizedRelayers` lúc deploy (xem CLAUDE.md mục 3 wiring — chưa kiểm chứng trong file này, nhưng backend có kiểm tra runtime tại `relayer.service.js:207-219`).

> Doctor đăng ký xong KHÔNG có cờ VERIFIED_DOCTOR (event ghi rõ `"DOCTOR_UNVERIFIED"`). Verify là một bước riêng do Org admin (`verifyDoctor`, `AccessControl.sol:314`) hoặc Bộ Y tế (`verifyDoctorByMinistry`, `:321`) thực hiện.

---

## 4. Luồng end-to-end: Đăng ký vai trò

### Sơ đồ ASCII

```
  MOBILE                                BACKEND                          ON-CHAIN / DB
  ──────                                ───────                          ─────────────

[RoleSelectionScreen]
 user chọn patient/doctor
 → modal consent → Đồng ý
        │
        │ roleRegistrationService.register(role)
        │   POST /api/relayer/register { role }
        ▼
                            [relayer.routes.js:120]
                            authenticate + sponsoredWriteLimit (20/phút)
                            registerSchema.parse → role ∈ {patient,doctor}
                            (KHÔNG check quota — comment :124)
                                    │
                                    │ role==patient → sponsorRegisterPatient(wallet)
                                    ▼
                            [relayer.service.js:340]
                            đọc isPatient(wallet) ───────────────────►  AccessControl.isPatient
                                    │                                   (read)
                            nếu đã đăng ký → upsert User              ◄── true → {alreadyRegistered}
                            registrationSponsored=true, return
                                    │
                            nếu chưa: sponsorWrite(registerPatientFor)──► AccessControl.registerPatientFor(wallet)
                                    │   (ví sponsor ký + trả gas)          _roles[user] |= PATIENT
                            waitForTransactionReceipt                      emit UserRegistered
                                    │
                            upsert User(registrationSponsored=true) ───► Postgres
                            invalidateRoleCache(wallet)  (:380)
                                    │
                            ◄── { success, txHash }
        │
        │ poll: refreshAuthSession() x3 (1s,2s,4s)
        │   GET /api/auth/me → roles có "patient"?
        ▼
 set availableRoles → vào app
```

### Diễn giải từng bước (kèm nguồn)

**B1 — UI chọn vai trò.** `RoleSelectionScreen` ở chế độ `registrationMode` khi `needsRoleRegistration || roles.length === 0`. Chỉ cho đăng ký 2 vai trò: `patient`, `doctor` (`REGISTRATION_OPTIONS`). Nguồn: `mobile/src/screens-v2/RoleSelectionScreen.tsx:48-63`, `:139`.

- Khi `needsRoleRegistration` được bật? Trong `authStore` khi user **không có vai trò nào** (`availableRoles` rỗng). Nguồn: `mobile/src/store/authStore.js:53-62`.
- User bấm "Đồng ý + đăng ký" trong modal consent → gọi `handleRegisterRole`. Nguồn: `RoleSelectionScreen.tsx:196-199`.

**B2 — Service mobile gọi backend.** `roleRegistrationService.register(role)` = `POST /api/relayer/register { role }`. Nguồn: `mobile/src/services/roleRegistration.service.js:4-6`.

**B3 — Route backend.** `POST /api/relayer/register`: qua `authenticate` (cần JWT) + `sponsoredWriteLimit` (chặn burst 20 tx/phút/ví). Validate `role ∈ {patient, doctor}` bằng zod. **Không check quota** — comment ghi rõ user được đăng ký cả 2 vai trò. Nguồn: `backend/src/routes/relayer.routes.js:27-29`, `:120-124`.

**B4 — Service relayer + giao dịch on-chain.**
- `sponsorRegisterPatient`: đọc `isPatient` trước; nếu đã đăng ký → trả `{alreadyRegistered:true}` (idempotent), không gửi tx. Nguồn: `backend/src/services/relayer.service.js:344-358`.
- Nếu chưa: gọi `sponsorWrite({ functionName: 'registerPatientFor', args:[address] })`. `sponsorWrite` đẩy qua **một hàng đợi tuần tự** để ví sponsor không bị trùng nonce khi nhiều tx đồng thời. Nguồn: `relayer.service.js:60-67`, `:360-365`.
- Đợi receipt rồi `upsert` `User.registrationSponsored=true` và `invalidateRoleCache(address)` để lần `GET /auth/me` sau đọc lại role mới (cache role TTL 10 phút). Nguồn: `relayer.service.js:367-382`.
- `sponsorRegisterDoctor` y hệt nhưng đọc `isDoctor` và gọi `registerDoctorFor`. Nguồn: `relayer.service.js:385-425`.

**B5 — Contract set bit.** `registerPatientFor` / `registerDoctorFor` set cờ bằng OR và emit `UserRegistered`. Nguồn: `contracts/src/AccessControl.sol:280-292`.

**B6 — Kết quả & đồng bộ về app.** Sau khi backend trả `txHash`, app **poll** `refreshAuthSession()` 3 lần với backoff 1s/2s/4s, mỗi lần gọi `GET /api/auth/me` để xem role đã lên chưa. Nếu sau 3 lần vẫn chưa → hiện alert "Đang đồng bộ" rồi vẫn `completeRoleSelection(role)` (cho vào app). Nguồn: `RoleSelectionScreen.tsx:163-178`. `refreshAuthSession` cập nhật `availableRoles` từ `me.roles`. Nguồn: `authStore.js:220-252`.

---

## 5. Ai trả gas? Quan hệ với quota

| Hành động | Ai trả gas | Có trừ quota không? |
|---|---|---|
| Đăng ký patient/doctor (`/api/relayer/register`) | **Ví sponsor backend** | **KHÔNG** — không gọi `consumeQuota`. Nguồn: `relayer.routes.js:124`, và `sponsorRegisterPatient/Doctor` không gọi `consumeQuota` (`relayer.service.js:340-425`) |
| Upload record, grant/share, revoke, delegate, reject... | Ví sponsor backend | **CÓ** — mỗi hành động gọi `consumeQuota` (vd `relayer.service.js:431`, `:480`, `:509`) |

Quota là **pool thống nhất 100 chữ ký/tháng** cho mỗi user. Nguồn: `relayer.service.js:21-23`. Quan hệ với đăng ký vai trò:
- **Đăng ký KHÔNG tốn quota** (cố tình, để user đăng ký được cả patient lẫn doctor).
- Nhưng đăng ký vẫn dính `sponsoredWriteLimit` (rate-limit 20 tx/phút/ví) để chống spam. Nguồn: `relayer.routes.js:19-24`, `:120`.
- Khi hết quota cho các hành động khác, backend trả lỗi `429 QUOTA_EXHAUSTED`; lúc đó user phải tự trả gas bằng ví có ETH. Nguồn: `relayer.service.js:299-304`.
- `consumeQuota` dùng `updateMany` có điều kiện `signaturesThisMonth < 100` để **tăng atomic** — tránh 2 request đồng thời cùng vượt cap (F15 fix). Nguồn: `relayer.service.js:292-307`.

> Lưu ý mô hình 2026-06-21: **mọi** user (login mạng xã hội hay ví ngoài) đều dùng chung pool 100/tháng; không special-case ví ngoài. Nguồn comment: `relayer.service.js:281-284`.

---

## 6. Đăng ký NaCl public key (để người khác key-share tới)

Đây là phần **quan trọng cho mã hoá**: nếu thiếu, không ai chia sẻ hồ sơ mã hoá cho bạn được.

### Khi nào & ai gọi
Ngay sau khi login thành công, `LoginScreen` tự động:
1. Sinh khoá deterministic: `getOrCreateEncryptionKeypair(walletClient, address)` (yêu cầu ví ký message dẫn xuất khoá). Nguồn: `mobile/src/screens/LoginScreen.tsx:289`, `mobile/src/services/nacl-crypto.js:125-147`.
2. Tạo message chứng minh sở hữu: `"Register EHR encryption key: <20 ký tự đầu của publicKey>"` và yêu cầu ví ký. Nguồn: `LoginScreen.tsx:290-291`.
3. Gửi lên backend: `authService.registerEncryptionKey(publicKey, signature, message)` = `POST /api/auth/encryption-key`. Nguồn: `LoginScreen.tsx:292`, `mobile/src/services/auth.service.js:37-39`.

Nếu bước này lỗi, login vẫn tiếp tục (chỉ `console.warn`). Nguồn: `LoginScreen.tsx:293-295`.

### Backend xác minh & lưu
`POST /api/auth/encryption-key` làm 3 việc trước khi ghi:
1. `verifyMessage` rằng `signature` đúng là do ví đó ký `message` (chứng minh sở hữu ví). Nguồn: `backend/src/routes/auth.routes.js:245-253`.
2. Kiểm tra `message` có chứa 20 ký tự đầu của `encryptionPublicKey` (ràng buộc message ↔ key, chống đưa key lạ). Nguồn: `auth.routes.js:255-257`.
3. Ghi `User.encryptionPublicKey`. Nguồn: `auth.routes.js:259-263`.

### Ai đọc được key này
Bất kỳ ai (kể cả chưa auth) đều **đọc được public key** của một địa chỉ qua `GET /api/auth/encryption-key/:address`. Đây là khoá **công khai** nên public là đúng. Nguồn: `auth.routes.js:274-298`. Người gửi key-share dùng nó để mã hoá. (Còn secret key thì không bao giờ rời thiết bị — nó suy ra từ chữ ký ví và chỉ lưu dạng đã mã hoá trong AsyncStorage. Nguồn: `nacl-crypto.js:140-144`.)

### Sơ đồ ngắn

```
LoginScreen (sau login OK)
   │ getOrCreateEncryptionKeypair → ký "EHR-Sign-Encryption-Key-v1"
   │ ký "Register EHR encryption key: <pub[0:20]>"
   ▼
POST /api/auth/encryption-key { encryptionPublicKey, signature, message }
   │  verifyMessage(addr, message, signature)        [auth.routes.js:245]
   │  assert message contains pubkey[0:20]           [auth.routes.js:255]
   ▼
User.encryptionPublicKey = pubkey   (Postgres)       [auth.routes.js:261]

… về sau, người gửi B muốn share cho A:
GET /api/auth/encryption-key/<A>  → lấy pubkey của A [auth.routes.js:274]
encryptForRecipient({cid,aesKey}, pubkeyA, secretB)  [nacl-crypto.js:27]
→ payload chỉ A giải mã được.
```

---

## 7. Những điểm dễ bị hỏi khi bảo vệ

- **Tại sao user không trả gas?** Vì ví Web3Auth (login mạng xã hội) không có ETH. Backend dùng ví sponsor + hàm `*For` chỉ relayer gọi được. Nguồn: `AccessControl.sol:85-88,280`, `relayer.service.js:32-34,360`.
- **Một địa chỉ có thể vừa patient vừa doctor?** Có — set bằng OR. `_roles[user] |= ROLE`. Nguồn: `AccessControl.sol:282,290` + comment `:14-20`.
- **Đăng ký doctor xong đọc được hồ sơ chưa?** Chưa. Mới có cờ DOCTOR (`"DOCTOR_UNVERIFIED"`). Cần verify (cờ VERIFIED_DOCTOR + `active`) thì `isVerifiedDoctor` mới true. Nguồn: `AccessControl.sol:267,446-449`.
- **Nếu gọi đăng ký 2 lần?** Idempotent: backend đọc `isPatient/isDoctor` trước, đã có thì không gửi tx. On-chain OR cũng không gây hại nếu lỡ gọi lại. Nguồn: `relayer.service.js:344-358`, `:389-403`.
- **Khoá mã hoá lưu ở đâu, có lộ không?** Public key ở DB (công khai, đúng bản chất). Secret key suy ra từ chữ ký ví, chỉ lưu **đã mã hoá** trong AsyncStorage của máy; mất máy thì đăng nhập lại ví là tái tạo được. Nguồn: `nacl-crypto.js:72-80,140-144`.
- **Đăng ký vai trò có tốn quota 100/tháng không?** Không. Chỉ các hành động sau (upload/share/revoke/delegate) mới trừ. Nguồn: `relayer.routes.js:124`, `relayer.service.js:21-23`.

---

## Nguồn đã đọc

- `mobile/src/services/roleRegistration.service.js`
- `mobile/src/utils/authRoles.js`
- `mobile/src/store/authStore.js`
- `mobile/src/screens-v2/RoleSelectionScreen.tsx`
- `mobile/src/services/auth.service.js`
- `mobile/src/services/nacl-crypto.js`
- `mobile/src/screens/LoginScreen.tsx` (đoạn 270-295)
- `backend/src/routes/relayer.routes.js`
- `backend/src/services/relayer.service.js`
- `backend/src/routes/auth.routes.js` (đoạn 170-298)
- `contracts/src/AccessControl.sol` (đoạn 1-160, 250-380, 436-462)
- `contracts/src/interfaces/IAccessControl.sol` (dòng 73-74)
