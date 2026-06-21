# Chức năng — Bộ Y tế tạo cơ sở & cơ sở xác minh bác sĩ (CCHN)

## Tóm tắt 30 giây

Hệ thống mô phỏng mô hình quản lý ngành Y tế Việt Nam **2 tầng**:

1. **Bộ Y tế (Ministry)** là gốc tin cậy duy nhất, cố định (`immutable`) ngay từ khi deploy contract. Bộ Y tế dùng `createOrganization(name, primaryAdmin, backupAdmin)` để tạo một **cơ sở y tế** (bệnh viện/phòng khám) on-chain — cấp ngay cờ `ORGANIZATION | VERIFIED_ORG` cho **2 ví admin** (chính + dự phòng).
2. **Org admin** (cơ sở) xác minh bác sĩ: bác sĩ nộp **CCHN/GPHN** (số chứng chỉ + tài liệu) — backend lưu **bản mã hoá off-chain**, on-chain chỉ giữ **hash + chuỗi credential**. Org admin duyệt → gọi `verifyDoctor(doctor, credential)` set cờ `VERIFIED_DOCTOR`.
3. Bác sĩ độc lập (tư nhân, không thuộc cơ sở) thì **Bộ Y tế xác minh trực tiếp** bằng `verifyDoctorByMinistry`.

