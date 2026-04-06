// Canonical contract enum mapping — MUST match IEHRSystem enums exactly.
// Source of truth: contracts/src/interfaces/IEHRSystemSecure.sol

// ============ REQUEST TYPE ============
// enum RequestType { DirectAccess, FullDelegation, RecordDelegation }

export const RequestType = Object.freeze({
    DirectAccess: 0,
    FullDelegation: 1,
    RecordDelegation: 2,
});

export const REQUEST_TYPE_NAMES = Object.freeze({
    [RequestType.DirectAccess]: 'DirectAccess',
    [RequestType.FullDelegation]: 'FullDelegation',
    [RequestType.RecordDelegation]: 'RecordDelegation',
});

// ============ REQUEST STATUS (On-Chain) ============
// enum RequestStatus { Pending, RequesterApproved, PatientApproved, Completed, Rejected }

export const OnChainRequestStatus = Object.freeze({
    Pending: 0,
    RequesterApproved: 1,
    PatientApproved: 2,
    Completed: 3,
    Rejected: 4,
});

export const ONCHAIN_STATUS_NAMES = Object.freeze({
    [OnChainRequestStatus.Pending]: 'Pending',
    [OnChainRequestStatus.RequesterApproved]: 'RequesterApproved',
    [OnChainRequestStatus.PatientApproved]: 'PatientApproved',
    [OnChainRequestStatus.Completed]: 'Completed',
    [OnChainRequestStatus.Rejected]: 'Rejected',
});

// ============ MAPPING: On-Chain Status → Backend DB Status ============
// Backend DB uses string statuses (not tied to contract enum values).
// This provides backward-compatible mapping so existing mobile/web code
// that checks for 'pending', 'signed', 'claimed', 'rejected' still works.

export const CHAIN_STATUS_TO_DB = Object.freeze({
    [OnChainRequestStatus.Pending]: 'pending',
    [OnChainRequestStatus.RequesterApproved]: 'pending',          // First approval only, not yet actionable
    [OnChainRequestStatus.PatientApproved]: 'signed',             // Patient signed → Doctor can claim
    [OnChainRequestStatus.Completed]: 'claimed',                  // Both approved → access granted
    [OnChainRequestStatus.Rejected]: 'rejected',
});
