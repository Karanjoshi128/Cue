-- Plan tiers (docs/admin-panel.md, "Plans"). Customers are on Free, Pro or
-- Agency; Unlimited stays as an internal tier that only a platform admin
-- assigns.
--   1. New workspaces start on FREE. The code sets it too (SIGNUP_PLAN in
--      src/lib/plans.ts); this default covers anything that doesn't.
--   2. Every workspace that existed before tiers moves from UNLIMITED to PRO,
--      with one audit row each, the same row an admin's change writes.
--
-- Order: deploy the code FIRST, then run this straight after.
--   * Prisma Client sends its schema's default on insert, so code from
--     before this change writes UNLIMITED itself whatever the column default
--     says (tested 27 Nov 2026). Run this first and sign-ups made before the
--     deploy land on UNLIMITED, then a re-run would move them to PRO.
--   * The new code sets FREE on new workspaces and reads the old values fine,
--     so it is safe on a database this hasn't run on yet.
--
-- Re-runnable: a workspace whose plan was ever changed, by this script or by
-- an admin, has a "workspace.plan" audit row and is left alone. A workspace
-- an admin later puts on Unlimited stays there.
--
-- Production (Oracle VM):
--   sudo -u postgres psql -d cue -v ON_ERROR_STOP=1 -c 'set role cue_app' -f 2026-11-27-plan-tiers.sql
-- Check:
--   select plan, count(*) from "Workspace" group by 1;
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "Workspace" ALTER COLUMN "plan" SET DEFAULT 'FREE'::"Plan";

WITH moved AS (
  UPDATE "Workspace" w
  SET "plan" = 'PRO'::"Plan"
  WHERE w."plan" = 'UNLIMITED'::"Plan"
    AND NOT EXISTS (
      SELECT 1 FROM "AdminAuditLog" a
      WHERE a."action" = 'workspace.plan' AND a."targetId" = w."id"
    )
  RETURNING w."id"
)
INSERT INTO "AdminAuditLog"
  ("id", "actorEmail", "action", "targetType", "targetId", "workspaceId", "reason", "details", "createdAt")
SELECT
  'plantiers_' || md5(m."id"),
  'migration 2026-11-27-plan-tiers',
  'workspace.plan',
  'workspace',
  m."id",
  m."id",
  'Plan tiers launched: workspaces from before tiers move to Pro.',
  '{"from": "UNLIMITED", "to": "PRO"}'::jsonb,
  -- The column is a plain timestamp that Prisma fills with UTC.
  now() AT TIME ZONE 'utc'
FROM moved m;

COMMIT;
