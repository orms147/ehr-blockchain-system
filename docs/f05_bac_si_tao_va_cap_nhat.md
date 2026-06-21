# Chức năng — Bác sĩ tạo / cập nhật hồ sơ cho bệnh nhân

## Tóm tắt 30 giây

Bác sĩ (role `DOCTOR`) có thể **ghi thẳng** một hồ sơ y tế mới cho bệnh nhân, hoặc **tạo phiên bản cập nhật** (child) nối tiếp một hồ sơ đã có — **không cần xin consent của bệnh nhân để GHI**. Đường ghi on-chain đi qua facade `DoctorUpdate.addRecordByDoctor(...)`, contract này gọi `RecordRegistry.addRecordByDoctor(...)` để lưu `bytes32 cidHash` (băm của CID, KHÔNG phải plaintext) cùng con trỏ `parentCidHash` tạo thành chuỗi version cha–con. Nội dung FHIR thật được mã hoá AES-GCM rồi đẩy lên IPFS (Pinata); khoá AES + CID được niêm phong bằng NaCl box cho từng người nhận (bệnh nhân, bản thân bác sĩ, các bác sĩ đang có quyền) và lưu ở backend dưới dạng `KeyShare`. **Bác sĩ tự trả gas** (không sponsor). Cờ `includeUpdates` chỉ gate quyền ĐỌC các version mới, **không gate GHI**. Việc một share là "chỉ đọc" (read-only) được phản ánh ở UI: hồ sơ đã hết hạn / bị thu hồi (`isInactive`) thì không hiện nút "Cập nhật version".

---

## 1. Khái niệm nền (cho người chưa biết backend/mobile/crypto)

Trước khi vào luồng, vài khái niệm xuất hiện liên tục:

| Khái niệm | Giải thích ngắn |
|---|---|
| **CID** | Content IDentifier — địa chỉ nội dung trên IPFS (giống "đường link" tới file). Plaintext CID KHÔNG bao giờ lên chain. |
| **cidHash** | `keccak256(bytes(cid))` — băm của CID. On-chain chỉ lưu cái này (xem `RecordRegistry.sol:11`). Ai có chain cũng không suy ngược ra CID. |
| **AES-GCM** | Mã hoá đối xứng (1 khoá vừa khoá vừa mở). Dùng để mã hoá nội dung FHIR bundle trước khi lên IPFS. |
| **NaCl box** | Mã hoá bất đối xứng (khoá công khai để niêm phong, khoá bí mật để mở). Dùng để niêm phong gói `{cid, aesKey}` cho riêng từng người nhận. |
| **KeyShare** | Một dòng trong DB backend chứa `encryptedPayload` = NaCl box của `{cid, aesKey}`. Backend là "blind mailbox" — giữ hộ nhưng KHÔNG mở được. |
| **RecordMetadata** | Bảng cache ở backend lưu tiêu đề/loại/parent... để hiển thị nhanh, không phải nguồn chân lý on-chain. |
| **facade** | Contract trung gian gom nhiều bước on-chain thành 1 hàm (ở đây là `DoctorUpdate`). |

---

## 2. Hai luồng trong cùng một màn hình

Màn hình mobile `DoctorCreateUpdateScreen` phục vụ **cả hai** trường hợp, phân biệt bằng có hay không `parentCidHash` truyền qua route (`screens-v2/doctor/DoctorCreateUpdateScreen.tsx:160-164`):

```
route.params.parentCidHash == null  →  isCreateNewRoot = true   (tạo hồ sơ GỐC mới)
route.params.parentCidHash != null  →  isCreateNewRoot = false  (tạo VERSION cập nhật)
```

- **Tạo gốc**: eyebrow "Bác sĩ ghi hồ sơ mới", `parentCidHash = ZERO_BYTES32` (`screens-v2/doctor/DoctorCreateUpdateScreen.tsx:77,164,598`).
- **Tạo version**: eyebrow "Bác sĩ cập nhật phiên bản", hiện "headboard" parent read-only (badge "Đang sửa v↑", tiêu đề + địa chỉ bệnh nhân), thêm ô textarea `versionNote` "Lý do tạo phiên bản mới" giới hạn 500 ký tự (`screens-v2/doctor/DoctorCreateUpdateScreen.tsx:598-694,1109-1147`). Loại hồ sơ bị khoá theo bản gốc ("Đã khoá theo bản gốc", `:800,811`).

