-- Additive rollout. Apply BEFORE deploying this branch; never run against production during tests.
-- Existing rows retain their current behavior. JSON settings remain optional.
BEGIN;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "publishOptions" JSONB;
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'CONTENT';
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "altText" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "userTags" JSONB;
ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PostTarget" ADD COLUMN IF NOT EXISTS "enhancementError" TEXT;
ALTER TABLE "PostTarget" ADD COLUMN IF NOT EXISTS "enhancementAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PostTarget" ADD COLUMN IF NOT EXISTS "enhancementClaimedAt" TIMESTAMP(3);
ALTER TABLE "PostTarget" ADD COLUMN IF NOT EXISTS "enhancedAt" TIMESTAMP(3);
ALTER TABLE "AutomationRule" ADD COLUMN IF NOT EXISTS "settings" JSONB;
ALTER TABLE "AutomationRule" ADD COLUMN IF NOT EXISTS "nextPost" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AutomationRule" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3);
ALTER TABLE "AutomationRule" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3);
ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3);
ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "clickCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "collectedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "automationPaused" BOOLEAN NOT NULL DEFAULT false;
-- Give legacy multi-item posts a deterministic order once. Repeat runs leave new orders intact.
WITH legacy_posts AS (
  SELECT "postId" FROM "MediaAsset" GROUP BY "postId" HAVING count(*) > 1 AND max("sortOrder") = 0
), numbered AS (
  SELECT id, row_number() OVER (PARTITION BY "postId" ORDER BY "createdAt", id) - 1 AS position
  FROM "MediaAsset" WHERE "postId" IN (SELECT "postId" FROM legacy_posts)
)
UPDATE "MediaAsset" m SET "sortOrder" = n.position FROM numbered n WHERE m.id = n.id;
COMMIT;
