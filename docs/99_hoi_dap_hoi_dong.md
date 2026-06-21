# 99 — Hỏi & Đáp dự kiến của Hội đồng bảo vệ (luyện trả lời)

> **Đối tượng đọc**: một lập trình viên smart-contract (rành blockchain/Solidity/EVM nhưng đã quên kha khá; KHÔNG biết backend; KHÔNG biết mật mã; ÍT biết mobile nhất).
> **Mục tiêu**: đọc xong tự tin TRÌNH BÀY + TRẢ LỜI HỘI ĐỒNG về bất kỳ phần nào của hệ thống.
> **Cách dùng**: mỗi mục là một câu hỏi hội đồng hay hỏi → câu trả lời ngắn gọn, tự tin, có dẫn nguồn `path:line`. Câu trả lời "30 giây" in đậm ở đầu để bạn nói trước, phần sau là chi tiết để phòng khi bị hỏi sâu.
>
> **RULE #0**: mọi khẳng định kỹ thuật đều dẫn nguồn từ code thật. Chỗ nào chưa mở được file để xác minh → ghi rõ "⚠️ chưa kiểm chứng". Code là nguồn chân lý (CLAUDE.md có thể đã cũ). Tài liệu nền sâu hơn: xem `docs/01_smart_contracts.md` … `docs/04_ma_hoa.md` và các `docs/f01..f13`.

---

## Bản đồ nhanh: 5 contract & 3 lớp lưu trữ (thuộc lòng trước khi vào phòng)

```
        AccessControl            ai-là-ai (role bitwise) + verify doctor/org + organization registry
            │
   ┌────────┼─────────────┬──────────────────┐
   ▼        ▼             ▼                  ▼
RecordRegistry  DoctorUpdate   EHRSystemSecure   ConsentLedger ◄── canAccess (thẩm quyền cuối)
(cidHash +      (facade bác sĩ  (request 2-bên     (consent theo root + delegation CHAIN
 cây version)    tạo+tự cấp)     duyệt)             + Trusted Contact + EIP-712)
```

```
On-chain  ConsentLedger : cidHash, encKeyHash (HASH), grantee, expireAt, flags  → PUBLIC, không có khoá
Off-chain KeyShare (PG) : encryptedPayload = NaCl box {cid, aesKey}             → CHỈ người nhận giải
IPFS (Pinata)           : AES-GCM ciphertext của FHIR bundle                    → cần aesKey (nằm trong KeyShare)
```

Một câu chốt cho mọi câu hỏi bảo mật: **"Muốn đọc một hồ sơ phải có ĐỒNG THỜI (a) NaCl secret key của người nhận — chỉ tái lập từ chữ ký ví của họ, và (b) ciphertext trên IPFS. Không thành phần đơn lẻ nào (DB / chain / IPFS) đủ để lộ dữ liệu y tế."**

---

# A. Tổng quan & kiến trúc

### A1. Hãy mô tả hệ thống trong 1 phút.
**Đây là hệ thống Hồ sơ Y tế điện tử (EHR) lưu quyền truy cập trên blockchain, theo mô hình quản lý ngành y Việt Nam. Trọng tâm luận văn là an toàn & riêng tư on-chain: blockchain chỉ giữ metadata + hash để kiểm soát quyền (consent), còn nội dung y tế được mã hoá đầu-cuối và backend không bao giờ đọc được.**

- 5 smart contract Solidity 0.8.24 (`contracts/foundry.toml:9`): `AccessControl`, `RecordRegistry`, `ConsentLedger`, `DoctorUpdate`, `EHRSystemSecure` (`docs/01_smart_contracts.md` tóm tắt).
- Backend Node/Express/Prisma đóng 3 vai: "blind mailbox" cho khoá đã mã hoá, relayer trả gas hộ bệnh nhân, và cache + realtime (`docs/02_backend.md:11-16`).
- Mobile React Native/Expo: đăng nhập Web3Auth → ví nhúng → mã hoá AES + NaCl, ký EIP-712 (`docs/03_mobile.md:12-19`).

### A2. Vì sao dùng blockchain mà không phải một CSDL bình thường?
**Vì blockchain cho hai thứ một CSDL khó đảm bảo: (1) bản ghi quyền truy cập bất biến, có thể kiểm toán công khai (audit trail không sửa được), và (2) quyền do chính bệnh nhân kiểm soát bằng chữ ký mật mã, không phụ thuộc thiện chí của một quản trị viên backend.**

- Quyền cấp/thu hồi được ký EIP-712 bởi chính bệnh nhân và lưu on-chain; backend không thể tự ý chèn quyền (xem A8, C2).
- Hàm `canAccess` on-chain là thẩm quyền cuối cùng (`contracts/src/ConsentLedger.sol:679`). Postgres chỉ là cache đọc nhanh, không bao giờ là cơ sở cấp quyền (`docs/02_backend.md:17,361`).

### A3. Tại sao on-chain chỉ lưu HASH (cidHash, encKeyHash) chứ không lưu dữ liệu?
**Vì blockchain công khai và bất biến — nếu lưu CID plaintext thì lộ con trỏ tới file trên IPFS; nếu lưu khoá thì ai cũng giải mã được. Lưu hash một chiều (keccak256) thì không đảo ngược ra CID/khoá, nhưng vẫn đủ để chứng minh tính toàn vẹn.**

- `cidHash = keccak256(bytes(cid))`, `encKeyHash = keccak256(bytes(aesKey))` đều tính off-chain trên mobile (`mobile/src/utils/eip712.js:220-230`).
- Contract chỉ nhận `bytes32 cidHash`, không bao giờ nhận CID plaintext (`docs/01_smart_contracts.md:18-19`).

---

# B. Mã hoá & riêng tư (phần thường bị hỏi sâu nhất)

### B1. Backend có đọc được hồ sơ y tế không?
**KHÔNG. Backend là "blind mailbox" (hòm thư mù): nó chỉ giữ một phong bì đã niêm phong (`encryptedPayload`) mã hoá bằng public key của người nhận. Backend không có secret key của ai nên không mở được. Schema ghi thẳng "Backend CANNOT read this".**

