# Google Stitch prompts - Cue UI redesign

These prompts regenerate the **visual design** of each existing screen. They describe
**only the elements Cue already has** - no new features, no new data, no extra controls.
Goal: a more polished, cohesive look, same functionality.

**How to use:** paste the **Shared design system** block first (or keep it in Stitch's project
context), then paste one **page prompt** per screen. Every page prompt already assumes the shared
style, so you can also paste them standalone.

> Hard rule for every prompt: _Do not invent buttons, tabs, fields, metrics, charts, filters, or
> sections that aren't listed. Redesign the given elements only._

---

## Shared design system (prepend once)

> Design a modern, calm SaaS product called **Cue** - a multi-client social media scheduler for
> publishing to **LinkedIn and Instagram**. Visual reference: Buffer (clean, airy, content-first).
>
> **Style:** minimal, generous whitespace, soft rounded corners (8–12px), subtle 1px borders and
> low shadows, no heavy gradients. Card-based layouts. Clear typographic hierarchy using the Geist
> / Inter family. Comfortable density - not cramped, not sparse.
>
> **Color:** primary brand blue `#2A6FF2` (buttons, active states, links); a mint green `#34B27B`
> for success/"connected"; amber for warnings; red for errors/destructive. Neutral gray text and
> borders. **Support both light and dark mode** with equal care (dark = near-black surfaces, not
> pure black).
>
> **Components:** shadcn-style - rounded cards, pill badges, ghost/outline/solid buttons, small
> status badges, dropdown menus, dialogs, toggles/switches, segmented controls, avatars with
> initials. Icons are simple line icons (Lucide style). Platform icons: LinkedIn and Instagram
> glyphs.
>
> **Do not add any feature, control, or data that isn't explicitly described in the page prompt.**

---

## 0. App shell (sidebar + topbar) - wraps every page except Login

> Design the application shell.
>
> **Left sidebar** (fixed, ~256px, visible on desktop only): the **Cue** logo at top; below it a
> full-width solid blue **"New post"** button with a plus icon; then a vertical nav list with icon +
> label rows: **Dashboard, Create, Calendar, Queue, Clients, Settings**. The active item is
> highlighted with a soft accent background. At the very bottom, small muted text "Cue · v0.1".
>
> **Top bar** (sticky, ~64px, bottom border, slight background blur): on the left, the current page
> title, then a thin "/" divider, then a **client switcher** - a small dropdown trigger showing a
> colored dot + a client name (e.g. "All clients") + up/down chevrons. On the right: a **theme
> toggle** icon button (sun/moon) and a circular **avatar** with the user's initials that opens a
> menu (email label, "Settings", "Sign out").
>
> **Mobile:** hide the sidebar; show a hamburger menu icon on the left of the top bar that opens a
> slide-in left drawer containing the same logo, "New post" button, and nav list.
>
> Only these elements. No search bar, no notifications bell, no extra icons.

---

## 1. Login - `/login`

> Design a two-column sign-in screen for **Cue**.
>
> **Left column (desktop only):** a solid brand-blue panel. At the top, the word **"Cue"** in white.
> Vertically centered, a large white heading: _"One calm dashboard for every client's social."_ and a
> smaller lighter sub-line: _"Schedule and publish to LinkedIn and Instagram across all your clients -
> from a single place."_ At the bottom, small faint text: _"Built to run on free tiers."_
>
> **Right column:** a centered card/column, max ~360px wide. On mobile the left panel is hidden and
> the **Cue** logo appears here at the top. Contains: a heading **"Welcome back"**, a muted subtitle
> _"Sign in to schedule your clients' posts."_, one **email input**, and one full-width solid blue
> **"Send magic link"** button. That's the entire form.
>
> No password field, no social-login buttons, no "sign up" link. Support light and dark mode.

---

## 2. Dashboard - `/`

