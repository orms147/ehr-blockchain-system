# Sơ đồ 7 — Sequence: Flow Yêu cầu truy cập 3 bước (Doctor Request Access)

> Embed Chương 4 mục 4.4.3. Trace 15 bước flow 2-party ceremony.

## Actors / Components
- **Doctor** (mobile user, verified)
- **DoctorMobile** (Doctor's app)
- **Patient** (mobile user)
- **PatientMobile** (Patient's app)
- **Backend** (Express + relayer + push)
- **EHRSystemSecure** (contract)
- **ConsentLedger** (contract)
- **KeyShare DB**

## Step trace

### Bước 1 — Doctor yêu cầu (Doctor pay gas)
1. Doctor mở `DoctorRequestAccessScreen` → paste cidHash
2. Doctor chọn `RequestType` (DirectAccess / RecordDelegation / FullDelegation)
3. Doctor ký + submit tx `EHRSystemSecure.requestAccess(...)` trực tiếp (DOCTOR trả gas, không sponsored)
4. Contract lưu request `_requests[requestId] = {...}` với deadline 7 ngày
5. Contract emit `AccessRequested(requestId, patient, doctor, cidHash, reqType, deadline)`
6. Subgraph index event → Backend `consentLedgerSync` sync `AccessRequest` table
7. Backend `expoPush.service.js` gửi push notification cho Patient: "Bác sĩ X yêu cầu truy cập hồ sơ Y"

### Bước 2 — Patient phê duyệt (Patient sponsored)
8. Patient nhận push → mở `RequestsScreen` → thấy request pending
9. Patient bấm "Phê duyệt" → biometric MFA gate
10. Patient ký EIP-712 `ApprovePermit` → POST `/api/relayer/approve-request`
11. Backend verify signature + submit `approveRequestBySig(...)` (sponsored)
12. Contract `_completeRequest(...)` gọi `ConsentLedger.grantInternal(...)` tạo Consent + emit `RequestCompleted`

### Bước 3 — Doctor claim KeyShare + decrypt
13. Subgraph index `ConsentGranted` → backend mirror Consent table
14. Doctor refresh dashboard → GET `/api/key-share/my` → thấy KeyShare row mới
15. Doctor claim: GET `/api/key-share/record/:cidHash` → backend gate `canAccess` on-chain → trả `encryptedPayload` → mobile decrypt NaCl box + AES → render record

### Alternate: Patient từ chối
- 9b. Patient bấm "Từ chối" → biometric → ký EIP-712 `RejectPermit`
- 10b. POST `/api/relayer/reject-request` (sponsored — Wave K) → `rejectRequestBySig`
- 11b. Contract emit `RequestRejected` → Doctor side status `rejected`
- 12b. Backend mirror `AccessRequest.status='rejected'` + optional `rejectionReason` off-chain

## File references
- Mobile doctor request: [mobile/src/screens-v2/doctor/DoctorRequestAccessScreen.tsx](../../mobile/src/screens-v2/doctor/DoctorRequestAccessScreen.tsx)
- Mobile patient approve: [mobile/src/screens-v2/RequestsScreen.tsx](../../mobile/src/screens-v2/RequestsScreen.tsx)
- Contract: [contracts/src/EHRSystemSecure.sol](../../contracts/src/EHRSystemSecure.sol) `requestAccess`, `approveRequestBySig`, `rejectRequestBySig`, `_completeRequest`
- Backend reject endpoint: [backend/src/routes/request.routes.js](../../backend/src/routes/request.routes.js)
- KeyShare claim: [backend/src/routes/keyShare.routes.js](../../backend/src/routes/keyShare.routes.js) `/record/:cidHash`

## PlantUML

Xem [07-seq-request-access.puml](07-seq-request-access.puml).