- `KeyShare.encryptedPayload` = NaCl box của `{cid, aesKey}`; comment "Backend as blind mailbox" + "Backend CANNOT read this" (`backend/prisma/schema.prisma:174-185`, dẫn ở `docs/04_ma_hoa.md:9,79`).
- Backend cũng không tự đọc IPFS để giải vì aesKey nằm bên trong phong bì nó không mở được (`docs/04_ma_hoa.md:145`).

### B2. Vì sao cần TỚI HAI lớp mã hoá (AES và NaCl)? Một lớp không đủ à?
**Đây là "envelope encryption" (mã hoá phong bì): AES (đối xứng) rất nhanh nên dùng mã cả FHIR bundle lớn; NaCl box (bất đối xứng) giải bài toán "gửi khoá AES an toàn cho từng người nhận" mà không cần kênh bí mật trước. Nếu chỉ dùng AES thì không có cách an toàn để trao khoá; nếu chỉ dùng NaCl thì quá chậm cho dữ liệu lớn.**

```
FHIR bundle ──AES-256-GCM(aesKey)──► ciphertext ──► IPFS (ra CID)
{cid, aesKey} ──NaCl box(publicKey người nhận)──► encryptedPayload ──► KeyShare (Postgres)
```

- AES-GCM: `mobile/src/services/crypto.js:36` (`encryptData`); mỗi record một aesKey random (`crypto.js:15-18`, gọi ở `mobile/src/screens-v2/CreateRecordScreen.tsx:440`).
- NaCl box (X25519): `mobile/src/services/nacl-crypto.js:27` (`encryptForRecipient`).
- Giải thích đầy đủ: `docs/04_ma_hoa.md:26-33,107-116`.

### B3. GCM là gì, có gì đặc biệt?
**GCM (Galois/Counter Mode) là AES "có xác thực" (authenticated encryption): ngoài ciphertext còn sinh ra auth tag 16 byte. Khi giải mã, nếu ciphertext bị sửa dù một bit, tag không khớp và giải mã ném lỗi thay vì trả ra rác — nên vừa bí mật vừa chống giả mạo.**

- Định dạng `IV(12B) ‖ ciphertext ‖ tag(16B)` rồi base64; sai tag ném `'GCM Authentication Failed'` (`mobile/src/services/crypto.js:53-55,85-87`, dẫn ở `docs/04_ma_hoa.md:24,97-101`).

### B4. Nếu toàn bộ Postgres bị lộ thì sao?
**Attacker chỉ có ciphertext + hash. `KeyShare.encryptedPayload` là NaCl box mã bằng public key người nhận; thiếu secret key người nhận thì không mở được, nên không lấy ra CID hay aesKey. Dữ liệu y tế KHÔNG lộ.**

- Bảng kịch bản tấn công đầy đủ: `docs/04_ma_hoa.md:147-154`. On-chain chỉ có hash/metadata, DB chỉ có phong bì niêm phong, IPFS chỉ có ciphertext — phải gom đủ ≥2 mảnh + secret key người nhận mới đọc được.

### B5. Nếu đọc được toàn bộ blockchain thì sao?
**Vẫn an toàn. On-chain chỉ có `cidHash`, `encKeyHash` (đều keccak256 một chiều) cộng metadata (grantee, expireAt, cờ). Không có CID plaintext, không có khoá → không lần ra được dữ liệu.**

- Nguồn: `docs/04_ma_hoa.md:151`; on-chain tuyệt đối không có CID/khoá (`docs/01_smart_contracts.md:459`).

### B6. Nếu lộ ĐỒNG THỜI cả DB lẫn IPFS?
**Vẫn cần secret key NaCl của người nhận để mở phong bì lấy aesKey. Mà secret key đó không nằm ở đâu cả — nó chỉ tái lập được từ chữ ký ví của chính người nhận. Nên vẫn không đọc được.**

- `docs/04_ma_hoa.md:152,154`.

### B7. Khoá nằm ở đâu? Có cái nào nằm trên server không?
**Có hai họ khoá, và KHÔNG họ nào dùng để đọc hồ sơ lại nằm trên server:**

| Khoá | Mục đích | Lưu ở đâu |
|---|---|---|
| Private key Ethereum (ví) | Ký đăng nhập, ký EIP-712, tự trả gas | Chỉ trong RAM app, không persist (`mobile/src/services/walletAction.service.js:20-25`) |
| Cặp khoá NaCl (mã/giải payload) | Mã/giải `{cid, aesKey}` | Secret key mã hoá-tại-chỗ rồi cất AsyncStorage; **tái lập từ chữ ký ví** (`mobile/src/services/nacl-crypto.js:72-94`) |
| aesKey (per-record) | Mã/giải nội dung FHIR | Local AsyncStorage máy chủ + bên trong NaCl box ở KeyShare |

> Lưu ý có một lớp AES **riêng** của backend (`backend/src/utils/crypto.js`) dùng khoá server để mã vài secret hạ tầng (vd `DoctorCredential`) — **đừng nhầm** với mã hoá hồ sơ y tế. Server đọc được lớp này nhưng nó KHÔNG đụng tới FHIR/KeyShare (`docs/04_ma_hoa.md:194-200`).

### B8. Cặp khoá NaCl sinh thế nào? Mất điện thoại có mất khoá không?
**Cặp khoá NaCl được DERIVE tất định từ chữ ký ví: app yêu cầu ví ký một message cố định, rồi keccak256(chữ ký + địa chỉ + salt) ra seed 32 byte → keypair. Vì chữ ký ECDSA trên cùng message là tất định, cùng một ví luôn ra cùng keypair. Nên mất máy / cài lại app vẫn khôi phục được khoá và giải được KeyShare cũ.**

