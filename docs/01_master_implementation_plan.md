# EHR System - Master Implementation Plan

> **Last Updated**: 2026-01-21
> **Status**: Phase 2 Security + Organization Entity in progress

---

## Overview

| Phase | Feature | Effort | Priority | Status |
|-------|---------|--------|----------|--------|
| 1A | ORG Dashboard Core | ✅ | - | DONE |
| 1B | ORG Dashboard Extras | 2-3h | P2 | READY |
| 2 | Security Improvements | 3-4h | P1 | IN PROGRESS |
| 3 | Delegation Features | 4-6h | P2 | BLOCKED |
| 4 | Testing & Polish | 2-3h | P3 | PENDING |
| **NEW** | Organization Entity | 3-5h | P1 | IN PROGRESS |

---

## Phase 1A: ORG Dashboard Core ✅ DONE

- OrgApplication Prisma model
- admin.routes.js
- OrgDashboard component
- OrgApplicationForm component
- AdminOrgApplications component

---

## Phase 2: Security Improvements (RECOMMENDED NEXT)

### 2A: consentTxHash in KeyShare ⭐ Easy Win

```prisma
model KeyShare {
  // existing fields...
  consentTxHash String? @db.VarChar(66)
}
```

| File | Change |
|------|--------|
| schema.prisma | Add consentTxHash field |
| keyShare.routes.js | Accept txHash param |
| GrantAccessForm.jsx | Pass txHash after consent |

**Effort**: 1-2h

### 2B: Signed Public Keys

```prisma
model User {
  // existing fields...
  publicKeySignature String? @db.Text
}
```

| File | Change |
|------|--------|
| schema.prisma | Add field |
| auth.routes.js | Verify signature on save |
| generateKeys.js | Sign key with wallet |
| GrantAccess | Verify recipient key |

**Effort**: 2-3h

---

## Phase 1B: ORG Extras

### OrgMemberList Component

```javascript
// GET /api/org/:id/members → list
// POST /api/org/:id/add-member → add
// POST /api/org/:id/remove-member/:memberId → remove
```

### OrgVerifyDoctor Component

```javascript
// POST /api/org/verify-doctor → call verifyDoctor() on-chain
```

**Effort**: 2-3h

---

## Phase 3: Delegation Features

### Delegation Types

| Type | Source | Target | Scope |
|------|--------|--------|-------|
| DIRECT_ACCESS | Patient | Doctor | 1 record |
| FULL_DELEGATION | Patient | Family/ORG | All records |
| RECORD_DELEGATION | ORG | Doctor | 1 record |

### Backend Routes

```
POST /api/delegation/grant      → patient grants
POST /api/delegation/revoke     → patient revokes
GET  /api/delegation/my         → list my delegations
POST /api/delegation/use        → delegatee uses to grant
```

### On-chain Calls

```solidity
grantDelegation(delegatee, duration, allowSubDelegate)
revokeDelegation(delegatee)
grantUsingDelegation(patient, newGrantee, cidHash, ...)
```

**Effort**: 4-6h

---

## NEW: Organization Entity Architecture

### Design Decision

Đã chọn **Pragmatic Organization Entity** thay vì minimal (Org = wallet):

| Approach | Pros | Cons |
|----------|------|------|
| Org Entity (CHOSEN) | Audit-friendly, no identity drift, thesis-defensible | More complex |
| Minimal (Org = wallet) | Simple | Identity drift, hard to audit |

### Smart Contract Changes (IMPLEMENTED)

```solidity
struct Organization {
    uint256 id;
    string name;
    address primaryAdmin;
    address backupAdmin;
    uint40 createdAt;
    bool active;
}

// New functions
createOrganization(name, primaryAdmin, backupAdmin) → Ministry
setOrgAdmins(orgId, newPrimary, newBackup) → Ministry (recovery)
setOrgActive(orgId, active) → Ministry (deactivate/reactivate)

// View functions
isActiveOrgAdmin(user) → bool
getOrganization(orgId) → Organization
getAdminOrgId(admin) → uint256
```

### Files Modified

- `contracts/src/interfaces/IAccessControl.sol` - Added Organization struct, new events, new functions
- `contracts/src/AccessControl.sol` - Added storage, createOrganization, setOrgAdmins, setOrgActive, updated verifyDoctor with orgId

---

## Implementation Checklist

### Phase 2: Security (Priority 1)

- [ ] Prisma: add consentTxHash to KeyShare
- [ ] Prisma: add publicKeySignature to User
- [ ] Migration
- [ ] Backend: keyShare.routes.js accept txHash
- [ ] Backend: auth.routes.js verify signature
- [ ] Frontend: pass txHash on share
- [ ] Frontend: sign public key on generate
- [ ] Frontend: verify recipient key before encrypt

### Organization Entity (Priority 1) - IN PROGRESS

- [x] IAccessControl.sol - Organization struct, events, functions
- [x] AccessControl.sol - Storage (orgCount, organizations, adminToOrgId)
- [x] AccessControl.sol - createOrganization()
- [x] AccessControl.sol - setOrgAdmins()
- [x] AccessControl.sol - setOrgActive()
- [x] AccessControl.sol - isActiveOrgAdmin(), getOrganization(), getAdminOrgId()
- [x] AccessControl.sol - Updated verifyDoctor with orgId
- [x] AccessControl.sol - Deprecated registerAsOrganization()
- [ ] Compile and test
- [ ] Backend: Update auth service for org admin
- [ ] Frontend: Update session sync
- [ ] Frontend: Ministry dashboard org management

### Phase 1B: ORG Extras (Priority 2)

- [ ] OrgMemberList.jsx component
- [ ] OrgVerifyDoctor.jsx component
- [ ] Connect to OrgDashboard tabs
- [ ] Test add/remove member

### Phase 3: Delegation (Priority 2)

- [ ] delegation.routes.js
- [ ] DelegationGrant.jsx component
- [ ] DelegationList.jsx component
- [ ] DelegateeGrantAccess.jsx
- [ ] Test full flow

### Phase 4: Polish (Priority 3)

- [ ] End-to-end testing
- [ ] Real-time notifications
- [ ] Error handling polish
- [ ] Documentation

---

## Recommended Order

1. **Organization Entity: Compile & Test** [1h] ← CURRENT
2. Security: consentTxHash [1-2h]
3. Security: Signed Keys [2-3h]
4. ORG: MemberList [1-2h]
5. ORG: VerifyDoctor [1h]
6. Delegation: Grant/Revoke [2-3h]
7. Delegation: Use by Delegatee [2-3h]
8. Testing & Polish [2-3h]

**Total estimated**: ~15-18h

---

## Critical Invariants (All Phases)

1. **On-chain = Source of Truth**
2. consentTxHash links share to consent
3. Public key must be wallet-signed
4. Delegation scope enforced on-chain
5. All mutations via EIP-712 or relayer
6. **Organization = Entity, not wallet** (NEW)
