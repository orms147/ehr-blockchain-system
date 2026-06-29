# Chức năng — Đồng bộ sự kiện on-chain → DB cache & Subgraph

## Tóm tắt 30 giây

Smart contract phát ra **event** mỗi khi có thay đổi (cấp/thu quyền, tạo hồ sơ, uỷ quyền, xác minh bác sĩ...). Backend cần biết những thay đổi đó để hiển thị danh sách / lịch sử cho app mà không phải quét lại blockchain mỗi lần mở màn hình. Vì vậy backend chạy các **worker đồng bộ**: nghe event → ghi vào bảng cache trong Postgres. Có hai cách lấy event: (1) tự gọi RPC `eth_getLogs` (cách cũ, tốn RPC), và (2) hỏi **Subgraph** (The Graph) bằng một query GraphQL duy nhất (cách hiện tại). **Điểm cốt lõi để bảo vệ trước hội đồng:** DB chỉ là *bản sao đọc nhanh (cache)*; **mọi quyết định CHO PHÉP truy cập vẫn gọi thẳng on-chain** qua `ConsentLedger.canAccess` (`backend/src/config/blockchain.js:173-208`). Nếu cache sai, người dùng chỉ thấy hàng "ma" rồi bị on-chain từ chối — không bao giờ rò rỉ dữ liệu.

> ⚠️ Lưu ý so với CLAUDE.md: CLAUDE.md mô tả "3 worker RPC sync luôn chạy". **Code thực tế đã đổi (S17, 2026-04-30):** chỉ `startSubgraphSync()` được gọi khi server khởi động (`backend/src/app.js:115`); 3 worker RPC (`eventSync`, `recordRegistrySync`, `consentLedgerSync`) đã **bị tắt** ở vòng đời chạy thật, chỉ giữ lại làm thư viện handler. Tài liệu này bám theo code.

---

## 1. Khái niệm nền (cho người không rành backend)

### 1.1 Event là gì?
Trong Solidity, `event` là bản ghi *append-only* mà contract ghi vào "log" của transaction. Event **rẻ hơn** lưu vào storage và được thiết kế để **đọc từ ngoài chain** (off-chain). Ứng dụng không thể "subscribe" trực tiếp vào biến storage của contract; cách chuẩn để biết "có gì vừa xảy ra" là **đọc các log/event** mà contract đã phát.

Ví dụ event thật trong dự án (khai báo bằng viem `parseAbiItem`):
- `ConsentGranted(patient, grantee, rootCidHash, expireAt, allowDelegate)` (`backend/src/services/consentLedgerSync.service.js:36-38`)
- `RecordAdded(owner, cidHash, parentCidHash, recordTypeHash, timestamp)` (`backend/src/services/recordRegistrySync.service.js:31-33`)
- `DoctorVerified(doctor, verifier, orgId, credential)` (`backend/src/services/eventSync.service.js:25`)

### 1.2 Vì sao cần cache mà KHÔNG được dùng cache để quyết định quyền?

| | On-chain (nguồn chân lý) | DB cache (Postgres) |
|---|---|---|
| Tốc độ đọc | Chậm (1 RPC/lần, có rate-limit 429) | Nhanh (SQL nội bộ) |
| Dùng để | **Quyết định quyền truy cập** | Hiển thị danh sách, lịch sử, dashboard |
| Có thể sai/lỗi thời? | Không (đồng thuận blockchain) | Có (worker trễ, reorg, RPC rớt) |

Lý do tách: nếu mỗi lần render danh sách "ai đã chia sẻ hồ sơ cho tôi" mà phải walk chuỗi delegation on-chain thì vừa chậm vừa cháy quota RPC. Nên backend cache lại để đọc nhanh. **Nhưng** nếu dùng cache để quyết định "có cho xem hay không" thì một cache lỗi thời = lỗ hổng bảo mật. Vì vậy mã nguồn cố tình tách: cache chỉ để *liệt kê*, còn cổng truy cập thật (`POST /api/key-share/:id/claim`) luôn gọi `checkConsent → canAccess` on-chain. Comment trong code nói rõ điều này: "The DB rows here are a CACHE. Authorization decisions still go through ConsentLedger.canAccess()" (`backend/src/services/consentLedgerSync.service.js:5-8`).

