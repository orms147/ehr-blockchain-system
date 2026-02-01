# Frontend Architecture & State

> **Last Updated**: 2026-01-21

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: Shadcn UI + Tailwind CSS
- **Auth**: Web3Auth
- **State**: React hooks + localStorage
- **Blockchain**: Viem + EIP-712 signing

---

## Key Files Structure

```
frontend/src/
├── app/
│   ├── login/page.tsx           # Login with Web3Auth
│   ├── register/page.tsx        # Role registration
│   └── dashboard/
│       ├── admin/page.tsx       # Redirects to ministry
│       ├── ministry/page.tsx    # Ministry dashboard
│       ├── org/page.tsx         # Org dashboard
│       ├── doctor/page.tsx      # Doctor dashboard
│       ├── patient/page.tsx     # Patient dashboard
│       └── profile/page.jsx     # User profile
├── components/
│   ├── layout/
│   │   └── DashboardLayout.jsx  # Main dashboard layout
│   ├── role/
│   │   └── RoleSwitcher.jsx     # Multi-role switching
│   └── org/
│       └── AdminOrgApplications.jsx  # Org applications management
├── hooks/
│   ├── useSessionSync.js        # Session restore + role resolution
│   ├── useAuthRoles.js          # Auth role utilities
│   └── useWalletAddress.js      # Wallet address hook
└── services/
    └── authService.js           # Auth API service
```

---

## Role System

### Role Configuration (RoleSwitcher.jsx)

```javascript
const ROLE_CONFIG = {
    patient: {
        label: 'Bệnh nhân',
        dashboard: '/dashboard/patient'
    },
    doctor: {
        label: 'Bác sĩ',
        dashboard: '/dashboard/doctor'
    },
    org: {
        label: 'Tổ chức',
        dashboard: '/dashboard/org'
    },
    ministry: {
        label: 'Bộ Y tế',
        dashboard: '/dashboard/ministry'
    },
    admin: {
        label: 'Quản trị',
        dashboard: '/dashboard/ministry'  // Redirects to ministry
    }
};
```

### Session Sync (useSessionSync.js)

```javascript
// Role resolution priority
if (isMinistry) {
    primaryRole = 'ministry';
    redirectPath = '/dashboard/ministry';
} else if (isVerifiedOrg || isOrg) {
    primaryRole = 'org';
    redirectPath = '/dashboard/org';
} else if (isVerifiedDoctor || isDoctor) {
    primaryRole = 'doctor';
    redirectPath = '/dashboard/doctor';
} else if (isPatient) {
    primaryRole = 'patient';
    redirectPath = '/dashboard/patient';
}
```

---

## Dashboard Consolidation

### Admin → Ministry

The `/dashboard/admin` route has been consolidated to `/dashboard/ministry`:

1. `admin/page.tsx` redirects to `/dashboard/ministry`
2. `RoleSwitcher.jsx` uses `/dashboard/ministry` for both ministry and admin roles
3. `useSessionSync.js` redirects ministry role to `/dashboard/ministry`

### Ministry Dashboard Tabs

```
/dashboard/ministry
├── Tab: Tổ chức (Organizations list - mock)
├── Tab: Chờ duyệt (AdminOrgApplications - REAL DATA)
├── Tab: Relayers (Relayer management - mock)
└── Tab: Hệ thống (System settings - mock)
```

---

## Pending Frontend Changes

### For Organization Entity

1. **Session Sync Update**
   - Add check for `isActiveOrgAdmin` from backend
   - Redirect org admins to `/dashboard/org`

2. **Ministry Dashboard**
   - Add "Quản lý Tổ chức" tab
   - Create org form: name, primary admin, backup admin
   - List organizations with status
   - Actions: Change admins, Activate/Deactivate

3. **Org Dashboard Update**
   - Show org info (name, ID, admin status)
   - Doctor verification interface
   - Member management

---

## localStorage Keys

```javascript
// Auth
'jwt_token'           // JWT from backend
'authRoles'           // Array of user roles
'activeRole'          // Currently selected role
'walletAddress'       // User's wallet address

// Web3Auth
'web3auth_store'      // Web3Auth session data
```

---

## API Endpoints Used

### Auth
- `POST /api/auth/login` - Login with wallet signature
- `GET /api/auth/me` - Get current user info + roles

### Org Applications
- `GET /api/admin/org-applications` - List org applications
- `POST /api/admin/approve-org/:id` - Approve org
- `POST /api/admin/reject-org/:id` - Reject org

### Pending (for Organization Entity)
- `POST /api/ministry/orgs` - Create organization
- `PUT /api/ministry/orgs/:id/admins` - Change org admins
- `PUT /api/ministry/orgs/:id/status` - Activate/deactivate org
