# Organization Entity Architecture

> **Status**: Implementation in progress
> **Decision**: Pragmatic Organization Entity (Ministry-managed)

---

## 1. Design Principles

| Principle | Implementation |
|-----------|----------------|
| Org = Entity | `orgId` riêng biệt, không phụ thuộc wallet |
| Audit-friendly | History rõ ràng, không identity drift |
| Ministry-managed | Lifecycle do Ministry quản lý |
| Simple | 1 primary + 1 backup admin, không multisig |

---

## 2. Why NOT "Org = Wallet"?

### Problems with Minimal Approach

1. **Identity drift**: Khi chuyển org từ wallet A → B, lịch sử bị gãy
2. **Audit khó**: Phải reconstruct history từ events
3. **Thesis defense khó**: Hội đồng sẽ hỏi "Org là gì?"

### Benefits of Entity Approach

1. **Stable identity**: orgId không đổi dù admin đổi
2. **Clear audit trail**: Events có orgId, dễ trace
3. **Recovery dễ**: Ministry đổi admin, org vẫn tồn tại

---

## 3. Smart Contract Implementation

### New Storage

```solidity
uint256 public orgCount;
mapping(uint256 => Organization) public organizations;
mapping(address => uint256) public adminToOrgId;

struct Organization {
    uint256 id;
    string name;
    address primaryAdmin;
    address backupAdmin;
    uint40 createdAt;
    bool active;
}
```

### New Events

```solidity
event OrganizationCreated(uint256 indexed orgId, string name, address primaryAdmin, address backupAdmin);
event OrganizationAdminChanged(uint256 indexed orgId, address oldPrimary, address newPrimary, address oldBackup, address newBackup);
event OrganizationStatusChanged(uint256 indexed orgId, bool active);
event DeprecatedFunctionCalled(address indexed caller, string functionName);

// Updated DoctorVerified with orgId
event DoctorVerified(address indexed doctor, address indexed verifier, uint256 indexed orgId, string credential);
```

### New Functions

```solidity
/// @notice Create organization (Ministry only)
function createOrganization(
    string calldata name,
    address primaryAdmin,
    address backupAdmin
) external onlyMinistry returns (uint256 orgId);

/// @notice Change org admins (for recovery/rotation)
function setOrgAdmins(
    uint256 orgId,
    address newPrimary,
    address newBackup
) external onlyMinistry;

/// @notice Activate/deactivate organization
function setOrgActive(uint256 orgId, bool active) external onlyMinistry;

/// @notice Check if user is active org admin
function isActiveOrgAdmin(address user) public view returns (bool);

/// @notice Get organization by ID
function getOrganization(uint256 orgId) external view returns (Organization memory);

/// @notice Get org ID for admin wallet
function getAdminOrgId(address admin) external view returns (uint256);
```

### Updated verifyDoctor

```solidity
function verifyDoctor(address doctor, string calldata credential) external override {
    uint256 orgId = adminToOrgId[msg.sender];
    if (orgId == 0 || !organizations[orgId].active) revert NotAuthorized();
    _verifyDoctor(doctor, credential, orgId);
}

function _verifyDoctor(address doctor, string memory credential, uint256 orgId) internal {
    // ... verification logic ...
    emit DoctorVerified(doctor, msg.sender, orgId, credential);
}
```

---

## 4. Logic Fixes Applied

### Fix 1: Emit Order

```solidity
// Store old values BEFORE overwrite
address oldPrimary = org.primaryAdmin;
address oldBackup = org.backupAdmin;

// Clear and set new...

// Emit with correct old values
emit OrganizationAdminChanged(orgId, oldPrimary, newPrimary, oldBackup, newBackup);
```

### Fix 2: Allow Swap in Same Org

```solidity
// Check new admins don't belong to OTHER orgs (allow swap in same org)
if (adminToOrgId[newPrimary] != 0 && adminToOrgId[newPrimary] != orgId) {
    revert AlreadyRegistered();
}
```

### Fix 3: Prevent Identical Admins

```solidity
if (newPrimary == newBackup) revert InvalidAddress();
```

---

## 5. Flow Diagrams

### Create Organization

```
Ministry → createOrganization("Bạch Mai", 0xViện, 0xPhó)
    ↓
orgId = 1
organizations[1] = { id:1, name:"Bạch Mai", primary:0xViện, backup:0xPhó, active:true }
adminToOrgId[0xViện] = 1
adminToOrgId[0xPhó] = 1
_roles[0xViện] |= ORGANIZATION | VERIFIED_ORG
    ↓
Viện trưởng login → isActiveOrgAdmin() = true → /dashboard/org ✅
```

### Recovery (Lost wallet)

```
Viện trưởng mất ví 0xOld
    ↓
Liên hệ Ministry (offline verification)
    ↓
Ministry → setOrgAdmins(1, 0xNew, 0xPhó)
    ↓
Event: OrganizationAdminChanged(1, 0xOld, 0xNew, 0xPhó, 0xPhó)
    ↓
0xNew login → /dashboard/org ✅
0xOld login → /register (no longer admin)
    ↓
Audit log: Clear chain of custody ✅
```

---

## 6. Thesis Defense Points

### Q: "Organization của em là gì?"

> "Organization là on-chain entity với orgId riêng biệt. Admin có thể thay đổi nhưng Org identity không thay đổi. Đây giống như bệnh viện thực tế - viện trưởng đổi nhưng bệnh viện vẫn tồn tại."

### Q: "Ministry có quyền quá lớn?"

> "Ministry đóng vai trò regulatory như Bộ Y tế thực tế. Mọi action on-chain, transparent, auditable. Không có hidden power. Đây là regulatory compliance, không phải central authority trap."

### Q: "Nếu mất ví thì sao?"

> "Ministry có thể setOrgAdmins để recovery. orgId không đổi, lịch sử không bị gãy. Event log cho thấy rõ ai là admin tại mọi thời điểm."

---

## 7. Files Modified

| File | Changes |
|------|---------|
| `IAccessControl.sol` | +Organization struct, +4 events, +6 functions |
| `AccessControl.sol` | +storage, +createOrganization, +setOrgAdmins, +setOrgActive, +view functions, updated verifyDoctor |

---

## 8. Next Steps

1. **Compile contracts** - Verify no errors
2. **Write tests** - Test all new functions
3. **Backend** - Update auth service for org admin
4. **Frontend** - Ministry dashboard org management
5. **Frontend** - Session sync for org redirect
