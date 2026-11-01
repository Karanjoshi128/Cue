# Calendar redesign: research and proposal

**Status:** Phases 1 and 2 built on 1 Nov 2026 (branch `feat/calendar-redesign`). Phase 3 not started.

Date: 1 Nov 2026. Goal: make `/calendar` easier for one social media manager
running 15+ client brands across LinkedIn, Instagram and YouTube.

---

## 1. What's wrong with the calendar today

Audit of `src/app/(app)/calendar/page.tsx`:

| # | Problem | Effect |
| - | ------- | ------ |
| 1 | Clicking a post leaves the calendar: drafts and scheduled posts open the full composer page, while published posts jump to `/queue`. | You lose your place just to read a post. |
| 2 | "+N more" in a month cell goes to the List view. | The day you were looking at disappears. |
| 3 | Week view is 7 tall boxes with no time axis. | You can't see *when* in the day posts go out, or spot clashes. |
| 4 | There's no drag and drop. Rescheduling means opening the composer, changing the date and saving. | The most common calendar action takes 4 clicks. |
| 5 | The only filter is platform. Client is the single-client switcher in the top bar, and there's no status filter (failed, drafts, needs approval). | You can't ask "what's failing?" or "show me these 3 clients". |
| 6 | Chips show client colour, time and caption. A status dot appears only for non-scheduled posts, platform icons only on very wide screens, and there are no thumbnails. | Posts look alike, so Reels, Shorts and documents can't be told apart. |
| 7 | Drafts without a date never appear. | Unfinished work is invisible. |
| 8 | "+" on a day prefills the date but not the time, and never the client. | Extra steps every time. |
| 9 | The view and filters live only in the URL. | Coming back resets them. |
| 10 | There's no undo, no quick actions (duplicate, retry, delete) and no keyboard shortcuts. | |
| 11 | List view shows only the next 6 months: no past, and no failed posts unless they're in range. | |

---

## 2. What the leading tools do

Research covered Buffer, Hootsuite, Later, Sprout Social, Planable, Metricool,
Publer, SocialBee, Loomly, Agorapulse and Sendible, from help centres,
changelogs and 2025-26 reviews. Highlights:

**Table stakes (nearly every tool):**
- **Views:** Month, Week (with times) and List.
- **Drag and drop:** to reschedule.
- **Status colours:** draft grey, scheduled blue, published green, failed red, approval amber.
- **Filters:** by account, status and label.
- **Navigation:** prev / Today / next.
- **Prefilled creation:** clicking a day or slot opens the composer with that time.

**Ideas that make it feel easy:**
- **Peek before you edit.** Publer opens a quick editor with "Maximize" for the full one. Buffer gives every post its own URL.
- **Drag rules spelled out** (Metricool, Sprout). Only drafts and scheduled posts move, and only to the future. Published posts get Duplicate instead.
- **Undo after a move.** Shift-drag to duplicate (Agorapulse).
- **A "No date" drawer** for undated drafts and posts waiting on approval (Buffer). Drafts can be dragged onto the grid.
- **A grouped multi-account card** with "Show each post" (Publer). This matches Cue's one post to many accounts.
- **Density the user controls:**
  - Compact / Comfortable cards (Planable, Sendible).
  - A posts-per-day cap (Sendible).
  - Compact week that hides empty hours (Sprout, Hootsuite).
- **Post-type glyphs on cards** (Metricool: Post / Reel / Story; YouTube Video / Short).
- **Visible filter state.** An active-filter count (Metricool) and saved views with a starred default (Agorapulse, Planable).
- **"Needs my review (N)" button** (Agorapulse "Assigned to me").

**Complaints to avoid:**
- **No cross-client overview** (Metricool). This is the biggest agency complaint.
- **The composer silently inherits calendar filters** (Buffer).
- **Time-zone ambiguity.** The grid shows local time while posts publish in another zone (Buffer).
- **Filters or the default view resetting** when you come back (Agorapulse, Buffer).
- **Empty "slots" cluttering the grid** (SocialBee). No drag at all (SocialBee). No compact mode (Publer).
- **Bulk actions only in List view** (Agorapulse, Sprout).

**Open gaps:**
- **Keyboard shortcuts:** no competitor documents any for its calendar.
- **Mobile:** everyone falls back to a day-grouped agenda list, with tap to open and no drag.

