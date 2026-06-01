# Sơ đồ 13 — Use Case Phân rã: Bộ Y tế (Ministry)

> Embed Chương 2 mục 2.6.4 hoặc Phụ lục B. 6 UC + governance.

## Actor: Bộ Y tế

- Single wallet of trust (Ministry root)
- ⚠ **Constraint thực tế** (memory `project_ministry_wallet_constraint.md`): user mất seed phrase Ministry wallet → chỉ ký được qua MetaMask browser → mọi Ministry action gợi ý chạy qua **Arbiscan Write Contract tab**, KHÔNG qua mobile MinistryDashboard.

## 6 Use cases

```
UC-M01  Đăng nhập (Ministry wallet)
UC-M02  Tạo tổ chức y tế mới (createOrganization)
UC-M03  Xác minh Bác sĩ độc lập (verifyDoctorByMinistry)
UC-M04  Tạm dừng / kích hoạt tổ chức (setOrgActive)
UC-M05  Thu hồi xác minh tổ chức (revokeOrgVerification)
UC-M06  Xem dashboard tổng quan Ministry
```

## Include / Extend / Constraints

### Include
- Tất cả UC-M02 → UC-M05: `<<include>>` Submit Tx (Ministry TỰ trả gas — msg.sender == ministry check trong AccessControl.sol)
- UC-M06: `<<include>>` Query Subgraph

### Pre-conditions
- UC-M02: Primary + Backup admin wallets phải valid + khác nhau + khác address(0) + khác Ministry's own wallet (audit Fix #1)
- UC-M04: orgId phải tồn tại
- UC-M05: Org phải verified trước đó

### Destructive operation safety (audit 2026-05-26)
- UC-M04 setOrgActive(false): UI typeword "THU HOI" để xác nhận destructive
- UC-M05 revokeOrgVerification: cùng UI pattern typeword

### Cross-actor effects
- UC-M02: emit `OrganizationCreated(orgId, name, primary, backup)` → Subgraph index → backend Organization table có row mới
- UC-M03: emit `DoctorVerified(doctor, ministryAddress, credential)` → cùng effect như UC-O06 nhưng `ministry` thay vì `org`
- UC-M04 setOrgActive(false): org admin KHÔNG addOrgMember được nữa
- UC-M05: org's `verified` flag = false → mọi doctor thuộc org đó **mất** `canAccess` qua `isVerifiedDoctor` walk

## Code references

| UC | File chính |
|---|---|
| UC-M01 | [LoginScreen.tsx](../../mobile/src/screens-v2/LoginScreen.tsx) (Ministry wallet path) |
| UC-M02 | [ministry/MinistryCreateOrgScreen.tsx](../../mobile/src/screens-v2/ministry/MinistryCreateOrgScreen.tsx), [contracts/src/AccessControl.sol](../../contracts/src/AccessControl.sol) `createOrganization` |
| UC-M03 | [ministry/MinistryVerifyDoctorScreen.tsx](../../mobile/src/screens-v2/ministry/MinistryVerifyDoctorScreen.tsx), `verifyDoctorByMinistry` |
| UC-M04 | [ministry/MinistryDashboardScreen.tsx](../../mobile/src/screens-v2/ministry/MinistryDashboardScreen.tsx), `setOrgActive` |
| UC-M05 | [ministry/MinistryDashboardScreen.tsx](../../mobile/src/screens-v2/ministry/MinistryDashboardScreen.tsx), `revokeOrgVerification` |
| UC-M06 | [ministry/MinistryDashboardScreen.tsx](../../mobile/src/screens-v2/ministry/MinistryDashboardScreen.tsx) |

## PlantUML

Xem [13-usecase-ministry.puml](13-usecase-ministry.puml).