Nút bắt đầu luồng "Cập nhật version →" nằm trên `SharedRecordCard` của dashboard bác sĩ → gọi `handleCreateUpdate` → điều hướng sang `DoctorCreateUpdate` kèm `parentCidHash` + `patientAddress` (`screens-v2/doctor/DoctorDashboardScreen.tsx:443-481,510-514`).

---

## 3. Sơ đồ luồng end-to-end (tạo / cập nhật)

```
┌──────────────────────────── MOBILE (app bác sĩ) ────────────────────────────┐
│ DoctorCreateUpdateScreen.handleSubmit()                                       │
│  (screens-v2/doctor/DoctorCreateUpdateScreen.tsx:265)                         │
│                                                                              │
│ 1. Validate form (địa chỉ BN, tiêu đề, đơn thuốc, vaccine...)  :266-303      │
│ 2. PRECHECK: bệnh nhân ĐÃ đăng ký NaCl pubkey chưa?            :309-322      │
│      authService.getEncryptionKey(patientAddress)                            │
│      ↳ chưa có → chặn (BN sẽ không giải mã được) → return                    │
│ 3. Gom payload FHIR (meta, diagnoses, prescriptions, vitals,                 │
│    image…) → generateAESKey() → encryptData(payload, aesKey)  :324-404       │
│ 4. ipfsService.uploadEncrypted(...) → trả về CID             :405-408        │
│ 5. cidHash = keccak256(toBytes(cid))                          :410-412       │
│    recordTypeHash, doctorEncKeyHash = keccak256(aesKey)                      │
│ 6. gateOrThrow('Để lưu hồ sơ…')  ← xác thực sinh trắc          :415          │
│ 7. walletClient.writeContract addRecordByDoctor(...)          :417-432  ─────┼──┐
│      args: [cidHash, parentCidHash, recordTypeHash,                          │  │
│             patientAddress, doctorEncKeyHash, 0]   (BÁC SĨ KÝ + TRẢ GAS)     │  │
└──────────────────────────────────────────────────────────────────────────────┘  │
                                                                                    │
                            ┌───────────── ON-CHAIN ─────────────────────────┐      │
                            │ DoctorUpdate.addRecordByDoctor                  │◄─────┘
                            │  (contracts/src/DoctorUpdate.sol:80)            │
                            │   • onlyDoctor + patient phải isPatient :87-91  │
                            │   • RecordRegistry.addRecordByDoctor(...) :94   │
                            │       → _addRecord: version = parent.ver+1,     │
                            │         push vào _parentChildren  (:150-191)    │
                            │   • Nếu là ROOT (parent==0) & có encKeyHash:    │
                            │       _grantDoctorAccess → ConsentLedger        │
                            │       .grantInternal(7d, allowDelegate=false)   │
                            │       (:99-113, :127-161)                       │
                            │   • emit RecordAddedByDoctor (:115-122)         │
                            └─────────────────────────────────────────────────┘
                                                                                    
┌──────────── MOBILE (sau khi có txHash) ────────────────────────────────────┐
│ 8. NaCl seal {cid, aesKey} cho BN + cho chính bác sĩ          :434-447       │
│ 9. recordService.saveOnly(...)  → POST /api/records/save-only :449-462  ─────┼──┐
│ 10. localRecordStore.setKey(cidHash → {cid,aesKey}) để giải mã local :464-478│  │
│ 11. (update mode) cascade KeyShare cho mọi recipient của parent :480-504     │  │
│ 12. invalidateQueries(doctor/sharedRecords, records/my, chain) :506-508      │  │
│ 13. clear draft + Alert "Đã tạo/cập nhật hồ sơ"               :511-526       │  │
└──────────────────────────────────────────────────────────────────────────────┘  │
                                                                                    │
                            ┌──────────── BACKEND (blind mailbox) ───────────┐      │
                            │ POST /api/records/save-only                    │◄─────┘
                            │  (backend/src/routes/record.routes.js:295)     │
                            │   • upsert RecordMetadata (CONFIRMED) :332-387 │
                            │   • KeyShare cho bác sĩ (status='claimed',     │
                            │       expiry kế thừa từ parent) :389-450       │
                            │   • KeyShare cho bệnh nhân (status='pending')  │
                            │       :458-483                                 │
                            │   • AccessLog 'CREATE_RECORD_BY_DOCTOR' :485   │
                            └─────────────────────────────────────────────────┘
```

