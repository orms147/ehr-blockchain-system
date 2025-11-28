# DoctorUpdate Contract - Doctor-Initiated Actions

## 📋 Mục Lục
1. [Tổng Quan](#tổng-quan)
2. [Quá Trình Tư Duy Thiết Kế](#quá-trình-tư-duy-thiết-kế)
3. [Implementation Chi Tiết](#implementation-chi-tiết)
4. [Emergency Access System](#emergency-access-system)
5. [Testing Strategy](#testing-strategy)

---

## Tổng Quan

### Vai Trò Trong Hệ Thống
`DoctorUpdate.sol` cho phép bác sĩ:
- ✅ Tạo medical record cho bệnh nhân
- ✅ Tự động nhận quyền truy cập tạm thời
- ✅ Yêu cầu emergency access (với witnesses)
- ✅ Gia hạn quyền truy cập

### Use Cases
```
1. Khám bệnh thường:
   Doctor → Create record → Auto-grant 72h access

2. Cấp cứu:
   Doctor → Emergency access → 2 witnesses confirm → 24h access

3. Theo dõi:
   Doctor → Extend access → Continue monitoring
```

---

## Quá Trình Tư Duy Thiết Kế

### Bước 1: Xác Định Requirements

#### Functional Requirements
1. **Doctor Create Record**:
   - Verified doctor có thể tạo record cho patient
   - Tự động grant temporary access
   - Configurable access duration

2. **Emergency Access**:
   - Bác sĩ yêu cầu emergency access
   - Cần ít nhất 2 verified doctors làm witnesses
   - Witnesses không được trùng với requester
   - Auto-grant 24h access

3. **Extend Access**:
   - Doctor có thể gia hạn access đang có
   - Validate duration limits

#### Non-Functional Requirements
- 🔒 **Security**: Chỉ verified doctors
- ⏱️ **Time-Limited**: All access có expiry
- 📝 **Audit Trail**: Log emergency access với witnesses
- ⚡ **Gas Efficient**: Minimize storage

### Bước 2: Constants Design

```solidity
// Access duration limits
uint40 public constant MIN_ACCESS_DURATION = 1 hours;
uint40 public constant MAX_ACCESS_DURATION = 2160 hours;  // 90 days
uint40 public constant DEFAULT_ACCESS_DURATION = 72 hours; // 3 days

// Emergency access
uint40 public constant EMERGENCY_ACCESS_DURATION = 24 hours;
uint8 public constant MIN_WITNESSES = 2;
```

**Tư duy:**
- MIN: 1 hour (cho quick consultations)
- MAX: 90 days (cho long-term treatment)
- DEFAULT: 3 days (reasonable for most cases)
- EMERGENCY: 24 hours (enough for critical care)

### Bước 3: Integration Points

```solidity
IAccessControl public immutable accessControl;
IRecordRegistry public immutable recordRegistry;
IConsentLedger public immutable consentLedger;

constructor(
    IAccessControl _accessControl,
    IRecordRegistry _recordRegistry,
    IConsentLedger _consentLedger
) {
    accessControl = _accessControl;
    recordRegistry = _recordRegistry;
    consentLedger = _consentLedger;
}
```

**Dependencies:**
- AccessControl: Check `isDoctor`, `isVerifiedDoctor`
- RecordRegistry: Create records
- ConsentLedger: Grant access

---

## Implementation Chi Tiết

### 1. Add Record By Doctor

```solidity
function addRecordByDoctor(
    string calldata cid,
    string calldata parentCID,
    string calldata recordType,
    address patient,
    bytes32 patientEncKeyHash,
    bytes32 doctorEncKeyHash,
    uint40 doctorAccessHours
) external {
    // 1. Authorization check
    if (!accessControl.isDoctor(msg.sender)) revert NotDoctor();
    
    // 2. Validate access duration
    if (doctorAccessHours == 0) {
        doctorAccessHours = DEFAULT_ACCESS_DURATION;
    }
    if (doctorAccessHours < MIN_ACCESS_DURATION) revert InvalidAccessDuration();
    if (doctorAccessHours > MAX_ACCESS_DURATION) revert InvalidAccessDuration();
    
    // 3. Create record (via RecordRegistry)
    recordRegistry.addRecordByDoctor(cid, parentCID, recordType, patient);
    
    // 4. Auto-grant access to doctor
    uint40 expireAt = uint40(block.timestamp) + (doctorAccessHours * 1 hours);
    consentLedger.grantInternal(
        patient,
        msg.sender,
        cid,
        doctorEncKeyHash,
        expireAt,
        false,  // includeUpdates
        false   // allowDelegate
    );
    
    // 5. Emit event
    emit RecordAddedByDoctor(
        msg.sender,
        patient,
        keccak256(bytes(cid)),
        bytes(parentCID).length > 0 ? keccak256(bytes(parentCID)) : bytes32(0),
        keccak256(bytes(recordType)),
        expireAt
    );
}
```

**Tư duy:**
1. ✅ Check authorization FIRST
2. ✅ Validate & apply defaults
3. ✅ Create record (patient owns it!)
4. ✅ Auto-grant temporary access
5. ✅ Emit event for audit

**Flow:**
```
Doctor → addRecordByDoctor()
    ↓
RecordRegistry.addRecordByDoctor()
    → Record created (owner = patient)
    ↓
ConsentLedger.grantInternal()
    → Doctor gets temporary access
    ↓
Event emitted
```

### 2. Emergency Access

```solidity
function grantEmergencyAccess(
    address patient,
    string calldata rootCID,
    bytes32 encKeyHash,
    string calldata reason,
    address[] calldata witnesses
) external {
    // 1. Authorization check
    if (!accessControl.isVerifiedDoctor(msg.sender)) revert NotVerifiedDoctor();
    
    // 2. Validate witnesses
    if (witnesses.length < MIN_WITNESSES) revert InsufficientWitnesses();
    
    // 3. Validate each witness
    for (uint256 i = 0; i < witnesses.length; i++) {
        address witness = witnesses[i];
        
        // Cannot be the requester
        if (witness == msg.sender) revert DoctorAsWitness();
        
        // Must be verified doctor
        if (!accessControl.isVerifiedDoctor(witness)) revert WitnessNotVerified();
        
        // Check for duplicates
        for (uint256 j = i + 1; j < witnesses.length; j++) {
            if (witnesses[j] == witness) revert DuplicateWitness();
        }
    }
    
    // 4. Grant emergency access (24 hours)
    uint40 expireAt = uint40(block.timestamp) + EMERGENCY_ACCESS_DURATION;
    consentLedger.grantInternal(
        patient,
        msg.sender,
        rootCID,
        encKeyHash,
        expireAt,
        false,
        false
    );
    
    // 5. Emit event with witnesses
    emit EmergencyAccessGranted(
        msg.sender,
        patient,
        keccak256(bytes(rootCID)),
        reason,
        witnesses,
        expireAt
    );
}
```

**Tư duy:**
1. ✅ Require VERIFIED doctor (higher trust)
2. ✅ Validate minimum witnesses
3. ✅ Check each witness:
   - Not the requester
   - Is verified doctor
   - No duplicates
4. ✅ Grant 24h access
5. ✅ Emit event với witnesses (audit trail!)

**Security Considerations:**
```solidity
// ❌ WRONG: Allow requester as witness
if (witness == msg.sender) continue;  // Skip, but allow

// ✅ CORRECT: Reject if requester is witness
if (witness == msg.sender) revert DoctorAsWitness();

// ❌ WRONG: Allow duplicate witnesses
// (Doctor could use same witness multiple times)

// ✅ CORRECT: Check for duplicates
for (uint256 j = i + 1; j < witnesses.length; j++) {
    if (witnesses[j] == witness) revert DuplicateWitness();
}
```

### 3. Extend Doctor Access

```solidity
function extendDoctorAccess(
    address patient,
    string calldata rootCID,
    bytes32 encKeyHash,
    uint40 additionalHours
) external {
    // 1. Authorization check
    if (!accessControl.isDoctor(msg.sender)) revert NotDoctor();
    
    // 2. Validate duration
    if (additionalHours < MIN_ACCESS_DURATION) revert InvalidAccessDuration();
    if (additionalHours > MAX_ACCESS_DURATION) revert InvalidAccessDuration();
    
    // 3. Check current access
    IConsentLedger.Consent memory currentConsent = consentLedger.getConsent(
        patient,
        msg.sender,
        rootCID
    );
    
    if (!currentConsent.active) revert NoActiveConsent();
    
    // 4. Calculate new expiry
    uint40 newExpireAt = currentConsent.expireAt + (additionalHours * 1 hours);
    
    // 5. Re-grant with new expiry
    consentLedger.grantInternal(
        patient,
        msg.sender,
        rootCID,
        encKeyHash,
        newExpireAt,
        currentConsent.includeUpdates,
        currentConsent.allowDelegate
    );
    
    // 6. Emit event
    emit AccessExtended(
        msg.sender,
        patient,
        keccak256(bytes(rootCID)),
        newExpireAt
    );
}
```

**Tư duy:**
- ✅ Validate có consent hiện tại
- ✅ Extend từ expiry hiện tại (không reset!)
- ✅ Preserve consent settings (includeUpdates, allowDelegate)

---

## Emergency Access System

### Design Philosophy

**Tại sao cần Emergency Access?**
```
Scenario: Bệnh nhân bất tỉnh, cần cấp cứu ngay
- Không thể xin consent từ bệnh nhân
- Cần truy cập medical history ngay lập tức
- Cần audit trail để tránh abuse
```

**Solution: Witness-Based Emergency Access**
```
Doctor A (Requester) → Request emergency access
    ↓
Doctor B (Witness 1) → Confirm emergency
Doctor C (Witness 2) → Confirm emergency
    ↓
System → Grant 24h access
    ↓
Event logged → Audit trail with witnesses
```

### Witness Validation Rules

```solidity
// Rule 1: Minimum witnesses
if (witnesses.length < MIN_WITNESSES) revert InsufficientWitnesses();

// Rule 2: Requester cannot be witness
if (witness == msg.sender) revert DoctorAsWitness();

// Rule 3: Witnesses must be verified
if (!accessControl.isVerifiedDoctor(witness)) revert WitnessNotVerified();

// Rule 4: No duplicate witnesses
for (uint256 j = i + 1; j < witnesses.length; j++) {
    if (witnesses[j] == witness) revert DuplicateWitness();
}
```

### Audit Trail

```solidity
event EmergencyAccessGranted(
    address indexed doctor,
    address indexed patient,
    bytes32 indexed cidHash,
    string reason,           // Why emergency access needed
    address[] witnesses,     // Who confirmed
    uint40 expireAt         // When it expires
);
```

**Off-chain tracking:**
- Log all emergency access events
- Alert patient sau khi tỉnh lại
- Review board có thể audit
- Revoke nếu phát hiện abuse

---

## Testing Strategy

### Test Categories

#### 1. Add Record Tests

```solidity
function test_AddRecordByDoctor_Success() public {
    _setupVerifiedDoctor(doctor1, org1);
    
    vm.prank(doctor1);
    doctorUpdate.addRecordByDoctor(
        CID_1,
        "",
        "Blood Test",
        patient1,
        PATIENT_KEY,
        DOCTOR_KEY,
        72  // 72 hours
    );
    
    // Verify record created
    IRecordRegistry.Record memory rec = recordRegistry.getRecord(keccak256(bytes(CID_1)));
    assertEq(rec.owner, patient1);
    assertEq(rec.createdBy, doctor1);
    
    // Verify doctor has access
    assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1));
}

function test_AddRecordByDoctor_WithDefaultDuration() public {
    _setupVerifiedDoctor(doctor1, org1);
    
    vm.prank(doctor1);
    doctorUpdate.addRecordByDoctor(
        CID_1, "", "Test", patient1,
        PATIENT_KEY, DOCTOR_KEY,
        0  // Use default
    );
    
    IConsentLedger.Consent memory consent = consentLedger.getConsent(patient1, doctor1, CID_1);
    assertEq(consent.expireAt, uint40(block.timestamp) + 72 hours);
}

function test_AddRecordByDoctor_RevertWhen_NotDoctor() public {
    vm.expectRevert(IDoctorUpdate.NotDoctor.selector);
    vm.prank(attacker);
    doctorUpdate.addRecordByDoctor(
        CID_1, "", "Test", patient1,
        PATIENT_KEY, DOCTOR_KEY, 72
    );
}

function test_AddRecordByDoctor_RevertWhen_DurationTooShort() public {
    _setupVerifiedDoctor(doctor1, org1);
    
    vm.expectRevert(IDoctorUpdate.InvalidAccessDuration.selector);
    vm.prank(doctor1);
    doctorUpdate.addRecordByDoctor(
        CID_1, "", "Test", patient1,
        PATIENT_KEY, DOCTOR_KEY,
        0.5 hours  // Too short!
    );
}
```

#### 2. Emergency Access Tests

```solidity
function test_GrantEmergencyAccess_Success() public {
    _setupVerifiedDoctor(doctor1, org1);
    _setupVerifiedDoctor(witness1, org1);
    _setupVerifiedDoctor(witness2, org1);
    
    vm.prank(patient1);
    recordRegistry.addRecord(CID_1, "", "General");
    
    address[] memory witnesses = new address[](2);
    witnesses[0] = witness1;
    witnesses[1] = witness2;
    
    vm.prank(doctor1);
    doctorUpdate.grantEmergencyAccess(
        patient1,
        CID_1,
        DOCTOR_KEY,
        "Patient unconscious, critical condition",
        witnesses
    );
    
    // Verify access granted
    assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1));
    
    // Verify 24h expiry
    IConsentLedger.Consent memory consent = consentLedger.getConsent(patient1, doctor1, CID_1);
    assertEq(consent.expireAt, uint40(block.timestamp) + 24 hours);
}

function test_GrantEmergencyAccess_RevertWhen_InsufficientWitnesses() public {
    _setupVerifiedDoctor(doctor1, org1);
    _setupVerifiedDoctor(witness1, org1);
    
    address[] memory witnesses = new address[](1);  // Only 1!
    witnesses[0] = witness1;
    
    vm.expectRevert(IDoctorUpdate.InsufficientWitnesses.selector);
    vm.prank(doctor1);
    doctorUpdate.grantEmergencyAccess(
        patient1, CID_1, DOCTOR_KEY, "Emergency", witnesses
    );
}

function test_GrantEmergencyAccess_RevertWhen_DoctorAsWitness() public {
    _setupVerifiedDoctor(doctor1, org1);
    _setupVerifiedDoctor(witness1, org1);
    
    address[] memory witnesses = new address[](2);
    witnesses[0] = doctor1;  // Requester as witness!
    witnesses[1] = witness1;
    
    vm.expectRevert(IDoctorUpdate.DoctorAsWitness.selector);
    vm.prank(doctor1);
    doctorUpdate.grantEmergencyAccess(
        patient1, CID_1, DOCTOR_KEY, "Emergency", witnesses
    );
}

function test_GrantEmergencyAccess_RevertWhen_DuplicateWitness() public {
    _setupVerifiedDoctor(doctor1, org1);
    _setupVerifiedDoctor(witness1, org1);
    
    address[] memory witnesses = new address[](2);
    witnesses[0] = witness1;
    witnesses[1] = witness1;  // Duplicate!
    
    vm.expectRevert(IDoctorUpdate.DuplicateWitness.selector);
    vm.prank(doctor1);
    doctorUpdate.grantEmergencyAccess(
        patient1, CID_1, DOCTOR_KEY, "Emergency", witnesses
    );
}

function test_GrantEmergencyAccess_RevertWhen_WitnessNotVerified() public {
    _setupVerifiedDoctor(doctor1, org1);
    _setupVerifiedDoctor(witness1, org1);
    
    // witness2 is registered but NOT verified
    vm.prank(witness2);
    accessControl.registerAsDoctor();
    
    address[] memory witnesses = new address[](2);
    witnesses[0] = witness1;
    witnesses[1] = witness2;  // Not verified!
    
    vm.expectRevert(IDoctorUpdate.WitnessNotVerified.selector);
    vm.prank(doctor1);
    doctorUpdate.grantEmergencyAccess(
        patient1, CID_1, DOCTOR_KEY, "Emergency", witnesses
    );
}
```

#### 3. Extend Access Tests

```solidity
function test_ExtendDoctorAccess_Success() public {
    // Setup: Doctor has existing access
    _setupVerifiedDoctor(doctor1, org1);
    
    vm.prank(doctor1);
    doctorUpdate.addRecordByDoctor(
        CID_1, "", "Test", patient1,
        PATIENT_KEY, DOCTOR_KEY, 24  // 24h initial
    );
    
    IConsentLedger.Consent memory initialConsent = consentLedger.getConsent(patient1, doctor1, CID_1);
    uint40 initialExpiry = initialConsent.expireAt;
    
    // Extend by 48 hours
    vm.prank(doctor1);
    doctorUpdate.extendDoctorAccess(patient1, CID_1, DOCTOR_KEY, 48);
    
    // Verify extended
    IConsentLedger.Consent memory extendedConsent = consentLedger.getConsent(patient1, doctor1, CID_1);
    assertEq(extendedConsent.expireAt, initialExpiry + 48 hours);
}

function test_ExtendDoctorAccess_RevertWhen_NoActiveConsent() public {
    _setupVerifiedDoctor(doctor1, org1);
    
    vm.expectRevert(IDoctorUpdate.NoActiveConsent.selector);
    vm.prank(doctor1);
    doctorUpdate.extendDoctorAccess(patient1, CID_1, DOCTOR_KEY, 24);
}
```

#### 4. Edge Cases

```solidity
function test_EdgeCase_EmergencyAccessExpiry() public {
    // Setup emergency access
    _setupEmergencyAccess(doctor1, patient1, CID_1);
    
    // Verify access active
    assertTrue(consentLedger.canAccess(patient1, doctor1, CID_1));
    
    // Warp past 24 hours
    vm.warp(block.timestamp + 25 hours);
    
    // Verify access expired
    assertFalse(consentLedger.canAccess(patient1, doctor1, CID_1));
}

function test_GetAccessLimits_Success() public view {
    (
        uint40 minHours,
        uint40 maxHours,
        uint40 defaultHours,
        uint40 emergencyHours,
        uint8 minWitnesses
    ) = doctorUpdate.getAccessLimits();
    
    assertEq(minHours, 1);
    assertEq(maxHours, 2160);  // 90 days
    assertEq(defaultHours, 72);
    assertEq(emergencyHours, 24);
    assertEq(minWitnesses, 2);
}
```

---

## Common Pitfalls & Solutions

### ❌ Pitfall 1: Not Checking Doctor Verification

```solidity
// WRONG: Allow any doctor
function addRecordByDoctor(...) external {
    if (!accessControl.isDoctor(msg.sender)) revert NotDoctor();
    // ...
}

// For normal operations, this is OK
// But for emergency access:

// CORRECT: Require verified doctor
function grantEmergencyAccess(...) external {
    if (!accessControl.isVerifiedDoctor(msg.sender)) revert NotVerifiedDoctor();
    // Higher trust level for emergency!
}
```

### ❌ Pitfall 2: Allowing Requester as Witness

```solidity
// WRONG: Skip if requester
for (uint256 i = 0; i < witnesses.length; i++) {
    if (witnesses[i] == msg.sender) continue;  // Skip
    // ...
}

// CORRECT: Reject if requester
for (uint256 i = 0; i < witnesses.length; i++) {
    if (witnesses[i] == msg.sender) revert DoctorAsWitness();
    // ...
}
```

### ❌ Pitfall 3: Not Checking Duplicate Witnesses

```solidity
// WRONG: No duplicate check
for (uint256 i = 0; i < witnesses.length; i++) {
    if (!accessControl.isVerifiedDoctor(witnesses[i])) revert WitnessNotVerified();
}

// CORRECT: Check for duplicates
for (uint256 i = 0; i < witnesses.length; i++) {
    // ... other checks ...
    
    for (uint256 j = i + 1; j < witnesses.length; j++) {
        if (witnesses[j] == witnesses[i]) revert DuplicateWitness();
    }
}
```

### ❌ Pitfall 4: Wrong Expiry Calculation

```solidity
// WRONG: Reset expiry when extending
function extendDoctorAccess(..., uint40 additionalHours) external {
    uint40 newExpireAt = uint40(block.timestamp) + (additionalHours * 1 hours);
    // This RESETS expiry, not extends!
}

// CORRECT: Extend from current expiry
function extendDoctorAccess(..., uint40 additionalHours) external {
    IConsentLedger.Consent memory current = consentLedger.getConsent(...);
    uint40 newExpireAt = current.expireAt + (additionalHours * 1 hours);
    // This EXTENDS from current expiry
}
```

---

## Kết Luận

### Key Takeaways

1. **Auto-Grant Pattern**: Doctor creates record → Auto-grant temporary access
2. **Emergency Access**: Witness-based system cho critical situations
3. **Time-Limited**: All access có expiry (security)
4. **Audit Trail**: Log emergency access với witnesses
5. **Validation**: Check doctor verification, witnesses, durations

### Security Checklist

- [ ] Check `isDoctor` for normal operations
- [ ] Check `isVerifiedDoctor` for emergency access
- [ ] Validate minimum witnesses
- [ ] Reject requester as witness
- [ ] Check for duplicate witnesses
- [ ] Validate access durations
- [ ] Emit events for audit trail

### Next Steps

1. ✅ Implement [EHRSystemSecure](./EHRSystemSecure.md)
2. ✅ Integration testing
3. ✅ Deploy & monitor emergency access usage

**Happy Coding! 🚀**
