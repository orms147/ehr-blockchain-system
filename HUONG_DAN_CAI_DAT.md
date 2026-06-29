# Hướng dẫn cài đặt — Hệ thống Hồ sơ Y tế điện tử trên Blockchain

Tài liệu này hướng dẫn cài đặt và chạy toàn bộ mã nguồn được nộp. Hệ thống gồm **4 thành phần**:

| Thành phần | Thư mục | Công nghệ |
|---|---|---|
| Smart contracts | [`contracts/`](contracts/) | Foundry + Solidity 0.8.24 |
| Backend (API) | [`backend/`](backend/) | Node.js + Express + Prisma (Postgres) + viem |
| Mobile app | [`mobile/`](mobile/) | React Native + Expo (dev client) + Tamagui |
| Subgraph (chỉ mục blockchain) | [`subgraph/`](subgraph/) | The Graph Studio — Arbitrum Sepolia |

> ⚠️ **LƯU Ý QUAN TRỌNG (bài nộp code-only):** Thư mục thư viện bên thứ ba `contracts/lib/`
> (forge-std + OpenZeppelin) **đã được loại khỏi mã nguồn** để chỉ giữ code tự viết.
> **Bắt buộc chạy `forge install` (xem Mục 3) trước khi build contracts**, nếu không sẽ
> lỗi thiếu thư viện. Tương tự, `node_modules/` của backend/mobile/subgraph không kèm theo —
> phải chạy `npm install`.

---

## 1. Yêu cầu môi trường

Cài sẵn các công cụ sau:

| Công cụ | Phiên bản | Dùng cho | Ghi chú |
|---|---|---|---|
| **Node.js** | **20.x** (`>=20 <21`) | backend, mobile, subgraph | Mobile bắt buộc Node 20; khuyến nghị dùng `nvm` |
| **npm** | đi kèm Node 20 | quản lý gói | |
| **Foundry** | bản mới (`forge`, `cast`) | contracts | Cài tại https://getfoundry.sh |
| **Git** | bất kỳ | tải mã + `forge install` | |
| **PostgreSQL** | 14+ (hoặc Neon cloud) | backend | Có thể dùng Neon free tier |
| **Android Studio + SDK** | mới | chạy mobile | Cần để `expo run:android` (KHÔNG dùng Expo Go) |
| **The Graph CLI** | mới | subgraph | `npm i -g @graphprotocol/graph-cli` (hoặc dùng qua `npx`) |

Các **tài khoản dịch vụ** cần có (đa số có gói miễn phí):
- **Alchemy** (hoặc RPC khác) → endpoint Arbitrum Sepolia (`RPC_URL`).
- **Pinata** → JWT để upload IPFS.
- **Web3Auth** → Client ID đăng nhập trên mobile.
- **The Graph Studio** → deploy key (chỉ khi tự deploy subgraph).
- Một (vài) ví **Arbitrum Sepolia** có ETH testnet (để deploy / trả gas sponsor).

> **Hai hướng chạy thử:**
> - **Nhanh** — Dùng bộ contract đã deploy sẵn trên Arbitrum Sepolia (địa chỉ có sẵn trong
>   [`backend/.env.example`](backend/.env.example)). Chỉ cần cấu hình backend + mobile trỏ vào, **không cần deploy lại**.
> - **Đầy đủ** — Tự deploy contracts mới rồi cập nhật địa chỉ ở backend/mobile/subgraph (Mục 3.3).

---

## 2. Lấy mã nguồn

```bash
git clone <URL_REPO>
cd ehr-blockchain-system
git checkout submission/code-only   # nhánh bài nộp
```

---

## 3. Smart contracts (`contracts/`)

### 3.1. Cài thư viện (BẮT BUỘC — vì `lib/` đã bị loại bỏ)

```bash
cd contracts
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
```

