# Video retention

Uploaded **videos are deleted from storage 7 days after their post goes live**.
This applies to Cue's own R2 bucket and to any bucket a workspace connected in
**Settings → Media storage**. By then every network has its own copy, and
videos are what fill a bucket.

Only the file goes. The post, its captions, its links and `PostHistory` stay,
and the `MediaAsset` row is kept with `removedAt` set. Images, covers and
documents are kept until the post is deleted.

Code: `src/lib/media-retention.ts`, called by `POST /api/cron/media-retention`.

## The rule

A video file is deleted when **every** post that uses it:

- went live on at least one account (`PUBLISHED`, or `PARTIAL`);
- has no account still waiting to go out or mid-upload;
- last published more than 7 days ago (the latest `PostTarget.publishedAt`).

Duplicating a post copies its media rows, so one file can belong to several
posts. While any of them is a draft, scheduled or failed, the file stays. A
partly published post has 7 days to retry its failed accounts.

After deletion:
- **Retry** (in the app and the admin panel) refuses, with a message telling the user to duplicate the post and add the video again.
- **Duplicate** makes the copy without the deleted video and says so.
- The calendar shows "The video file was deleted from storage" in place of the player.
- Creating a post with the deleted `url` and `storageKey` (API or connector) is a 400.
- **Storage on Cue** (the plan limit) stops counting the file.

## Where the file is deleted

- A URL on Cue's bucket (any of `cueMediaBases()`) is deleted from Cue's R2.
- A URL under the workspace's own bucket's public URL is deleted from that bucket, with its saved keys. This still happens if a platform admin has switched **Own storage** off: that only sends new uploads to Cue's bucket.
- A URL in neither (the workspace disconnected or replaced its bucket) can't be reached. It's recorded as failed.

Failures (wrong keys, a bucket that's gone, no delete permission) set
`removalError` and `removalTriedAt`, and the file is tried again a day later.
**Admin → Platform → Video clean-up** shows the last run and how many files
couldn't be deleted.

Deletes are permanent on R2 and on unversioned S3 buckets. On an S3 bucket
with versioning on, a delete leaves the older version until the bucket's own
lifecycle rules remove it. Cue doesn't delete versions.

## Deploy order (important)

The code reads three new `MediaAsset` columns, so they must exist in production
**before** the code is merged. Otherwise the calendar, plan usage and new posts
fail. The change only adds nullable columns and an index. **Applied to
production on 22 Nov 2026** (`prisma/manual/2026-11-22-media-retention.sql`):

```sql
ALTER TABLE "MediaAsset"
  ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removalTriedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removalError" TEXT;
CREATE INDEX IF NOT EXISTS "MediaAsset_storageKey_idx" ON "MediaAsset"("storageKey");
```

(`pnpm prisma db push` does the same.)

Then, after the deploy, create the hourly job in the Supabase SQL editor. It
reuses the vault secret the publisher uses:

```sql
select cron.schedule(
  'cue-media-retention',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://trycue.space/api/cron/media-retention',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'cue_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
```

To stop it: `select cron.unschedule('cue-media-retention');`

Each run handles up to 500 files, oldest first, so a backlog clears over a few
hours.

## Testing locally

`scripts/e2e-media-retention.ts` runs against the throwaway local database with
a fake storage call, so nothing real is deleted:

```bash
DATABASE_URL=postgresql://...@127.0.0.1:55433/cue_test pnpm tsx scripts/e2e-media-retention.ts
```
