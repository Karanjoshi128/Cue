# Cue - UI Redesign Plan (from Stitch "Cue Social Media Scheduler")

Source: Stitch project `8717177134650584816`, 19 screens + a full `design.md` design system.
This plan restyles the **existing** UI to match the Stitch designs. **No new features** - same
pages, same elements, same data, same behavior. Only look-and-feel changes.

## Guardrails - Stitch extras we deliberately DO NOT port

Stitch invented chrome that Cue doesn't have. These are **out of scope**:

- A global search bar; "Analytics" / "Approvals" top-nav; "Upgrade Plan" button; notifications
  bell; "Support" nav link (seen on the Clients screen).
- Emoji / hashtag / AI icons inside the composer text area.
- Splitting the schedule field into separate date + time inputs is cosmetic only - we keep the
  single `datetime-local` control (same behavior), just restyled.

Our nav stays exactly: **Dashboard · Create · Calendar · Queue · Clients · Settings**.

---

## 1. Design tokens - `src/app/globals.css` (the biggest lever)

Replace the neutral gray palette with the Stitch cool-lavender system. Values from the project's
`design.md`.

### Light (`:root`)

| Token                          | New value                                        | Was        |
| ------------------------------ | ------------------------------------------------ | ---------- |
| `--background`                 | `#faf8ff` (cool off-white)                       | pure white |
| `--foreground`                 | `#131b2e` (ink navy)                             | near-black |
| `--card` / `--popover`         | `#ffffff`                                        | white      |
| `--primary`                    | `#2a6ff2` (Cue Blue)                             | ~same blue |
| `--primary-foreground`         | `#ffffff`                                        | white      |
| `--mint` (success)             | `#34b27b`                                        | mint       |
| `--secondary`                  | `#e2e7ff` (blue-tinted surface)                  | gray       |
| `--secondary-foreground`       | `#0040a0`                                        | dark       |
| `--muted`                      | `#f2f3ff`                                        | gray-50    |
| `--muted-foreground`           | `#424654`                                        | gray       |
| `--accent` (hover/active tint) | `#eaedff`                                        | gray-50    |
| `--accent-foreground`          | `#131b2e`                                        | -          |
| `--destructive`                | `#ba1a1a`                                        | red        |
| `--border` / `--input`         | `#dde2f2` (cool hairline)                        | gray-200   |
| `--ring`                       | `#2a6ff2`                                        | gray       |
| `--radius`                     | `0.75rem` (→ cards 12–16px, buttons/inputs ~9px) | 0.625rem   |

Sidebar: `--sidebar #f6f7fd`, `--sidebar-border #e4e7f5`, `--sidebar-accent #e2e7ff`,
`--sidebar-accent-foreground #2a6ff2` (active nav = blue tint + blue text/icon).

### Dark (`.dark`)

| Token                  | New value                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `--background`         | `#020617` (near-black navy)                                                            |
| `--foreground`         | `#e6e9f5`                                                                              |
| `--card` / `--popover` | `#0f172a`                                                                              |
| `--primary`            | `#4b86f5` (lifted for contrast)                                                        |
| `--mint`               | `#34b27b`                                                                              |
| `--muted`              | `#0f172a`, `--muted-foreground` `#94a3b8`                                              |
| `--accent`             | `#1e293b`                                                                              |
| `--border`             | `rgba(255,255,255,0.10)`, `--input` `rgba(255,255,255,0.14)`                           |
| `--ring`               | `#4b86f5`                                                                              |
| sidebar                | `--sidebar #0b1220`, `--sidebar-accent #1e293b`, `--sidebar-accent-foreground #cdddff` |

### Base layer additions

- Keep Geist. Add a **`.label-caps`** utility (12px / 600 / `letter-spacing:0.05em` / uppercase /
  `--muted-foreground`) for form labels and section headers.
- **Elevation rule:** cards, buttons, inputs get **no shadow**; only dialogs/popovers/sheets get a
  soft `shadow-lg`. Audit stray `shadow-sm` on cards and remove.

---

## 2. Shared components

- **Card** (`ui/card.tsx`): 12px radius (`rounded-xl`), 1px border, **24px** padding, no shadow.
- **Button** (`ui/button.tsx`): solid = `--primary`/white; outline = 1px `--border`, transparent;
  ghost = transparent → `--accent` on hover. Radius ~9px. Keep the three sizes.
- **Input / Textarea / Select trigger:** 1px border, ~8px radius, focus = 2px `--ring` + 2px offset.
- **Badge** (`ui/badge.tsx` + `post-bits.tsx`): pill shape. Recolor the status map to the palette:
  - Draft → neutral/gray · Scheduled → **blue** · Publishing → **amber** · Published → **mint** ·
    Partial → **amber** · Failed → **red**. Approval: In review → **amber**, Changes requested →
    **red**. Success/"Connected" badge → light mint bg + dark green text.
