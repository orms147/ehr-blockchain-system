-- 2026-04-29: KeyShare writer pattern foundation (S15.1).
--
-- Adds updatedAt timestamp to KeyShare so the centralized keyShareWriter
-- service can enforce timestamp-based ordering between the 13 writers that
-- mutate this table (POST /api/key-share, handleConsentRevoked, mark-claimed,
-- save-only, approve-with-sig, etc.). Without this guard, a stale
-- ConsentRevoked event from the catchup queue could overwrite a fresh share
-- that just landed via /api/key-share — the race documented as S14 in the
-- planning doc.
--
-- Also adds KeyShareMutationLog for audit visibility: every state change
-- through the writer service appends a row, making future race debugging a
-- query instead of a grep through process logs.

-- 1. Add updatedAt to KeyShare. DEFAULT seeds existing rows on apply;
--    Prisma's @updatedAt auto-updates on every subsequent update.
ALTER TABLE "KeyShare"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 2. Audit log: one row per KeyShare state transition via writer service.
CREATE TABLE "KeyShareMutationLog" (
    "id" SERIAL PRIMARY KEY,
    "cidHash" VARCHAR(66) NOT NULL,
    "senderAddress" VARCHAR(42) NOT NULL,
    "recipientAddress" VARCHAR(42) NOT NULL,
    "oldStatus" VARCHAR(20),
    "newStatus" VARCHAR(20) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "sourceTimestamp" TIMESTAMP(3) NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "KeyShareMutationLog_cidHash_recipientAddress_idx"
    ON "KeyShareMutationLog" ("cidHash", "recipientAddress");
CREATE INDEX "KeyShareMutationLog_createdAt_idx"
    ON "KeyShareMutationLog" ("createdAt");
