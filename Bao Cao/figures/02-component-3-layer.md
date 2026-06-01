# Sơ đồ 2 — Component Diagram (kiến trúc 3 lớp)

> Embed Chương 4 mục 4.1. Mô tả high-level architecture: Mobile / Backend / Blockchain + 4 service bổ trợ.

## Components

### Layer 1 — MOBILE (React Native + Expo SDK 55)
- **UI Layer**: 27 screens (LoginScreen, DashboardScreen, RecordsScreen, ShareSheet, ...)
- **Services Layer** (21 service):
  - `walletAction.service.js` — Web3Auth login + signTypedData
  - `crypto.js` — AES-GCM encrypt/decrypt
  - `nacl-crypto.js` — NaCl box (x25519) encrypt for recipient
  - `ipfs.service.js` — Pinata upload
  - `consent.service.js` — Grant/revoke flow
  - `keyShare.service.js` — Claim + cascade
  - `trustedContact.service.js` — TC + auto pre-share
- **State Layer**: TanStack Query + Zustand authStore
- **Storage**: SecureStore (JWT), AsyncStorage (localRecordStore)

### Layer 2 — BACKEND (Node.js + Express)
- **REST API** (15 routes): /api/auth, /api/profile, /api/records, /api/key-share, /api/relayer, /api/requests, /api/consent, /api/trusted-contacts, /api/emergency, /api/admin, /api/org, /api/verification, /api/notification
- **Middleware**: authenticate (JWT), onChainRole (role cache 10min), express-rate-limit (1000/15min)
- **Services**:
  - `relayer.service.js` — EIP-712 verify + submit sponsored tx
  - `keyShareWriter.service.js` — race-safe KeyShare mutation
  - `subgraphSync.service.js` — poll loop 30s
  - `consentLedgerSync.service.js` — event handlers (ConsentGranted/Revoked/...)
  - `recordRegistrySync.service.js` — RecordAdded event handler
  - `expoPush.service.js` — push notification offline
- **Real-time**: Socket.io
- **Data**: Prisma ORM + PostgreSQL (Neon serverless)

### Layer 3 — BLOCKCHAIN (Arbitrum Sepolia)
- 5 Smart Contracts (Solidity 0.8.24):
  - AccessControl
  - RecordRegistry
  - ConsentLedger
  - DoctorUpdate
  - EHRSystemSecure

### Bổ trợ (External services)
- **IPFS via Pinata** — content-addressed ciphertext storage
- **Subgraph (The Graph Studio)** — event indexer, 4 dataSources
- **Web3Auth Sapphire** — OAuth provider (Google/Apple/Twitter/Facebook/Discord/Email/SMS)
- **Neon PostgreSQL** — serverless DB

## Interfaces

- **Mobile ↔ Backend**: HTTPS REST + WebSocket
- **Mobile ↔ IPFS**: HTTPS Pinata API (upload + retrieve via gateway)
- **Mobile ↔ Web3Auth**: OAuth redirect deep link
- **Mobile ↔ Blockchain (read)**: viem qua Alchemy RPC (canAccess, getConsent, ...)
- **Backend ↔ Blockchain (write)**: viem qua Alchemy RPC (sponsored tx)
- **Backend ↔ Subgraph**: GraphQL HTTP poll
- **Backend ↔ PostgreSQL**: Prisma connection pool

## PlantUML

Xem [02-component-3-layer.puml](02-component-3-layer.puml).

## Layout Astah

3 swimlane chiều dọc: MOBILE | BACKEND | BLOCKCHAIN. Bổ trợ services ở góc phải. Arrows ngang thể hiện interface.
