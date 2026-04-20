-- 2026-04-19: drop PendingUpdate table.
-- Doctor updates no longer require patient approval; they go direct on-chain
-- via RecordRegistry.addRecordByDoctor. See context/06_design_decisions.md §0a.

DROP TABLE IF EXISTS "PendingUpdate";