---

## 4. Phần on-chain (sơ bộ từng hàm — người đọc rành Solidity)

### 4.1 `DoctorUpdate.addRecordByDoctor` — facade ghi cho bác sĩ

Chữ ký (`contracts/src/DoctorUpdate.sol:80-87`):

```solidity
function addRecordByDoctor(
    bytes32 cidHash,
    bytes32 parentCidHash,
    bytes32 recordTypeHash,
    address patient,
    bytes32 doctorEncKeyHash,
    uint40 doctorAccessHours
) external onlyDoctor nonReentrant
```

| Bước | Code | Ghi chú |
|---|---|---|
| Gate role | `onlyDoctor` → `accessControl.isDoctor(msg.sender)` | `DoctorUpdate.sol:64-67`. Chỉ cần FLAG `DOCTOR`, KHÔNG cần `VERIFIED_DOCTOR` để ghi. |
| Validate patient | `if (!accessControl.isPatient(patient)) revert NotPatient()` | `DoctorUpdate.sol:89-91` |
| Ghi record | `recordRegistry.addRecordByDoctor(cidHash, parentCidHash, recordTypeHash, patient)` | `DoctorUpdate.sol:94`. **KHÔNG kiểm tra consent** — comment ngay tại chỗ: "Patient does NOT need consent entry" (`:96-97`). |
| Cấp quyền đọc cho bác sĩ | chỉ khi **ROOT** (`parentCidHash == bytes32(0)`) và `doctorEncKeyHash != 0` → `_grantDoctorAccess(...)` | `DoctorUpdate.sol:99-113`. Child (update) KHÔNG cấp consent riêng — dựa vào consent của root (comment `:102-103`). |
| Event | `emit RecordAddedByDoctor(doctor, patient, cidHash, parentCidHash, recordTypeHash, expireAt)` | `DoctorUpdate.sol:29-36,115-122` |

`_grantDoctorAccess` (`DoctorUpdate.sol:127-161`):
- `accessHours == 0` → dùng `DEFAULT_DOCTOR_ACCESS = 7 days` (`:26,136-137`).
- Ngược lại `duration = accessHours * 1 hours`, phải nằm trong `[MIN=1h, MAX=90d]` (`:24-25,139-143`).
- Overflow guard uint40 (`:146-149`), rồi gọi `consentLedger.grantInternal(patient, doctor, cidHash, encKeyHash, expireAt, false)` — **`allowDelegate=false`** (`:151-158`). `grantInternal` chỉ contract được authorize mới gọi được (`ConsentLedger.sol:214-232`, modifier `onlyAuthorized`).

> Trong app, mobile luôn truyền `doctorAccessHours = 0` (`screens-v2/doctor/DoctorCreateUpdateScreen.tsx:427`) → bác sĩ tự cấp cho mình 7 ngày khi tạo root.

### 4.2 `RecordRegistry.addRecordByDoctor` — lưu trữ thực sự

Chữ ký (`contracts/src/RecordRegistry.sol:128-133`):

```solidity
function addRecordByDoctor(bytes32 cidHash, bytes32 parentCidHash, bytes32 recordTypeHash, address patient)
```

- Cho phép gọi nếu `isDoctor(msg.sender)` **HOẶC** `authorizedContracts[msg.sender]` (DoctorUpdate được authorize) (`:134-137`).
- Patient phải `isPatient` (fix F3 — tránh tạo record cho địa chỉ không phải bệnh nhân) (`:138-140`).
- Gọi `_addRecord(cidHash, parentCidHash, recordTypeHash, creator=msg.sender, patient)` (`:143`).

**Lưu ý owner vs creator**: record `owner = patient`, `createdBy = creator` (chính là DoctorUpdate hoặc bác sĩ) — `_addRecord` (`RecordRegistry.sol:175-184`).

### 4.3 Chuỗi version cha–con trong `_addRecord`

`RecordRegistry._addRecord` (`contracts/src/RecordRegistry.sol:150-191`):

```
version = 1                                         (mặc định)
if parentCidHash != 0:
    require parent.exists                  (:163, revert ParentNotExist)
    version = parent.version + 1           (:164)
    require children < MAX_CHILDREN(=100)  (:39,166-168)
    _parentChildren[parentCidHash].push(cidHash)  (:169)
```

`Record` struct lưu cả `parentCidHash` (`interfaces/IRecordRegistry.sol:10-19`). Topology cha–con:

