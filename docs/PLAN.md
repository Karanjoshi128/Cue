# Cue - Multi-Client Social Media Scheduler

_Design reference: **Buffer** - clone the UI/UX **100%** for v1 (clean single-column composer +
queue/calendar), then tweak/brand it afterward._

**Goal:** A single web app where one (or a few) social media managers schedule and manually
publish posts to **LinkedIn** and **Instagram** on behalf of **15+ clients**, from one dashboard.

**Guiding principle:** Run entirely on free tiers. The scheduling logic lives in our own API
endpoint, so the trigger (GitHub Actions) is swappable and never locks us in.

---

## 1. Tech Stack

| Layer              | Choice                          | Why                                                                             |
| ------------------ | ------------------------------- | ------------------------------------------------------------------------------- |
| Framework          | **Next.js (App Router)**        | Full-stack: UI + API routes in one deploy                                       |
| Hosting            | **Vercel (Hobby/free)**         | Zero-config Next.js hosting                                                     |
| Database           | **Supabase (Postgres, free)**   | Managed Postgres + Storage + Auth in one                                        |
| ORM                | **Prisma Client**               | Type-safe DB access                                                             |
| Auth               | **Supabase Auth** (team logins) | Free, integrates with the same project                                          |
| File/media storage | **Cloudflare R2**               | Public URLs (Instagram needs them); 10 GB free, UPI billing covers rare overage |
| Cron / triggers    | **GitHub Actions**              | Free scheduled workflows - no Vercel cron limits                                |
| UI design          | **Google Stitch** → export      | Generate layouts fast                                                           |
| Components         | **shadcn/ui** + Tailwind        | Clean, accessible, code-owned components                                        |
| Animation          | **Framer Motion**               | Page/queue transitions, polish                                                  |
| CMS (optional)     | **Sanity** - _Phase 5 only_     | Not needed for MVP (see §10)                                                    |

**Social APIs:** LinkedIn Marketing/Share API, Instagram Graph API (Meta).

---

## 2. High-Level Architecture

```
                 ┌─────────────────────────────────────────┐
                 │            Next.js app (Vercel)          │
   Manager  ───▶ │  UI (shadcn + Framer Motion)             │
   (browser)     │  ├─ Dashboard / Calendar / Composer      │
                 │  └─ API routes                           │
                 │       ├─ /api/auth/*  (Supabase)         │
                 │       ├─ /api/oauth/{linkedin,meta}      │
                 │       ├─ /api/posts/*  (CRUD + schedule) │
                 │       ├─ /api/cron/publish   (secured)   │
                 │       ├─ /api/cron/keepalive (secured)   │
                 │       └─ /api/cron/cleanup   (secured)   │
                 └─────────┬───────────────────────┬────────┘
                           │ Prisma                │ S3 API
                 ┌─────────▼──────────┐  ┌─────────▼──────────┐
                 │ Supabase (Postgres)│  │ Cloudflare R2      │
                 │ posts/schedule data│  │ images + videos    │
                 └────────────────────┘  └────────────────────┘
                                ▲
        GitHub Actions (free) ──┤  every 5 min  → POST /api/cron/publish
        scheduled workflows     ┤  every 5 days → POST /api/cron/keepalive (+ token refresh)
                                ┤  daily        → POST /api/cron/cleanup (delete data >7 days)
                                └  (each call carries a secret Bearer token)

        Publish flow:  /api/cron/publish → find due posts → LinkedIn / Instagram APIs
```

---

## 3. Data Model (Prisma sketch)

