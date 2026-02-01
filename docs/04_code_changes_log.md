# Code Changes Log - Session 2026-01-21

> **Purpose**: Track all code changes made during this session

---

## Smart Contracts

### 1. IAccessControl.sol (Interface)

**Path**: `contracts/src/interfaces/IAccessControl.sol`

**Changes**:
- Added `Organization` struct
- Added events: `OrganizationCreated`, `OrganizationAdminChanged`, `OrganizationStatusChanged`, `DeprecatedFunctionCalled`
- Updated `DoctorVerified` event to include `orgId`
- Added function signatures: `createOrganization`, `setOrgAdmins`, `setOrgActive`
- Added view functions: `isActiveOrgAdmin`, `getOrganization`, `getAdminOrgId`

### 2. AccessControl.sol

**Path**: `contracts/src/AccessControl.sol`

**Changes**:

#### New Storage (after line 47)
```solidity
uint256 public orgCount;
mapping(uint256 => Organization) public organizations;
mapping(address => uint256) public adminToOrgId;

// NEW: orgId-based member management
mapping(uint256 => address[]) public orgMembersByOrgId;
mapping(uint256 => mapping(address => bool)) public isMemberOfOrgById;
```

#### Constructor Fix
```solidity
// BEFORE: _roles[ministryAddress] = MINISTRY | ORGANIZATION | VERIFIED_ORG;
// AFTER:  _roles[ministryAddress] = MINISTRY;
// Ministry is regulator, NOT a hospital
```

#### New Functions Added
- `createOrganization(name, primaryAdmin, backupAdmin)` - Ministry creates org
- `setOrgAdmins(orgId, newPrimary, newBackup)` - Ministry changes/recovers admins
- `setOrgActive(orgId, active)` - Ministry activates/deactivates org
- `_clearAdmin(admin)` - Internal helper to clear admin mappings
- `isActiveOrgAdmin(user)` - Check if user is active org admin
- `getOrganization(orgId)` - Get org details
- `getAdminOrgId(admin)` - Get org ID for admin wallet
- `addOrgMember(orgId, doctor)` - NEW: Org admin adds member by orgId
- `removeOrgMember(orgId, doctor)` - NEW: Org admin removes member by orgId
- `getOrgMembersByOrgId(orgId)` - NEW: Get members by orgId
- `isDoctorMemberOfOrg(orgId, doctor)` - NEW: Check membership by orgId

#### Deprecated Functions
- `registerAsOrganization()` - Use `createOrganization()` instead
- `verifyOrganization()` - Legacy, kept for compatibility
- `addMember(address, address)` - Use `addOrgMember(orgId, doctor)`
- `removeMember(address, address)` - Use `removeOrgMember(orgId, doctor)`

---

## Frontend

### 1. useSessionSync.js

**Path**: `frontend/src/hooks/useSessionSync.js`

**Changes**:
- Updated ministry redirect: `/dashboard/admin` → `/dashboard/ministry`

### 2. RoleSwitcher.jsx

**Path**: `frontend/src/components/role/RoleSwitcher.jsx`

**Changes**:
- Updated ministry dashboard path: `/dashboard/admin` → `/dashboard/ministry`
- Updated admin dashboard path: `/dashboard/admin` → `/dashboard/ministry`

### 3. /dashboard/admin/page.tsx

**Path**: `frontend/src/app/dashboard/admin/page.tsx`

**Changes**:
- Now redirects to `/dashboard/ministry`

### 4. /dashboard/ministry/page.tsx

**Path**: `frontend/src/app/dashboard/ministry/page.tsx`

**Changes**:
- Added import for `AdminOrgApplications` component
- Replaced mock pending tab with real `AdminOrgApplications` component

### 5. AdminOrgApplications.jsx

**Path**: `frontend/src/components/org/AdminOrgApplications.jsx`

**Changes**:
- Fixed import path for `useToast` hook

---

## Pending Changes (Not Yet Applied)

### Backend

- [ ] Update `authService` to include org admin status in `/auth/me`
- [ ] Add Ministry org management endpoints

### Frontend

- [ ] Update session sync to detect org admin and redirect
- [ ] Add Ministry dashboard org management UI
- [ ] Update Org dashboard for new entity model

### Smart Contracts

- [ ] Compile and verify no errors
- [ ] Write unit tests for new functions
