# Sơ đồ 11 — Use Case Phân rã: Bác sĩ (Doctor)

> Embed Chương 2 mục 2.6.2 hoặc Phụ lục B. 10 UC + include/extend.

## Actor: Bác sĩ

- Verified Doctor (qua Org hoặc Ministry) → có thể `canAccess` hồ sơ patient
- Unverified Doctor → có thể tạo record local, nhưng KHÔNG đọc record của patient khác

## 10 Use cases

```
UC-D01  Đăng nhập + đăng ký vai trò Bác sĩ
UC-D02  Nộp chứng chỉ chuyên môn để xin xác minh
UC-D03  Yêu cầu truy cập hồ sơ bệnh nhân (3 RequestType)
UC-D04  Xem danh sách hồ sơ được cấp quyền
UC-D05  Đọc + giải mã hồ sơ
UC-D06  Tạo phiên bản cập nhật cho hồ sơ bệnh nhân (addRecordByDoctor)
UC-D07  Uỷ quyền lại cho Bác sĩ khác (grantUsingRecordDelegation)
UC-D08  Xem + thu hồi hồ sơ đã uỷ quyền (DoctorOutgoingShares)
UC-D09  Tra cứu bệnh nhân khẩn cấp qua CCCD
UC-D10  Cập nhật hồ sơ chuyên môn (DoctorProfile)
```

## Include / Extend

### Include
- UC-D03 `<<include>>` Submit Tx (Doctor TỰ trả gas, KHÔNG sponsored — vì doctor có wallet riêng + msg.sender check)
- UC-D05 `<<include>>` Gate canAccess (UC-G15) — backend gate trước khi serve KeyShare
- UC-D06 `<<include>>` Encrypt + Upload Pinata (sub-UC giống UC-P03 patient)
- UC-D07 `<<include>>` Submit Tx (doctor pay) — nếu doctor có allowDelegate=true
- UC-D09 `<<include>>` Hash CCCD (backend keccak256 lookup)

### Extend / Conditional
- UC-D03 sub-cases:
  - `DirectAccess` → request direct grant (1-1)
  - `RecordDelegation` → request quyền re-delegate cho doctor khác
  - `FullDelegation` → request quyền full proxy patient
- UC-D04, UC-D08 đều CHỈ work khi `isVerifiedDoctor=true` (verified flag)
- UC-D06 PRE-CONDITION: doctor đã được patient grant access record gốc

### Cross-actor relationships
- UC-D06 trigger event `RecordAdded` → backend cascade share KeyShare cho patient + team members
- UC-D07 trigger event `AccessGrantedViaDelegation` → backend tạo `DelegationAccessLog` row

## Code references

| UC | File chính |
|---|---|
| UC-D01 | [LoginScreen.tsx](../../mobile/src/screens-v2/LoginScreen.tsx), [RoleSelectionScreen.tsx](../../mobile/src/screens-v2/RoleSelectionScreen.tsx), [contracts/src/AccessControl.sol](../../contracts/src/AccessControl.sol) `registerAsDoctor` |
| UC-D02 | [doctor/CredentialSubmitScreen.tsx](../../mobile/src/screens-v2/doctor/CredentialSubmitScreen.tsx) |
| UC-D03 | [doctor/DoctorRequestAccessScreen.tsx](../../mobile/src/screens-v2/doctor/DoctorRequestAccessScreen.tsx), [contracts/src/EHRSystemSecure.sol](../../contracts/src/EHRSystemSecure.sol) `requestAccess` |
| UC-D04 | [doctor/DoctorDashboardScreen.tsx](../../mobile/src/screens-v2/doctor/DoctorDashboardScreen.tsx) |
| UC-D05 | [doctor/DoctorRecordDetailScreen.tsx](../../mobile/src/screens-v2/doctor/DoctorRecordDetailScreen.tsx), [keyShare.service.js](../../mobile/src/services/keyShare.service.js) |
| UC-D06 | [doctor/DoctorCreateUpdateScreen.tsx](../../mobile/src/screens-v2/doctor/DoctorCreateUpdateScreen.tsx), [contracts/src/DoctorUpdate.sol](../../contracts/src/DoctorUpdate.sol) `addRecordByDoctor` |
| UC-D07 | [doctor/DoctorDelegatableRecordsScreen.tsx](../../mobile/src/screens-v2/doctor/DoctorDelegatableRecordsScreen.tsx), [contracts/src/ConsentLedger.sol](../../contracts/src/ConsentLedger.sol) `grantUsingRecordDelegation` |
| UC-D08 | [doctor/DoctorOutgoingSharesScreen.tsx](../../mobile/src/screens-v2/doctor/DoctorOutgoingSharesScreen.tsx) |
| UC-D09 | [doctor/EmergencyLookupScreen.tsx](../../mobile/src/screens-v2/doctor/EmergencyLookupScreen.tsx), [backend/src/routes/emergency.routes.js](../../backend/src/routes/emergency.routes.js) |
| UC-D10 | [EditProfileScreen.tsx](../../mobile/src/screens-v2/EditProfileScreen.tsx) (doctor branch) |

## PlantUML

Xem [11-usecase-doctor.puml](11-usecase-doctor.puml).