### 1.3 Subgraph (The Graph) là gì?
The Graph là dịch vụ **index blockchain**. Ta khai báo (trong `subgraph.yaml`) "hãy theo dõi các contract này, các event này, và khi event xảy ra hãy lưu thành các entity theo schema". The Graph chạy node quét chain, gọi các hàm mapping (viết bằng AssemblyScript trong `subgraph/src/*.ts`) để biến event thành **entity** lưu trong store của nó. Sau đó ta **query bằng GraphQL** — một request lấy được nhiều loại dữ liệu, đã sắp xếp, lọc, phân trang sẵn, **không tốn RPC của ta**.

> **Hai CSDL tách biệt (hay nhầm):** The Graph có **PostgreSQL riêng của nó** (do The Graph Studio vận hành, nằm sau endpoint GraphQL), **độc lập hoàn toàn** với Neon Postgres của dự án. Neon chỉ là **bản sao cache** mà backend kéo về (mục 4). Indexer quét mỗi khối **một lần** rồi ghi entity vào DB-của-The-Graph; app/back-end **không bao giờ tự quét chain** — đó là lý do "đọc nhanh hơn": phép quét tuyến tính được khấu hao một lần lúc index, mỗi truy vấn sau chỉ là tra cứu có index (O(log n)) thay vì O(số khối) lặp lại như `eth_getLogs`.

```
                          ┌──────────────────────────────┐
   Blockchain (Arbitrum)  │  The Graph node (Studio)      │
   ─ event log ──────────►│  mapping (AssemblyScript)     │
   ConsentGranted, ...    │   → lưu entity theo schema    │
                          │   ConsentEvent, Record, ...   │
                          └──────────────┬───────────────┘
                                         │ GraphQL (HTTP POST)
                          ┌──────────────▼───────────────┐
                          │ backend subgraphSync (30s)    │
                          │ mobile subgraph.service.js    │
                          └──────────────────────────────┘
```

---

## 2. Kiến trúc tổng quan (code thực tế hiện tại)

```
                         ┌─────────────────────────────────────────────┐
                         │ 5 Smart Contracts (Arbitrum Sepolia)        │
                         │ AccessControl · RecordRegistry ·            │
                         │ ConsentLedger · EHRSystem · DoctorUpdate    │
                         └───────────────┬─────────────────────────────┘
                                         │ phát events
                  ┌──────────────────────┴───────────────────────┐
                  ▼                                               ▼
       ┌─────────────────────┐                        ┌──────────────────────┐
       │ The Graph subgraph  │  (index toàn bộ event) │  RPC (eth_getLogs)    │
       │ subgraph.yaml +     │                        │  — đường cũ, đã TẮT   │
       │ src/*.ts mappings   │                        │  ở runtime (S17)      │
       └──────────┬──────────┘                        └──────────────────────┘
                  │ GraphQL
                  ▼
       ┌─────────────────────────────────────────────────────┐
       │ backend/src/services/subgraphSync.service.js         │
       │  - poll 30s 1 query lấy: ConsentEvent, Delegation-   │
       │    Event, DelegationAccessGrant, TrustedContact-     │
       │    Event, Doctor(verifiedAt)                         │
       │  - cursor lưu trong EventSyncState (theo timestamp)  │
       │  - gọi LẠI handler của consentLedgerSync để có cùng  │
       │    side-effect: ghi DB + socket emit + push          │
       └──────────────┬──────────────────────────────────────┘
                      ▼
       ┌─────────────────────────────────────────────────────┐
       │ Postgres cache: Consent, Delegation,                 │
       │ DelegationAccessLog, TrustedContact, KeyShare ...    │
       └─────────────────────────────────────────────────────┘
                      │ (chỉ để LIỆT KÊ / hiển thị)
                      ▼
       ┌─────────────────────────────────────────────────────┐
       │ Mobile app (REST) + Socket.io realtime               │
       │ Quyết định CHO PHÉP đọc → vẫn gọi canAccess on-chain │
       └─────────────────────────────────────────────────────┘
```

