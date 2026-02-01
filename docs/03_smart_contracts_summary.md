# Smart Contracts Summary

> **Last Updated**: 2026-01-21
> **Contracts Location**: `/contracts/src/`

---

## Overview

| Contract | Lines | Purpose |
|----------|-------|---------|
| **AccessControl.sol** | ~450 | Role management + Organization entity |
| **RecordRegistry.sol** | 329 | Medical record metadata storage |
| **ConsentLedger.sol** | 460 | Consent + delegation management |
| **EHRSystemSecure.sol** | 359 | Access request workflow |
| **DoctorUpdate.sol** | 259 | Doctor record creation flow |

---

## 1. AccessControl.sol

### Role Bitmasks

```solidity
PATIENT         = 1 << 0;  // 0001
DOCTOR          = 1 << 1;  // 0010
ORGANIZATION    = 1 << 2;  // 0100
MINISTRY        = 1 << 3;  // 1000
VERIFIED_DOCTOR = 1 << 4;  // 0001 0000
VERIFIED_ORG    = 1 << 5;  // 0010 0000
```

### Storage

```solidity
address public immutable MINISTRY_OF_HEALTH;
mapping(address => uint8) private _roles;
mapping(address => Verification) public doctorVerifications;
mapping(address => Verification) public orgVerifications;
mapping(address => address[]) public orgMembers;
mapping(address => bool) public authorizedRelayers;

// NEW: Organization Entity
uint256 public orgCount;
mapping(uint256 => Organization) public organizations;
mapping(address => uint256) public adminToOrgId;
```

### Organization Struct (NEW)

```solidity
struct Organization {
    uint256 id;
    string name;
    address primaryAdmin;
    address backupAdmin;
    uint40 createdAt;
    bool active;
}
```

### Key Functions

| Function | Modifier | Description |
|----------|----------|-------------|
| `registerAsPatient()` | - | Self register as patient |
| `registerAsDoctor()` | - | Self register as doctor |
| `registerPatientFor(user)` | `onlyRelayer` | Gasless patient registration |
| `registerDoctorFor(user)` | `onlyRelayer` | Gasless doctor registration |
| `createOrganization(name, primary, backup)` | `onlyMinistry` | Create org entity (NEW) |
| `setOrgAdmins(orgId, newPrimary, newBackup)` | `onlyMinistry` | Change/recover admins (NEW) |
| `setOrgActive(orgId, active)` | `onlyMinistry` | Activate/deactivate (NEW) |
| `verifyDoctor(doctor, cred)` | isActiveOrgAdmin | Org verifies doctor (UPDATED) |
| `verifyDoctorByMinistry(doctor, cred)` | `onlyMinistry` | Ministry verifies doctor |
| `setRelayer(addr, bool)` | `onlyMinistry` | Manage relayers |
| `isActiveOrgAdmin(user)` | view | Check active org admin (NEW) |
| `getOrganization(orgId)` | view | Get org details (NEW) |
| `getAdminOrgId(admin)` | view | Get org ID for admin (NEW) |

### Deprecated Functions

- `registerAsOrganization()` - Use `createOrganization()` instead
- `verifyOrganization()` - Legacy, kept for compatibility

---

## 2. RecordRegistry.sol

### Storage (Privacy-Safe: uses hashes)

```solidity
mapping(bytes32 => Record) private _records;
mapping(address => bytes32[]) private _ownerRecords;
mapping(bytes32 => bytes32[]) private _parentChildren;
mapping(address => bool) public authorizedSponsors;
```

### Record Struct

```solidity
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
```

### Key Functions

| Function | Who Can Call | Description |
|----------|--------------|-------------|
| `addRecord(cidHash, parent, type)` | Patient | Patient adds own record |
| `addRecordFor(...)` | Sponsor | Gasless record add |
| `addRecordByDoctor(...)` | Doctor/Contract | Doctor adds for patient |
| `updateRecordCID(old, new)` | Owner / Creator (24h) | Fix record CID |
| `transferOwnership(cidHash, newOwner)` | Owner | Transfer record |

---

## 3. ConsentLedger.sol

### Consent Struct

```solidity
struct Consent {
    address patient;
    address grantee;
    bytes32 rootCidHash;
    bytes32 encKeyHash;
    uint40 issuedAt;
    uint40 expireAt;
    bool active;
    bool includeUpdates;
    bool allowDelegate;
}
```

### Key Functions

| Function | Description |
|----------|-------------|
| `grantInternal(...)` | Grant consent (authorized contracts) |
| `grantBySig(...)` | EIP-712 signed consent |
| `revoke(grantee, cidHash)` | Revoke consent |
| `revokeFor(...)` | Gasless revoke (sponsor) |
| `grantDelegation(...)` | Grant full delegation |
| `delegateAuthorityBySig(...)` | EIP-712 signed delegation |
| `grantUsingDelegation(...)` | Use delegation to grant |
| `grantUsingRecordDelegation(...)` | Per-record delegation |
| `canAccess(patient, grantee, cidHash)` | Check access |

---

## 4. EHRSystemSecure.sol

### Request Types

```solidity
enum RequestType {
    DirectAccess,       // Access specific record
    RecordDelegation,   // Delegate permission for specific record
    FullDelegation      // Full patient delegation
}
```

### Flow: Two-Party Approval

```
Requester → requestAccess() → Pending
            ↓
Requester confirms → RequesterApproved
or Patient confirms → PatientApproved
            ↓
Other party confirms (after 15s delay)
            ↓
→ Completed → Consent/Delegation created
```

---

## 5. DoctorUpdate.sol

### Key Functions

| Function | Description |
|----------|-------------|
| `addRecordByDoctor(...)` | Doctor adds record + gets temp access |
| `grantEmergencyAccess(...)` | Emergency access with 2+ witnesses |

---

## Security Patterns

### CID Privacy

- All contracts use `bytes32 cidHash` not `string cid`
- Frontend computes `keccak256(bytes(cid))` before sending
- Plaintext CID never on-chain

### EIP-712 Signing

- ConsentLedger: `grantBySig`, `delegateAuthorityBySig`
- EHRSystemSecure: `confirmAccessRequestWithSignature`
- Prevents replay attacks via nonces

### Gas Sponsorship (Relayer Pattern)

- AccessControl: `registerPatientFor`, `registerDoctorFor`
- RecordRegistry: `addRecordFor` (authorizedSponsors)
- ConsentLedger: `revokeFor` (authorizedSponsors)
