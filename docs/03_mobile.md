# 03 — Mobile (React Native / Expo) cho người chưa biết mobile

> Tài liệu onboarding cho lập trình viên smart-contract (rành SC, chưa biết backend/mobile/mật mã).
> Mọi khẳng định kỹ thuật đều dẫn nguồn `path:line` (đường dẫn tương đối từ gốc repo).
> Code là nguồn chân lý — CLAUDE.md có thể stale (ví dụ: CLAUDE.md ghi screen ở `mobile/src/screens/`
> nhưng app thực tế dùng `mobile/src/screens-v2/`, xem mục 4).

---

## Tóm tắt 30 giây

App mobile là **client React Native (Expo dev client)** cho hệ EHR-on-blockchain. Người dùng đăng nhập bằng
**Web3Auth** (social/email/SMS, không mật khẩu) → nhận một **ví Ethereum nhúng (embedded EOA)** mà app giữ
private key trong RAM. Ví này dùng để (a) ký thông điệp đăng nhập backend, (b) ký EIP-712 cho consent/delegation,
(c) tự broadcast giao dịch khi hết quota gas miễn phí (self-pay). Dữ liệu y tế được **mã hoá AES-GCM** rồi đẩy
lên **IPFS (Pinata)**; khoá AES được **NaCl-box** mã hoá cho từng người nhận và gửi qua backend ("blind mailbox").
Trên thiết bị, app chỉ lưu metadata + khoá cục bộ ở **AsyncStorage** và secret nhạy cảm ở **SecureStore**.
Giao diện điều hướng **theo vai trò** (patient/doctor/org/ministry) qua bottom tabs; user nhiều vai trò chuyển
bằng `RoleSwitcher`. State chia hai: **Zustand `authStore`** (phiên đăng nhập) + **TanStack Query** (cache dữ liệu server).

---

## 1. Khái niệm nền (cho người chưa biết mobile)

### 1.1 React Native vs web
- **Web (React)**: code chạy trong trình duyệt, render ra DOM (HTML/CSS). Bạn có `window`, `document`, `fetch`,
  Web Crypto API...
- **React Native (RN)**: viết bằng React (JSX, component, hook giống hệt web) **nhưng không có DOM**. Component
  render ra **native view của Android/iOS** (`View`, `Text`, `Pressable`, `ScrollView`… thay cho `div/span/button`).
  Style viết bằng object JS (như `style={{ padding: 8 }}`) chứ không phải file CSS.
