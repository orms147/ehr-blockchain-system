# ConsentLedger Contract Documentation

## 📋 Tổng Quan

`ConsentLedger` là smart contract quản lý quyền truy cập hồ sơ y tế. Contract này đảm bảo chỉ những người được bệnh nhân cho phép mới có thể truy cập dữ liệu.

**Địa chỉ Contract:** `[To be deployed]`  
**Solidity Version:** `^0.8.24`  
**Inherits:** `EIP712`, `ReentrancyGuard`, `IConsentLedger`

---

## 🎯 Chức Năng Chính

### 1. Grant Consent (Cấp Quyền)
### 2. Revoke Consent (Thu Hồi Quyền)
### 3. Delegation (Ủy Quyền)
### 4. Emergency Access (Truy Cập Khẩn Cấp)
### 5. Signature-based Operations (EIP-712)

---

## 📊 Storage Structure

### Consent Data

```solidity
struct Consent {
    address patient;        // Bệnh nhân
    address grantee;        // Người được cấp quyền
    bytes32 rootCidHash;    // ✅ Hash của CID (privacy)
    bytes32 encKeyHash;     // Hash của encryption key
    uint40 issuedAt;        // Thời gian cấp
    uint40 expireAt;        // Thời gian hết hạn
    bool active;            // Trạng thái
    bool includeUpdates;    // Bao gồm updates
    bool allowDelegate;     // Cho phép ủy quyền
}
```

**Key Generation:**
```solidity
bytes32 consentKey = keccak256(abi.encode(patient, grantee, rootCidHash));
```

### Delegation Data

**Packed Storage (Gas Optimization):**
```
[reserved:214][active:1][allowSubDelegate:1][expiresAt:40]
```

---

## 🔐 Security Features

### 1. No Plaintext CID Storage

**❌ Before:**
```solidity
struct Consent {
    string rootCID;  // Plaintext on-chain
}
```

**✅ After:**
```solidity
struct Consent {
    bytes32 rootCidHash;  // Only hash
}
```

### 2. EIP-712 Signatures

**Includes deadline to prevent replay:**
```solidity
bytes32 private constant CONSENT_PERMIT_TYPEHASH = keccak256(
    "ConsentPermit(address patient,address grantee,string rootCID,bytes32 encKeyHash,uint256 expireAt,bool includeUpdates,bool allowDelegate,uint256 deadline,uint256 nonce)"
);
```

### 3. Authorization Whitelist

```solidity
mapping(address => bool) public authorizedContracts;

modifier onlyAuthorized() {
    if (!authorizedContracts[msg.sender] && msg.sender != admin) {
        revert Unauthorized();
    }
    _;
}
```

---

## 📝 Main Functions

### Grant Consent

#### `grantInternal()`

**Mô tả:** Cấp quyền truy cập (chỉ authorized contracts)

**Parameters:**
```solidity
function grantInternal(
    address patient,        // Bệnh nhân
    address grantee,        // Người được cấp quyền
    string calldata rootCID,// CID của record
    bytes32 encKeyHash,     // Hash của encryption key
    uint40 expireAt,        // Thời gian hết hạn (0 = forever)
    bool includeUpdates,    // Bao gồm updates
    bool allowDelegate      // Cho phép ủy quyền
) external override onlyAuthorized nonReentrant
```

**Flow:**
```
1. Hash CID → bytes32 rootCidHash
2. Call _grantConsent(patient, grantee, rootCidHash, ...)
3. Store consent with hash only
4. Emit ConsentGranted(patient, grantee, rootCidHash, ...)
```

**Example:**
```javascript
// From EHRSystemSecure or DoctorUpdate
await consentLedger.grantInternal(
    patientAddress,
    doctorAddress,
    "QmXxx...",      // IPFS CID
    encKeyHash,
    expireAt,
    true,            // Include updates
    false            // No delegation
);
```

---

#### `grantBySig()`

**Mô tả:** Cấp quyền bằng chữ ký EIP-712

