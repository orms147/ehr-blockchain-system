# Chức năng — Uỷ quyền (delegation chain)

## Tóm tắt 30 giây

Uỷ quyền (delegation) là cơ chế cho phép **bệnh nhân trao toàn bộ quyền đọc/quản lý TẤT CẢ hồ sơ** của mình cho một bác sĩ — khác hẳn với chia sẻ từng hồ sơ một. Đây là "quyền cao nhất bệnh nhân có thể cấp" (chữ trong UI: `mobile/src/screens-v2/DelegationScreen.tsx:1030`). Bệnh nhân ký một chữ ký EIP-712 (`DelegationPermit`), backend relay lên contract (miễn phí gas cho bệnh nhân). Bác sĩ nhận quyền (nếu được phép) có thể **uỷ quyền tiếp** cho bác sĩ khác → tạo thành một **CHAIN** (chuỗi) nhiều tầng. Toàn bộ chuỗi gắn với nhau bằng **parent pointer** + **epoch counter**: khi một mắt xích bị thu hồi, mọi nhánh phía dưới tự động mất quyền (cascade revoke) nhờ logic trong `canAccess` (`contracts/src/ConsentLedger.sol:740-763`).

Phân biệt nhanh hai khái niệm dễ nhầm:

| | **Delegation (uỷ quyền BULK)** | **Record-delegation (`allowDelegate` của 1 hồ sơ)** |
|---|---|---|
| Phạm vi | TOÀN BỘ hồ sơ của bệnh nhân (hiện tại + tương lai) | CHỈ 1 chuỗi hồ sơ (1 record + các version) |
| Storage on-chain | `_delegations[patient][delegatee]` (packed uint256) | `_consents[key]` với cờ `allowDelegate=true` |
| Ai cấp | Bệnh nhân ký `DelegationPermit` | Bệnh nhân khi share record chọn `read-delegate` |
| Bác sĩ dùng để re-share | `grantUsingDelegation(...)` | `grantUsingRecordDelegation(...)` |
| Màn hình mobile | `DelegationScreen` / `DoctorDelegatedPatientsScreen` | `DoctorDelegatableRecordsScreen` |

---

## 1. Khái niệm nền (cho người chưa rành backend/mobile)

Trước khi đi vào luồng, cần nắm 4 khái niệm:

- **EIP-712 signature**: bệnh nhân không gửi giao dịch trực tiếp. Họ **ký một thông điệp có cấu trúc** (typed data) bằng ví của mình. Chữ ký này chứng minh "đúng là bệnh nhân đồng ý", và bất kỳ ai (ở đây là backend) cũng có thể đem chữ ký lên contract để thực thi thay. Đây là cơ sở của **gas sponsorship** (backend trả gas hộ). TypeHash của permit uỷ quyền: `contracts/src/ConsentLedger.sol:29-31`.
- **Relayer / sponsor**: backend có một ví "sponsor" trả gas hộ bệnh nhân. Bệnh nhân được cấp ~100 lượt ký miễn phí/tháng. Khi hết quota, mobile tự động fallback cho bệnh nhân **tự trả gas** bằng cùng chữ ký đó (`mobile/src/services/delegation.service.js:97-112`).
- **DB cache (Postgres/Prisma)**: backend KHÔNG phải nguồn chân lý về quyền. Mọi quyền thật nằm on-chain. Backend chỉ lưu một bản **cache** (bảng `Delegation`) để UI hiển thị nhanh, được đồng bộ từ event chain (`backend/prisma/schema.prisma:380-408`).
- **NaCl box + AES key**: nội dung hồ sơ là FHIR bundle mã hoá AES-GCM trên IPFS. "Chia sẻ quyền đọc" thực chất gồm 2 việc: (a) cấp quyền on-chain, (b) **mã hoá khoá AES** bằng public key của người nhận (NaCl box) rồi đẩy lên backend làm "hộp thư mù" (KeyShare). Có quyền on-chain mà không có KeyShare → thấy quyền nhưng KHÔNG đọc được nội dung.