```
            ┌──────────── ROOT (v1, parent=0) ────────────┐
            │  cidHash_A   owner=BN   createdBy=Dr.X       │
            └───────────────────┬─────────────────────────┘
                                │ parentCidHash = A
                  ┌─────────────▼─────────────┐
                  │  cidHash_B (v2)            │  ← Dr.Y cập nhật
                  └─────────────┬─────────────┘
                                │ parentCidHash = B
                  ┌─────────────▼─────────────┐
                  │  cidHash_C (v3)            │  ← Dr.Y cập nhật tiếp
                  └───────────────────────────┘
```

View hỗ trợ duyệt chuỗi: `parentOf(cidHash)` (`:312-314`), `getChildRecords(parent)` (`:324-326`), `getChildCount` (`:328-330`).

> Phân biệt với `updateRecordCID` (`:198-266`): đó là **sửa CID tại chỗ** trong 24h (`DOCTOR_UPDATE_WINDOW`, `:41,217`) và chặn nếu record đã có con — KHÁC với tạo version mới. Luồng "Bác sĩ cập nhật" trong app dùng `addRecordByDoctor` tạo child, KHÔNG dùng `updateRecordCID`.

### 4.4 `includeUpdates` chỉ gate ĐỌC, không gate GHI

- Đường GHI (`addRecordByDoctor`) **không hề tham chiếu** `includeUpdates` — chỉ kiểm role + patient tồn tại (xem 4.1/4.2). Bất kỳ bác sĩ nào cũng ghi child được, không phụ thuộc consent.
- `includeUpdates` là cờ trong consent quyết định grantee có ĐỌC được các child version của cùng root hay không (CLAUDE.md §3; semantics off-chain qua cascade KeyShare). Trong luồng tạo của bác sĩ, contract `_grantDoctorAccess` gọi `grantInternal` không truyền `includeUpdates` (interface `grantInternal` không có tham số này — `ConsentLedger.sol:214-221`); quyền đọc version mới được hiện thực ở mobile bằng **cascade share** (mục 5.4).

---

## 5. Phần off-chain (mã hoá, IPFS, backend) — giải thích kỹ

### 5.1 Mã hoá nội dung + đẩy IPFS

1. `generateAESKey()` → `encryptData(payload, aesKey)` mã hoá toàn bộ payload FHIR (`crypto.js`) (`screens-v2/doctor/DoctorCreateUpdateScreen.tsx:403-404`).
2. `ipfsService.uploadEncrypted(...)` đẩy ciphertext lên Pinata, trả CID (`:405-408`). **IPFS chỉ chứa ciphertext** — không có khoá.
3. `cidHash = keccak256(toBytes(cid))` mới là thứ lên chain (`:410`).

> Lưu ý nguồn: `mobile/src/services/ipfs.service.js` upload Pinata **THẬT** (cần `EXPO_PUBLIC_PINATA_JWT`, `ipfs.service.js:6,52-71`). Cái "mock" trong CLAUDE.md §12 là `backend/src/services/ipfs.service.js`, không phải bản mobile này.

### 5.2 Ai đọc được gì (mô hình quyền riêng tư)

| Tầng | Lưu gì | Ai mở được |
|---|---|---|
| On-chain `RecordRegistry` | `cidHash`, `parentCidHash`, `recordTypeHash`, owner, version | Public — nhưng chỉ là HASH, vô nghĩa nếu không có CID |
| On-chain `ConsentLedger` | grantee, `encKeyHash` (HASH), expiry, flags | Public, audit |
| IPFS (Pinata) | AES-GCM ciphertext của FHIR | Ai có `aesKey` |
| Backend `KeyShare` | `encryptedPayload` = NaCl box `{cid, aesKey}` | CHỈ người nhận có NaCl secret key |

Niêm phong gói cho từng người nhận (`screens-v2/doctor/DoctorCreateUpdateScreen.tsx:434-447`):
```
payloadJson = JSON.stringify({ cid, aesKey })
patientEncryptedPayload = encryptForRecipient(payloadJson, patientPubKey, doctorSecretKey)
doctorEncryptedPayload  = encryptForRecipient(payloadJson, doctorPubKey,  doctorSecretKey)
```
Đây là lý do **precheck pubkey bệnh nhân** ở `:309-322` quan trọng: nếu bệnh nhân chưa từng đăng nhập (chưa có NaCl pubkey), bác sĩ không thể niêm phong gói cho họ → họ sẽ không bao giờ giải mã được version này (cảnh báo `:312-319,438-444`).

