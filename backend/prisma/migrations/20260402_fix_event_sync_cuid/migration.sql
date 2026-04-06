-- P0-B: Fix EventSyncState race condition
-- Change id default from 'default' (shared) to cuid() (unique per row).
-- This prevents PK collision when multiple sync workers initialize concurrently.

-- Note: If existing rows have id='default', this migration will keep them.
-- The @default(cuid()) only applies to NEW rows created after this migration.
-- Existing data is safe — no rows need to be altered.

-- The actual fix is schema-level: @default(cuid()) instead of @default("default").
-- Database-level, this changes the DEFAULT constraint on the id column.

ALTER TABLE "EventSyncState" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