---

## 2. Topology CHAIN — parent pointer + epoch

Một delegation BULK được lưu **packed** trong một `uint256`:

```
_delegations[patient][delegatee] = expiresAt(uint40) | allowSubDelegate<<40 | active<<41
```

Nguồn: `contracts/src/ConsentLedger.sol:46`, `:122-125`, `:449-454`.

Hai mapping phụ tạo nên cấu trúc CHAIN:

- `delegationParent[patient][delegatee]` — con trỏ tới **cha** đã uỷ quyền cho mình. `address(0)` = nhánh trực tiếp từ bệnh nhân (gốc chuỗi). Nguồn: `contracts/src/ConsentLedger.sol:64`, `:521`.
- `delegationEpoch[patient][delegator]` — bộ đếm "thế hệ". Mỗi lần `revokeDelegation`/`revokeSubDelegation` nhắm vào `delegator` thì epoch +1 (`contracts/src/ConsentLedger.sol:481`, `:545`). Mọi artifact tạo ra phía dưới đều **snapshot** epoch lúc tạo; khi `canAccess` đi walk mà thấy epoch không khớp → biết một tổ tiên đã bị thu hồi → chuỗi đứt.

Hai snapshot dùng để phát hiện đứt chuỗi:

- `delegationParentEpochAtCreate[patient][subDelegatee]` — epoch của CHA tại thời điểm sub-delegation được tạo (`contracts/src/ConsentLedger.sol:74`, `:522`).
- `consentDelegatorEpochAtGrant[consentKey]` — epoch của delegator tại thời điểm họ gọi `grantUsingDelegation` (`contracts/src/ConsentLedger.sol:78`, `:603`).

Sơ đồ một CHAIN 3 tầng:

```
   Bệnh nhân P
       │  delegateAuthorityBySig (allowSubDelegate=true)
       ▼
   Bác sĩ A   parent = 0          epoch[P][A]=0      (chainDepth=1, "Trực tiếp")
       │  subDelegate (allowFurther=true)
       ▼
   Bác sĩ B   parent = A          parentEpochAtCreate = epoch[P][A]   (chainDepth=2, "↻ Cấp 2")
       │  subDelegate
       ▼
   Bác sĩ C   parent = B          parentEpochAtCreate = epoch[P][B]   (chainDepth=3)

Nếu P thu hồi A → epoch[P][A]++ → khi canAccess walk từ C lên:
   C.parent=B (ok) → kiểm epoch[P][B] vs B.parentEpochAtCreate (ok)
   → B.parent=A → kiểm epoch[P][A] vs B.parentEpochAtCreate ⇒ KHÔNG KHỚP ⇒ false
   ⇒ cả B lẫn C mất quyền (cascade), dù record của họ vẫn "active" trong _delegations.
```

---

## 3. Các hàm contract liên quan (sơ bộ — người đọc rành Solidity)

Tất cả ở `contracts/src/ConsentLedger.sol`.