### 5.3 Backend `POST /api/records/save-only` — chỉ "mirror", KHÔNG ghi chain

Bác sĩ đã tự gửi tx on-chain ở bước 7; backend chỉ phản ánh metadata + tạo KeyShare (`backend/src/routes/record.routes.js:292-509`):

| Việc backend làm | Code |
|---|---|
| `ensureUserRow` cho cả bác sĩ & bệnh nhân (FK an toàn kể cả BN chưa đăng nhập) | `:329-330` |
| Upsert `RecordMetadata` → `syncStatus = CONFIRMED`, lưu `title/recordType/versionNote/parentCidHash/txHash` | `:332-387` |
| Tạo `KeyShare` cho **bác sĩ** (`status='claimed'`), kế thừa expiry & `allowDelegate` từ KeyShare của parent (nếu là update); fallback 7 ngày nếu là root/không có parent | `:389-450` |
| Tạo `KeyShare` cho **bệnh nhân** (`status='pending'`) khi `creator != patient` | `:458-483` |
| Ghi `AccessLog` action `CREATE_RECORD_BY_DOCTOR` | `:485-492` |

Điểm tinh tế: với update version, expiry & cờ chia sẻ lại của bác sĩ **kế thừa từ parent** chứ không reset (`:400-419`) — bác sĩ không tự gia hạn vượt quyền gốc.

### 5.4 Cascade chia sẻ cho người đang có quyền (update mode)

Khi cập nhật, mobile lấy danh sách recipient của parent và niêm phong gói version mới cho từng người (trừ chính mình & bệnh nhân) rồi `keyShareService.shareKey` (`screens-v2/doctor/DoctorCreateUpdateScreen.tsx:480-504`). Đây chính là hiện thực off-chain của ngữ nghĩa `includeUpdates` (ai đang đọc root sẽ thấy luôn version mới). Tạo root mới thì `recipients = []` (`:481-482`).

### 5.5 Local key store

`localRecordStore.setKey(cidHash → {cid, aesKey, ...})` cho phép bác sĩ giải mã ngay tại máy không cần round-trip backend (`screens-v2/doctor/DoctorCreateUpdateScreen.tsx:464-478`). Mất app = mất local key (mitigation: KeyShare self ở backend, mục 5.3).

---

## 6. Gate "read-only" ở UI (`SharedRecordCard`)

> Đính chính so với CLAUDE.md §13: file `mobile/src/components/SharedRecordCard.tsx` hiện **không có biến tên `isReadOnly`**. Cơ chế gate thực tế là `isInactive` + điều kiện hiển thị nút `onCreateUpdate`.

Trong `SharedRecordCard` (`mobile/src/components/SharedRecordCard.tsx`):

```
isRevoked  = status ∈ {revoked, rejected}                     (:67)
isExpired  = status=='expired'  ||  expiresAt < now           (:68-69)
isInactive = record.active===false || isRevoked || isExpired  (:70)
```

- Nếu `isInactive` → cả thẻ mờ đi (opacity), **không bấm được**, **không render** nút "Cập nhật version" (`:88-101,226`).
- Nút **"Cập nhật version →"** chỉ hiện khi `!isInactive && !isPending && onCreateUpdate` (`:226-254`). Tức là một share đã thu hồi/hết hạn (read-only về mặt vòng đời) sẽ không cho bác sĩ tạo version mới từ UI.
- Nếu `isPending` (chưa "nhận" hồ sơ) → hiện CTA "Đồng ý nhận hồ sơ →" thay vì nút cập nhật (`:198-225`).

Lưu ý: gate này là **lớp UX**, không phải lớp bảo mật cuối. Lớp bảo mật cuối là on-chain `canAccess` + backend `checkConsent` khi đọc nội dung (CLAUDE.md §4–5). Riêng đường GHI thì như mục 4.4 đã nêu — contract chỉ chặn theo role + patient tồn tại.

---

## 7. Ai trả gas / dữ liệu nào mã hoá / ai đọc được (tổng kết nhanh)