**Parameters:**
```solidity
function grantBySig(
    address patient,
    address grantee,
    string calldata rootCID,
    bytes32 encKeyHash,
    uint40 expireAt,
    bool includeUpdates,
    bool allowDelegate,
    uint256 deadline,       // ✅ Included in signature
    bytes calldata signature
) external override nonReentrant
```

**Signature Structure:**
```typescript
const domain = {
    name: 'EHR Consent Ledger',
    version: '3',
    chainId: await provider.getNetwork().chainId,
    verifyingContract: consentLedgerAddress
};

const types = {
    ConsentPermit: [
        { name: 'patient', type: 'address' },
        { name: 'grantee', type: 'address' },
        { name: 'rootCID', type: 'string' },
        { name: 'encKeyHash', type: 'bytes32' },
        { name: 'expireAt', type: 'uint256' },
        { name: 'includeUpdates', type: 'bool' },
        { name: 'allowDelegate', type: 'bool' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'uint256' }
    ]
};

const value = {
    patient: patientAddress,
    grantee: doctorAddress,
    rootCID: "QmXxx...",
    encKeyHash: "0x...",
    expireAt: Math.floor(Date.now() / 1000) + 86400 * 7,
    includeUpdates: true,
    allowDelegate: false,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    nonce: await consentLedger.getNonce(patientAddress)
};

const signature = await signer._signTypedData(domain, types, value);
```

---

### Revoke Consent

#### `revoke()`

**Mô tả:** Thu hồi quyền truy cập

**Parameters:**
```solidity
function revoke(
    address grantee,
    string calldata rootCID
) external override nonReentrant
```

**Example:**
```javascript
await consentLedger.revoke(
    doctorAddress,
    "QmXxx..."
);
```

---

### Delegation

#### `grantDelegation()`

**Mô tả:** Ủy quyền cho người khác

**Parameters:**
```solidity
function grantDelegation(
    address delegatee,      // Người được ủy quyền
    uint40 duration,        // Thời hạn (seconds)
    bool allowSubDelegate   // Cho phép ủy quyền tiếp
) external override nonReentrant
```

**Constraints:**
- `MIN_DURATION = 1 days`
- `MAX_DURATION = 5 years`
- Sub-delegate không thể extend expiry

**Example:**
```javascript
// Patient ủy quyền cho người thân 30 ngày
await consentLedger.grantDelegation(
    relativeAddress,
    30 * 24 * 3600,  // 30 days
    false            // No sub-delegation
);
```

---

#### `grantUsingDelegation()`

**Mô tả:** Sử dụng quyền ủy quyền để cấp consent

**Parameters:**
```solidity
function grantUsingDelegation(
    address patient,
    address newGrantee,
    string calldata rootCID,
    bytes32 encKeyHash,
    uint40 expireAt
) external override nonReentrant
```

**Flow:**
```
1. Check delegation exists and active
2. Check not expired
3. Grant consent on behalf of patient
4. Delegatee CANNOT allow further delegation
```

---

### View Functions

#### `canAccess()`

**Mô tả:** Kiểm tra quyền truy cập

**Parameters:**
```solidity
function canAccess(
    address patient,
    address grantee,
    string calldata cid
) external view override returns (bool)
```

**Logic:**
```solidity
1. If patient == grantee → return true
2. Hash CID → cidHash
3. Get consent by key
4. Check active && not expired
5. Return true/false
```

**Example:**
```javascript
const hasAccess = await consentLedger.canAccess(
    patientAddress,
    doctorAddress,
    "QmXxx..."
);

if (hasAccess) {
    // Doctor can access record
}
```

---

## 🎨 Events

### ConsentGranted

```solidity
event ConsentGranted(
    address indexed patient,
    address indexed grantee,
    bytes32 indexed rootCidHash,  // ✅ Hash only
    uint40 expireAt,
    bool allowDelegate
);
```

**Usage:**
```javascript
consentLedger.on('ConsentGranted', (patient, grantee, cidHash, expireAt, allowDelegate) => {
    console.log(`Consent granted: ${patient} → ${grantee}`);
    console.log(`CID Hash: ${cidHash}`);
    console.log(`Expires: ${new Date(expireAt * 1000)}`);
});
```

