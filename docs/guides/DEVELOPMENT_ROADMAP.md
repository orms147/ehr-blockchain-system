# Lộ Trình Phát Triển EHR Smart Contract System

## 🎯 Tổng Quan

Tài liệu này hướng dẫn chi tiết cách tư duy và code toàn bộ hệ thống EHR Smart Contract từ đầu. Mỗi contract được thiết kế theo nguyên tắc **bottom-up**: từ foundation đến advanced features.

---

## 📊 Kiến Trúc Hệ Thống

### Dependency Graph
```
AccessControl (Foundation Layer)
    ↓
    ├─→ RecordRegistry (Data Layer)
    └─→ ConsentLedger (Permission Layer)
         ↓
         ├─→ DoctorUpdate (Business Logic)
         └─→ EHRSystemSecure (Business Logic)
```

### Nguyên Tắc Thiết Kế
1. **Interface First**: Định nghĩa interface trước khi implement
2. **Security by Design**: Validate inputs, check authorization
3. **Gas Optimization**: Minimize storage, optimize operations
4. **Test-Driven**: Viết test ngay sau khi code contract
5. **Documentation**: Comment why, not what

---

## 🗓️ Timeline & Milestones

### Week 1-2: Foundation Layer
- ✅ Setup project với Foundry
- ✅ Code `IAccessControl.sol` interface
- ✅ Implement `AccessControl.sol`
- ✅ Write comprehensive tests (>90% coverage)
- ✅ Document design decisions

### Week 3-4: Data Layer
- ✅ Code `IRecordRegistry.sol` interface
- ✅ Implement `RecordRegistry.sol`
- ✅ Handle parent-child relationships
- ✅ Test versioning & updates
- ✅ Gas optimization

### Week 5-6: Permission Layer
- ✅ Code `IConsentLedger.sol` interface
- ✅ Implement `ConsentLedger.sol`
- ✅ EIP-712 signature integration
- ✅ Delegation system
- ✅ Test signature validation

### Week 7-8: Business Logic
- ✅ Implement `DoctorUpdate.sol`
- ✅ Emergency access with witnesses
- ✅ Implement `EHRSystemSecure.sol`
- ✅ 2-step approval flow
- ✅ Integration tests

### Week 9-10: Testing & Optimization
- ✅ End-to-end integration tests
- ✅ Gas optimization
- ✅ Security audit
- ✅ Documentation
- ✅ Deployment scripts

---

## 🏗️ Phase 1: Foundation Layer (Week 1-2)

### Objective
Xây dựng hệ thống quản lý vai trò (Role-based Access Control) làm nền tảng cho toàn bộ hệ thống.

### Step 1.1: Project Setup

```bash
# Initialize Foundry project
forge init ehr-system
cd ehr-system

# Install dependencies
forge install OpenZeppelin/openzeppelin-contracts

# Create directory structure
mkdir -p contracts/src/interfaces
mkdir -p contracts/test/helpers
mkdir -p docs/contracts
```

**File: `foundry.toml`**
```toml
[profile.default]
src = "contracts/src"
out = "contracts/out"
libs = ["lib"]
test = "contracts/test"
cache_path = "contracts/cache"

solc_version = "0.8.24"
optimizer = true
optimizer_runs = 200
via_ir = false

[profile.default.fuzz]
runs = 256

[profile.ci]
fuzz = { runs = 5000 }
```

**File: `contracts/remappings.txt`**
```
@openzeppelin/=lib/openzeppelin-contracts/
forge-std/=lib/forge-std/src/
```

### Step 1.2: Design IAccessControl Interface

**Tư duy:**
1. **Xác định actors**: Patient, Doctor, Organization, Ministry
2. **Xác định actions**: Register, Verify, Revoke
3. **Xác định queries**: isPatient, isDoctor, isVerified
4. **Xác định events**: UserRegistered, Verified, Revoked
5. **Xác định errors**: NotAuthorized, NotRegistered, etc.

