-- B2: Backfill anchorCidHash for legacy Consent rows
--
-- Migration 20260416_consent_anchor_cid_hash only added the column. Rows
-- that existed before the root-walk refactor (or that were synced from
-- legacy contract events lacking the anchorCidHash field) have NULL here.
-- Mobile + backend read this field for `includeUpdates=false` enforcement,
-- so NULL values silently break access checks.
--
-- Idempotent: treat cidHash as the anchor where missing (matches the
-- contract's default when a consent was minted without an explicit anchor).
UPDATE "Consent"
SET "anchorCidHash" = "cidHash"
WHERE "anchorCidHash" IS NULL;