### 2.1 Worker nào thực sự chạy?

| Worker | File | Được gọi lúc boot? | Vai trò hiện tại |
|---|---|---|---|
| `startSubgraphSync` | `subgraphSync.service.js:319` | **CÓ** — `app.js:115` | Đường đồng bộ chính (qua GraphQL) |
| `startEventSync` (AccessControl) | `eventSync.service.js:704` | **KHÔNG** — import bị comment `app.js:32-39` | Code còn nhưng tắt; lý do: 429 storm |
| `startRecordRegistrySync` | `recordRegistrySync.service.js:590` | **KHÔNG** | Save-only API là đường ghi `RecordMetadata` chính |
| `startConsentLedgerSync` | `consentLedgerSync.service.js:953` | **KHÔNG** start trực tiếp | Nhưng **các handler của nó được tái dùng** bởi subgraphSync |

Điểm tinh tế quan trọng: `subgraphSync` **không tự viết logic ghi DB** — nó **import lại 7 handler** từ `consentLedgerSync.service.js` (`subgraphSync.service.js:24-32`; các handler được `export` ở `consentLedgerSync.service.js:994-1002`) rồi "nắn" dữ liệu GraphQL về đúng hình dạng `{ args, transactionHash }` mà handler mong đợi (các hàm `shapeConsentEvent`, `shapeDelegationEvent`... `subgraphSync.service.js:87-140`). Nhờ vậy đổi nguồn từ RPC sang subgraph mà **không phải viết lại logic cache + socket + push**.

---

## 3. Cách worker RPC cũ hoạt động (vẫn nên hiểu để bảo vệ — reorg-safe)

Dù runtime hiện dùng subgraph, ba file RPC worker vẫn là phần lõi để giải thích **kỹ thuật đồng bộ reorg-safe**. Cả 3 file có cấu trúc giống nhau.

### 3.1 EventSyncState — con trỏ "đã đồng bộ tới đâu"

```
model EventSyncState {
  id              String   @id @default(cuid())
  contractName    String   @unique   // "AccessControl", "RecordRegistry"...
  lastSyncedBlock BigInt   @default(0)
  lastBlockHash   String?  @db.VarChar(66) // dùng để phát hiện reorg
  updatedAt       DateTime @updatedAt
}
```
(`backend/prisma/schema.prisma:482-488`)

- Mỗi contract một dòng (vì `contractName` là `@unique`) — `getSyncState()` upsert dòng riêng cho từng worker (`eventSync.service.js:162-184`).
- `lastSyncedBlock`: block cuối đã xử lý → lần sau bắt đầu từ `lastSyncedBlock + 1` (`eventSync.service.js:555`).
- `lastBlockHash`: hash của block đó → dùng để **phát hiện reorg**.

### 3.2 Hai pha: catchup + realtime watch

Mỗi worker khi `start...()` làm 3 việc (vd `eventSync.service.js:704-721`):
1. `catchupLogs()` — quét bù từ `lastSyncedBlock+1` tới hiện tại (lúc boot, hoặc sau downtime).
2. `startRealtimeWatch()` — viem `watchContractEvent` poll định kỳ để bắt event mới gần real-time.
3. `setInterval(catchupLogs, 5 phút)` — quét bù lặp lại để vá khoảng trống realtime poll có thể bỏ sót.

### 3.3 Reorg-safe — ba lớp phòng vệ

**Reorg** = blockchain đổi nhánh, một số block "vừa xác nhận" bị thay thế → event trong các block đó có thể biến mất/đổi. Worker chống reorg như sau:

