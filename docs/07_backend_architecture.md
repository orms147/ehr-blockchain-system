# Backend Architecture

> **Last Updated**: 2026-01-21
> **Stack**: Node.js + Express + Prisma + PostgreSQL

---

## API Structure

```
backend/src/
├── routes/
│   ├── auth.routes.js       # Authentication
│   ├── user.routes.js       # User management
│   ├── admin.routes.js      # Ministry admin routes
│   ├── org.routes.js        # Organization routes
│   ├── keyShare.routes.js   # Key sharing
│   ├── records.routes.js    # Medical records
│   └── delegation.routes.js # Delegation (partial)
├── services/
│   ├── web3Service.js       # Blockchain interactions
│   └── ipfsService.js       # IPFS operations
├── middleware/
│   └── auth.middleware.js   # JWT verification
└── prisma/
    └── schema.prisma        # Database schema
```

---

## Key Routes

### Auth (/api/auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` | Login with wallet signature |
| POST | `/register` | Register user |
| GET | `/me` | Get current user + roles |
| GET | `/nonce/:address` | Get nonce for signing |

### Admin (/api/admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/org-applications` | List pending org applications |
| POST | `/approve-org/:id` | Approve org application |
| POST | `/reject-org/:id` | Reject org application |
| GET | `/relayers` | List relayers |
| POST | `/set-relayer` | Set relayer status |

### Org (/api/org)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:id/members` | List org members |
| POST | `/:id/add-member` | Add member to org |
| POST | `/:id/remove-member/:memberId` | Remove member |
| POST | `/verify-doctor` | Verify doctor on-chain |

---

## Prisma Models

### User

```prisma
model User {
  id              Int       @id @default(autoincrement())
  walletAddress   String    @unique @db.VarChar(42)
  email           String?   @unique
  fullName        String?   @db.VarChar(255)
  publicKey       String?   @db.Text
  publicKeySignature String? @db.Text  // PENDING
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

### OrgApplication

```prisma
model OrgApplication {
  id              Int       @id @default(autoincrement())
  walletAddress   String    @unique @db.VarChar(42)
  orgName         String    @db.VarChar(255)
  orgType         String    @db.VarChar(100)
  licenseNumber   String?   @db.VarChar(100)
  address         String?   @db.Text
  contactEmail    String?   @db.VarChar(255)
  contactPhone    String?   @db.VarChar(20)
  status          String    @default("pending")
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

### KeyShare

```prisma
model KeyShare {
  id              Int       @id @default(autoincrement())
  patientAddress  String    @db.VarChar(42)
  granteeAddress  String    @db.VarChar(42)
  encryptedKey    String    @db.Text
  cidHash         String    @db.VarChar(66)
  consentTxHash   String?   @db.VarChar(66)  // PENDING
  expiresAt       DateTime?
  createdAt       DateTime  @default(now())
}
```

---

## Web3 Service

### Contract Interactions

```javascript
// Read from AccessControl
const userStatus = await accessControl.getUserStatus(address);
const isMinistry = await accessControl.isMinistry(address);
const isActiveOrgAdmin = await accessControl.isActiveOrgAdmin(address);

// Read from RecordRegistry
const record = await recordRegistry.getRecord(cidHash);
const ownerRecords = await recordRegistry.getOwnerRecords(owner);

// Write operations (needs private key or relayer)
await accessControl.registerPatientFor(userAddress);
await accessControl.verifyDoctor(doctorAddress, credential);
```

---

## Authentication Flow

```
1. Frontend requests nonce: GET /api/auth/nonce/:address
2. User signs message with wallet
3. Frontend sends: POST /api/auth/login { address, signature, nonce }
4. Backend verifies signature
5. Backend checks on-chain roles via getUserStatus()
6. Backend returns JWT + roles
7. Frontend stores JWT and redirects based on role
```

---

## Pending Backend Changes

### For Organization Entity

1. **Update /api/auth/me**
   - Add `isActiveOrgAdmin` field
   - Add `orgId` field for org admins

2. **New Ministry Endpoints**
   - `POST /api/ministry/orgs` - Create organization (calls createOrganization on-chain)
   - `PUT /api/ministry/orgs/:id/admins` - Change admins (calls setOrgAdmins)
   - `PUT /api/ministry/orgs/:id/status` - Activate/deactivate (calls setOrgActive)
   - `GET /api/ministry/orgs` - List all organizations

### For Security Phase

1. **KeyShare with txHash**
   - Accept `consentTxHash` in keyShare creation
   - Verify on-chain consent exists

2. **Signed Public Keys**
   - Verify signature when saving public key
   - Return signature in user data
