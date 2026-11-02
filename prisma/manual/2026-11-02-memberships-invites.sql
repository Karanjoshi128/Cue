-- Team invites + multiple workspaces per person (2 Nov 2026).
--
-- Additive only: two new tables and a backfill. Nothing existing is altered or
-- dropped, so the code that's live now keeps working before and after this.
-- Safe to run more than once. Run it BEFORE deploying the code that reads
-- these tables, and once more right after (to catch anyone who signed up in
-- between).

BEGIN;

CREATE TABLE IF NOT EXISTS "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MANAGER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Invite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MANAGER',
    "tokenHash" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Membership_workspaceId_idx" ON "Membership"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Membership_userId_workspaceId_key" ON "Membership"("userId", "workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "Invite_tokenHash_key" ON "Invite"("tokenHash");
CREATE INDEX IF NOT EXISTS "Invite_email_idx" ON "Invite"("email");
CREATE INDEX IF NOT EXISTS "Invite_workspaceId_idx" ON "Invite"("workspaceId");

DO $$ BEGIN
  ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Invite" ADD CONSTRAINT "Invite_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Invite" ADD CONSTRAINT "Invite_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Every existing person keeps access: a membership in the workspace they're in
-- today, with the role they have today.
INSERT INTO "Membership" ("id", "userId", "workspaceId", "role", "createdAt")
SELECT 'mb_' || u."id", u."id", u."workspaceId", u."role", u."createdAt"
FROM "User" u
ON CONFLICT ("userId", "workspaceId") DO NOTHING;

COMMIT;