---

### ConsentRevoked

```solidity
event ConsentRevoked(
    address indexed patient,
    address indexed grantee,
    bytes32 indexed rootCidHash,
    uint40 timestamp
);
```

---

### DelegationGranted

```solidity
event DelegationGranted(
    address indexed patient,
    address indexed delegatee,
    uint40 expiresAt,
    bool allowSubDelegate
);
```

---

## 🔧 Admin Functions

### `authorizeContract()`

**Mô tả:** Cho phép contract khác gọi `grantInternal`

**Parameters:**
```solidity
function authorizeContract(
    address contractAddress,
    bool allowed
) external override onlyAdmin
```

**Example:**
```javascript
// Admin authorizes EHRSystemSecure
await consentLedger.authorizeContract(
    ehrSystemAddress,
    true
);
```

---

## 💡 Usage Examples

### Example 1: Patient Grants Access to Doctor

```javascript
// Patient signs consent
const signature = await patient._signTypedData(domain, types, value);

// Anyone can submit (gasless for patient)
await consentLedger.grantBySig(
    patientAddress,
    doctorAddress,
    "QmXxx...",
    encKeyHash,
    expireAt,
    true,
    false,
    deadline,
    signature
);
```

---

### Example 2: Doctor Checks Access

```javascript
const canAccess = await consentLedger.canAccess(
    patientAddress,
    doctorAddress,
    "QmXxx..."
);

if (canAccess) {
    // Request CID from backend
    const response = await fetch(`/api/record/${cidHash}/cid`, {
        headers: {
            'Authorization': `Bearer ${jwt}`,
            'X-User-Address': doctorAddress
        }
    });
    
    const { cid } = await response.json();
    
    // Download from IPFS
    const encrypted = await ipfs.cat(cid);
    
    // Decrypt
    const data = await decrypt(encrypted, privateKey);
}
```

---

### Example 3: Patient Delegates to Relative

```javascript
// Patient delegates for 30 days
await consentLedger.grantDelegation(
    relativeAddress,
    30 * 24 * 3600,
    false
);

// Relative grants access to doctor
await consentLedger.grantUsingDelegation(
    patientAddress,
    doctorAddress,
    "QmXxx...",
    encKeyHash,
    7 * 24 * 3600  // 7 days
);
```

---

## ⚠️ Important Notes

### Privacy

- ✅ **NO plaintext CID on-chain**
- ✅ Only `bytes32 hash(CID)` stored
- ✅ Events emit hashes only
- ⚠️ Backend must maintain CID mapping

### Security

- ✅ Deadline included in signature
- ✅ Nonce-based replay protection
- ✅ Reentrancy protected
- ✅ Authorization whitelist

### Gas Optimization

- ✅ Packed delegation storage
- ✅ Minimal on-chain data
- ✅ Efficient key generation

---

## 🐛 Common Issues

### Issue 1: "Unauthorized" Error

**Cause:** Calling `grantInternal` from unauthorized address

**Solution:**
```javascript
// Admin must authorize contract first
await consentLedger.authorizeContract(callerAddress, true);
```

---

### Issue 2: "InvalidSignature" Error

**Cause:** Signature doesn't match or wrong nonce

**Solution:**
```javascript
// Get current nonce
const nonce = await consentLedger.getNonce(patientAddress);

// Use correct nonce in signature
const value = {
    // ...
    nonce: nonce  // ✅ Current nonce
};
```

---

### Issue 3: "DeadlinePassed" Error

**Cause:** Signature deadline expired

**Solution:**
```javascript
// Set reasonable deadline (e.g., 1 hour)
const deadline = Math.floor(Date.now() / 1000) + 3600;
```

---

## 📚 Related Documentation

- [RecordRegistry.md](./RecordRegistry.md) - Record management
- [EHRSystemSecure.md](./EHRSystemSecure.md) - Double confirmation flow
- [SECURITY.md](../SECURITY.md) - Security best practices
