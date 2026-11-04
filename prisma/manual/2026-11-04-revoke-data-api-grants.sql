-- Take table rights away from Supabase's public API roles (4 Nov 2026).
--
-- Cue reads and writes Postgres only through Prisma, connected as the table
-- owner (postgres). Supabase also serves the public schema over its Data API
-- to the `anon` role (the key every browser has) and `authenticated` (anyone
-- signed in). Row-level security is on for every table with no policies, so
-- those roles already see nothing; this removes their table rights as well,
-- so access no longer hangs on RLS alone, including for TRUNCATE, which RLS
-- doesn't cover. The default privileges stop tables created later (by
-- `prisma db push`) from getting the rights back.
--
-- Nothing in the app uses the Data API or Realtime, so nothing changes for
-- it. If a feature ever needs them, grant the specific rights it needs then.
-- Safe to run more than once.

BEGIN;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

COMMIT;
