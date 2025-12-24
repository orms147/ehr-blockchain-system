# EHR System - Complete Test Flow Guide

> **Điều kiện tiên quyết:** Đã có tài khoản Patient và Doctor đăng nhập qua Web3Auth.  
> **Loại trừ:** Đăng ký/đăng nhập, bệnh nhân tải hồ sơ lên.

---

## 🔐 PHASE 1: Access Control Flow

### Test 1.1: Doctor Yêu cầu Truy cập Hồ sơ

**Người thực hiện:** Doctor

1. Đăng nhập với tài khoản Doctor
2. Vào **Dashboard Doctor** → Tab **"Yêu cầu truy cập"**
3. Nhập thông tin:
   - Địa chỉ ví bệnh nhân: `0x...` (từ tài khoản Patient)
   - CID Hash của hồ sơ cần truy cập
   - Loại yêu cầu: `VIEW_ONLY` hoặc `FULL_ACCESS`
   - Thời hạn: 7 ngày
4. Click **"Gửi yêu cầu"**
5. Ký transaction với MetaMask/Web3Auth

**Kết quả mong đợi:**
- Toast thông báo thành công
- Request xuất hiện trong tab **"Đã gửi"** với status `Đang chờ`

---

### Test 1.2: Patient Phê duyệt Yêu cầu

**Người thực hiện:** Patient

1. Đăng nhập với tài khoản Patient
2. Vào **Dashboard Patient** → Tab **"Yêu cầu"**
3. Thấy request từ Doctor với thông tin:
   - Địa chỉ bác sĩ
   - CID Hash hồ sơ
   - Deadline
4. Click **"Phê duyệt"**
5. Ký EIP-712 signature khi MetaMask popup

**Kết quả mong đợi:**
- Toast thông báo "Đã phê duyệt"
- Request biến mất khỏi danh sách pending
- Doctor có thể xem hồ sơ

---

### Test 1.3: Patient Từ chối/Ẩn Yêu cầu

**Người thực hiện:** Patient

1. Đăng nhập với tài khoản Patient
2. Tab **"Yêu cầu"** → Tìm một request pending
3. Click **"Ẩn"** (archive)

**Kết quả mong đợi:**
- Request biến mất khỏi danh sách
- Request vẫn tồn tại trong database với status pending

---

### Test 1.4: Patient Thu hồi Quyền truy cập

**Người thực hiện:** Patient

1. Tab **"Đã cấp quyền"**
2. Thấy danh sách consents đã cấp cho doctors
3. Click **"Thu hồi"** cho một consent
4. Confirm dialog

**Kết quả mong đợi:**
- Transaction được sponsor (không mất gas)
- Consent chuyển sang status `revoked`
- Doctor không còn quyền xem hồ sơ

---

### Test 1.5: Kiểm tra Quota Display

**Người thực hiện:** Patient

1. Dashboard Patient → Xem component QuotaDisplay
2. Kiểm tra hiển thị:
   - Số lần upload còn lại: X/5
   - Số lần revoke còn lại: Y/3

**Kết quả mong đợi:**
- Số liệu chính xác theo tháng
- Cập nhật sau mỗi action

---

## 👨‍⚕️ PHASE 2: Doctor Features

### Test 2.1: Doctor Gửi Xác thực

**Người thực hiện:** Doctor (chưa verified)

1. Dashboard Doctor → Tab **"Xác thực"**
2. Component `DoctorVerificationForm` hiển thị status "Chưa xác thực"
3. Điền form:
   - Họ tên đầy đủ
   - Số chứng chỉ hành nghề
   - Chuyên khoa
   - Tổ chức/Bệnh viện
4. Upload tài liệu (giấy phép hành nghề)
5. Click **"Gửi xác thực"**

**Kết quả mong đợi:**
- Status chuyển sang "Đang chờ duyệt"
- Form bị disable
- Admin sẽ thấy request trong dashboard

---

### Test 2.2: Admin Duyệt Doctor

**Người thực hiện:** Admin/Ministry

1. Vào `/dashboard/admin`
2. Tab **"Đang chờ"** → Thấy danh sách verification requests
3. Click vào một request để xem chi tiết
4. Click **"Phê duyệt"**
5. Ký transaction on-chain (verifyDoctor)

**Kết quả mong đợi:**
- Doctor được verify on-chain
- Request status → `approved`
- Doctor thấy badge "Đã xác thực" trên dashboard

---

### Test 2.3: Admin Từ chối Doctor

**Người thực hiện:** Admin

1. Dashboard Admin → Xem một pending request
2. Nhập lý do từ chối
3. Click **"Từ chối"**

**Kết quả mong đợi:**
- Request status → `rejected`
- Doctor thấy thông báo bị từ chối với lý do

---

### Test 2.4: Doctor Thêm Hồ sơ cho Bệnh nhân

**Người thực hiện:** Doctor (đã verified)

1. Dashboard Doctor → Tab **"Thêm hồ sơ"**
2. Component `DoctorAddRecordForm`:
   - Nhập địa chỉ ví bệnh nhân
   - Chọn loại hồ sơ (Chẩn đoán, Đơn thuốc, v.v.)
   - Nhập tiêu đề
   - Nhập ghi chú/nội dung
   - Upload file đính kèm (tùy chọn)