1. **Bỏ qua N block cuối (`REORG_SAFETY_BLOCKS = 5`):** chỉ xử lý tới `safeBlock = currentBlock - 5` (`eventSync.service.js:18,554`). Block càng sâu càng khó bị đảo, nên đợi 5 block xác nhận.
2. **So `lastBlockHash`:** trước khi quét tiếp, đọc lại block `lastSyncedBlock` trên chain; nếu hash **khác** hash đã lưu → đã có reorg → lùi con trỏ ~50 block và quét lại (`eventSync.service.js:582-598`).
3. **Idempotency khi xử lý lại:** các handler dùng `upsert` (vd `prisma.delegation.upsert` `consentLedgerSync.service.js:206`) hoặc bắt lỗi trùng `P2002` (vd `delegationAccessLog.create` `consentLedgerSync.service.js:384-398`) nên xử lý lại cùng event **không tạo dòng trùng**.

### 3.4 Quét theo chunk + chống 429 (rate-limit RPC free-tier)

```
fromBlock = lastSyncedBlock + 1
while chunkFrom <= safeBlock:
    chunkTo = min(chunkFrom + CHUNK_SIZE - 1, safeBlock)   # CHUNK_SIZE mặc định 10
    for mỗi event:
        logs = withRpcRetry(getLogs(address, event, chunkFrom..chunkTo))  # backoff 429
        for log in logs: processLog(...)
    updateSyncState(chunkTo, block.hash)   # lưu tiến độ + hash từng chunk
    sleep(CHUNK_DELAY_MS = 200ms)          # giãn tải tránh 300 CU/sec
```
(`eventSync.service.js:604-655`)

- `CHUNK_SIZE = 10` vì Alchemy free-tier giới hạn `eth_getLogs` 10 block/lần; chỉnh qua `RPC_LOGS_CHUNK_SIZE` (`eventSync.service.js:600-604`).
- `withRpcRetry` = backoff luỹ thừa khi gặp 429/network blip (`backend/src/utils/rpcRetry.js:56-77`). Nếu không có nó, một lần 429 sẽ **âm thầm mất chunk** vì `lastSyncedBlock` đã bị đẩy qua (`eventSync.service.js:617-629`).
- **Skip-ahead:** nếu khoảng cần bù quá lớn (`> RPC_CATCHUP_MAX_BLOCKS = 5000`), nhảy tới cửa sổ gần đây thay vì quét hàng trăm nghìn block (`eventSync.service.js:567-578`) — state cũ vẫn đúng on-chain, chỉ là không cache lại span đó.
- **Throttle realtime:** poll 15s thay vì mặc định 4s của viem, vì 16 watcher × 4s sẽ bão hoà free-tier (`eventSync.service.js:670-675`).

> Chính những con số này (16 filter × poll + 3 catchup loop đồng thời) gây "429 storm" ngày 2026-04-30 → lý do chuyển sang subgraph (`app.js:32-38`, `subgraphSync.service.js:1-18`).

### 3.5 Mỗi worker đồng bộ event gì → bảng nào

| Worker | Event nghe | Ghi/cập nhật bảng cache |
|---|---|---|
| `eventSync` (AccessControl) | `MemberAdded/Removed`, `DoctorVerified`, `VerificationRevoked`, `OrganizationCreated/StatusChanged/AdminChanged` | `Organization`, `OrganizationMember`, `VerificationRequest`; gọi `invalidateRoleCache` (`eventSync.service.js:22-30,201-521`) |
| `recordRegistrySync` | `RecordAdded`, `RecordUpdated`, `OwnershipTransferred` | `RecordMetadata` (hydrate từ `getRecord` on-chain) (`recordRegistrySync.service.js:30-40,282-431`) |
| `consentLedgerSync` | `ConsentGranted/Revoked`, `DelegationGranted/Revoked`, `AccessGrantedViaDelegation`, `TrustedContactSet/Revoked` | `Consent`, `Delegation`, `DelegationAccessLog`, `TrustedContact`, `KeyShare` (`consentLedgerSync.service.js:35-54,796-804`) |

