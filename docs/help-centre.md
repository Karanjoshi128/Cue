# Help centre

Plain-language guides for Cue users, in two places that share the same
components and content:

| Where | Who | Indexed |
| --- | --- | --- |
| `trycue.space/help` and `/help/<guide>` | Anyone. Static pages with the marketing header and footer | Yes: in the sitemap, with breadcrumb and article structured data |
| `/guide` and `/guide/<guide>` | Signed-in users: **Help** in the sidebar, the account menu, and the Ctrl K palette | No (`noindex`, canonical points to `/help`) |

## Where things are

- **Content:** `src/lib/help/guides/<topic>.ts`, one exported object per guide, listed in that file's array. The format is in `src/lib/help/types.ts`.
- **Topics and lookups:** `src/lib/help/index.ts`.
- **Views:** `src/components/help/*`. Public pages: `src/app/help/`. In-app pages: `src/app/(app)/guide/`.
- **Screenshots:** `public/help/<id>.png`. Their sizes are in `src/lib/help/shots.generated.ts`, written by the script; never edit it by hand.

## Writing rules

- Plain, second-person, one action per step: "Click **Schedule**."
- `**Label**` marks words on screen. Copy them exactly from the UI.
- Link other guides as `[text](/help/<slug>)`. In the in-app copy these become `/guide/...` automatically.
- Quote real error messages in **If it doesn't work** sections, word for word from the code.
- Describe only what's on `main`, as it works today.
- When you change a screen, search `screens:` in the guides for its file and update those guides in the same commit.

## Check

```bash
pnpm help:check
```

Fails on duplicate slugs or section ids, links to guides or sections that don't exist, unbalanced `**`, and missing screenshot files.

## Retake screenshots

Screenshots come from invented demo data ("Northwind Studio"), never production.

1. Start a throwaway local Postgres. See the local-testing notes: `.env` in a worktree points at a local database with `test` in its name, and the schema is pushed there.
2. Seed the demo workspace. The script refuses any non-local database.
   ```bash
   pnpm tsx --env-file=.env scripts/help-demo-seed.ts
   ```
3. Run a dev server with dev sign-in (empty `NEXT_PUBLIC_SUPABASE_URL`) and placeholder LinkedIn Pages settings, so the Company Page menu shows:
   ```bash
   LINKEDIN_PAGES_CLIENT_ID=x LINKEDIN_PAGES_CLIENT_SECRET=x pnpm next dev -p 3320
   ```
4. Take them all, or only some:
   ```bash
   pnpm help:shots
   pnpm help:shots composer-who settings-team
   ```
   This needs Python Playwright with Chromium. Each shot is defined next to its step (`shot: {...}`), with the page, actions, numbered highlight boxes and an optional crop.
5. Restart the dev server before checking the pages. It doesn't always notice the regenerated manifest.

When guides change, bump `HELP_UPDATED` in `src/app/sitemap.ts`.
