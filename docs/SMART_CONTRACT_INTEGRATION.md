# Smart Contract Integration Requirements

## Overview

Hệ thống EHR có **5 smart contracts** đã deploy trên Arbitrum Sepolia. Tài liệu này mô tả chi tiết những gì cần triển khai từ mỗi contract.

---

## 1. AccessControl.sol

**Mục đích:** Quản lý vai trò người dùng (Patient, Doctor, Organization, Ministry)

### Functions Cần Triển Khai

| Function | Mô Tả | Ai Gọi | Hiện Trạng |
|----------|-------|--------|------------|
| `registerAsPatient()` | Đăng ký vai trò Patient | User (qua relayer) | ⚠️ **CHƯA TRIỂN KHAI** |
| `registerAsDoctor()` | Đăng ký vai trò Doctor | User (qua relayer) | ⚠️ **CHƯA TRIỂN KHAI** |
| `registerPatientFor(address)` | Relayer đăng ký Patient cho user | Relayer | ⚠️ **CHƯA TRIỂN KHAI** |
| `registerDoctorFor(address)` | Relayer đăng ký Doctor cho user | Relayer | ⚠️ **CHƯA TRIỂN KHAI** |
| `isPatient(address)` | Kiểm tra có phải Patient | Backend/Frontend | ⚠️ **CHƯA TRIỂN KHAI** |
| `isDoctor(address)` | Kiểm tra có phải Doctor | Backend/Frontend | ⚠️ **CHƯA TRIỂN KHAI** |
| `getUserStatus(address)` | Lấy tất cả roles của user | Frontend | ⚠️ **CHƯA TRIỂN KHAI** |
| `verifyDoctor(address, string)` | Xác thực Doctor (bởi Org) | Org/Ministry | ⚠️ **CHƯA TRIỂN KHAI** |
| `verifyOrganization(address, string)` | Xác thực Organization | Ministry | ⚠️ **CHƯA TRIỂN KHAI** |
| `setRelayer(address, bool)` | Cấp/thu hồi quyền relayer | Ministry | ✅ Chỉ setup 1 lần |

### Flow Cần Triển Khai

```
User Đăng Ký Role:
1. User login qua Web3Auth
2. Backend kiểm tra: isPatient(address) hoặc isDoctor(address)
3. Nếu chưa đăng ký → Gọi registerPatientFor() hoặc registerDoctorFor() qua Relayer
4. Emit event on-chain
```

### ⚠️ VẤN ĐỀ HIỆN TẠI

Backend hiện tại lưu role trong **DATABASE ONLY**. Không có on-chain registration.

```javascript
// backend/src/routes/auth.routes.js - CHỈ LƯU DB, KHÔNG ON-CHAIN
await prisma.user.create({
    data: { walletAddress, role: 'patient' } // ❌ Thiếu on-chain!
})
```

---

## 2. RecordRegistry.sol

**Mục đích:** Đăng ký hồ sơ y tế on-chain (CID hash, ownership, versioning)

### Functions Cần Triển Khai

| Function | Mô Tả | Ai Gọi | Hiện Trạng |
|----------|-------|--------|------------|
| `addRecord(bytes32, bytes32, bytes32)` | Patient thêm record | Patient | ⚠️ **CHƯA TRIỂN KHAI** |
| `addRecordFor(bytes32, bytes32, bytes32, address)` | Relayer thêm record cho Patient | Relayer | ⚠️ **CHƯA TRIỂN KHAI** |
| `addRecordByDoctor(bytes32, bytes32, bytes32, address)` | Doctor thêm record | Doctor | ⚠️ **CHƯA TRIỂN KHAI** |
| `updateRecordCID(bytes32, bytes32)` | Cập nhật CID (corrections) | Owner/Creator | ⚠️ **CHƯA TRIỂN KHAI** |
| `transferOwnership(bytes32, address)` | Chuyển quyền sở hữu record | Owner | ⚠️ **CHƯA TRIỂN KHAI** |
| `getRecord(bytes32)` | Lấy thông tin record | Frontend | ⚠️ **CHƯA TRIỂN KHAI** |
| `getOwnerRecords(address)` | Lấy danh sách records của user | Frontend | ⚠️ **CHƯA TRIỂN KHAI** |
| `recordExists(bytes32)` | Kiểm tra record tồn tại | Backend/Frontend | ⚠️ **CHƯA TRIỂN KHAI** |
| `authorizeSponsor(address, bool)` | Cấp quyền sponsor | Deployer | ✅ Setup 1 lần |

### Flow Cần Triển Khai

```
Patient Upload Record:
1. Encrypt file với AES-256
2. Upload encrypted file lên IPFS → nhận CID
3. Tính cidHash = keccak256(bytes(CID))
4. Gọi addRecordFor(cidHash, parentCidHash, recordTypeHash, patient) qua Relayer
5. Lưu metadata vào DB
```