- **Sidebar** (`app-sidebar.tsx`): keep the animated active indicator but recolor to the blue tint
  (`--sidebar-accent` bg + `--sidebar-accent-foreground` text/icon). Nav text 14px Geist medium.
- **Topbar** (`app-topbar.tsx`): unchanged structure (mobile menu · title · "/" · client switcher ·
  theme toggle · avatar) - just picks up the new tokens.
- **ClientDot / PlatformIcon:** unchanged; platform glyphs stay container-less.

---

## 3. Per-page changes

### Login (`/login`) - already ~90% matched

- Keep split layout. Polish: brand panel uses `--primary` with a subtle diagonal texture/gradient;
  right side on `--background`. Heading in `headline-lg`. Minimal work.

### Dashboard (`/`)

- **Alert banners:** already amber; align radius/spacing to the new tokens.
- **Stat cards:** give each icon tile a **colored tint per metric** - Clients = blue, Scheduled =
  blue, Published = **mint**, Failed = **red** (tinted bg + matching icon color), instead of the
  single neutral tile. Big number in `title-md`+, label muted.
- **Upcoming posts card:** header + outline "New post" (unchanged); rows restyled with the new badge
  colors; comfortable row padding.

### Create / Composer (`/composer`)

- Field labels → **`.label-caps`** (CLIENT, PUBLISH TO, CONTENT, MEDIA, SCHEDULE FOR).
- "Customize caption per platform" toggle → move its label to the **right of the CONTENT label**
  (inline), keep the Switch (same behavior). Per-account textareas keep their platform-icon headers.
- Account pills: selected = blue tint + blue border + blue text; unselected = hairline border.
- **Media:** thumbnails unchanged; "Add" becomes a bordered square tile with an icon.
- **Schedule for:** keep single `datetime-local`, restyled (calendar icon affordance is fine).
- Action row: **Schedule** (solid primary), **Post now** (outline), **Save draft** (ghost). (Purely
  visual emphasis; all three already exist.)
- Preview column: keep the LinkedIn/Instagram cards; tighten to match (avatar, name + glyph,
  "Now · 🌐", action bars). No new controls.

### Calendar (`/calendar`)

- Toolbar: title (`headline-lg`) + **segmented control** Month/Week/List (active = white chip on a
  muted track) + `‹ Today ›` + solid "New". (We already have these; restyle the switcher as a real
  segmented control.)
- Grid: lighter weekday header row; **today = filled blue circle** on the date number; other-month
  cells muted; post chips keep the client-color left border + time.

### Queue (`/queue`)

- Filter pills: active = solid blue, rest = hairline pills.
- **Post card:** move the **error strip to the top** of the card (red tinted rounded box) above the
  header. Header: client dot + name + time, with approval + status pills top-right.
- **Footer** (approval controls + "Comments (N)"): put it on a **subtle `--muted` background band**
  with a top divider, matching the Stitch card. Approve / Request changes = outline buttons.
- Comment thread + add-note input: restyle to tokens.

### Clients (`/clients`)

- Header: "Clients" + solid "Add client".
- **Client cards:** name + "N posts" + ⋮ menu; account rows = platform glyph + name + **health pill**
  (mint "Connected" / amber "Expires in Nd" / "Expired") + unplug icon; connect buttons =
  outline "+ LinkedIn" / "+ Instagram".
- Empty state + Add/Edit dialog + confirm dialog: restyle to tokens (dialogs get the soft shadow).

### Settings (`/settings`)

- Page heading "Settings" + a one-line subtitle.
- **Account card:** name input + solid "Save"; Email/Role read-only rows.
- **Team card:** invite row (email + role select + solid "Invite"); member rows gain an **avatar**
  (initials) + name/email, role select/badge, remove ×; keep the info note.
- **Integrations card:** each row gets a **leading icon tile** + label + status pill (mint
  "Configured" / muted "Not set"). Same six rows.

---

## 4. Implementation order (batches, each: typecheck + build + commit)

1. **Tokens** - rewrite `globals.css` palette + `.label-caps` util + elevation cleanup. (Biggest
   visual shift; everything inherits it.)
2. **Shared components** - card padding/radius, button variants, badge/status colors, sidebar active
   tint. Verify the whole app re-skins.
3. **Pages** - dashboard → composer → queue → clients → calendar → settings → login. One commit per
   page (or grouped), screenshotting nothing new, only restyling.
4. **Verify** - `pnpm build` green, dark + light both checked, then push.

## 5. Non-negotiables

- No new routes, buttons, fields, or data.
- Every element that renders must already exist in the current code.
- Light **and** dark mode both styled.
- `pnpm build` must stay green before each push.