```prisma
model User {            // agency team members
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(MANAGER)
  createdAt DateTime @default(now())
  posts     Post[]
}
enum Role { ADMIN MANAGER }

model Client {          // each of the 15+ clients = a workspace
  id        String          @id @default(cuid())
  name      String
  logoUrl   String?
  accounts  SocialAccount[]
  posts     Post[]
  createdAt DateTime        @default(now())
}

model SocialAccount {   // a connected LinkedIn page or IG business account
  id           String     @id @default(cuid())
  client       Client     @relation(fields: [clientId], references: [id])
  clientId     String
  platform     Platform
  displayName  String
  externalId   String     // LinkedIn org URN / IG business account id
  accessToken  String     // ENCRYPTED at rest
  refreshToken String?    // ENCRYPTED
  tokenExpires DateTime?
  scopes       String?
  targets      PostTarget[]
  createdAt    DateTime   @default(now())
}
enum Platform { LINKEDIN INSTAGRAM }

model Post {            // one piece of content (may fan out to multiple accounts)
  id          String       @id @default(cuid())
  client      Client       @relation(fields: [clientId], references: [id])
  clientId    String
  author      User         @relation(fields: [authorId], references: [id])
  authorId    String
  body        String       // caption / text
  scheduledAt DateTime?    // null = draft; set = scheduled
  status      PostStatus   @default(DRAFT)
  media       MediaAsset[]
  targets     PostTarget[]
  createdAt   DateTime     @default(now())
}
enum PostStatus { DRAFT SCHEDULED PUBLISHING PUBLISHED PARTIAL FAILED }

model PostTarget {      // per-account publish job + result
  id            String        @id @default(cuid())
  post          Post          @relation(fields: [postId], references: [id])
  postId        String
  account       SocialAccount @relation(fields: [accountId], references: [id])
  accountId     String
  platform      Platform
  status        TargetStatus  @default(SCHEDULED)
  publishedAt   DateTime?
  externalPostId String?      // returned id/permalink from the platform
  error         String?
  attempts      Int           @default(0)
}
enum TargetStatus { SCHEDULED PROCESSING PUBLISHED FAILED }

model MediaAsset {
  id        String   @id @default(cuid())
  post      Post     @relation(fields: [postId], references: [id])
  postId    String
  type      MediaType
  url       String   // public Cloudflare R2 URL
  storageKey String  // R2 object key (used to delete the object on cleanup)
}
enum MediaType { IMAGE VIDEO }

model PostHistory {     // PERMANENT lightweight record - survives the 7-day purge
  id            String   @id @default(cuid())
  clientId      String   // kept as plain id (no FK cascade, so it survives deletes)
  clientName    String   // snapshot, so history stays readable if a client is removed
  platform      Platform
  externalPostId String  // id returned by LinkedIn / Instagram
  permalink     String?  // public link to the live post
  publishedAt   DateTime
  // NOTE: no body text, no media - only the tiny pointer to the live post
}
```

Notes:

- **Tokens are encrypted** before storing (AES via a `TOKEN_ENC_KEY`), never returned to the client.
- `PostTarget` separation lets one post publish to LinkedIn + Instagram with independent status/retry.

---

## 4. The Scheduling / Publishing Engine

`POST /api/cron/publish` (protected by `Authorization: Bearer ${CRON_SECRET}`):

1. Query `PostTarget` where `status = SCHEDULED` and `post.scheduledAt <= now()`.
2. Atomically flip each to `PROCESSING` (prevents double-send if two crons overlap).
3. For each, refresh token if near expiry, then call the platform API:
   - **LinkedIn:** create a UGC/share post on the org URN with text + media.
   - **Instagram:** 2-step - create media container with public image/video URL + caption,
     then publish the container.
4. On success → `PUBLISHED` (+ `externalPostId`); on error → `FAILED` (+ `error`, bump `attempts`).
   On success, also write a permanent **`PostHistory`** row (client, platform, `externalPostId`,
   permalink, `publishedAt`) - the lightweight record that survives the 7-day purge.
5. Roll the parent `Post.status` up to `PUBLISHED` / `PARTIAL` / `FAILED`.
6. Failed targets with `attempts < 3` get retried on the next run.

**"Post now" (manual):** same endpoint logic, but the UI sets `scheduledAt = now()` and can call
publish immediately rather than waiting for the cron tick.

---

## 5. GitHub Actions Workflows (the free triggers)

### 5a. Publisher - every 5 minutes

```yaml
# .github/workflows/publish.yml
name: publish-due-posts
on:
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch: {} # allow manual trigger from GitHub UI
jobs:
  fire:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger publish
        run: |
          curl -fsS -X POST "$URL" \
            -H "Authorization: Bearer $SECRET" \
            -H "Content-Type: application/json"
        env:
          URL: ${{ secrets.PUBLISH_URL }} # https://app/api/cron/publish
          SECRET: ${{ secrets.CRON_SECRET }}
```

### 5b. Keep-alive + token refresh - every 5 days

Supabase free tier **pauses a project after 7 days of inactivity**, so we ping every 5 days
(safe margin). We piggyback **token refresh** on the same job since it runs regularly.

```yaml
# .github/workflows/keepalive.yml
name: keepalive-and-refresh
on:
  schedule:
    - cron: "0 6 */5 * *" # 06:00 UTC every 5th day
  workflow_dispatch: {}
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Keep Supabase warm + refresh tokens
        run: |
          curl -fsS -X POST "$URL" -H "Authorization: Bearer $SECRET"
        env:
          URL: ${{ secrets.KEEPALIVE_URL }} # https://app/api/cron/keepalive
          SECRET: ${{ secrets.CRON_SECRET }}
```

