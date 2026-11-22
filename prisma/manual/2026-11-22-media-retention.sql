-- Video retention (docs/media-retention.md): three nullable columns and an
-- index on MediaAsset. Additive only: code without them ignores the columns.
-- Applied to production on 22 Nov 2026, before the code was merged.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "MediaAsset"
  ADD COLUMN IF NOT EXISTS "removalError" TEXT,
  ADD COLUMN IF NOT EXISTS "removalTriedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "MediaAsset_storageKey_idx" ON "MediaAsset"("storageKey");

COMMIT;
