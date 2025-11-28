# Deployment Guide - EHR System

## 🎯 Tổng Quan

Hướng dẫn deploy toàn bộ hệ thống EHR lên production.

---

## 📋 Prerequisites

### 1. Tools Required

```bash
# Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Node.js v18+
node --version

# Docker & Docker Compose
docker --version
docker-compose --version
```

### 2. Accounts & Services

- ✅ Ethereum wallet với ETH (cho deployment)
- ✅ Infura/Alchemy API key
- ✅ Pinata API key (IPFS pinning)
- ✅ AWS/GCP account (backend hosting)
- ✅ Domain name (optional)

---

## 🔧 Step 1: Deploy Smart Contracts

### 1.1 Prepare Environment

```bash
cd contracts

# Create .env file
cp .env.example .env
```

**`.env` file:**
```env
# Network
RPC_URL=https://arb1.arbitrum.io/rpc
CHAIN_ID=42161

# Deployer
PRIVATE_KEY=0x...

# Etherscan (for verification)
ETHERSCAN_API_KEY=your-api-key
```

### 1.2 Compile Contracts

```bash
forge build
```

### 1.3 Run Tests

```bash
forge test -vv
```

### 1.4 Deploy to Testnet (Arbitrum Sepolia)

```bash
# Deploy
forge script script/deployment.s.sol \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc \
  --broadcast \
  --verify

# Save addresses
# AccessControl: 0x...
# RecordRegistry: 0x...
# ConsentLedger: 0x...
# DoctorUpdate: 0x...
# EHRSystemSecure: 0x...
```

### 1.5 Verify Contracts

```bash
forge verify-contract \
  <CONTRACT_ADDRESS> \
  src/AccessControl.sol:AccessControl \
  --chain-id 421614 \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

### 1.6 Initialize Contracts

```typescript
// scripts/initialize.ts
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// 1. Set ConsentLedger in RecordRegistry
const recordRegistry = new ethers.Contract(
    RECORD_REGISTRY_ADDRESS,
    RecordRegistryABI,
    wallet
);

await recordRegistry.setConsentLedger(CONSENT_LEDGER_ADDRESS);

// 2. Authorize contracts in ConsentLedger
const consentLedger = new ethers.Contract(
    CONSENT_LEDGER_ADDRESS,
    ConsentLedgerABI,
    wallet
);

await consentLedger.authorizeContract(EHR_SYSTEM_ADDRESS, true);
await consentLedger.authorizeContract(DOCTOR_UPDATE_ADDRESS, true);
await consentLedger.authorizeContract(RECORD_REGISTRY_ADDRESS, true);

console.log('✅ Contracts initialized');
```

---

## 🗄️ Step 2: Setup Database

### 2.1 PostgreSQL Setup

```bash
# Using Docker
docker run -d \
  --name ehr-postgres \
  -e POSTGRES_DB=ehr_db \
  -e POSTGRES_USER=ehr_user \
  -e POSTGRES_PASSWORD=secure_password \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:14
