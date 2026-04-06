ALTER TABLE "RecordMetadata"
ADD COLUMN "syncStatus" VARCHAR(20) NOT NULL DEFAULT 'confirmed',
ADD COLUMN "txHash" VARCHAR(66),
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "failedAt" TIMESTAMP(3),
ADD COLUMN "syncError" TEXT;

CREATE INDEX "RecordMetadata_syncStatus_idx" ON "RecordMetadata"("syncStatus");

UPDATE "RecordMetadata"
SET
  "submittedAt" = COALESCE("submittedAt", "createdAt"),
  "confirmedAt" = COALESCE("confirmedAt", "createdAt")
WHERE "syncStatus" = 'confirmed';
