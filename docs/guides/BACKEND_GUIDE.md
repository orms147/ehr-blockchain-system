# Backend Integration Guide

## 🎯 Tổng Quan

Backend server đóng vai trò quan trọng trong hệ thống EHR:
- Lưu trữ mapping `cidHash → plaintext CID`
- Kiểm soát truy cập
- Audit logging
- API endpoints

---

## 🏗️ Architecture

```
┌─────────────┐
│  Frontend   │
└──────┬──────┘
       │
       ▼
┌─────────────┐      ┌──────────────┐
│  REST API   │─────▶│  Blockchain  │
│   Server    │      │  (Read only) │
└──────┬──────┘      └──────────────┘
       │
       ▼
┌─────────────┐
│ PostgreSQL  │
│  Database   │
└─────────────┘
```

---

## 📦 Tech Stack

```json
{
  "runtime": "Node.js v18+",
  "framework": "Express.js",
  "database": "PostgreSQL 14+",
  "cache": "Redis 7+",
  "blockchain": "ethers.js v6",
  "auth": "JWT + EIP-712"
}
```

---

## 🚀 Setup

### 1. Install Dependencies

```bash
npm init -y
npm install express pg redis ethers dotenv cors helmet
npm install --save-dev typescript @types/node @types/express
```

### 2. Environment Variables

```env
# .env
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/ehr_db

# Redis
REDIS_URL=redis://localhost:6379

# Blockchain
RPC_URL=https://arb1.arbitrum.io/rpc
CONSENT_LEDGER_ADDRESS=0x...
RECORD_REGISTRY_ADDRESS=0x...

# Security
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=your-encryption-key
```

### 3. Database Schema

```sql
-- CID Mappings
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

-- Access Logs
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
CREATE INDEX idx_access_time ON access_logs(timestamp);

-- Users (optional)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    address VARCHAR(42) UNIQUE NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);
```

---

## 💻 Core Implementation

### 1. Database Connection

```typescript
// src/db/index.ts
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

export const query = (text: string, params?: any[]) => {
    return pool.query(text, params);
};

export default pool;
```

### 2. Blockchain Provider

```typescript
// src/blockchain/provider.ts
import { ethers } from 'ethers';
import ConsentLedgerABI from '../abis/ConsentLedger.json';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

export const consentLedger = new ethers.Contract(
    process.env.CONSENT_LEDGER_ADDRESS!,
    ConsentLedgerABI,
    provider
);

export { provider };
```

### 3. CID Service

```typescript
// src/services/cid.service.ts
import { query } from '../db';
import { ethers } from 'ethers';
import { consentLedger } from '../blockchain/provider';

export class CIDService {
    /**
     * Store CID mapping
     */
    static async storeCID(
        cid: string,
        ownerAddress: string,
        createdBy: string
    ): Promise<void> {
        const cidHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
        
        await query(
            `INSERT INTO cid_mappings (cid_hash, plaintext_cid, owner_address, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (cid_hash) DO NOTHING`,
            [cidHash, cid, ownerAddress.toLowerCase(), createdBy.toLowerCase()]
        );
    }

    /**
     * Get CID with access control
     */
    static async getCID(
        cidHash: string,
        accessorAddress: string
    ): Promise<string | null> {
        // 1. Get CID from database
        const result = await query(
            'SELECT plaintext_cid, owner_address FROM cid_mappings WHERE cid_hash = $1',
            [cidHash]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const { plaintext_cid, owner_address } = result.rows[0];

        // 2. Check on-chain consent
        const hasConsent = await consentLedger.canAccess(
            owner_address,
            accessorAddress.toLowerCase(),
            plaintext_cid
        );

        if (!hasConsent) {
            throw new Error('No consent');
        }

        // 3. Log access
        await this.logAccess(cidHash, accessorAddress, 'READ', true);

        return plaintext_cid;
    }

    /**
     * Log access attempt
     */
    static async logAccess(
        cidHash: string,
        accessorAddress: string,
        action: string,
        success: boolean,
        ipAddress?: string,
        userAgent?: string
    ): Promise<void> {
        await query(
            `INSERT INTO access_logs (cid_hash, accessor_address, action, success, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [cidHash, accessorAddress.toLowerCase(), action, success, ipAddress, userAgent]
        );
    }
}
```

### 4. Auth Middleware

```typescript
// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    userAddress?: string;
}

