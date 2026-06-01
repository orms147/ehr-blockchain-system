# Sơ đồ 14 — Activity: Tạo hồ sơ y tế mới

> Embed Chương 4 mục 4.4.1. Workflow logic (khác Sequence 06 — chú trọng decision flow).

## Mục đích

Mô tả luồng nghiệp vụ TỪ ĐẦU ĐẾN CUỐI khi patient tạo record mới, kể cả:
- Decision nodes (validation fail / retry)
- Parallel actions (auto pre-share TC)
- Error paths

## Activity steps

### Swimlane: Patient (mobile UI)
1. **Start** — Mở `CreateRecordScreen`
2. Nhập `title` + `description` + tag (recordType: general/rx/vacc/lab/imaging)
3. (Optional) Chụp/chọn ảnh y tế đính kèm
4. (Optional) Điền vital signs / drugs / vaccinations theo recordType
5. Bấm "Tạo hồ sơ"
6. **Decision**: title trống?
   - YES → Alert "Thiếu tiêu đề" → quay lại bước 2
   - NO → tiếp tục

### Swimlane: Mobile services
7. `generateAESKey()` — sinh AES-256 key local
8. `encryptData(plaintext, aesKey)` — AES-GCM encrypt
9. `ipfsService.upload(encryptedData)` → Pinata
10. **Decision**: upload fail?
    - YES → retry với exponential backoff 3 lần → fail thì hiện error
    - NO → nhận CID
11. `cidHash = keccak256(CID)`
12. `localRecordStore.put(cidHash, {cid, aesKey})` — cache local cho decrypt
13. Sign EIP-712 `RecordPermit` qua walletAction service
14. **Decision**: User cancel ký?
    - YES → end (cleanup IPFS pin nếu muốn)
    - NO → tiếp tục

### Swimlane: Backend + Blockchain
15. POST `/api/relayer/register-record` với signature
16. Backend verify signature
17. Backend submit `RecordRegistry.addRecord(cidHash, parentCidHash, recordType)` (sponsored)
18. Contract store record + emit `RecordAdded(patient, cidHash, parent, recordType, timestamp)`
19. **Decision**: tx revert?
    - YES (vd CID_RESERVED / patient chưa registerAsPatient) → backend trả error
    - NO → return tx hash

### Swimlane: Mobile + Backend cascade
20. (Parallel branch) `autoPreShareNewRecord(cidHash, cid, aesKey, patientAddress)`:
    - Get list trusted contacts
    - Cho mỗi TC active: encrypt `(cid, aesKey)` cho TC's pubkey
    - POST `/api/key-share/bulk-trusted-contact`
    - Lưu KeyShare row source='trusted-contact'
21. Subgraph index `RecordAdded` event
22. Backend `recordRegistrySync.service.js` mirror DB `RecordMetadata` row
23. Mobile show "Đã tạo hồ sơ thành công" + navigate về RecordsScreen
24. **End**

## Decision summary

- 4 decision nodes: title validation, upload retry, sign cancel, tx revert
- 1 parallel branch (auto pre-share TC) — không block main flow
- Error handling: 3 retry IPFS, 1 retry sign nếu user cancel

## Code references
- Mobile entry: [mobile/src/screens-v2/CreateRecordScreen.tsx](../../mobile/src/screens-v2/CreateRecordScreen.tsx) `handleSubmit`
- Encrypt: [mobile/src/services/crypto.js](../../mobile/src/services/crypto.js) `encryptData`
- IPFS: [mobile/src/services/ipfs.service.js](../../mobile/src/services/ipfs.service.js) `upload`
- Sign: [mobile/src/utils/eip712.js](../../mobile/src/utils/eip712.js) `signRecordPermit`
- Relayer: [backend/src/routes/relayer.routes.js](../../backend/src/routes/relayer.routes.js) `/register-record`
- Auto pre-share: [mobile/src/services/trustedContact.service.js](../../mobile/src/services/trustedContact.service.js) `autoPreShareNewRecord`
- Contract: [contracts/src/RecordRegistry.sol](../../contracts/src/RecordRegistry.sol) `addRecord`
- Event sync: [backend/src/services/recordRegistrySync.service.js](../../backend/src/services/recordRegistrySync.service.js)

## PlantUML

Xem [14-activity-create-record.puml](14-activity-create-record.puml).
