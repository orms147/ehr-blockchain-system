-- Add columns and tables that were created via `db push` in earlier sessions
-- but never captured in a migration file. Generated via:
--   prisma migrate diff --from-schema-datasource --to-schema-datamodel --script
-- on 2026-04-08 after migrate reset exposed the gaps.

-- CreateEnum
CREATE TYPE "OrgApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- DropIndex (will be recreated below with better name + composite)
DROP INDEX "AccessRequest_requesterAddress_idx";

-- AlterTable AccessRequest
ALTER TABLE "AccessRequest" ADD COLUMN     "signature" TEXT,
ADD COLUMN     "signatureDeadline" BIGINT,
ADD COLUMN     "txHash" VARCHAR(66);

-- AlterTable EventSyncState (remove stale column defaults)
ALTER TABLE "EventSyncState" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable KeyShare
ALTER TABLE "KeyShare" ADD COLUMN     "allowDelegate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "senderPublicKey" TEXT;

-- AlterTable RecordMetadata
ALTER TABLE "RecordMetadata" ADD COLUMN     "description" TEXT,
ADD COLUMN     "parentCidHash" VARCHAR(66),
ADD COLUMN     "recordType" VARCHAR(50),
ADD COLUMN     "title" VARCHAR(255);

-- AlterTable User (profile + encryption key columns)
ALTER TABLE "User" ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "bloodType" VARCHAR(5),
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "encryptionPublicKey" TEXT,
ADD COLUMN     "expoPushToken" TEXT,
ADD COLUMN     "fullName" VARCHAR(100),
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "homeAddress" VARCHAR(255),
ADD COLUMN     "phone" VARCHAR(20);

-- CreateTable OrgApplication
CREATE TABLE "OrgApplication" (
    "id" TEXT NOT NULL,
    "applicantAddress" VARCHAR(42) NOT NULL,
    "orgName" TEXT NOT NULL,
    "description" TEXT,
    "contactEmail" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "orgType" TEXT NOT NULL DEFAULT 'hospital',
    "phone" TEXT,
    "address" TEXT,
    "licenseFilePath" TEXT,
    "status" "OrgApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" VARCHAR(42),
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "registerTxHash" VARCHAR(66),
    "verifyTxHash" VARCHAR(66),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable DoctorProfile
CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL,
    "walletAddress" VARCHAR(42) NOT NULL,
    "specialty" VARCHAR(100),
    "licenseNumber" VARCHAR(50),
    "hospitalName" VARCHAR(200),
    "yearsExperience" INTEGER,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable PendingUpdate
CREATE TABLE "PendingUpdate" (
    "id" TEXT NOT NULL,
    "doctorAddress" VARCHAR(42) NOT NULL,
    "patientAddress" VARCHAR(42) NOT NULL,
    "parentCidHash" VARCHAR(66) NOT NULL,
    "encryptedContent" TEXT NOT NULL,
    "contentHash" VARCHAR(66) NOT NULL,
    "recordType" VARCHAR(50),
    "title" VARCHAR(255),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedAt" TIMESTAMP(3),
    "cidHash" VARCHAR(66),
    "txHash" VARCHAR(66),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable DoctorCredential
CREATE TABLE "DoctorCredential" (
    "id" TEXT NOT NULL,
    "doctorAddress" VARCHAR(42) NOT NULL,
    "credentialHash" VARCHAR(66) NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "verifiedByOrgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgApplication_applicantAddress_idx" ON "OrgApplication"("applicantAddress");

-- CreateIndex
CREATE INDEX "OrgApplication_status_idx" ON "OrgApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_walletAddress_key" ON "DoctorProfile"("walletAddress");

-- CreateIndex
CREATE INDEX "PendingUpdate_patientAddress_status_idx" ON "PendingUpdate"("patientAddress", "status");

-- CreateIndex
CREATE INDEX "PendingUpdate_doctorAddress_status_idx" ON "PendingUpdate"("doctorAddress", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorCredential_doctorAddress_key" ON "DoctorCredential"("doctorAddress");

-- CreateIndex
CREATE INDEX "DoctorCredential_doctorAddress_idx" ON "DoctorCredential"("doctorAddress");

-- CreateIndex
CREATE INDEX "AccessRequest_requesterAddress_status_idx" ON "AccessRequest"("requesterAddress", "status");

-- CreateIndex
CREATE INDEX "AccessRequest_requestId_status_idx" ON "AccessRequest"("requestId", "status");

-- CreateIndex
CREATE INDEX "KeyShare_cidHash_status_idx" ON "KeyShare"("cidHash", "status");

-- CreateIndex
CREATE INDEX "RecordMetadata_parentCidHash_idx" ON "RecordMetadata"("parentCidHash");

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_walletAddress_fkey" FOREIGN KEY ("walletAddress") REFERENCES "User"("walletAddress") ON DELETE RESTRICT ON UPDATE CASCADE;
