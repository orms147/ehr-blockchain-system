# Hệ Thống Quản Lý Hồ Sơ Bệnh Án Điện Tử (EHR System)

> **Decentralized Electronic Health Records on Blockchain**
> 
> Hệ thống quản lý hồ sơ bệnh án phi tập trung sử dụng Ethereum, IPFS, và mã hóa AES để đảm bảo quyền riêng tư và bảo mật dữ liệu y tế.

---

## 📋 Mục Lục

- [Tổng Quan](#tổng-quan)
- [Kiến Trúc Hệ Thống](#kiến-trúc-hệ-thống)
- [Tính Năng Chính](#tính-năng-chính)
- [Smart Contracts](#smart-contracts)
- [Công Nghệ Sử Dụng](#công-nghệ-sử-dụng)
- [Bắt Đầu](#bắt-đầu)
- [Tài Liệu](#tài-liệu)

---

## 🎯 Tổng Quan

### Vấn Đề

Hệ thống y tế hiện tại gặp nhiều thách thức:
- 🔒 **Thiếu quyền kiểm soát:** Bệnh nhân không kiểm soát được dữ liệu của mình
- 🏥 **Dữ liệu phân mảnh:** Hồ sơ y tế nằm rải rác ở nhiều bệnh viện
- 🔐 **Bảo mật yếu:** Nguy cơ rò rỉ thông tin y tế
- 📝 **Thiếu minh bạch:** Không biết ai đã truy cập hồ sơ
- 💰 **Chi phí cao:** Quản lý và chia sẻ hồ sơ tốn kém

### Giải Pháp

EHR System sử dụng blockchain và IPFS để:
- ✅ **Bệnh nhân làm chủ dữ liệu:** Kiểm soát hoàn toàn quyền truy cập
- ✅ **Dữ liệu phi tập trung:** Lưu trữ an toàn trên IPFS
- ✅ **Bảo mật cao:** Mã hóa AES + blockchain
- ✅ **Minh bạch:** Mọi truy cập được ghi nhận
- ✅ **Tiết kiệm:** Giảm chi phí quản lý

---

## 🏗️ Kiến Trúc Hệ Thống

### Sơ Đồ Tổng Quan

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Web3)                         │
│  - React/Next.js                                                │
│  - Web3Auth (Authentication)                                    │
│  - ethers.js (Blockchain interaction)                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Backend    │  │  Blockchain  │  │     IPFS     │
│   Server     │  │  (Arbitrum)  │  │   Storage    │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ - CID        │  │ - Smart      │  │ - Encrypted  │
│   Mapping    │  │   Contracts  │  │   Medical    │
│ - Access     │  │ - Hash-only  │  │   Data       │
│   Control    │  │   Storage    │  │ - Metadata   │
│ - Audit Log  │  │ - Events     │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Luồng Dữ Liệu

**1. Tạo Hồ Sơ:**
```
Patient → Encrypt Data → Upload IPFS → Get CID → 
Backend stores CID → Smart Contract stores hash(CID)
```

**2. Cấp Quyền Truy Cập:**
```
Patient → Request consent → Doctor approves → 
Smart Contract grants → Backend allows CID retrieval
```

**3. Truy Cập Hồ Sơ:**
```
Doctor → Request CID → Backend checks consent → 
Returns CID → Download from IPFS → Decrypt data
```

---

## ✨ Tính Năng Chính

### 1. Quản Lý Vai Trò (Role Management)

**Multi-role Support:**
- 👤 **Patient (Bệnh nhân):** Tạo và quản lý hồ sơ
- 👨‍⚕️ **Doctor (Bác sĩ):** Tạo hồ sơ cho bệnh nhân, truy cập theo consent
- 🏥 **Organization (Tổ chức):** Quản lý bác sĩ và cơ sở y tế
- 🏛️ **Ministry (Bộ Y Tế):** Xác minh bác sĩ và tổ chức

**Đặc điểm:**
- Một người có thể có nhiều vai trò (bác sĩ cũng là bệnh nhân)
- Xác minh bác sĩ bởi Bộ Y Tế
- Hệ thống phân quyền chặt chẽ

### 2. Quản Lý Hồ Sơ (Record Management)

**Tính năng:**
- 📝 Tạo hồ sơ mới (bệnh nhân hoặc bác sĩ)
- 🔄 Cập nhật hồ sơ (versioning)
- 🌳 Cấu trúc parent-child (hồ sơ con kế thừa từ hồ sơ cha)
- 🔐 Mã hóa AES-256
- 📦 Lưu trữ trên IPFS
- 🔗 Chỉ lưu hash trên blockchain (privacy)

**Bảo mật:**
- ✅ Không lưu plaintext CID on-chain
- ✅ Backend lưu CID với access control
- ✅ IPFS data được mã hóa

### 3. Quản Lý Đồng Ý (Consent Management)

**Cơ chế Double Confirmation:**
```
Doctor requests → Patient approves → 
Wait 1 hour → Doctor confirms → Access granted
```

**Tính năng:**
- ⏰ Time-based consent (có thời hạn)
- 🔄 Revocable (thu hồi được)
- 📋 Delegation (ủy quyền)
- 📝 EIP-712 signatures (ký điện tử)
- 🚨 Emergency access (với witness validation)

**Bảo mật:**
- ✅ Deadline included in signature (chống replay)
- ✅ Nonce-based replay protection
- ✅ Hash-only storage

### 4. Ủy Quyền (Delegation)

**Tính năng:**
- 👥 Bệnh nhân ủy quyền cho người thân
- ⏱️ Có thời hạn
- 🚫 Không cho phép sub-delegate (tránh chuỗi ủy quyền)
- 🔐 EIP-712 signature support

### 5. Truy Cập Khẩn Cấp (Emergency Access)

**Yêu cầu:**
- 👨‍⚕️ Bác sĩ yêu cầu
- 👥 Tối thiểu 2 witnesses (bác sĩ hoặc tổ chức)
- 📝 Justification (lý do)
- ⏰ Thời hạn 24 giờ

---

## 📜 Smart Contracts

### 1. AccessControl.sol
**Chức năng:** Quản lý vai trò và xác minh

**Tính năng chính:**
- Multi-role support (bitwise operations)
- Tự đăng ký vai trò
- Xác minh bác sĩ/tổ chức bởi Bộ Y Tế
- Thu hồi xác minh

**[Xem chi tiết →](./contracts/AccessControl.md)**

---

### 2. RecordRegistry.sol
**Chức năng:** Quản lý hồ sơ y tế

**Tính năng chính:**
- Tạo hồ sơ (bệnh nhân/bác sĩ)
- Cập nhật CID (versioning)
- Parent-child structure
- Hash-only storage (privacy)
- Transfer ownership

**Bảo mật:**
- ✅ NO plaintext CID storage
- ✅ Deployer-only setConsentLedger
- ✅ Access control integration

**[Xem chi tiết →](./contracts/RecordRegistry.md)**

---

### 3. ConsentLedger.sol
**Chức năng:** Quản lý đồng ý truy cập

**Tính năng chính:**
- Grant/revoke consent
- EIP-712 signatures
- Delegation system
- Emergency access
- Hash-only storage

**Bảo mật:**
- ✅ Deadline in signature
- ✅ Nonce-based replay protection
- ✅ Authorization whitelist
- ✅ No plaintext CID

**[Xem chi tiết →](./contracts/ConsentLedger.md)**

---

### 4. DoctorUpdate.sol
**Chức năng:** Bác sĩ tạo hồ sơ cho bệnh nhân

**Tính năng chính:**
- Tạo hồ sơ với auto-consent
- Configurable access duration
- Emergency access with witnesses
- Extend access

**[Xem chi tiết →](./contracts/DoctorUpdate.md)**

---

### 5. EHRSystemSecure.sol
**Chức năng:** Orchestrator - điều phối hệ thống

**Tính năng chính:**
- Double confirmation flow
- Request-approve mechanism
- Time delay security
- Pausable & upgradeable

**[Xem chi tiết →](./contracts/EHRSystemSecure.md)**

---

## 🛠️ Công Nghệ Sử Dụng

### Blockchain
- **Ethereum L2:** Arbitrum/Optimism
- **Smart Contract:** Solidity ^0.8.24
- **Framework:** Foundry
- **Libraries:** OpenZeppelin v5

### Storage
- **Decentralized:** IPFS
- **Encryption:** AES-256-GCM
- **Backend:** PostgreSQL (CID mapping)

### Frontend
- **Framework:** React/Next.js
- **Web3:** ethers.js v6
- **Auth:** Web3Auth
- **UI:** TailwindCSS

### Indexing
- **The Graph:** Subgraph for event indexing
- **GraphQL:** Query interface

### Security
- **Signatures:** EIP-712
- **Account Abstraction:** ERC-4337
- **Access Control:** Role-based + Consent-based

---

## 🚀 Bắt Đầu

### Prerequisites

```bash
# Node.js v18+
node --version

# Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# IPFS
ipfs --version
```

### Installation

```bash
# Clone repository
git clone <repo-url>
cd ERH-system

# Install dependencies
cd contracts
forge install

# Compile contracts
forge build

# Run tests
forge test
```

### Deployment

```bash
# Deploy to testnet
forge script script/deployment.s.sol --rpc-url $RPC_URL --broadcast

# Verify contracts
forge verify-contract <address> <contract> --chain <chain-id>
```

**[Xem hướng dẫn chi tiết →](./guides/DEPLOYMENT.md)**

---

## 📚 Tài Liệu

### Hướng Dẫn Tích Hợp

- **[Backend Integration](./guides/BACKEND_GUIDE.md)** - Xây dựng backend server
- **[Frontend Integration](./guides/FRONTEND_GUIDE.md)** - Tích hợp Web3 frontend
- **[Subgraph Setup](./guides/SUBGRAPH_GUIDE.md)** - Thiết lập The Graph indexer

### Tài Liệu Kỹ Thuật

- **[Architecture](./ARCHITECTURE.md)** - Kiến trúc chi tiết
- **[API Reference](./API_REFERENCE.md)** - Tài liệu API
- **[Events](./EVENTS.md)** - Danh sách events

### Bảo Mật

- **[Security](./SECURITY.md)** - Bảo mật hệ thống
- **[Privacy](./PRIVACY.md)** - Quyền riêng tư
- **[Best Practices](./BEST_PRACTICES.md)** - Thực hành tốt nhất

### Contract Documentation

- [AccessControl.md](./contracts/AccessControl.md)
- [RecordRegistry.md](./contracts/RecordRegistry.md)
- [ConsentLedger.md](./contracts/ConsentLedger.md)
- [DoctorUpdate.md](./contracts/DoctorUpdate.md)
- [EHRSystemSecure.md](./contracts/EHRSystemSecure.md)

---

## 🔐 Bảo Mật

### Audit Status

- ✅ **Phase 1:** Initial audit completed
- ✅ **Phase 2:** Critical fixes implemented
- ⏳ **Phase 3:** External audit pending

### Known Issues

- ⚠️ Requires secure backend infrastructure
- ⚠️ CID mapping must be backed up
- ⚠️ IPFS pinning service needed

### Security Features

- ✅ No plaintext data on-chain
- ✅ EIP-712 signature verification
- ✅ Reentrancy protection
- ✅ Access control enforcement
- ✅ Audit logging

**[Xem chi tiết →](./SECURITY.md)**

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) file

---

## 👥 Contributors

- **Developer:** [Your Name]
- **Advisor:** [Advisor Name]
- **Institution:** [University Name]

---

## 📞 Contact

- **Email:** your.email@example.com
- **GitHub:** github.com/your-repo
- **Documentation:** docs.your-project.com

---

## 🙏 Acknowledgments

- OpenZeppelin for smart contract libraries
- Foundry for development framework
- The Graph for indexing solution
- IPFS for decentralized storage
