# Critical Design Decisions

> **Purpose**: Document key architectural decisions for future reference

---

## 1. Organization = Entity, NOT Wallet

### Decision

Organization is a separate on-chain entity with its own `orgId`, not tied to a single wallet address.

### Why

| Problem with Org = Wallet | Solution with Org Entity |
|---------------------------|--------------------------|
| Lost wallet = lost org | Admin can be changed |
| Identity drift on transfer | orgId never changes |
| Hard to audit history | Clear event trail |
| Thesis defense issues | Easy to explain |

### Implementation

```solidity
struct Organization {
    uint256 id;
    string name;
    address primaryAdmin;
    address backupAdmin;
    bool active;
}
```

---

## 2. Ministry = Regulatory Authority

### Decision

Ministry has full control over Organization lifecycle (create, change admins, activate/deactivate).

### Why

- Reflects real-world healthcare regulation in Vietnam
- Bộ Y tế has authority to issue/revoke hospital licenses
- All actions are on-chain, transparent, auditable
- NOT "central authority trap" because:
  - No hidden powers
  - All actions logged
  - Anyone can verify

### Powers

```
Ministry CAN:
✅ Create organization
✅ Change org admins (recovery)
✅ Activate/deactivate org
✅ Verify doctors directly

Ministry CANNOT:
❌ Access patient records
❌ Override patient consent
❌ Grant access to records
```

---

## 3. CID Hash Pattern (Privacy)

### Decision

All smart contracts use `bytes32 cidHash` instead of `string cid`.

### Why

- Plaintext CID in calldata = privacy leak
- Anyone can decode calldata and access IPFS content
- Hash pattern: CID only exists in frontend/IPFS

### Implementation

```solidity
// Frontend computes
bytes32 cidHash = keccak256(bytes(cid));

// Contract stores hash only
mapping(bytes32 => Record) private _records;
```

---

## 4. EIP-712 Signing for Gasless Operations

### Decision

Use EIP-712 typed data signing for patient consent operations.

### Why

- Patients often don't have ETH for gas
- Relayer pays gas, patient signs intent
- Signature proves patient consent
- Replay protection via nonces

### Implementation

```solidity
bytes32 private constant CONSENT_PERMIT_TYPEHASH = keccak256(
    "ConsentPermit(address patient,address grantee,bytes32 rootCidHash,...)"
);
```

---

## 5. Doctor Verification includes orgId

### Decision

`DoctorVerified` event includes `orgId` to create audit trail.

### Why

- Easy to query "all doctors verified by org X"
- Clear responsibility chain
- Thesis-friendly audit trail

### Implementation

```solidity
event DoctorVerified(
    address indexed doctor, 
    address indexed verifier, 
    uint256 indexed orgId, 
    string credential
);
```

---

## 6. Backup Admin (Optional)

### Decision

Organizations can have an optional backup admin.

### Why

- Single admin = single point of failure
- Backup can act if primary is unavailable
- But not required for small orgs

### Implementation

```solidity
address backupAdmin;  // Can be address(0)
```

---

## 7. Deprecated Functions Emit Events

### Decision

Deprecated functions emit `DeprecatedFunctionCalled` event before reverting.

### Why

- Helps track usage of old patterns
- Clear signal for frontend migration
- Audit trail for function evolution

### Implementation

```solidity
function registerAsOrganization() external override {
    emit DeprecatedFunctionCalled(msg.sender, "registerAsOrganization");
    revert NotAuthorized();
}
```

---

## 8. Admin Swap Allowed in Same Org

### Decision

`setOrgAdmins` allows assigning current org members to new roles (swap).

### Why

- Common operation: promote backup to primary
- Without this, would need to remove and re-add
- Still prevents cross-org conflicts

### Implementation

```solidity
// Only block if admin belongs to DIFFERENT org
if (adminToOrgId[newPrimary] != 0 && adminToOrgId[newPrimary] != orgId) {
    revert AlreadyRegistered();
}
```

---

## 9. Dashboard Route Consolidation

### Decision

Consolidated `/dashboard/admin` to `/dashboard/ministry`.

### Why

- "Admin" is technical term, "Ministry" is role name
- Reduces confusion
- Single source of truth for ministry users

### Implementation

- `admin/page.tsx` redirects to `/dashboard/ministry`
- All config points to `/dashboard/ministry`