/**
 * Verify JWT token
 */
export const verifyJWT = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        req.userAddress = decoded.address;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

/**
 * Verify EIP-712 signature
 */
export const verifySignature = async (
    message: string,
    signature: string,
    expectedSigner: string
): Promise<boolean> => {
    try {
        const messageHash = ethers.hashMessage(message);
        const recoveredAddress = ethers.recoverAddress(messageHash, signature);
        return recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
    } catch (error) {
        return false;
    }
};
```

### 5. API Routes

```typescript
// src/routes/cid.routes.ts
import { Router } from 'express';
import { CIDService } from '../services/cid.service';
import { verifyJWT, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * POST /api/cid
 * Store CID mapping
 */
router.post('/', verifyJWT, async (req: AuthRequest, res) => {
    try {
        const { cid, ownerAddress } = req.body;

        if (!cid || !ownerAddress) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        await CIDService.storeCID(
            cid,
            ownerAddress,
            req.userAddress!
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('Store CID error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/cid/:cidHash
 * Get CID with access control
 */
router.get('/:cidHash', verifyJWT, async (req: AuthRequest, res) => {
    try {
        const { cidHash } = req.params;

        const cid = await CIDService.getCID(
            cidHash,
            req.userAddress!
        );

        if (!cid) {
            return res.status(404).json({ error: 'CID not found' });
        }

        res.json({ cid });
    } catch (error: any) {
        if (error.message === 'No consent') {
            return res.status(403).json({ error: 'No consent' });
        }
        console.error('Get CID error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
```

### 6. Main Server

```typescript
// src/index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cidRoutes from './routes/cid.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/cid', cidRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```

---

## 🔐 Security Best Practices

### 1. Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### 2. Input Validation

```typescript
import { body, validationResult } from 'express-validator';

router.post('/',
    body('cid').isString().notEmpty(),
    body('ownerAddress').isEthereumAddress(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        // ...
    }
);
```

### 3. SQL Injection Prevention

```typescript
// ✅ Good: Parameterized queries
await query('SELECT * FROM cid_mappings WHERE cid_hash = $1', [cidHash]);

// ❌ Bad: String concatenation
await query(`SELECT * FROM cid_mappings WHERE cid_hash = '${cidHash}'`);
```

---

## 📊 Monitoring & Logging

### Winston Logger

```typescript
import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

export default logger;
```

---

## 🚀 Deployment

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/ehr_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=ehr_db
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## 📚 API Documentation

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cid` | Store CID mapping |
| GET | `/api/cid/:cidHash` | Get CID (with consent check) |
| GET | `/api/access-logs/:address` | Get access logs for user |
| GET | `/health` | Health check |

### Example Requests

**Store CID:**
```bash
curl -X POST http://localhost:3000/api/cid \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cid": "QmXxx...",
    "ownerAddress": "0x..."
  }'
```

**Get CID:**
```bash
curl http://localhost:3000/api/cid/0x... \
  -H "Authorization: Bearer $JWT_TOKEN"
```

---

## 🐛 Troubleshooting

### Issue: "No consent" error

**Solution:** Check on-chain consent exists
```typescript
const hasConsent = await consentLedger.canAccess(patient, doctor, cid);
console.log('Has consent:', hasConsent);
```

### Issue: Database connection timeout

**Solution:** Increase pool size and timeout
```typescript
const pool = new Pool({
    max: 50,  // Increase
    connectionTimeoutMillis: 5000  // Increase
});
```

---

## 📖 Related Documentation

- [Frontend Guide](./FRONTEND_GUIDE.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Security](../SECURITY.md)