`/api/cron/keepalive` does:

1. A tiny Prisma query (e.g. `prisma.client.count()`) → counts as DB activity, resets the 7-day timer.
2. Finds `SocialAccount`s with `tokenExpires` within ~10 days and refreshes them (LinkedIn + Meta
   long-lived tokens last ~60 days, so a 5-day cadence refreshes them well before expiry).

### 5c. Cleanup - daily (7-day data retention)

We keep nothing longer than **7 days**. A daily job deletes old posts, their text, and their
R2 media objects, keeping storage tiny (so the 10 GB R2 free tier is rarely touched).

```yaml
# .github/workflows/cleanup.yml
name: cleanup-old-data
on:
  schedule:
    - cron: "30 3 * * *" # 03:30 UTC daily
  workflow_dispatch: {}
jobs:
  purge:
    runs-on: ubuntu-latest
    steps:
      - name: Delete data older than 7 days
        run: |
          curl -fsS -X POST "$URL" -H "Authorization: Bearer $SECRET"
        env:
          URL: ${{ secrets.CLEANUP_URL }} # https://app/api/cron/cleanup
          SECRET: ${{ secrets.CRON_SECRET }}
```

`/api/cron/cleanup` does:

1. Find `Post`s where `createdAt < now() - 7 days`.
2. Delete their `MediaAsset` objects from **R2** (via S3 `DeleteObjects` using `storageKey`).
3. Delete the DB rows (`MediaAsset` → `PostTarget` → `Post`), cascading.
4. **`PostHistory` is never touched** - it has no FK to `Post`, so the tiny permanent records remain.

**Safe-after-publish:** deleting media at 7 days does **not** break already-published posts -
once LinkedIn/Instagram publish, the image/video is hosted on _their_ servers, so the live post
stays intact. R2 only holds our working copy during the schedule window.

### 5d. Data Retention Policy (summary)

- **Retention window: 7 days** for everything - post text, scheduling records, images, videos.
- After 7 days → DB rows deleted + R2 objects deleted (daily cleanup job above).
- Keeps the DB small (fits Supabase free) and R2 well under the 10 GB free tier.
- UPI billing on R2 is a safety net for rare spikes (e.g. many large videos in one week) -
  expected to almost never trigger because of the 7-day purge.
- **Permanent history (decided):** the purge is a _working-storage_ policy, not total amnesia.
  At publish time we write a tiny **`PostHistory`** row - client, platform, `externalPostId`,
  permalink, `publishedAt` - and the cleanup job **never deletes it**. So we keep a forever record
  of _what was posted and a link to it_, while the heavy stuff (text body, images, videos) is still
  purged at 7 days. No media is retained - just the lightweight pointer to the live post.

**Caveats to remember:**

- GitHub cron is _best-effort_ - can be delayed/skipped a few minutes under load. Fine for social posts.
- GitHub disables scheduled workflows after **60 days of no repo activity** → normal pushes or a
  monthly auto-commit keeps them alive.
- Every endpoint is secret-gated so only our cron can trigger publishing.

---

## 6. Social API Integration Details

**LinkedIn**

- OAuth 2.0; need approval for posting scopes (`w_member_social` / org content perms).
- Connect flow stores the org URN + access token (60-day) + refresh token (1-year).
- Publish = share/UGC post API.

**Instagram (Meta Graph API)** - _verified against Meta docs, June 2026_

Meta offers **two connection methods**. We use the newer, simpler one as primary.

- **PRIMARY → Instagram API with _Instagram Login_** (launched July 2024):
  - **No Facebook Page required.** Client just needs an Instagram **Professional** account
    (Business _or_ Creator - either works). They log in with Instagram credentials directly.
  - Supports everything we need: **content publishing** (single image, video, Reel, carousel),
    comment moderation, mentions, insights, messaging.
  - Scopes: `instagram_business_basic`, `instagram_business_content_publish` (new scope names that
    replaced the older `instagram_content_publish`).
- **FALLBACK → Instagram API with _Facebook Login_** (older):
  - Requires the IG account **linked to a Facebook Page**.
  - Adds features we don't need: hashtag search, Business Discovery, branded-content ads,
    product/shopping tagging. Keep only for a client already set up this way or who later wants
    product tagging.
- **Cost:** the Graph API is **free** (no usage fee) on both paths.
- **Setup:** Meta app + **Business Verification** + **App Review** for the content-publish
  permission. Free but takes days → start in Phase 0.
