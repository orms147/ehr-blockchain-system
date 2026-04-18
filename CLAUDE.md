# CLAUDE.md — EHR DATN Project Context

> Đồ án tốt nghiệp (DATN): Hệ thống Hồ sơ Y tế điện tử (EHR) trên blockchain
> theo mô hình quản lý ngành Y tế Việt Nam. **Trọng tâm luận văn là an toàn &
> riêng tư on-chain** — backend chỉ là "blind mailbox" cho payload mã hoá.
> Không đề xuất giải pháp đẩy logic về backend cho tiện.

## 1. Repo layout

```
c:\University\DATN\EHR\
├── contracts/      Foundry + Solidity 0.8.24, 5 contract chính
├── backend/        Node.js + Express + Prisma (Postgres/Neon) + viem
├── mobile/         React Native + Expo SDK 55 (dev client) + Tamagui
├── frontend/       Next.js 16 + Tailwind (dashboard ngành y) — ~60% xong
├── subgraph/       The Graph (Studio) — Arbitrum Sepolia
└── context/        Tài liệu kiến trúc (00_index.md → 11_*.md)
```

## 2. Commands

| Subsystem | Dev | Notes |
|---|---|---|
| backend | `cd backend && npm run dev` | nodemon → `src/app.js`. Cần Postgres (Neon) chạy + `.env` đầy đủ. |
| backend DB | `npm run db:migrate` / `db:generate` / `db:studio` | Prisma 6. **Không dùng `db push`** — luôn migrate file. |
| mobile | `cd mobile && npm run android` | Expo dev client (KHÔNG Expo Go). Node 20.x bắt buộc. |
| mobile type-check | `npm run type-check` | `tsc --noEmit` |
| contracts build | `cd contracts && forge build` | `via_ir = true`, `optimizer_runs = 200` |
| contracts test | `forge test` | 105 test, xem [contracts/test/](contracts/test/) |
| contracts deploy | `forge script script/DeployAll.s.sol --rpc-url $ARB_SEPOLIA_RPC --broadcast` | **User tự chạy** — ta KHÔNG broadcast giúp |
| subgraph | `cd subgraph && graph deploy --studio ...` | **User tự deploy** sau khi ta cập nhật yaml + ABI |

## 3. Smart contracts

5 contract trong [contracts/src/](contracts/src/) — Solidity 0.8.24:

| File | Lines | Vai trò |
|---|---|---|
| [AccessControl.sol](contracts/src/AccessControl.sol) | 529 | Bitwise role flags + verification + organization registry |
| [RecordRegistry.sol](contracts/src/RecordRegistry.sol) | 330 | Lưu `bytes32 cidHash` (KHÔNG plaintext CID) + parent-child chain |
| [ConsentLedger.sol](contracts/src/ConsentLedger.sol) | 650 | Trái tim phân quyền: consent + delegation CHAIN topology + EIP-712 |
| [DoctorUpdate.sol](contracts/src/DoctorUpdate.sol) | 274 | Facade `addRecordByDoctor` + `grantEmergencyAccess` (24h, 2-10 chứng nhân) |
| [EHRSystemSecure.sol](contracts/src/EHRSystemSecure.sol) | 358 | State machine `requestAccess` 2-bên duyệt, EIP-712 `confirmAccessRequestWithSignature` |

Interfaces: [contracts/src/interfaces/](contracts/src/interfaces/) — `IAccessControl`, `IConsentLedger` (chứa `struct Consent` với `includeUpdates`/`allowDelegate`), `IRecordRegistry`, `IEHRSystemSecure`.

### Bitwise roles ([AccessControl.sol:23-30](contracts/src/AccessControl.sol#L23-L30))

```
PATIENT=1, DOCTOR=2, ORGANIZATION=4, MINISTRY=8,
VERIFIED_DOCTOR=16, VERIFIED_ORG=32
```
Verified-* là FLAG, không phải role riêng. Bộ Y tế tạo Org → Org xác minh Doctor.

### Consent struct (key concepts)

