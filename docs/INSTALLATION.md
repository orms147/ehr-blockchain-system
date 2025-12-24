# EHR Blockchain System - Hướng Dẫn Cài Đặt

## Yêu Cầu Hệ Thống

- **Node.js** >= 18.x
- **npm** hoặc **pnpm**
- **Foundry** (cho smart contracts)
- **PostgreSQL** (hoặc dùng Neon Cloud)

---

## 1. Clone Project

```bash
git clone <repository-url>
cd "ERH system(progsss)"
```

---

## 2. Cài Đặt Smart Contracts

### 2.1. Cài Dependencies

```bash
cd contracts
forge install
```

### 2.2. Cấu Hình Environment

Tạo file `contracts/.env`:

```env
# Deployer wallet private key (cần ETH trên Arbitrum Sepolia)
PRIVATE_KEY=0x...your_private_key...

# Deployer address (phải match với private key)
DEPLOYER_ADDR=0x...your_deployer_address...

# Sponsor/Relayer address (backend wallet trả gas cho users)
SPONSOR_ADDRESS=0x...your_sponsor_address...

# RPC URL
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# Arbiscan API key (cho verify contracts)
ARBISCAN_API_KEY=...your_key...
```

### 2.3. Deploy Contracts

```bash
# Load env và deploy
source .env
forge script script/DeployAll.s.sol:DeployAll \
    --rpc-url $RPC_URL \
    --broadcast \
    --verify
```

**Lưu lại địa chỉ contracts** từ output để dùng cho backend và frontend.

---

## 3. Cài Đặt Backend

### 3.1. Cài Dependencies

```bash
cd backend
npm install
```

### 3.2. Cấu Hình Environment

Tạo file `backend/.env`:

```env
# Server
PORT=3001
NODE_ENV=development

# Database (Neon PostgreSQL Cloud hoặc local)
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# JWT
JWT_SECRET=your_random_secret_here
JWT_EXPIRES_IN=7d

# Blockchain (Arbitrum Sepolia)
CHAIN_ID=421614
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc

# CORS
FRONTEND_URL=http://localhost:5173

# Contract Addresses (từ bước 2.3)
ACCESS_CONTROL_ADDRESS=0x...
CONSENT_LEDGER_ADDRESS=0x...
RECORD_REGISTRY_ADDRESS=0x...
EHR_SYSTEM_ADDRESS=0x...
DOCTOR_UPDATE_ADDRESS=0x...

# Sponsor wallet (private key của wallet trả gas)
SPONSOR_PRIVATE_KEY=0x...your_sponsor_private_key...
```

### 3.3. Setup Database

```bash
# Tạo tables từ Prisma schema
npx prisma db push

# (Optional) Mở Prisma Studio để xem data
npx prisma studio
```

### 3.4. Chạy Backend

```bash
# Development mode
npm run dev

# Backend sẽ chạy tại http://localhost:3001
```

---

## 4. Cài Đặt Frontend

### 4.1. Cài Dependencies

```bash
cd frontend-next
npm install
```

### 4.2. Cấu Hình Environment

Tạo file `frontend-next/.env`:

```env
# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3001

# Blockchain
NEXT_PUBLIC_CHAIN_ID=421614
NEXT_PUBLIC_CHAIN_NAME=Arbitrum Sepolia
NEXT_PUBLIC_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
NEXT_PUBLIC_BLOCK_EXPLORER_URL=https://sepolia.arbiscan.io

# Contract Addresses (từ bước 2.3)
NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS=0x...
NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS=0x...
NEXT_PUBLIC_RECORD_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_EHR_SYSTEM_ADDRESS=0x...
NEXT_PUBLIC_DOCTOR_UPDATE_ADDRESS=0x...

# Web3Auth
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=...your_web3auth_client_id...

# IPFS (Pinata)
NEXT_PUBLIC_PINATA_API_KEY=...
NEXT_PUBLIC_PINATA_SECRET_KEY=...
NEXT_PUBLIC_PINATA_GATEWAY=https://gateway.pinata.cloud
```

### 4.3. Chạy Frontend

```bash
# Development mode
npm run dev

# Frontend sẽ chạy tại http://localhost:5173
```

---

## 5. Verify Setup

### 5.1. Kiểm tra Backend

```bash
curl http://localhost:3001/api/health
# Expected: {"status":"ok"}
```

### 5.2. Kiểm tra Sponsor Authorization

```bash
cd backend
node scripts/authorizeSponsor.js
```

Output expected:
```
✅ AccessControl already authorized
✅ RecordRegistry already authorized  
✅ ConsentLedger already authorized
🎉 All authorizations complete!
```

### 5.3. Kiểm tra Frontend

Mở browser tại `http://localhost:5173` và thử login bằng Web3Auth.

---

## 6. Chạy Toàn Bộ (Development)

Mở 3 terminal:

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend-next && npm run dev

# Terminal 3 - (Optional) Prisma Studio
cd backend && npx prisma studio
```

---

## Troubleshooting

### Lỗi "NotSponsor" khi upload record

```bash
# Chạy script authorize
cd backend && node scripts/authorizeSponsor.js
```

### Lỗi "NotPatient" khi upload

User chưa được đăng ký role on-chain. Kiểm tra:
1. Backend có gọi `registerPatientFor()` khi user login không
2. Sponsor có quyền setRelayer không

### Lỗi database connection

Kiểm tra `DATABASE_URL` trong `backend/.env` và chạy:
```bash
npx prisma db push
```

### Lỗi Web3Auth

1. Kiểm tra `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` 
2. Domain phải được whitelist trên Web3Auth Dashboard

---

## Cấu Trúc Project

```
ERH system(progsss)/
├── contracts/           # Smart contracts (Foundry)
│   ├── src/            # Contract source files
│   ├── script/         # Deploy scripts
│   └── test/           # Contract tests
│
├── backend/            # Node.js/Express API
│   ├── src/
│   │   ├── config/     # Database, ABIs
│   │   ├── routes/     # API routes
│   │   ├── services/   # Business logic
│   │   └── middleware/ # Auth middleware
│   ├── prisma/         # Database schema
│   └── scripts/        # Utility scripts
│
├── frontend-next/      # Next.js Frontend
│   ├── src/
│   │   ├── app/        # Pages
│   │   ├── components/ # UI components
│   │   ├── services/   # API clients
│   │   ├── hooks/      # Custom hooks
│   │   └── abi/        # Contract ABIs
│   └── public/         # Static files
│
└── docs/               # Documentation
```
