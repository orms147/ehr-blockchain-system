-- P0-B: Fix EventSyncState race condition
-- Creates the EventSyncState table if missing (initial schema was added via db push,
-- never captured in a CREATE TABLE migration), and ensures the id column defaults
-- to cuid()/uuid so concurrent sync workers cannot collide on a shared PK.

CREATE TABLE IF NOT EXISTS "EventSyncState" (
    "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "contractName"    TEXT NOT NULL,
    "lastSyncedBlock" BIGINT NOT NULL DEFAULT 0,
    "lastBlockHash"   VARCHAR(66),
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSyncState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventSyncState_contractName_key"
    ON "EventSyncState"("contractName");

-- If the table pre-existed with the old literal 'default' id default, realign it.
ALTER TABLE "EventSyncState" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
