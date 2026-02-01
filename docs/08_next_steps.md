# Next Steps - Action Items

> **Last Updated**: 2026-01-21
> **Status**: Organization Entity implementation in progress

---

## 🔴 IMMEDIATE (Current Session)

### 1. Compile Smart Contracts

```bash
# Navigate to contracts folder
cd contracts

# Using foundry (if available)
~/.foundry/bin/forge build

# Or using hardhat
npx hardhat compile
```

**Expected Issues**:
- May need to fix any remaining type mismatches
- Verify all overrides are correct

### 2. Fix Any Compile Errors

Check for:
- Event signature mismatches (DoctorVerified now has 4 params)
- Function override issues
- Type mismatches

---

## 🟡 SHORT TERM (This Week)

### 3. Write Tests for Organization Functions

```solidity
// Test cases needed
test_CreateOrganization_Success()
test_CreateOrganization_RevertIfNotMinistry()
test_CreateOrganization_RevertIfAdminExists()
test_SetOrgAdmins_Success()
test_SetOrgAdmins_AllowSwap()
test_SetOrgAdmins_BlockCrossOrg()
test_SetOrgActive_Deactivate()
test_SetOrgActive_Reactivate()
test_VerifyDoctor_WithOrgId()
```

### 4. Backend: Update Auth Service

```javascript
// In auth.routes.js GET /me
const isActiveOrgAdmin = await accessControl.isActiveOrgAdmin(address);
const orgId = await accessControl.getAdminOrgId(address);

return {
  ...existingData,
  isActiveOrgAdmin,
  orgId: orgId > 0 ? Number(orgId) : null
};
```

### 5. Frontend: Update Session Sync

```javascript
// In useSessionSync.js
if (me.isActiveOrgAdmin) {
    primaryRole = 'org';
    redirectPath = '/dashboard/org';
}
```

---

## 🟢 MEDIUM TERM (Next Week)

### 6. Ministry Dashboard: Org Management

Create new components:
- `CreateOrgForm.jsx` - Form to create organization
- `OrgList.jsx` - List all organizations
- `OrgAdminChange.jsx` - Dialog to change admins
- `OrgStatusToggle.jsx` - Activate/deactivate button

Add to Ministry dashboard as new tab.

### 7. Security Phase 2A: consentTxHash

```prisma
// Update schema
model KeyShare {
  consentTxHash String? @db.VarChar(66)
}
```

```javascript
// Update keyShare.routes.js
const { encryptedKey, cidHash, consentTxHash } = req.body;
```

### 8. Security Phase 2B: Signed Public Keys

```prisma
// Update schema
model User {
  publicKeySignature String? @db.Text
}
```

---

## 🔵 LONG TERM (Next 2 Weeks)

### 9. Complete ORG Dashboard

- OrgMemberList component
- OrgVerifyDoctor component
- Member management

### 10. Delegation Features

- delegation.routes.js completion
- DelegationGrant.jsx
- DelegationList.jsx
- DelegateeGrantAccess.jsx

### 11. Testing & Polish

- E2E testing
- Error handling
- Documentation

---

## Commands Reference

### Smart Contracts

```bash
# Compile
~/.foundry/bin/forge build

# Test
~/.foundry/bin/forge test

# Deploy to testnet
~/.foundry/bin/forge script script/DeployAccessControl.s.sol --rpc-url $RPC_URL --broadcast
```

### Backend

```bash
cd backend
npm run dev

# Prisma migrations
npx prisma migrate dev

# Generate client
npx prisma generate
```

### Frontend

```bash
cd frontend
npm run dev
```

---

## File Paths Quick Reference

### Smart Contracts
- Interface: `contracts/src/interfaces/IAccessControl.sol`
- Implementation: `contracts/src/AccessControl.sol`
- Tests: `contracts/test/AccessControlTest.t.sol`

### Backend
- Auth routes: `backend/src/routes/auth.routes.js`
- Web3 service: `backend/src/services/web3Service.js`
- Schema: `backend/prisma/schema.prisma`

### Frontend
- Session sync: `frontend/src/hooks/useSessionSync.js`
- Role switcher: `frontend/src/components/role/RoleSwitcher.jsx`
- Ministry dashboard: `frontend/src/app/dashboard/ministry/page.tsx`
