# Sơ đồ 01 — Use Case Tổng quan (High-level Overview)

> Embed Chương 2 mục 2.5. Phân rã chi tiết → 4 sơ đồ 10/11/12/13.
> Mục đích: cho reviewer thấy **bức tranh lớn** trong 1 trang, không lạc trong chi tiết.

## Khác biệt với phân rã

| | Tổng quan (file này) | Phân rã (file 10-13) |
|---|---|---|
| Số UC | ~15 nhóm | 42 UC chi tiết |
| Mức độ | High-level (gộp) | Đầy đủ + include/extend |
| Mục đích | Reviewer/giảng viên quick scan | Tham chiếu khi triển khai |
| Vị trí | Chương 2.5 | Phụ lục B + Chương 2.6 |

## Actors (4 + 1 system)

| Symbol | Tên | Wallet trên Arbitrum Sepolia |
|---|---|---|
| 👤 | **Bệnh nhân** | Patient EOA |
| 👤 | **Bác sĩ** | Doctor EOA (xác minh bởi Org hoặc Ministry) |
| 👤 | **Quản trị viên Tổ chức** | Org Admin EOA (primary hoặc backup) |
| 👤 | **Bộ Y tế** | Ministry EOA (single source of trust) |
| 🤖 | **Hệ thống** | Backend relayer + Subgraph + Postgres (automated) |

## Use cases tổng quan (15 nhóm)

### Bệnh nhân (5 nhóm — phân rã ở [10-usecase-patient.md](10-usecase-patient.md))
- **UC-G01**: Quản lý hồ sơ y tế (tạo, xem, cập nhật phiên bản)
- **UC-G02**: Quản lý quyền truy cập (cấp/thu hồi/uỷ quyền cho bác sĩ)
- **UC-G03**: Phản hồi yêu cầu truy cập (phê duyệt/từ chối doctor request)
- **UC-G04**: Quản lý Người thân tin cậy + CCCD khẩn cấp
- **UC-G05**: Quản lý hồ sơ cá nhân (thông tin, BHYT, ảnh, MFA)

### Bác sĩ (3 nhóm — phân rã ở [11-usecase-doctor.md](11-usecase-doctor.md))
- **UC-G06**: Xin xác minh chuyên môn (nộp chứng chỉ + chờ Org/Ministry duyệt)
- **UC-G07**: Truy cập + cập nhật hồ sơ bệnh nhân (request, đọc, addRecordByDoctor)
- **UC-G08**: Uỷ quyền lại + tra cứu khẩn cấp (delegate, CCCD lookup)

### Quản trị viên Tổ chức (2 nhóm — phân rã ở [12-usecase-org.md](12-usecase-org.md))
- **UC-G09**: Quản lý thành viên Bác sĩ (thêm/loại bỏ)
- **UC-G10**: Xác minh + thu hồi xác minh Bác sĩ

### Bộ Y tế (2 nhóm — phân rã ở [13-usecase-ministry.md](13-usecase-ministry.md))
- **UC-G11**: Quản lý Tổ chức y tế (tạo, tạm dừng, thu hồi xác minh org)
- **UC-G12**: Xác minh Bác sĩ độc lập (verifyDoctorByMinistry)

### Hệ thống tự động (3 nhóm)
- **UC-G13**: Sponsor Relayer (submit sponsored tx, verify EIP-712)
- **UC-G14**: Sync Subgraph (poll events → mirror DB)
- **UC-G15**: Gate canAccess (cross-check on-chain trước khi serve dữ liệu)

## Relationships

- **Bệnh nhân** ↔ Hệ thống (qua UC-G02, G03 — mọi action ghi on-chain phải qua Sponsor Relayer)
- **Bác sĩ** ↔ Hệ thống (UC-G07 — đọc hồ sơ phải qua Gate canAccess)
- **Bệnh nhân** ↔ **Bác sĩ** (cấp phép gián tiếp qua hệ thống — UC-G02/G03)
- **Bác sĩ** ↔ **Org/Ministry** (Org/Ministry verify, doctor refuse khi unverified)
- **Org** ↔ **Ministry** (Ministry tạo org, ministry có thể tạm dừng org)

## PlantUML

Xem [01-usecase-overview.puml](01-usecase-overview.puml).

## Layout gợi ý Astah

- 4 actor user xếp trái (top→bottom: Patient → Doctor → Org → Ministry)
- 1 actor System ở phải (gọn cuối)
- 15 use case ellipse ở giữa, nhóm theo actor
- Caption: "Use Case tổng quan — 4 vai trò người dùng × 12 nhóm chức năng + 3 chức năng tự động"
