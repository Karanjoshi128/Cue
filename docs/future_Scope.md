# Cue - Future Scope (Detailed)

Expansion roadmap **beyond the MVP** (MVP = LinkedIn + Instagram publishing/scheduling).
Each item below has its own mini-plan: **what it is → prerequisites → data model → endpoints/logic
→ UI → effort → cost → caveats**, so any one can be picked up and built in isolation.

> **Design reference:** Buffer.
> **Out of scope by decision (not planned here):** browser extension, native mobile apps, public API.
> **Effort scale:** S = ~1 day · M = ~2–4 days · L = ~1 week · XL = multi-week.

## Table of Contents

**Features**

- [F1. Content Calendar](#f1-content-calendar)
- [F2. Advanced Composer (per-platform)](#f2-advanced-composer-per-platform)
- [F3. Drafts](#f3-drafts)
- [F4. Tags & Campaigns](#f4-tags--campaigns)
- [F5. Templates](#f5-templates)
- [F6. Ideas Library (kanban)](#f6-ideas-library-kanban)
- [F7. Roles & Permissions](#f7-roles--permissions)
- [F8. Approval Workflows](#f8-approval-workflows)
- [F9. Draft Comments](#f9-draft-comments)
- [F10. Guest / Client Access](#f10-guest--client-access)
- [F11. Two-Factor Auth (2FA)](#f11-two-factor-auth-2fa)
- [F12. Analytics & Reports](#f12-analytics--reports)
- [F13. AI Assistant](#f13-ai-assistant)
- [F14. Community Inbox](#f14-community-inbox)
- [F15. Start Page (link-in-bio)](#f15-start-page-link-in-bio)

**Platforms**

- [P1. Facebook Pages](#p1-facebook-pages) · [P2. Threads](#p2-threads) · [P3. Bluesky](#p3-bluesky)
- [P4. Mastodon](#p4-mastodon) · [P5. Pinterest](#p5-pinterest) · [P6. Google Business Profile](#p6-google-business-profile)
- [P7. YouTube Shorts](#p7-youtube-shorts) · [P8. TikTok](#p8-tiktok) · [P9. X / Twitter](#p9-x--twitter)

- [Rollout Order & Costs](#rollout-order--costs)

---

# Features

## F1. Content Calendar

**What:** Month/week grid showing every scheduled post across all clients, color-coded by client,
with gap-spotting and drag-to-reschedule.

- **Prereq:** core `Post` + `scheduledAt` (MVP).
- **Data model:** none new - reads existing `Post`/`PostTarget`. Optional `Client.color` field.
- **Logic/endpoints:**
  - `GET /api/calendar?from=&to=&clientId=` → posts in range, grouped by day.
  - `PATCH /api/posts/:id/reschedule` → update `scheduledAt` (re-validates future time).
- **UI:** month/week toggle; client filter chips; drag a post card to a new slot (optimistic update +
  Framer Motion layout animation); empty-slot "add post" affordance.
- **Effort:** **M.** **Cost:** free.
- **Caveats:** timezone handling - store UTC, render in the manager's (or client's) timezone; show the
  zone explicitly. Drag-reschedule must reject past slots.

## F2. Advanced Composer (per-platform)

**What:** Write once, then tailor each platform's variant (different caption, trimmed length, platform
preview) before scheduling.

- **Prereq:** MVP composer.
- **Data model:** add per-target overrides:
  ```prisma
  model PostTarget {
    // ...existing
    bodyOverride String?   // null = use Post.body
    mediaOverride Json?    // optional per-platform media selection
  }
  ```
- **Logic:** publish uses `bodyOverride ?? post.body`; validate per-platform limits (LinkedIn ~3000
  chars, IG caption 2200, etc.) at save time.
- **UI:** tabbed editor (one tab per selected account) with a **live platform-styled preview**;
  char counter per platform; "apply to all" button.
- **Effort:** **M.** **Cost:** free.
- **Caveats:** media rules differ per platform (aspect ratios, video length, carousel limits) - encode
  a per-platform validation map.

## F3. Drafts

**What:** Save unfinished posts without scheduling; resume later.

- **Prereq:** MVP.
- **Data model:** already covered by `PostStatus.DRAFT`. Add `updatedAt`.
- **Logic:** `POST /api/posts` with `status=DRAFT`; autosave (debounced `PATCH`).
- **UI:** "Drafts" filter in the queue; autosave indicator; "schedule" promotes draft → `SCHEDULED`.
- **Effort:** **S.** **Cost:** free.
- **Caveats:** drafts are subject to the **7-day purge** like everything else - surface that to users
  ("drafts older than 7 days are removed").

## F4. Tags & Campaigns

**What:** Label posts by campaign/topic/client-bucket for filtering and grouped reporting.

- **Prereq:** MVP.
- **Data model:**
  ```prisma
  model Tag  { id String @id @default(cuid()) name String clientId String? color String? posts PostTag[] }
  model PostTag { postId String tagId String @@id([postId, tagId]) }
  ```
- **Logic:** CRUD tags; attach/detach on a post; filter queries by tag.
- **UI:** tag multi-select in composer; tag filter in calendar/queue; per-campaign view.
- **Effort:** **S–M.** **Cost:** free.
- **Caveats:** keep tags scoped per client (or global) - decide; avoid tag sprawl with an autocomplete.

## F5. Templates

**What:** Save a post format (body skeleton + default media/hashtags) and reuse it.

- **Prereq:** MVP composer.
- **Data model:**
  ```prisma
  model Template { id String @id @default(cuid()) clientId String? name String body String mediaRefs Json? createdBy String }
  ```
- **Logic:** create from an existing post ("save as template"); instantiate → pre-fills composer.
- **UI:** template picker in composer; manage-templates screen.
- **Effort:** **S.** **Cost:** free.
- **Caveats:** templates are **permanent** (not purged) since they hold no client PII/media beyond
  references - store template media in a non-purged R2 prefix or re-upload on use.

## F6. Ideas Library (kanban)

**What:** Shared board to capture raw content ideas and move them through columns
(Backlog → In progress → Ready → Scheduled).

- **Prereq:** team auth.
- **Data model:**
  ```prisma
  model Idea { id String @id @default(cuid()) clientId String? title String notes String? column IdeaColumn @default(BACKLOG) order Int createdBy String }
  enum IdeaColumn { BACKLOG IN_PROGRESS READY SCHEDULED }
  ```
- **Logic:** CRUD + reorder (drag); "convert idea → draft post" carries title/notes into composer.
- **UI:** kanban board (Framer Motion drag), per-client filter.
- **Effort:** **M.** **Cost:** free.
- **Caveats:** ideas should be **exempt from the 7-day purge** (they're planning data, not posts) -
  set retention policy per-table, not global.

## F7. Roles & Permissions

**What:** Control who can do what - admin, manager, approver, client-guest; channel-scoped publishing.

- **Prereq:** team auth (MVP has basic `User.role`).
- **Data model:**
  ```prisma
  model Membership { id String @id @default(cuid()) userId String clientId String role MemberRole @@unique([userId, clientId]) }
  enum MemberRole { ADMIN MANAGER APPROVER VIEWER }
  ```
  (Per-client membership enables "manager for client A, viewer for client B".)
- **Logic:** middleware checks `Membership.role` per client on every mutating route; server-side
  enforcement (never trust the client).
- **UI:** team settings - invite users, assign per-client roles.
- **Effort:** **M–L.** **Cost:** free.
- **Caveats:** this is a security boundary - centralize authorization in one helper; test denial paths.

## F8. Approval Workflows

**What:** Drafts must be approved before they can publish; optional multi-step.

- **Prereq:** [F7](#f7-roles--permissions).
- **Data model:**
  ```prisma
  model Post { /* ... */ approvalState ApprovalState @default(NONE) }
  enum ApprovalState { NONE PENDING APPROVED REJECTED }
  model Approval { id String @id @default(cuid()) postId String reviewerId String decision ApprovalState note String? createdAt DateTime @default(now()) }
  ```
- **Logic:** posts requiring approval can't enter `SCHEDULED` until `APPROVED`; the publish cron skips
  unapproved posts; notify reviewer on submit, author on decision.
- **UI:** "Submit for approval" → reviewer queue → approve/reject with note; status badges.
- **Effort:** **M.** **Cost:** free.
- **Caveats:** define what happens to a scheduled post if approval is revoked late; lock editing once
  approved (or reset to PENDING on edit).

## F9. Draft Comments

**What:** Threaded notes on a post/draft for internal collaboration (not published anywhere).

- **Prereq:** team auth.
- **Data model:**
  ```prisma
  model Comment { id String @id @default(cuid()) postId String authorId String body String createdAt DateTime @default(now()) }
  ```
- **Logic:** CRUD; @mention → notification (optional).
- **UI:** side panel on the post editor; unread indicator.
- **Effort:** **S–M.** **Cost:** free.
- **Caveats:** comments tied to a post are **purged with the post** at 7 days - acceptable (they're
  about that post).

## F10. Guest / Client Access

**What:** Give a client a limited login to review/approve their own posts only.

- **Prereq:** [F7](#f7-roles--permissions), ideally [F8](#f8-approval-workflows).
- **Data model:** `Membership.role = VIEWER/APPROVER` scoped to one `clientId`; magic-link invite token.
- **Logic:** Supabase Auth magic link; row-level scoping so a guest sees only their client's data.
- **UI:** stripped-down portal - their calendar + pending approvals, nothing else.
- **Effort:** **M.** **Cost:** free.
- **Caveats:** **data isolation is critical** - enforce `clientId` on every query; consider Supabase RLS
  as a second guard.

## F11. Two-Factor Auth (2FA)

**What:** Optional/enforced MFA for team members.

- **Prereq:** Supabase Auth (MVP).
- **Data model:** handled by Supabase (`auth.mfa_factors`); optional `Org.enforce2FA` flag.
- **Logic:** Supabase MFA enroll/verify (TOTP); middleware blocks unverified sessions if enforced.
- **UI:** security settings - enroll authenticator, show recovery codes.
- **Effort:** **S.** **Cost:** free (built into Supabase Auth).
- **Caveats:** provide recovery codes; admins enforcing 2FA must not lock themselves out.

## F12. Analytics & Reports

**What:** Per-post and per-client performance (reach, engagement, clicks) + exportable client reports.

- **Prereq:** each platform's analytics scope + app review; published posts to measure.
- **Data model:**
  ```prisma
  model PostHistory { /* permanent */ likes Int? comments Int? reach Int? clicks Int? lastSyncedAt DateTime? }
  ```
  Store **only small numbers** on the permanent history row (no media) → survives the 7-day purge.
- **Logic:**
  - A scheduled job (extend the keepalive/cron) fetches insights for posts published in the last N days
    from each platform API and updates `PostHistory`.
  - LinkedIn: organization share statistics; Instagram: media insights endpoint.
  - Report builder aggregates `PostHistory` by client/date/tag → PDF/CSV.
- **UI:** per-client dashboard (charts), date filters, "Export report".
- **Effort:** **L** (per platform incremental). **Cost:** free API data (LLM only if AI takeaways added).
- **Caveats:** ⚠️ **7-day purge conflict** - we can't keep deep raw history locally; we fetch live and
  persist only the compact metrics on `PostHistory`. Each platform = separate scope + review. Insight
  availability windows differ (some metrics expire on the platform side too).

## F13. AI Assistant

**What:** Generate post ideas, rewrite/shorten/optimize, translate, produce per-platform variants, and
AI "next-step" takeaways from analytics.

- **Prereq:** composer (and analytics for takeaways).
- **Data model:** optional `AiUsage` log (tokens, cost) for budgeting.
- **Logic:** server route → LLM API (e.g. Claude, or a free-tier model like Gemini/Groq for cost
  control); stream results into the composer; guard with per-user rate limits.
- **UI:** "✨ Assist" button in composer (ideas / rewrite / shorten / translate); takeaways card in analytics.
- **Effort:** **M.** **Cost:** ❌ **ongoing LLM cost** (small; use free tiers to stay near-zero at our scale).
- **Caveats:** the **only feature with a per-use cost** - add a usage cap; never auto-publish AI text
  without human review; watch prompt-injection if summarizing fetched content.

## F14. Community Inbox

**What:** Pull comments/replies from connected channels into one view; reply from Cue.
_(Deferred earlier - included for completeness.)_

- **Prereq:** comment-read/-write scopes per platform + app review.
- **Data model:**
  ```prisma
  model Interaction { id String @id @default(cuid()) accountId String platform Platform externalId String type InteractionType authorName String text String permalink String? createdAt DateTime handled Boolean @default(false) }
  enum InteractionType { COMMENT MENTION REPLY DM }
  ```
- **Logic:** poll (or webhook where available) each platform for new comments/mentions; post replies
  via API; mark handled. IG Login supports comment moderation; LinkedIn via comments API.
- **UI:** unified inbox, filter by client/platform/unhandled, inline reply.
- **Effort:** **L.** **Cost:** free API (polling within rate limits).
- **Caveats:** ⚠️ conflicts with 7-day purge → either exempt `Interaction` from purge or keep a short
  window; rate limits on polling; webhooks need public callback + verification.

## F15. Start Page (link-in-bio)

**What:** A public, hosted profile page per client with their links (Instagram bio link, etc.).

- **Prereq:** none (independent module).
- **Data model:**
  ```prisma
  model StartPage { id String @id @default(cuid()) clientId String slug String @unique theme Json links Json published Boolean @default(false) }
  ```
- **Logic:** public Next.js route `/[slug]` (SSR/ISR); editor saves theme + links JSON.
- **UI:** drag-order link editor, theme picker, live preview; public responsive page.
- **Effort:** **M.** **Cost:** free (served from the same Vercel app).
- **Caveats:** public route = needs basic abuse/SEO handling; **exempt from purge** (it's persistent
  client config, not a post).

---

# Platforms

> **Shared pattern for every platform:** add a `Platform` enum value, an OAuth connect flow that stores
> an (encrypted) token on `SocialAccount`, a publish adapter implementing
> `publish(account, post) → externalPostId`, and token refresh in the keepalive cron. Below: only the
> platform-specific details.

## P1. Facebook Pages

- **API:** Meta Graph API (same app as Instagram). **Free.**
- **Auth/scope:** `pages_manage_posts`, `pages_read_engagement`; page access token.
- **Publish:** `POST /{page-id}/feed` (text/link) or `/photos` `/videos` for media.
- **Effort:** **S** (reuses Meta plumbing). **Caveats:** App Review + Business Verification (shared with IG).

## P2. Threads

- **API:** Meta Threads API. **Free.**
- **Auth/scope:** `threads_basic`, `threads_content_publish`.
- **Publish:** 2-step like IG - create media container → publish.
- **Effort:** **S–M.** **Caveats:** newer API; rate limits; some media types limited.

## P3. Bluesky

- **API:** AT Protocol (`com.atproto.repo.createRecord`). **Free, no app approval.** ✅ easiest.
- **Auth:** user app-password (or OAuth) → session; store handle + token.
- **Publish:** create a `app.bsky.feed.post` record; upload blobs for images.
- **Effort:** **S.** **Caveats:** image/video constraints; no formal "business account" concept.

## P4. Mastodon

- **API:** Mastodon REST (`POST /api/v1/statuses`). **Free.**
- **Auth:** per-instance OAuth app (instance URL varies per account) → store base URL + token.
- **Publish:** upload media → attach `media_ids` → post status.
- **Effort:** **S–M.** **Caveats:** every instance is separate; register app per instance (or dynamic).

## P5. Pinterest

- **API:** Pinterest API v5. **Free.**
- **Auth/scope:** `pins:write`, `boards:read`; OAuth.
- **Publish:** `POST /pins` with board id + image + link.
- **Effort:** **M.** **Caveats:** app approval/trial→standard access; requires a target **board**
  (add board selection to composer); image-centric.

## P6. Google Business Profile

- **API:** Business Profile APIs (local posts). **Free.**
- **Auth/scope:** Google OAuth, Business Profile scope.
- **Publish:** create a local post (`localPosts.create`) with summary/media/CTA.
- **Effort:** **M.** **Caveats:** API access requires an approval request to Google; post types differ
  (offer/event/update); location id needed.

## P7. YouTube Shorts

- **API:** YouTube Data API v3 (`videos.insert`). **Free (quota-limited).**
- **Auth/scope:** Google OAuth, `youtube.upload`.
- **Publish:** resumable upload of a vertical video; set title/desc; `#Shorts`.
- **Effort:** **M–L.** **Caveats:** **quota** ~10k units/day, an upload ≈1600 → ~6/day default (request
  more); video files are heavy → mind R2 + the 7-day purge timing (upload before purge).

## P8. TikTok

- **API:** TikTok Content Posting API. **Free.**
- **Auth/scope:** `video.publish` (or `video.upload`); OAuth.
- **Publish:** init upload → upload video → publish (or leave as draft).
- **Effort:** **M–L.** **Caveats:** ⚠️ **app audit required** - until audited, can only post
  **private/draft**; strict review for direct-publish; video only.

## P9. X / Twitter

- **API:** X API v2 (`POST /2/tweets`). **❌ Paid.**
- **Auth/scope:** OAuth 2.0; **Basic tier ≈ $200/month** for meaningful posting volume.
- **Publish:** create tweet; media upload via separate endpoint.
- **Effort:** **M.** **Caveats:** **the only platform with a real monetary cost** - build **only if a
  client explicitly needs X**; free tier is too limited for production posting.

---

# Rollout Order & Costs

Ordered by effort-to-value; each phase is independently shippable.

| #   | Phase                   | Items                                                                                                                                                                                             | Effort   |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 0   | **MVP**                 | LinkedIn + Instagram publish/schedule, basic composer, drafts                                                                                                                                     | -        |
| 1   | **Cheap platform wins** | [Facebook](#p1-facebook-pages), [Threads](#p2-threads), [Bluesky](#p3-bluesky), [Mastodon](#p4-mastodon)                                                                                          | S–M each |
| 2   | **Calendar + organize** | [F1 Calendar](#f1-content-calendar), [F4 Tags](#f4-tags--campaigns), [F5 Templates](#f5-templates), [F2 Advanced composer](#f2-advanced-composer-per-platform)                                    | M        |
| 3   | **Collaboration**       | [F7 Roles](#f7-roles--permissions), [F8 Approvals](#f8-approval-workflows), [F9 Comments](#f9-draft-comments), [F10 Guest access](#f10-guest--client-access), [F11 2FA](#f11-two-factor-auth-2fa) | M–L      |
| 4   | **Ideas + planning**    | [F6 Ideas Library](#f6-ideas-library-kanban)                                                                                                                                                      | M        |
| 5   | **Analytics**           | [F12 Analytics & Reports](#f12-analytics--reports)                                                                                                                                                | L        |
| 6   | **More platforms**      | [Pinterest](#p5-pinterest), [Google Business](#p6-google-business-profile), [YouTube](#p7-youtube-shorts), [TikTok](#p8-tiktok)                                                                   | M–L each |
| 7   | **AI**                  | [F13 AI Assistant](#f13-ai-assistant)                                                                                                                                                             | M        |
| 8   | **Community**           | [F14 Community Inbox](#f14-community-inbox)                                                                                                                                                       | L        |
| 9   | **Link-in-bio**         | [F15 Start Page](#f15-start-page-link-in-bio)                                                                                                                                                     | M        |
| 10  | **X (only if needed)**  | [X / Twitter](#p9-x--twitter)                                                                                                                                                                     | M        |

### Cost summary (unchanged)

- **Only money costs:** **X API ~$200/mo** (Phase 10, optional) and **AI features** (Phase 7, small,
  free tiers available).
- **SOC 2** is not a feature → skipped.
- Everything else is free to run; the real price elsewhere is **per-platform app-approval time**.

### Cross-cutting note - the 7-day purge

Several features hold data that should **not** be purged with posts: **Templates, Ideas, Start Pages,
Tags, and the compact metrics on `PostHistory`**. Implement retention **per-table**, not globally -
the daily cleanup job should target only `Post`/`PostTarget`/`MediaAsset` (+ their `Comment`s), and
explicitly exclude the persistent tables above.
