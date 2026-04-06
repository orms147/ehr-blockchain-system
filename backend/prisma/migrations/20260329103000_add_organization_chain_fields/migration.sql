-- AlterTable
ALTER TABLE "Organization"
    ADD COLUMN "chainOrgId" BIGINT,
    ADD COLUMN "backupAdminAddress" VARCHAR(42),
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_chainOrgId_key" ON "Organization"("chainOrgId");
CREATE INDEX "Organization_isActive_idx" ON "Organization"("isActive");