- Key = `keccak256(patient, grantee, rootCidHash)`
- `includeUpdates` — grantee được đọc các child version của cùng `rootCidHash`. Backend `canAccess` KHÔNG enforce trực tiếp; semantics nằm ở off-chain (KeyShare cascade).
- `allowDelegate` — grantee được gọi `grantUsingRecordDelegation` để chia sẻ lại record này.
- Khác `subDelegate` (ủy quyền BULK theo authority delegation, không gắn record).

### Delegation CHAIN topology (đã merge phase 0)

- `_delegations[patient][delegatee]` packed: `expiresAt(uint40) | allowSubDelegate<<40 | active<<41`
- `delegationParent[patient][delegatee]` — pointer cha (address(0) = nhánh trực tiếp từ patient)
- `delegationEpoch[patient][delegator]` — bumped mỗi lần revoke; downstream consent so epoch để invalidate cascade
- `MAX_DELEGATION_WALK = 8` hops trong `canAccess`
- Functions: `delegateAuthorityBySig` (relayer), `subDelegate`, `revokeDelegation`, `revokeSubDelegation`, `grantUsingDelegation` (7 params, sử dụng delegation)

### Wiring sau khi deploy ([DeployAll.s.sol](contracts/script/DeployAll.s.sol))

```
RecordRegistry.setConsentLedger(consentLedger)
RecordRegistry.authorizeContract(doctorUpdate, true)
ConsentLedger.authorizeContract(ehrSystem, true)
ConsentLedger.authorizeContract(doctorUpdate, true)
ConsentLedger.setAccessControl(accessControl)   // FIX audit #3
AccessControl.setRelayer(SPONSOR_ADDRESS, true)
RecordRegistry.authorizeSponsor(SPONSOR_ADDRESS, true)
ConsentLedger.authorizeSponsor(SPONSOR_ADDRESS, true)
```

## 4. On-chain ↔ off-chain split (CRITICAL — đừng nhầm)

| Layer | Lưu gì | Ai đọc được |
|---|---|---|
| **On-chain** ConsentLedger | grantee, cidHash, expireAt, flags, `encKeyHash` (HASH thôi) | Public, audit |
| **Off-chain** KeyShare (Postgres) | `encryptedPayload` = NaCl box `{cid, aesKey}` mã hoá bằng public key recipient | CHỈ recipient có NaCl secret key |
| **IPFS** (Pinata) | AES-GCM ciphertext của FHIR bundle | Cần AES key (nằm trong encryptedPayload) |

**Backend là "blind mailbox"** — nó CÓ encryptedPayload nhưng KHÔNG decrypt được. Nếu DB bị leak, attacker chỉ có ciphertext + hash. Nếu chain bị leak, attacker chỉ có metadata không có key.

**Backend phải gate truy cập bằng `canAccess` on-chain** trước khi trả `encryptedPayload`. Code: [backend/src/config/blockchain.js](backend/src/config/blockchain.js) `checkConsent(patient, grantee, cidHash)` → đọc `ConsentLedger.canAccess`. Đã wire vào POST `/api/key-share/:id/claim` (Phase 3F).

## 5. Permission model — 3 RequestType

Verified ở `EHRSystemSecure.sol` `_completeRequest`:

| RequestType | Function gọi | includeUpdates | allowDelegate | Ngữ nghĩa |
|---|---|---|---|---|
| `DirectAccess` (0) | `grantInternal` | true | false | Đọc 1 record + auto-thấy version mới của cùng root. Không re-share. |
| `RecordDelegation` (2) | `grantInternal` | true | true | Đọc 1 record + version + có thể `grantUsingRecordDelegation` cho người thứ 3. |
| `FullDelegation` (1) | `grantDelegationInternal` | — | — | Bulk delegate TOÀN BỘ record patient, scope theo `Delegation` table. `allowSubDelegate=true` hardcoded ở `_completeRequest`. |