**File: `contracts/src/interfaces/IAccessControl.sol`**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAccessControl {
    // ============ EVENTS ============
    event UserRegistered(address indexed user, string role);
    event DoctorVerified(address indexed doctor, address indexed verifier, string credential);
    event OrganizationVerified(address indexed org, string orgName);
    event VerificationRevoked(address indexed user, address indexed revoker);

    // ============ ERRORS ============
    error InvalidAddress();
    error NotRegistered();
    error NotAuthorized();
    error NotVerified();

    // ============ STRUCTS ============
    struct UserStatus {
        bool isPatient;
        bool isDoctor;
        bool isOrganization;
        bool isVerifiedDoctor;
        bool isVerifiedOrg;
        address verifier;
    }

    // ============ REGISTRATION ============
    function registerAsPatient() external;
    function registerAsDoctor() external;
    function registerAsOrganization() external;

    // ============ VERIFICATION ============
    function verifyDoctor(address doctor, string calldata credential) external;
    function verifyOrganization(address org, string calldata orgName) external;

    // ============ REVOKE ============
    function revokeDoctorVerification(address doctor) external;
    function revokeOrgVerification(address org) external;

    // ============ VIEW FUNCTIONS ============
    function isPatient(address user) external view returns (bool);
    function isDoctor(address user) external view returns (bool);
    function isOrganization(address user) external view returns (bool);
    function isVerifiedDoctor(address user) external view returns (bool);
    function isVerifiedOrg(address user) external view returns (bool);
    function getUserStatus(address user) external view returns (UserStatus memory);
}
```

### Step 1.3: Implement AccessControl

**Tư duy thiết kế:**
- **Bitwise operations** cho multi-role (tiết kiệm gas)
- **Immutable ministry** address (security)
- **Track verifiers** (cho revoke logic)
- **Fail fast** validation (security)

**Xem chi tiết:** [AccessControl.md](../contracts/AccessControl.md)

### Step 1.4: Write Tests

**File: `contracts/test/AccessControlTest.t.sol`**

**Test categories:**
1. Registration tests (positive & negative)
2. Verification tests (ministry, org, doctor)
3. Multi-role tests
4. Revoke tests
5. Edge cases

**Run tests:**
```bash
forge test --match-contract AccessControlTest -vv
forge coverage --match-contract AccessControlTest
```

---

## 🗄️ Phase 2: Data Layer (Week 3-4)

### Objective
Xây dựng hệ thống lưu trữ medical records với privacy-first design (hash-only storage).

### Step 2.1: Design IRecordRegistry Interface

**Tư duy:**
1. **Privacy First**: Chỉ lưu `bytes32 hash(CID)`, KHÔNG lưu plaintext
2. **Versioning**: Parent-child relationships cho record updates
3. **Ownership**: Track owner, allow transfer
4. **Access Control**: Integrate với AccessControl

**File: `contracts/src/interfaces/IRecordRegistry.sol`**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRecordRegistry {
    // ============ STRUCTS ============
    struct Record {
        bytes32 cidHash;        // keccak256(cid) - PRIVACY!
        bytes32 parentCidHash;  // For versioning
        address createdBy;
        address owner;
        bytes32 recordTypeHash;
        uint40 createdAt;
        uint8 version;
        bool exists;
    }

    // ============ EVENTS ============
    event RecordAdded(
        address indexed owner,
        bytes32 indexed cidHash,
        bytes32 parentCidHash,
        bytes32 recordTypeHash,
        uint40 timestamp
    );
    event RecordUpdated(bytes32 indexed oldCidHash, bytes32 indexed newCidHash, address indexed owner);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner, bytes32 indexed cidHash);

    // ============ ERRORS ============
    error EmptyCID();
    error RecordExists();
    error RecordNotExist();
    error ParentNotExist();
    error TooManyChildren();
    error NotOwner();
    error NotPatient();
    error NotDoctor();
    error InvalidAddress();

    // ============ FUNCTIONS ============
    function addRecord(string calldata cid, string calldata parentCID, string calldata recordType) external;
    function addRecordByDoctor(string calldata cid, string calldata parentCID, string calldata recordType, address patient) external;
    function updateRecordCID(string calldata oldCID, string calldata newCID) external;
    function transferOwnership(bytes32 cidHash, address newOwner) external;
    
    // ============ VIEW FUNCTIONS ============
    function getRecord(bytes32 cidHash) external view returns (Record memory);
    function getRecordByString(string calldata cid) external view returns (Record memory);
    function getOwnerRecords(address owner) external view returns (bytes32[] memory);
    function getChildRecords(bytes32 parentCidHash) external view returns (bytes32[] memory);
    function recordExists(bytes32 cidHash) external view returns (bool);
    function getMaxChildrenLimit() external pure returns (uint8);
}
```

### Step 2.2: Implement RecordRegistry

**Key Implementation Points:**

1. **Empty CID Check** (CRITICAL!)
```solidity
function addRecord(string calldata cid, ...) external {
    // ✅ CORRECT: Check string length BEFORE hashing
    if (bytes(cid).length == 0) revert EmptyCID();
    bytes32 cidHash = keccak256(bytes(cid));
    
    // ❌ WRONG: Check hash (hash of "" is not 0!)
    // if (cidHash == bytes32(0)) revert EmptyCID();
}
```

