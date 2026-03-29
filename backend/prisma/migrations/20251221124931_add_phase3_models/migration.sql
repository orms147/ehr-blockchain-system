-- CreateTable
CREATE TABLE "EmergencyAccess" (
    "id" TEXT NOT NULL,
    "doctorAddress" VARCHAR(42) NOT NULL,
    "patientAddress" VARCHAR(42) NOT NULL,
    "cidHash" VARCHAR(66),
    "reason" TEXT NOT NULL,
    "emergencyType" TEXT NOT NULL DEFAULT 'medical',
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedBy" VARCHAR(42),
    "revokedBy" VARCHAR(42),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegation" (
    "id" TEXT NOT NULL,
    "patientAddress" VARCHAR(42) NOT NULL,
    "delegateAddress" VARCHAR(42) NOT NULL,
    "delegationType" TEXT NOT NULL DEFAULT 'full',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "orgType" TEXT NOT NULL DEFAULT 'hospital',
    "licenseNumber" TEXT,
    "location" TEXT,
    "contactEmail" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" VARCHAR(42),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "memberAddress" VARCHAR(42) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'doctor',
    "status" TEXT NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmergencyAccess_patientAddress_idx" ON "EmergencyAccess"("patientAddress");

-- CreateIndex
CREATE INDEX "EmergencyAccess_doctorAddress_idx" ON "EmergencyAccess"("doctorAddress");

-- CreateIndex
CREATE INDEX "EmergencyAccess_status_idx" ON "EmergencyAccess"("status");

-- CreateIndex
CREATE INDEX "Delegation_patientAddress_idx" ON "Delegation"("patientAddress");

-- CreateIndex
CREATE INDEX "Delegation_delegateAddress_idx" ON "Delegation"("delegateAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Delegation_patientAddress_delegateAddress_key" ON "Delegation"("patientAddress", "delegateAddress");

-- CreateIndex
CREATE INDEX "Organization_orgType_idx" ON "Organization"("orgType");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_address_key" ON "Organization"("address");

-- CreateIndex
CREATE INDEX "OrganizationMember_orgId_idx" ON "OrganizationMember"("orgId");

-- CreateIndex
CREATE INDEX "OrganizationMember_memberAddress_idx" ON "OrganizationMember"("memberAddress");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_orgId_memberAddress_key" ON "OrganizationMember"("orgId", "memberAddress");