| Hàm | Dòng | Ai gọi (`msg.sender`) | Vai trò |
|---|---|---|---|
| `delegateAuthorityBySig(patient, delegatee, duration, allowSubDelegate, deadline, signature)` | `:397-431` | relayer (hoặc bệnh nhân tự pay) | Verify chữ ký EIP-712 của bệnh nhân → `_grantDelegation`. ROOT của chuỗi. Tăng `nonces[patient]`. |
| `grantDelegation(delegatee, duration, allowSubDelegate)` | `:380-386` | bệnh nhân trực tiếp | Bản không-chữ-ký (bệnh nhân tự gọi, tự trả gas). |
| `grantDelegationInternal(...)` | `:388-395` | contract được authorize | Dùng bởi `EHRSystemSecure` (FullDelegation request type). |
| `_grantDelegation(patient, delegatee, duration, allowSubDelegate)` | `:433-466` | internal | Pack `expiresAt|allowSub|active`; clear `delegationParent` về 0 (vì grant trực tiếp = gốc). MIN 1 ngày, MAX 5 năm (`:118-120`, `:440-442`). |
| `subDelegate(patient, newDelegatee, duration, allowSubDelegate)` | `:493-525` | delegatee/sub-delegatee | Yêu cầu `msg.sender` đang giữ delegation active + `allowSubDelegate=true`. Cắt expiry ≤ expiry của cha (`:508-514`). Ghi `delegationParent = msg.sender` + snapshot epoch cha. |
| `revokeDelegation(delegatee)` | `:468-484` | bệnh nhân | Tắt bit active + **bump epoch** của delegatee → cascade. KHÔNG có biến thể BySig → bệnh nhân tự trả gas. |
| `revokeSubDelegation(patient, subDelegatee)` | `:534-548` | đúng cha đã tạo sub | Chỉ cha trực tiếp được gọi (`:539`). Tắt active + bump epoch của sub. |
| `grantUsingDelegation(patient, newGrantee, inputCidHash, encKeyHash, expireAt, allowDelegate)` | `:563-606` | delegatee/sub-delegatee | Dùng quyền BULK để cấp 1 consent cho người thứ 3. Cắt expiry ≤ expiry delegation (`:582-585`). Ghi `consentDelegationSource` + snapshot epoch → cho phép cascade. Emit `AccessGrantedViaDelegation`. |
| `canAccess(patient, grantee, queryCidHash)` | `:679-706` | view (ai cũng đọc) | Quyết định cuối cùng. Walk record-tree về root, check verified-doctor, rồi `_hasValidNormalConsent`. |
| `_hasValidNormalConsent(key, _, patient, root)` | `:711-766` | internal view | Check consent active/unexpired + walk chuỗi delegation (MAX 8 hop) kiểm epoch từng mắt. |

### 3.1 `canAccess` walk — MAX 8 hops

`MAX_DELEGATION_WALK = 8` (`contracts/src/ConsentLedger.sol:130`). Trong `_hasValidNormalConsent`, nếu consent này có nguồn từ delegation BULK (`consentDelegationSource[key] != address(0)`):

1. Kiểm `delegationEpoch[patient][delegator] == consentDelegatorEpochAtGrant[key]` — nếu lệch → delegator đã bị thu hồi → `false` (`:742-744`).
2. Bắt đầu từ `delegator`, lặp tối đa 8 hop (`:747-761`):
   - Mắt hiện tại phải active (`:749`) và chưa hết hạn (`:751`).
   - Lấy `parent = delegationParent[patient][cur]`. Nếu `parent == 0` → đã tới gốc (bệnh nhân) → `true` (`:753-755`).
   - Nếu epoch của cha không khớp snapshot → `false` (`:757`).
   - Đi lên: `cur = parent`.
3. Quá 8 hop → `false` (fail-safe chống OOG, `:762`).

Đây là cơ chế **cascade revoke**: thu hồi 1 mắt làm vô hiệu mọi nhánh phía dưới mà không cần ghi lại từng dòng.

> Lưu ý quan trọng (khác biệt): record-delegation (per-record) KHÔNG đi qua nhánh epoch-walk này. Nó dùng `recordDelegationSource[key]` và chỉ kiểm consent của doctor-nguồn còn active/unexpired/`allowDelegate` (`contracts/src/ConsentLedger.sol:727-734`). Đây là cascade 1 tầng, không phải multi-hop chain.

---

## 4. Luồng end-to-end #1 — Bệnh nhân uỷ quyền cho bác sĩ (ROOT grant)