2. **Update Record with Children** (CRITICAL!)
```solidity
function updateRecordCID(string calldata oldCID, string calldata newCID) external {
    // ... validation ...
    
    // ✅ MUST: Move children array
    bytes32[] memory myChildren = _parentChildren[oldHash];
    if (myChildren.length > 0) {
        _parentChildren[newHash] = myChildren;
        delete _parentChildren[oldHash];
        
        // ✅ MUST: Update parent reference in each child
        for (uint256 i = 0; i < myChildren.length; i++) {
            _records[myChildren[i]].parentCidHash = newHash;
        }
    }
}
```

**Xem chi tiết:** [RecordRegistry.md](../contracts/RecordRegistry.md)

### Step 2.3: Write Tests

**Test categories:**
1. Add record (with/without parent)
2. Update record (with/without children) ← CRITICAL!
3. Transfer ownership
4. MAX_CHILDREN limit
5. Hash-only storage verification

---

## 🔐 Phase 3: Permission Layer (Week 5-6)

### Objective
Xây dựng hệ thống quản lý consent với EIP-712 signatures và delegation.

### Step 3.1: Design IConsentLedger Interface

**Tư duy:**
1. **Consent Management**: Grant, revoke, check access
2. **EIP-712 Signatures**: Off-chain signing, on-chain verification
3. **Delegation**: Patient ủy quyền cho người thân
4. **Expiry Management**: Time-based access control
5. **Contract Authorization**: Cho phép DoctorUpdate, EHRSystemSecure

**File: `contracts/src/interfaces/IConsentLedger.sol`**
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IConsentLedger {
    // ============ STRUCTS ============
    struct Consent {
        bytes32 encKeyHash;
        uint40 grantedAt;
        uint40 expireAt;
        bool includeUpdates;
        bool allowDelegate;
        bool active;
    }

    struct Delegation {
        uint40 grantedAt;
        uint40 expireAt;
        bool allowSubDelegate;
        bool active;
    }

    // ============ EVENTS ============
    event ConsentGranted(address indexed patient, address indexed grantee, bytes32 indexed cidHash, uint40 expireAt, bool includeUpdates);
    event ConsentRevoked(address indexed patient, address indexed grantee, bytes32 indexed cidHash);
    event DelegationGranted(address indexed patient, address indexed delegatee, uint40 expireAt);
    event DelegationRevoked(address indexed patient, address indexed delegatee);

    // ============ ERRORS ============
    error InvalidSignature();
    error DeadlinePassed();
    error NotPatient();
    error NotAuthorized();
    error DelegationExpired();
    error InvalidDuration();

    // ============ CONSENT FUNCTIONS ============
    function grantInternal(address patient, address grantee, string calldata rootCID, bytes32 encKeyHash, uint40 expireAt, bool includeUpdates, bool allowDelegate) external;
    function grantBySig(address patient, address grantee, string calldata rootCID, bytes32 encKeyHash, uint40 expireAt, bool includeUpdates, bool allowDelegate, uint256 deadline, bytes memory signature) external;
    function revoke(address grantee, string calldata rootCID) external;
    function canAccess(address patient, address user, string calldata rootCID) external view returns (bool);

    // ============ DELEGATION FUNCTIONS ============
    function grantDelegation(address delegatee, uint40 duration, bool allowSubDelegate) external;
    function delegateAuthorityBySig(address patient, address delegatee, uint40 duration, bool allowSubDelegate, uint256 deadline, bytes memory signature) external;
    function grantUsingDelegation(address patient, address grantee, string calldata rootCID, bytes32 encKeyHash, uint40 expireAt) external;
    function revokeDelegation(address delegatee) external;

    // ============ ADMIN FUNCTIONS ============
    function authorizeContract(address contractAddr, bool authorized) external;
    
    // ============ VIEW FUNCTIONS ============
    function getConsent(address patient, address grantee, string calldata rootCID) external view returns (Consent memory);
    function getDelegation(address patient, address delegatee) external view returns (Delegation memory);
    function getNonce(address user) external view returns (uint256);
}
```

### Step 3.2: Implement EIP-712 Signatures

**CRITICAL: Argument Order Must Match TypeHash!**

```solidity
// In ConsentLedger.sol
bytes32 private constant CONSENT_PERMIT_TYPEHASH = keccak256(
    "ConsentPermit(address patient,address grantee,string rootCID,bytes32 encKeyHash,uint256 expireAt,bool includeUpdates,bool allowDelegate,uint256 deadline,uint256 nonce)"
    //                                                                                                                      ^^^^^^^^  ^^^^^
    //                                                                                                                      ORDER MATTERS!
);

