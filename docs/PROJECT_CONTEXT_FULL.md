# EHR System Project Context (Full)

## 1. Project Goal

Xây dựng hệ thống quản lý hồ sơ y tế phi tập trung (decentralized EHR) theo mô hình hybrid:

- On-chain: quản lý role, quyền truy cập, ủy quyền, audit events.
- Off-chain: lưu metadata, key-sharing mailbox, profile, luồng nghiệp vụ phụ trợ.
- IPFS: lưu encrypted medical payload (CID), on-chain chỉ dùng hash.

Tech stack chính:

- Smart contract: Solidity (Foundry)
- Frontend: Next.js + React + TypeScript/JavaScript + viem + Web3Auth
- Backend: Node.js + Express + Prisma + PostgreSQL (NeonDB)
- Storage: IPFS/Pinata (backend hiện có mock service ở một số chỗ)
- Realtime: Socket.IO

---

## 2. Repository Structure

Workspace root: `C:\University\DATN\ERH system(progsss)`

Các thư mục chính:

- `contracts/`: smart contracts + scripts + tests (Foundry)
- `backend/`: Express API + Prisma schema + services
- `frontend/`: Next.js app + services + hooks + UI
- `mobile/`: mobile codebase (chưa phân tích sâu trong lượt này)
- `docs/`: tài liệu dự án

---

## 3. On-chain Architecture

Contracts chính:

- `AccessControl.sol`
- `ConsentLedger.sol`
- `RecordRegistry.sol`
- `EHRSystemSecure.sol`
- `DoctorUpdate.sol`

### 3.1 AccessControl

Vai trò dùng bitwise flags:

- PATIENT, DOCTOR, ORGANIZATION, MINISTRY
- VERIFIED_DOCTOR, VERIFIED_ORG

Chức năng chính:

- Register role (self + relayer)
- Tạo/tắt organization entity theo `orgId`
- Verify/revoke doctor/org
- Quản lý thành viên tổ chức theo `orgId`
- Quản lý relayer/sponsor

Lưu ý thiết kế:

- Có function deprecated để tương thích backward (`registerAsOrganization`, `verifyOrganization`, `addMember`, `removeMember`).
- Ministry có quyền relayer mặc định.

### 3.2 ConsentLedger

Consent model:

- Key: `keccak256(patient, grantee, rootCidHash)`
- CID plaintext không lên chain; chỉ `bytes32 rootCidHash`.
- Hỗ trợ `grantInternal`, `grantBySig`, `revoke`, `revokeFor`.
- Delegation:
  - full delegation (packed storage)
  - record delegation (`allowDelegate`)

Bảo mật:

- EIP-712 signature + nonce chống replay.
- ReentrancyGuard.

### 3.3 RecordRegistry

Quản lý record hash graph:

- Record gốc và record con (version chain qua `parentCidHash`)
- Owner records index (`_ownerRecordIndex`) để update/transfer nhanh
- Giới hạn con: `MAX_CHILDREN = 100`

Nguồn ghi record:

- patient tự ghi
- sponsor ghi hộ (`addRecordFor`)
- doctor hoặc authorized contract ghi (`addRecordByDoctor`)

### 3.4 EHRSystemSecure

Flow request quyền truy cập:

- requester tạo request
- requester + patient confirm 2-phase
- sau đủ điều kiện thì grant consent/delegation vào `ConsentLedger`

Đặc điểm:

- EIP-712 confirm by signature
- trạng thái request on-chain rõ ràng
- có `pause/unpause`

### 3.5 DoctorUpdate

Flow bác sĩ tạo update:

- ghi record cho patient qua `RecordRegistry`
- auto-grant doctor temporary access cho root record
- có emergency access với witness validation

---

## 4. Backend Architecture

Entrypoint:

- `backend/src/app.js`

Thành phần:

- Routes theo domain (`auth`, `records`, `key-share`, `requests`, `org`, `admin`, `verification`, ...)
- Middleware auth JWT
- Prisma database layer
- Services:
  - `relayer.service.js`
  - `eventSync.service.js`
  - `socket.service.js`
  - `ipfs.service.js`