> Design the **Dashboard** page (inside the app shell).
>
> **Optional alert banners** at the top (show 0–2): full-width amber rounded banners, each with a
> warning triangle icon, a message, and a trailing action label with an arrow - e.g. _"2 post targets
> failed to publish - Review →"_ and _"1 connected account is expiring soon - Reconnect →"_.
>
> **Stats row:** four equal metric cards (2 columns on mobile, 4 on desktop). Each card has a small
> rounded icon tile on the left and, to its right, a large number over a muted label. The four cards
> are: **Clients**, **Scheduled**, **Published**, **Failed**. Cards look clickable (subtle hover).
>
> **"Upcoming posts" card:** a card with a header row - title _"Upcoming posts"_ on the left and a
> small outline **"New post"** button (plus icon) on the right. The body is a divided list; each row
> shows: a small client-color dot, the client name, the post text (truncated to one line), the
> scheduled date/time, and a small status badge. Empty state: centered muted text _"Nothing scheduled
> yet. Create your first post."_
>
> Only these three sections. No charts, no graphs, no activity feed, no date range picker.

---

## 3. Create / Composer - `/composer`

> Design the **post composer** as a two-column layout (editor left, live preview right; stacks on
> mobile).
>
> **Editor card** titled _"Create a post"_ (or _"Edit post"_), containing, top to bottom:
>
> - A **"Client"** label with a dropdown select.
> - A **"Publish to"** label with a row of selectable **account pills** - each pill has a platform
>   icon (LinkedIn or Instagram) and the account name; selected pills use a blue tinted style.
> - A **"Content"** label with a multi-line **text area**, and below it a right-aligned character
>   counter like `0/3000`; if Instagram is selected with no media, a small amber hint _"Instagram
>   needs an image or video"_.
> - A row with a label **"Customize caption per platform"** and a **toggle switch** (only shown when
>   more than one platform is selected). When on, show one extra text area per selected account, each
>   headed by its platform icon + account name and its own character counter.
> - **Media thumbnails**: small square image/video previews each with a tiny "×" remove button; and an
>   outline **"Add media"** button with an image-plus icon.
> - A **"Schedule for"** label with a date-and-time picker input.
> - An action row: solid **"Schedule"** button (calendar icon), a **"Post now"** button (send icon),
>   and an outline **"Save draft"** button (save icon).
>
> **Preview column:** a _"Preview"_ label above one or more realistic social post cards - a
> **LinkedIn-style** card (round avatar with initials, name + small LinkedIn badge, "Now · 🌐", the
> post text, optional image, and a Like / Comment / Repost / Send action bar) and/or an
> **Instagram-style** card (avatar + username, a square image area, a heart / comment / share row,
> then username + caption). Show one preview per selected platform, reflecting the typed text.
>
> Only these fields. No tags input, no emoji picker, no link shortener, no first-comment field.

---

## 4. Calendar - `/calendar`

> Design the **content calendar** page.
>
> **Toolbar:** on the left a title (a month like _"July 2026"_, a week range, or _"Upcoming"_
> depending on view). On the right: a **segmented control** to switch between **Month / Week / List**;
> then (for Month and Week only) a left-chevron button, a **"Today"** button, and a right-chevron
> button; then a solid **"New"** button with a plus icon.
>
> **Month view:** a 7-column grid with weekday header row (Sun–Sat). Each day cell shows the date
> number (today highlighted in blue), and up to three small **post chips** - each chip has a scheduled
> time, the post text (truncated), and a left border in the client's color. If more, show _"+N more"_.
> On hover, a small "+" appears in the cell to add a post on that day.
>
> **Week view:** same grid but a single week with taller cells showing more chips per day.
>
> **List view:** posts grouped under date headings (e.g. _"Wednesday, July 2"_); each row shows the
> time, a client-color dot, the client name, the post text (truncated), and a status badge. Empty
> state: _"Nothing scheduled in the next 6 months."_
>
> Only these three views and these elements. No drag-and-drop UI hints, no day/agenda hour grid, no
> mini month picker.

