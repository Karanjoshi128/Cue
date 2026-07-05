# Cue — end-to-end audit report

Multi-agent review (correctness · responsiveness · quality/a11y) with every finding
adversarially verified against the code. **28 findings confirmed, 1 rejected.** This report
records what was found, what was fixed (commit `edbc7b0`), and what was deliberately deferred.

## 🔴 Bugs (fixed)

| # | File | Issue | Fix |
|---|---|---|---|
| 1 | `api/cron/cleanup/route.ts` | **Data loss.** Daily purge deleted *any* post older than 7 days by `createdAt` — including drafts, posts awaiting approval, and **future-scheduled** posts (old `createdAt`, future `scheduledAt`) — plus their R2 media. | Only purge terminal posts (`PUBLISHED`/`PARTIAL`/`FAILED`). |
| 2 | `lib/platforms/instagram.ts` | Multi-image IG posts **silently dropped** every image after the first. | Publish a real IG **CAROUSEL** (child containers → parent). |
| 3 | `lib/publish.ts` | "Post now" on a post in review flipped it to `PUBLISHING` but the publish query skips non-approved posts → post **stuck forever** in PUBLISHING, unrecoverable in the UI. | `publishPostNow` throws if not `APPROVED`; publish query also gates on `status`. |
| 6 | `oauth/instagram/callback` | Long-token exchange + profile fetch never checked `.ok` → stored a broken account. | Guard both responses. |
| 7 | `oauth/linkedin/callback` | `/userinfo` not checked for `.ok`/`sub` → could upsert with `undefined` URN. | Guard `meRes.ok` and `me.sub`. |
| 8 | `lib/actions.ts` | A `schedule` action with no `scheduledAt` persisted an unpublishable SCHEDULED post. | Zod refine rejects it. |
| 19 | `lib/publish.ts` | Retrying a FAILED target didn't reset `attempts`, so it never re-entered the due set. | Reset `attempts`/`error`. |
| 20 | `lib/actions.ts` | Draft targets are written `SCHEDULED`; only `scheduledAt: null` kept them from firing. | Publish query now also requires `status ∈ {SCHEDULED, PUBLISHING}`. |
| 21 | `lib/crypto.ts` | `decrypt` didn't validate token shape → cryptic crash on a malformed token. | Validate 3 non-empty segments. |

## 📱 Responsiveness (fixed)

- **Calendar** month/week grid (`grid-cols-7 overflow-hidden`) clipped on phones → now scrolls
  horizontally (`min-w`), the chip time hides under `sm`, and the per-day **+** is visible on touch.
- **Long unbroken text** (pasted URLs) was clipped by cards' `overflow-hidden` → `wrap-break-word`
  on post body, comments, and preview captions.
- **Topbar** padding now matches content (`md:px-8`); **composer account chips** and the
  **client switcher** truncate instead of overflowing tight rows.

## ♿ Accessibility / consistency (fixed)

- `aria-label`s on icon-only controls (account menu, comment toggle, content-type tabs, disconnect).
- `aria-pressed` on the queue filters, composer content-type tabs, and account toggles.
- `aria-label`/label association on placeholder-only inputs (login, invite, comment, color) and the
  "Customize per platform" switch.
- `ClientDot` fallback uses `var(--primary)` so a colorless client's dot tracks the theme in dark mode.
- Bigger tap targets on the smallest icon buttons.
- Deduped the queue `FILTERS`/`Filter` into `src/lib/post-filters.ts`.

## ⏭️ Deferred (intentional — larger or lower-value)

- **Full `htmlFor`/`id` association on *every* Label/Input pair** (finding 5). We covered the
  worst cases with `aria-label`s; wiring an `id` through every field (composer body, client name,
  each poll option, per-platform textareas) is a broader refactor best done by adding `id` support
  to a shared Field wrapper.
- **Extract a shared `SegmentedControl` primitive** (finding 27) — the queue filters, content-type
  tabs, and account chips are ad-hoc `<button>`s. Consolidating into one Button-based primitive is a
  styling/consistency refactor, not a bug; deferred to avoid churn.
- **Tap-target padding on the remaining overlay icon buttons** (media/doc remove `×`) — these are
  positioned corner overlays where the current size is acceptable.

## ✅ Rejected (1)

- One finding about `retryPost` reaching a bad state was rejected on verification: FAILED/PARTIAL
  implies the post was previously APPROVED and the UI offers no way to un-approve it, so the retry
  path can't reach the unapproved-stuck state (the `updatePost` path — finding 3 — can, and is fixed).
