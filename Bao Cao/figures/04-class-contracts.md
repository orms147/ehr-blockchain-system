# Sơ đồ 4 — Class Diagram (5 Smart Contracts)

> Embed Chương 4 mục 4.2. Mô tả contract + state + function + interactions.

## Class 1 — AccessControl
**State**:
- `mapping(address => uint256) roles` (bitwise: 1=Patient, 2=Doctor, 4=Org, 8=Ministry, +16=VerifiedDoctor, +32=VerifiedOrg)
- `mapping(uint256 => Organization) organizations`
- `mapping(uint256 => mapping(address => bool)) orgMembers`
- `address public ministry`

**Functions chính**:
- `registerAsPatient()` external
- `registerAsDoctor()` external
- `createOrganization(string name, address primary, address backup)` external onlyMinistry
- `verifyDoctor(address doctor, string credential)` external onlyOrgAdmin
- `revokeDoctorVerification(address doctor)` external
- `verifyDoctorByMinistry(address doctor, string credential)` external onlyMinistry
- `setOrgActive(uint256 orgId, bool active)` external onlyMinistry
- `revokeOrgVerification(uint256 orgId)` external onlyMinistry
- `addMember(uint256 orgId, address doctor)` external onlyOrgAdmin
- `removeMember(uint256 orgId, address doctor)` external onlyOrgAdmin
- `isPatient/isDoctor/isVerifiedDoctor/isOrg/isVerifiedOrg/isMinistry` view

## Class 2 — RecordRegistry
**State**:
- `mapping(bytes32 cidHash => Record) records`
- `mapping(address => bytes32[]) patientRecords`
- `address public consentLedger`
- `mapping(address => bool) authorizedContracts`

**Functions chính**:
- `addRecord(bytes32 cidHash, bytes32 parentCidHash, bytes32 recordType)` external onlyPatient
- `addRecordByDoctor(...)` external onlyAuthorizedContract (called by DoctorUpdate)
- `getRecord(bytes32 cidHash)` view returns Record
- `getPatientRecords(address patient)` view returns bytes32[]

## Class 3 — ConsentLedger ⭐ trái tim hệ thống
**State**:
- `mapping(bytes32 consentKey => Consent) _consents` — key = keccak256(patient, grantee, rootCidHash)
- `mapping(address patient => mapping(address grantee => uint256 data)) _delegations`
- `mapping(bytes32 consentKey => address) recordDelegationSource` ⭐
- `mapping(bytes32 consentKey => address) consentDelegationSource`
- `mapping(address patient => mapping(address contact => bool)) isTrustedContact` ⭐
- `mapping(address patient => mapping(address contact => string)) trustedContactLabel`
- `mapping(address patient => uint256) delegationEpoch`
- `mapping(address => uint256) nonces` (EIP-712)
- `uint256 constant MAX_DELEGATION_WALK = 8`

**Functions chính**:
- `grantInternal(address patient, address grantee, ...)` external (proxy by patient direct)
- `grantBySig(address patient, ..., bytes signature)` external (relayer entry — EIP-712)
- `revoke(address grantee, bytes32 inputCidHash)` external (sponsored)
- `revokeBySig(...)` external
- `grantUsingRecordDelegation(address patient, address newGrantee, ...)` external onlyDoctor
- `grantUsingDelegation(address patient, address newGrantee, ...)` external onlyDoctor
- `grantDelegation(address grantee, ...)` external onlyPatient (bulk full delegation)
- `revokeDelegation(address grantee)` external onlyPatient (epoch bump)
- `setTrustedContact(address contact, string label, bool active)` external
- `setTrustedContactBySig(...)` external (EIP-712)
- `canAccess(address patient, address grantee, bytes32 queryCidHash)` view returns bool
- `_grantConsent(...)` internal ⭐ (Footgun #1 fix: clear recordDelegationSource)
- `_hasValidNormalConsent(...)` internal view (walk delegation chain)
- `getNonce(address user)` view

**Events**:
- `ConsentGranted(indexed patient, indexed grantee, indexed rootCidHash, uint40 expireAt, bool allowDelegate)`
- `ConsentRevoked(indexed patient, indexed grantee, indexed rootCidHash, uint40 timestamp)`
- `DelegationGranted(indexed patient, indexed grantee, uint40 expireAt, bool allowDelegate)`
- `DelegationRevoked(indexed patient, indexed grantee)`
- `AccessGrantedViaDelegation(indexed patient, indexed newGrantee, indexed byDelegatee, bytes32 rootCidHash)`
- `TrustedContactSet(indexed patient, indexed contact, string label)`
- `TrustedContactRevoked(indexed patient, indexed contact)`

## Class 4 — DoctorUpdate
**State**:
- References: AccessControl, RecordRegistry, ConsentLedger

**Functions chính**:
- `addRecordByDoctor(address patient, bytes32 cidHash, bytes32 parentCidHash, bytes32 recordType)` external onlyVerifiedDoctor
- (Cũ — đã drop 2026-05-04) `grantEmergencyAccess` REMOVED

## Class 5 — EHRSystemSecure
**State**:
- `mapping(bytes32 requestId => Request) _requests`
- `mapping(address => uint256) nonces` (EIP-712 separate)

**Functions chính**:
- `requestAccess(address patient, bytes32 cidHash, RequestType reqType, uint40 deadline)` external (doctor gas)
- `approveRequestBySig(bytes32 requestId, address patient, bytes signature)` external (sponsored — patient EIP-712)
- `rejectRequestBySig(bytes32 requestId, bytes signature)` external (sponsored — Wave K)
- `_completeRequest(bytes32 requestId, address patient, address doctor, ...)` internal
- 3 enum RequestType: `DirectAccess`, `RecordDelegation`, `FullDelegation`

**Events**:
- `AccessRequested(indexed requestId, indexed patient, indexed doctor, bytes32 cidHash, uint8 reqType, uint40 deadline)`
- `RequestCompleted(indexed requestId, indexed patient, indexed doctor, uint8 reqType)`
- `RequestRejected(indexed requestId, indexed patient, uint40 timestamp)`

## Relationships

- `AccessControl` ← `RecordRegistry` (uses for role check)
- `AccessControl` ← `ConsentLedger` (uses for role check)
- `AccessControl` ← `DoctorUpdate` (uses for role check)
- `AccessControl` ← `EHRSystemSecure` (uses for role check)
- `RecordRegistry` ← `DoctorUpdate` (authorized to write records on behalf of patient)
- `RecordRegistry` ← `ConsentLedger` (read parentCidHash for chain walk)
- `ConsentLedger` ← `EHRSystemSecure` (calls grantInternal via _completeRequest)

## PlantUML

Xem [04-class-contracts.puml](04-class-contracts.puml).

## Layout Astah

5 class boxes layout dạng pentagon. ConsentLedger ở trung tâm vì nó tương tác với 3 contract khác. EHRSystemSecure + DoctorUpdate là client facades, AccessControl + RecordRegistry là utility deps.