### ⚠️ VẤN ĐỀ HIỆN TẠI - **RẤT NGHIÊM TRỌNG**

Backend hiện tại **CHỈ LƯU DB + IPFS**, không đăng ký on-chain!

```javascript
// backend/src/services/relayer.service.js - THIẾU ON-CHAIN
export async function sponsorUpload(...) {
    // ❌ KHÔNG GỌI addRecordFor() trên RecordRegistry!
    // Chỉ lưu DB:
    await prisma.recordMetadata.create({ ... })
}
```

**Hậu quả:**
- Records không có proof on-chain
- Không thể verify ownership
- ConsentLedger không biết record tồn tại
- Mất tính phi tập trung!

---

## 3. ConsentLedger.sol

**Mục đích:** Quản lý quyền truy cập (consent) on-chain

### Functions Cần Triển Khai

| Function | Mô Tả | Ai Gọi | Hiện Trạng |
|----------|-------|--------|------------|
| `grantBySig(...)` | Cấp consent bằng EIP-712 signature | Relayer | ✅ **ĐÃ TRIỂN KHAI** |
| `revoke(address, bytes32)` | Thu hồi consent (Patient tự gọi) | Patient | ⚠️ **CHƯA TRIỂN KHAI** |
| `revokeFor(address, address, bytes32)` | Relayer thu hồi consent | Relayer | ✅ **ĐÃ TRIỂN KHAI** |
| `canAccess(address, address, bytes32)` | Kiểm tra quyền truy cập | Backend | ✅ **ĐÃ TRIỂN KHAI** |
| `getConsent(address, address, bytes32)` | Lấy chi tiết consent | Frontend | ⚠️ **CHƯA TRIỂN KHAI** |
| `getNonce(address)` | Lấy nonce cho EIP-712 | Frontend | ✅ **ĐÃ TRIỂN KHAI** |
| `grantDelegation(...)` | Cấp delegation toàn quyền | Patient | ⚠️ **CHƯA TRIỂN KHAI** |
| `grantUsingDelegation(...)` | Sử dụng delegation | Delegatee | ⚠️ **CHƯA TRIỂN KHAI** |
| `grantUsingRecordDelegation(...)` | Sử dụng per-record delegation | Delegatee | ⚠️ **CHƯA TRIỂN KHAI** |
| `authorizeSponsor(address, bool)` | Cấp quyền sponsor | Admin | ✅ Setup 1 lần |

### Flow Đã Triển Khai

```
Patient Grant Access (On-chain):
1. Patient chọn record + Doctor
2. Frontend lấy nonce từ ConsentLedger
3. Frontend tạo EIP-712 message
4. Patient ký message
5. Gọi grantBySig() qua Relayer ✅
```

### ⚠️ VẤN ĐỀ

- Delegation features chưa triển khai
- `getConsent()` chưa được UI gọi để hiển thị consent details

---

## 4. EHRSystemSecure.sol

**Mục đích:** Xử lý Access Requests (Doctor yêu cầu truy cập)

### Functions Cần Triển Khai

| Function | Mô Tả | Ai Gọi | Hiện Trạng |
|----------|-------|--------|------------|
| `requestAccess(...)` | Doctor gửi yêu cầu | Doctor | ✅ **ĐÃ TRIỂN KHAI** |
| `confirmAccessRequest(bytes32)` | Xác nhận request (direct call) | Patient/Doctor | ⚠️ **CHƯA TRIỂN KHAI** |
| `confirmAccessRequestWithSignature(...)` | Xác nhận bằng signature | Anyone + Patient sig | ⚠️ **CHƯA TRIỂN KHAI** |
| `rejectRequest(bytes32)` | Từ chối request | Patient/Doctor | ⚠️ **CHƯA TRIỂN KHAI** |
| `getAccessRequest(bytes32)` | Lấy chi tiết request | Frontend | ⚠️ **CHƯA TRIỂN KHAI** |

### Types

```solidity
enum RequestType {
    DirectAccess,      // 0 - Truy cập 1 record cụ thể
    FullDelegation,    // 1 - Quyền toàn bộ records
    RecordDelegation   // 2 - Quyền chia sẻ lại 1 record
}
```

### Flow Đã Triển Khai Một Phần

```
Doctor Request Access:
1. Doctor gọi requestAccess() ✅ (on-chain)
2. Patient xem request ⚠️ (chưa fetch từ on-chain)
3. Patient approve/reject ⚠️ (chưa triển khai)
4. Nếu approved → ConsentLedger.grantInternal() được gọi tự động
```

### ⚠️ VẤN ĐỀ HIỆN TẠI