```

### 2.2 Run Migrations

```sql
-- migrations/001_create_tables.sql
CREATE TABLE cid_mappings (
    id SERIAL PRIMARY KEY,
    cid_hash VARCHAR(66) UNIQUE NOT NULL,
    plaintext_cid TEXT NOT NULL,
    owner_address VARCHAR(42) NOT NULL,
    created_by VARCHAR(42) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cid_hash ON cid_mappings(cid_hash);
CREATE INDEX idx_owner ON cid_mappings(owner_address);

CREATE TABLE access_logs (
    id SERIAL PRIMARY KEY,
    cid_hash VARCHAR(66) NOT NULL,
    accessor_address VARCHAR(42) NOT NULL,
    action VARCHAR(50) NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_access_cid ON access_logs(cid_hash);
CREATE INDEX idx_access_user ON access_logs(accessor_address);
```

```bash
# Run migrations
psql -h localhost -U ehr_user -d ehr_db -f migrations/001_create_tables.sql
```

---

## 🚀 Step 3: Deploy Backend

### 3.1 Build Backend

```bash
cd backend

# Install dependencies
npm ci

# Build
npm run build

# Test
npm test
```

### 3.2 Docker Image

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY .env.production ./.env

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

```bash
# Build image
docker build -t ehr-backend:latest .

# Test locally
docker run -p 3000:3000 \
  -e DATABASE_URL=$DATABASE_URL \
  -e RPC_URL=$RPC_URL \
  ehr-backend:latest
```

### 3.3 Deploy to AWS ECS

```yaml
# docker-compose.production.yml
version: '3.8'

services:
  api:
    image: your-registry/ehr-backend:latest
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - RPC_URL=${RPC_URL}
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api
```

---

## 🌐 Step 4: Deploy Frontend

### 4.1 Configure Environment

```env
# .env.production
NEXT_PUBLIC_CHAIN_ID=42161
NEXT_PUBLIC_RPC_URL=https://arb1.arbitrum.io/rpc

NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS=0x...
NEXT_PUBLIC_RECORD_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS=0x...
NEXT_PUBLIC_DOCTOR_UPDATE_ADDRESS=0x...
NEXT_PUBLIC_EHR_SYSTEM_ADDRESS=0x...

NEXT_PUBLIC_BACKEND_URL=https://api.your-domain.com
NEXT_PUBLIC_IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/

NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=your-client-id
```

### 4.2 Build & Deploy

```bash
cd frontend

# Build
npm run build

# Deploy to Vercel
vercel --prod

# Or deploy to AWS S3 + CloudFront
aws s3 sync out/ s3://your-bucket-name
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

---

## 📊 Step 5: Setup The Graph

### 5.1 Create Subgraph

```yaml
# subgraph.yaml
specVersion: 0.0.5
schema:
  file: ./schema.graphql
dataSources:
  - kind: ethereum
    name: ConsentLedger
    network: arbitrum-one
    source:
      address: "0x..."
      abi: ConsentLedger
      startBlock: 12345678
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.7
      language: wasm/assemblyscript
      entities:
        - Consent
      abis:
        - name: ConsentLedger
          file: ./abis/ConsentLedger.json
      eventHandlers:
        - event: ConsentGranted(indexed address,indexed address,indexed bytes32,uint40,bool)
          handler: handleConsentGranted
      file: ./src/mapping.ts
```

### 5.2 Deploy Subgraph

```bash
cd subgraph

# Install Graph CLI
npm install -g @graphprotocol/graph-cli

# Authenticate
graph auth --studio <DEPLOY_KEY>

# Deploy
graph deploy --studio ehr-system
```

---

## 🔐 Step 6: Security Hardening

### 6.1 SSL/TLS Setup

```nginx
# nginx.conf
server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://api:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 6.2 Firewall Rules

```bash
# Allow only necessary ports
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw enable
```

### 6.3 Environment Variables

```bash
# Use AWS Secrets Manager or similar
aws secretsmanager create-secret \
  --name ehr/database-url \
  --secret-string "postgresql://..."
```

---

## 📈 Step 7: Monitoring & Logging

### 7.1 Setup Monitoring

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

### 7.2 Application Logging

```typescript
// Use Winston
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});
```

---

## ✅ Step 8: Post-Deployment Checklist

### Smart Contracts
- [ ] All contracts deployed
- [ ] Contracts verified on Etherscan
- [ ] Contracts initialized
- [ ] Authorization set up
- [ ] Ownership transferred (if needed)

### Backend
- [ ] Database migrations run
- [ ] Environment variables set
- [ ] SSL certificates installed
- [ ] Monitoring enabled
- [ ] Backup configured

### Frontend
- [ ] Contract addresses configured
- [ ] API endpoints configured
- [ ] Web3Auth configured
- [ ] IPFS gateway configured
- [ ] CDN configured

### Infrastructure
- [ ] Domain DNS configured
- [ ] Firewall rules applied
- [ ] Backup strategy implemented
- [ ] Disaster recovery plan
- [ ] Monitoring dashboards

---

## 🔄 Maintenance

### Regular Tasks

**Daily:**
- Check error logs
- Monitor API response times
- Check database size

**Weekly:**
- Review access logs
- Check backup integrity
- Update dependencies

**Monthly:**
- Security audit
- Performance optimization
- Cost optimization

---

## 🆘 Rollback Plan

### If Deployment Fails

1. **Smart Contracts:**
```bash
# Cannot rollback on-chain
# Deploy new version if needed
```

2. **Backend:**
```bash
# Rollback Docker image
docker service update --image ehr-backend:previous api

# Or rollback database
psql -U ehr_user -d ehr_db < backup.sql
```

3. **Frontend:**
```bash
# Rollback Vercel deployment
vercel rollback

# Or restore S3 bucket
aws s3 sync s3://backup-bucket/ s3://your-bucket/
```

---

## 📞 Support

**Issues:** GitHub Issues  
**Email:** support@your-domain.com  
**Docs:** https://docs.your-domain.com