3. Click **"Tạo và chia sẻ hồ sơ"**
4. Ký transaction

**Kết quả mong đợi:**
- Hồ sơ được mã hóa và upload IPFS
- Transaction ghi on-chain
- Key tự động share cho patient
- Patient thấy hồ sơ trong dashboard của họ

---

## 🚨 PHASE 3: Advanced Features

### Test 3.1: Doctor Yêu cầu Truy cập Khẩn cấp

**Người thực hiện:** Doctor (verified)

1. Dashboard Doctor → Tab mới hoặc form `EmergencyAccessForm`
2. Điền:
   - Địa chỉ ví bệnh nhân
   - Loại khẩn cấp: Cấp cứu y tế / Tai nạn / Nguy kịch
   - Lý do (min 10 ký tự)
   - Địa điểm cấp cứu
   - Thời hạn: 12/24/48 giờ
3. Click **"Yêu cầu truy cập khẩn cấp"**

**Kết quả mong đợi:**
- Emergency access được tạo
- Doctor có quyền xem hồ sơ ngay lập tức
- Có log audit trail
- Tự động hết hạn sau thời gian đã chọn

---

### Test 3.2: Patient Xem/Thu hồi Emergency Access

**Người thực hiện:** Patient

1. API call: `GET /api/emergency/patient/{patientAddress}`
2. Thấy danh sách emergency accesses
3. Có thể revoke sớm nếu muốn

**Kết quả mong đợi:**
- Thấy ai đang có emergency access
- Thu hồi thành công

---

### Test 3.3: Patient Ủy quyền Người thân

**Người thực hiện:** Patient

1. Component `DelegationManager` trong Dashboard Patient
2. Click **"Thêm"**
3. Nhập địa chỉ ví người thân
4. Chọn loại ủy quyền:
   - Toàn quyền: xem/quản lý tất cả
   - Giới hạn: chỉ xem một số hồ sơ
   - Khẩn cấp: chỉ trong trường hợp emergency
5. Click **"Thêm ủy quyền"**

**Kết quả mong đợi:**
- Delegation được tạo
- Người thân có thể truy cập theo quyền

---

### Test 3.4: Patient Thu hồi Ủy quyền

**Người thực hiện:** Patient

1. `DelegationManager` → Danh sách delegates
2. Click nút xóa (trash icon) cho một delegate
3. Confirm

**Kết quả mong đợi:**
- Delegation bị revoke
- Người thân mất quyền truy cập

---

### Test 3.5: [API] Đăng ký Tổ chức Y tế

**Người thực hiện:** Organization Admin

```bash
POST /api/org/register
{
  "name": "Bệnh viện ABC",
  "orgType": "hospital",
  "licenseNumber": "BV-123456",
  "location": "TP.HCM",
  "contactEmail": "admin@bviabc.com"
}
```

**Kết quả mong đợi:**
- Organization được tạo với `isVerified: false`
- Creator tự động thành admin của org

---

### Test 3.6: [API] Thêm Doctor vào Tổ chức

**Người thực hiện:** Org Admin

```bash
POST /api/org/{orgId}/add-member
{
  "memberAddress": "0xDoctorAddress...",
  "role": "doctor"
}
```

**Kết quả mong đợi:**
- Doctor được thêm vào org
- Có thể query members của org

---

## 📊 API Testing Endpoints

### Health Check
```bash
GET http://localhost:3001/health
# Response: { "status": "ok", "timestamp": "..." }
```

### Access Requests
```bash
# Get incoming requests (Patient)
GET /api/requests/incoming

# Get outgoing requests (Doctor)
GET /api/requests/outgoing

# Create request (Doctor)
POST /api/requests/create
```

### Consents
```bash
# Get active consents (Patient)
GET /api/consent/my-consents

# Revoke consent
POST /api/relayer/revoke
```

### Emergency Access
```bash
# Request emergency (Doctor)
POST /api/emergency/request

# Get active emergency (Doctor)
GET /api/emergency/active

# Check access (Doctor)
GET /api/emergency/check/{patientAddress}
```

### Delegation
```bash
# Create delegation (Patient)
POST /api/delegation/create

# Get my delegates (Patient)
GET /api/delegation/my-delegates

# Check delegation
GET /api/delegation/check/{patientAddress}
```

---

## ⚠️ Lưu ý Quan trọng

1. **Authentication**: Tất cả API calls cần header `Authorization: Bearer {token}` từ Web3Auth
2. **Gas**: Một số actions cần gas (upload, verify doctor), một số được sponsor (revoke)
3. **On-chain vs Off-chain**: 
   - On-chain: verify doctor, grant consent, create record
   - Off-chain: requests, delegations, emergency tracking
4. **Expiry**: Emergency access và requests có thời hạn, sẽ tự động expire

---

## 🔄 Test Sequence Recommended

1. ✅ Doctor yêu cầu truy cập → Patient phê duyệt
2. ✅ Doctor xem hồ sơ được share
3. ✅ Patient thu hồi quyền
4. ✅ Doctor gửi xác thực → Admin duyệt
5. ✅ Doctor (verified) thêm hồ sơ cho patient
6. ✅ Doctor yêu cầu emergency access
7. ✅ Patient thêm ủy quyền người thân
8. ✅ Người thân truy cập hồ sơ thay patient
