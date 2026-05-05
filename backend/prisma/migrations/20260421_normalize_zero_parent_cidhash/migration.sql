-- 2026-04-21: normalize parentCidHash = 0x00..00 (ZERO_HASH) to NULL.
--
-- Root records stored as ZERO_HASH string broke:
-- - GET /api/records/chain/:cidHash version walk (counted 1 phantom parent)
-- - client-side parentCidHashes Set (filter(Boolean) kept the zero string)
-- - doctor dashboard "latest version" filter
--
-- Canonical shape going forward: parentCidHash IS NULL for roots.
-- save-only + create endpoints now collapse ZERO_HASH -> null on write.

UPDATE "RecordMetadata"
SET "parentCidHash" = NULL
WHERE "parentCidHash" = '0x0000000000000000000000000000000000000000000000000000000000000000';
