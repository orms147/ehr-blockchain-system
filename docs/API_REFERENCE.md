# API Reference - EHR System

## 🌐 Backend API

Base URL: `https://api.your-domain.com`

---

## 🔐 Authentication

All API requests require JWT authentication.

### Get JWT Token

```http
POST /api/auth/login
Content-Type: application/json

{
  "address": "0x...",
  "signature": "0x...",
  "message": "Login to EHR System"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400
}
```

**Usage:**
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📝 CID Management

### Store CID Mapping

```http
POST /api/cid
Authorization: Bearer <token>
Content-Type: application/json

{
  "cid": "QmXxx...",
  "ownerAddress": "0x..."
}
```

**Response:**
```json
{
  "success": true,
  "cidHash": "0x..."
}
```

---

### Get CID (with consent check)

```http
GET /api/cid/:cidHash
Authorization: Bearer <token>
```

**Response (Success):**
```json
{
  "cid": "QmXxx..."
}
```

**Response (No Consent):**
```json
{
  "error": "No consent"
}
```

---

## 📊 Access Logs

### Get User Access Logs

```http
GET /api/access-logs/:address?limit=100&offset=0
Authorization: Bearer <token>
```

**Response:**
```json
{
  "logs": [
    {
      "id": 1,
      "cidHash": "0x...",
      "action": "READ",
      "success": true,
      "timestamp": "2024-01-01T00:00:00Z",
      "ipAddress": "1.2.3.4"
    }
  ],
  "total": 150,
  "limit": 100,
  "offset": 0
}
```

---

## 🏥 Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "blockchain": "connected",
  "uptime": 12345
}
```

---

## 🔗 Smart Contract Functions

### AccessControl

#### Register as Patient
```solidity
function registerAsPatient() external
```

#### Register as Doctor
```solidity
function registerAsDoctor() external
```

#### Check Role
```solidity
function isPatient(address user) external view returns (bool)
function isDoctor(address user) external view returns (bool)
```

---

### RecordRegistry

#### Add Record
```solidity
function addRecord(
    string calldata cid,
    string calldata parentCID,
    string calldata recordType
) external
```

#### Get Record
```solidity
function getRecordByString(string calldata cid) 
    external view returns (Record memory)
```

---

### ConsentLedger

#### Grant Consent
```solidity
function grantBySig(
    address patient,
    address grantee,
    string calldata rootCID,
    bytes32 encKeyHash,
    uint40 expireAt,
    bool includeUpdates,
    bool allowDelegate,
    uint256 deadline,
    bytes calldata signature
) external
```

#### Check Access
```solidity
function canAccess(
    address patient,
    address grantee,
    string calldata cid
) external view returns (bool)
```

---

## 📡 Events

### ConsentGranted
```solidity
event ConsentGranted(
    address indexed patient,
    address indexed grantee,
    bytes32 indexed rootCidHash,
    uint40 expireAt,
    bool allowDelegate
)
```

### RecordAdded
```solidity
event RecordAdded(
    address indexed owner,
    bytes32 indexed cidHash,
    bytes32 parentCidHash,
    bytes32 recordTypeHash,
    uint40 timestamp
)
```

---

## 🔍 GraphQL (The Graph)

### Query Consents

```graphql
query GetConsents($patient: Bytes!) {
  consents(where: { patient: $patient }) {
    id
    patient
    grantee
    rootCidHash
    issuedAt
    expireAt
    active
  }
}
```

### Query Records

```graphql
query GetRecords($owner: Bytes!) {
  records(where: { owner: $owner }) {
    id
    cidHash
    owner
    createdBy
    createdAt
    recordTypeHash
  }
}
```

---

## ⚠️ Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 401 | Unauthorized | Invalid or missing JWT token |
| 403 | No consent | User doesn't have consent |
| 404 | Not found | CID not found in database |
| 429 | Too many requests | Rate limit exceeded |
| 500 | Internal error | Server error |