Hai lệnh trên khôi phục đúng các thư viện mà [`contracts/remappings.txt`](contracts/remappings.txt) và
[`contracts/foundry.toml`](contracts/foundry.toml) tham chiếu (`forge-std/`, `@openzeppelin/contracts/`).

### 3.2. Build & test

```bash
forge build        # biên dịch (Solidity 0.8.24, via_ir, optimizer_runs=200)
forge test         # chạy toàn bộ test suite
```

5 hợp đồng chính nằm ở [`contracts/src/`](contracts/src/): `AccessControl`, `RecordRegistry`,
`ConsentLedger`, `DoctorUpdate`, `EHRSystemSecure`.

### 3.3. (Tuỳ chọn) Deploy lên Arbitrum Sepolia

Chỉ làm nếu muốn tự deploy bộ contract mới.

```bash
cp .env.example .env     # rồi điền các giá trị
```

Các biến cần điền (xem [`contracts/.env.example`](contracts/.env.example)): `DEPLOYER_ADDR`,
`SPONSOR_ADDRESS`, `ARB_SEPOLIA_RPC`, `ARBISCAN_API_KEY`.

Deploy toàn bộ (1 script wiring sẵn 5 contract):

```bash
forge script script/DeployAll.s.sol:DeployAll \
  --rpc-url $ARB_SEPOLIA_RPC \
  --private-key 0xKHOA_RIENG_DEPLOYER \
  --broadcast --verify
```

Sau khi deploy xong, lấy **5 địa chỉ** + **5 startBlock** và cập nhật vào:
`backend/.env`, `mobile/.env`, và 4 dataSources trong `subgraph/subgraph.yaml`.

---

## 4. Backend (`backend/`)

### 4.1. Cài gói & cấu hình

```bash
cd backend
npm install
cp .env.example .env      # rồi điền secrets
```

Các biến **bắt buộc** trong [`backend/.env`](backend/.env.example):
- `DATABASE_URL` — chuỗi kết nối Postgres (Neon hoặc local), nên giữ `sslmode=require`.
- `JWT_SECRET` — tự sinh: `openssl rand -hex 32`.
- `RPC_URL`, `CHAIN_ID=421614`, và **5 địa chỉ contract** (đã có sẵn bản đang chạy trong `.env.example`).
- `SPONSOR_PRIVATE_KEY` — ví trả gas hộ (relayer).
- `CREDENTIAL_ENCRYPTION_KEY` — chuỗi 64 ký tự hex (production sẽ fail nếu thiếu/sai).
- `PINATA_JWT`, `PINATA_GATEWAY` — IPFS.
- `SUBGRAPH_URL` — endpoint The Graph.

### 4.2. Khởi tạo cơ sở dữ liệu (Prisma)

```bash
npm run db:generate      # sinh Prisma Client
npm run db:migrate       # áp dụng migration vào DB (prisma migrate dev)
```

> ⚠️ Luôn dùng **migration file**, KHÔNG dùng `db push`. Trên server production dùng
> `npx prisma migrate deploy`. Nếu dùng Neon, lần kết nối đầu sau khi idle có thể chậm vài giây (auto-suspend).

### 4.3. Chạy

```bash
npm run dev      # chế độ phát triển (nodemon) — mặc định cổng 3001
# hoặc
npm start        # chạy thẳng (node src/app.js)
```

Khi chạy đúng sẽ thấy log: `Server running on port ...` và `[SubgraphSync] Starting subgraph sync worker`.

---

## 5. Mobile (`mobile/`)

### 5.1. Cài gói & cấu hình

```bash
cd mobile
npm install
cp .env.example .env      # rồi điền
```

Các biến `EXPO_PUBLIC_*` quan trọng (xem [`mobile/.env.example`](mobile/.env.example)):
- `EXPO_PUBLIC_API_URL` — URL backend. Trên **máy ảo Android** dùng `http://10.0.2.2:3001`;
  trên **máy thật** dùng IP LAN của máy chạy backend (vd `http://192.168.1.x:3001`).
