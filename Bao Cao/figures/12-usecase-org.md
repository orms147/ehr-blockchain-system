# Sơ đồ 12 — Use Case Phân rã: Quản trị viên Tổ chức (Org Admin)

> Embed Chương 2 mục 2.6.3 hoặc Phụ lục B. 8 UC + include/extend.

## Actor: Quản trị viên Tổ chức

- Primary admin (active) — login + ký tất cả on-chain actions
- Backup admin — chỉ recovery khi primary mất ví (rotate qua Ministry support, hiện thesis DEFER)
- Org phải `active=true` + `verified=true` (Ministry setOrgActive + verifyOrgByMinistry) thì admin mới hoạt động được

## 8 Use cases

```
UC-O01  Đăng nhập (Org admin wallet)
UC-O02  Xem dashboard tổ chức
UC-O03  Thêm thành viên Bác sĩ vào tổ chức
UC-O04  Loại bỏ thành viên Bác sĩ
UC-O05  Xem yêu cầu xác minh pending
UC-O06  Xác minh Bác sĩ (verifyDoctor)
UC-O07  Thu hồi xác minh Bác sĩ (revokeDoctorVerification)
UC-O08  Xem danh sách Bác sĩ đã xác minh
```

## Include / Extend

### Include
- UC-O03, UC-O04 `<<include>>` Submit Tx (Org admin TỰ trả gas — msg.sender check `isOrgAdmin`)
- UC-O06, UC-O07 `<<include>>` Submit Tx (Org admin pay)
- UC-O05, UC-O08 `<<include>>` Query Subgraph + Backend cache

### Pre-conditions
- Tất cả UC: org phải `active=true` (Ministry setOrgActive)
- UC-O06: Bác sĩ đã `registerAsDoctor` + submit credential (UC-D02)
- UC-O07: Bác sĩ đã verify trước đó (status=verified)

### Cross-actor relationships
- UC-O06 → emit `DoctorVerified` event → mobile doctor's role refresh sang verified
- UC-O07 → emit `VerificationRevoked` → mobile doctor mất verified flag → `canAccess` refuse

### Special
- **Address validation** (Fix #1 + #2 audit 2026-05-26):
  - UC-O03 reject zero address `0x000…000`
  - UC-O03 reject self-add (orgAdmin == doctorAddr)
  - Cite [mobile/src/screens-v2/org/OrgMembersScreen.tsx](../../mobile/src/screens-v2/org/OrgMembersScreen.tsx) line 836-837

## Code references

| UC | File chính |
|---|---|
| UC-O01 | [LoginScreen.tsx](../../mobile/src/screens-v2/LoginScreen.tsx) |
| UC-O02 | [org/OrgDashboardScreen.tsx](../../mobile/src/screens-v2/org/OrgDashboardScreen.tsx) |
| UC-O03 | [org/OrgMembersScreen.tsx](../../mobile/src/screens-v2/org/OrgMembersScreen.tsx) `AddMemberModal`, [contracts/src/AccessControl.sol](../../contracts/src/AccessControl.sol) `addMember` |
| UC-O04 | [contracts/src/AccessControl.sol](../../contracts/src/AccessControl.sol) `removeMember` |
| UC-O05 | [org/OrgPendingVerificationsScreen.tsx](../../mobile/src/screens-v2/org/OrgPendingVerificationsScreen.tsx) |
| UC-O06 | [contracts/src/AccessControl.sol](../../contracts/src/AccessControl.sol) `verifyDoctor` |
| UC-O07 | [contracts/src/AccessControl.sol](../../contracts/src/AccessControl.sol) `revokeDoctorVerification` |
| UC-O08 | [org/OrgMembersScreen.tsx](../../mobile/src/screens-v2/org/OrgMembersScreen.tsx) tab "Đã xác minh" |

## PlantUML

Xem [12-usecase-org.puml](12-usecase-org.puml).
