# Sơ đồ 5 — ER Diagram (Prisma Schema)

> Embed Chương 4 mục 4.3. Mô tả off-chain database schema.
> Source: `backend/prisma/schema.prisma`

## Entities

### User
- `walletAddress` PK
- `fullName` String?
- `dateOfBirth` DateTime?
- `gender` Enum(MALE/FEMALE/OTHER)?
- `phone` String?
- `email` String?
- `homeAddress` String?
- `avatarUrl` String?
- `bloodType` String?
- `allergies` String?
- `insuranceNumber` String? (BHYT — TT 32/2023)
- `nationalIdHash` String? (CCCD hash — emergency lookup)
- `role` Enum(PATIENT/DOCTOR/ORG/MINISTRY)
- `signaturesThisMonth` Int (sponsor quota cap 100)
- `createdAt/updatedAt` DateTime

### DoctorProfile (1:1 with User if role=DOCTOR)
- `walletAddress` FK → User
- `specialty` String?
- `licenseNumber` String?
- `hospitalName` String?
- `yearsExperience` Int?
- `bio` String?
- `verificationStatus` Enum(PENDING/VERIFIED/REVOKED)

### Organization
- `orgId` PK Int
- `name` String
- `primaryAdmin` String (wallet)
- `backupAdmin` String (wallet)
- `active` Boolean
- `verified` Boolean

### OrganizationMember (M:N User ↔ Organization)
- `orgId` FK
- `walletAddress` FK → User
- `addedAt` DateTime

### RecordMetadata
- `cidHash` PK (bytes32 keccak256 of CID)
- `ownerAddress` FK → User
- `createdBy` FK → User (doctor nếu addRecordByDoctor, else patient)
- `parentCidHash` FK self-referential
- `recordType` String (general/rx/vacc/lab/imaging)
- `title` String?
- `description` String?
- `versionNote` String?
- `createdAt` DateTime
- `status` Enum(active/revoked)

### KeyShare (blind mailbox table — central)
- `id` PK
- `cidHash` FK → RecordMetadata
- `senderAddress` FK → User (encrypter)
- `recipientAddress` FK → User
- `senderPublicKey` String (NaCl pubkey)
- `encryptedPayload` String (NaCl box: AES key + plaintext CID)
- `status` Enum(awaiting_claim/claimed/revoked/rejected)
- `source` Enum(grant/delegation/cascade/save-only-doctor/trusted-contact)
- `expiresAt` DateTime?
- `createdAt/updatedAt`

### Consent (cache — DO NOT use for permission check)
- `id` PK
- `patientAddress` FK → User
- `granteeAddress` FK → User
- `cidHash` (= rootCidHash)
- `expiresAt` DateTime
- `allowDelegate` Boolean
- `status` Enum(active/revoked)
- `lastEventTimestamp` DateTime

### TrustedContact
- `id` PK
- `patientAddress` FK → User
- `contactAddress` FK → User
- `label` String (e.g. "Mẹ", "Con trai")
- `status` Enum(active/revoked)
- `setAt` DateTime

### AccessRequest
- `id` PK
- `onChainRequestId` String (bytes32)
- `patientAddress` FK → User
- `doctorAddress` FK → User
- `cidHash` (target record)
- `requestType` Enum(DirectAccess/RecordDelegation/FullDelegation)
- `reason` String?
- `deadline` DateTime
- `status` Enum(pending/approved/rejected/expired)
- `rejectionReason` String? (off-chain mirror after rejectRequest)

### DelegationAccessLog
- `id` PK
- `patientAddress` FK
- `newGrantee` FK (= B — bác sĩ nhận quyền)
- `byDelegatee` FK (= A — bác sĩ uỷ quyền)
- `rootCidHash`
- `createdAt`

### Notification
- `id` PK
- `userAddress` FK → User
- `type` Enum
- `payload` Json
- `readAt` DateTime?

## Relationships

- User 1:1 DoctorProfile (nếu role=DOCTOR)
- User 1:N RecordMetadata (ownerAddress)
- User 1:N RecordMetadata (createdBy)
- RecordMetadata 1:N RecordMetadata (parentCidHash — self chain)
- RecordMetadata 1:N KeyShare
- User 1:N KeyShare (sender + recipient)
- Organization 1:N OrganizationMember
- User 1:N OrganizationMember
- User 1:N TrustedContact (patientAddress)
- User 1:N TrustedContact (contactAddress)
- User 1:N AccessRequest (patient + doctor)
- User 1:N DelegationAccessLog
- User 1:N Notification

## PlantUML

Xem [05-er-prisma.puml](05-er-prisma.puml). PlantUML có syntax ER khá hạn chế — recommend vẽ tay trong Astah ER mode hoặc dbdiagram.io.