UI mobile chia sẻ hồ sơ có 3 lựa chọn `shareType` (added 2026-04-09):
- `read-only` → `includeUpdates=false, allowDelegate=false` + skip cascade share các version khác
- `read-update` → `includeUpdates=true, allowDelegate=false` (mặc định)
- `read-delegate` → `includeUpdates=true, allowDelegate=true`

Code: [mobile/src/screens/RecordDetailScreen.tsx](mobile/src/screens/RecordDetailScreen.tsx) (`shareType` state).

### Bác sĩ chưa xác minh (RESOLVED — KHÔNG sửa contract)

`canAccess` (FIX audit #3) refuses bất kỳ doctor grantee nào không `isVerifiedDoctor`. Doctor chưa verified vẫn:
- Đăng ký, tạo record cho patient (write path)
- Đọc record mình tạo qua local AES key
- KHÔNG đọc được record được share đến mình cho tới khi được verify

Defense layers: (a) UI mobile cảnh báo trước khi share, (b) backend `checkConsent` gate, (c) on-chain `canAccess` final authority.

## 6. Gas sponsorship — unified 100/month pool

Decision 2026-04-07: gộp `uploadsThisMonth`+`revokesThisMonth` cũ thành 1 pool duy nhất.

- `User.signaturesThisMonth Int @default(0)` — cap 100, reset monthly ([schema.prisma:88](backend/prisma/schema.prisma#L88))
- `User.hasSelfWallet` — true thì bỏ qua quota (user xài ETH thật)
- `relayer.service.js` — `QUOTA_LIMITS = { SIGNATURES_PER_MONTH: 100 }`, `consumeQuota` + `bumpSignatureCounter` quanh mỗi sponsor function
- Sponsor functions: `sponsorRegisterPatient`, `sponsorRegisterDoctor`, `sponsorUploadRecord`, `sponsorRevoke`, `sponsorGrantConsent`, `sponsorDelegateAuthority`
- Doctor/Org KHÔNG sponsor — họ tự trả gas (vì `msg.sender` phải đúng wallet họ cho các check `verifyDoctor`, `subDelegate`, `grantUsingDelegation`)

UI quota: [mobile/src/screens/DashboardScreen.tsx](mobile/src/screens/DashboardScreen.tsx) hiển thị `signaturesRemaining / signaturesLimit`.

## 7. Backend layout

Routes ([backend/src/routes/](backend/src/routes/)) mounted ở [app.js](backend/src/app.js):

```
/api/auth          /api/records       /api/key-share
/api/access-logs   /api/relayer       /api/requests
/api/verification  /api/emergency     /api/delegation
/api/push          /api/org           /api/admin
/api/pending-updates  /api/profile    /api/test
```

Services ([backend/src/services/](backend/src/services/)):
- `relayer.service.js` — gas sponsorship + quota
- `eventSync.service.js` / `recordRegistrySync.service.js` / `consentLedgerSync.service.js` — 3 worker đồng bộ event chain → DB cache (started bởi `app.js` sau khi server.listen)
- `socket.service.js` — Socket.io realtime push
- `push.service.js` — Expo push notifications
- `ipfs.service.js` — **MOCK** (returns fake CID). Mobile upload Pinata trực tiếp.

Prisma models quan trọng ([backend/prisma/schema.prisma](backend/prisma/schema.prisma)):
- `User` (wallet auth + NaCl pubkey + quota), `RecordMetadata`, `KeyShare` (có `allowDelegate` + `includeUpdates` mới)
- `Delegation` (CHAIN topology cache: `parentDelegator`, `chainDepth`, `epoch`, `allowSubDelegate`, `expiresAt`, `scopeNote`)
- `DelegationAccessLog` (mirrors `AccessGrantedViaDelegation` event)
- `Consent` (cache, KHÔNG dùng cho permission check), `EmergencyAccess`, `PendingUpdate` (doctor update workflow)

Migrations ([backend/prisma/migrations/](backend/prisma/migrations/)) — naming `YYYYMMDD_description`. Mới nhất: `20260409_keyshare_include_updates`.

## 8. Mobile layout

- Auth: Web3Auth ([mobile/src/config/web3authContext.ts](mobile/src/config/web3authContext.ts)) → wallet → backend `POST /api/auth/login` (nonce + viem `verifyMessage`)
- State: Zustand `authStore` + TanStack Query (cache server state)
- Navigation: [mobile/src/navigation/AppNavigator.tsx](mobile/src/navigation/AppNavigator.tsx) — bottom tabs theo role (patient / doctor / org / ministry), `RoleSwitcher` cho user multi-role
- UI lib: Tamagui + lucide-react-native + react-native-reanimated v4
- Crypto:
  - [mobile/src/services/nacl-crypto.js](mobile/src/services/nacl-crypto.js) — NaCl box keypair derived deterministically từ wallet signature (recoverable)
  - [mobile/src/services/crypto.js](mobile/src/services/crypto.js) — AES-GCM cho payload
  - [mobile/src/utils/eip712.js](mobile/src/utils/eip712.js) — `signGrantConsent`, `signDelegationPermit`
- Local store: AsyncStorage `ehr_local_records` map `cidHash → {cid, aesKey}` — **mất app = mất local key** (mitigation: self key-share lúc tạo record)
- Services theo route name backend ở [mobile/src/services/](mobile/src/services/) (`api.js` axios instance + JWT)

Screens chính theo role:
- Patient: Dashboard, Records, Requests, Profile, RecordDetail, CreateRecord, AccessLog, **Delegation**
- Doctor: DoctorDashboard, DoctorOutgoing, DoctorRequestAccess, DoctorCreateUpdate, DoctorExpiredRecords, **DoctorDelegatedPatients**, DoctorDelegatableRecords
- Org: OrgDashboard, OrgMembers, OrgPendingVerifications
- Ministry: MinistryDashboard (~60% mock)

## 9. Subgraph ([subgraph/subgraph.yaml](subgraph/subgraph.yaml))

The Graph Studio, network: `arbitrum-sepolia`. 4 dataSources index:
- RecordRegistry: `RecordAdded`, `RecordUpdated`
- EHRSystem: `AccessRequested`, `RequestCompleted`, `RequestRejected`
- ConsentLedger: `ConsentGranted`, `ConsentRevoked`, `DelegationGranted`, `DelegationRevoked`, `AccessGrantedViaDelegation`
- AccessControl: `DoctorVerified`, `VerificationRevoked`, `OrganizationCreated`, `OrganizationStatusChanged`

ABI files ở [subgraph/abis/](subgraph/abis/). Sau mỗi lần redeploy contract phải update address + startBlock ở 4 dataSources.

## 10. Deployment (user-driven)

User redeploy contract bằng tay → trả lại 5 address + 5 startBlock. Files cần đồng bộ:
- `backend/.env` — `ACCESS_CONTROL_ADDRESS`, `CONSENT_LEDGER_ADDRESS`, `RECORD_REGISTRY_ADDRESS`, `EHR_SYSTEM_ADDRESS`, `DOCTOR_UPDATE_ADDRESS`
- `mobile/.env` — `EXPO_PUBLIC_*_ADDRESS`
- `frontend/.env`
- `subgraph/subgraph.yaml` (4 dataSources × {address, startBlock})
- ABI: `mobile/src/abi/contractABI.js`, `backend/src/config/contractABI.js`, `frontend/src/config/contractABI.js`, `subgraph/abis/*.json`

## 11. Conventions & Gotchas

- **Vietnamese** trong UI text + commit message OK; code/comment tiếng Anh.
- **KHÔNG `db push`** — luôn tạo migration file. Đã từng có sự cố `db push` thêm cột nhưng migration không có (fix bằng `prisma migrate diff` → tạo `20260408_add_missing_db_push_columns/`).
- **KHÔNG đẩy logic về backend** chỉ vì tiện. On-chain là core thesis.
- **KHÔNG sửa contract** để bypass FIX audit #3 (verified-doctor cascade). Đã chốt 2026-04-06.
- **Cidhash on-chain** = `keccak256(bytes(cid))` — plaintext CID không bao giờ on-chain.
- **Doctor `addRecordByDoctor`** không cần consent — chỉ cần role DOCTOR + patient tồn tại. `includeUpdates` flag KHÔNG gate write path, chỉ gate read.
- **Delegation duration** = uint40 SECONDS (không phải absolute timestamp). MIN 1 day, MAX 5 years.
- **Nonce** patient share giữa `ConsentPermit` và `DelegationPermit` (cùng `nonces[patient]`).
- **`revokeDelegation`** không có BySig variant — patient phải tự trả gas.
- **`grantUsingRecordDelegation`** hardcode `includeUpdates=false, allowDelegate=false` cho consent mới (không cascade).
- **Neon Postgres auto-suspend** — backend startup lần đầu sau idle có thể fail vài giây.
- **`Consent` model trong Prisma** chỉ là cache — đừng dùng để check permission, luôn gọi `checkConsent` (on-chain).
- **Web3Auth RN SDK v8.1.0 KHÔNG tự restore session sau cold start.** JWT được restore từ SecureStore → user nhìn như đã đăng nhập, nhưng `privateKeyProvider.state.privateKey` rỗng → mọi signing/decrypt fail. [authStore.loadToken](mobile/src/store/authStore.js) verify `walletActionService.hasActiveSession()` trước khi set `isAuthenticated=true`; nếu Web3Auth không có key → clear JWT, user landing thẳng LoginScreen. Đừng persist private key vào SecureStore (anti-pattern self-custody).

## 12. Known mocks / gaps

- `backend/src/services/ipfs.service.js` — mock CID
- Ministry dashboard ~60% (Phase muộn)
- `grantUsingDelegation` flow off-chain: chưa tạo KeyShare row cho new grantee (Phase 5 follow-up)
- `DelegationAccessLog` UI surface: chưa có (hook đã có ở `useDelegations.ts`)
- Push notification listeners mobile: 0% (backend socket.io ready)
- Watermark/FLAG_SECURE cho decrypted view: chưa quyết định

## 13. File-pointer cheatsheet

| Task | File |
|---|---|
| Patient share record (mobile) | [mobile/src/screens/RecordDetailScreen.tsx](mobile/src/screens/RecordDetailScreen.tsx) `handleShare` |
| Grant on-chain consent (mobile) | [mobile/src/services/consent.service.js](mobile/src/services/consent.service.js) `grantConsentOnChain` |
| Sign EIP-712 permits (mobile) | [mobile/src/utils/eip712.js](mobile/src/utils/eip712.js) |
| Backend gate share/claim | [backend/src/routes/keyShare.routes.js](backend/src/routes/keyShare.routes.js) |
| Relayer sponsor functions | [backend/src/services/relayer.service.js](backend/src/services/relayer.service.js) |
| On-chain `canAccess` reader | [backend/src/config/blockchain.js](backend/src/config/blockchain.js) `checkConsent` |
| Event sync workers | [backend/src/services/eventSync.service.js](backend/src/services/eventSync.service.js), `recordRegistrySync.service.js`, `consentLedgerSync.service.js` |
| Doctor sees delegated patients | [mobile/src/screens/doctor/DoctorDelegatedPatientsScreen.tsx](mobile/src/screens/doctor/DoctorDelegatedPatientsScreen.tsx) |
| Doctor "Cập nhật" button gate | [mobile/src/components/SharedRecordCard.tsx](mobile/src/components/SharedRecordCard.tsx) (`isReadOnly`) + [DoctorDashboardScreen.tsx](mobile/src/screens/doctor/DoctorDashboardScreen.tsx) `handleCreateUpdate` |
| Prisma schema | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) |
| Foundry config | [contracts/foundry.toml](contracts/foundry.toml) |

---

**Last verified**: 2026-04-09. Khi context cũ hơn 1-2 tuần, verify lại file paths/line numbers trước khi cite.