- `EXPO_PUBLIC_WEB3AUTH_CLIENT_ID`, `EXPO_PUBLIC_WEB3AUTH_REDIRECT_URL=erhsystem://auth`.
- `EXPO_PUBLIC_RPC_URL`, `EXPO_PUBLIC_CHAIN_ID=421614`, và **5 địa chỉ contract** (giống backend).
- `EXPO_PUBLIC_PINATA_JWT`, `EXPO_PUBLIC_PINATA_GATEWAY`.
- `EXPO_PUBLIC_SUBGRAPH_URL`.

### 5.2. Chạy trên Android (dev client — KHÔNG dùng Expo Go)

```bash
npm run android        # build dev client + chạy lên emulator/máy thật
```

Lần đầu sẽ build native (mất vài phút). Kiểm tra kiểu tĩnh:

```bash
npm run type-check     # tsc --noEmit
```

> Lưu ý: cần Android Studio + 1 emulator (hoặc thiết bị thật bật USB debug) trước khi `npm run android`.
> Redirect URL `erhsystem://auth` phải được khai báo trong Web3Auth Dashboard.

---

## 6. Subgraph (`subgraph/`)

Chỉ cần khi muốn tự deploy lớp chỉ mục (nếu dùng `SUBGRAPH_URL` có sẵn thì bỏ qua).

```bash
cd subgraph
npm install
npm run codegen        # sinh type từ ABI + schema
npm run build          # graph build
```

Deploy lên The Graph Studio:

```bash
cp .env.example .env                 # điền GRAPH_DEPLOY_KEY, SUBGRAPH_SLUG
npx graph auth <GRAPH_DEPLOY_KEY>
npm run deploy-studio
```

Sau khi deploy, copy **query URL** trả về vào `backend/.env` (`SUBGRAPH_URL`) và
`mobile/.env` (`EXPO_PUBLIC_SUBGRAPH_URL`).

> Mỗi lần deploy lại contract phải cập nhật `address` + `startBlock` cho **4 dataSources**
> trong `subgraph/subgraph.yaml` (RecordRegistry, EHRSystem, ConsentLedger, AccessControl).

---

## 7. Thứ tự khởi chạy đề xuất

1. **Contracts** — đã có sẵn trên Arbitrum Sepolia (hoặc tự deploy ở Mục 3.3).
2. **Subgraph** — đã deploy (hoặc dùng URL có sẵn).
3. **Backend** — `npm run dev` (phải có DB + `.env` đầy đủ).
4. **Mobile** — `npm run android`, đăng nhập bằng Web3Auth, dùng app.

Luồng dữ liệu: Mobile mã hoá hồ sơ → upload IPFS (ciphertext) → ghi `cidHash`/quyền lên contract →
Subgraph chỉ mục sự kiện → Backend đọc Subgraph + gate `canAccess` on-chain trước khi trả khoá mã hoá.

---

## 8. Khắc phục sự cố thường gặp

| Triệu chứng | Nguyên nhân & cách xử lý |
|---|---|
| `forge build` báo thiếu `forge-std` / `@openzeppelin` | Chưa chạy `forge install` ở Mục 3.1. |
| Backend lỗi kết nối DB lúc khởi động | Neon đang auto-suspend (đợi vài giây) hoặc `DATABASE_URL` sai. |
| Backend báo thiếu `CREDENTIAL_ENCRYPTION_KEY` | Đặt `NODE_ENV=development` khi dev, hoặc điền key 64-hex. |
| Mobile không gọi được backend | Sai `EXPO_PUBLIC_API_URL` (emulator dùng `10.0.2.2`, máy thật dùng IP LAN). |
| Đăng nhập Web3Auth treo | Redirect `erhsystem://auth` chưa whitelist trong Web3Auth Dashboard. |
| Mobile lỗi version Node | Phải dùng **Node 20.x** (`nvm use 20`). |

---

*Mọi `.env` đều là bản sao từ `.env.example` và đã được gitignore — không commit secrets.*