function grantBySig(...) external {
    bytes32 structHash = keccak256(abi.encode(
        CONSENT_PERMIT_TYPEHASH,
        patient,
        grantee,
        keccak256(bytes(rootCID)),
        encKeyHash,
        expireAt,
        includeUpdates,
        allowDelegate,
        deadline,  // ⚠️ MUST match TypeHash order!
        nonce
    ));
    
    bytes32 digest = _hashTypedDataV4(structHash);
    address signer = ECDSA.recover(digest, signature);
    
    if (signer != patient) revert InvalidSignature();
}
```

**In TestHelpers.sol:**
```solidity
function signConsentPermit(...) internal pure returns (bytes memory) {
    bytes32 structHash = keccak256(abi.encode(
        permitTypeHash,
        patient,
        grantee,
        keccak256(bytes(rootCID)),
        encKeyHash,
        expireAt,
        includeUpdates,
        allowDelegate,
        deadline,  // ⚠️ Same order!
        nonce
    ));
    
    bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
    return abi.encodePacked(r, s, v);
}
```

**Xem chi tiết:** [ConsentLedger.md](../contracts/ConsentLedger.md)

---

## 🏥 Phase 4: Business Logic (Week 7-8)

### Step 4.1: Implement DoctorUpdate

**Features:**
- Doctor creates record for patient
- Auto-grant temporary access
- Emergency access with witnesses
- Extend access duration

**Key Points:**
```solidity
function addRecordByDoctor(..., uint40 doctorAccessHours) external {
    // 1. Check authorization FIRST
    if (!accessControl.isDoctor(msg.sender)) revert NotDoctor();
    
    // 2. Validate duration
    if (doctorAccessHours < MIN_ACCESS_DURATION) revert InvalidAccessDuration();
    if (doctorAccessHours > MAX_ACCESS_DURATION) revert InvalidAccessDuration();
    
    // 3. Create record (via RecordRegistry)
    recordRegistry.addRecordByDoctor(cid, parentCID, recordType, patient);
    
    // 4. Auto-grant access (via ConsentLedger)
    uint40 expireAt = uint40(block.timestamp) + (doctorAccessHours * 1 hours);
    consentLedger.grantInternal(patient, msg.sender, cid, doctorEncKeyHash, expireAt, false, false);
}
```

### Step 4.2: Implement EHRSystemSecure

**Features:**
- Request access (DirectAccess / FullDelegation)
- 2-step approval with time delay
- Reject request
- Pause/unpause

**2-Step Approval Flow:**
```solidity
enum RequestStatus { Pending, RequesterApproved, PatientApproved, Completed, Rejected }

function approveRequest(bytes32 reqId) external {
    // First approval
    if (status == Pending) {
        if (isRequester) {
            req.status = RequesterApproved;
            req.firstApprovalTime = now;
        } else if (isPatient) {
            req.status = PatientApproved;
            req.firstApprovalTime = now;
        }
        return;
    }
    
    // Second approval - CHECK DELAY!
    if (now < req.firstApprovalTime + MIN_APPROVAL_DELAY) {
        revert ApprovalTooSoon();
    }
    
    // Complete request
    _completeRequest(reqId, req);
}
```

---

## 🧪 Phase 5: Testing & Integration (Week 9-10)

### Step 5.1: Integration Tests

**File: `contracts/test/IntegrationTest.t.sol`**

**Test scenarios:**
1. Patient creates record → Doctor requests → Patient approves
2. Doctor creates record → Auto access
3. Delegation flow
4. Emergency access with witnesses
5. Multi-doctor access
6. Record versioning
7. Transfer ownership

### Step 5.2: Coverage & Gas Optimization

```bash
# Check coverage
forge coverage

# Gas report
forge test --gas-report

# Snapshot gas costs
forge snapshot
```

**Target metrics:**
- Coverage: >90%
- Gas per transaction: <200k for simple operations
- Test pass rate: 100%

---

## 📝 Documentation Checklist

- [ ] Interface documentation
- [ ] Implementation guide
- [ ] Security considerations
- [ ] Testing strategy
- [ ] Deployment guide
- [ ] API reference
- [ ] Integration examples

---

## 🚀 Next Steps

1. **Start with Phase 1**: Setup project và code AccessControl
2. **Follow the roadmap**: Từng phase một, không skip
3. **Test thoroughly**: Mỗi contract phải có >90% coverage
4. **Document as you go**: Viết docs ngay khi code xong
5. **Review security**: Check lại security considerations

---

## 📚 Tài Liệu Tham Khảo

- [AccessControl Guide](../contracts/AccessControl.md)
- [RecordRegistry Guide](../contracts/RecordRegistry.md)
- [ConsentLedger Guide](../contracts/ConsentLedger.md)
- [DoctorUpdate Guide](../contracts/DoctorUpdate.md)
- [EHRSystemSecure Guide](../contracts/EHRSystemSecure.md)

**Happy Coding! 🎉**