```
message   = "EHR-Sign-Encryption-Key-v1\nWallet: <addr>"      (nacl-crypto.js:121-123)
signature = walletClient.signMessage({ message })             (nacl-crypto.js:129)
seed      = keccak256(sig ‖ addr ‖ APP_SALT).slice(0,32)      (nacl-crypto.js:72-80)
keypair   = nacl.box.keyPair.fromSecretKey(seed)              (nacl-crypto.js:12-23)
```
- `APP_SALT = 'EHR-NACL-KEY-DERIVATION-v1'` (`nacl-crypto.js:70`). Diễn giải: `docs/04_ma_hoa.md:122-139`.

### B9. Nói rõ "mất điện thoại thì mất GÌ"?
**Mất `aesKey` lưu local trong AsyncStorage (không mã hoá, không sync cloud). NHƯNG dữ liệu KHÔNG mất, vì:** (1) cặp khoá NaCl tái lập được từ ví (B8); (2) lúc tạo record app đã tự gửi một KeyShare cho CHÍNH MÌNH (self key-share), nên đăng nhập lại trên máy mới sẽ giải KeyShare đó để lấy lại aesKey.

- Self KeyShare backup: `mobile/src/screens-v2/CreateRecordScreen.tsx:525-539` (dẫn ở `docs/03_mobile.md:237-241`).
- "Local key mất, nhưng dữ liệu không mất": `docs/03_mobile.md:241`.

### B10. encKeyHash on-chain để làm gì nếu không phải là khoá?
**Nó là keccak256 của aesKey — một bằng chứng một chiều rằng consent on-chain gắn đúng với khoá nào, để không thể tráo khoá. Không đảo ngược ra khoá thật được.**

- `encKeyHash = keccak256(toBytes(aesKey))` (`mobile/src/utils/eip712.js:227-230`, dẫn ở `docs/04_ma_hoa.md:82`).

---

# C. Phi tập trung & quản lý khoá (Web3Auth)

### C1. Web3Auth là gì? Đăng nhập kiểu gì?
**Web3Auth là dịch vụ "social login → ví blockchain": user đăng nhập bằng Email OTP / SMS OTP / mạng xã hội, Web3Auth sinh ra một private key Ethereum và đưa vào app (ví nhúng / embedded wallet). App tự cầm key nên ký lặng lẽ, không popup như MetaMask. Không có mật khẩu, không có seed phrase.**

- SDK `@web3auth/react-native-sdk`, mạng `SAPPHIRE_DEVNET` (`mobile/src/config/web3authContext.ts:5,86`).
- Đăng nhập: `docs/f01_dang_nhap_web3auth.md:91-95`.

### C2. Đăng nhập backend hoạt động ra sao (chứng minh sở hữu ví)?
**Backend không tin client khai mình là ai. Nó cấp một `nonce` ngẫu nhiên, app ký nonce bằng ví, backend dùng `viem.verifyMessage` (ECDSA recover) để chứng minh đúng chủ ví đã ký, rồi mới cấp JWT. Nonce dùng một lần và rotate sau mỗi login để chống replay.**

```
GET /api/auth/nonce/:address  → message chứa "Nonce: <uuid>"   (auth.routes.js:74,91)
walletClient.signMessage(message)                              (mobile, ký off-chain, KHÔNG tốn gas)
POST /api/auth/login {address, message, signature}
   ├─ check nonce khớp        (auth.routes.js:132-135)
   ├─ verifyMessage(...)      (auth.routes.js:137)
   ├─ rotate nonce            (auth.routes.js:147-154)
   ├─ getUserRole(address)    ← đọc role ON-CHAIN, không tin client  (auth.routes.js:156)
   └─ jwt.sign({...})         (auth.routes.js:159)
```
- Chi tiết: `docs/f01_dang_nhap_web3auth.md:97-111`.

### C3. Web3Auth có thực sự phi tập trung không? (trả lời trung thực)
**Không hoàn toàn. Web3Auth dùng mạng MPC / key-management của họ để dẫn xuất và tái tạo private key từ phương thức đăng nhập, nên việc tạo/khôi phục khoá phụ thuộc hạ tầng bên thứ ba — khác MetaMask thuần self-custody. Đây là đánh đổi usability ↔ decentralization. Trọng tâm thesis là an toàn & riêng tư on-chain của hồ sơ; lớp ví chỉ là phương tiện ký, nếu cần có thể thay bằng ví self-custody mà không đổi phần on-chain.**

| Tiêu chí | MetaMask | Web3Auth (dự án) |
|---|---|---|
| Ai giữ/tái tạo key | User (seed phrase) | Mạng MPC Web3Auth + login social/OTP |
| Popup khi ký | Có | Không (ký ngầm) |
| Mức phi tập trung | Cao (self-custody) | Trung bình (phụ thuộc dịch vụ bên thứ ba) |

- Nguồn + caveat: `docs/f01_dang_nhap_web3auth.md:151-169`. ⚠️ Chi tiết kiến trúc MPC nội bộ của Web3Auth nằm ngoài repo (không có trong code) → chỉ trình bày ở mức "phụ thuộc dịch vụ bên thứ ba".

### C4. Ai giữ private key? Rủi ro là gì?
**App giữ private key, nhưng CHỈ trong RAM của phiên hiện tại — không bao giờ ghi xuống đĩa/SecureStore (đúng nguyên tắc self-custody, chống persist key). Rủi ro: vì app cầm key và ký ngầm, nếu app bị chèn mã độc thì key có thể bị trích xuất. Giảm thiểu: chỉ giữ trong RAM, xoá khi logout, và mọi lần ký nghiệp vụ đều qua cổng sinh trắc (biometric).**

- Không persist key: `mobile/src/services/walletAction.service.js:20-25`; xoá khi logout: `:380` (dẫn `docs/f01_dang_nhap_web3auth.md:147`).
- Biometric gate trước khi ký: `docs/03_mobile.md:368-377`.

### C5. Vì sao đăng nhập Google rồi Email lại "mất" hồ sơ?
**Mỗi phương thức đăng nhập (verifier) cho ra một private key khác → một địa chỉ ví khác → backend coi là một user khác (backend định danh user bằng `walletAddress`). App không có cơ chế gộp các verifier về cùng một ví. Đây là đặc tính của Web3Auth, không phải bug.**

