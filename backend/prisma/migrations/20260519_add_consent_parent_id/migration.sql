-- Phase G.1.a — add parentConsentId to Consent for "Gia hạn" extension flow +
-- "Bạn trực tiếp ký" vs "Qua uỷ quyền" signing badge derivation
-- (per Backend Reconciliation §matrix decision 6, recon-doc.jsx 2026-05-19).

ALTER TABLE "Consent" ADD COLUMN "parentConsentId" VARCHAR(36);

CREATE INDEX "Consent_parentConsentId_idx" ON "Consent"("parentConsentId");
