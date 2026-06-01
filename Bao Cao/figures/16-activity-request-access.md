# Sơ đồ 16 — Activity: Yêu cầu truy cập 3 bước (Doctor Request Access)

> Embed Chương 4 mục 4.4.3. Workflow 2-party ceremony.

## 3 phase

### Phase 1 — Doctor request (doctor pays gas)
1. **Start** — Doctor mở `DoctorRequestAccessScreen`
2. Paste cidHash + chọn `RequestType`
3. **Decision**: cidHash format hợp lệ (0x64hex)?
   - NO → Alert → stop
   - YES → tiếp tục
4. **Decision**: Doctor isVerified?
   - NO → contract revert `Unauthorized` → stop
   - YES → tiếp tục
5. Doctor ký + submit `EHRSystemSecure.requestAccess(...)` (DOCTOR trả gas)
6. Contract `_requests[requestId] = {...}` với deadline 7 ngày
7. Contract emit `AccessRequested`
8. Subgraph index → backend mirror `AccessRequest` table + Expo push patient

### Phase 2 — Patient phản hồi
9. Patient nhận push → mở `RequestsScreen`
10. **Decision**: Patient phê duyệt hay từ chối?
    - **Phê duyệt path**:
      - 10a. Biometric MFA gate
      - 11a. Sign `ApprovePermit` EIP-712
      - 12a. POST `/api/relayer/approve-request` (sponsored)
      - 13a. Contract `approveRequestBySig` → `_completeRequest` → `ConsentLedger.grantInternal`
      - 14a. Emit `ConsentGranted` + `RequestCompleted`
    - **Từ chối path** (Wave K):
      - 10b. Biometric MFA gate
      - 11b. Sign `RejectPermit` EIP-712
      - 12b. POST `/api/relayer/reject-request` (sponsored)
      - 13b. Contract `rejectRequestBySig` → emit `RequestRejected`
      - 14b. Backend mirror `status='rejected'` + optional rejectionReason
15. **Decision**: deadline expired trước approval?
    - YES → contract revert `RequestExpired` → cleanup → stop
    - NO → tiếp tục

### Phase 3 — Doctor claim + decrypt
16. Doctor refresh dashboard (qua WebSocket push hoặc manual)
17. GET `/api/key-share/my` → thấy KeyShare row mới (status=claimed)
18. GET `/api/key-share/record/:cidHash` → backend gate `canAccess` on-chain
19. **Decision**: canAccess return true?
    - NO (vd consent expired / doctor unverified) → 403
    - YES → trả encryptedPayload
20. Mobile decrypt NaCl box → AES key → fetch IPFS ciphertext → decrypt AES-GCM
21. Render record
22. **End**

## Decision summary
- 5 decision nodes: cidHash format, doctor verified, approve/reject path, deadline expired, canAccess gate
- 2 alt paths (approve vs reject)

## Code references
- Phase 1: [doctor/DoctorRequestAccessScreen.tsx](../../mobile/src/screens-v2/doctor/DoctorRequestAccessScreen.tsx), [EHRSystemSecure.sol](../../contracts/src/EHRSystemSecure.sol) `requestAccess`
- Phase 2 approve: [RequestsScreen.tsx](../../mobile/src/screens-v2/RequestsScreen.tsx) `handleApprove`
- Phase 2 reject: [RequestsScreen.tsx](../../mobile/src/screens-v2/RequestsScreen.tsx) `handleReject`
- Phase 3 claim: [keyShare.service.js](../../mobile/src/services/keyShare.service.js)

## PlantUML

Xem [16-activity-request-access.puml](16-activity-request-access.puml).