**UI**: `DelegationScreen` → nút "+ Uỷ quyền cho một bác sĩ mới" mở `GrantAuthorityModal` (`mobile/src/screens-v2/DelegationScreen.tsx:452-714`). Bệnh nhân nhập: địa chỉ ví bác sĩ (có QR scan), số ngày (1–1825), switch "Cho phép uỷ quyền tiếp" (`allowSubDelegate`), ghi chú phạm vi lâm sàng (tuỳ chọn, off-chain).

```
[DelegationScreen / GrantAuthorityModal]
        │  handleGrant → useGrantAuthority (TanStack)
        ▼
[delegation.service.js  grantAuthority]                       (mobile/src/services/delegation.service.js:56)
   1. GET /api/relayer/grant-context?grantee=...  → lấy nonce + check isDoctor   (:74-77)
   2. signDelegationPermit(...) — ký EIP-712, gate vân tay                        (:82-89 → eip712.js:135)
   3. withSelfPayFallback:
        ├─ POST /api/relayer/delegate-authority (relayer trả gas)                (:98-105)
        └─ fallback: tự gọi delegateAuthorityBySig nếu hết quota                 (:106-111)
        ▼
[backend POST /api/relayer/delegate-authority]                (backend/src/routes/relayer.routes.js:285)
   → relayerService.sponsorDelegateAuthority(...)
        ▼
[relayer.service.js  sponsorDelegateAuthority]               (backend/src/services/relayer.service.js:546)
   - consumeQuota(patient,'delegate')                                            (:559)
   - simulate + sponsorWrite delegateAuthorityBySig                              (:563-577)
   - waitForTransactionReceipt                                                   (:584)
   - bumpSignatureCounter(patient)  (tính 1/100 lượt ký)                         (:589)
   - prisma.delegation.upsert(... chainDepth=1, parentDelegator=null ...)        (:598-631)
        ▼
[ConsentLedger.delegateAuthorityBySig]                       (contracts/src/ConsentLedger.sol:397)
   - verify chữ ký == patient, tăng nonce, _grantDelegation
   - emit DelegationGranted(patient, delegatee, expiresAt, allowSubDelegate)     (:465)
        ▼
[consentLedgerSync.service.js handleDelegationGranted]       (backend đồng bộ event → cache)
   - resolveChainPosition → chainDepth/parentDelegator (walk ≤8)                 (:124-172, :186)
   - upsert Delegation row (idempotent trên @@unique)
```

**Kết quả trả về**: `{ txHash, selfPaid }`. UI hiện Alert "Đã uỷ quyền" (`DelegationScreen.tsx:941-944`).

**Ai trả gas**: relayer (sponsor) — trừ 1/100 lượt ký của bệnh nhân; nếu hết quota thì bệnh nhân tự trả.
**Dữ liệu mã hoá**: bước ROOT này KHÔNG đụng tới khoá AES/KeyShare — chỉ thiết lập quyền on-chain. Việc cấp khoá đọc thực sự xảy ra ở luồng #3 (khi bác sĩ re-share từng hồ sơ).
**Ai đọc được gì**: sau khi có delegation, bác sĩ "có quyền" on-chain với mọi record của bệnh nhân, nhưng vẫn cần KeyShare để giải mã nội dung từng record.

> Gia hạn (Extend) tái sử dụng đúng luồng grant với `durationDays = remaining + thêm` (clamp 1825), `DelegationScreen.tsx:956-969`. Không có hàm extend riêng — chỉ re-grant.

---

## 5. Luồng end-to-end #2 — Bác sĩ uỷ quyền TIẾP (sub-delegation, mở rộng CHAIN)

Chỉ khả dụng khi bệnh nhân bật `allowSubDelegate` lúc cấp gốc. Doctor mở `DoctorDelegatedPatientsScreen`, chọn bệnh nhân, nếu `patient.allowSubDelegate` thì hiện nút "Uỷ quyền tiếp cho bác sĩ khác" → `SubDelegateModal` (`mobile/src/screens-v2/doctor/DoctorDelegatedPatientsScreen.tsx:747-758`, `:392-651`).