---

## 5. Queue - `/queue`

> Design the **posts queue** page - a single scrollable column of post cards.
>
> **Filter row** at the top: a row of pill buttons - **All, Draft, Scheduled, Publishing, Published,
> Partial, Failed** - the active one filled blue.
>
> **Each post card** contains:
>
> - A header row: a client-color dot + client name + the scheduled date/time (or "Draft"); on the
>   right, an optional approval badge (_"In review"_ amber, or _"Changes requested"_ red) next to a
>   **status badge**.
> - The post text.
> - A **targets row**: for each destination, a platform icon followed by either a "View ↗" link (when
>   published) or the target's status word. On the right of this row, small ghost action buttons:
>   **Edit** (pencil, for drafts/scheduled), **Retry** (for failed/partial), and a **delete** trash
>   icon.
> - If there's an error, a small red error message strip.
> - A footer row separated by a divider: approval controls on the left - **"Send for approval"**, or
>   **"Approve"** and **"Request changes"** - and on the right a **"Comments (N)"** toggle with a
>   speech-bubble icon.
> - When comments are expanded: a thread of notes (author name + timestamp + text, with a small "×"
>   to delete your own), and at the bottom a single-line **"Add a note…"** input with a send button.
>
> Empty state: a card with centered muted text _"No posts here."_ Also design a small **delete
> confirmation dialog** ("Delete this post?", Cancel + destructive Delete).
>
> Only these elements. No bulk-select checkboxes, no search box, no sort dropdown.

---

## 6. Clients - `/clients`

> Design the **Clients** management page.
>
> **Header:** the title _"Clients"_ on the left and a solid **"Add client"** button (plus icon) on the
> right.
>
> **Client grid:** cards in two columns. Each client card has:
>
> - A header: a client-color dot + the client name; on the far right a muted _"N posts"_ count and a
>   **"⋮" overflow menu** (containing "Edit" and a red "Delete").
> - A list of connected accounts (if any): each row = platform icon + account display name + a
>   right-aligned **health badge** (mint _"Connected"_ / _"Expires in Nd"_, or amber _"Expired"_) and a
>   small **unplug** icon button to disconnect.
> - A row of two outline connect buttons: **"LinkedIn"** and **"Instagram"**, each with its platform
>   icon.
>
> Empty state: a card with _"No clients yet. Add your first one to start scheduling."_
>
> Also design: an **Add/Edit client dialog** (a "Name" text input and a small color swatch picker,
> plus a save button) and a shared **confirm dialog** for delete/disconnect (title, message, Cancel +
> destructive action).
>
> Only these elements. No client search, no tags, no per-client analytics.

---

## 7. Settings - `/settings`

> Design the **Settings** page as a single centered column of cards (max ~640px).
>
> **Account card:** titled _"Account"_. A **"Display name"** label with a text input and an adjacent
> **"Save"** button; below it, two read-only rows: **Email** and **Role** (label on the left, value on
> the right).
>
> **Team card:** titled _"Team"_. For admins, a top row with an **email input**, a small **role select**
> (Manager / Admin), and an **"Invite"** button. Below, a divided list of members - each row shows the
> member's name and email on the left, and on the right either a role **select** (Manager / Admin) plus
> a small "×" remove button (admin view) or just the role text (non-admin view). A small muted note
> below: _"Invited teammates get access as soon as they sign in with that email. The first user is the
> admin."_
>
> **Integrations card:** titled _"Integrations"_. A divided list of rows, each with a label on the left
> and a status on the right - mint _"Configured"_ with a check, or muted _"Not set"_ with an x. The rows
> are: **Supabase (database + auth), Cloudflare R2 (media), LinkedIn app, Meta / Instagram app, Cron
> secret, Token encryption key**.
>
> Only these three cards and these exact fields. No billing, no notifications settings, no API keys UI,
> no danger zone.