- Verifier khác → key khác: `docs/f01_dang_nhap_web3auth.md:124-138`. ⚠️ Repo không có code aggregate verifier.

### C6. Có gotcha gì về phiên đăng nhập không?
**Có. Web3Auth SDK v8.1.0 KHÔNG tự khôi phục private key sau khi khởi động lạnh (cold start). JWT thì sống dai trong SecureStore nên user nhìn như đã đăng nhập, nhưng RAM không có key → mọi thao tác ký/giải mã sẽ fail. App xử lý bằng cách kiểm tra `hasActiveSession()`; nếu không có key thật → xoá JWT, đẩy thẳng về màn Login.**

- `authStore.loadToken` gọi `hasActiveSession()`; false → clear JWT về Login (`mobile/src/store/authStore.js:399-432`; cờ ở `mobile/src/services/walletAction.service.js:373`). Dẫn `docs/f01_dang_nhap_web3auth.md:173-193`.

---

# D. Phân quyền (ai quyết định ai được đọc)

### D1. Ai quyết định quyền truy cập — backend hay on-chain?
**On-chain. Hàm `ConsentLedger.canAccess(patient, grantee, queryCidHash)` là thẩm quyền cuối cùng. Backend chỉ là tấm chắn phụ: trước khi trả phong bì, nó GỌI `canAccess` on-chain; nếu false thì từ chối. Postgres `Consent` chỉ là cache, KHÔNG dùng để check quyền.**

- `canAccess`: `contracts/src/ConsentLedger.sol:679-706`.
- Backend gate qua `checkConsent` → đọc `canAccess` (`backend/src/config/blockchain.js:173`), gọi tại route trả key (`backend/src/routes/keyShare.routes.js:1273`).
- 3 lớp phòng thủ: (a) UI cảnh báo, (b) backend `checkConsent`, (c) on-chain `canAccess` (`docs/04_ma_hoa.md:162`).

### D2. `canAccess` quyết định theo thứ tự nào? (người rành SC nên nắm)
**Đọc theo thứ tự:**
```
canAccess(patient, grantee, queryCidHash):
  1. patient == grantee ?                  → true   (chủ sở hữu, không cần consent entry)
  2. isTrustedContact[patient][grantee] ?  → true   (người thân khẩn cấp, bỏ qua mọi cổng)
  3. root = _walkToRoot(queryCidHash)              (đi ngược cây version về gốc, ≤ MAX_RECORD_DEPTH=20)
  4. grantee là doctor & !isVerifiedDoctor ? → false (FIX audit #3)
  5. _hasValidNormalConsent(...) : consent active & chưa hết hạn
        + nếu là per-record delegation: nguồn còn allowDelegate (BUG-C cascade)
        + nếu là bulk delegation: walk chain ≤ MAX_DELEGATION_WALK=8, mọi link còn active & khớp epoch (audit #4)
```
- Nguồn (đã đọc trực tiếp): `contracts/src/ConsentLedger.sol:684-766`.

### D3. Consent lưu thế nào? Cấp ở version cũ có thấy version mới không?
**Consent lưu theo CANONICAL ROOT của cây version (key = keccak256(patient, grantee, rootCidHash)). Khi grant, contract đi ngược cidHash về root rồi lưu tại root; khi check, đi ngược query cidHash về cùng root. Nên một consent phủ TOÀN BỘ chuỗi version ("medical episode model") — cấp một lần là thấy mọi version (cũ lẫn mới) của cùng hồ sơ.**

- Lưu tại root: `contracts/src/ConsentLedger.sol:294-299`; walk to root trong canAccess: `:695`.
- ⚠️ **Drift CLAUDE.md**: trường `includeUpdates` ĐÃ BỎ từ 2026-04-19 — `struct Consent` không còn field này (`contracts/src/interfaces/IConsentLedger.sol:15-24`; dẫn `docs/01_smart_contracts.md:209-219`). Đừng nói hệ thống còn dùng `includeUpdates`.

### D4. Thu hồi quyền có hiệu lực NGAY không?
**Có hiệu lực ngay ở tầng quyết định (on-chain): khi `canAccess` được gọi lần kế tiếp nó sẽ trả false. Off-chain backend còn xoá luôn `encryptedPayload` trong KeyShare để cắt đường lấy khoá. Lưu ý trung thực: nếu người nhận đã từng tải và giải mã hồ sơ TRƯỚC khi bị thu hồi thì không thể "thu hồi ký ức" — họ đã thấy dữ liệu rồi; revoke chặn truy cập TƯƠNG LAI.**

- Revoke = set `active=false` tại key consent (`contracts/src/ConsentLedger.sol:345-356`).
- Backend xoá `encryptedPayload=''` + `status='revoked'` (best-effort khi UI gọi, chắc chắn lại khi worker bắt event `ConsentRevoked`) (`docs/f10_thu_hoi_quyen.md:10,32`).

### D5. Thu hồi UỶ QUYỀN (delegation) cha thì cháu mất quyền tức thì không?
**Có, tức thì và theo dây chuyền (cascade), mà không cần xoá từng consent con. Cơ chế: mỗi lần `revokeDelegation` contract TĂNG `delegationEpoch`. Trong `canAccess`, khi đi ngược chuỗi delegation, mỗi link phải khớp epoch đã snapshot lúc tạo; cha bump epoch → mọi con/cháu downstream lệch epoch → tự vô hiệu.**

- Epoch bump khi revoke: `contracts/src/ConsentLedger.sol:468-484`. Walk + so epoch trong canAccess: `:736-763` (đã đọc trực tiếp). Dẫn `docs/01_smart_contracts.md:478`, `docs/f10_thu_hoi_quyen.md:44`.

