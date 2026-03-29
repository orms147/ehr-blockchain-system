-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "requestId" VARCHAR(66) NOT NULL,
    "requesterAddress" VARCHAR(42) NOT NULL,
    "patientAddress" VARCHAR(42) NOT NULL,
    "cidHash" VARCHAR(66) NOT NULL,
    "requestType" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "patientAddress" VARCHAR(42) NOT NULL,
    "granteeAddress" VARCHAR(42) NOT NULL,
    "cidHash" VARCHAR(66) NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessRequest_requestId_key" ON "AccessRequest"("requestId");

-- CreateIndex
CREATE INDEX "AccessRequest_patientAddress_status_idx" ON "AccessRequest"("patientAddress", "status");

-- CreateIndex
CREATE INDEX "AccessRequest_requesterAddress_idx" ON "AccessRequest"("requesterAddress");

-- CreateIndex
CREATE INDEX "Consent_patientAddress_idx" ON "Consent"("patientAddress");

-- CreateIndex
CREATE INDEX "Consent_granteeAddress_idx" ON "Consent"("granteeAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Consent_patientAddress_granteeAddress_cidHash_key" ON "Consent"("patientAddress", "granteeAddress", "cidHash");
