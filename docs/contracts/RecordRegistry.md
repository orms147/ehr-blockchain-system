# RecordRegistry Contract - Hệ Thống Quản Lý Medical Records

## 📋 Mục Lục
1. [Tổng Quan](#tổng-quan)
2. [Quá Trình Tư Duy Thiết Kế](#quá-trình-tư-duy-thiết-kế)
3. [Interface Design](#interface-design)
4. [Implementation Chi Tiết](#implementation-chi-tiết)
5. [Critical Bugs & Solutions](#critical-bugs--solutions)
6. [Testing Strategy](#testing-strategy)

---

## Tổng Quan

### Vai Trò Trong Hệ Thống
`RecordRegistry.sol` là **data layer** của hệ thống EHR, quản lý:
- ✅ Lưu trữ medical records (hash-only, privacy-first)
- ✅ Parent-child relationships (versioning)
- ✅ Ownership tracking & transfer
- ✅ Access control integration

### Privacy-First Design
```
❌ WRONG: Lưu plaintext CID on-chain
mapping(bytes32 => string) private _cidStrings;  // SECURITY RISK!

✅ CORRECT: Chỉ lưu hash
mapping(bytes32 => Record) private _records;
struct Record {
    bytes32 cidHash;  // keccak256(cid) - Privacy protected!
    // ... other fields
}
```

**Nguyên tắc:** Plaintext CID chỉ tồn tại off-chain (IPFS, database)!

---

## Quá Trình Tư Duy Thiết Kế

### Bước 1: Xác Định Requirements

#### Functional Requirements
1. **Record Creation**:
   - Patient tự tạo record
   - Doctor tạo record cho patient
   - Support parent-child (versioning)

2. **Record Update**:
   - Update CID (khi re-encrypt hoặc move IPFS)
   - Preserve parent-child relationships
   - Preserve ownership

3. **Ownership**:
   - Track owner
   - Transfer ownership
   - Track creator (for audit)

4. **Querying**:
   - Get record by hash
   - Get owner's records
   - Get child records
   - Check existence

#### Non-Functional Requirements
- 🔒 **Privacy**: No plaintext CID on-chain
- ⚡ **Gas Efficient**: Optimize storage
- 🔗 **Versioning**: Support record updates
- 🛡️ **Security**: Validate all inputs

### Bước 2: Data Structure Design

#### Record Struct
```solidity
struct Record {
    bytes32 cidHash;        // keccak256(cid) - PRIVACY!
    bytes32 parentCidHash;  // For versioning (0 if root)
    address createdBy;      // Who created (doctor or patient)
    address owner;          // Current owner (patient)
    bytes32 recordTypeHash; // keccak256("Lab Result"), etc.
    uint40 createdAt;       // Timestamp (uint40 sufficient until year 36812)
    uint8 version;          // Incremental version number
    bool exists;            // Existence flag
}
```

**Design Decisions:**
- `uint40` cho timestamp → Save gas (4 bytes vs 32 bytes)
- `uint8` cho version → Max 255 versions (sufficient)
- `bytes32` cho hashes → Privacy + fixed size
- `bool exists` → Distinguish zero-initialized vs actual record

#### Storage Mappings
```solidity
// Core storage
mapping(bytes32 => Record) private _records;

// Owner tracking
mapping(address => bytes32[]) private _ownerRecords;
mapping(address => mapping(bytes32 => uint256)) private _ownerRecordIndex;

// Parent-child relationships
mapping(bytes32 => bytes32[]) private _parentChildren;
```

**Why these mappings?**
- `_records`: Main data store
- `_ownerRecords`: Quick lookup of user's records
- `_ownerRecordIndex`: O(1) removal from owner's list
- `_parentChildren`: Track record versions

### Bước 3: Access Control Integration

```solidity
IAccessControl public immutable accessControl;

constructor(IAccessControl _accessControl) {
    accessControl = _accessControl;
    deployer = msg.sender;
}

modifier onlyRecordOwner(bytes32 cidHash) {
    if (_records[cidHash].owner != msg.sender) revert NotOwner();
    _;
}
```

**Integration points:**
- `addRecord`: Requires `isPatient(msg.sender)`
- `addRecordByDoctor`: Requires `isDoctor(msg.sender)`
- `updateRecordCID`: Requires ownership
- `transferOwnership`: Requires ownership

---

## Interface Design

### IRecordRegistry.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRecordRegistry {
    // ============ STRUCTS ============
    struct Record {
        bytes32 cidHash;
        bytes32 parentCidHash;
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
        bytes32 parentCidHash,  // NOT indexed (only 3 indexed params allowed)
        bytes32 recordTypeHash,
        uint40 timestamp
    );
    
    event RecordUpdated(
        bytes32 indexed oldCidHash,
        bytes32 indexed newCidHash,
        address indexed owner
    );
    
    event OwnershipTransferred(
        address indexed oldOwner,
        address indexed newOwner,
        bytes32 indexed cidHash
    );

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

    // ============ PATIENT FUNCTIONS ============
    function addRecord(
        string calldata cid,
        string calldata parentCID,
        string calldata recordType
    ) external;

    // ============ DOCTOR FUNCTIONS ============
    function addRecordByDoctor(
        string calldata cid,
        string calldata parentCID,
        string calldata recordType,
        address patient
    ) external;

    // ============ UPDATE FUNCTIONS ============
    function updateRecordCID(
        string calldata oldCID,
        string calldata newCID
    ) external;

    function transferOwnership(
        bytes32 cidHash,
        address newOwner
    ) external;

    // ============ VIEW FUNCTIONS ============
    function getRecord(bytes32 cidHash) external view returns (Record memory);
    function getRecordByString(string calldata cid) external view returns (Record memory);
    function getOwnerRecords(address owner) external view returns (bytes32[] memory);
    function getChildRecords(bytes32 parentCidHash) external view returns (bytes32[] memory);
    function recordExists(bytes32 cidHash) external view returns (bool);
    function getMaxChildrenLimit() external pure returns (uint8);
}
```

---

## Implementation Chi Tiết

### 1. Add Record (Patient)

```solidity
function addRecord(
    string calldata cid,
    string calldata parentCID,
    string calldata recordType
) external override {
    // 1. Check authorization
    if (!accessControl.isPatient(msg.sender)) revert NotPatient();
    
    // 2. Validate CID (CRITICAL!)
    if (bytes(cid).length == 0) revert EmptyCID();
    bytes32 cidHash = keccak256(bytes(cid));
    
    // 3. Calculate parent hash
    bytes32 parentHash = bytes(parentCID).length > 0 
        ? keccak256(bytes(parentCID)) 
        : bytes32(0);
    
    // 4. Call internal function
    _addRecord(cidHash, parentHash, recordType, msg.sender, msg.sender);
}
```

**Tư duy:**
1. ✅ Check authorization FIRST (fail fast)
2. ✅ Validate string length BEFORE hashing
3. ✅ Handle empty parent (root record)
4. ✅ Creator = Owner for patient-created records

### 2. Add Record (Doctor)

```solidity
function addRecordByDoctor(
    string calldata cid,
    string calldata parentCID,
    string calldata recordType,
    address patient
) external override {
    // 1. Check authorization
    if (!accessControl.isDoctor(msg.sender)) revert NotDoctor();
    
    // 2. Validate CID
    if (bytes(cid).length == 0) revert EmptyCID();
    bytes32 cidHash = keccak256(bytes(cid));
    
    // 3. Calculate parent hash
    bytes32 parentHash = bytes(parentCID).length > 0 
        ? keccak256(bytes(parentCID)) 
        : bytes32(0);
    
    // 4. Call internal function
    _addRecord(cidHash, parentHash, recordType, msg.sender, patient);
    //                                          ^^^^^^^^^^  ^^^^^^^
    //                                          creator     owner
}
```

**Tư duy:**
- Creator = Doctor (for audit trail)
- Owner = Patient (patient owns their data!)

### 3. Internal Add Record Logic

```solidity
function _addRecord(
    bytes32 cidHash,
    bytes32 parentCidHash,
    string memory recordType,
    address creator,
    address patient
) internal {
    // 1. Validate record doesn't exist
    if (_records[cidHash].exists) revert RecordExists();

    // 2. Handle parent-child relationship
    uint8 version = 1;
    if (parentCidHash != bytes32(0)) {
        // Validate parent exists
        if (!_records[parentCidHash].exists) revert ParentNotExist();
        
        // Increment version
        version = _records[parentCidHash].version + 1;
        
        // Check children limit
        if (_parentChildren[parentCidHash].length >= MAX_CHILDREN) {
            revert TooManyChildren();
        }
        
        // Add to parent's children
        _parentChildren[parentCidHash].push(cidHash);
    }

    // 3. Create record
    uint40 now40 = uint40(block.timestamp);
    bytes32 recordTypeHash = keccak256(bytes(recordType));

    _records[cidHash] = Record({
        cidHash: cidHash,
        parentCidHash: parentCidHash,
        createdBy: creator,
        owner: patient,
        recordTypeHash: recordTypeHash,
        createdAt: now40,
        version: version,
        exists: true
    });

    // 4. Track owner records
    _ownerRecords[patient].push(cidHash);
    _ownerRecordIndex[patient][cidHash] = _ownerRecords[patient].length;

    // 5. Emit event
    emit RecordAdded(patient, cidHash, parentCidHash, recordTypeHash, now40);
}
```

**Tư duy:**
1. ✅ Validate existence (prevent duplicates)
2. ✅ Handle versioning (parent-child)
3. ✅ Check MAX_CHILDREN limit
4. ✅ Track ownership
5. ✅ Emit event for indexing

### 4. Update Record CID (CRITICAL!)

```solidity
function updateRecordCID(
    string calldata oldCID,
    string calldata newCID
) external override {
    bytes32 oldHash = keccak256(bytes(oldCID));
    bytes32 newHash = keccak256(bytes(newCID));
    
    // 1. Validate
    Record storage rec = _records[oldHash];
    if (!rec.exists) revert RecordNotExist();
    if (rec.owner != msg.sender) revert NotOwner();
    if (_records[newHash].exists) revert RecordExists();

    // 2. Copy data to new hash
    _records[newHash] = Record({
        cidHash: newHash,
        parentCidHash: rec.parentCidHash,
        createdBy: rec.createdBy,
        owner: rec.owner,
        recordTypeHash: rec.recordTypeHash,
        createdAt: rec.createdAt,
        version: rec.version,
        exists: true
    });

    // 3. Update parent's children (if this record is a child)
    if (rec.parentCidHash != bytes32(0)) {
        bytes32[] storage children = _parentChildren[rec.parentCidHash];
        for (uint256 i = 0; i < children.length; i++) {
            if (children[i] == oldHash) {
                children[i] = newHash;
                break;
            }
        }
    }

    // 4. Update owner records
    uint256 idx = _ownerRecordIndex[rec.owner][oldHash];
    if (idx > 0) {
        _ownerRecords[rec.owner][idx - 1] = newHash;
        _ownerRecordIndex[rec.owner][newHash] = idx;
        delete _ownerRecordIndex[rec.owner][oldHash];
    }

    // 5. ✅ CRITICAL: Move children if this record is a parent
    bytes32[] memory myChildren = _parentChildren[oldHash];
    if (myChildren.length > 0) {
        _parentChildren[newHash] = myChildren;
        delete _parentChildren[oldHash];

        // Update parent reference in all children
        for (uint256 i = 0; i < myChildren.length; i++) {
            if (_records[myChildren[i]].exists) {
                _records[myChildren[i]].parentCidHash = newHash;
            }
        }
    }

    // 6. Delete old record
    delete _records[oldHash];

    // 7. Emit event
    emit RecordUpdated(oldHash, newHash, rec.owner);
}
```

**Tư duy:**
1. ✅ Validate ownership
2. ✅ Copy all data to new hash
3. ✅ Update reference in parent's children list
4. ✅ Update owner's records list
5. ✅ **CRITICAL**: Move children array & update their parent pointers
6. ✅ Delete old record
7. ✅ Emit event

### 5. Transfer Ownership

```solidity
function transferOwnership(
    bytes32 cidHash,
    address newOwner
) external override onlyRecordOwner(cidHash) {
    if (newOwner == address(0)) revert InvalidAddress();
    
    Record storage rec = _records[cidHash];
    address previousOwner = rec.owner;
    
    // 1. Remove from old owner
    uint256 idx = _ownerRecordIndex[previousOwner][cidHash];
    if (idx > 0) {
        uint256 lastIdx = _ownerRecords[previousOwner].length - 1;
        
        // Swap with last element
        if (idx - 1 != lastIdx) {
            bytes32 lastHash = _ownerRecords[previousOwner][lastIdx];
            _ownerRecords[previousOwner][idx - 1] = lastHash;
            _ownerRecordIndex[previousOwner][lastHash] = idx;
        }
        
        // Remove last element
        _ownerRecords[previousOwner].pop();
        delete _ownerRecordIndex[previousOwner][cidHash];
    }
    
    // 2. Add to new owner
    rec.owner = newOwner;
    _ownerRecords[newOwner].push(cidHash);
    _ownerRecordIndex[newOwner][cidHash] = _ownerRecords[newOwner].length;
    
    // 3. Emit event
    emit OwnershipTransferred(previousOwner, newOwner, cidHash);
}
```

**Tư duy:**
- ✅ Use swap-and-pop pattern (gas efficient)
- ✅ Update both owner and index mappings
- ✅ Validate new owner address

---

## Critical Bugs & Solutions

### Bug #1: Empty CID Check

#### ❌ WRONG Implementation
```solidity
function addRecord(string calldata cid, ...) external {
    bytes32 cidHash = keccak256(bytes(cid));
    if (cidHash == bytes32(0)) revert EmptyCID();  // NEVER TRUE!
    // ...
}
```

**Vấn đề:** `keccak256("")` ≠ `bytes32(0)`!
```solidity
keccak256("") = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
```

#### ✅ CORRECT Implementation
```solidity
function addRecord(string calldata cid, ...) external {
    if (bytes(cid).length == 0) revert EmptyCID();  // Check BEFORE hashing
    bytes32 cidHash = keccak256(bytes(cid));
    // ...
}
```

### Bug #2: Update Record Loses Children

#### ❌ WRONG Implementation
```solidity
function updateRecordCID(string calldata oldCID, string calldata newCID) external {
    // ... copy record data ...
    
    // Update parent's children
    if (rec.parentCidHash != bytes32(0)) {
        // ... update reference in parent ...
    }
    
    delete _records[oldHash];
    // ❌ BUG: _parentChildren[oldHash] still exists!
    // ❌ BUG: Children still point to oldHash!
}
```

**Vấn đề:**
- Children array không được move
- Children records vẫn trỏ đến old parent hash

#### ✅ CORRECT Implementation
```solidity
function updateRecordCID(string calldata oldCID, string calldata newCID) external {
    // ... copy record data ...
    // ... update parent's children ...
    
    // ✅ FIX: Move children array
    bytes32[] memory myChildren = _parentChildren[oldHash];
    if (myChildren.length > 0) {
        _parentChildren[newHash] = myChildren;
        delete _parentChildren[oldHash];
        
        // ✅ FIX: Update parent reference in each child
        for (uint256 i = 0; i < myChildren.length; i++) {
            _records[myChildren[i]].parentCidHash = newHash;
        }
    }
    
    delete _records[oldHash];
}
```

---

## Testing Strategy

### Test Categories

#### 1. Add Record Tests
```solidity
function test_AddRecord_Success() public {
    vm.prank(patient1);
    recordRegistry.addRecord(CID_1, "", "General");
    
    IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_1)));
    assertEq(rec.owner, patient1);
    assertTrue(rec.exists);
}

function test_AddRecord_WithParent_Success() public {
    vm.startPrank(patient1);
    recordRegistry.addRecord(PARENT_CID, "", "General");
    recordRegistry.addRecord(CID_1, PARENT_CID, "Lab Result");
    vm.stopPrank();
    
    bytes32[] memory children = recordRegistry.getChildRecords(keccak256(bytes(PARENT_CID)));
    assertEq(children.length, 1);
}

function test_AddRecord_RevertWhen_EmptyCID() public {
    vm.expectRevert(IRecordRegistry.EmptyCID.selector);
    vm.prank(patient1);
    recordRegistry.addRecord("", "", "General");
}
```

#### 2. Update Record Tests (CRITICAL!)
```solidity
function test_UpdateRecordCID_Success() public {
    vm.prank(patient1);
    recordRegistry.addRecord(CID_1, "", "General");
    
    vm.prank(patient1);
    recordRegistry.updateRecordCID(CID_1, CID_2);
    
    // Verify new record exists
    assertTrue(recordRegistry.recordExists(keccak256(bytes(CID_2))));
    
    // Verify old record deleted
    vm.expectRevert(IRecordRegistry.RecordNotExist.selector);
    recordRegistry.getRecord(keccak256(bytes(CID_1)));
}

function test_UpdateRecordCID_WithChildren_Success() public {
    vm.startPrank(patient1);
    recordRegistry.addRecord(PARENT_CID, "", "General");
    recordRegistry.addRecord(CID_1, PARENT_CID, "Lab");
    
    // Update parent
    recordRegistry.updateRecordCID(PARENT_CID, NEW_PARENT_CID);
    vm.stopPrank();
    
    // ✅ CRITICAL: Verify children moved
    bytes32[] memory children = recordRegistry.getChildRecords(keccak256(bytes(NEW_PARENT_CID)));
    assertEq(children.length, 1);
    
    // ✅ CRITICAL: Verify child's parent pointer updated
    IRecordRegistry.Record memory child = recordRegistry.getRecord(keccak256(bytes(CID_1)));
    assertEq(child.parentCidHash, keccak256(bytes(NEW_PARENT_CID)));
}
```

#### 3. Transfer Ownership Tests
```solidity
function test_TransferOwnership_Success() public {
    vm.prank(patient1);
    recordRegistry.addRecord(CID_1, "", "General");
    
    bytes32 cidHash = keccak256(bytes(CID_1));
    
    vm.prank(patient1);
    recordRegistry.transferOwnership(cidHash, patient2);
    
    IRecordRegistry.Record memory rec = recordRegistry.getRecord(cidHash);
    assertEq(rec.owner, patient2);
    
    // Verify in patient2's list
    bytes32[] memory patient2Records = recordRegistry.getOwnerRecords(patient2);
    assertEq(patient2Records.length, 1);
    
    // Verify removed from patient1's list
    bytes32[] memory patient1Records = recordRegistry.getOwnerRecords(patient1);
    assertEq(patient1Records.length, 0);
}
```

#### 4. Edge Cases
```solidity
function test_MaxChildrenLimit() public {
    vm.prank(patient1);
    recordRegistry.addRecord(PARENT_CID, "", "General");
    
    uint8 maxChildren = recordRegistry.getMaxChildrenLimit();
    
    vm.startPrank(patient1);
    for (uint8 i = 0; i < maxChildren; i++) {
        recordRegistry.addRecord(
            string(abi.encodePacked("Child", vm.toString(i))),
            PARENT_CID,
            "Lab"
        );
    }
    
    // Try to add one more
    vm.expectRevert(IRecordRegistry.TooManyChildren.selector);
    recordRegistry.addRecord("ExtraChild", PARENT_CID, "Lab");
    vm.stopPrank();
}
```

---

## Gas Optimization Tips

### 1. Use uint40 for Timestamps
```solidity
uint40 createdAt;  // 4 bytes (sufficient until year 36812)
// vs
uint256 createdAt; // 32 bytes (wasteful!)
```

### 2. Pack Struct Variables
```solidity
struct Record {
    bytes32 cidHash;        // 32 bytes - Slot 0
    bytes32 parentCidHash;  // 32 bytes - Slot 1
    address createdBy;      // 20 bytes - Slot 2
    address owner;          // 20 bytes - Slot 3
    bytes32 recordTypeHash; // 32 bytes - Slot 4
    uint40 createdAt;       // 4 bytes  - Slot 5
    uint8 version;          // 1 byte   - Slot 5 (packed!)
    bool exists;            // 1 byte   - Slot 5 (packed!)
}
// Total: 6 slots (vs 8 if not packed)
```

### 3. Use Calldata for External Functions
```solidity
function addRecord(
    string calldata cid,  // calldata, not memory!
    string calldata parentCID,
    string calldata recordType
) external {
    // ...
}
```

---

## Kết Luận

### Key Takeaways

1. **Privacy First**: Chỉ lưu hash, không lưu plaintext
2. **Validate Early**: Check string length BEFORE hashing
3. **Preserve Relationships**: Update children khi update parent
4. **Gas Optimization**: Pack structs, use uint40, calldata
5. **Comprehensive Testing**: Test update with children!

### Common Pitfalls

1. ❌ Check hash instead of string length
2. ❌ Forget to move children when updating parent
3. ❌ Forget to update children's parent pointers
4. ❌ Use uint256 for timestamps
5. ❌ Use memory instead of calldata

### Next Steps

Sau khi hiểu RecordRegistry:
1. ✅ Implement [ConsentLedger](./ConsentLedger.md)
2. ✅ Integrate với DoctorUpdate
3. ✅ Test end-to-end flows

**Happy Coding! 🚀**
