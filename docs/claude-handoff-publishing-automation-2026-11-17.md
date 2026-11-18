# Claude handoff: publishing and automation parity

The feature work began on 17 November 2026 from `8d10c9f`. The production database backup and migration completed on 18 November. The release branch is `feature/publishing-and-automation-parity` and targets `main` for maintainer review. After merging, verify the deployed revision in Vercel before starting the [Oracle migration](oracle-free-tier-migration.md).

Read [the research audit](research/publishing-and-automation-parity-2026-11-17.md) for the native-platform comparison, eight-product benchmark, citations and excluded capabilities. Do not describe this as complete parity with every native editor or every competitor's CRM.

## Rules and state to preserve

- Production `.env` points to Supabase. Do not run a database reset, seed, `db push` or a destructive E2E script against it.
- Keep Instagram basic/content-publish defaults, optional comment/message scopes, workspace early access and Meta review gates. Keep Google default upload scope and the existing optional force-ssl flow. This branch does not unlock pending platform approvals.
- Keep Supabase publishing cron; do not enable the disabled GitHub publishing sweep.
- Never build into the running `.next`; `CUE_NEXT_DIST_DIR` is now supported by `next.config.ts` for isolated verification.
- Isolated verification builds write to the `.next-parity-*` directories ignored by Git and ESLint.

## What changed

### Publishing