| Câu hỏi | Trả lời | Nguồn |
|---|---|---|
| Ai ký & trả gas tx `addRecordByDoctor`? | **Bác sĩ** (msg.sender = ví bác sĩ; không sponsor) | `DoctorCreateUpdateScreen.tsx:414-432`; footer "bạn ký phí gas" `:585-587` |
| Bác sĩ chưa verified có ghi được không? | Có — `onlyDoctor` chỉ kiểm `isDoctor` (FLAG `DOCTOR`), không cần `VERIFIED_DOCTOR` | `DoctorUpdate.sol:64-67`; `AccessControl.sol:442-449` |
| Cần consent bệnh nhân để GHI? | **Không** | `DoctorUpdate.sol:96-97` |
| Plaintext nào lên chain? | Không có — chỉ `cidHash`, `parentCidHash`, `recordTypeHash` (đều là băm) | `RecordRegistry.sol:11-15`; `interfaces/IRecordRegistry.sol:10-19` |
| Nội dung FHIR mã hoá bằng gì? | AES-GCM (khoá `aesKey`) trước khi lên IPFS | `DoctorCreateUpdateScreen.tsx:403-408` |
| Khoá AES tới tay người nhận thế nào? | NaCl box `{cid,aesKey}` riêng cho từng người, lưu ở `KeyShare` backend | `:434-447`; `record.routes.js:389-483` |
| Backend đọc được nội dung? | Không — chỉ giữ ciphertext + NaCl box ("blind mailbox") | CLAUDE.md §4; `record.routes.js` chỉ lưu `encryptedPayload` |
| `includeUpdates` ảnh hưởng GHI? | Không, chỉ ảnh hưởng ĐỌC version mới (cascade off-chain) | mục 4.4; `DoctorUpdate.sol:80-123` |

---

## 8. Câu hỏi hội đồng có thể hỏi (gợi ý trả lời)

- **"Bác sĩ tạo record cho bệnh nhân mà không cần bệnh nhân đồng ý — có nguy hiểm không?"**
  Đường GHI cố ý không cần consent (giống thực tế: bác sĩ lập bệnh án). Nhưng bệnh nhân vẫn là `owner` (`RecordRegistry.sol:180`), và quyền ĐỌC/chia sẻ lại do bệnh nhân kiểm soát qua `ConsentLedger`. Bác sĩ tự cấp cho mình tối đa 7 ngày khi tạo root (`DoctorUpdate.sol:151-158`).

- **"Làm sao truy vết được lịch sử chỉnh sửa?"**
  Mỗi cập nhật là một record con mới (`version = parent.version + 1`, `RecordRegistry.sol:164`), record cũ giữ nguyên (footer "Phiên bản cũ giữ nguyên để truy lùi", `DoctorCreateUpdateScreen.tsx:587`). Chuỗi cha–con duyệt bằng `parentOf`/`getChildRecords`.

- **"Nếu DB backend bị lộ?"**
  Attacker chỉ có ciphertext IPFS + NaCl box; không có NaCl secret key của người nhận thì không mở được `{cid,aesKey}` (mục 5.2).

---

## Nguồn đã đọc

- `contracts/src/DoctorUpdate.sol` (toàn bộ — `addRecordByDoctor`, `_grantDoctorAccess`, hằng số, event)
- `contracts/src/RecordRegistry.sol` (toàn bộ — `addRecordByDoctor`, `_addRecord`, `updateRecordCID`, view chuỗi version)
- `contracts/src/interfaces/IRecordRegistry.sol` (struct `Record`, event `RecordAdded`/`RecordUpdated`)
- `contracts/src/ConsentLedger.sol` (`grantInternal` :214-232)
- `contracts/src/AccessControl.sol` (`isPatient` :438-440, `isDoctor` :442-444, `isVerifiedDoctor` :446-449)
- `mobile/src/screens-v2/doctor/DoctorCreateUpdateScreen.tsx` (toàn bộ — `handleSubmit`, precheck, mã hoá, writeContract, cascade)
- `mobile/src/screens-v2/doctor/DoctorDashboardScreen.tsx` (`handleCreateUpdate` :443-481, render `SharedRecordCard` :510-514)
- `mobile/src/components/SharedRecordCard.tsx` (toàn bộ — `isInactive`, gate nút "Cập nhật version")
- `mobile/src/services/record.service.js` (`saveOnly`, `createRecord`, `getRecordChain`)
- `mobile/src/services/ipfs.service.js` (upload Pinata thật)
- `backend/src/routes/record.routes.js` (`POST /api/records/save-only` :292-509)