Hai logic cache đáng nhớ để bảo vệ:
- **Cascade revoke khi thu hồi consent:** `handleConsentRevoked` không chỉ lật 1 dòng — nó (a) thu mọi version con của cùng `rootCidHash` (`collectDescendantCidHashes` `consentLedgerSync.service.js:424-442`), (b) **không** thu KeyShare của bác sĩ là `createdBy` (người tạo "đã biết" nội dung — `consentLedgerSync.service.js:505-521`), (c) cascade tới recipient nhận lại qua delegation (`consentLedgerSync.service.js:591-662`). **Tất cả chỉ là dọn cache cho UI sạch** — chặn thật vẫn do on-chain `canAccess`.
- **invalidateRoleCache:** khi `DoctorVerified`, role cache 10 phút (`ROLE_CACHE_TTL_MS` `blockchain.js:146`) bị xoá ngay để bác sĩ vừa verify không bị chặn `DOCTOR_NOT_VERIFIED` cả phút (`eventSync.service.js:326-330`).

---

## 4. Đường đồng bộ hiện tại: Subgraph → backend

### 4.1 Một query GraphQL thay 16 watcher

`subgraphSync.syncOnce()` poll mỗi `SUBGRAPH_POLL_MS = 30s` (`subgraphSync.service.js:36,329-331`), gửi **một** query lấy 5 nhóm entity (`subgraphSync.service.js:144-193`):

| Entity query | Lọc theo | → Handler tái dùng |
|---|---|---|
| `consentEvents` | `timestamp_gt: $sinceConsent` | `handleConsentGranted` / `handleConsentRevoked` theo `kind` |
| `delegationEvents` | `timestamp_gt: $sinceDelegation` | `handleDelegationGranted` / `handleDelegationRevoked` |
| `delegationAccessGrants` | `timestamp_gt` | `handleAccessGrantedViaDelegation` |
| `trustedContactEvents` | `timestamp_gt` | `handleTrustedContactSet` / `handleTrustedContactRevoked` |
| `doctors` | `verifiedAt_gt, verified: true` | `invalidateRoleCache(address)` |

### 4.2 Cursor theo timestamp (tái dùng bảng EventSyncState)

Khác RPC (con trỏ là block number), subgraphSync dùng **timestamp giây** làm con trỏ, vẫn nhét vào cột `lastSyncedBlock` (cùng kiểu `BigInt`, chỉ khác ngữ nghĩa) với `contractName` là khoá chuỗi riêng cho từng loại, vd `"subgraph:consentEvent:lastTimestamp"` (`subgraphSync.service.js:40-72`). Sau khi xử lý xong một dòng mới advance cursor; **gặp lỗi thì `break`, KHÔNG advance** → cycle sau retry (`subgraphSync.service.js:243-248`). Mỗi nhóm fetch tối đa `first: 200`, sắp `orderBy: timestamp asc` để xử lý đúng thứ tự thời gian (`subgraphSync.service.js:152-157`).

### 4.3 Strict mode — không fallback RPC

Nếu subgraph lỗi/không tới được: `subgraphClient.gql` ném lỗi (`subgraphClient.service.js:29-58`); `syncOnce` log + bỏ qua cycle, **không** rơi về RPC (`subgraphSync.service.js:213-217`). Cố ý: chính việc chạy song song subgraph + RPC mới gây 429 storm (`subgraphClient.service.js:7-10`).

### 4.4 Luồng một sự kiện end-to-end (ví dụ: bệnh nhân cấp consent)

```
[Mobile] RecordDetailScreen handleShare  (UI: chọn shareType, nhấn "Chia sẻ")
   │  ký EIP-712 ConsentPermit (ví bệnh nhân)
   ▼
[Backend] /api/relayer sponsorGrantConsent  → relayer (SPONSOR) trả gas, gửi tx
   ▼
[Contract] ConsentLedger ghi consent + emit ConsentGranted(patient,grantee,rootCidHash,...)
   ▼
[The Graph] mapping handleConsentGranted → lưu entity ConsentEvent{kind:"granted",...}
   │            (subgraph/src/consentLedger.ts:22-34)
   ▼  (≤30s sau)
[Backend] subgraphSync.syncOnce → query consentEvents(timestamp_gt cursor)
   │  → shapeConsentEvent(row) → handleConsentGranted(event)
   │      • upsert bảng Consent (cache)           (consentLedgerSync.service.js:464-483)
   │      • emitToUser(patient/grantee,'consentUpdated')  → Socket.io realtime
   ▼
[Mobile] nhận socket 'consentUpdated' → refetch danh sách (hiển thị nhanh)
   ▼
[Khi grantee thực sự mở hồ sơ] POST /api/key-share/:id/claim
   │  → checkConsent → ConsentLedger.canAccess on-chain   ← CỔNG QUYỀN THẬT
   │     (backend/src/config/blockchain.js:173-208)
   ▼  nếu true → trả encryptedPayload (chỉ recipient giải mã được bằng NaCl secret key)
```