- Hệ quả với SC dev: **nhiều API trình duyệt không tồn tại**. Ví dụ Web Crypto AES-GCM không có → app dùng thư viện
  `node-forge` để làm AES ([mobile/src/services/crypto.js:4](mobile/src/services/crypto.js#L4) ghi rõ lý do
  "Web Crypto API is unavailable"). `TextEncoder` cũng phải polyfill (`import 'fast-text-encoding'` ở đầu
  [mobile/App.tsx:1](mobile/App.tsx#L1)).

### 1.2 Expo là gì? Tại sao "dev client" chứ không phải "Expo Go"?
- **Expo** là framework bọc quanh RN, lo sẵn build tooling, OTA, và một kho module native (camera, secure-store,
  local-auth, notifications…).
- **Expo Go** = app có sẵn trên store để chạy nhanh prototype, **nhưng chỉ chứa các native module Expo đóng gói sẵn**.
  Dự án này dùng native module **không có trong Expo Go** (Web3Auth SDK, expo-notifications SDK 53+…), nên phải build
  một **dev client** riêng (`npx expo run:android`). Code dò môi trường qua `Constants.appOwnership === 'expo'` và
  **vô hiệu hoá** các tính năng không chạy được trong Expo Go: push notifications
  ([mobile/src/services/push.service.js:7](mobile/src/services/push.service.js#L7),
  [mobile/src/lib/notifications.ts:20](mobile/src/lib/notifications.ts#L20)) và social OAuth
  ([mobile/src/screens-v2/LoginScreen.tsx:182](mobile/src/screens-v2/LoginScreen.tsx#L182) cảnh báo "Expo Go không hỗ trợ").

### 1.3 Screen / Component / Navigation
- **Component**: một mảnh UI tái sử dụng (một hàm React trả về JSX). Ví dụ `RoleSwitcher`
  ([mobile/src/components/RoleSwitcher.tsx](mobile/src/components/RoleSwitcher.tsx)).
- **Screen**: một component đại diện cho **một màn hình đầy đủ** (một trang). Tất cả nằm ở
  `mobile/src/screens-v2/`.
- **Navigation**: thư viện điều khiển việc chuyển giữa các screen (như "router" của web). Dự án dùng
  **React Navigation** với 2 kiểu:
  - **Stack** (`createNativeStackNavigator`): chồng màn hình lên nhau, có nút Back — dùng cho luồng đi-vào-đi-ra
    (ví dụ mở chi tiết hồ sơ). Khai báo ở [mobile/src/navigation/AppNavigator.tsx:64](mobile/src/navigation/AppNavigator.tsx#L64).
  - **Bottom Tabs** (`createBottomTabNavigator`): thanh tab dưới đáy, chuyển ngang giữa các khu vực chính. Khai báo ở
    [mobile/src/navigation/AppNavigator.tsx:65](mobile/src/navigation/AppNavigator.tsx#L65).

### 1.4 Mã hoá — 3 lớp (rất quan trọng cho phần thesis)
| Thuật toán | Dùng cho | File |
|---|---|---|
| **AES-GCM** (đối xứng) | Mã hoá nội dung FHIR bundle trước khi lên IPFS | [mobile/src/services/crypto.js:36](mobile/src/services/crypto.js#L36) (`encryptData`) |
| **NaCl box** (bất đối xứng) | Mã hoá `{cid, aesKey}` cho **đúng public key người nhận** | [mobile/src/services/nacl-crypto.js:27](mobile/src/services/nacl-crypto.js#L27) (`encryptForRecipient`) |
| **keccak256** | Băm CID → `cidHash` đưa lên chain (KHÔNG để plaintext CID on-chain) | [mobile/src/utils/eip712.js:220](mobile/src/utils/eip712.js#L220) (`computeCidHash`) |

Điểm mấu chốt: cặp khoá NaCl của user **được suy ra tất định (deterministic) từ chữ ký ví**, không phải sinh ngẫu
nhiên — nên khôi phục được khi đăng nhập lại. Cụ thể: app yêu cầu ví ký một message cố định
`EHR-Sign-Encryption-Key-v1` → keccak256(chữ ký + địa chỉ + salt) → seed 32 byte → keypair NaCl
([mobile/src/services/nacl-crypto.js:72](mobile/src/services/nacl-crypto.js#L72) `deriveKeyFromWalletSignature`,
[:125](mobile/src/services/nacl-crypto.js#L125) `getOrCreateEncryptionKeypair`).

---

## 2. Entry point + cây Provider

Thứ tự nạp khi app khởi động:

```
index.ts                         (polyfill: globals, shim, fast-text-encoding)
  └─ registerRootComponent(App)  mobile/index.ts:11
       └─ App  (mobile/App.tsx)
            ThemeProvider                 App.tsx:129
              QueryProvider               App.tsx:110  → bọc TanStack Query
                TamaguiProvider           App.tsx:111  → UI lib (theme, font tokens)
                  SafeAreaProvider        App.tsx:112
                    AppNavigator          App.tsx:117  → toàn bộ điều hướng
```

- `QueryProvider` chỉ là wrapper mỏng quanh `QueryClientProvider`
  ([mobile/src/providers/QueryProvider.tsx:9](mobile/src/providers/QueryProvider.tsx#L9)), dùng một `queryClient`
  toàn cục cấu hình ở [mobile/src/lib/queryClient.ts:14](mobile/src/lib/queryClient.ts#L14) (staleTime 30s, gcTime 5 phút,
  retry 1, refetch khi mạng trở lại).
- Khi mở app, `App.tsx` gọi `loadToken()` để khôi phục phiên + `setupNotificationListeners()` để bắt sự kiện chạm
  notification ([mobile/App.tsx:96-100](mobile/App.tsx#L96-L100)). Trong lúc font chưa nạp xong hoặc đang khôi phục
  phiên, hiển thị `LoadingSpinner` ([mobile/App.tsx:113-114](mobile/App.tsx#L113-L114); message "Đang khởi tạo ứng dụng...").
- **Tamagui** là thư viện UI (component `Text/XStack/YStack`, theme sáng/tối, font tokens). Không cần đi sâu —
  chỉ cần biết nó thay vai trò "CSS framework".

---

## 3. Điều hướng theo vai trò (role-based navigation) + RoleSwitcher

Toàn bộ ở [mobile/src/navigation/AppNavigator.tsx](mobile/src/navigation/AppNavigator.tsx).

### 3.1 Cây điều hướng gốc — gating theo trạng thái đăng nhập
Root chọn nhánh dựa trên cờ trong `authStore` ([mobile/src/navigation/AppNavigator.tsx:328](mobile/src/navigation/AppNavigator.tsx#L328)):

```
NavigationContainer
  └─ Stack (root)                         AppNavigator.tsx:345
       ├─ !isAuthenticated → Landing + Login          (:346-350)
       ├─ needsRoleRegistration || needsRoleSelection → RoleSelection   (:351-352)
       └─ else → MainRoot (MainStackNavigator)        (:354)
  + MfaOnboardingModal (1 lần sau login)              (:358-360)
```

- `isLoading=true` → màn "Đang khôi phục phiên đăng nhập..." ([:339-341](mobile/src/navigation/AppNavigator.tsx#L339-L341)).
- Sau khi `isAuthenticated`, chạy `healLocalRecordCache()` đúng 1 lần
  ([:333-337](mobile/src/navigation/AppNavigator.tsx#L333-L337)) — xem mục 6.3.

### 3.2 MainStackNavigator + RoleBasedTabs
`MainStackNavigator` ([:225](mobile/src/navigation/AppNavigator.tsx#L225)) là một Stack chứa:
- `MainTabs` = `RoleBasedTabs` (màn chính, không header) ([:228-232](mobile/src/navigation/AppNavigator.tsx#L228-L232));
- một loạt screen push-on-top dùng chung mọi vai trò: `CreateRecord`, `RecordDetail`, `Settings`, `Requests`,
  `DoctorCreateUpdate`, `Delegation`, `DoctorDelegatableRecords`, `DoctorDelegatedPatients`,
  `DoctorExpiredRecords`, `EditProfile`, `TrustedContacts`, `EmergencyLookup`, `BiometricSettings`,
  `EmergencyProfile`, `Receipt`, `MinistryCreateOrg`, `MinistryOrgDetail`, `CredentialSubmit`
  ([:233-322](mobile/src/navigation/AppNavigator.tsx#L233-L322)).

`RoleBasedTabs` đọc `activeRole` từ `authStore` và render đúng bộ tab
([:207-223](mobile/src/navigation/AppNavigator.tsx#L207-L223)):

```
activeRole 'doctor'              → DoctorTabs
activeRole 'org'|'organization'  → OrgTabs
activeRole 'ministry'|'admin'    → MinistryTabs
'patient' (default)              → PatientTabs
```

### 3.3 Bộ tab theo vai trò (tên route lấy chính xác từ code)
| Vai trò | Hàm | Các tab (route → tiêu đề) | Nguồn |
|---|---|---|---|
| Patient | `PatientTabs` | Dashboard→"Hôm nay", Records→"Hồ sơ", AccessLog→"Quyền", Profile→"Cá nhân" | [:130-133](mobile/src/navigation/AppNavigator.tsx#L130-L133) |
| Doctor | `DoctorTabs` | DoctorDashboard→"Hôm nay", RequestAccess→"Yêu cầu", DoctorOutgoing→"Bệnh nhân", DoctorOutgoingShares→"Chia sẻ", Profile→"Cá nhân" | [:154-158](mobile/src/navigation/AppNavigator.tsx#L154-L158) |
| Org | `OrgTabs` | OrgDashboard→"Tổng quan", Members→"Bác sĩ", Verifications→"Xác thực", Profile→"Cá nhân" | [:178-181](mobile/src/navigation/AppNavigator.tsx#L178-L181) |
| Ministry | `MinistryTabs` | MinistryDashboard→"Tổng quan", MinistryVerifyDoctor→"Bác sĩ", Profile→"Cá nhân" | [:200-202](mobile/src/navigation/AppNavigator.tsx#L200-L202) |

### 3.4 RoleSwitcher (user nhiều vai trò)
- Component [mobile/src/components/RoleSwitcher.tsx](mobile/src/components/RoleSwitcher.tsx). Nếu user chỉ có ≤1 vai trò
  thì **không render gì** ([:33](mobile/src/components/RoleSwitcher.tsx#L33)).
- Bấm vào → mở modal liệt kê `availableRoles`, chọn → gọi `switchRole(role)`
  ([:28-31](mobile/src/components/RoleSwitcher.tsx#L28-L31)). `switchRole` chỉ đổi `activeRole` trong store + lưu
  SecureStore, KHÔNG gọi backend ([mobile/src/store/authStore.js:276-287](mobile/src/store/authStore.js#L276-L287)).
- `RoleSwitcher` được nhúng trong `ProfileScreen` và các dashboard
  ([mobile/src/screens-v2/ProfileScreen.tsx](mobile/src/screens-v2/ProfileScreen.tsx) cùng DashboardScreen v2 của 3
  vai trò — kết quả Grep `RoleSwitcher`).

---

## 4. Lưu ý: `screens-v2/` là bộ live, `screens/` là legacy

`AppNavigator.tsx` import **toàn bộ** screen từ `../screens-v2/...`
([mobile/src/navigation/AppNavigator.tsx:21-59](mobile/src/navigation/AppNavigator.tsx#L21-L59)). Thư mục cũ
`mobile/src/screens/` vẫn còn trên đĩa (Grep tìm thấy `RoleSwitcher` ở cả `screens/` lẫn `screens-v2/`) nhưng
**không được navigator nào tham chiếu** → coi `screens-v2/` là nguồn duy nhất. (CLAUDE.md mục 8 còn trỏ `screens/`
— đã stale.)

---

## 5. Quản lý state: Zustand authStore + TanStack Query

### 5.1 Hai loại state
- **State phiên (client state)** — ai đang đăng nhập, vai trò gì, JWT nào: dùng **Zustand**
  ([mobile/src/store/authStore.js](mobile/src/store/authStore.js)). Zustand = store toàn cục đơn giản: gọi
  `useAuthStore()` trong bất kỳ component nào để đọc/ghi.
- **State dữ liệu server (server cache)** — danh sách hồ sơ, yêu cầu, quota...: dùng **TanStack Query** (React Query).
  Query tự lo fetch, cache, refetch, loading/error. Cấu hình ở
  [mobile/src/lib/queryClient.ts](mobile/src/lib/queryClient.ts).

### 5.2 authStore — các field và action chính
State khởi tạo ([mobile/src/store/authStore.js:74-83](mobile/src/store/authStore.js#L74-L83)):
`user`, `token`, `isAuthenticated`, `isLoading`, `activeRole`, `availableRoles`, `needsRoleSelection`,
`needsRoleRegistration`.

| Action | Vai trò | Nguồn |
|---|---|---|
| `login(token, userData, roles)` | Lưu JWT + user + roles vào SecureStore; **clear cache cũ** (chống rò dữ liệu account trước); set authenticated | [authStore.js:85-140](mobile/src/store/authStore.js#L85-L140) |
| `logout()` | Clear in-memory token TRƯỚC, abort mọi request đang bay, logout Web3Auth, xoá SecureStore + cache TanStack + AsyncStorage + NaCl keypair | [authStore.js:142-218](mobile/src/store/authStore.js#L142-L218) |
| `loadToken()` | Khôi phục phiên lúc mở app: đọc JWT, sync `/api/auth/me`, **kiểm tra Web3Auth có private key chưa** | [authStore.js:312-464](mobile/src/store/authStore.js#L312-L464) |
| `switchRole(role)` | Đổi `activeRole` (chỉ local) | [authStore.js:276-287](mobile/src/store/authStore.js#L276-L287) |
| `completeRoleSelection(role)` | Chốt vai trò sau màn RoleSelection + đánh dấu đã chọn | [authStore.js:254-274](mobile/src/store/authStore.js#L254-L274) |
| `refreshAuthSession()` | Đồng bộ lại user/roles từ backend | [authStore.js:220-252](mobile/src/store/authStore.js#L220-L252) |

**Gotcha quan trọng (gating cold-start)** — JWT sống dai trong SecureStore nhưng Web3Auth SDK v8.1.0 **không tự
restore private key** sau khi khởi động lạnh. `loadToken` phát hiện trạng thái "đăng nhập nửa vời" này: nếu
`walletActionService.hasActiveSession()` trả false (không có private key) → xoá JWT, coi như chưa đăng nhập, đẩy
thẳng về LoginScreen ([authStore.js:399-432](mobile/src/store/authStore.js#L399-L432); cờ
[mobile/src/services/walletAction.service.js:373](mobile/src/services/walletAction.service.js#L373) `hasActiveSession`).
Nếu thiếu bước này, user thấy dashboard nhưng mọi thao tác ký/giải mã đều fail.

`needsRoleRegistration` / `needsRoleSelection` được suy ra bởi `resolveRoleRequirements`: chưa có vai trò nào →
cần đăng ký; có >1 vai trò và chưa từng chọn → cần chọn
([authStore.js:53-72](mobile/src/store/authStore.js#L53-L72)). Logic chuẩn hoá tên vai trò
(`organization→org`, `admin→ministry`, ưu tiên ministry>org>doctor>patient) ở
[mobile/src/utils/authRoles.js](mobile/src/utils/authRoles.js).

### 5.3 TanStack Query
- Một `QueryClient` chung ([mobile/src/lib/queryClient.ts:14](mobile/src/lib/queryClient.ts#L14)).
- Khi `login`/`logout`, store gọi `queryClient.clear()` + `api.abortAll()` để **không cho dữ liệu của account A rò
  sang account B** (đã từng là bug "đăng nhập B vẫn thấy dashboard A") —
  [authStore.js:99-106](mobile/src/store/authStore.js#L99-L106), [:182-187](mobile/src/store/authStore.js#L182-L187).

---

## 6. Lưu trữ trên thiết bị: AsyncStorage, SecureStore, rủi ro mất khoá

App lưu 2 kho khác nhau theo độ nhạy cảm:

| Kho | Bản chất | Dùng cho | Nguồn |
|---|---|---|---|
| **SecureStore** (`expo-secure-store`) | Android Keystore / iOS Keychain — mã hoá phần cứng | JWT (`jwt_token`), `user_data`, `auth_roles`, cờ `role_selection_done_*`, PIN hash + salt, session Web3Auth | [authStore.js:114-123](mobile/src/store/authStore.js#L114-L123), [pinService.ts:22-23](mobile/src/services/pinService.ts#L22-L23) |
| **AsyncStorage** (`@react-native-async-storage/async-storage`) | key-value JSON không mã hoá | `ehr_local_records` (cid+aesKey theo cidHash), NaCl keypair đã-mã-hoá, cờ biometric/draft/healer | [localRecordStore.ts:21](mobile/src/services/localRecordStore.ts#L21), [nacl-crypto.js:66-68](mobile/src/services/nacl-crypto.js#L66-L68) |

### 6.1 SecureStore "rule key hợp lệ"
SecureStore **chỉ chấp nhận key khớp `[a-zA-Z0-9._-]`**. Vi phạm → crash "Invalid key". Đây là nguồn 2 bug đã fix:
- Key `role_selection_done` ban đầu chứa dấu `:` → đổi sang gạch dưới
  ([authStore.js:25-30](mobile/src/store/authStore.js#L25-L30)).
- Web3Auth lưu session keyed theo tên verifier (vd `email_passwordless`) chứa ký tự lạ → app **bọc SecureStore**
  bằng `sanitizeSecureStoreKey` thay ký tự lạ thành `_`
  ([mobile/src/config/web3authContext.ts:74-82](mobile/src/config/web3authContext.ts#L74-L82)).

### 6.2 `ehr_local_records` — và rủi ro "mất app = mất local key"
- Đây là map `cidHash → { cid, aesKey, ...metadata }`, do **một chủ sở hữu duy nhất** quản lý qua
  `localRecordStore` (có mutex chống ghi đè đua nhau) — [mobile/src/services/localRecordStore.ts](mobile/src/services/localRecordStore.ts).
- **Rủi ro**: AsyncStorage **không mã hoá** và **không sync cloud**. Nếu user gỡ app / đổi máy / logout (logout chủ
  động xoá `ehr_local_records` ở [authStore.js:188-194](mobile/src/store/authStore.js#L188-L194)), khoá AES cục bộ mất.
- **Giảm thiểu**: ngay khi tạo hồ sơ, app **tự gửi một KeyShare cho chính mình** (self key-share) — mã hoá
  `{cid, aesKey}` bằng public key của chính user và đẩy lên backend
  ([mobile/src/screens-v2/CreateRecordScreen.tsx:525-539](mobile/src/screens-v2/CreateRecordScreen.tsx#L525-L539)).
  Vì cặp khoá NaCl tái tạo được từ chữ ký ví (mục 1.4), đăng nhập lại trên máy mới có thể giải mã KeyShare đó →
  lấy lại `aesKey`. Tóm lại: **local key mất, nhưng dữ liệu không mất** nhờ KeyShare trên backend.

### 6.3 Healer — dọn cache hỏng 1 lần
`healLocalRecordCache()` xoá sạch `ehr_local_records` đúng một lần/cài đặt (cờ `ehr_local_records_healed_v1`) để loại
bỏ entry bị "đầu độc" bởi backend cũ trả nhầm khoá phiên bản ancestor
([mobile/src/services/localRecordHealer.service.ts:32-51](mobile/src/services/localRecordHealer.service.ts#L32-L51)).

---

## 7. BẢNG: tất cả service mobile (`mobile/src/services/`)

"Service" ở đây là module JS thuần (không phải React component) gói logic gọi backend / chain / crypto, để screen
import dùng lại.

| Service | Một dòng nhiệm vụ | Nguồn |
|---|---|---|
| `api.js` | HTTP client (fetch) đặt JWT header, timeout, retry GET, abortAll khi logout; `get/post/put/delete/postFormData/ping` | [api.js](mobile/src/services/api.js) |
| `auth.service.js` | Đăng nhập backend: `getNonce`, `login` (ví ký message), đăng ký NaCl pubkey, `getMe`, lấy pubkey người khác | [auth.service.js](mobile/src/services/auth.service.js) |
| `walletAction.service.js` | "Trái tim ví": init Web3Auth, `loginWithWeb3Auth`, lấy `walletContext` (private key→viem account), `signMessage`/`signTypedData`, `hasActiveSession`, logout | [walletAction.service.js](mobile/src/services/walletAction.service.js) |
| `nacl-crypto.js` | Sinh/khôi phục keypair NaCl tất định từ chữ ký ví; `encryptForRecipient`/`decryptFromSender`; lưu khoá đã-mã-hoá | [nacl-crypto.js](mobile/src/services/nacl-crypto.js) |
| `crypto.js` | AES-GCM (`encryptData`/`decryptData` bằng node-forge), sinh AES key, `computeCidHash`, đóng/mở key-share payload | [crypto.js](mobile/src/services/crypto.js) |
| `ipfs.service.js` | Upload/Download lên **Pinata** trực tiếp từ mobile (mobile có Pinata JWT), retry backoff | [ipfs.service.js](mobile/src/services/ipfs.service.js) |
| `record.service.js` | CRUD metadata hồ sơ: `createRecord`, `saveOnly`, `getMyRecords`, `getRecord`, chuỗi version, access list, revoke, hồ sơ bệnh nhân ủy quyền | [record.service.js](mobile/src/services/record.service.js) |
| `keyShare.service.js` | KeyShare off-chain: `shareKey`, nhận/gửi/claim/reject/revoke, khoá theo record, danh sách recipient | [keyShare.service.js](mobile/src/services/keyShare.service.js) |
| `consent.service.js` | Cấp/thu hồi consent on-chain: `grantConsentOnChain` (EIP-712 qua relayer + self-pay), `delegateOnChain` (grantUsingRecordDelegation), liệt kê grantee, `revokeConsent` | [consent.service.js](mobile/src/services/consent.service.js) |
| `delegation.service.js` | Ủy quyền CHAIN: `grantAuthority` (DelegationPermit), `revokeAuthority`, `subDelegate`, `revokeSubDelegation`, `grantUsingDelegation`, list delegates | [delegation.service.js](mobile/src/services/delegation.service.js) |
| `request.service.js` | Luồng yêu cầu truy cập 2 bên: incoming, approval/reject message + sign, archive, mark-claimed, signed requests | [request.service.js](mobile/src/services/request.service.js) |
| `trustedContact.service.js` | Người thân tin cậy: `addContact` (ký permit + relay + "encryption ceremony" pre-share khoá), `removeContact`, auto pre-share record mới, lookup theo CCCD | [trustedContact.service.js](mobile/src/services/trustedContact.service.js) |
| `emergency.service.js` | Truy cập khẩn cấp: request/active/revoke/check | [emergency.service.js](mobile/src/services/emergency.service.js) |
| `verification.service.js` | Xác minh bác sĩ (CCHN): submit, status, pending, approve/reject | [verification.service.js](mobile/src/services/verification.service.js) |
| `org.service.js` | Tổ chức y tế: application, my-org, members (mirror add/remove/revoke), directory, độc-lập doctor, confirm tạo org | [org.service.js](mobile/src/services/org.service.js) |
| `profile.service.js` | Hồ sơ cá nhân: get/update me, get theo địa chỉ, batch lookup | [profile.service.js](mobile/src/services/profile.service.js) |
| `roleRegistration.service.js` | Đăng ký vai trò qua relayer: `register(role)` → POST `/api/relayer/register` | [roleRegistration.service.js](mobile/src/services/roleRegistration.service.js) |
| `accessLog.service.js` | Nhật ký truy cập: `getAccessLogs`, theo record | [accessLog.service.js](mobile/src/services/accessLog.service.js) |
| `push.service.js` | Đăng ký Expo push token với backend, unregister; lazy-load native module (bỏ qua trong Expo Go) | [push.service.js](mobile/src/services/push.service.js) |
| `subgraph.service.js` | GraphQL client gọi The Graph subgraph (fetch records/audit/verified doctors); fallback nếu chưa cấu hình URL | [subgraph.service.js](mobile/src/services/subgraph.service.js) |
| `localRecordStore.ts` | Chủ sở hữu duy nhất `ehr_local_records` (AsyncStorage) với mutex: `getKey/getAll/setKey/merge/deleteKey/clear` | [localRecordStore.ts](mobile/src/services/localRecordStore.ts) |
| `localRecordHealer.service.ts` | Xoá cache local hỏng đúng 1 lần (root-walk migration) | [localRecordHealer.service.ts](mobile/src/services/localRecordHealer.service.ts) |
| `localRecordRetry.service.js` | Thử lại các hồ sơ tạo lỗi (syncStatus='failed'); liệt kê draft local | [localRecordRetry.service.js](mobile/src/services/localRecordRetry.service.js) |
| `keyShareHealer.service.ts` | Vá KeyShare thiếu: người tạo record gửi lại khoá cho recipient có consent nhưng chưa có KeyShare (throttle 1 phút) | [keyShareHealer.service.ts](mobile/src/services/keyShareHealer.service.ts) |
| `pinService.ts` | PIN 6 số fallback khi thiết bị không có biometric: lưu SHA-256(salt::pin) trong SecureStore. **Lưu ý**: infrastructure-only — CHƯA wire vào signing gate ([pinService.ts:14-17](mobile/src/services/pinService.ts#L14-L17)) | [pinService.ts](mobile/src/services/pinService.ts) |

---

## 8. BẢNG: screen theo vai trò (`mobile/src/screens-v2/`)

### 8.1 Dùng chung / Auth
| Screen | Mục đích | Nguồn |
|---|---|---|
| `LandingScreen` | Splash onboarding step 0; "Bắt đầu" → Login | [LandingScreen.tsx](mobile/src/screens-v2/LandingScreen.tsx) |
| `LoginScreen` | Đăng nhập không mật khẩu (Email/SMS OTP + 14 social Web3Auth) | [LoginScreen.tsx](mobile/src/screens-v2/LoginScreen.tsx) |
| `RoleSelectionScreen` | Sau login: đăng ký vai trò (chưa có) hoặc chọn vai trò active (nhiều) | [RoleSelectionScreen.tsx](mobile/src/screens-v2/RoleSelectionScreen.tsx) |
| `ProfileScreen` | Hồ sơ cá nhân + RoleSwitcher + menu (dùng chung mọi vai trò) | [ProfileScreen.tsx](mobile/src/screens-v2/ProfileScreen.tsx) |
| `SettingsScreen` | Cài đặt: ví, bảo mật, biometric, đăng xuất | [SettingsScreen.tsx](mobile/src/screens-v2/SettingsScreen.tsx) |
| `EditProfileScreen` | Sửa hồ sơ (tên, máu, CCCD, BHYT…) | [EditProfileScreen.tsx](mobile/src/screens-v2/EditProfileScreen.tsx) |
| `BiometricSettingsScreen` | Bật/tắt biometric khi ký + trạng thái phần cứng | [BiometricSettingsScreen.tsx](mobile/src/screens-v2/BiometricSettingsScreen.tsx) |
| `ReceiptStandaloneScreen` | "Biên nhận đã ký" của consent ceremony | [ReceiptStandaloneScreen.tsx](mobile/src/screens-v2/ReceiptStandaloneScreen.tsx) |

### 8.2 Patient
| Screen | Mục đích | Nguồn |
|---|---|---|
| `DashboardScreen` | Trang chủ bệnh nhân: hero, "Cần chữ ký", thống kê, danh sách hồ sơ | [DashboardScreen.tsx](mobile/src/screens-v2/DashboardScreen.tsx) |
| `RecordsScreen` | Danh sách hồ sơ + filter (đã chia sẻ / hoạt động) | [RecordsScreen.tsx](mobile/src/screens-v2/RecordsScreen.tsx) |
| `RecordDetailScreen` | **Lõi pháp lý**: chi tiết hồ sơ + consent ceremony (share modal, allowDelegate, biometric, cascade KeyShare) | [RecordDetailScreen.tsx](mobile/src/screens-v2/RecordDetailScreen.tsx) |
| `CreateRecordScreen` | Bệnh nhân tự khai hồ sơ (Nhanh / Đầy đủ: ICD-10, vitals, đơn thuốc) | [CreateRecordScreen.tsx](mobile/src/screens-v2/CreateRecordScreen.tsx) |
| `RequestsScreen` | **Khoảnh khắc consent**: duyệt yêu cầu truy cập từ bác sĩ (EIP-712 biometric-gated) | [RequestsScreen.tsx](mobile/src/screens-v2/RequestsScreen.tsx) |
| `AccessLogScreen` | Nhật ký quyền 3 tab (Trực tiếp / Mọi người / Qua uỷ quyền) | [AccessLogScreen.tsx](mobile/src/screens-v2/AccessLogScreen.tsx) |
| `DelegationScreen` | Cấp Full Delegate cho bác sĩ + thu hồi (epoch cascade) | [DelegationScreen.tsx](mobile/src/screens-v2/DelegationScreen.tsx) |
| `TrustedContactsScreen` | Người thân tin cậy: pre-share khoá cho gia đình + CCCD enrol | [TrustedContactsScreen.tsx](mobile/src/screens-v2/TrustedContactsScreen.tsx) |
| `EmergencyProfileScreen` | "Hồ sơ khẩn cấp" — bản preview ER doctor nhìn thấy | [EmergencyProfileScreen.tsx](mobile/src/screens-v2/EmergencyProfileScreen.tsx) |

### 8.3 Doctor (`screens-v2/doctor/`)
| Screen | Mục đích | Nguồn |
|---|---|---|
| `DoctorDashboardScreen` | Trang chủ bác sĩ: verification badge, stats, quick actions, claims, hồ sơ được chia sẻ | [DoctorDashboardScreen.tsx](mobile/src/screens-v2/doctor/DoctorDashboardScreen.tsx) |
| `DoctorRequestAccessScreen` | Bác sĩ gửi yêu cầu truy cập hồ sơ bệnh nhân | [DoctorRequestAccessScreen.tsx](mobile/src/screens-v2/doctor/DoctorRequestAccessScreen.tsx) |
| `DoctorOutgoingScreen` | Trạng thái yêu cầu đã gửi (`/api/requests/outgoing`) | [DoctorOutgoingScreen.tsx](mobile/src/screens-v2/doctor/DoctorOutgoingScreen.tsx) |
| `DoctorOutgoingSharesScreen` | Danh sách hồ sơ bác sĩ đã chia sẻ ra | [DoctorOutgoingSharesScreen.tsx](mobile/src/screens-v2/doctor/DoctorOutgoingSharesScreen.tsx) |
| `DoctorCreateUpdateScreen` | Bác sĩ tạo/cập nhật phiên bản hồ sơ (versionNote) | [DoctorCreateUpdateScreen.tsx](mobile/src/screens-v2/doctor/DoctorCreateUpdateScreen.tsx) |
| `DoctorDelegatableRecordsScreen` | Hồ sơ có `allowDelegate=true` → re-share (grantUsingRecordDelegation) | [DoctorDelegatableRecordsScreen.tsx](mobile/src/screens-v2/doctor/DoctorDelegatableRecordsScreen.tsx) |
| `DoctorDelegatedPatientsScreen` | Bệnh nhân đã trao toàn quyền (Full Delegate); xem/re-share/sub-delegate | [DoctorDelegatedPatientsScreen.tsx](mobile/src/screens-v2/doctor/DoctorDelegatedPatientsScreen.tsx) |
| `DoctorExpiredRecordsScreen` | Hồ sơ hết hạn / bị thu hồi | [DoctorExpiredRecordsScreen.tsx](mobile/src/screens-v2/doctor/DoctorExpiredRecordsScreen.tsx) |
| `EmergencyLookupScreen` | ER: nhập CCCD → keccak256 → resolve ví + Trusted Contact (audit-logged) | [EmergencyLookupScreen.tsx](mobile/src/screens-v2/doctor/EmergencyLookupScreen.tsx) |
| `CredentialSubmitScreen` | Bác sĩ nộp GPHN/CCHN cho org để xác minh | [CredentialSubmitScreen.tsx](mobile/src/screens-v2/doctor/CredentialSubmitScreen.tsx) |

### 8.4 Org (`screens-v2/org/`)
| Screen | Mục đích | Nguồn |
|---|---|---|
| `OrgDashboardScreen` | Tổng quan tổ chức: tên + stats + member list | [OrgDashboardScreen.tsx](mobile/src/screens-v2/org/OrgDashboardScreen.tsx) |
| `OrgMembersScreen` | Quản lý bác sĩ trong org (revokeDoctorVerification, filter trạng thái) | [OrgMembersScreen.tsx](mobile/src/screens-v2/org/OrgMembersScreen.tsx) |
| `OrgPendingVerificationsScreen` | Duyệt/từ chối xác minh CCHN bác sĩ (on-chain verifyDoctor, biometric) | [OrgPendingVerificationsScreen.tsx](mobile/src/screens-v2/org/OrgPendingVerificationsScreen.tsx) |

### 8.5 Ministry (`screens-v2/ministry/`)
| Screen | Mục đích | Nguồn |
|---|---|---|
| `MinistryDashboardScreen` | Dashboard Bộ Y tế: org list + pending applications + overview contract | [MinistryDashboardScreen.tsx](mobile/src/screens-v2/ministry/MinistryDashboardScreen.tsx) |
| `MinistryCreateOrgScreen` | Tạo tổ chức y tế on-chain (tên + primary/backup admin) | [MinistryCreateOrgScreen.tsx](mobile/src/screens-v2/ministry/MinistryCreateOrgScreen.tsx) |
| `MinistryVerifyDoctorScreen` | Xác minh trực tiếp bác sĩ độc lập (không thuộc bệnh viện) | [MinistryVerifyDoctorScreen.tsx](mobile/src/screens-v2/ministry/MinistryVerifyDoctorScreen.tsx) |
| `MinistryOrgDetailScreen` | Chi tiết org + compliance (Pause/Resume/Revoke) | [MinistryOrgDetailScreen.tsx](mobile/src/screens-v2/ministry/MinistryOrgDetailScreen.tsx) |

---

## 9. Utils chính (`mobile/src/utils/`)

| Util | Nhiệm vụ | Nguồn |
|---|---|---|
| `eip712.js` | Định nghĩa EIP-712 domain + types + hàm ký: `signGrantConsent`, `signDelegationPermit`, `signTrustedContactPermit`; `computeCidHash`, `computeEncKeyHash`, `getDeadline` | [eip712.js](mobile/src/utils/eip712.js) |
| `biometricGate.ts` | Cổng biometric trước khi ký: `requireBiometric`/`gateOrThrow`; graceful degrade nếu không có phần cứng | [biometricGate.ts](mobile/src/utils/biometricGate.ts) |
| `selfPayFallback.js` | `withSelfPayFallback`: chạy relayer; nếu hết quota (QUOTA_EXHAUSTED/402) → user tự broadcast bằng ví mình | [selfPayFallback.js](mobile/src/utils/selfPayFallback.js) |
| `base64.ts` | `normalizeBase64`: bỏ tiền tố data-URI + whitespace trước khi AES | [base64.ts](mobile/src/utils/base64.ts) |
| `authRoles.js` | Chuẩn hoá/suy ra vai trò từ user (`deriveRolesFromUser`, `resolveActiveRole`, `sanitizeRoles`) | [authRoles.js](mobile/src/utils/authRoles.js) |
| `rpcRetry.ts` | `withRpcRetry` (backoff cho 429/network) + `formatChainError` (map lỗi chain → tiếng Việt) | [rpcRetry.ts](mobile/src/utils/rpcRetry.ts) |
| `friendlyError.ts` | Map lỗi backend/provider/picker → câu tiếng Việt thân thiện (không leak English/revert) | [friendlyError.ts](mobile/src/utils/friendlyError.ts) |
| `dateFormatting.ts` | Format ngày/hết hạn vi-VN (`formatExpiry`, `getExpiryUrgency`…) | [dateFormatting.ts](mobile/src/utils/dateFormatting.ts) |

### 9.1 Chi tiết `eip712.js` — vì sao SC dev cần đọc kỹ
- EIP-712 domain: `name='EHR Consent Ledger'`, `version='2'`, `verifyingContract=CONSENT_LEDGER_ADDRESS`
  ([eip712.js:12-17](mobile/src/utils/eip712.js#L12-L17)) — **phải khớp constructor của ConsentLedger.sol**.
- `ConsentPermit` types: `patient, grantee, rootCidHash, encKeyHash, expireAt, allowDelegate, deadline, nonce`
  ([eip712.js:21-32](mobile/src/utils/eip712.js#L21-L32)). Comment ghi rõ đã **bỏ `includeUpdates`** (medical
  episode model) — khớp ghi chú CLAUDE.md context drift.
- `DelegationPermit` dùng `duration` kiểu **uint40 (giây)** ([eip712.js:39-48](mobile/src/utils/eip712.js#L39-L48));
  `nonce` **dùng chung slot `nonces[patient]`** với ConsentPermit và TrustedContactPermit
  ([eip712.js:38](mobile/src/utils/eip712.js#L38), [:52](mobile/src/utils/eip712.js#L52)).
- App ký bằng **local account** (`walletClient.account` = `privateKeyToAccount`) chứ KHÔNG qua RPC
  `eth_signTypedData_v4` — vì node Arbitrum RPC không hỗ trợ ([eip712.js:83-88](mobile/src/utils/eip712.js#L83-L88)).

### 9.2 `biometricGate` — vì sao biometric đứng TRƯỚC mỗi lần ký
Web3Auth tạo chữ ký ECDSA là **primitive kỹ thuật**; theo TT 13/2025/TT-BYT Điều 3.2, **biometric** mới là dạng
chữ ký điện tử được công nhận. Vì vậy mọi hàm ký (consent/delegation/trusted-contact/tạo hồ sơ/revoke) đều gọi
`gateOrThrow(...)` ngay trước khi ký (định nghĩa hàm [biometricGate.ts:130-137](mobile/src/utils/biometricGate.ts#L130-L137);
rationale + cách dùng ở header [:1-19](mobile/src/utils/biometricGate.ts#L1-L19)). Thiết bị
không có/không enroll biometric → **vẫn cho qua** (graceful degrade,
[biometricGate.ts:104-109](mobile/src/utils/biometricGate.ts#L104-L109)). Toggle tắt được trong Settings (mặc định ON).
**Lưu ý**: PIN fallback (`pinService.ts`) hiện là infrastructure-only — graceful-degrade KHÔNG gọi vào `pinService`,
nó chỉ `return true` ([biometricGate.ts:104-109](mobile/src/utils/biometricGate.ts#L104-L109)); PIN chưa được consult
khi ký (xem [pinService.ts:14-17](mobile/src/services/pinService.ts#L14-L17)).

---

## 10. Luồng end-to-end (chức năng): Bệnh nhân tạo hồ sơ mới

Đây là luồng tiêu biểu thể hiện cả 3 lớp mã hoá + ai trả gas + ai đọc được gì. Màn:
`CreateRecordScreen` ([mobile/src/screens-v2/CreateRecordScreen.tsx](mobile/src/screens-v2/CreateRecordScreen.tsx)),
handler `handleSubmit` ([:372](mobile/src/screens-v2/CreateRecordScreen.tsx#L372)).

```
[UI: CreateRecordScreen.handleSubmit]
   │  buildPayload(...) → FHIR-ish JSON  (title, vitals, ICD-10, đơn thuốc...)   :422
   │
   ├─(1) gateOrThrow('Xác thực để tạo hồ sơ y tế mới')   biometric             :439
   │
   ├─(2) aesKey = generateAESKey()  (AES-256 ngẫu nhiên)  crypto.js            :440
   │     encryptedData = encryptData(payload, aesKey)     AES-GCM              :441
   │
   ├─(3) { cid } = ipfsService.uploadEncrypted(...)       → IPFS/Pinata        :442
   │        (ciphertext lên IPFS; chỉ ai có aesKey mới giải mã được)
   │
   ├─(4) cidHash = keccak256(toBytes(cid))  (KHÔNG để plaintext CID on-chain)  :447
   │
   ├─(5) localRecordStore.setKey(cidHash, {cid, aesKey, ...})  AsyncStorage    :466
   │
   ├─(6) withSelfPayFallback(                                                   :472
   │        relayer  → recordApi.createRecord(cidHash, recordTypeHash, parent...)
   │                   → BACKEND → relayer sponsor → RecordRegistry.addRecord
   │        self-pay → walletClient.writeContract(RecordRegistry.addRecord)    :477-483
   │     )
   │     nếu self-paid → recordApi.saveOnly(...) để backend mirror metadata     :484-495
   │
   ├─(7) localRecordStore.setKey(cidHash, {... syncStatus:'confirmed', txHash}) :497
   │
   ├─(8) autoPreShareNewRecord(...)  → pre-share khoá cho Trusted Contacts      :520
   │
   ├─(9) SELF KeyShare backup:                                                  :525-539
   │        encryptForRecipient({cid,aesKey}, MY_pubkey, MY_seckey)  NaCl box
   │        → keyShareService.shareKey(recipient = chính mình)  → BACKEND DB
   │        (chống "mất app = mất local key" — mục 6.2)
   │
   └─(10) [nếu là update] propagate khoá cho mọi recipient của hồ sơ gốc       :541-570
          → navigation.replace('RecordDetail', ...)                            :584
```

**Ai trả gas?** Bước (6): mặc định **backend relayer trả** (sponsored, 100 lượt/tháng). Hết quota → user **tự trả**
bằng ETH trong ví Web3Auth của mình (`withSelfPayFallback` —
[selfPayFallback.js:43-75](mobile/src/utils/selfPayFallback.js#L43-L75)). Nếu ví rỗng → báo lỗi `NO_ETH_FOR_SELF_PAY`
([selfPayFallback.js:62-69](mobile/src/utils/selfPayFallback.js#L62-L69)).

**Dữ liệu gì được mã hoá, ai đọc được gì?**
- Nội dung y tế: AES-GCM → IPFS. Người có IPFS chỉ thấy **ciphertext**.
- On-chain (RecordRegistry): chỉ `cidHash` (băm) + `recordTypeHash` + parent — **không có CID, không có nội dung**.
- `aesKey`: chỉ tồn tại (a) trong AsyncStorage máy chủ sở hữu, (b) **đã NaCl-box** trong KeyShare trên backend cho
  từng người nhận. **Backend là "blind mailbox"**: nó giữ `encryptedPayload` nhưng không có NaCl secret key nên
  không giải mã được.

---

## 11. Luồng đăng nhập (tóm tắt) — vì sao đặc biệt

Màn `LoginScreen.handleWeb3Login` ([mobile/src/screens-v2/LoginScreen.tsx:181](mobile/src/screens-v2/LoginScreen.tsx#L181)):

```
1. walletActionService.loginWithWeb3Auth(provider, {loginHint})   → mở Web3Auth, nhận ví   LoginScreen.tsx:206
2. authService.ping()                                              → đánh thức backend       :211
3. authService.getNonce(address)                                  → lấy message nonce        :212
4. walletActionService.signMessage(walletClient, message)        → ví ký nonce              :216
5. authService.login(address, message, signature)                → backend verify → JWT     :217
6. authStore.login(token, user, deriveRolesFromUser(user))       → set state + clear cache  :227
7. getOrCreateEncryptionKeypair + authService.registerEncryptionKey → đăng ký NaCl pubkey   :230-233
```

Điểm cần nhớ để trả lời hội đồng:
- **Không có mật khẩu**: đăng nhập = social/OTP qua Web3Auth → ra private key → ví ký nonce để chứng minh sở hữu.
  Backend chỉ `verifyMessage` chữ ký (`auth.service.login` POST `/api/auth/login`,
  [auth.service.js:16-28](mobile/src/services/auth.service.js#L16-L28)).
- Private key **chỉ sống trong RAM** (`cachedWalletContext`), **không bao giờ persist** vào SecureStore
  ([walletAction.service.js:22-25](mobile/src/services/walletAction.service.js#L22-L25)) — đúng nguyên tắc
  self-custody. Đọc key ưu tiên từ `privateKeyProvider.state.privateKey`, fallback RPC `eth_private_key`
  ([walletAction.service.js:192-218](mobile/src/services/walletAction.service.js#L192-L218)).
- Đăng ký NaCl pubkey (bước 7) là bắt buộc để người khác **NaCl-box khoá AES gửi cho mình** sau này.

---

## 12. Push notifications (trạng thái thực tế)

- Đăng ký token: `push.service.syncPushTokenWithBackend()` được gọi fire-and-forget sau `login`
  ([authStore.js:138-139](mobile/src/store/authStore.js#L138-L139)). Trong Expo Go hoặc không phải thiết bị thật →
  **bỏ qua** ([push.service.js:38-45](mobile/src/services/push.service.js#L38-L45)).
- Lắng nghe + deeplink khi user chạm notification: `setupNotificationListeners()` ở App boot
  ([mobile/src/lib/notifications.ts:24-63](mobile/src/lib/notifications.ts#L24-L63)); backend gửi `data.screen` +
  `data.params` → `safeNavigate`. (CLAUDE.md mục 12 ghi "listeners mobile: 0%" — đã stale, listeners hiện đã có.)

---

## Nguồn đã đọc

- [mobile/App.tsx](mobile/App.tsx)
- [mobile/index.ts](mobile/index.ts)
- [mobile/src/navigation/AppNavigator.tsx](mobile/src/navigation/AppNavigator.tsx)
- [mobile/src/store/authStore.js](mobile/src/store/authStore.js)
- [mobile/src/config/web3authContext.ts](mobile/src/config/web3authContext.ts)
- [mobile/src/providers/QueryProvider.tsx](mobile/src/providers/QueryProvider.tsx)
- [mobile/src/lib/queryClient.ts](mobile/src/lib/queryClient.ts)
- [mobile/src/lib/notifications.ts](mobile/src/lib/notifications.ts)
- [mobile/src/components/RoleSwitcher.tsx](mobile/src/components/RoleSwitcher.tsx)
- Services: [api.js](mobile/src/services/api.js), [auth.service.js](mobile/src/services/auth.service.js),
  [walletAction.service.js](mobile/src/services/walletAction.service.js), [nacl-crypto.js](mobile/src/services/nacl-crypto.js),
  [crypto.js](mobile/src/services/crypto.js), [ipfs.service.js](mobile/src/services/ipfs.service.js),
  [record.service.js](mobile/src/services/record.service.js), [keyShare.service.js](mobile/src/services/keyShare.service.js),
  [consent.service.js](mobile/src/services/consent.service.js), [delegation.service.js](mobile/src/services/delegation.service.js),
  [request.service.js](mobile/src/services/request.service.js), [trustedContact.service.js](mobile/src/services/trustedContact.service.js),
  [emergency.service.js](mobile/src/services/emergency.service.js), [verification.service.js](mobile/src/services/verification.service.js),
  [org.service.js](mobile/src/services/org.service.js), [profile.service.js](mobile/src/services/profile.service.js),
  [roleRegistration.service.js](mobile/src/services/roleRegistration.service.js), [accessLog.service.js](mobile/src/services/accessLog.service.js),
  [push.service.js](mobile/src/services/push.service.js), [subgraph.service.js](mobile/src/services/subgraph.service.js),
  [localRecordStore.ts](mobile/src/services/localRecordStore.ts), [localRecordHealer.service.ts](mobile/src/services/localRecordHealer.service.ts),
  [localRecordRetry.service.js](mobile/src/services/localRecordRetry.service.js), [keyShareHealer.service.ts](mobile/src/services/keyShareHealer.service.ts),
  [pinService.ts](mobile/src/services/pinService.ts)
- Utils: [eip712.js](mobile/src/utils/eip712.js), [biometricGate.ts](mobile/src/utils/biometricGate.ts),
  [selfPayFallback.js](mobile/src/utils/selfPayFallback.js), [base64.ts](mobile/src/utils/base64.ts),
  [authRoles.js](mobile/src/utils/authRoles.js), [rpcRetry.ts](mobile/src/utils/rpcRetry.ts),
  [friendlyError.ts](mobile/src/utils/friendlyError.ts), [dateFormatting.ts](mobile/src/utils/dateFormatting.ts)
- Screens: [LoginScreen.tsx](mobile/src/screens-v2/LoginScreen.tsx),
  [CreateRecordScreen.tsx](mobile/src/screens-v2/CreateRecordScreen.tsx) (đầy đủ + đọc lướt header toàn bộ screen còn lại
  qua `head` để lấy mục đích — patient/doctor/org/ministry)
