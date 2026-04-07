-- CHAIN topology delegation + unified gas sponsorship quota
--
-- 1. Delegation model is rewritten to mirror ConsentLedger's CHAIN topology:
--    adds parentDelegator, chainDepth, epoch, allowSubDelegate, expiresAt,
--    scopeNote, grant/revoke tx metadata. This table is a pure cache of
--    on-chain state — authorization still goes through ConsentLedger.canAccess().
--
-- 2. User quota is consolidated: uploadsThisMonth + revokesThisMonth merge
--    into a single signaturesThisMonth pool (100/month) that covers every
--    patient relayer action (upload, update, grant, revoke, delegate).
--
-- 3. New DelegationAccessLog mirrors the on-chain AccessGrantedViaDelegation
--    event for audit "who in the chain issued which access to whom".

-- DropIndex
DROP INDEX "Delegation_patientAddress_idx";

-- DropIndex
DROP INDEX "Delegation_delegateAddress_idx";

-- DropIndex
DROP INDEX "Delegation_patientAddress_delegateAddress_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "revokesThisMonth",
DROP COLUMN "uploadsThisMonth",
ADD COLUMN     "signaturesThisMonth" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Delegation" DROP COLUMN "createdAt",
DROP COLUMN "delegateAddress",
DROP COLUMN "delegationType",
ADD COLUMN     "allowSubDelegate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chainDepth" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "delegateeAddress" VARCHAR(42) NOT NULL,
ADD COLUMN     "epoch" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "grantBlockNumber" BIGINT,
ADD COLUMN     "grantTxHash" VARCHAR(66),
ADD COLUMN     "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "parentDelegator" VARCHAR(42),
ADD COLUMN     "revokedBy" VARCHAR(42),
ADD COLUMN     "revokedTxHash" VARCHAR(66),
ADD COLUMN     "scopeNote" TEXT;

-- CreateTable
CREATE TABLE "DelegationAccessLog" (
    "id" TEXT NOT NULL,
    "patientAddress" VARCHAR(42) NOT NULL,
    "newGrantee" VARCHAR(42) NOT NULL,
    "byDelegatee" VARCHAR(42) NOT NULL,
    "rootCidHash" VARCHAR(66) NOT NULL,
    "txHash" VARCHAR(66) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelegationAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DelegationAccessLog_patientAddress_idx" ON "DelegationAccessLog"("patientAddress");

-- CreateIndex
CREATE INDEX "DelegationAccessLog_byDelegatee_idx" ON "DelegationAccessLog"("byDelegatee");

-- CreateIndex
CREATE INDEX "DelegationAccessLog_newGrantee_idx" ON "DelegationAccessLog"("newGrantee");

-- CreateIndex
CREATE INDEX "DelegationAccessLog_rootCidHash_idx" ON "DelegationAccessLog"("rootCidHash");

-- CreateIndex
CREATE INDEX "Delegation_patientAddress_status_idx" ON "Delegation"("patientAddress", "status");

-- CreateIndex
CREATE INDEX "Delegation_delegateeAddress_status_idx" ON "Delegation"("delegateeAddress", "status");

-- CreateIndex
CREATE INDEX "Delegation_parentDelegator_idx" ON "Delegation"("parentDelegator");

-- CreateIndex
CREATE UNIQUE INDEX "Delegation_patientAddress_delegateeAddress_key" ON "Delegation"("patientAddress", "delegateeAddress");
