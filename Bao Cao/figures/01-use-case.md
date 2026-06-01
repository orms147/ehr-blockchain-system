# Sơ đồ 1 — Use Case Diagram (tổng quát)

> Embed trong Chương 2 mục 2.5. Đặc tả chi tiết từng UC ở Phụ lục B.
> Có **38 use case** đủ phủ 4 actor + system. KHÔNG bỏ sót.

## Actors (5)

| Symbol | Tên | Mô tả |
|---|---|---|
| ⚫ | **Bệnh nhân (Patient)** | Người sở hữu hồ sơ y tế |
| ⚫ | **Bác sĩ (Doctor)** | Người được cấp quyền truy cập + cập nhật hồ sơ |
| ⚫ | **Quản trị viên Tổ chức (Org Admin)** | Quản lý thành viên + xác minh bác sĩ |
| ⚫ | **Bộ Y tế (Ministry)** | Tạo + quản lý tổ chức y tế, governance |
| ⚪ | **Hệ thống** (system actor) | Backend relayer + Subgraph indexer (automated) |

## Use cases

### Patient (UC-P01 → UC-P18) — 18 UC
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

### Doctor (UC-D01 → UC-D10) — 10 UC
```
UC-D01  Đăng nhập + đăng ký vai trò Bác sĩ
UC-D02  Nộp chứng chỉ chuyên môn để xin xác minh
UC-D03  Yêu cầu truy cập hồ sơ bệnh nhân (3 RequestType)
UC-D04  Xem danh sách hồ sơ được cấp quyền
UC-D05  Đọc và giải mã hồ sơ (claim KeyShare + decrypt)
UC-D06  Tạo phiên bản cập nhật cho hồ sơ bệnh nhân (addRecordByDoctor)
UC-D07  Uỷ quyền lại cho Bác sĩ khác (grantUsingRecordDelegation)
UC-D08  Xem + thu hồi hồ sơ đã uỷ quyền
UC-D09  Tra cứu bệnh nhân khẩn cấp qua CCCD
UC-D10  Cập nhật hồ sơ chuyên môn
```

### Organization Admin (UC-O01 → UC-O08) — 8 UC
```
UC-O01  Đăng nhập (Org admin wallet)
UC-O02  Xem dashboard tổ chức
UC-O03  Thêm thành viên Bác sĩ vào tổ chức
UC-O04  Loại bỏ thành viên Bác sĩ
UC-O05  Xem yêu cầu xác minh pending
UC-O06  Xác minh Bác sĩ (verifyDoctor)
UC-O07  Thu hồi xác minh Bác sĩ
UC-O08  Xem danh sách Bác sĩ đã xác minh
```

### Ministry (UC-M01 → UC-M06) — 6 UC
```
UC-M01  Đăng nhập (Ministry wallet)
UC-M02  Tạo tổ chức y tế mới (createOrganization)
UC-M03  Xác minh Bác sĩ độc lập (verifyDoctorByMinistry)
UC-M04  Tạm dừng/kích hoạt tổ chức (setOrgActive)
UC-M05  Thu hồi xác minh tổ chức
UC-M06  Xem dashboard tổng quan Ministry
```

### System automated (UC-S01 → UC-S05) — 5 UC
```
UC-S01  Backend relayer submit sponsored tx
UC-S02  Subgraph indexer poll events + DB sync
UC-S03  canAccess gate trước khi serve KeyShare
UC-S04  Socket.io push real-time event
UC-S05  Expo push notification offline
```

**Tổng: 47 use case** (18 + 10 + 8 + 6 + 5)

## Relationships

### Include
- UC-P03 «include» UC-S01 (tạo record có sponsored tx)
- UC-P06 «include» UC-S01 (grant consent sponsored)
- UC-P08 «include» UC-S01 (approve sponsored)
- UC-P09 «include» UC-S01 (reject sponsored)
- UC-P10 «include» UC-S01 (delegate sponsored)
- UC-P12 «include» UC-S01 (CCCD register)
- UC-P13 «include» UC-S01 (TC register sponsored)
- UC-D05 «include» UC-S03 (đọc hồ sơ qua gate canAccess)
- UC-D06 «include» UC-S04 (cập nhật version push event)
- UC-D09 «include** UC-S03 (CCCD lookup gate)

### Extend
- UC-P17 «extend» UC-P06/P08/P10/P13 (biometric MFA optional gate)
- UC-P09 «extend» UC-P08 (reject is alternative to approve)
- UC-D07 «extend» UC-D06 (delegate after view, optional)

### Generalization
- (Patient + Doctor + Org Admin + Ministry) → «User» abstract actor

## PlantUML source

Xem [01-use-case.puml](01-use-case.puml) — copy vào Astah PlantUML plugin hoặc render qua https://plantuml.com/online.

## Layout gợi ý Astah

- Trái: 4 actor người dùng (Patient/Doctor/Org/Ministry) xếp dọc
- Giữa: ellipse use case xếp theo nhóm actor
- Phải: System actor (Backend + Subgraph) với include relationships
- Comment caption: "Hệ thống Hồ sơ Y tế điện tử — Use Case tổng quát (47 UC, 5 actor)"