### 4.1 Auth Model

- Wallet sign-in bằng nonce + signature (`viem.verifyMessage`)
- JWT dùng cho API + Socket auth
- User role được đọc từ blockchain qua `getUserRole()`

### 4.2 Relayer/Sponsorship

- Backend giữ sponsor private key
- Tài trợ gas cho:
  - register patient/doctor
  - upload record
  - revoke consent
  - grantBySig
- Có quota monthly trong DB (`uploadsThisMonth`, `revokesThisMonth`)

### 4.3 Event Sync Worker

- Worker đồng bộ event AccessControl -> DB cache + socket notify
- Có catchup định kỳ + realtime watch
- Có logic phát hiện reorg cơ bản

### 4.4 Key Share Pattern

- DB đóng vai trò “blind mailbox” chứa encrypted payload
- payload chứa thông tin giải mã record (CID + AES key)
- lifecycle states: `pending`, `claimed`, `revoked`, `awaiting_claim`, `rejected` (thực tế dùng trong route)

---

## 5. Database Context (Prisma)

Datasource: PostgreSQL (NeonDB)

Model trọng tâm:

- `User`
- `RecordMetadata`
- `KeyShare`
- `AccessLog`
- `AccessRequest`
- `Consent`
- `PendingUpdate`
- `Delegation`
- `EmergencyAccess`
- `Organization`
- `OrganizationMember`
- `OrgApplication`
- `VerificationRequest`
- `DoctorCredential`
- `EventSyncState`

Đặc trưng:

- Lưu `cidHash` thay vì CID plaintext.
- Metadata hồ sơ và quyền truy cập được cache off-chain để UI truy vấn nhanh.

---

## 6. Frontend Architecture

Framework: Next.js App Router

Khối chính:

- `src/app/*`: pages dashboard theo role
- `src/services/*`: API service layer
- `src/hooks/*`: wallet/auth/socket/role hooks
- `src/config/*`: contract config + web3auth config
- `src/components/*`: UI và domain components

### 6.1 Wallet/Auth

- Web3Auth + viem
- JWT lưu localStorage
- Role lấy từ API/on-chain

### 6.2 Data Access

- Frontend gọi backend cho metadata/key-share/business flow
- Frontend gọi on-chain cho các thao tác blockchain trực tiếp (một số flow)

---

## 7. End-to-End Business Flows (Current)

### 7.1 Patient upload record

1. Frontend encrypt dữ liệu -> upload IPFS -> lấy CID
2. Hash CID => `cidHash`
3. Gọi backend `/api/records` để:
   - submit on-chain qua relayer (`addRecordFor`)
   - lưu metadata DB

### 7.2 Doctor request access

1. Doctor tạo request on-chain (`EHRSystemSecure.requestAccess`)
2. Backend lưu mirror `AccessRequest`
3. Patient approve bằng chữ ký EIP-712
4. Doctor claim, backend đổi trạng thái key-share

### 7.3 Doctor update hồ sơ

1. Doctor tạo `PendingUpdate` off-chain
2. Patient approve
3. Doctor claim (đưa update lên IPFS + on-chain), backend finalize metadata + key-share

### 7.4 Org onboarding

1. Applicant nộp `OrgApplication` off-chain
2. Ministry duyệt và gọi on-chain verify/create flow
3. Backend sync DB organization cache

---

## 8. Current Technical Debt & Risks

## 8.1 Security/AuthZ

- Một số endpoint quản trị còn TODO role-check.
- Có flow backend tin dữ liệu client mà chưa verify transaction/event đầy đủ.
- Một số logic cho phép operation “doctor nhưng chưa verified”.

## 8.2 Consistency (On-chain vs Off-chain)

- Nhiều chỗ DB cache là projection nhưng không có cơ chế reconciliation đủ chặt.
- Event sync có đoạn mapping chưa nhất quán (blockchain orgId vs DB UUID).
- Có endpoint dùng flow cũ/deprecated so với contract mới.