```
[SubDelegateModal handleSubmit]   (DoctorDelegatedPatientsScreen.tsx:426)
   - chọn "Toàn bộ (còn lại)" hoặc số ngày; switch "Cho phép uỷ quyền tiếp tầng 3" (allowFurther)
        ▼
[delegation.service.js subDelegate]   (mobile/src/services/delegation.service.js:165)
   - simulateContract subDelegate(patient, subDelegatee, duration, allowFurther)
   - gateOrThrow (vân tay) → walletClient.writeContract  (DOCTOR TỰ TRẢ GAS)
        ▼
[ConsentLedger.subDelegate]   (contracts/src/ConsentLedger.sol:493)
   - require msg.sender đang active + allowSubDelegate=true (:502-506)
   - expiry cắt ≤ expiry cha (:508-514)
   - delegationParent[patient][newDelegatee] = msg.sender (:521)
   - parentEpochAtCreate = delegationEpoch[patient][msg.sender] (:522)
   - emit DelegationGranted(...)
        ▼
[consentLedgerSync handleDelegationGranted] → chainDepth tăng, parentDelegator set
```

**Ai trả gas**: BÁC SĨ tự trả (không sponsor) — vì `msg.sender` phải đúng là ví bác sĩ cha để contract check `allowSubDelegate`. Đây là đặc điểm chung của các action doctor (CLAUDE.md §6).
**UI hiển thị chuỗi**: `DoctorDelegatedPatientsScreen` phân biệt `chainDepth === 1` ("Trực tiếp", chấm jade) vs `chainDepth > 1` (pill "↻ Cấp N") tại `:893`, `:922-951`.

---

## 6. Luồng end-to-end #3 — Bác sĩ dùng delegation để re-share 1 hồ sơ (`grantUsingDelegation`)

Đây là nơi delegation BULK biến thành quyền đọc THẬT cho người thứ 3. Doctor mở `DoctorDelegatedPatientsScreen` → chọn bệnh nhân → drawer liệt kê record (`recordService.getDelegatedPatientRecords` → `GET /api/records/delegated/:patientAddress`, `mobile/src/services/record.service.js:87-88`) → chọn record → `ShareRecordModal`.

3 pre-check trước khi cấp (`DoctorDelegatedPatientsScreen.tsx:114-206`):
1. **Khoá local**: doctor phải có `{cid, aesKey}` của record trong local store, nếu không không thể mã hoá lại (`:130-138`).
2. **Public key người nhận**: người nhận phải đã đăng ký khoá mã hoá NaCl (`:140-152`).
3. **Cảnh báo bác sĩ chưa verify** + **canAccess overwrite guard** (đọc trực tiếp `canAccess` on-chain để cảnh báo nếu người nhận đã có quyền — tránh ghi đè, `:175-206`).

```
[ShareRecordModal handleSubmit]   (DoctorDelegatedPatientsScreen.tsx:114)
   - encKeyHash = computeEncKeyHash(local.aesKey)                                (:208)
   - delegationService.grantUsingDelegation({patient,newGrantee,rootCidHash,
        encKeyHash, expireAtSeconds, allowDelegate:false})                      (:209-216)
        ▼
   [ConsentLedger.grantUsingDelegation]  (contracts/src/ConsentLedger.sol:563)
      - require delegation của msg.sender active + chưa hết hạn (:573-576)
      - cắt expiry ≤ delegation expiry (:582-585)
      - _grantConsent(...) tạo consent cho newGrantee
      - consentDelegationSource[ck]=msg.sender; epochAtGrant snapshot (:602-603)
      - emit AccessGrantedViaDelegation (:605)
        ▼
   - tạo KeyShare: NaCl seal {cid, aesKey} cho người nhận, POST shareKey         (:218-230)
```