**Tại sao quan trọng:** cờ `VERIFIED_DOCTOR` là điều kiện bắt buộc để bác sĩ **đọc** record được chia sẻ. `ConsentLedger.canAccess` (FIX audit #3) **từ chối** mọi grantee là doctor nhưng chưa verified — đây là chốt chặn an toàn quan trọng nhất của tính năng này.

> Trong toàn bộ flow này **không có gas sponsorship**: Ministry và Org admin **tự trả gas** cho các giao dịch của chính họ (xem mục 6).

---

## 1. Khái niệm nền (cho người chưa rành backend/mobile/crypto)

| Khái niệm | Giải thích ngắn |
|---|---|
| **Bitwise role flags** | Quyền của một địa chỉ được nén vào 1 byte `uint8`. Mỗi quyền là 1 bit: `PATIENT=1`, `DOCTOR=2`, `ORGANIZATION=4`, `MINISTRY=8`, `VERIFIED_DOCTOR=16`, `VERIFIED_ORG=32` (`contracts/src/AccessControl.sol:23-30`). Cộng quyền = OR (`\|`), gỡ quyền = AND-NOT (`& ~`). `VERIFIED_*` là **cờ**, không phải role riêng — một địa chỉ vừa là `DOCTOR` vừa có thêm cờ `VERIFIED_DOCTOR`. |
| **CCHN / GPHN** | Chứng chỉ hành nghề khám chữa bệnh (trong code dùng cả "CCHN" và "GPHN"). Đây là giấy phép pháp lý để bác sĩ hành nghề. Hệ thống coi đây là thứ cần được cơ sở/Bộ đối chiếu trước khi cấp cờ verified. |
| **off-chain (mã hoá)** | Số CCHN gốc + tài liệu **không lưu plaintext on-chain** (public, ai cũng đọc được). Backend mã hoá bằng AES-256-GCM rồi lưu DB; on-chain chỉ giữ **hash** (không đảo ngược được). |
| **viem `writeContract`** | Hàm trong app mobile gửi một giao dịch ghi (transaction) lên blockchain Arbitrum Sepolia. Ví của người dùng ký và trả gas. |
| **mirror / sync DB** | Sau khi tx on-chain thành công, mobile gọi thêm 1 API backend để **cập nhật bản cache trong Postgres** cho UI hiển thị tức thì (không phải chờ worker đồng bộ event). DB chỉ là cache — **chân lý là on-chain**. |
| **biometric gate** | Trước khi ký giao dịch nhạy cảm, mobile bắt xác thực vân tay/khuôn mặt (`gateOrThrow`, `mobile/src/screens-v2/ministry/MinistryCreateOrgScreen.tsx:107`). |

---

## 2. Hợp đồng — `AccessControl.sol` (phần liên quan)

Người đọc rành Solidity nên đây chỉ điểm sơ bộ từng hàm. Tất cả ở `contracts/src/AccessControl.sol`.

### 2.1 Storage gốc

- `address public immutable MINISTRY_OF_HEALTH` — đặt 1 lần trong constructor, **không đổi được** (`AccessControl.sol:33`, `:62`). Constructor cấp cho ví Ministry **chỉ role `MINISTRY`** (không phải ORGANIZATION — "Bộ là cơ quan quản lý, không phải bệnh viện") và set nó làm relayer mặc định (`AccessControl.sol:64-71`).
- `uint256 public orgCount` + `mapping(uint256 => Organization) public organizations` + `mapping(address => uint256) public adminToOrgId` — registry cơ sở theo `orgId` (`AccessControl.sol:54-56`).

### 2.2 `createOrganization(name, primaryAdmin, backupAdmin)` → `orgId`

Chỉ Ministry gọi được (`onlyMinistry`, `AccessControl.sol:108`). Logic chính (`AccessControl.sol:104-157`):

| Bước | Code |
|---|---|
| Validate: `primaryAdmin != 0`, `name` không rỗng, primary ≠ backup | `:109-111` |
| Mỗi admin chưa được làm admin org khác (`adminToOrgId == 0`) | `:114-119` |
| Cấp `orgId = ++orgCount` (id bắt đầu từ 1) | `:121` |
| Lưu struct `Organization{ id, name, primaryAdmin, backupAdmin, createdAt, active:true }` | `:123-130` |
| **Cấp cho primaryAdmin: `_roles[primaryAdmin] |= ORGANIZATION | VERIFIED_ORG`** + ghi `orgVerifications` (active) | `:133-142` |
| Nếu có backupAdmin: cấp **y hệt** (2 admin bình đẳng on-chain) | `:144-154` |
| `emit OrganizationCreated(orgId, name, primaryAdmin, backupAdmin)` | `:156` |

→ Điểm cốt lõi cho hội đồng: **cơ sở được tạo và đã-xác-minh ngay lập tức**, không có bước "đăng ký rồi chờ duyệt" on-chain. Cả 2 ví admin được verified-org đồng thời.

### 2.3 `verifyDoctor(doctor, credential)` — org admin xác minh

```
function verifyDoctor(address doctor, string credential) external {
    uint256 orgId = adminToOrgId[msg.sender];
    if (orgId == 0 || !organizations[orgId].active) revert NotAuthorized();
    _verifyDoctor(doctor, credential, orgId);
}
```
(`AccessControl.sol:313-318`). Caller phải là admin của **một cơ sở đang active**. `_verifyDoctor` (`:326-339`):
- Bắt buộc `doctor` đã có role `DOCTOR` (`:327`).
- `_roles[doctor] |= VERIFIED_DOCTOR` (`:329`).
- Ghi `doctorVerifications[doctor] = { verifier: msg.sender, credential, verifiedAt, active:true }` (`:331-336`).
- `emit DoctorVerified(doctor, msg.sender, orgId, credential)` (`:338`). Event signature: `DoctorVerified(address indexed doctor, address indexed verifier, uint256 indexed orgId, string credential)` (`contracts/src/interfaces/IAccessControl.sol:29`).

> `credential` trên chuỗi thường là **số CCHN dạng chuỗi** (vd `"028294/HN-CCHN"`) hoặc fallback `"VERIFIED"`. Nó là **public**. Nội dung nhạy cảm/tài liệu thì nằm off-chain mã hoá (mục 5).

### 2.4 `verifyDoctorByMinistry(doctor, credential)` — Bộ xác minh trực tiếp

`onlyMinistry`, gọi `_verifyDoctor(doctor, credential, 0)` với `orgId = 0` để đánh dấu "do Bộ verify" trong event (`AccessControl.sol:321-323`). Dùng cho bác sĩ độc lập không thuộc cơ sở.

### 2.5 `addOrgMember(orgId, doctor)` — thêm bác sĩ vào cơ sở

`AccessControl.sol:345-361`. Khác `verifyDoctor`: chỉ tạo **quan hệ thành viên** (`isMemberOfOrgById`, `orgMembersByOrgId`), **không** set cờ verified. Caller phải là active org admin của đúng `orgId` và `doctor` phải có role DOCTOR.

### 2.6 `setOrgActive(orgId, active)` — bật/tắt cơ sở (ảnh hưởng CHÍNH XÁC)

`onlyMinistry` (`AccessControl.sol:220-244`). Khi `active=false`:
- `org.active = false`.
- Gỡ cờ `VERIFIED_ORG` của primaryAdmin (và backupAdmin nếu có): `_roles[...] &= ~VERIFIED_ORG`, set `orgVerifications[...].active = false` (`:235-240`).
- `emit OrganizationStatusChanged(orgId, active)` (`:243`).

**Phạm vi ảnh hưởng (không phóng đại):**
- Admin của cơ sở mất cờ verified-org → `verifyDoctor` của họ sẽ revert (vì `!organizations[orgId].active` ở `:316`). Tức **không thể xác minh bác sĩ mới** khi cơ sở bị tắt.
- **KHÔNG cascade**: các bác sĩ đã được verified trước đó **vẫn giữ cờ `VERIFIED_DOCTOR`** — `setOrgActive` không lặp qua danh sách thành viên để gỡ cờ của họ (xem lại `:227-241`, chỉ chạm tới 2 ví admin). Muốn gỡ cờ một bác sĩ cụ thể phải gọi `revokeDoctorVerification` riêng.

### 2.7 `revokeOrgVerification(org)` — thu hồi xác minh cơ sở (cấp ví)

`onlyMinistry` (`AccessControl.sol:429-434`). Set `orgVerifications[org].active = false` và `_roles[org] &= ~VERIFIED_ORG`, emit `VerificationRevoked(org, msg.sender)`.

**Lưu ý quan trọng (đừng nhầm với `setOrgActive`):** hàm này nhận **địa chỉ ví** (`org`), không phải `orgId`, và **không** đổi `organizations[orgId].active`. Nó chỉ gỡ cờ verified của đúng ví đó. Cũng **không** cascade xuống bác sĩ.

### 2.8 `revokeDoctorVerification(doctor)` — thu hồi xác minh bác sĩ

`AccessControl.sol:414-427`. Chỉ **verifier ban đầu** hoặc **Ministry** được gọi (`:419`). Set `verif.active=false`, `_roles[doctor] &= ~VERIFIED_DOCTOR`, emit `VerificationRevoked`.

### 2.9 `isVerifiedDoctor(user)` — view quyết định

```
return (_roles[user] & VERIFIED_DOCTOR) != 0 && doctorVerifications[user].active;
```
(`AccessControl.sol:446-449`). **Hai điều kiện AND**: vừa có bit cờ, vừa `active=true`. Đây là hàm mà `ConsentLedger.canAccess` gọi để chốt quyền đọc (mục 7).

---

## 3. Luồng A — Bộ Y tế tạo cơ sở (end-to-end)

### Sơ đồ ASCII

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MOBILE (ví Ministry)        BACKEND               BLOCKCHAIN (Arbitrum)    │
│ MinistryCreateOrgScreen                           AccessControl.sol        │
└──────────────────────────────────────────────────────────────────────────┘

 1. Nhập: name + primaryAdmin + backupAdmin
    Validate: 2 ví hợp lệ, khác nhau,
    KHÔNG được là chính ví Ministry  ──────────────────────────────────────┐
                                                                            │
 2. Bấm "Phát giao dịch" → biometric (gateOrThrow)                          │
                                                                            ▼
 3. writeContract createOrganization(name, primary, backup) ──────► createOrganization()
    (ví Ministry ký + TRẢ GAS)                                       ++orgCount → orgId
                                                                     cấp ORGANIZATION|VERIFIED_ORG
                                                                     cho cả 2 admin
                                                              ◄──── emit OrganizationCreated
 4. waitForTransactionReceipt → parseEventLogs
    lấy orgId (fallback: đọc orgCount())
                                                                            
 5. orgService.confirmOrgCreation({orgId,name,...,txHash})
        │
        ▼
   POST /api/admin/confirm-org-creation  ─► isMinistry middleware (đọc isMinistry on-chain)
                                            getTransactionReceipt(txHash) sanity-check
                                            upsert Organization {isVerified:true, isActive:true}
                                            upsert OrganizationMember {role:'admin'}
                                            emit socket 'org:approved' + push notif
        │
        ▼
 6. Alert "Đã tạo cơ sở (mã: orgId)" → goBack
```

### Chi tiết từng tầng

**(1) UI mobile** — `mobile/src/screens-v2/ministry/MinistryCreateOrgScreen.tsx`:
- Form 3 trường: tên + 2 ví hex (`:59-61`).
- Validate: tên ≥ 2 ký tự, 2 ví đúng format `0x…40 hex` và ≠ `0x000…`, 2 ví khác nhau (`:47-82`).
- **Chốt nghiệp vụ (Audit P1):** Ministry **không được tự đặt mình** làm admin org — vai trò xung đột (Bộ là tầng governance, không vận hành cơ sở) (`:67-70`, `:78-79`).

**(2-3) Ký + gửi tx** — `:106-122`:
- `walletActionService.getWalletContext()` lấy ví, `gateOrThrow('Xác thực để tạo tổ chức y tế mới')` bắt biometric.
- `writeContract` gọi `createOrganization` với `args:[trimmedName, primary, backup]`, gas thủ công `500000`, fee thấp (Arbitrum Sepolia rẻ). **Ví Ministry tự trả gas** — không qua relayer.

**(4) Lấy orgId** — `:124-150`:
- Chờ receipt, `parseEventLogs` event `OrganizationCreated` lấy `args.orgId`.
- Fallback nếu không parse được: đọc `orgCount()` (vì id = orgCount hiện tại do `++orgCount`).

**(5) Sync backend** — `orgService.confirmOrgCreation` (`mobile/src/services/org.service.js:108-118`) → `POST /api/admin/confirm-org-creation` (`backend/src/routes/admin.routes.js:226-340`):
- Qua `isMinistry` middleware: **đọc lại `isMinistry` on-chain** (`admin.routes.js:39-59`) — backend không tin token mù.
- `getTransactionReceipt(txHash)` kiểm tra tx tồn tại + `status === 'success'` (`:232-240`). (Code ghi chú: chưa parse log để đối chiếu đúng orgId — "trust input + receipt existence", `:242-244`.)
- Upsert `Organization` với `chainOrgId`, `isVerified:true`, `isActive:true`, lưu `backupAdminAddress` (`:251-282`).
- Upsert `OrganizationMember{ role:'admin', status:'active' }` cho primaryAdmin (`:297-315`).
- Gửi socket `org:approved` + push notif cho admin (`:325-334`).

**(6) Kết quả:** Alert "Đã tạo cơ sở (mã: orgId). Cả 2 ví admin đã có quyền quản trị." (`MinistryCreateOrgScreen.tsx:160-164`).

> **Lưu ý drift:** route cũ `POST /api/org/register` + `POST /api/org/:orgId/verify` (`backend/src/routes/org.routes.js:172-217`, `:600-621`) và `POST /api/admin/org-applications/:id/approve` đều là **legacy**. Cái approve đã trả `410 ORG_FLOW_DEPRECATED` (`admin.routes.js:121-127`). Luồng chuẩn hiện tại = `createOrganization` on-chain + `confirm-org-creation`.

---

## 4. Luồng B — Cơ sở xác minh bác sĩ (CCHN), end-to-end

### Sơ đồ ASCII

```
 BÁC SĨ (CredentialSubmitScreen)         BACKEND                 ORG ADMIN (OrgPendingVerificationsScreen)
 ───────────────────────────────         ───────                 ─────────────────────────────────────────
 1. GET /api/org/directory ──────────────► trả list org verified+active
    chọn cơ sở từ dropdown
 2. Nhập số CCHN + chuyên khoa
    + đính kèm tài liệu (ảnh)
 3. "Ký và gửi" →
    POST /api/verification/submit ────────► tạo VerificationRequest {status:'pending'}
                                            (requireDoctorRole: đọc role on-chain)
                                                            │
                                                            ▼
                                            4. GET /api/verification/pending  ◄─── org admin mở màn duyệt
                                               + computeVerificationOutcome (4 checks)
                                                            │
                                                            ▼
 (mã hoá CCHN off-chain, optional)         5. Admin bấm "Xác thực":
                                            POST /api/verification/review {approved:true}
                                            → cập nhật status='approved'
                                            → trả contractCall {fn:'verifyDoctor', args:[doctor, license]}
                                                            │
                                                            ▼ (mobile org admin)
                                            6. biometric → writeContract verifyDoctor(doctor, credential)
                                               (ví ORG ADMIN ký + TRẢ GAS) ───► AccessControl._verifyDoctor
                                                                                  set VERIFIED_DOCTOR
                                                                                  emit DoctorVerified
```

### Chi tiết từng tầng

**(1) Bác sĩ chọn cơ sở** — `mobile/src/screens-v2/doctor/CredentialSubmitScreen.tsx`:
- Khi mở màn, gọi song song `getMyVerificationStatus()` + `orgService.getOrgDirectory()` (`:111-125`).
- `GET /api/org/directory` (`backend/src/routes/org.routes.js:553-574`) trả **chỉ org `isActive:true, isVerified:true`** và **chỉ field an toàn** (`id, chainOrgId, name, orgType, location`) — không lộ email admin/license nội bộ. Đây là endpoint **mọi user đăng nhập** đều gọi được (bác sĩ cần để chọn cơ sở xác minh; `/all` thì Ministry-only nên sẽ 403 bác sĩ).
- Dropdown `OrgPicker` (`CredentialSubmitScreen.tsx:426-534`).

**(2-3) Nộp hồ sơ** — `handleSubmit` (`CredentialSubmitScreen.tsx:201-244`):
- Bắt buộc: chọn cơ sở + số CCHN + chuyên khoa + ≥1 tài liệu.
- **Upload tài liệu là MOCK** (Q2 design): chỉ lưu tên file, dựng `documentCid = "mock-..."` placeholder, không upload IPFS thật (`:221-233`, header `:11-13`). Production cần thêm upload IPFS thật.
- Gọi `verificationService.submitVerification(...)` → `POST /api/verification/submit`.
- `POST /api/verification/submit` (`backend/src/routes/verification.routes.js:187-228`): qua `requireDoctorRole` (đọc role on-chain), chặn nếu đã có request `pending`, rồi tạo `VerificationRequest` (chứa `fullName, licenseNumber, specialty, organization, documentCid`). **Đây là off-chain, chưa đụng chuỗi.**

**(4) Org admin xem hàng chờ** — `mobile/src/screens-v2/org/OrgPendingVerificationsScreen.tsx`:
- `verificationService.getPendingVerifications()` → `GET /api/verification/pending` (`verification.routes.js:233-255`), gated `requireOrgOrMinistry` (`:29`).
- Mỗi request được **làm giàu bằng `verificationOutcome` 4-check** (`computeVerificationOutcome`, `verification.routes.js:41-111`): (1) chữ ký hồ sơ hợp lệ, (2) số CCHN đúng format, (3) cơ sở đã được Bộ xác minh (`isVerified && isActive`), (4) bác sĩ chưa từng bị thu hồi. Đây là **gợi ý hỗ trợ quyết định**, không tự động duyệt. UI hiển thị điểm vd `4/4` và mở rộng xem chi tiết (`OrgPendingVerificationsScreen.tsx:124-201`).

**(5) Duyệt off-chain** — `handleApprove` (`OrgPendingVerificationsScreen.tsx:320-369`):
- `verificationService.approveVerification(item.id)` → `POST /api/verification/review {approved:true}` (`verification.routes.js:279-321`), gated `requireMinistryRole`.
- Backend set `status='approved'`, lưu `reviewedBy/reviewedAt`, và **trả về `contractCall = { function:'verifyDoctor', args:[doctorAddress, licenseNumber || 'VERIFIED'] }`** (`verification.routes.js:308-317`) — backend **không tự broadcast**, nó chỉ đưa "đơn thuốc" để mobile ký.

> ⚠️ Lưu ý: route `/review` đang gate `requireMinistryRole` (`verification.routes.js:279`) trong khi `/pending` cho cả org admin. Đây là điểm cần để ý khi trình bày (org admin nộp review có thể bị 403 nếu chỉ là org-admin không phải Ministry — **chưa kiểm chứng hành vi runtime của `requireOnChainRoles`** với role `orgAdmin`).

**(6) Ghi on-chain** — `OrgPendingVerificationsScreen.tsx:339-348`:
- `getWalletContext()` (`:339`) + `gateOrThrow('Để xác thực bác sĩ')` (`:340`, biometric).
- `writeContract verifyDoctor(doctorAddr, credential)` (`:342-348`) — **ví org admin ký + TRẢ GAS**. Đây là bước duy nhất chạm chuỗi và set cờ `VERIFIED_DOCTOR`.
- Báo lỗi thân thiện nếu `NotAuthorized`/`NotVerifiedOrg` ("Ví này không phải admin tổ chức đã được xác minh") (`:353-357`).

### 4b. Bác sĩ độc lập — Bộ xác minh trực tiếp

`mobile/src/screens-v2/ministry/MinistryVerifyDoctorScreen.tsx`:
- Lấy list bác sĩ **không thuộc cơ sở nào**: `getIndependentDoctors(status)` → `GET /api/admin/independent-doctors` (`backend/src/routes/admin.routes.js:399-471`). "Independent" = có `DoctorProfile` nhưng không nằm trong `OrganizationMember` active nào (`:433-434`).
- Bấm "Xác minh" → confirm → biometric → `writeContract verifyDoctorByMinistry(doctorAddr, credential)` (`MinistryVerifyDoctorScreen.tsx:104-113`). **Ví Ministry trả gas.**
- Sau tx → `mirrorVerifyDoctor(doctorAddr, txHash, credential)` → `POST /api/admin/verify-doctor-mirror` (`admin.routes.js:479-535`): cập nhật/ tạo `VerificationRequest{status:'approved'}` để list phản ánh trạng thái verified.

---

## 5. Mã hoá CCHN off-chain: ai đọc được gì

Đây là phần luận thesis nhấn mạnh "on-chain công khai, dữ liệu nhạy cảm phải mã hoá".

| Nơi lưu | Lưu gì | Ai đọc được |
|---|---|---|
| **On-chain** `doctorVerifications[doctor].credential` | Chuỗi credential (thường = **số CCHN dạng text**, hoặc `"VERIFIED"`) | Public — bất kỳ ai (`AccessControl.sol:331-336`) |
| **Off-chain DB** `DoctorCredential.encryptedData` | Số CCHN gốc **mã hoá AES-256-GCM** (format `iv:ciphertext:authTag`) | Chỉ backend có `CREDENTIAL_ENCRYPTION_KEY` mới giải được |
| **Off-chain DB** `DoctorCredential.credentialHash` | Hash của credential (không đảo ngược) | Public-ish (chỉ để đối chiếu, không lộ nội dung) |

Endpoint lưu off-chain: `POST /api/org/doctor-credential` (`backend/src/routes/org.routes.js:631-679`):
- Chỉ org admin **hoặc** Ministry gọi được (kiểm tra membership + đọc `getUserRoleStrict` on-chain, `:636-651`).
- `encryptAES(credential)` (`backend/src/utils/crypto.js:41-57`) → AES-256-GCM với khoá 32 byte từ env `CREDENTIAL_ENCRYPTION_KEY` (`crypto.js:9-35`). Production bắt buộc có khoá thật, không thì fail-fast (`:13-18`).
- Upsert vào `DoctorCredential { credentialHash, encryptedData, verifiedByOrgId }` (`org.routes.js:657-670`).

> Điểm trả lời hội đồng: kể cả DB bị lộ, attacker chỉ thấy `encryptedData` (ciphertext) + `credentialHash` — **không** ra được số CCHN gốc nếu không có khoá AES. Kể cả chain bị "lộ" thì on-chain vốn đã public, nhưng nó chỉ chứa chuỗi credential ngắn + hash, không phải tài liệu/ảnh CCCD.

---

## 6. Ai trả gas (tổng hợp)

| Giao dịch | Người ký & trả gas | Sponsor? |
|---|---|---|
| `createOrganization` | Ví **Ministry** | Không — `writeContract` trực tiếp (`MinistryCreateOrgScreen.tsx:113`) |
| `verifyDoctor` (org duyệt) | Ví **Org admin** | Không (`OrgPendingVerificationsScreen.tsx:342`) |
| `verifyDoctorByMinistry` | Ví **Ministry** | Không (`MinistryVerifyDoctorScreen.tsx:104`) |
| `submitVerification` (bác sĩ nộp) | — (chỉ ghi DB off-chain) | Không có tx on-chain |

Phù hợp ghi chú CLAUDE.md: Doctor/Org **không** được sponsor vì `msg.sender` phải đúng ví họ để qua các check `verifyDoctor`/`onlyMinistry`. (Đã verify: cả 3 màn dùng `walletClient.writeContract`, không gọi relayer.)

---

## 7. Vì sao `VERIFIED_DOCTOR` quan trọng cho ĐỌC record (FIX audit #3)

Đây là lý do nghiệp vụ của toàn bộ tính năng — chốt chặn nằm ở `ConsentLedger.canAccess`:

```solidity
// FIX (audit #3): unverified doctors never pass — check once here.
if (address(accessControl) != address(0)) {
    if (accessControl.isDoctor(grantee) && !accessControl.isVerifiedDoctor(grantee)) {
        return false;
    }
}
```
(`contracts/src/ConsentLedger.sol:698-703`).

Ý nghĩa: `canAccess(patient, grantee, cidHash)` là hàm **quyết định cuối cùng** ai được đọc payload mã hoá. Nếu `grantee` là một bác sĩ (`isDoctor`) **nhưng chưa** `isVerifiedDoctor` → **trả `false` ngay**, bất kể consent có được cấp hay không.

Hệ quả với bác sĩ **chưa** verified:
- Vẫn đăng ký, tạo record cho bệnh nhân (write path không bị gate bởi cờ này).
- **KHÔNG đọc được** record được chia sẻ tới mình cho tới khi được verify.

Vì `isVerifiedDoctor` yêu cầu **cả bit cờ lẫn `active=true`** (`AccessControl.sol:446-449`), nên khi `revokeDoctorVerification` gỡ cờ → bác sĩ đó **lập tức mất quyền đọc** các record share tới mình (vì lần `canAccess` kế tiếp sẽ trả `false`).

3 tầng phòng thủ của việc xác minh (defense-in-depth):
1. **UI mobile** cảnh báo bác sĩ phải verified (banner `CredentialSubmitScreen.tsx:315-320`: "phải được cơ sở xác minh chứng chỉ hành nghề trước khi **tạo, đọc và ký** hồ sơ y tế"). ⚠️ Lưu ý: banner này **nói quá** — on-chain chỉ gate **ĐỌC** (`canAccess` → false cho doctor chưa verified). Write path (`addRecordByDoctor`) **không** bị gate bởi cờ `VERIFIED_DOCTOR`, nên bác sĩ chưa verified **vẫn tạo được** record (xem hệ quả ở `:293` cùng mục này). Đừng để người đọc hiểu nhầm rằng tạo record bị chặn bởi verification.
2. **Backend** gate (`checkConsent` đọc `canAccess` trước khi trả `encryptedPayload` — ngoài phạm vi doc này nhưng có thật).
3. **On-chain `canAccess`** = thẩm quyền cuối cùng (`ConsentLedger.sol:698-703`).

---

## 8. Bảng tổng hợp hàm contract liên quan

| Hàm | Caller | Tác dụng chính | Nguồn |
|---|---|---|---|
| `createOrganization` | Ministry | Tạo org + cấp `ORGANIZATION\|VERIFIED_ORG` cho 2 admin | `AccessControl.sol:104-157` |
| `setOrgAdmins` | Ministry | Đổi/xoay admin (recovery) | `AccessControl.sol:163-217` |
| `setOrgActive` | Ministry | Bật/tắt org; tắt → gỡ cờ verified-org của 2 admin (KHÔNG cascade bác sĩ) | `AccessControl.sol:220-244` |
| `verifyDoctor` | Org admin (org active) | Set `VERIFIED_DOCTOR` + ghi credential | `AccessControl.sol:313-339` |
| `verifyDoctorByMinistry` | Ministry | Set `VERIFIED_DOCTOR` (orgId=0) | `AccessControl.sol:321-323` |
| `addOrgMember` | Org admin | Thêm quan hệ thành viên (KHÔNG set verified) | `AccessControl.sol:345-361` |
| `revokeDoctorVerification` | Verifier gốc hoặc Ministry | Gỡ cờ `VERIFIED_DOCTOR` | `AccessControl.sol:414-427` |
| `revokeOrgVerification` | Ministry | Gỡ cờ `VERIFIED_ORG` của 1 ví (không đổi org.active, không cascade) | `AccessControl.sol:429-434` |
| `isVerifiedDoctor` | view | `(cờ != 0) && verif.active` | `AccessControl.sol:446-449` |
| `canAccess` | view (ConsentLedger) | FIX audit #3: doctor chưa verified → false | `ConsentLedger.sol:698-703` |

---

## Nguồn đã đọc

- `contracts/src/AccessControl.sol` (toàn bộ)
- `contracts/src/ConsentLedger.sol` (canAccess `:679-718` + grep các tham chiếu audit #3)
- `contracts/src/interfaces/IAccessControl.sol` (events + structs, grep)
- `backend/src/routes/org.routes.js` (toàn bộ)
- `backend/src/routes/verification.routes.js` (toàn bộ)
- `backend/src/routes/admin.routes.js` (toàn bộ)
- `backend/src/utils/crypto.js` (`:1-60`, encryptAES)
- `mobile/src/screens-v2/ministry/MinistryCreateOrgScreen.tsx` (toàn bộ)
- `mobile/src/screens-v2/ministry/MinistryVerifyDoctorScreen.tsx` (toàn bộ)
- `mobile/src/screens-v2/org/OrgDashboardScreen.tsx` (toàn bộ)
- `mobile/src/screens-v2/org/OrgPendingVerificationsScreen.tsx` (toàn bộ)
- `mobile/src/screens-v2/doctor/CredentialSubmitScreen.tsx` (toàn bộ)
- `mobile/src/services/org.service.js` (toàn bộ)
- `mobile/src/abi/contractABI.js` (grep tên hàm/event để xác nhận tồn tại)