- Backend lưu request trong **DATABASE**, không đồng bộ với on-chain
- Patient không thể `confirmAccessRequest()` hoặc `rejectRequest()` on-chain
- Thiếu mechanism để sync on-chain requests với DB

---

## 5. DoctorUpdate.sol

**Mục đích:** Doctor thêm record cho Patient (với temporary access tự động)

### Functions Cần Triển Khai

| Function | Mô Tả | Ai Gọi | Hiện Trạng |
|----------|-------|--------|------------|
| `addRecordByDoctor(...)` | Doctor tạo record cho Patient | Doctor | ⚠️ **CHƯA TRIỂN KHAI** |
| `grantEmergencyAccess(...)` | Cấp truy cập khẩn cấp | Doctor (+ 2 witnesses) | ⚠️ **CHƯA TRIỂN KHAI** |
| `getAccessLimits()` | Lấy time limits | Frontend | ⚠️ **CHƯA TRIỂN KHAI** |

### Flow Cần Triển Khai

```
Doctor Creates Record for Patient:
1. Doctor encrypt file + upload IPFS
2. Doctor gọi addRecordByDoctor(cidHash, ...)
3. Contract tự động:
   - Gọi RecordRegistry.addRecordByDoctor() 
   - Gọi ConsentLedger.grantInternal() cho Doctor (7 days mặc định)
4. Emit events
```

### ⚠️ VẤN ĐỀ

- Hoàn toàn chưa triển khai
- Rất hữu ích cho clinic workflow

---

## Tổng Kết Mức Độ Triển Khai

| Contract | Triển Khai | Thiếu Sót |
|----------|------------|-----------|
| AccessControl | 0% | Toàn bộ role management chưa on-chain |
| RecordRegistry | 0% | **CRITICAL**: Upload không on-chain |
| ConsentLedger | 60% | Grant ✅, Revoke ✅, Delegation ❌ |
| EHRSystemSecure | 30% | Request ✅, Confirm/Reject ❌ |
| DoctorUpdate | 0% | Doctor workflow chưa triển khai |

---

## Ưu Tiên Triển Khai

### 🔴 CRITICAL (Bắt buộc)

1. **RecordRegistry.addRecordFor()** - Records phải được đăng ký on-chain
2. **AccessControl.registerPatientFor()/registerDoctorFor()** - Roles phải on-chain

### 🟠 HIGH (Nên có)

3. **EHRSystemSecure.confirmAccessRequest()** - Patient approve request on-chain
4. **EHRSystemSecure.rejectRequest()** - Patient reject on-chain
5. **ConsentLedger.getConsent()** - Hiển thị consent details từ on-chain

### 🟡 MEDIUM (Tính năng nâng cao)

6. **ConsentLedger.grantDelegation()** - Delegation full access
7. **DoctorUpdate.addRecordByDoctor()** - Doctor workflow
8. **DoctorUpdate.grantEmergencyAccess()** - Emergency access

### 🟢 LOW (Future)

9. **AccessControl verification** - verifyDoctor, verifyOrganization
10. **RecordRegistry.updateRecordCID()** - Corrections
11. **RecordRegistry.transferOwnership()** - Transfer records

---

## Contract Addresses

Cần được set trong `.env`:

```env
# Contracts (Arbitrum Sepolia)
NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS=0x...
NEXT_PUBLIC_RECORD_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS=0x...
NEXT_PUBLIC_EHR_SYSTEM_ADDRESS=0x...
NEXT_PUBLIC_DOCTOR_UPDATE_ADDRESS=0x...
```

---

## Flow Diagram Tổng Quan

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER (Frontend)                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Auth      │  │   Records   │  │   KeyShare  │              │
│  │   Routes    │  │   Routes    │  │   Routes    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────────────────────────────────────────┐            │
│  │              RELAYER SERVICE                     │            │
│  │  - Trả gas cho user                              │            │
│  │  - Gọi contracts on-chain                        │            │
│  └─────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BLOCKCHAIN (Arbitrum Sepolia)                 │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ AccessControl│  │RecordRegistry│  │ConsentLedger│              │
│  │             │  │             │  │             │              │
│  │ - Roles     │  │ - Records   │  │ - Consents  │              │
│  │ - Verify    │  │ - Ownership │  │ - Delegation│              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│         ▲                ▲                ▲                      │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          │                                       │
│              ┌───────────┴───────────┐                          │
│              │    EHRSystemSecure    │                          │
│              │  - Access Requests    │                          │
│              │  - Orchestration      │                          │
│              └───────────────────────┘                          │
│                          │                                       │
│              ┌───────────┴───────────┐                          │
│              │     DoctorUpdate      │                          │
│              │  - Doctor workflows   │                          │
│              │  - Emergency access   │                          │
│              └───────────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         IPFS (Pinata)                            │
│              Encrypted files stored here                         │
└─────────────────────────────────────────────────────────────────┘
```