Sources:
- Buffer [help](https://support.buffer.com/article/651-how-to-use-the-new-calendar-feature-on-buffer) and [drafts](https://buffer.com/changelog/access-your-drafts-from-the-calendar)
- Metricool [help](https://help.metricool.com/en/article/how-to-manage-your-calendar-in-metricool-qnhwu5)
- Agorapulse [help](https://support.agorapulse.com/en/articles/12019371-publishing-calendar-explained)
- Publer [views](https://publer.com/help/en/article/how-to-change-or-switch-calendar-views-in-publer-affm3n/) and [editing](https://publer.com/help/en/article/how-to-create-and-edit-posts-from-within-the-calendar-z6yzj7)
- Planable [compact view](https://headwayapp.co/planable-updates/compact-view-for-the-content-calendar-337005) and [blog](https://planable.io/blog/social-media-calendar/)
- Sendible [changelog](https://www.sendible.com/changelog)
- Hootsuite [Apr 2026](https://www.hootsuite.com/whats-new/do-more-with-smarter-planner-controls)
- Sprout [features](https://sproutsocial.com/features/social-media-calendar/)
- SocialBee [review](https://bloggingwizard.com/socialbee-review/)

Hootsuite, Sprout, Planable, Later, SocialBee and Sendible's help centres
blocked direct reads, so those details come from search snippets.

---

## 3. Proposal

### Phase 1: the calendar does the everyday job without leaving it
1. **Post peek panel.** Clicking a post opens a side panel on the calendar, with:
   - the caption, media thumbnail, client, time, and each account with its own status;
   - actions: **Edit** (full composer), **Duplicate**, **Retry** (failed), **Delete**, **Copy link**.
2. **Drag and drop to reschedule.**
   - Which posts move: only drafts and scheduled posts, and only into the future. Past days are dimmed.
   - Time: Month keeps the time; Week snaps to 15 minutes.
   - After a move: an **Undo** toast. Alt-drag duplicates.
3. **Week view with a time axis.**
   - Hours down the side and a "now" line.
   - Posts sit at their time, and clashes show side by side.
   - A **Compact** toggle hides empty hours.
4. **"+N more" opens a day popover** in place, instead of jumping to List.
5. **Smarter creation.**
   - Clicking an empty slot in Week opens the composer at that date **and time**. In Month, the date plus a sensible default time.
   - The client is prefilled only when exactly one client is filtered, and the composer shows it plainly.
6. **Remember** the view, period and filters per browser.

### Phase 2: built for 15 clients
1. **Filter bar.**
   - **Clients:** multi-select chips with colour dots, "All" by default.
   - **Network.**
   - **Status:** Scheduled, Draft, Published, Failed, Needs approval.
   - A count of active filters and a one-click **Clear**.
2. **New card anatomy.**
   - Identity: the client's colour on the leading edge and its monogram.
   - Content: the time, platform icons with a post-type glyph (Reel, Short, Document, Carousel), and a one-line caption.
   - Status gets its own dot, separate from the client colour.
   - **Comfortable** mode adds a thumbnail; **Compact** mode is a one-line chip.
3. **Multi-account posts are one card,** with stacked icons. The peek panel shows each account's result, e.g. Instagram failed while LinkedIn published.
4. **"Unscheduled" drawer** beside the grid: undated drafts, failed posts and posts needing approval. Drag them onto a day to schedule.
5. **"Quiet clients" strip:** which clients have nothing scheduled this week. That's how an agency notices a brand going silent.
6. **Keyboard shortcuts:**
   - **T** today, **←/→** previous or next period, **M / W / L** views, **N** new post, **/** search, **Esc** close the panel.
7. **Phones:** keep the agenda list. Tapping opens the peek panel as a bottom sheet.

### Phase 3: later
- A time zone per client, shown on hover when it differs from yours.
- Posting slots or best times as ghost slots, only when one client is filtered.
- Calendar notes or campaign banners across date ranges.
- A read-only client share link.
- Multi-select on the grid for bulk move or delete.

**Schema impact:** none for Phases 1-2. Thumbnails need the first media item in
the calendar query, and drag needs a small `reschedulePost` action. Phase 3's
per-client time zone needs a column.

---

## 4. What was built (Phases 1 + 2)

- **Opens on Week.** The view, filters, density and drawer are remembered in
  the `cue_cal` cookie, and the URL still wins (`?view=&d=&c=&p=&s=`). The
  dashboard's old `?w=N` links still work.
- **Week view:**
  - a real time grid (hours, a "now" line, past time shaded);
  - clashing posts side by side;
  - click an empty slot to open the composer at that date and time;
  - drag to move at 15-minute precision.
- **Month view:**
  - a cap per cell (3 comfortable, 5 compact), with "+N more" opening a day popover in place;
  - dropping keeps the time of day.
- **Drag rules** (`reschedulePost`):
  - Drafts and scheduled posts move. Scheduled posts can only move into the future. Nothing moves mid-upload.
  - Every move has an **Undo**.
  - **Alt-drop** copies the post as a draft (`duplicatePost`).
- **Peek panel** (a side sheet, or a bottom sheet on phones):
  - media, caption, and each account's status, error and link;
  - actions: Edit, Duplicate, Retry, Copy link (`?post=` opens it) and Delete.
- **Filter bar:**
  - clients as a multi-select with search, networks, and status (incl. Failed and Needs approval);
  - an active-filter count and Clear.
  - The topbar's single-client scope shows as "X only", with a way out.
- **Cards:**
  - client colour edge plus a separate status dot;
  - post-type glyph (image, carousel, video/Reel, document, poll, link);
  - an hourglass or "Review" tag when it needs approval;
  - a thumbnail when there's room (container queries).
  - Comfortable / Compact toggle.
- **Unscheduled drawer:**
  - failed posts from the last 14 days, posts waiting for approval, and undated drafts;
  - drafts can be dragged onto the grid and stay drafts.
- **Quiet clients:** clients with nothing planned in the visible week or month, each a link to the composer.
- **Composer** accepts `time` and `client`. A client is passed only when exactly one is filtered.
- **Keyboard:** T, ←/→, W/M/L, C (density), U (drawer).
- **Phones:** an agenda list; tap opens the peek as a bottom sheet.