- `src/lib/publishing-options.ts`: shared strict Zod schemas and platform-aware preflight for composer/API. Optional JSON preserves legacy defaults; malformed disclosure metadata is rejected.
- `prisma/schema.prisma`: optional `Post.publishOptions`; media role/alt text/user tags/order; separate YouTube thumbnail status, attempts and claim timestamps on targets.
- `src/components/publishing-controls.tsx`, `src/components/composer.tsx`, composer page: Instagram feed/Story, tags, collaborators, known location ID, Reel cover/frame/audio/feed controls, trial and AI disclosure; YouTube audience/synthetic disclosure/distribution/language/translations/date; LinkedIn audience/resharing/video title/SRT; ordered media and separate cover uploads.
- `src/lib/posts.ts`, `src/lib/actions.ts`, `src/lib/data.ts`: persistence, draft/edit/duplicate support and API visibility. Calendar excludes covers from content. `src/lib/connector/tools.ts` accepts the new options for assistant-created drafts; the connector still does not attach files.
- Instagram adapter now publishes ordered mixed carousels, instead of dropping videos, and uses v27 for publishing only. Other Instagram features retain their existing graph version. Stories check Business-account eligibility. Existing publishing scopes are unchanged.
- The release incorporates the LinkedIn video uploader from main (#15), including multipart uploads, retries and bounded processing checks. The new `platforms/linkedin-video.ts` verifies complete byte-range coverage and uploads the optional cover and English SRT. Image alt text, article thumbnails, profile visibility and reshare settings go through the existing Posts API.
- YouTube adapter sends the new metadata during insertion. `src/lib/publishing-enhancements.ts` applies the cover separately after publication. Failure never changes the video's published status or causes another video upload. Queue shows pending/error status and a thumbnail-only retry.
- Shared preflight rejects mixed unsupported formats, invalid Story/first-comment combinations, made-for-kids comments, unsupported covers and Page/profile visibility mismatches. Drafts may remain incomplete.

### Instagram automation

- `automations/settings.ts`: one production/preview matcher for exact mode, exclusions, priority, cooldown and campaign windows. Specific-post rules outrank general rules; priority then keyword-vs-catch-all then creation order resolve ties.
- `automations/templates.ts`: six reviewed-entry templates for resources, email capture, product information, Story replies, appointments and follower resources.
- Editor/preview/campaign controls: next-native-post scope, independent opening DM, configurable gate/follow/invalid-answer copy, campaign dates in the viewer's configured time zone, exclusions, priority, cooldown, lead tags and click tracking.
- `engine.ts`: next-post binding uses the first actual publication after activation/start, not the first post to receive a comment. Pauses and date windows apply at matching and sending. A per-rule/person PostgreSQL advisory transaction lock makes once-per-person/cooldown decisions atomic across concurrent events.
- `conversation.ts`, `shared.ts`: opening-tap flow without a follow requirement, configurable copy and tracked final-delivery buttons. STOP/unsubscribe/cancel-automation exact commands pause the contact. Existing 7-day initial reply and 24-hour continuation rules remain.
- `automations/handoff.ts`: contact pause closes conversations and marks queued work skipped, so resuming does not resurrect old sends. It cannot retract a request already in flight to Instagram.
- `automations/clicks.ts` and `api/automations/click/[id]`: HMAC-signed HTTPS destination redirects, no-store/no-referrer response, bot/prefetch exclusion and per-run visit attribution. Uses existing `APP_URL` (fallback `NEXT_PUBLIC_APP_URL`) and `TOKEN_ENC_KEY`; no new service. Rotating that key invalidates existing signatures. Signed destinations still redirect after activity rows are pruned, but no longer accrue attribution.
- `automations/recovery.ts` and `comment-recovery.tsx`: explicit preview/select/queue flow; re-fetches and validates workspace, account/media ownership, matching, age, dates and previously handled IDs at confirmation. At most 50 comments per check; scopes and existing moderation/repeat/contact-pause rules still apply.
- Dashboard/data/actions: 7/30-day funnel, rule search, activity pagination/filtering, lead server search/pagination, notes/tags/pause and selective failed-run retry. CSV includes tags, notes and pause state with existing spreadsheet-formula escaping.

## Database rollout — applied 18 November 2026

`prisma/manual/2026-11-17-publishing-automation-parity.sql` was applied to the project's configured production Supabase database on 18 November, after the user explicitly requested a backup and migration. All 19 columns across six tables were verified after commit. Row counts and hashes of every existing field in the six affected tables matched before/after inside the migration transaction. No rows were inserted or deleted, and no feature gates were enabled. Other databases still require this migration before serving the branch. Prisma Client was already generated for this schema during implementation.

The operator retains the full PostgreSQL backup and rollback materials outside Git in a restricted backup directory. Consult the operator's private rollout record for access.

- `database-before.dump`: full database snapshot, SHA-256 recorded in `backup-manifest.json`; the entire archive was decoded successfully.
- All 34 application tables in `public` were restored into a disposable local PostgreSQL database and matched the same snapshot's row counts exactly. Supabase-managed schemas were included in the full dump and decoded, but were not restored into vanilla local PostgreSQL.
- Both the migration and `schema-rollback.sql` were rehearsed on that restored copy, preserving all application row counts. The disposable restored database was then removed.
- The production migration used a transaction, five-second lock timeout, sixty-second statement timeout and existing-data hash guards. `migration-result.json` records the committed result and all 19 column definitions.
- Prefer reverting application code while retaining the additive columns if an application rollback is needed. Running the schema rollback would discard data written into the new feature columns. Restoring the entire snapshot would also lose subsequent database writes; follow the private rollback README rather than restoring over a live database blindly.
- The database backup does not include external R2/S3 media objects, environment files or PostgreSQL role passwords. Those were not changed.

## Test media kit — added 18 November 2026

`test-assets/publishing-automation/` contains two generated JPG photos, a 12-second H.264/AAC MP4 with offline English narration, a matching JPG cover below 2 MB and a timed English `.srt`. `README.md` explains upload combinations and records the prompts; `manifest.json` records checksums. `test-assets/publishing-automation-kit.zip` packages these assets for convenient use. No paid image/voice API credits were used. These synthetic test assets were not published to any social account.

New columns:

| Model | Columns |
| --- | --- |
| Post | publishOptions |
| MediaAsset | role, altText, userTags, sortOrder |
| PostTarget | enhancementError, enhancementAttempts, enhancementClaimedAt, enhancedAt |
| AutomationRule | settings, nextPost, startsAt, endsAt |
| AutomationRun | clickedAt, clickCount, collectedAt |
| Lead | tags, notes, automationPaused |

Existing rows default to content media, unpaused contacts, no campaign dates, no next-post behavior and no advanced options. Thumbnail work requires an explicit COVER asset. Historical captured-contact and click metrics cannot be reconstructed from old rows. Run-level reporting follows the existing 30-day retention policy; rule lifetime counters remain separate.

## Verification and operational notes

Testing used a disposable PostgreSQL 17 cluster at `127.0.0.1:55439`, database `cue_parity_test`, under `%TEMP%\cue-parity-20261117`. The schema was copied with both connection URLs hardcoded to that local database before pushing. Production credentials were not printed or used. Live social publishing was not tested.

- `scripts/e2e-automations.ts`: existing 97-check regression suite with Instagram mocked.
- `scripts/e2e-publishing-automation-parity.ts`: 50 added checks covering adapter requests, ordered mixed media, eligibility failures, disclosures, byte ranges/ETags, opening tap, tracking/tamper checks, tags, concurrency, dates, STOP/resume, recovery tenancy/window/idempotency and independent thumbnail retries. All HTTP/media fetches are mocked and unexpected destinations fail closed. Only this suite's named local fixture workspace is replaced on rerun.
- `scripts/e2e-parity-ui.py`: local-only Playwright checks for reports, mobile campaign editing/time-zone persistence, lead context/search/CSV and composer controls. Browser external requests are blocked. It never clicks publish/send or calls native-post lookup with fixture credentials.
- `scripts/run-isolated-parity.mjs`: local-only launcher for the dev server, build and five TypeScript suites. Validates a local database URL with `test` in its name, scrubs project/inherited service credentials and passes explicit empty environment entries to the child. It does not create or migrate a database.

For a fresh run, create an isolated local test database, hardcode both connection URLs in a temporary schema copy and apply the schema there. Set `CUE_TEST_DATABASE_URL` to that local database URL, then run `node scripts/run-isolated-parity.mjs <mode>`. Run modes `automations`, `early-access`, `reply-desk`, `connector`, then `parity` sequentially because the older suites reset the test database. The parity suite seeds the browser fixture. Modes `dev` and `build` use separate output directories; the dev server binds to `127.0.0.1:3219`. Install Python Playwright/Chromium if absent, then run `python scripts/e2e-parity-ui.py` while that dev server is running. Configure `CUE_TEST_DB`, `CUE_TEST_DB_PORT` and `CUE_TEST_PSQL` if they differ from the script's local defaults.

The dev/build process must scrub inherited/project `.env` keys and override `APP_URL`, database URLs and auth/provider configuration; changing only DATABASE_URL would still leave production auth/storage credentials in scope. Empty environment overrides should be passed through Node's explicit child `env` map: Windows PowerShell 5 can remove empty variables, allowing Next to reload values from `.env`. Use `.next-parity-dev` and `.next-parity-build` via `CUE_NEXT_DIST_DIR`. Remove only the temporary TypeScript include paths Next adds, preserving the user's `cue-video` exclusion.

### Limits that remain

- Live API acceptance is still dependent on account eligibility, file codecs/dimensions, quotas and platform behavior. Tests validate contracts using mocks, not actual publication.
- Publishing is still serverless/buffered and capped at 512 MB by Cue. Large uploads may hit request deadlines. No new background-upload service was provisioned.
- A LinkedIn accepted video post may still be transcoding. Cue does not claim a new read permission to monitor it.
- Upload-only YouTube accounts cannot read processingDetails. Thumbnail attempts wait five minutes and can still need a later retry/native Studio, particularly for Shorts; the video is never duplicated for this reason.
- Next-post lookup is bounded to 60 recent posts; recovery checks a recent owned post and up to 50 fetched comments. Recovery cannot know whether a different app already sent the single allowed private reply.
- The new report is not read-receipt, revenue or sales attribution. Known preview bots are excluded, not every possible automated fetch.
- New-follower DMs, Facebook-Login-only publishing controls, new platform integrations and enterprise workflow/inbox products are not silently enabled.
- Next 16.4.2 emitted a security-vulnerability reminder during verification. Dependencies were not upgraded as part of this feature branch; inspect the current advisory and handle that separately.

## Final verification record

- **265 checks passed on the integrated feature branch.** Automation passed 97, early-access gates 20, Reply Desk 21, connector 52, publishing/automation parity 50 and the upstream LinkedIn suite 25. The database suites used disposable local PostgreSQL. Provider requests were mocked.
- Browser checks passed on desktop and 390px mobile with no page errors: reports/templates, campaign time-zone persistence, lead notes/tags/pause, search/CSV escaping and publishing controls. Screenshots and the final browser log remain under `%TEMP%\cue-parity-20261117`.
- Full ESLint passed with zero errors and four pre-existing warnings in untouched code. TypeScript passed, including the production build's type check.
- The additive SQL was applied twice to a second disposable database restored from the baseline schema. Prisma reported no difference against the new schema.
- The isolated production build passed with exit 0, including compilation, TypeScript and generation of all 50 pages. Next's existing security reminder initially stopped the command after compilation; an identical retry within its five-minute reminder window succeeded. The dependency warning remains unresolved on this feature branch. Final logs: `%TEMP%\cue-parity-20261117\final-build-retry.log` and `final-browser.log`.
- `git diff --check` passed. Temporary Next type paths were removed and the normal `.next/dev` generated-type references restored. Only this task's dev-server process tree and disposable PostgreSQL cluster were stopped; their ignored outputs and temporary logs/screenshots remain available.
- The 17 November verification used a disposable database and mocked social requests. The production database migration took place on 18 November, as recorded above.