### D6. Bác sĩ CHƯA xác minh đọc được gì?
**Bác sĩ chưa verified KHÔNG đọc được record được chia sẻ tới mình — `canAccess` chặn thẳng `isDoctor && !isVerifiedDoctor` (FIX audit #3). Nhưng họ VẪN: đăng ký, tạo record cho bệnh nhân (write path không cần verify), và đọc record do chính họ tạo qua khoá local. Khi được verify, các consent đang chờ tự động có hiệu lực.**

- Chặn trong canAccess: `contracts/src/ConsentLedger.sol:698-703` (đã đọc trực tiếp).
- Backend lúc claim trả `DOCTOR_NOT_VERIFIED` nhưng KHÔNG revoke KeyShare (consent vẫn hợp lệ, chỉ chờ verify) (`backend/src/routes/keyShare.routes.js:1430-1458`, dẫn `docs/04_ma_hoa.md:162`).

### D7. Mô hình quản lý ngành y VN thể hiện thế nào trong contract?
**Bộ Y tế (MINISTRY) là địa chỉ immutable, đặt ở constructor — chỉ có role MINISTRY, KHÔNG có ORGANIZATION (regulator, không phải bệnh viện). Bộ Y tế tạo Organization (bệnh viện) → admin của Organization mới verify bác sĩ (qua chứng chỉ hành nghề CCHN). Role lưu bằng bitwise flags để 1 ví có thể kiêm nhiều vai.**

- Ministry immutable: `contracts/src/AccessControl.sol:33,62`; chỉ role MINISTRY: `:64-66`.
- Bitwise role: `:23-30`; verified là FLAG, cần cả bit + `active==true` (`:446-449`). Org tạo bởi `createOrganization` (`:104-157`), bác sĩ verify bởi admin org `verifyDoctor` (`:314-318`). Dẫn `docs/01_smart_contracts.md:58-131`.

### D8. Có mấy loại "xin quyền"? Khác nhau gì?
**Hai cách bệnh nhân/grantee đi tới một consent:**

| Cách | Ai khởi xướng | Cơ chế |
|---|---|---|
| Bệnh nhân chủ động chia sẻ | Patient | Ký EIP-712 `grantBySig` → relayer broadcast |
| Yêu cầu truy cập 2-bên | Bác sĩ/Org gửi request → cả 2 duyệt | `EHRSystemSecure.requestAccess` → `_completeRequest` gọi `grantInternal`/`grantDelegationInternal` |

Trong `EHRSystemSecure` có 3 `RequestType` (giá trị enum: **0=DirectAccess, 1=FullDelegation, 2=RecordDelegation**):
- `DirectAccess` (0): grant `allowDelegate=false` — đọc 1 chuỗi record, không re-share (`contracts/src/EHRSystemSecure.sol:327-339`).
- `RecordDelegation` (2): grant `allowDelegate=true` — đọc + có thể `grantUsingRecordDelegation` cho người thứ 3 (`:340-348`).
- `FullDelegation` (1): `grantDelegationInternal` — uỷ quyền BULK toàn bộ record, `allowSubDelegate=true` (`:349-357`).
- Dẫn `docs/01_smart_contracts.md:360-372`.

### D9. Vì sao request cần 2 bên duyệt + delay 15 giây?
**Chống đơn phương & front-run: cả requester (bác sĩ) và patient đều phải confirm, và lần confirm thứ 2 phải sau `MIN_APPROVAL_DELAY = 15s`. Ngoài ra `requestAccess` chỉ cho Doctor/Org gửi (KHÔNG cho patient) để chặn phishing (audit P1).**

- State machine + delay: `contracts/src/EHRSystemSecure.sol:182-225`; requester phải là Doctor/Org: `:77-174`. Hằng số `MIN_APPROVAL_DELAY`: `:46`. Dẫn `docs/01_smart_contracts.md:384,480`.

---

# E. Tính đúng đắn (correctness)

### E1. Làm sao đảm bảo cidHash on-chain khớp đúng dữ liệu trên IPFS?
**`cidHash = keccak256(bytes(cid))`, mà CID của IPFS bản thân nó là content-address (hàm băm của nội dung file). Nên: nếu ai đó sửa ciphertext trên IPFS thì CID đổi → cidHash sẽ không khớp cái đã ghi on-chain. Thêm nữa, nội dung mã AES-GCM, sửa một bit là auth tag fail khi giải mã. Hai lớp này cùng bảo đảm tính toàn vẹn.**

- `cidHash` từ CID: `mobile/src/utils/eip712.js:220-222`, `mobile/src/services/crypto.js:10-12`.
- GCM auth tag: B3. ⚠️ Lưu ý: hệ thống không tự re-verify "CID này băm ra đúng nội dung" trên chain (chain chỉ giữ hash) — đảm bảo đến từ tính chất content-address của IPFS + auth tag, không phải từ một verifier on-chain.

### E2. Version record quản lý thế nào? Sửa nhầm thì sao?
**Mỗi record có `parentCidHash` và `version`. Tạo bản con (`parentCidHash != 0`) thì `version = parent.version + 1` và push vào danh sách con của parent — tạo cây version. Consent ở root phủ cả cây (D3). Sửa nhầm CID in-place được phép qua `updateRecordCID` nhưng chỉ khi record chưa có con; owner sửa bất kỳ lúc nào, bác sĩ tạo chỉ trong cửa sổ `DOCTOR_UPDATE_WINDOW = 1 ngày`.**

- Version chain: `contracts/src/RecordRegistry.sol:161-170` (đã đọc trực tiếp). `updateRecordCID`: `:198-266`; window: `:39-41`. Dẫn `docs/01_smart_contracts.md:182,189-191`.

### E3. Bác sĩ tạo record có cần consent của bệnh nhân không?
**Write path KHÔNG cần consent: chỉ cần `msg.sender` có role DOCTOR (hoặc là contract được authorize) và patient ĐÃ đăng ký (F3 fix, chống tạo record sở hữu bởi địa chỉ không phải patient). Việc cần verify/consent chỉ áp dụng cho READ path (đọc record được chia sẻ).**

- `addRecordByDoctor` chỉ check `isDoctor || authorizedContracts` + `isPatient(patient)` (`contracts/src/RecordRegistry.sol:134-143`, đã đọc trực tiếp).
- Facade `DoctorUpdate.addRecordByDoctor`: tạo record (owner=patient) + chỉ nếu là ROOT mới tự cấp cho bác sĩ một consent tạm (mặc định 7 ngày) (`contracts/src/DoctorUpdate.sol:80-123,127-161`). Dẫn `docs/01_smart_contracts.md:337-338`.

### E4. Truy cập khẩn cấp (emergency) có bị lạm dụng không?
**Cơ chế khẩn cấp được thiết kế để bác sĩ KHÔNG BAO GIỜ tự cấp quyền cho mình. Cơ chế cũ `grantEmergencyAccess` (24h + chứng nhân) đã BỎ vì nó cấp `canAccess` on-chain mà không có đường giao khoá giải mã off-chain → vô dụng. Thay bằng Trusted Contact + tra cứu CCCD:**

1. Bệnh nhân chỉ định trước người thân tin cậy (on-chain) và pre-share sẵn khoá cho họ.
2. Bác sĩ ER nhập số CCCD → app băm keccak256 TRÊN MÁY → backend tra ra ví + nhóm máu/dị ứng + danh sách người thân (có SĐT). Bác sĩ GỌI ĐIỆN người thân; người thân tự ký uỷ quyền lại cho bác sĩ.

Chống lạm dụng: lookup chỉ cho `verifiedDoctor`, rate-limit 5 lượt/phút/ví, MỌI lookup bị ghi AccessLog + push hậu kiểm cho bệnh nhân; tra cứu CCCD KHÔNG trả khoá giải mã.

- Cơ chế cũ đã bỏ: `contracts/src/ConsentLedger.sol:87` (comment "dropped 2026-05-04"), `backend/src/routes/emergency.routes.js:13`.
- Trusted Contact registry on-chain (chống backend chèn người thân giả): `contracts/src/ConsentLedger.sol:88-91`. `canAccess` short-circuit trusted contact: `:693` (đã đọc trực tiếp).
- Rate-limit + verifiedDoctor + audit: `backend/src/routes/emergency.routes.js:31,37-38,56`. Dẫn `docs/f11_khan_cap_va_trusted_contact.md` toàn bộ.

### E5. Vì sao Trusted Contact phải nằm ON-CHAIN chứ không phải DB?
**Vì nếu danh sách người thân chỉ ở DB, một backend bị chiếm quyền có thể lén chèn "người thân giả" rồi kích hoạt pre-share khoá tới ví attacker. Để on-chain thì chỉ chữ ký EIP-712 của chính bệnh nhân mới sửa được danh sách → "patient sovereignty enforced cryptographically".**

- `contracts/src/ConsentLedger.sol:88-91`; dẫn `docs/f11_khan_cap_va_trusted_contact.md:92-94`.

---

# F. Gas & chi phí

### F1. Ai trả phí gas?
**Mặc định backend trả hộ bệnh nhân (sponsored, "gasless"). Mỗi user có quota 100 chữ ký miễn phí/tháng (1 pool chung). Bệnh nhân chỉ ký EIP-712 off-chain (không tốn gas), một ví sponsor của backend gọi hàm `*BySig`/`*For` trên contract và trả gas. Bác sĩ/Tổ chức KHÔNG được tài trợ cho các hành động cần `msg.sender` đúng là họ — họ tự trả gas.**

- Quota 100/tháng (`SIGNATURES_PER_MONTH`): `backend/src/services/relayer.service.js:21-23`; cột DB `signaturesThisMonth` (`backend/prisma/schema.prisma:100-105`). Dẫn `docs/f12_gas_sponsor_va_self_pay.md:5-10`.

### F2. Meta-transaction / `*BySig` hoạt động ra sao?
**Tách "đồng ý" khỏi "trả tiền gas": bệnh nhân ký EIP-712 (off-chain, miễn phí); sponsor wallet cầm chữ ký gọi hàm `...BySig`; contract `ecrecover` xác minh đúng bệnh nhân đã ký rồi mới thực thi — dù `msg.sender` là sponsor. Chống replay bằng `nonce` + `deadline` trong typed-data.**

- Hàm `grantBySig`, `delegateAuthorityBySig`, `setTrustedContactBySig`, `rejectRequestBySig` qua relayer (`docs/f12_gas_sponsor_va_self_pay.md:30-36`). EIP-712 domain chống replay: `docs/04_ma_hoa.md:170-173`.

### F3. Hết quota thì sao?
**Tự động chuyển sang self-pay: backend trả lỗi `QUOTA_EXHAUSTED` (HTTP 429, hoặc 402 ở luồng revoke), mobile bắt lỗi đó rồi gửi ĐÚNG giao dịch đó nhưng ký + phát từ ví Web3Auth của chính user, user tự trả ETH. Nếu ví rỗng → báo lỗi `NO_ETH_FOR_SELF_PAY`.**

- `withSelfPayFallback`: `mobile/src/utils/selfPayFallback.js:43-75`; ví rỗng: `:62-69`. Dẫn `docs/f12_gas_sponsor_va_self_pay.md:123-134`.
- Self-pay vẫn hợp lệ vì `*BySig` gate bằng CHỮ KÝ (không phải msg.sender); với revoke thì self-pay gọi thẳng `revoke` với `msg.sender` = chính bệnh nhân (`docs/f12_gas_sponsor_va_self_pay.md:158-162`).

### F4. Quota có bị race condition (vượt trần) không?
**Không. `consumeQuota` dùng một câu lệnh DB có điều kiện `updateMany(where signaturesThisMonth < 100, increment 1)` — gộp "kiểm tra còn quota" và "tăng counter" thành một thao tác nguyên tử, nên hai request đồng thời ở ranh giới 99 không thể cùng vượt trần (fix F15). Counter trừ TRƯỚC khi gửi tx (reserve) để trần không bao giờ bị vượt.**

- `backend/src/services/relayer.service.js:292-298`; dẫn `docs/f12_gas_sponsor_va_self_pay.md:83-100`.

### F5. Sponsor wallet bắn nhiều tx cùng lúc có trùng nonce không?
**Không. Mọi tx từ sponsor wallet xếp hàng tuần tự qua `sponsorWrite()` (một hàng đợi promise in-process) nên không bao giờ gán cùng nonce cho 2 tx song song. Quy mô đồ án ưu tiên đúng đắn hơn throughput.**

- `backend/src/services/relayer.service.js:56-67`; dẫn `docs/f12_gas_sponsor_va_self_pay.md:52`.

---

# G. Backend (cho người không biết backend)

### G1. Backend là gì trong hệ này, nói bằng ngôn ngữ smart-contract?
**Backend = một chương trình chạy trên một máy chủ, nghe "cuộc gọi" qua HTTP (giống hàm public của contract nhưng qua mạng). Ánh xạ: route ≈ hàm public; `req.user.walletAddress` (từ JWT) ≈ `msg.sender`; middleware ≈ modifier; trả HTTP 4xx ≈ revert; Postgres (qua Prisma) ≈ storage nhưng RIÊNG TƯ và là CACHE.**

- Bảng ánh xạ: `docs/02_backend.md:25-33`.

### G2. Backend đóng những vai gì?
1. **Blind mailbox**: giữ `encryptedPayload` đã mã hoá, trả đúng người sau khi hỏi on-chain `canAccess`.
2. **Gas relayer**: trả gas hộ bệnh nhân (quota 100/tháng).
3. **Cache + realtime**: đồng bộ event on-chain (qua subgraph) vào Postgres để mobile đọc nhanh, + push realtime (Socket.io/Expo push).

- `docs/02_backend.md:11-16`.

### G3. Backend xác thực quyền bằng cách nào?
**Hai tầng: (1) `authenticate` verify JWT để biết ví nào đang gọi; (2) `requireOnChainRoles(...)` ĐỌC role trực tiếp từ contract `AccessControl` (không tin role client gửi). Nếu RPC lỗi không đọc được → trả 503 fail-closed, không đoán role. Còn quyền đọc record cụ thể thì luôn hỏi `canAccess` on-chain.**

- `authenticate`: `backend/src/middleware/auth.js:14`; `onChainRole`: `backend/src/middleware/onChainRole.js:48,60-64,92`. Dẫn `docs/02_backend.md:116-145`.

### G4. Postgres lưu gì? Có an toàn nếu lộ không?
**Postgres là CACHE: User (ví + NaCl public key + quota), RecordMetadata (cidHash, KHÔNG plaintext CID), KeyShare (blind mailbox), Consent/Delegation/TrustedContact (cache, không dùng check quyền), AccessLog (audit). Lộ DB chỉ ra ciphertext + hash + metadata (xem B4). Quyền luôn xác thực lại on-chain.**

- Bảng model: `docs/02_backend.md:343-360`. Câu chốt: `docs/02_backend.md:361`.

### G5. Đồng bộ event on-chain → DB ra sao?
**Một worker `startSubgraphSync()` poll The Graph subgraph mỗi ~30s, đọc các event (ConsentGranted/Revoked, DelegationGranted/Revoked, DoctorVerified...) rồi gọi handler ghi vào cache + invalidate role cache khi cần. (⚠️ Drift CLAUDE.md: các worker RPC `eventSync`/`recordRegistrySync` đã bị tắt do gây 429 storm; hiện chỉ còn 1 worker subgraph.)**

- `backend/src/app.js:110-115`; drift: `docs/02_backend.md:96-100`. Subgraph index 4 dataSources (`docs/01_smart_contracts.md` mục 9 / CLAUDE.md §9).

---

# H. Mobile (cho người ít biết mobile nhất)

### H1. React Native khác web/SC ở chỗ nào ảnh hưởng tới crypto?
**RN viết bằng React nhưng không có DOM và thiếu nhiều API trình duyệt — đặc biệt KHÔNG có Web Crypto API. Nên AES phải dùng thư viện `node-forge`, NaCl dùng `tweetnacl`, và phải polyfill `TextEncoder`. Điều này lý giải vì sao code crypto trông khác web.**

- Lý do thiếu Web Crypto: `mobile/src/services/crypto.js:4`; polyfill: `mobile/App.tsx:1`. Dẫn `docs/03_mobile.md:31-34`.

### H2. App lưu gì trên máy? Có mã hoá không?
**Hai kho: SecureStore (Android Keystore/iOS Keychain, mã hoá phần cứng) giữ JWT, user_data, roles, session Web3Auth; AsyncStorage (key-value KHÔNG mã hoá) giữ `ehr_local_records` (cid+aesKey) và NaCl keypair đã-mã-hoá. Vì AsyncStorage không mã hoá + không sync cloud nên có rủi ro "mất app = mất local key" — giảm thiểu bằng self KeyShare (B9).**

- Bảng kho lưu: `docs/03_mobile.md:219-222`.

### H3. Vì sao mỗi lần ký nghiệp vụ lại có bước sinh trắc (biometric)?
**Chữ ký ECDSA của Web3Auth chỉ là primitive kỹ thuật; theo Thông tư 13/2025/TT-BYT Điều 3.2, biometric mới là "sự kiện ký hợp pháp" hiển thị cho người dùng. Vì vậy mọi hàm ký (consent/delegation/trusted-contact/tạo hồ sơ/revoke) đều gọi `gateOrThrow(...)` trước khi ký. Thiết bị không có biometric → graceful degrade (vẫn cho qua).**

- `mobile/src/utils/biometricGate.ts:130-137`, rationale `:1-19`, degrade `:104-109`. Dẫn `docs/03_mobile.md:368-377`. ⚠️ PIN fallback hiện là infrastructure-only, CHƯA wire vào signing gate (`mobile/src/services/pinService.ts:14-17`).

### H4. Điều hướng theo vai trò hoạt động sao?
**App đọc `activeRole` từ `authStore` rồi render đúng bộ bottom-tabs: Patient / Doctor / Org / Ministry. User nhiều vai trò đổi bằng `RoleSwitcher` (chỉ đổi local + lưu SecureStore, không gọi backend).**

- `RoleBasedTabs`: `mobile/src/navigation/AppNavigator.tsx:207-223`; `switchRole`: `mobile/src/store/authStore.js:276-287`. Dẫn `docs/03_mobile.md:130-153`.

---

# I. Hạn chế & known gaps (trả lời TRUNG THỰC — hội đồng đánh giá cao sự thành thật)

### I1. Hệ thống còn mock/gap gì?
**Nêu thẳng các điểm sau (đã kiểm chứng từ code):**

| Gap | Trạng thái thực tế | Nguồn |
|---|---|---|
| IPFS service backend | Có nhánh Pinata thật khi set `PINATA_JWT`, chỉ MOCK (CID giả) khi thiếu key. Mobile thì upload Pinata trực tiếp. | `backend/src/services/ipfs.service.js:11-17` (dẫn `docs/02_backend.md:261-263`) |
| Worker sync RPC cũ | `eventSync`/`recordRegistrySync` đã tắt (gây 429); chỉ còn subgraphSync | `docs/02_backend.md:96-100` |
| PIN fallback | Infrastructure-only, chưa wire vào signing gate (biometric degrade chỉ `return true`) | `mobile/src/services/pinService.ts:14-17` |
| `revokeDelegation` | Không có biến thể BySig → bệnh nhân tự trả gas | `docs/f10_thu_hoi_quyen.md:8,42` |
| Ministry dashboard | Một phần còn dạng mock/đơn giản (Phase muộn) | CLAUDE.md §12 — ⚠️ chưa mở từng màn để xác minh % chính xác |
| `emergency.service.js` (mobile) | Còn hàm cũ (`requestEmergencyAccess`...) là CODE CHẾT — backend chỉ còn `GET /lookup-by-cccd` | `docs/f11_khan_cap_va_trusted_contact.md:27` |

> Mẹo: khi bị hỏi về gap, đừng giấu — nói "đây là tradeoff ở quy mô đồ án" và chỉ ra phần CỐT LÕI (mã hoá end-to-end + canAccess on-chain) đã hoàn chỉnh.

### I2. CLAUDE.md có chỗ nào đã cũ (stale) không?
**Có, và bạn nên biết để không nói sai trước hội đồng:**
- `includeUpdates` đã BỎ khỏi consent (chuyển medical-episode model) — `struct Consent` không còn field này (`contracts/src/interfaces/IConsentLedger.sol:15-24`).
- `grantEmergencyAccess` (24h + chứng nhân) đã BỎ, thay bằng Trusted Contact (`contracts/src/ConsentLedger.sol:87`).
- Screen live ở `mobile/src/screens-v2/` (không phải `mobile/src/screens/`) (`docs/03_mobile.md:160-166`).
- Push notification listeners đã CÓ (CLAUDE.md ghi 0% là cũ) (`docs/03_mobile.md:463-470`).

---

# J. Câu "bẫy" tổng hợp (tủ phòng thân)

### J1. "Bệnh nhân bất tỉnh, không ký được — bác sĩ làm sao đọc hồ sơ?"
**Qua Trusted Contact: bệnh nhân đã chỉ định trước người thân + pre-share khoá. Bác sĩ ER tra CCCD → tìm người thân → gọi điện → người thân tự ký uỷ quyền lại cho bác sĩ. Bác sĩ không bao giờ tự cấp quyền.** (E4)

### J2. "Backend admin có thể tự cấp quyền cho mình đọc hồ sơ bất kỳ không?"
**Không. Quyền do `canAccess` on-chain quyết, mà nó chỉ true khi có consent ký bởi chính bệnh nhân (hoặc bệnh nhân chỉ định trusted contact on-chain). Backend chèn row Consent vào Postgres cũng vô dụng vì Postgres chỉ là cache, không dùng để check. Và kể cả qua được gate, backend vẫn không có secret key để giải payload.** (B1, D1, E5)

### J3. "Hai bệnh nhân khác nhau, dữ liệu có rò sang nhau không?"
**Không. Mỗi record một aesKey riêng; mỗi người nhận một NaCl box riêng mã bằng public key của họ. Ở client, khi login/logout app `queryClient.clear()` + abort mọi request để không cho dữ liệu account A rò sang B (đã từng là bug, đã fix).** (`mobile/src/store/authStore.js:99-106,182-187`, dẫn `docs/03_mobile.md:208-211`)

### J4. "Nếu Web3Auth sập thì sao?"
**Trung thực: việc đăng nhập + tái tạo private key phụ thuộc Web3Auth (đây là điểm phi tập trung chưa tuyệt đối, C3). Tuy nhiên phần ON-CHAIN (consent, record, mã hoá) độc lập với Web3Auth — nếu cần có thể thay lớp ví bằng ví self-custody mà không đổi contract. Trọng tâm thesis nằm ở phần on-chain đó.**

### J5. "Chứng minh nội dung không bị backend sửa?"
**cidHash on-chain gắn với CID (content-address của IPFS) + AES-GCM auth tag: sửa ciphertext → CID đổi → lệch cidHash on-chain; sửa một bit → tag fail khi giải mã. Backend mù nên cũng không có khoá để tạo ciphertext hợp lệ mới.** (E1, B3)

---

## Nguồn đã đọc / dẫn chiếu
- Code đã đọc trực tiếp khi soạn: `contracts/src/ConsentLedger.sol:679-766` (canAccess + _hasValidNormalConsent), `contracts/src/RecordRegistry.sol:128-177` (addRecordByDoctor + _addRecord version chain).
- Tài liệu nền (đều có citation `path:line` tới code): `docs/01_smart_contracts.md`, `docs/02_backend.md`, `docs/03_mobile.md`, `docs/04_ma_hoa.md`, `docs/f01_dang_nhap_web3auth.md`, `docs/f10_thu_hoi_quyen.md`, `docs/f11_khan_cap_va_trusted_contact.md`, `docs/f12_gas_sponsor_va_self_pay.md`.
- Các chức năng khác (đăng ký vai trò, tạo/đọc hồ sơ, chia sẻ consent, request 2-bên, delegation, đồng bộ subgraph): `docs/f02`…`docs/f09`, `docs/f13`.

> Nếu hội đồng hỏi chi tiết một hàm/flow chưa có ở đây, mở đúng file `docs/f0x` tương ứng để lấy citation `path:line` rồi trả lời — đừng đoán.
