# Implementation Roadmap - 7-10 Days

## 🎯 MỤC TIÊU

Chuyển từ "Web2 app gắn ví" → "Blockchain EHR đúng nghĩa"

---

## 📅 TUẦN 1: CRITICAL (Không có = đồ án chết)

### Ngày 1-2: RecordRegistry Integration

- [ ] **Backend**: Thêm ABI của RecordRegistry
- [ ] **Backend**: Thêm `addRecordFor()` vào relayer.service.js
- [ ] **Backend**: Cập nhật upload flow gọi on-chain
- [ ] **Backend**: Verify `recordExists()` trước khi cho access
- [ ] **Test**: Upload record → check Arbiscan có tx

### Ngày 3-4: AccessControl Integration

- [ ] **Backend**: Thêm ABI của AccessControl
- [ ] **Backend**: Thêm `registerPatientFor()` / `registerDoctorFor()` 
- [ ] **Backend**: Cập nhật auth.routes.js gọi on-chain khi user login lần đầu
- [ ] **Backend**: Thêm `isPatient()` / `isDoctor()` check trước mỗi operation
- [ ] **Test**: Login mới → check Arbiscan có tx registration

### Ngày 5: Verification Layer

- [ ] **Backend**: Tạo middleware verify role on-chain
- [ ] **Backend**: Update all routes kiểm tra role on-chain
- [ ] **Frontend**: Hiển thị on-chain role status
- [ ] **Test**: End-to-end login → upload → verify

---

## 📅 TUẦN 2: HIGH PRIORITY (Làm đẹp đồ án)

### Ngày 6-7: EHRSystemSecure Complete

- [ ] **Backend**: Fetch requests từ on-chain events
- [ ] **Frontend**: UI approve/reject request
- [ ] **Backend**: Gọi `confirmAccessRequest()` / `rejectRequest()` on-chain
- [ ] **Test**: Doctor request → Patient approve on-chain → consent granted

### Ngày 8-9: UI/UX Polish

- [ ] **Frontend**: Hiển thị on-chain status mọi nơi
- [ ] **Frontend**: Gọi `getConsent()` hiển thị chi tiết consent
- [ ] **Frontend**: Expiration UI improvements
- [ ] **Test**: Full E2E testing

### Ngày 10: Buffer & Documentation

- [ ] **Docs**: Update walkthrough với on-chain proofs
- [ ] **Docs**: Screenshots Arbiscan transactions
- [ ] **Fix**: Any remaining bugs

---

## 🔧 CẦN CHUẨN BỊ TRƯỚC

### Contract Addresses (cần có trong .env)

```env
# Từ deploy output của contracts
NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS=0x...
NEXT_PUBLIC_RECORD_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS=0xa849861388693464826F8268d374fbbfA4c4e9e6
NEXT_PUBLIC_EHR_SYSTEM_ADDRESS=0x...
NEXT_PUBLIC_DOCTOR_UPDATE_ADDRESS=0x...
```

### Relayer Setup

- [ ] Relayer wallet được authorized trong AccessControl (`setRelayer`)
- [ ] Relayer wallet được authorized trong RecordRegistry (`authorizeSponsor`)
- [ ] Relayer wallet được authorized trong ConsentLedger (`authorizeSponsor`)

---

## 📊 CHECKLIST BẢO VỆ ĐỒ ÁN

### Câu hỏi hội đồng hay hỏi:

1. **"Records được lưu ở đâu?"**
   - ✅ Trả lời: CID lưu IPFS, cidHash đăng ký on-chain qua RecordRegistry

2. **"Làm sao biết ai là Patient, ai là Doctor?"**
   - ✅ Trả lời: Role được ghi on-chain qua AccessControl contract

3. **"Nếu backend bị hack thì sao?"**
   - ✅ Trả lời: Attacker không thể tạo fake records vì RecordRegistry reject

4. **"Consent được quản lý thế nào?"**
   - ✅ Trả lời: On-chain qua ConsentLedger, dùng EIP-712 signature

5. **"Cho xem transaction on-chain?"**
   - ✅ Trả lời: [Mở Arbiscan → show grantBySig, addRecordFor, registerPatientFor]

---

## 🚀 BẮT ĐẦU NGAY

Bước tiếp theo: Implement RecordRegistry.addRecordFor() vào backend.

**Cần từ bạn:**
1. Contract addresses (tất cả 5 contracts)
2. Confirm relayer wallet đã được authorize trên các contracts