**Kết quả**: người nhận có quyền on-chain + có KeyShare → đọc được ngay. Nếu KeyShare lỗi nhưng tx đã thành công → cảnh báo "thấy quyền nhưng không đọc được" (`:231-239`).
**Ai trả gas**: bác sĩ tự trả (`msg.sender` phải là delegatee). **Backend đồng bộ** `AccessGrantedViaDelegation` → bảng `DelegationAccessLog` (`backend/prisma/schema.prisma:413-427`) → bệnh nhân/bác sĩ xem audit qua `GET /api/delegation/access-logs` (`backend/src/routes/delegation.routes.js:101-124`).

---

## 7. So sánh với record-delegation (`allowDelegate` của 1 hồ sơ) — `DoctorDelegatableRecordsScreen`

Để tránh nhầm: màn `DoctorDelegatableRecordsScreen` KHÔNG dùng delegation BULK. Nó liệt kê các hồ sơ mà bệnh nhân đã share cho doctor với cờ `allowDelegate=true` (`GET /api/key-share/delegatable`, `mobile/src/services/keyShare.service.js:32-33`), rồi re-share bằng `consentService.delegateOnChain` → contract `grantUsingRecordDelegation` (`mobile/src/screens-v2/doctor/DoctorDelegatableRecordsScreen.tsx:104-110`).

Khác biệt cốt lõi:

| Tiêu chí | `grantUsingDelegation` (BULK) | `grantUsingRecordDelegation` (per-record) |
|---|---|---|
| Điều kiện msg.sender | Đang giữ delegation BULK active (`ConsentLedger.sol:571-576`) | Đang giữ consent của CHÍNH record đó với `allowDelegate=true` (`:628-632`) |
| Người nhận có re-share tiếp? | Theo `allowDelegate` param (UI mobile để `false`) | KHÔNG — hardcode `allowDelegate=false` (1-hop limit, `:651`) |
| Cascade khi nguồn bị thu hồi | Multi-hop epoch walk ≤8 (`:740-763`) | 1-hop qua `recordDelegationSource` (`:727-734`) |
| Phạm vi | Mọi record của bệnh nhân | Chỉ chuỗi record này |
| Cascade version | (không liên quan — quyền cấp theo record cụ thể) | Re-share enumerate các version khác trong chain (`DoctorDelegatableRecordsScreen.tsx:133-159`) |

---

## 8. Backend — chỉ là PROJECTION (read-only)

`backend/src/routes/delegation.routes.js` **không có mutation nào** — header file ghi rõ mọi thay đổi đi qua relayer hoặc contract trực tiếp (`:1-11`). Các endpoint read:

| Endpoint | Dòng | Trả về |
|---|---|---|
| `GET /api/delegation/my-delegates` | `:30` | Bệnh nhân: tôi đã uỷ quyền cho ai (mọi status) |
| `GET /api/delegation/delegated-to-me` | `:50` | Bác sĩ: ai uỷ quyền cho tôi (status=active, cả direct lẫn sub) |
| `GET /api/delegation/check/:patientAddress` | `:73` | Doctor UI check trước khi `grantUsingDelegation` |
| `GET /api/delegation/access-logs?role=` | `:101` | Audit `grantUsingDelegation`; `role=patient` → `patientAddress=me`, `role=delegatee` → `byDelegatee=me` |

Bảng cache `Delegation` được `consentLedgerSync.service.js` upsert từ event `DelegationGranted`/`DelegationRevoked`; `chainDepth`/`parentDelegator` tính bằng cách walk chuỗi ≤8 hop (`backend/src/services/consentLedgerSync.service.js:124-172`). `revoke` đã được on-chain bump epoch trước, backend chỉ mark `status` các row downstream (`:281-350`).

---

## 9. Bảng tổng kết "ai trả gas / ai đọc được gì"

