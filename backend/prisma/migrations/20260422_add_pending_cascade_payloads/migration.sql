-- 2026-04-22: stage cascade KeyShare payloads on AccessRequest so they're
-- applied at mark-claimed (when doctor confirms on-chain), not at
-- approve-with-sig (when patient signs). Without this, ancestor KeyShare
-- expiresAt/allowDelegate was being rewritten by the patient-side cascade
-- before on-chain consent was minted, causing the dashboard to show
-- expiry values that didn't match on-chain state if the doctor never
-- confirmed. See S11.D in planning doc.
--
-- Nullable — legacy rows don't have it. Populated by /approve-with-sig and
-- cleared by /mark-claimed after the cascade is applied.

ALTER TABLE "AccessRequest"
ADD COLUMN "pendingCascadePayloads" JSONB;