**Ai trả gas:** với consent của bệnh nhân, relayer (SPONSOR) trả gas theo cơ chế sponsor (chi tiết ở tài liệu gas-sponsorship; ở đây chỉ cần biết tx tạo event là của contract). **Dữ liệu gì mã hoá:** on-chain chỉ có `rootCidHash` + metadata + `encKeyHash` (hash); payload thật (`{cid, aesKey}`) nằm trong KeyShare, mã hoá bằng public key recipient — backend là "hòm thư mù". **Subgraph/DB chỉ thấy địa chỉ + hash + timestamp**, không thấy nội dung hồ sơ.

---

## 5. Subgraph index gì (entity)

Khai báo ở `subgraph/subgraph.yaml` (4 dataSources) + `subgraph/schema.graphql`:

| dataSource (contract) | Event → handler | Entity sinh ra |
|---|---|---|
| `RecordRegistry` (`subgraph.yaml:7-30`) | `RecordAdded`, `RecordUpdated` | `Record`, `RecordUpdate`, `Patient` |
| `EHRSystem` (`subgraph.yaml:32-56`) | `AccessRequested`, `RequestCompleted`, `RequestRejected` | `AccessRequest`, `Patient` |
| `ConsentLedger` (`subgraph.yaml:58-92`) | `ConsentGranted/Revoked`, `DelegationGranted/Revoked`, `AccessGrantedViaDelegation`, `TrustedContactSet/Revoked` | `ConsentEvent`, `DelegationEvent`, `DelegationAccessGrant`, `TrustedContactEvent` |
| `AccessControl` (`subgraph.yaml:94-120`) | `DoctorVerified`, `VerificationRevoked`, `OrganizationCreated`, `OrganizationStatusChanged` | `Doctor`, `Organization` |

### Vì sao chỉ 4 dataSource dù có 5 contract?

Contract thứ 5 — **DoctorUpdate** — **không** được index, vì nó là **facade mỏng**: `addRecordByDoctor` của nó gọi thẳng sang `RecordRegistry.addRecordByDoctor` (`contracts/src/DoctorUpdate.sol:94`). Nghĩa là hồ sơ do bác sĩ tạo vẫn phát sự kiện `RecordAdded` từ **RecordRegistry** — vốn đã được index ở dataSource RecordRegistry. DoctorUpdate có phát thêm event riêng (`RecordAddedByDoctor`, `TemporaryAccessGranted` — `DoctorUpdate.sol:29,38`) nhưng đó là event **phụ/trùng lặp**; trạng thái hồ sơ mới đã nằm trong `RecordAdded`. → Index thêm DoctorUpdate là thừa, nên subgraph chỉ cần 4 dataSource. (Câu trả lời sẵn nếu hội đồng hỏi "5 contract sao chỉ index 4?".)

Đặc điểm thiết kế quan trọng (bảo vệ trước hội đồng về **riêng tư**):
- Schema ghi rõ "**NEVER store plaintext CIDs / payloads — only on-chain bytes32 hashes**" (`schema.graphql:1-2`). Mọi field nhạy cảm là `Bytes` (hash), không có CID plaintext, không có nội dung FHIR.
- `id` của các event entity = `txHash + "-" + logIndex` (`subgraph/src/consentLedger.ts:18-20`) → **idempotent**: cùng một log không bao giờ tạo entity trùng dù index lại.
- Entity `immutable: true` cho các event log (vd `ConsentEvent` `schema.graphql:85`) — append-only, đúng tính chất audit trail.
- `Record.updates` dùng `@derivedFrom` (`schema.graphql:13-14`) để dựng chuỗi version mà không phải ghi quan hệ hai chiều.