| Hành động | Hàm contract | Gas | Dữ liệu mã hoá / KeyShare |
|---|---|---|---|
| Bệnh nhân cấp delegation gốc | `delegateAuthorityBySig` | Sponsor (1/100 lượt ký) hoặc tự pay | Không tạo KeyShare ở bước này |
| Bệnh nhân thu hồi delegation | `revokeDelegation` | **Bệnh nhân tự trả** (không có BySig) | — |
| Bác sĩ uỷ quyền tiếp | `subDelegate` | **Bác sĩ tự trả** | — |
| Bác sĩ thu hồi sub | `revokeSubDelegation` | Bác sĩ (cha) tự trả | — |
| Bác sĩ re-share 1 record qua BULK | `grantUsingDelegation` | **Bác sĩ tự trả** | Tạo KeyShare (NaCl box {cid, aesKey}) cho người nhận |

**Ai đọc nội dung**: chỉ người vừa **có quyền on-chain** (`canAccess=true`) vừa **có KeyShare** (giải được khoá AES bằng NaCl secret key của mình). Backend chỉ là "blind mailbox" giữ ciphertext + payload mã hoá, không đọc được.

---

## 10. Những điểm dễ bị hội đồng hỏi (đã verify trong code)

- **"Thu hồi 1 bác sĩ thì các uỷ quyền con có mất không?"** — Có. Epoch bump + walk trong `canAccess` (`ConsentLedger.sol:481`, `:740-763`). UI cảnh báo điều này (`DelegationScreen.tsx:1193`).
- **"Tại sao giới hạn 8 hop?"** — Chống out-of-gas trên chuỗi bệnh lý/giới thiệu sâu bất thường; 8 đã quá thực tế lâm sàng (`ConsentLedger.sol:127-130`).
- **"Sub-delegation có thể sống lâu hơn cha không?"** — Không, expiry bị cắt ≤ cha (`ConsentLedger.sol:508-514`); consent cấp qua delegation cũng cắt ≤ delegation (`:582-585`).
- **"Nonce có bị trùng giữa các loại permit?"** — Dùng chung `nonces[patient]` cho ConsentPermit, DelegationPermit, TrustedContactPermit → chống replay xuyên loại (`ConsentLedger.sol:33-39`, `eip712.js:37-38`).
- **"Bác sĩ chưa verify uỷ quyền cho người khác thì người đó đọc được không?"** — `canAccess` chặn mọi grantee là doctor chưa verified (`ConsentLedger.sol:699-703`); UI cũng cảnh báo trước khi share (`DoctorDelegatedPatientsScreen.tsx:155-172`).
- **"scopeNote (phạm vi lâm sàng) lưu ở đâu?"** — Off-chain, chỉ trong bảng `Delegation` (`schema.prisma:391`); nếu self-pay (không qua relayer) thì scopeNote KHÔNG được lưu (`delegation.service.js:92-96`).

---

## Nguồn đã đọc

- `contracts/src/ConsentLedger.sol` (toàn bộ — delegation chain, canAccess, epoch, typehash)
- `mobile/src/services/delegation.service.js`
- `mobile/src/screens-v2/DelegationScreen.tsx`
- `mobile/src/screens-v2/doctor/DoctorDelegatedPatientsScreen.tsx`
- `mobile/src/screens-v2/doctor/DoctorDelegatableRecordsScreen.tsx`
- `mobile/src/utils/eip712.js`
- `backend/src/routes/delegation.routes.js`
- `backend/src/routes/relayer.routes.js` (endpoint `/delegate-authority`)
- `backend/src/services/relayer.service.js` (`sponsorDelegateAuthority`)
- `backend/src/services/consentLedgerSync.service.js` (grep: handlers + chainDepth walk)
- `backend/prisma/schema.prisma` (model `Delegation` `:380-408`, `DelegationAccessLog` `:413-427`)
- `mobile/src/services/record.service.js` / `keyShare.service.js` (grep: `getDelegatedPatientRecords`, `getDelegatableRecords`)
