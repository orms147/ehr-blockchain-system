# 01 — Smart contracts (5 contract + interfaces)

> Tài liệu onboarding cho lập trình viên smart-contract. Người đọc rành Solidity/EVM nên phần này
> mô tả **sơ bộ từng hàm** (không giải nghĩa từng dòng), tập trung vào vai trò, storage, quyền gọi,
> event và cách 5 contract wire với nhau. Mọi khẳng định đều dẫn nguồn `path:line`.

## Tóm tắt 30 giây

Hệ thống gồm **5 contract** Solidity `0.8.24`, biên dịch với `via_ir = true`, `optimizer_runs = 200`
([contracts/foundry.toml:9-12](../contracts/foundry.toml#L9-L12)):

- **AccessControl** — registry vai trò (bitwise role flags) + verification doctor/org + organization entity. Bộ Y tế (`MINISTRY_OF_HEALTH`) là `immutable`, đặt lúc constructor ([contracts/src/AccessControl.sol:33](../contracts/src/AccessControl.sol#L33),[59-72](../contracts/src/AccessControl.sol#L59-L72)).
- **RecordRegistry** — lưu `bytes32 cidHash` (KHÔNG bao giờ lưu CID plaintext) + chuỗi parent→child của các version record ([contracts/src/RecordRegistry.sol:9-14](../contracts/src/RecordRegistry.sol#L9-L14)).
- **ConsentLedger** — "trái tim" phân quyền: consent theo record-tree-root, delegation CHAIN topology, EIP-712 permits, Trusted Contact registry, và hàm `canAccess` mà backend gọi để gate truy cập ([contracts/src/ConsentLedger.sol:11-19](../contracts/src/ConsentLedger.sol#L11-L19)).
- **DoctorUpdate** — facade cho bác sĩ tạo record + tự cấp quyền tạm thời cho chính mình ([contracts/src/DoctorUpdate.sol:80-123](../contracts/src/DoctorUpdate.sol#L80-L123)).
- **EHRSystemSecure** — state machine "yêu cầu truy cập 2 bên duyệt" + EIP-712 confirm/reject ([contracts/src/EHRSystemSecure.sol:77-365](../contracts/src/EHRSystemSecure.sol#L77-L365)).

**Nguyên tắc privacy xuyên suốt**: tất cả contract chỉ nhận `bytes32 cidHash = keccak256(bytes(cid))`
tính off-chain — CID plaintext không bao giờ vào calldata blockchain ([contracts/src/RecordRegistry.sol:9-15](../contracts/src/RecordRegistry.sol#L9-L15), [contracts/src/ConsentLedger.sol:11-18](../contracts/src/ConsentLedger.sol#L11-L18)).

---

## Sơ đồ tổng quan: 5 contract phụ thuộc nhau thế nào

```
                          ┌──────────────────────┐
                          │     AccessControl     │  immutable MINISTRY_OF_HEALTH
                          │  (roles, verify, org) │  KHÔNG phụ thuộc contract khác
                          └──────────┬────────────┘
              isPatient/isDoctor/    │ isVerifiedDoctor   (đọc role)
              isVerifiedDoctor       │
        ┌────────────────┬──────────┴───────────┬──────────────────┐
        │                │                       │                  │
        ▼                ▼                       ▼                  ▼
┌───────────────┐ ┌──────────────┐      ┌────────────────┐  (canAccess gọi
│ RecordRegistry│ │ DoctorUpdate │      │ EHRSystemSecure│   ngược lên
│  (cidHash +   │ │  (facade)    │      │ (request 2-bên)│   AccessControl)
│  parent/child)│ └──────┬───────┘      └───────┬────────┘
└──────┬────────┘        │ addRecordByDoctor    │ grantInternal /
       │ parentOf        │ + grantInternal      │ grantDelegationInternal
       │ (walk to root)  │                      │
       │                 ▼                      ▼
       │          ┌──────────────────────────────────────┐
       └─────────►│            ConsentLedger              │
   setRecordRegistry  (consent, delegation CHAIN,        │
                  │   Trusted Contact, canAccess)         │
                  │  setAccessControl ──► AccessControl    │
                  │  setRecordRegistry ─► RecordRegistry   │
                  └──────────────────────────────────────┘
```

- `RecordRegistry`, `DoctorUpdate`, `EHRSystemSecure` đều nhận `IAccessControl` để check role.
- `DoctorUpdate` + `EHRSystemSecure` gọi `ConsentLedger.grantInternal` / `grantDelegationInternal` (cần được authorize).
- `ConsentLedger.canAccess` gọi ngược lên `AccessControl` (chặn unverified doctor) và `RecordRegistry` (walk cidHash → root). Hai tham chiếu này wire sau deploy để tránh circular dependency ở constructor ([contracts/src/ConsentLedger.sol:80-82](../contracts/src/ConsentLedger.sol#L80-L82),[108-113](../contracts/src/ConsentLedger.sol#L108-L113)).

---

## 1. AccessControl

**Vai trò**: nguồn chân lý về *ai là ai* (patient/doctor/org/ministry), trạng thái verification, và
registry organization. Không phụ thuộc contract nào khác — chỉ có `MINISTRY_OF_HEALTH` immutable.

### Bitwise role flags

Role lưu trong `mapping(address => uint8) private _roles` ([contracts/src/AccessControl.sol:36](../contracts/src/AccessControl.sol#L36)).
Mỗi role là 1 bit, cộng dồn bằng OR (1 user có thể vừa là patient vừa là doctor):

| Hằng số | Giá trị | Bit | Ý nghĩa |
|---|---|---|---|
| `PATIENT` | `1 << 0` = 1 | `0000 0001` | Bệnh nhân |
| `DOCTOR` | `1 << 1` = 2 | `0000 0010` | Bác sĩ (chưa verify) |
| `ORGANIZATION` | `1 << 2` = 4 | `0000 0100` | Tổ chức (bệnh viện) |
| `MINISTRY` | `1 << 3` = 8 | `0000 1000` | Bộ Y tế |
| `VERIFIED_DOCTOR` | `1 << 4` = 16 | `0001 0000` | FLAG verify bác sĩ |
| `VERIFIED_ORG` | `1 << 5` = 32 | `0010 0000` | FLAG verify tổ chức |

Nguồn: [contracts/src/AccessControl.sol:23-30](../contracts/src/AccessControl.sol#L23-L30). `VERIFIED_*` là **flag bổ
sung** chứ không phải role riêng — `isVerifiedDoctor` yêu cầu cả bit `VERIFIED_DOCTOR` **và**
`doctorVerifications[user].active == true` ([contracts/src/AccessControl.sol:446-449](../contracts/src/AccessControl.sol#L446-L449)).

### Storage chính

| Biến | Kiểu | Mục đích |
|---|---|---|
| `MINISTRY_OF_HEALTH` | `address immutable` | Bộ Y tế, set 1 lần ở constructor ([:33](../contracts/src/AccessControl.sol#L33),[:62](../contracts/src/AccessControl.sol#L62)) |
| `_roles` | `mapping(address=>uint8)` | Bitfield role mỗi user ([:36](../contracts/src/AccessControl.sol#L36)) |
| `doctorVerifications` / `orgVerifications` | `mapping(address=>Verification)` | Bằng cấp + verifier + active ([:39-40](../contracts/src/AccessControl.sol#L39-L40)) |
| `orgCount`, `organizations` | `uint256`, `mapping(uint256=>Organization)` | Registry tổ chức theo orgId ([:54-55](../contracts/src/AccessControl.sol#L54-L55)) |
| `adminToOrgId` | `mapping(address=>uint256)` | Wallet admin → orgId (0 = không phải admin) ([:56](../contracts/src/AccessControl.sol#L56)) |
| `orgMembersByOrgId`, `isMemberOfOrgById` | maps theo orgId | Danh sách bác sĩ thuộc tổ chức ([:43-44](../contracts/src/AccessControl.sol#L43-L44)) |
| `authorizedRelayers` | `mapping(address=>bool)` | EOA được phép gọi `registerPatientFor`/`registerDoctorFor` (gas sponsorship) ([:51](../contracts/src/AccessControl.sol#L51)) |

`struct Verification { address verifier; string credential; uint40 verifiedAt; bool active; }` và
`struct Organization { uint256 id; string name; address primaryAdmin; address backupAdmin; uint40 createdAt; bool active; }`
([contracts/src/interfaces/IAccessControl.sol:7-21](../contracts/src/interfaces/IAccessControl.sol#L7-L21)).

> **Mô hình quản lý ngành y VN**: Bộ Y tế tạo Organization (bệnh viện) → admin của Organization verify
> bác sĩ. Ministry constructor **chỉ** có role `MINISTRY`, KHÔNG có `ORGANIZATION` (regulator, không phải
> bệnh viện) ([contracts/src/AccessControl.sol:64-66](../contracts/src/AccessControl.sol#L64-L66)).

### Modifier

| Modifier | Điều kiện | Nguồn |
|---|---|---|
| `onlyMinistry` | `_roles[msg.sender] & MINISTRY != 0` | [:75-78](../contracts/src/AccessControl.sol#L75-L78) |
| `onlyVerifiedOrg` | `_roles[msg.sender] & VERIFIED_ORG != 0` | [:80-83](../contracts/src/AccessControl.sol#L80-L83) |
| `onlyRelayer` | `authorizedRelayers[msg.sender]` | [:85-88](../contracts/src/AccessControl.sol#L85-L88) |

### Hàm public/external (sơ bộ)

**Relayer & registration:**
- `setRelayer(relayer, authorized)` — `onlyMinistry`, bật/tắt relayer ([:92-96](../contracts/src/AccessControl.sol#L92-L96)).
- `registerAsPatient()` / `registerAsDoctor()` — self-register, OR thêm bit role ([:258-268](../contracts/src/AccessControl.sol#L258-L268)).
- `registerAsOrganization()` — **DEPRECATED**, luôn `revert NotAuthorized` ([:271-274](../contracts/src/AccessControl.sol#L271-L274)).
- `registerPatientFor(user)` / `registerDoctorFor(user)` — `onlyRelayer`, đăng ký hộ (backend sponsor gas) ([:280-292](../contracts/src/AccessControl.sol#L280-L292)).

**Organization management (Ministry):**
- `createOrganization(name, primaryAdmin, backupAdmin)` — `onlyMinistry`, tạo orgId mới (`++orgCount`), gán cả 2 admin role `ORGANIZATION | VERIFIED_ORG` + set `orgVerifications`, emit `OrganizationCreated` ([:104-157](../contracts/src/AccessControl.sol#L104-L157)).
- `setOrgAdmins(orgId, newPrimary, newBackup)` — `onlyMinistry`, xoay admin (recovery/rotation), clear admin cũ qua `_clearAdmin`, emit `OrganizationAdminChanged` ([:163-217](../contracts/src/AccessControl.sol#L163-L217)).
- `setOrgActive(orgId, active)` — `onlyMinistry`, bật/tắt tổ chức; đồng bộ flag `VERIFIED_ORG` + `orgVerifications.active` cho cả 2 admin, emit `OrganizationStatusChanged` ([:220-244](../contracts/src/AccessControl.sol#L220-L244)).

**Verification:**
- `verifyOrganization(org, orgName)` — **DEPRECATED** nhưng vẫn chạy cho legacy wallet, `onlyMinistry` ([:298-311](../contracts/src/AccessControl.sol#L298-L311)).
- `verifyDoctor(doctor, credential)` — admin tổ chức (active) verify bác sĩ; orgId lấy từ `adminToOrgId[msg.sender]` để vào audit trail ([:314-318](../contracts/src/AccessControl.sol#L314-L318)).
- `verifyDoctorByMinistry(doctor, credential)` — `onlyMinistry`, verify trực tiếp (orgId=0) ([:321-323](../contracts/src/AccessControl.sol#L321-L323)).
- `revokeDoctorVerification(doctor)` — chỉ verifier gốc HOẶC Ministry; tắt flag `VERIFIED_DOCTOR` ([:414-427](../contracts/src/AccessControl.sol#L414-L427)).
- `revokeOrgVerification(org)` — `onlyMinistry` ([:429-434](../contracts/src/AccessControl.sol#L429-L434)).

**Org members (orgId-based):**
- `addOrgMember(orgId, doctor)` / `removeOrgMember(orgId, doctor)` — caller phải là active admin của đúng orgId; quản lý danh sách bác sĩ ([:345-386](../contracts/src/AccessControl.sol#L345-L386)).
- `addMember` / `removeMember` (legacy theo address) — **DEPRECATED**, luôn revert ([:401-410](../contracts/src/AccessControl.sol#L401-L410)).

**View:** `isPatient`, `isDoctor`, `isVerifiedDoctor`, `isOrganization`, `isVerifiedOrganization`,
`isMinistry`, `isActiveOrgAdmin`, `getOrganization`, `getAdminOrgId`, `getDoctorVerification`,
`getOrgVerification`, `getOrgMembersByOrgId`, `isDoctorMemberOfOrg`, `getUserStatus`
([:438-529](../contracts/src/AccessControl.sol#L438-L529)).

### Event chính
`UserRegistered`, `DoctorVerified` (kèm `orgId`), `OrganizationCreated`, `OrganizationAdminChanged`,
`OrganizationStatusChanged`, `VerificationRevoked`, `RelayerUpdated`, `OrgAdminCleared`,
`MemberAdded/Removed`, `DeprecatedFunctionCalled` ([contracts/src/interfaces/IAccessControl.sol:23-46](../contracts/src/interfaces/IAccessControl.sol#L23-L46)).
`OrganizationVerified` ([IAccessControl.sol:37](../contracts/src/interfaces/IAccessControl.sol#L37)) là event legacy, chỉ emit bởi hàm deprecated `verifyOrganization` ([AccessControl.sol:298-310](../contracts/src/AccessControl.sol#L298-L310)).

---

## 2. RecordRegistry

**Vai trò**: sổ cái các bản ghi y tế dưới dạng `bytes32 cidHash` + cây version (parent→children). Mỗi
record có 1 owner (patient) và 1 creator (patient hoặc doctor).

### Storage chính

| Biến | Kiểu | Mục đích |
|---|---|---|
| `accessControl` | `IAccessControl immutable` | Check role, set ở constructor ([:17](../contracts/src/RecordRegistry.sol#L17),[:44-47](../contracts/src/RecordRegistry.sol#L44-L47)) |
| `consentLedger` | `IConsentLedger` | Wire 1 lần qua `setConsentLedger` ([:18](../contracts/src/RecordRegistry.sol#L18)) |
| `deployer` | `address immutable` | Người deploy = admin các hàm setup ([:20](../contracts/src/RecordRegistry.sol#L20)) |
| `_records` | `mapping(bytes32=>Record)` | cidHash → Record ([:23](../contracts/src/RecordRegistry.sol#L23)) |
| `_ownerRecords` | `mapping(address=>bytes32[])` | Danh sách record của 1 owner ([:26](../contracts/src/RecordRegistry.sol#L26)) |
| `_parentChildren` | `mapping(bytes32=>bytes32[])` | Cây version: parent → các con ([:27](../contracts/src/RecordRegistry.sol#L27)) |
| `_ownerRecordIndex` | nested map | index+1 để xoá O(1) ([:30](../contracts/src/RecordRegistry.sol#L30)) |
| `authorizedContracts` | `mapping(address=>bool)` | Contract được phép `addRecordByDoctor` (vd DoctorUpdate) ([:33](../contracts/src/RecordRegistry.sol#L33)) |
| `authorizedSponsors` | `mapping(address=>bool)` | EOA được phép `addRecordFor` ([:36](../contracts/src/RecordRegistry.sol#L36)) |

`struct Record { bytes32 cidHash; bytes32 parentCidHash; address createdBy; address owner; bytes32 recordTypeHash; uint40 createdAt; uint8 version; bool exists; }`
([contracts/src/interfaces/IRecordRegistry.sol:10-19](../contracts/src/interfaces/IRecordRegistry.sol#L10-L19)).

Hằng số: `MAX_CHILDREN = 100` (chống đẻ con vô hạn), `DOCTOR_UPDATE_WINDOW = 1 days` (cửa sổ doctor sửa
in-place) ([contracts/src/RecordRegistry.sol:39-41](../contracts/src/RecordRegistry.sol#L39-L41)).

### Hàm public/external (sơ bộ)

**Admin (chỉ `deployer`):**
- `setConsentLedger(addr)` — set 1 lần, không cho ghi đè ([:57-62](../contracts/src/RecordRegistry.sol#L57-L62)).
- `authorizeContract(addr, bool)` — cho phép contract gọi `addRecordByDoctor` ([:64-67](../contracts/src/RecordRegistry.sol#L64-L67)).
- `authorizeSponsor(addr, bool)` — emit `SponsorAuthorized` ([:72-76](../contracts/src/RecordRegistry.sol#L72-L76)).

**Write:**
- `addRecord(cidHash, parentCidHash, recordTypeHash)` — patient tự thêm record của mình (`isPatient(msg.sender)`); creator=owner=msg.sender ([:87-96](../contracts/src/RecordRegistry.sol#L87-L96)).
- `addRecordFor(..., patient)` — `authorizedSponsors` thêm hộ patient (gas sponsorship); creator=owner=patient ([:106-119](../contracts/src/RecordRegistry.sol#L106-L119)).
- `addRecordByDoctor(..., patient)` — Doctor HOẶC `authorizedContracts` thêm cho patient; creator=msg.sender, owner=patient. Lưu ý F3 fix: patient **phải** đã đăng ký ([:128-144](../contracts/src/RecordRegistry.sol#L128-L144)).
- `updateRecordCID(oldCidHash, newCidHash)` — sửa CID in-place (chỉnh sai sót). Không cho nếu record đã có con; owner sửa bất kỳ lúc nào, creator (doctor) chỉ trong `DOCTOR_UPDATE_WINDOW` ([:198-266](../contracts/src/RecordRegistry.sol#L198-L266)).
- `transferOwnership(cidHash, newOwner)` — `onlyRecordOwner`, chuyển owner ([:273-301](../contracts/src/RecordRegistry.sol#L273-L301)).

**View:** `getRecord`, `parentOf` (dùng bởi ConsentLedger để walk tới root), `getOwnerRecords`,
`getOwnerRecordCount`, `getChildRecords`, `getChildCount`, `recordExists`, `getMaxChildrenLimit`
([:305-338](../contracts/src/RecordRegistry.sol#L305-L338)).

> **Lưu ý version chain**: khi `parentCidHash != 0`, record con có `version = parent.version + 1` và được
> push vào `_parentChildren[parent]` ([contracts/src/RecordRegistry.sol:161-170](../contracts/src/RecordRegistry.sol#L161-L170)). Đây
> là cấu trúc mà ConsentLedger dựa vào để "consent ở root phủ toàn bộ chuỗi version".

### Event chính
`RecordAdded`, `RecordUpdated`, `OwnershipTransferred`, `SponsorAuthorized`
([contracts/src/interfaces/IRecordRegistry.sol:21-42](../contracts/src/interfaces/IRecordRegistry.sol#L21-L42)).

---

## 3. ConsentLedger (trái tim phân quyền)

**Vai trò**: quản lý *ai được đọc record nào*. Lưu consent theo **canonical root** của cây version
(một consent phủ cả chuỗi), hỗ trợ delegation đa cấp (CHAIN topology), EIP-712 permits, và Trusted
Contact. Hàm `canAccess` là final authority mà backend gọi trước khi trả `encryptedPayload`.

> **Khái niệm cho người chưa rõ off-chain**: on-chain chỉ lưu **hash của khoá** (`encKeyHash`) — KHÔNG
> phải khoá thật. Khoá AES thật nằm trong payload mã hoá off-chain (Postgres), chỉ recipient giải được.
> ConsentLedger chỉ trả lời câu hỏi "X có quyền đọc record của Y không?" chứ không giữ bí mật gì giải mã được.

### Khái niệm "medical episode model" (đã bỏ includeUpdates từ 2026-04-19)

`struct Consent` KHÔNG còn field `includeUpdates`/`anchorCidHash`. Consent giờ luôn phủ **cả cây version**
(root + mọi con). Khi grant, contract walk cidHash đầu vào về root rồi lưu consent tại root; khi check,
walk query cidHash về cùng root ([contracts/src/interfaces/IConsentLedger.sol:10-24](../contracts/src/interfaces/IConsentLedger.sol#L10-L24),
[contracts/src/ConsentLedger.sol:294-299](../contracts/src/ConsentLedger.sol#L294-L299)).

> ⚠️ **Drift so với CLAUDE.md**: CLAUDE.md (section 5) còn nhắc `includeUpdates` và thứ tự enum
> `RequestType` cũ — đó là STALE. Code thật: `Consent` không có `includeUpdates`
> ([IConsentLedger.sol:15-24](../contracts/src/interfaces/IConsentLedger.sol#L15-L24)); và `CONSENT_PERMIT_TYPEHASH`
> đã bỏ `bool includeUpdates` từ 2026-04-19 ([ConsentLedger.sol:22-27](../contracts/src/ConsentLedger.sol#L22-L27)).

`struct Consent { address patient; address grantee; bytes32 rootCidHash; bytes32 encKeyHash; uint40 issuedAt; uint40 expireAt; bool active; bool allowDelegate; }`
([contracts/src/interfaces/IConsentLedger.sol:15-24](../contracts/src/interfaces/IConsentLedger.sol#L15-L24)).

### Storage chính

| Biến | Mục đích | Nguồn |
|---|---|---|
| `_consents` | `key = keccak256(patient, grantee, root)` → Consent | [:43](../contracts/src/ConsentLedger.sol#L43),[:299](../contracts/src/ConsentLedger.sol#L299) |
| `_delegations` | `patient => delegatee => packed uint256` | [:46](../contracts/src/ConsentLedger.sol#L46) |
| `nonces` | replay protection, **dùng chung** cho Consent/Delegation/TrustedContact permit | [:49](../contracts/src/ConsentLedger.sol#L49) |
| `authorizedContracts` | contract được gọi `grantInternal`/`grantDelegationInternal` | [:52](../contracts/src/ConsentLedger.sol#L52) |
| `authorizedSponsors` | EOA được `revokeFor` | [:55](../contracts/src/ConsentLedger.sol#L55) |
| `consentDelegationSource` + `consentDelegatorEpochAtGrant` | nguồn của BULK delegation grant + epoch snapshot (audit #4) | [:57-59](../contracts/src/ConsentLedger.sol#L57-L59),[:78](../contracts/src/ConsentLedger.sol#L78) |
| `recordDelegationSource` | nguồn của PER-RECORD delegation grant (BUG-C cascade) | [:100-106](../contracts/src/ConsentLedger.sol#L100-L106) |
| `delegationParent` | con trỏ cha trong chain (address(0)=nhánh trực tiếp từ patient) | [:61-64](../contracts/src/ConsentLedger.sol#L61-L64) |
| `delegationEpoch` + `delegationParentEpochAtCreate` | epoch bump khi revoke → invalidate cascade | [:66-74](../contracts/src/ConsentLedger.sol#L66-L74) |
| `accessControl` | wire qua `setAccessControl`, chặn unverified doctor trong canAccess | [:80-82](../contracts/src/ConsentLedger.sol#L80-L82) |
| `recordRegistry` | wire qua `setRecordRegistry`, walk cidHash → root | [:108-113](../contracts/src/ConsentLedger.sol#L108-L113) |
| `isTrustedContact` / `trustedContactLabel` / `_trustedContactList` | Trusted Contact registry | [:96-98](../contracts/src/ConsentLedger.sol#L96-L98) |
| `admin` | `immutable`, authorize/setup | [:115](../contracts/src/ConsentLedger.sol#L115) |

**Delegation packing** (1 slot `uint256`): bit 0-39 = `expiresAt` (uint40), bit 40 =
`allowSubDelegate`, bit 41 = `active` ([contracts/src/ConsentLedger.sol:122-125](../contracts/src/ConsentLedger.sol#L122-L125),[449-453](../contracts/src/ConsentLedger.sol#L449-L453)).

**Hằng số**: `FOREVER = type(uint40).max`, `MAX_DURATION = 5*365 days`, `MIN_DURATION = 1 days`,
`MAX_DELEGATION_WALK = 8` (số hop walk trong canAccess), `MAX_RECORD_DEPTH = 20` (walk cidHash→root)
([contracts/src/ConsentLedger.sol:118-135](../contracts/src/ConsentLedger.sol#L118-L135)).

### EIP-712 typehash

| Typehash | Nội dung | Nguồn |
|---|---|---|
| `CONSENT_PERMIT_TYPEHASH` | `ConsentPermit(patient,grantee,rootCidHash,encKeyHash,expireAt,allowDelegate,deadline,nonce)` — đã bỏ `includeUpdates` | [:25-27](../contracts/src/ConsentLedger.sol#L25-L27) |
| `DELEGATION_PERMIT_TYPEHASH` | `DelegationPermit(patient,delegatee,duration,allowSubDelegate,deadline,nonce)` | [:29-31](../contracts/src/ConsentLedger.sol#L29-L31) |
| `TRUSTED_CONTACT_PERMIT_TYPEHASH` | `TrustedContactPermit(patient,contact,label,active,deadline,nonce)` | [:37-39](../contracts/src/ConsentLedger.sol#L37-L39) |

Domain: `EIP712("EHR Consent Ledger", "2")` ([contracts/src/ConsentLedger.sol:138](../contracts/src/ConsentLedger.sol#L138)).

### Modifier
`onlyAuthorized` (`authorizedContracts[msg.sender] || msg.sender==admin`), `onlyAdmin`
([contracts/src/ConsentLedger.sol:146-154](../contracts/src/ConsentLedger.sol#L146-L154)).

### Hàm public/external (sơ bộ)

**Admin/setup:**
- `authorizeContract`, `authorizeSponsor`, `setAccessControl`, `setRecordRegistry`, `DOMAIN_SEPARATOR` ([:158-206](../contracts/src/ConsentLedger.sol#L158-L206)).

**Grant consent:**
- `grantInternal(patient, grantee, rootCidHash, encKeyHash, expireAt, allowDelegate)` — `onlyAuthorized`, dùng bởi EHRSystemSecure & DoctorUpdate ([:214-232](../contracts/src/ConsentLedger.sol#L214-L232)).
- `grantBySig(..., deadline, signature)` — patient ký EIP-712, relayer broadcast; verify chữ ký, bump nonce ([:239-281](../contracts/src/ConsentLedger.sol#L239-L281)).
- (internal) `_grantConsent` — walk to root, lưu consent, **clear** stale `recordDelegationSource` + `consentDelegationSource` để tránh cascade-kill sai (FOOTGUN FIX #1 + F1), emit `ConsentGranted` ([:283-335](../contracts/src/ConsentLedger.sol#L283-L335)).

**Revoke consent:**
- `revoke(grantee, inputCidHash)` — patient (`msg.sender`) tự revoke; walk to root ([:345-356](../contracts/src/ConsentLedger.sol#L345-L356)).
- `revokeFor(patient, grantee, inputCidHash)` — chỉ `authorizedSponsors`, revoke hộ ([:362-375](../contracts/src/ConsentLedger.sol#L362-L375)).

**Delegation:**
- `grantDelegation(delegatee, duration, allowSubDelegate)` — patient tự trả gas ([:380-386](../contracts/src/ConsentLedger.sol#L380-L386)).
- `grantDelegationInternal(...)` — `onlyAuthorized`, dùng bởi EHRSystemSecure (FullDelegation) ([:388-395](../contracts/src/ConsentLedger.sol#L388-L395)).
- `delegateAuthorityBySig(...)` — patient ký EIP-712, relayer broadcast (sponsored) ([:397-431](../contracts/src/ConsentLedger.sol#L397-L431)).
- `revokeDelegation(delegatee)` — patient revoke; **bump epoch** → cascade invalidate downstream consents + sub-delegations ([:468-484](../contracts/src/ConsentLedger.sol#L468-L484)).
- `subDelegate(patient, newDelegatee, duration, allowSubDelegate)` — delegatee có `allowSubDelegate` tạo nhánh con; expiry cap theo cha; set `delegationParent` + epoch snapshot ([:493-525](../contracts/src/ConsentLedger.sol#L493-L525)).
- `revokeSubDelegation(patient, subDelegatee)` — chỉ cha trực tiếp; bump epoch ([:534-548](../contracts/src/ConsentLedger.sol#L534-L548)).

**Using delegation (tạo consent cho người thứ 3):**
- `grantUsingDelegation(patient, newGrantee, inputCidHash, encKeyHash, expireAt, allowDelegate)` — caller phải có delegation active; consent expiry cap theo delegation; lưu `consentDelegationSource` + epoch ([:563-606](../contracts/src/ConsentLedger.sol#L563-L606)).
- `grantUsingRecordDelegation(patient, newGrantee, inputCidHash, encKeyHash, expireAt)` — caller phải có consent `allowDelegate=true`; consent mới hardcode `allowDelegate=false` (one-hop); lưu `recordDelegationSource` ([:614-662](../contracts/src/ConsentLedger.sol#L614-L662)).

**canAccess (final authority):**
- `canAccess(patient, grantee, queryCidHash)` — trả `true` nếu: (a) patient==grantee, hoặc (b) `isTrustedContact`, hoặc (c) có consent hợp lệ. Trước (c): nếu grantee là doctor chưa verified (qua AccessControl) → `false` (audit #3) ([:679-706](../contracts/src/ConsentLedger.sol#L679-L706)).
- (internal) `_hasValidNormalConsent` — kiểm tra consent active + chưa hết hạn + (per-record source còn allowDelegate) + (bulk-delegation chain còn nguyên qua epoch walk ≤ `MAX_DELEGATION_WALK`) ([:711-766](../contracts/src/ConsentLedger.sol#L711-L766)).

**Trusted Contact:**
- `setTrustedContactBySig(...)` / `setTrustedContact(contact, label, active)` — patient designate/revoke; lưu on-chain để backend không thể inject contact giả ([:818-892](../contracts/src/ConsentLedger.sol#L818-L892)).
- `getTrustedContacts(patient)` — lọc bỏ entry đã revoke ([:899-921](../contracts/src/ConsentLedger.sol#L899-L921)).

**View khác:** `getConsent`, `getDelegation`, `getNonce`, `parentOf`-driven `_walkToRoot` ([:768-798](../contracts/src/ConsentLedger.sol#L768-L798),[:191-200](../contracts/src/ConsentLedger.sol#L191-L200)).

### Sơ đồ canAccess (đọc theo thứ tự)

```
canAccess(patient, grantee, queryCidHash)
   │
   ├─ patient == grantee ? ───────────────────► return true   (chủ sở hữu)
   │
   ├─ isTrustedContact[patient][grantee] ? ────► return true   (gia đình khẩn cấp)
   │
   ├─ root = _walkToRoot(queryCidHash)          (RecordRegistry.parentOf, ≤20 hop)
   ├─ grantee là doctor & !verified ? ─────────► return false  (audit #3)
   │
   └─ _hasValidNormalConsent(key, ..., root):
        consent active? & chưa hết hạn? ────────► nếu sai: false
        per-record source còn allowDelegate? ───► BUG-C cascade
        bulk-delegation chain còn nguyên?  ─────► walk epoch ≤ 8 hop (audit #4)
        └─► true
```
Nguồn: [contracts/src/ConsentLedger.sol:679-766](../contracts/src/ConsentLedger.sol#L679-L766).

### Event chính
`ConsentGranted`, `ConsentRevoked`, `DelegationGranted`, `DelegationRevoked`,
`AccessGrantedViaDelegation`, `TrustedContactSet`, `TrustedContactRevoked`, `AuthorizedContract`,
`SponsorAuthorized` ([contracts/src/interfaces/IConsentLedger.sol:33-87](../contracts/src/interfaces/IConsentLedger.sol#L33-L87)).

---

## 4. DoctorUpdate

**Vai trò**: facade gọn cho bác sĩ — trong 1 giao dịch vừa tạo record cho patient (qua RecordRegistry)
vừa tự cấp cho mình consent tạm thời (qua ConsentLedger). 3 tham chiếu đều `immutable`, set ở constructor
([contracts/src/DoctorUpdate.sol:18-61](../contracts/src/DoctorUpdate.sol#L18-L61)).

**Hằng số**: `MIN_DOCTOR_ACCESS = 1 hours`, `MAX_DOCTOR_ACCESS = 90 days`, `DEFAULT_DOCTOR_ACCESS = 7 days`
([contracts/src/DoctorUpdate.sol:24-26](../contracts/src/DoctorUpdate.sol#L24-L26)).

### Hàm

- `addRecordByDoctor(cidHash, parentCidHash, recordTypeHash, patient, doctorEncKeyHash, doctorAccessHours)` — `onlyDoctor nonReentrant`. Gọi `recordRegistry.addRecordByDoctor` (owner=patient), rồi **chỉ nếu là ROOT** (`parentCidHash == 0`) và có `doctorEncKeyHash` mới tự cấp consent qua `_grantDoctorAccess`. Update (child) dựa vào quyền của root ([contracts/src/DoctorUpdate.sol:80-123](../contracts/src/DoctorUpdate.sol#L80-L123)).
- (internal) `_grantDoctorAccess` — tính duration (default 7 ngày, hoặc `accessHours*1h` trong [1h, 90 ngày]), gọi `consentLedger.grantInternal(..., allowDelegate=false)` ([:127-161](../contracts/src/DoctorUpdate.sol#L127-L161)).
- `getAccessLimits()` — trả min/max/default theo giờ ([:165-175](../contracts/src/DoctorUpdate.sol#L165-L175)).

> Patient KHÔNG cần consent entry để đọc record của mình — `canAccess(patient, patient, ...)` luôn true
> ([contracts/src/DoctorUpdate.sol:96-97](../contracts/src/DoctorUpdate.sol#L96-L97), khớp [ConsentLedger.sol:684](../contracts/src/ConsentLedger.sol#L684)).

### Event
`RecordAddedByDoctor`, `TemporaryAccessGranted` ([contracts/src/DoctorUpdate.sol:29-44](../contracts/src/DoctorUpdate.sol#L29-L44)).

---

## 5. EHRSystemSecure

**Vai trò**: state machine "yêu cầu truy cập 2 bên duyệt". Bác sĩ/Org gửi request → cả requester và
patient phải approve (có delay tối thiểu) → hoàn tất bằng cách cấp consent/delegation tương ứng. Kế thừa
`Ownable, Pausable, ReentrancyGuard, EIP712` ([contracts/src/EHRSystemSecure.sol:22](../contracts/src/EHRSystemSecure.sol#L22)).

3 tham chiếu `immutable` (AccessControl, RecordRegistry, ConsentLedger) set ở constructor; domain
`EIP712("EHR System Secure", "2")` ([:37-62](../contracts/src/EHRSystemSecure.sol#L37-L62)).

### Enum & struct

- `enum RequestType { DirectAccess, FullDelegation, RecordDelegation }` → **0=DirectAccess, 1=FullDelegation, 2=RecordDelegation** ([contracts/src/interfaces/IEHRSystemSecure.sol:9](../contracts/src/interfaces/IEHRSystemSecure.sol#L9)).
- `enum RequestStatus { Pending, RequesterApproved, PatientApproved, Completed, Rejected }` ([:10](../contracts/src/interfaces/IEHRSystemSecure.sol#L10)).
- `struct AccessRequest { requester; patient; rootCidHash; encKeyHash; reqType; expiry; consentDuration; firstApprovalTime; status; }` ([:12-22](../contracts/src/interfaces/IEHRSystemSecure.sol#L12-L22)).

### Mapping 3 RequestType → hành động khi `_completeRequest`

| RequestType (giá trị) | rootCidHash | Hàm ConsentLedger gọi | allowDelegate / scope |
|---|---|---|---|
| `DirectAccess` (0) | bắt buộc ≠0 | `grantInternal` | `false` — đọc 1 chuỗi record, không re-share ([:327-339](../contracts/src/EHRSystemSecure.sol#L327-L339)) |
| `RecordDelegation` (2) | bắt buộc ≠0 | `grantInternal` | `true` — có thể `grantUsingRecordDelegation` ([:340-348](../contracts/src/EHRSystemSecure.sol#L340-L348)) |
| `FullDelegation` (1) | **phải =0** | `grantDelegationInternal` | bulk delegate toàn bộ record, `allowSubDelegate=true` hardcode ([:349-357](../contracts/src/EHRSystemSecure.sol#L349-L357)) |

Validate rootCidHash theo loại ở [:113-117](../contracts/src/EHRSystemSecure.sol#L113-L117).

### Hằng số
`MIN_APPROVAL_DELAY = 15 seconds`, `MAX_REQUEST_VALIDITY = 30 days`, `DEFAULT_CONSENT_DURATION = 30 days`,
`MAX_DELEGATION_DURATION = 365 days` ([contracts/src/EHRSystemSecure.sol:46-49](../contracts/src/EHRSystemSecure.sol#L46-L49)).

### EIP-712 typehash
- `CONFIRM_TYPEHASH = ConfirmRequest(reqId, requester, patient, rootCidHash, reqType, deadline)` ([:26-28](../contracts/src/EHRSystemSecure.sol#L26-L28)).
- `REJECT_TYPEHASH = RejectRequest(reqId, deadline)` ([:32-34](../contracts/src/EHRSystemSecure.sol#L32-L34)).

### Hàm public/external (sơ bộ)

- `requestAccess(patient, rootCidHash, reqType, encKeyHash, consentDurationHours, validForHours)` — `whenNotPaused nonReentrant`. Requester **phải là Doctor hoặc Organization** (KHÔNG patient — audit P1, chặn phishing); tính `reqId = keccak256(requester, patient, rootCidHash, reqType, nonce++)`; lưu `Pending` ([:77-174](../contracts/src/EHRSystemSecure.sol#L77-L174)).
- `confirmAccessRequest(reqId)` — approve trực tiếp (msg.sender là requester hoặc patient) ([:178-180](../contracts/src/EHRSystemSecure.sol#L178-L180)).
- `confirmAccessRequestWithSignature(reqId, deadline, signature)` — patient ký EIP-712, relayer broadcast (sponsored); signer phải == patient ([:233-264](../contracts/src/EHRSystemSecure.sol#L233-L264)).
- `rejectRequest(reqId)` — requester hoặc patient từ chối ([:266-277](../contracts/src/EHRSystemSecure.sol#L266-L277)).
- `rejectRequestBySig(reqId, deadline, signature)` — sponsored reject; signer phải là patient HOẶC requester; event ghi signer (không phải relayer) ([:292-320](../contracts/src/EHRSystemSecure.sol#L292-L320)).
- (internal) `_processConfirmation` — state machine: approval 1 → `RequesterApproved`/`PatientApproved`; approval 2 (bên còn lại, sau `MIN_APPROVAL_DELAY`) → `_completeRequest` ([:182-225](../contracts/src/EHRSystemSecure.sol#L182-L225)).
- `pause()` / `unpause()` — `onlyOwner` ([:406-411](../contracts/src/EHRSystemSecure.sol#L406-L411)).
- **View:** `getAccessRequest`, `getCurrentNonce`, `getSystemConstants` ([:382-402](../contracts/src/EHRSystemSecure.sol#L382-L402)).

### Sơ đồ state machine

```
            requestAccess (Doctor/Org only)
                    │
                    ▼
                 Pending
        ┌───────────┴────────────┐
   requester confirm        patient confirm
        ▼                        ▼
  RequesterApproved        PatientApproved
        │  (chờ ≥ MIN_APPROVAL_DELAY = 15s)  │
   patient confirm        requester confirm
        └───────────┬────────────┘
                    ▼
              _completeRequest ──► ConsentLedger.grantInternal /
                    │              grantDelegationInternal
                Completed
   (bất kỳ lúc nào): rejectRequest / rejectRequestBySig ──► Rejected
```
Nguồn: [contracts/src/EHRSystemSecure.sol:182-225](../contracts/src/EHRSystemSecure.sol#L182-L225),[324-365](../contracts/src/EHRSystemSecure.sol#L324-L365).

### Event chính
`SystemInitialized`, `AccessRequested`, `RequestApprovedByRequester`, `RequestApprovedByPatient`,
`RequestCompleted`, `RequestRejected` ([contracts/src/interfaces/IEHRSystemSecure.sol:24-63](../contracts/src/interfaces/IEHRSystemSecure.sol#L24-L63)).

---

## 6. Wiring sau deploy (DeployAll.s.sol)

Thứ tự deploy: AccessControl → ConsentLedger → RecordRegistry → EHRSystemSecure → DoctorUpdate
([contracts/script/DeployAll.s.sol:16-42](../contracts/script/DeployAll.s.sol#L16-L42)). Sau đó wiring
([:44-73](../contracts/script/DeployAll.s.sol#L44-L73)):

```
RecordRegistry.setConsentLedger(consentLedger)            // :47
RecordRegistry.authorizeContract(doctorUpdate, true)      // :48
ConsentLedger.authorizeContract(ehrSystem, true)          // :64
ConsentLedger.authorizeContract(doctorUpdate, true)       // :65
ConsentLedger.setAccessControl(accessControl)             // :68  (audit #3)
ConsentLedger.setRecordRegistry(recordRegistry)           // :72  (root-walk)

// Sponsor (nếu SPONSOR_ADDRESS được set):
AccessControl.setRelayer(sponsor, true)                   // :54
RecordRegistry.authorizeSponsor(sponsor, true)            // :55
ConsentLedger.authorizeSponsor(sponsor, true)             // :56
```

| Wiring | Vì sao cần | Nguồn |
|---|---|---|
| `authorizeContract(ehrSystem)` + `(doctorUpdate)` | 2 contract này gọi `grantInternal`/`grantDelegationInternal` (modifier `onlyAuthorized`) | [:64-65](../contracts/script/DeployAll.s.sol#L64-L65) |
| `setAccessControl` | để `canAccess` chặn unverified doctor (audit #3) | [:66-68](../contracts/script/DeployAll.s.sol#L66-L68) |
| `setRecordRegistry` | để `canAccess` walk cidHash → root (grant once at V2 → phủ V1/V2/V3) | [:69-72](../contracts/script/DeployAll.s.sol#L69-L72) |
| `authorizeContract(doctorUpdate)` ở RecordRegistry | DoctorUpdate gọi `addRecordByDoctor` thay bác sĩ | [:48](../contracts/script/DeployAll.s.sol#L48) |
| sponsor trên 3 contract | backend relayer trả gas hộ (register/upload/revoke/grant) | [:52-57](../contracts/script/DeployAll.s.sol#L52-L57) |

> **Lưu ý**: phải wire sau deploy để tránh circular dependency ở constructor. Mức enforce KHÁC nhau:
> - `RecordRegistry.setConsentLedger` **enforce single-set**: revert `"Already set"` nếu đã wire ([contracts/src/RecordRegistry.sol:57-62](../contracts/src/RecordRegistry.sol#L57-L62), đặc biệt `:60`).
> - `ConsentLedger.setAccessControl` / `setRecordRegistry` chỉ `onlyAdmin`, **KHÔNG có guard one-time** trong code — NatSpec ghi "one-time" nhưng admin có thể re-wire bất cứ lúc nào ([contracts/src/ConsentLedger.sol:174-177](../contracts/src/ConsentLedger.sol#L174-L177), [:182-185](../contracts/src/ConsentLedger.sol#L182-L185)).

---

## 7. Ai trả gas / dữ liệu gì mã hoá (nhìn từ contract)

- **Patient sponsored**: register, upload record, revoke, grant consent, delegate → patient ký EIP-712, backend relayer broadcast (các hàm `*BySig` / `*For` / `registerPatientFor`). Patient không cần ETH.
- **Doctor/Org tự trả gas**: `requestAccess`, `verifyDoctor`, `subDelegate`, `grantUsingDelegation`, `grantUsingRecordDelegation` đều dựa vào `msg.sender` đúng wallet — không sponsor được.
- **Mã hoá**: on-chain chỉ có `cidHash` (hash của CID, [RecordRegistry.sol:9-15](../contracts/src/RecordRegistry.sol#L9-L15)) và `encKeyHash` (hash của khoá, [IConsentLedger.sol:113-120](../contracts/src/interfaces/IConsentLedger.sol#L113-L120)). Khoá AES thật + CID plaintext nằm off-chain (payload mã hoá NaCl box), chỉ recipient giải được. Chain leak → attacker chỉ có metadata + hash, không đọc được hồ sơ.

---

## 8. Biên dịch (foundry.toml)

| Cấu hình | Giá trị | Ý nghĩa | Nguồn |
|---|---|---|---|
| `solc_version` | `0.8.24` | Pragma `^0.8.24` toàn bộ contract | [foundry.toml:9](../contracts/foundry.toml#L9) |
| `optimizer` / `optimizer_runs` | `true` / `200` | Tối ưu cho deploy + runtime cân bằng | [foundry.toml:10-11](../contracts/foundry.toml#L10-L11) |
| `via_ir` | `true` | Dùng IR pipeline (cần thiết do ConsentLedger nhiều biến/stack sâu) | [foundry.toml:12](../contracts/foundry.toml#L12) |
| remappings | `@openzeppelin/contracts/`, `forge-std/` | OZ: Ownable, Pausable, ReentrancyGuard, ECDSA, EIP712 | [foundry.toml:5-8](../contracts/foundry.toml#L5-L8) |

---

## Điểm dễ bị hỏi khi bảo vệ (chốt nhanh)

1. **Vì sao chỉ lưu hash CID?** Privacy: blockchain public, lưu CID plaintext = lộ con trỏ tới ciphertext IPFS. Hash thì không đảo ngược được ([RecordRegistry.sol:9-15](../contracts/src/RecordRegistry.sol#L9-L15)).
2. **Bác sĩ chưa verify có đọc record được share không?** Không. `canAccess` chặn `isDoctor && !isVerifiedDoctor` (audit #3) ([ConsentLedger.sol:699-703](../contracts/src/ConsentLedger.sol#L699-L703)). Nhưng vẫn write/đọc record mình tạo qua khoá local.
3. **Revoke delegation cha thì cháu mất quyền tức thì?** Có — qua cơ chế epoch bump + walk so epoch trong `canAccess` (≤8 hop), không cần xoá từng consent ([ConsentLedger.sol:468-484](../contracts/src/ConsentLedger.sol#L468-L484),[736-763](../contracts/src/ConsentLedger.sol#L736-L763)).
4. **Một consent cấp ở version cũ có thấy version mới không?** Có — consent lưu tại canonical root, `canAccess` walk query về root (medical episode model) ([ConsentLedger.sol:294-299](../contracts/src/ConsentLedger.sol#L294-L299),[679-706](../contracts/src/ConsentLedger.sol#L679-L706)).
5. **Tại sao request cần 2 bên duyệt + delay 15s?** Chống front-run/đơn phương: cả requester và patient phải confirm, và confirm thứ 2 phải sau `MIN_APPROVAL_DELAY` ([EHRSystemSecure.sol:220-224](../contracts/src/EHRSystemSecure.sol#L220-L224)).

---

## Nguồn đã đọc

- [contracts/src/AccessControl.sol](../contracts/src/AccessControl.sol)
- [contracts/src/ConsentLedger.sol](../contracts/src/ConsentLedger.sol)
- [contracts/src/RecordRegistry.sol](../contracts/src/RecordRegistry.sol)
- [contracts/src/DoctorUpdate.sol](../contracts/src/DoctorUpdate.sol)
- [contracts/src/EHRSystemSecure.sol](../contracts/src/EHRSystemSecure.sol)
- [contracts/src/interfaces/IAccessControl.sol](../contracts/src/interfaces/IAccessControl.sol)
- [contracts/src/interfaces/IConsentLedger.sol](../contracts/src/interfaces/IConsentLedger.sol)
- [contracts/src/interfaces/IRecordRegistry.sol](../contracts/src/interfaces/IRecordRegistry.sol)
- [contracts/src/interfaces/IEHRSystemSecure.sol](../contracts/src/interfaces/IEHRSystemSecure.sol)
- [contracts/script/DeployAll.s.sol](../contracts/script/DeployAll.s.sol)
- [contracts/foundry.toml](../contracts/foundry.toml)
</content>
</invoke>
