# Security Documentation - EHR System

## 🔐 Tổng Quan Bảo Mật

Hệ thống EHR được thiết kế với bảo mật và quyền riêng tư là ưu tiên hàng đầu.

---

## ✅ Security Features Implemented

### 1. No Plaintext Data On-chain

**Problem Solved:**
- ❌ Ban đầu: Lưu plaintext CID on-chain → ai cũng đọc được
- ✅ Hiện tại: Chỉ lưu `bytes32 hash(CID)` → privacy protected

**Implementation:**
```solidity
// RecordRegistry.sol
mapping(bytes32 => Record) private _records;

struct Record {
    bytes32 cidHash;  // ✅ Only hash
    // NO plaintext CID
}
```

---

### 2. EIP-712 Signature Verification

**Features:**
- ✅ Deadline included in signature (prevents replay)
- ✅ Nonce-based replay protection
- ✅ Domain separator with chainId
- ✅ Structured data signing

**Implementation:**
```solidity
// ConsentLedger.sol
bytes32 structHash = keccak256(abi.encode(
    CONSENT_PERMIT_TYPEHASH,
    patient,
    grantee,
    keccak256(bytes(rootCID)),
    encKeyHash,
    expireAt,
    includeUpdates,
    allowDelegate,
    deadline,  // ✅ Included
    currentNonce
));
```

---

### 3. Access Control

**Multi-layer Protection:**
```
Layer 1: Smart Contract
├─ onlyAuthorized modifier
├─ Role-based access (AccessControl)
└─ Consent verification (ConsentLedger)

Layer 2: Backend
├─ JWT authentication
├─ On-chain consent check
└─ Audit logging

Layer 3: Data
├─ AES-256 encryption
└─ Patient-controlled keys
```

---

### 4. Reentrancy Protection

**All external functions protected:**
```solidity
function grantInternal(...) 
    external 
    override 
    onlyAuthorized 
    nonReentrant  // ✅
{
    // Safe from reentrancy
}
```

---

### 5. Double Confirmation Flow

**Time-delay Security:**
```solidity
uint40 public constant MIN_APPROVAL_DELAY = 1 hours;

// First approval
if (currentStatus == Pending) {
    req.firstApprovalTime = now40;
}

// Second approval (must wait)
if (now40 < req.firstApprovalTime + MIN_APPROVAL_DELAY) {
    revert ApprovalTooSoon();
}
```

---

## 🚨 Critical Security Fixes

### Fix #1: Removed Plaintext CID Storage

**Before:**
```solidity
mapping(bytes32 => string) private _cidStrings;  // ❌ Readable via storage
```

**After:**
```solidity
// ✅ NO on-chain plaintext storage
// CID stored in backend with access control
```

---

### Fix #2: Deadline in Signature

**Before:**
```solidity
// deadline checked but NOT signed
bytes32 structHash = keccak256(abi.encode(
    TYPEHASH,
    patient,
    grantee,
    // ... deadline NOT included ❌
));
```

**After:**
```solidity
bytes32 structHash = keccak256(abi.encode(
    TYPEHASH,
    patient,
    grantee,
    deadline,  // ✅ Included
    nonce
));
```

---

### Fix #3: setConsentLedger Access Control

**Before:**
```solidity
function setConsentLedger(address _consentLedger) external {
    // ❌ Anyone can call
}
```

**After:**
```solidity
address public immutable deployer;

function setConsentLedger(address _consentLedger) external {
    require(msg.sender == deployer, "Only deployer");  // ✅
}
```

---

## 🛡️ Security Best Practices

### For Smart Contracts

1. **Always use modifiers:**
```solidity
function sensitiveFunction() 
    external 
    onlyAuthorized 
    nonReentrant 
    whenNotPaused 
{
    // Protected
}
```

2. **Validate inputs:**
```solidity
if (address == address(0)) revert InvalidAddress();
if (bytes(cid).length == 0) revert EmptyCID();
if (expireAt <= block.timestamp) revert InvalidExpire();
```

3. **Use events for transparency:**
```solidity
emit ConsentGranted(patient, grantee, cidHash, expireAt);
```

---

### For Backend

1. **Verify signatures:**
```typescript
const isValid = await verifyEIP712Signature(
    message,
    signature,
    expectedSigner
);
if (!isValid) throw new Error('Invalid signature');
```

2. **Check on-chain consent:**
```typescript
const hasConsent = await consentLedger.canAccess(
    patient,
    doctor,
    cid
);
if (!hasConsent) return res.status(403).json({ error: 'No consent' });
```

