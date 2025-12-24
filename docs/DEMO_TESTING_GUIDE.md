# Demo Testing Guide - EHR Blockchain System

## Contract Addresses (Arbitrum Sepolia)

| Contract | Address | Arbiscan |
|----------|---------|----------|
| AccessControl | `0xe890AF9C59A0199bF28a1a2313599B4bC357E429` | [View ↗](https://sepolia.arbiscan.io/address/0xe890AF9C59A0199bF28a1a2313599B4bC357E429) |
| RecordRegistry | `0x241cef7BC4351aE7003417982BBA23BDfac69Bb7` | [View ↗](https://sepolia.arbiscan.io/address/0x241cef7BC4351aE7003417982BBA23BDfac69Bb7) |
| ConsentLedger | `0xa849861388693464826F8268d374fbbfA4c4e9e6` | [View ↗](https://sepolia.arbiscan.io/address/0xa849861388693464826F8268d374fbbfA4c4e9e6) |
| EHRSystemSecure | `0xEA0168F7d79B0A99a2D87135E12c6e087feAfC8d` | [View ↗](https://sepolia.arbiscan.io/address/0xEA0168F7d79B0A99a2D87135E12c6e087feAfC8d) |
| DoctorUpdate | `0xF68865C1814743BE9910489958912B1B74647718` | [View ↗](https://sepolia.arbiscan.io/address/0xF68865C1814743BE9910489958912B1B74647718) |

**Sponsor/Relayer**: `0x71aDE4593711749EA08A3552A59A832c1b40A955`

---

## 🔄 Luồng Demo 1: Patient Registration + Upload Record

### Mục đích
Chứng minh user được đăng ký role on-chain và record được lưu on-chain.

### Bước thực hiện

1. **Login với tài khoản mới (hoặc đã có)**
   - Mở `http://localhost:5173`
   - Login qua Web3Auth (Google)
   - Chọn role "Patient"

2. **Kiểm tra role on-chain**
   - Mở Arbiscan AccessControl: [Link](https://sepolia.arbiscan.io/address/0xe890AF9C59A0199bF28a1a2313599B4bC357E429#readContract)
   - Gọi `isPatient(địa_chỉ_ví_user)` → Expected: `true`
   - Hoặc gọi `getUserStatus(địa_chỉ_ví_user)` để xem toàn bộ roles

3. **Upload một hồ sơ y tế**
   - Vào Dashboard → "Thêm hồ sơ mới"
   - Chọn file (PDF/ảnh)
   - Điền thông tin → Submit

4. **Xác nhận on-chain**
   - Mở Arbiscan RecordRegistry: [Link](https://sepolia.arbiscan.io/address/0x241cef7BC4351aE7003417982BBA23BDfac69Bb7#readContract)
   - Gọi `getOwnerRecords(địa_chỉ_ví_patient)` → Expected: Array có cidHash
   - Hoặc xem tab "Events" → tìm `RecordAdded` event

### Verify Points
- [ ] Transaction từ Sponsor wallet (`0x71aD...`)
- [ ] Event `RecordAdded` với đúng patient address
- [ ] `recordExists(cidHash)` trả về `true`

---

## 🔄 Luồng Demo 2: Doctor Registration + Request Access

### Mục đích
Chứng minh Doctor có thể gửi request truy cập on-chain.

### Bước thực hiện

1. **Login với tài khoản khác → Chọn role "Doctor"**
   - Mở incognito hoặc browser khác
   - Login → Chọn "Bác sĩ"

2. **Kiểm tra role on-chain**
   - AccessControl → `isDoctor(địa_chỉ_doctor)` → Expected: `true`

3. **Tìm kiếm bệnh nhân**
   - Nhập địa chỉ ví của Patient từ Demo 1
   - Xem danh sách records

4. **Gửi yêu cầu truy cập**
   - Click "Yêu cầu truy cập" trên 1 record
   - Điền lý do + thời hạn
   - Submit

5. **Xác nhận on-chain**
   - Mở Arbiscan EHRSystemSecure: [Link](https://sepolia.arbiscan.io/address/0xEA0168F7d79B0A99a2D87135E12c6e087feAfC8d)
   - Xem tab "Events" → tìm `AccessRequested` event
   - Lấy `reqId` từ event

### Verify Points
- [ ] Event `AccessRequested` với đúng doctor & patient addresses
- [ ] `getAccessRequest(reqId)` trả về status = `Pending`

---

## 🔄 Luồng Demo 3: Patient Grants Access (Consent)

### Mục đích
Chứng minh Patient có thể cấp quyền truy cập bằng EIP-712 signature, ghi on-chain.

### Bước thực hiện

1. **Quay lại tài khoản Patient**
   - Dashboard → "Yêu cầu truy cập" hoặc "Đã chia sẻ"

2. **Xem yêu cầu từ Doctor**
   - Sẽ thấy request với trạng thái "Chờ xử lý"

3. **Cấp quyền truy cập**
   - Click "Chấp nhận"
   - Ký EIP-712 message (popup từ Web3Auth)
   - Đợi transaction hoàn thành

4. **Xác nhận on-chain**
   - Mở Arbiscan ConsentLedger: [Link](https://sepolia.arbiscan.io/address/0xa849861388693464826F8268d374fbbfA4c4e9e6)
   - Xem tab "Events" → tìm `ConsentGranted` event
   - Gọi `canAccess(patient, doctor, cidHash)` → Expected: `true`
   - Gọi `getConsent(patient, doctor, cidHash)` → Xem chi tiết consent

### Verify Points
- [ ] Transaction từ Sponsor wallet (gas sponsorship)
- [ ] Event `ConsentGranted` với đúng patient, grantee, cidHash
- [ ] `canAccess()` trả về `true`
- [ ] `getConsent()` có `active = true`, `expireAt` đúng

---

## 🔄 Luồng Demo 4: Doctor Views Record

### Mục đích
Chứng minh Doctor có thể xem record sau khi được cấp quyền.

### Bước thực hiện

1. **Quay lại tài khoản Doctor**
   - Dashboard → "Records được chia sẻ" hoặc tìm lại patient

2. **Xem record đã được cấp quyền**
   - Record sẽ có nút "Xem" (không bị khoá)
   - Click để xem nội dung

3. **Xác nhận**
   - Nội dung record hiển thị đúng
   - AccessLog được ghi (kiểm tra trong Prisma Studio)

### Verify Points
- [ ] Doctor có thể decrypt và xem record
- [ ] AccessLog ghi lại action `VIEW_RECORD`

---

## 🔄 Luồng Demo 5: Patient Revokes Access

### Mục đích
Chứng minh Patient có thể thu hồi quyền truy cập on-chain.

### Bước thực hiện

1. **Tài khoản Patient**
   - Dashboard → "Đã chia sẻ"
   - Tìm consent đã grant cho Doctor

2. **Thu hồi quyền**
   - Click "Thu hồi" / "Revoke"
   - Xác nhận

3. **Xác nhận on-chain**
   - Arbiscan ConsentLedger → Events → `ConsentRevoked`
   - Gọi `canAccess(patient, doctor, cidHash)` → Expected: `false`
   - Gọi `getConsent(...)` → `active = false`

4. **Kiểm tra Doctor không còn access**
   - Quay lại Doctor account
   - Record trở về trạng thái "Khoá" / không xem được

### Verify Points
- [ ] Event `ConsentRevoked` có timestamp
- [ ] `canAccess()` trả về `false`
- [ ] Doctor không thể decrypt record nữa

---

## 🔄 Luồng Demo 6: Consent Expiration (Optional)

### Mục đích
Chứng minh consent tự động hết hạn.

### Bước thực hiện

1. **Grant consent với thời hạn ngắn (1 giờ)**
2. **Đợi hết hạn** (hoặc set time ngắn hơn để test)
3. **Kiểm tra on-chain**
   - `canAccess()` sẽ trả về `false` sau khi hết hạn
   - (Contract check `block.timestamp > expireAt`)

---

## 📋 Quick Test Checklist

### 1. Setup
- [ ] Backend đang chạy (`localhost:3001`)
- [ ] Frontend đang chạy (`localhost:5173`)
- [ ] Sponsor được authorize (chạy `node scripts/authorizeSponsor.js`)

### 2. Patient Flow
- [ ] Login → role Patient
- [ ] `isPatient()` = true on-chain
- [ ] Upload record → `RecordAdded` event
- [ ] `recordExists(cidHash)` = true

### 3. Doctor Flow
- [ ] Login → role Doctor
- [ ] `isDoctor()` = true on-chain
- [ ] Request access → `AccessRequested` event

### 4. Consent Flow
- [ ] Patient grants → `ConsentGranted` event
- [ ] `canAccess()` = true
- [ ] Doctor views record ✓
- [ ] Patient revokes → `ConsentRevoked` event
- [ ] `canAccess()` = false
- [ ] Doctor cannot view ✗

---

## 🔗 Useful Arbiscan Links

### Read Contract Functions

| Contract | Function | Purpose |
|----------|----------|---------|
| AccessControl | `isPatient(addr)` | Check if address is patient |
| AccessControl | `isDoctor(addr)` | Check if address is doctor |
| AccessControl | `getUserStatus(addr)` | Get all roles |
| RecordRegistry | `recordExists(cidHash)` | Check if record exists |
| RecordRegistry | `getOwnerRecords(addr)` | Get all records of owner |
| RecordRegistry | `getRecord(cidHash)` | Get record details |
| ConsentLedger | `canAccess(patient, grantee, cidHash)` | Check access permission |
| ConsentLedger | `getConsent(patient, grantee, cidHash)` | Get consent details |
| EHRSystemSecure | `getAccessRequest(reqId)` | Get request details |

### Events to Watch

| Contract | Event | Meaning |
|----------|-------|---------|
| AccessControl | `UserRegistered` | New user registered role |
| RecordRegistry | `RecordAdded` | New record uploaded |
| ConsentLedger | `ConsentGranted` | Access granted |
| ConsentLedger | `ConsentRevoked` | Access revoked |
| EHRSystemSecure | `AccessRequested` | Doctor requested access |
| EHRSystemSecure | `RequestCompleted` | Request approved |
| EHRSystemSecure | `RequestRejected` | Request rejected |

---

## 🎥 Demo Recording Tips

1. **Mở sẵn 2 browser** - Patient và Doctor
2. **Mở Arbiscan Events tab** - để show realtime transactions
3. **Giải thích từng bước** - nói rõ đang làm gì và verify ở đâu
4. **Show gas sponsorship** - chỉ ra transaction từ sponsor wallet, không từ user

Good luck! 🚀