---

## 6. Mobile / backend query lịch sử qua subgraph thế nào

### 6.1 Mobile — `mobile/src/services/subgraph.service.js`
Một GraphQL client mỏng (chỉ `fetch` + POST, không Apollo) đọc `EXPO_PUBLIC_SUBGRAPH_URL` (`subgraph.service.js:8-32`). Cung cấp các helper:
- `fetchPatientRecords(patientAddress)` — list hồ sơ của một bệnh nhân kèm `cidHash`, `parentCidHash`, `createdAt`, `createdTxHash` (`subgraph.service.js:36-54`).
- `fetchAccessRequestAudit(patientAddress)` — lịch sử yêu cầu truy cập (requester, reqType, status, mốc thời gian, txHash) (`subgraph.service.js:56-78`).
- `fetchVerifiedDoctors()` — danh sách bác sĩ đã verify (`subgraph.service.js:80-94`).

> ⚠️ Trạng thái hiện tại: module này **đã viết nhưng chưa được màn hình nào import** (Grep `from ... subgraph.service` trong `mobile/` không match; chỉ `DoctorDashboardScreen.tsx` *nhắc tới* "subgraph" trong comment về độ trễ index, không import — `DoctorDashboardScreen.tsx:132-135`). Đầu file cũng ghi rõ: nếu URL chưa set thì caller nên fallback về backend REST (`subgraph.service.js:5-6`). Tức mobile hiện chủ yếu đọc lịch sử qua **REST backend** (đọc từ DB cache), subgraph là đường dự phòng/đã sẵn sàng.

### 6.2 Backend — `subgraphClient.service.js`
Client GraphQL mỏng tương tự cho phía server, đọc `SUBGRAPH_URL` (`subgraphClient.service.js:16-58`). Đây là transport cho `subgraphSync` (mục 4). Backend dùng subgraph để **đồng bộ event vào cache**, rồi mobile đọc cache đó qua REST.

---

## 7. Tóm tắt để trả lời hội đồng

- **"Cache có làm hệ thống kém an toàn không?"** → Không. Cache chỉ phục vụ *hiển thị*. Cổng truy cập thật là `ConsentLedger.canAccess` gọi on-chain mỗi lần claim (`blockchain.js:173-208`). Cache lỗi thời chỉ gây "hàng ma" rồi bị on-chain từ chối.
- **"Reorg thì sao?"** → Đợi 5 block (`REORG_SAFETY_BLOCKS`), so `lastBlockHash`, lùi 50 block quét lại nếu lệch, handler idempotent (`upsert`/bắt P2002).
- **"Vì sao dùng The Graph?"** → 1 query GraphQL thay 16 watcher RPC → hết 429 storm, không tốn quota RPC, dữ liệu đã sort/filter/paginate.
- **"Subgraph có lộ dữ liệu y tế không?"** → Không. Chỉ index `bytes32` hash + địa chỉ + timestamp; không có CID plaintext, không có nội dung FHIR (`schema.graphql:1-2`).

---

## Nguồn đã đọc

- `backend/src/services/eventSync.service.js`
- `backend/src/services/recordRegistrySync.service.js`
- `backend/src/services/consentLedgerSync.service.js`
- `backend/src/services/subgraphSync.service.js`
- `backend/src/services/subgraphClient.service.js`
- `backend/src/utils/rpcRetry.js`
- `backend/src/config/blockchain.js` (checkConsent / canAccess / ROLE_CACHE_TTL_MS / invalidateRoleCache)
- `backend/src/app.js` (worker nào được start)
- `backend/prisma/schema.prisma` (model EventSyncState)
- `subgraph/subgraph.yaml`
- `subgraph/schema.graphql`
- `subgraph/src/consentLedger.ts` (mapping mẫu)
- `mobile/src/services/subgraph.service.js`
- `mobile/src/screens/doctor/DoctorDashboardScreen.tsx` (xác minh subgraph chỉ nhắc trong comment, không import)
