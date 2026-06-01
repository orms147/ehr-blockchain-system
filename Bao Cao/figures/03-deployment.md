# Sơ đồ 3 — Deployment Diagram

> Embed Chương 4 mục 4.1. Mô tả hardware/service deployment thực tế.

## Nodes

### Node 1 — Mobile Device
- Android phone (testbed Expo dev client)
- iOS phone (post-thesis future)
- Artifact: APK file (sau khi build EAS production)

### Node 2 — Backend Server
- Hardware demo: localhost (Windows dev machine)
- Production target: VPS (cloud provider) hoặc Docker container
- Process: Node.js 20.x runtime → npm run dev (port 3001)

### Node 3 — Database
- Neon PostgreSQL serverless (cloud — AWS Singapore region)
- Connection: `DATABASE_URL` env var

### Node 4 — Blockchain — Arbitrum Sepolia
- Alchemy RPC nodes (free tier 300 CU/s)
- Network: Arbitrum Sepolia L2 testnet
- 5 smart contracts deployed (xem địa chỉ trong `Bao Cao/Chuong/Phu_luc_A.tex` mục 9)

### Node 5 — IPFS Pinning
- Pinata service (cloud)
- Gateway: `scarlet-advanced-fly-29.mypinata.cloud`

### Node 6 — Subgraph Indexer
- The Graph Studio (cloud)
- Endpoint: `https://api.studio.thegraph.com/query/120096/ehr/v0.1.5`

### Node 7 — Web3Auth
- Web3Auth Sapphire service (cloud)
- Client ID: `BLcTr1Sfd1...` (production scope)

## Protocols

- Mobile ↔ Backend: HTTPS (TCP 443/3001)
- Mobile ↔ IPFS: HTTPS Pinata REST + Gateway
- Backend ↔ Postgres: TLS PostgreSQL wire protocol
- Backend ↔ Arbitrum RPC: HTTPS JSON-RPC (eth_call, eth_sendRawTransaction)
- Backend ↔ Subgraph: HTTPS GraphQL POST
- Mobile ↔ Web3Auth: HTTPS OAuth redirect (deep link `erhsystem://auth`)
- Subgraph ↔ Arbitrum: Indexer reads block stream

## PlantUML

Xem [03-deployment.puml](03-deployment.puml).

## Layout Astah

5 deployment node chính + 3 external service node, kết nối qua arrows ghi protocol.