3. **Log all access:**
```typescript
await db.accessLogs.create({
    cidHash,
    accessor: userAddress,
    action: 'READ',
    timestamp: new Date(),
    ipAddress: req.ip
});
```

---

### For Frontend

1. **Encrypt before upload:**
```typescript
const encrypted = await encryptAES256(
    medicalData,
    patientPublicKey
);
const cid = await ipfs.add(encrypted);
```

2. **Verify contract addresses:**
```typescript
const EXPECTED_ADDRESSES = {
    accessControl: '0x...',
    recordRegistry: '0x...',
    consentLedger: '0x...'
};

if (contractAddress !== EXPECTED_ADDRESSES.recordRegistry) {
    throw new Error('Invalid contract address');
}
```

3. **Use secure RPC:**
```typescript
const provider = new ethers.JsonRpcProvider(
    process.env.SECURE_RPC_URL,  // Use Infura/Alchemy
    {
        staticNetwork: true
    }
);
```

---

## 🔍 Security Audit Checklist

### Smart Contracts

- [x] No plaintext data on-chain
- [x] EIP-712 signatures with deadline
- [x] Reentrancy protection
- [x] Access control enforcement
- [x] Input validation
- [x] Event emission
- [x] Pausable mechanism
- [x] No delegatecall vulnerabilities
- [x] Safe math operations
- [x] Proper error handling

### Backend

- [ ] Secure database (encrypted at rest)
- [ ] HTTPS only
- [ ] Rate limiting
- [ ] Input sanitization
- [ ] SQL injection prevention
- [ ] XSS protection
- [ ] CSRF tokens
- [ ] Secure session management
- [ ] Regular backups
- [ ] Monitoring & alerting

### Infrastructure

- [ ] Firewall configured
- [ ] DDoS protection
- [ ] Regular security updates
- [ ] Penetration testing
- [ ] Incident response plan
- [ ] Disaster recovery plan

---

## 🚨 Known Risks & Mitigations

### Risk 1: Backend Compromise

**Risk:** Attacker gains access to backend database

**Impact:**
- Can read CID mappings
- Cannot decrypt IPFS data (needs keys)
- Cannot modify blockchain data

**Mitigation:**
- Encrypt database at rest
- Strong access control
- Audit logging
- Regular security audits
- Intrusion detection

---

### Risk 2: Private Key Theft

**Risk:** Patient's private key stolen

**Impact:**
- Attacker can grant consent
- Can access all patient records
- Can revoke existing consents

**Mitigation:**
- Use Web3Auth (social recovery)
- Multi-signature for critical operations
- Time-locked operations
- Anomaly detection

---

### Risk 3: IPFS Data Availability

**Risk:** IPFS nodes go offline

**Impact:**
- Cannot retrieve medical data
- System unavailable

**Mitigation:**
- Multiple pinning services
- Backup to centralized storage
- Redundancy across providers

---

## 📋 Security Incident Response

### Detection

1. **Monitoring:**
   - Unusual access patterns
   - Failed authentication attempts
   - Large data transfers
   - Contract paused events

2. **Alerts:**
   - Email notifications
   - Slack/Discord webhooks
   - SMS for critical events

### Response

1. **Immediate:**
   - Pause affected contracts
   - Block suspicious addresses
   - Isolate compromised systems

2. **Investigation:**
   - Review audit logs
   - Identify attack vector
   - Assess damage

3. **Recovery:**
   - Restore from backups
   - Deploy fixes
   - Resume operations

4. **Post-mortem:**
   - Document incident
   - Update security measures
   - Notify affected users

---

## 🔐 Encryption Standards

### Data at Rest

- **Algorithm:** AES-256-GCM
- **Key Management:** Patient-controlled
- **IV:** Unique per encryption
- **Auth Tag:** Verified on decryption

### Data in Transit

- **TLS:** 1.3 minimum
- **Certificate:** Valid SSL/TLS
- **Perfect Forward Secrecy:** Enabled

### Blockchain

- **Signatures:** ECDSA (secp256k1)
- **Hashing:** keccak256
- **EIP-712:** Structured data signing

---

## 📞 Security Contact

**Report vulnerabilities to:**
- Email: security@your-project.com
- PGP Key: [Public Key]
- Bug Bounty: [Program Link]

**Response Time:**
- Critical: 24 hours
- High: 72 hours
- Medium: 1 week
- Low: 2 weeks
