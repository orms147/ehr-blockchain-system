-- Phase G.12 — add versionNote to RecordMetadata
-- Per viehp-doctor-forms-spec.html Q3: doctor's freeform note when creating an
-- update version (textarea at the bottom of the update form, max 500 chars).
-- Off-chain only — on-chain RecordRegistry stores only cidHash (NEVER plaintext).

ALTER TABLE "RecordMetadata" ADD COLUMN "versionNote" VARCHAR(500);
