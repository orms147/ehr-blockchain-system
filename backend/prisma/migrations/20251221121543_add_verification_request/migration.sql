-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "doctorAddress" VARCHAR(42) NOT NULL,
    "fullName" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "specialty" TEXT,
    "organization" TEXT,
    "documentCid" TEXT,
    "documentType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" VARCHAR(42),
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationRequest_doctorAddress_idx" ON "VerificationRequest"("doctorAddress");

-- CreateIndex
CREATE INDEX "VerificationRequest_status_idx" ON "VerificationRequest"("status");
