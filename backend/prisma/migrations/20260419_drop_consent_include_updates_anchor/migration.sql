-- 2026-04-19: drop anchorCidHash and includeUpdates after contract simplification
-- (medical episode model — consent always covers the whole chain)

ALTER TABLE "Consent" DROP COLUMN IF EXISTS "anchorCidHash";
ALTER TABLE "KeyShare" DROP COLUMN IF EXISTS "includeUpdates";
