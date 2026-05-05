-- Drop EmergencyAccess (grantEmergencyAccess removed from contracts S18).
DROP TABLE IF EXISTS "EmergencyAccess";

-- Add opt-in CCCD/CMND hash for emergency lookup.
ALTER TABLE "User" ADD COLUMN "nationalIdHash" VARCHAR(66);
CREATE UNIQUE INDEX "User_nationalIdHash_key" ON "User"("nationalIdHash");

-- Trusted Contact mirror of on-chain ConsentLedger.isTrustedContact.
CREATE TABLE "TrustedContact" (
    "id" TEXT NOT NULL,
    "patientAddress" VARCHAR(42) NOT NULL,
    "contactAddress" VARCHAR(42) NOT NULL,
    "label" VARCHAR(120),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "setTxHash" VARCHAR(66),
    "setBlockNumber" BIGINT,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedTxHash" VARCHAR(66),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TrustedContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrustedContact_patientAddress_contactAddress_key" ON "TrustedContact"("patientAddress", "contactAddress");
CREATE INDEX "TrustedContact_patientAddress_status_idx" ON "TrustedContact"("patientAddress", "status");
CREATE INDEX "TrustedContact_contactAddress_status_idx" ON "TrustedContact"("contactAddress", "status");