## 8.3 Performance/Scalability

- Nhiều N+1 query + recursion trong routes record/key-share.
- Có loop gọi RPC checkConsent nhiều lần trong cùng request.
- Worker + API có thể nghẽn khi user/data tăng x10.

## 8.4 Code Quality

- Route handlers đang “fat” (mix validate + auth + business + chain + persistence + notify).
- Lặp logic chain traversal/consent inheritance.
- String status rải rác, thiếu state machine tập trung.

## 8.5 DevOps/Config

- Có cấu hình hardcoded ở frontend (contract addresses, fallback clientId).
- Có mock IPFS service ở backend; cần tách rõ env dev/prod.
- CORS/rate limit đang thiên về dev profile.

---

## 9. Coupling Map

Coupling mạnh hiện tại:

- Backend routes <-> Prisma schema states
- Backend routes <-> on-chain RPC/read/write
- Frontend components <-> backend response shape cụ thể
- EventSync <-> Organization/OrganizationMember DB assumptions

Điểm rủi ro:

- Khi contract thay đổi event/function semantics, backend dễ gãy.
- Khi schema DB đổi, nhiều route side-effect bị ảnh hưởng dây chuyền.

---

## 10. Recommended Target Architecture

Nên tiến tới:

1. Contract-first domain services
- `AccessService`, `ConsentService`, `RecordService`, `OrgService`
- Route chỉ làm transport + validation.

2. Projection model rõ ràng
- On-chain = source of truth
- DB = read model/cache + async projection

3. State machine cho các model nhạy cảm
- `AccessRequest`, `KeyShare`, `PendingUpdate`, `EmergencyAccess`

4. Policy engine tập trung
- Authorize theo role + verification + ownership + consent
- Tránh check quyền phân tán trong từng route.

5. Performance hardening
- Batch RPC (multicall), tránh RPC trong loop
- Materialized chain/root mapping
- Pagination + query index strategy

---

## 11. Environment & Configuration Notes

Backend cần:

- `DATABASE_URL`
- `JWT_SECRET`
- `RPC_URL`
- Contract addresses (`ACCESS_CONTROL_ADDRESS`, `CONSENT_LEDGER_ADDRESS`, ...)
- `SPONSOR_PRIVATE_KEY`

Frontend cần:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
- `NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS` (và các address liên quan nếu dùng)
- Pinata keys/jwt (`NEXT_PUBLIC_PINATA_*`) nếu upload trực tiếp từ frontend

---

## 12. Priority Refactor Checklist (Practical)

P0 (ngay lập tức):

- Khóa toàn bộ admin/verification endpoints bằng on-chain ministry/org-admin checks.
- Bắt buộc verify tx receipt + event khi đổi trạng thái claim/approve quan trọng.
- Sửa route ordering gây shadowing.
- Đồng bộ schema-field mismatch để tránh runtime error.
- Loại bỏ flow gọi deprecated contract APIs.

P1:

- Tách service layer và gom logic traversal/consent reuse.
- Chuẩn hóa enum/state transitions.

P2:

- Tối ưu query + RPC batching.
- Thiết kế projection pipeline/reconciliation rõ ràng.

P3:

- Bổ sung integration tests cho flow cross-chain/off-chain.
- Bổ sung observability (structured logs, metrics, alerts).

---

## 13. Current Status Summary

Hệ thống đã có nền tảng hybrid khá đầy đủ (role/consent/delegation/request/update, key-sharing, relayer, realtime, event sync).  
Tuy nhiên đang ở giai đoạn “feature-rich nhưng coupling cao”, nên rủi ro chính không phải thiếu tính năng mà là:

- sai lệch trạng thái giữa on-chain và off-chain,
- điểm yếu authorization ở vài endpoint,
- và bottleneck hiệu năng khi tải tăng mạnh.

Tài liệu này dùng làm baseline context để tiếp tục audit và refactor theo sprint.