- **Publish flow:** create a media container (needs a **public media URL from Cloudflare R2**) →
  publish the container.
- **Rate limit:** **50 published posts per 24h, per IG account** (applies to both methods) - far
  beyond our needs at 15 clients.
- Personal (non-Professional) IG accounts can't auto-post via _any_ method → fallback "reminder to
  post manually" (Phase 5, optional).

Sources: [Instagram Login API docs](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/),
[Platform overview](https://developers.facebook.com/docs/instagram-platform/overview/),
[Content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/).

---

## 7. UI / Screens (Stitch → shadcn → Framer Motion)

1. **Login** (Supabase Auth).
2. **Dashboard** - upcoming posts across all clients, counts, recent failures.
3. **Clients** - grid of the 15+ clients; click into a client workspace.
4. **Connect Accounts** - per client, OAuth buttons for LinkedIn / Instagram; show connection health.
5. **Composer** - write body, pick client + target accounts (multi-select), upload media, set
   schedule or "Post now", live preview per platform.
6. **Calendar** - month/week view, all clients color-coded, drag to reschedule (later).
7. **Queue / List** - filter by client, platform, status; retry failed.
8. **Post detail** - per-target status, permalink, error, retry button.
9. **Settings** - team members, encryption/connection status.

Workflow: design in **Stitch** → export → rebuild with **shadcn** primitives → add **Framer Motion**
for route transitions, list reordering, and toast/queue animations.

---

## 8. Environment Variables / Secrets

App (Vercel):

```
DATABASE_URL=                 # Supabase pooled connection (Prisma)
DIRECT_URL=                   # Supabase direct connection (migrations)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server-side only
R2_ACCOUNT_ID=                # Cloudflare R2
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=                # public bucket / r2.dev or custom domain base URL
TOKEN_ENC_KEY=                # 32-byte key for encrypting social tokens
CRON_SECRET=                  # shared with GitHub Actions
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
META_APP_ID=
META_APP_SECRET=
APP_URL=                      # https://your-app.vercel.app
```

GitHub repo secrets: `PUBLISH_URL`, `KEEPALIVE_URL`, `CLEANUP_URL`, `CRON_SECRET`.

---

## 9. Phased Roadmap

| Phase                     | Deliverable                                                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0 - Setup**             | Next.js + Tailwind + shadcn, Supabase project, Prisma schema + first migration, Supabase Auth login, deploy to Vercel                                                                  |
| **1 - Core data**         | Clients CRUD, team auth, dashboard shell, Composer (drafts), media upload to Cloudflare R2                                                                                             |
| **2 - LinkedIn + engine** | LinkedIn OAuth, publish API, scheduling engine, `PostHistory` on publish, `/api/cron/publish` + `/api/cron/cleanup`, **GitHub Actions publisher + keepalive + cleanup**, token refresh |
| **3 - Instagram**         | Meta app + verification, IG OAuth, container→publish flow                                                                                                                              |
| **4 - Polish**            | Calendar view, queue filters/retry, per-platform preview, Framer Motion, error handling                                                                                                |
| **5 - Optional**          | Sanity CMS content library, analytics, "manual reminder" for personal IG, approvals workflow                                                                                           |

---

## 10. Decision: Sanity CMS - skip for MVP

**Recommendation: do NOT use Sanity for core post content.** Posts are transactional, status-driven,
relational records (schedule, per-platform publish IDs, retry/error state, client/account relations) -
a perfect fit for Postgres + Prisma and an awkward fit for a headless editorial CMS. Media lives in
**Cloudflare R2** because Instagram's API needs a public URL, and our 7-day auto-purge keeps it tiny -
adding Sanity would mean a second asset store to keep in sync for no gain.

Sanity becomes worthwhile only if you later want a **separate editorial content library / marketing
site** distinct from the posting pipeline. Parked in Phase 5 as optional.

---

## 11. Cost Summary

| Item                                                                | Cost                                     |
| ------------------------------------------------------------------- | ---------------------------------------- |
| Vercel Hobby, Supabase free, GitHub Actions, LinkedIn API, Meta API | **$0**                                   |
| Cloudflare R2 (10 GB storage free; 7-day purge keeps usage tiny)    | **$0** (UPI billing covers rare overage) |
| Domain (recommended for clean OAuth/app approval)                   | ~$10/yr (optional)                       |
| **Total**                                                           | **$0** (or ~$10/yr with a domain)        |

The real "cost" is **Meta Business Verification + App Review** (free but takes days) - start it in Phase 0.
