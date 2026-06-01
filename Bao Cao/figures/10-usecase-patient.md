# Sơ đồ 10 — Use Case Phân rã: Bệnh nhân (Patient)

> Embed Chương 2 mục 2.6.1 hoặc Phụ lục B. Chi tiết 18 UC + include/extend.

## Actor: Bệnh nhân

Người sở hữu hồ sơ y tế. Mọi quyền là quyền chủ động (self-sovereign).

## 18 Use cases chi tiết (đã liệt kê ở 01-use-case.md cũ)

```
UC-P01  Đăng nhập hệ thống (Web3Auth 7 providers)
UC-P02  Đăng ký vai trò Bệnh nhân (registerAsPatient on-chain)
UC-P03  Tạo hồ sơ y tế mới (encrypt + IPFS + registerRecord)
UC-P04  Tạo phiên bản cập nhật hồ sơ (parent/child chain)
UC-P05  Xem chi tiết hồ sơ (decrypt local AES)
UC-P06  Chia sẻ hồ sơ với Bác sĩ (Grant Consent, sponsored)
UC-P07  Thu hồi quyền truy cập (revoke cascade)
UC-P08  Phê duyệt yêu cầu truy cập của Bác sĩ
UC-P09  Từ chối yêu cầu truy cập (sponsored)
UC-P10  Uỷ quyền cho Bác sĩ (Full Delegation)
UC-P11  Thu hồi uỷ quyền (cascade epoch bump)
UC-P12  Đăng ký CCCD cho tra cứu khẩn cấp
UC-P13  Đăng ký Người thân tin cậy (Trusted Contact)
UC-P14  Thu hồi Người thân tin cậy
UC-P15  Cập nhật thông tin cá nhân (tên/BHYT/dị ứng)
UC-P16  Đổi ảnh đại diện (Pinata upload)
UC-P17  Bật/tắt MFA sinh trắc học
UC-P18  Đăng xuất
```

## Include / Extend relationships

### Include (UC bắt buộc gọi UC khác)
- UC-P03 `<<include>>` Sponsor Relayer (UC-G13) — tạo record ghi on-chain qua sponsored tx
- UC-P06 `<<include>>` Sponsor Relayer — grantConsent EIP-712
- UC-P07 `<<include>>` Sponsor Relayer — revokeConsent
- UC-P08 `<<include>>` Sponsor Relayer — approveRequestBySig
- UC-P09 `<<include>>` Sponsor Relayer — rejectRequestBySig (Wave K)
- UC-P10 `<<include>>` Sponsor Relayer — grantDelegation
- UC-P11 `<<include>>` Sponsor Relayer — revokeDelegation
- UC-P13 `<<include>>` Sponsor Relayer — setTrustedContactBySig
- UC-P03 `<<include>>` Upload Pinata IPFS (sub-UC ẩn)
- UC-P05 `<<include>>` Gate canAccess (cho Doctor đọc — gián tiếp)

### Extend (UC mở rộng / điều kiện)
- UC-P17 `<<extend>>` UC-P06/P07/P08/P09/P10/P11/P13 — biometric MFA optional gate (nếu user bật)
- UC-P09 `<<extend>>` UC-P08 — reject là alt path của approve
- UC-P04 `<<extend>>` UC-P03 — phiên bản cập nhật là extension của tạo mới (có parent reference)

### Generalization
- UC-P06, UC-P10 → abstract UC "Cấp quyền cho người khác"
- UC-P07, UC-P11, UC-P14 → abstract UC "Thu hồi quyền"

## Code references

| UC | File chính |
|---|---|
| UC-P01 | [mobile/src/screens-v2/LoginScreen.tsx](../../mobile/src/screens-v2/LoginScreen.tsx), [walletAction.service.js](../../mobile/src/services/walletAction.service.js) |
| UC-P02 | [contracts/src/AccessControl.sol](../../contracts/src/AccessControl.sol) `registerAsPatient` |
| UC-P03 | [CreateRecordScreen.tsx](../../mobile/src/screens-v2/CreateRecordScreen.tsx), [ipfs.service.js](../../mobile/src/services/ipfs.service.js) |
| UC-P04 | [RecordRegistry.sol](../../contracts/src/RecordRegistry.sol) `addRecord` với parentCidHash |
| UC-P05 | [RecordDetailScreen.tsx](../../mobile/src/screens-v2/RecordDetailScreen.tsx) |
| UC-P06 | [RecordDetailScreen.tsx](../../mobile/src/screens-v2/RecordDetailScreen.tsx) `handleShare`, [consent.service.js](../../mobile/src/services/consent.service.js) |
| UC-P07 | [AccessLogScreen.tsx](../../mobile/src/screens-v2/AccessLogScreen.tsx) `handleRevoke` |
| UC-P08 | [RequestsScreen.tsx](../../mobile/src/screens-v2/RequestsScreen.tsx) `handleApprove` |
| UC-P09 | [RequestsScreen.tsx](../../mobile/src/screens-v2/RequestsScreen.tsx) `handleReject` |
| UC-P10 | [DelegationScreen.tsx](../../mobile/src/screens-v2/DelegationScreen.tsx) `handleGrant` |
| UC-P11 | [DelegationScreen.tsx](../../mobile/src/screens-v2/DelegationScreen.tsx) `handleRevoke` |
| UC-P12 | [TrustedContactsScreen.tsx](../../mobile/src/screens-v2/TrustedContactsScreen.tsx) `handleCccdSave` |
| UC-P13 | [trustedContact.service.js](../../mobile/src/services/trustedContact.service.js) `addContact` |
| UC-P14 | [trustedContact.service.js](../../mobile/src/services/trustedContact.service.js) `removeContact` |
| UC-P15 | [EditProfileScreen.tsx](../../mobile/src/screens-v2/EditProfileScreen.tsx) `handleSave` |
| UC-P16 | [EditProfileScreen.tsx](../../mobile/src/screens-v2/EditProfileScreen.tsx) `handleAvatarEdit` |
| UC-P17 | [BiometricSettingsScreen.tsx](../../mobile/src/screens-v2/BiometricSettingsScreen.tsx) |
| UC-P18 | [authStore.js](../../mobile/src/store/authStore.js) `logout` |

## PlantUML

Xem [10-usecase-patient.puml](10-usecase-patient.puml).
