<div align="center">

# Cue

**Schedule & publish to LinkedIn and Instagram for every client - from one calm dashboard.**

A multi-client social media scheduler for agencies and solo social managers. One person runs
the content for 15+ clients across LinkedIn and Instagram, all from a single workspace -
engineered end-to-end to run on free tiers.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)](https://www.prisma.io)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase)](https://supabase.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)](https://tailwindcss.com)

</div>

---

## Table of contents

- [Why Cue](#why-cue)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Going live](#going-live--wire-credentials)
- [Deploy to Vercel + cron](#deploy-vercel--cron)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [Design decisions](#design-decisions)
- [Roadmap](#roadmap)

---

## Why Cue

Agencies juggling many clients usually pay per-seat for a tool like Buffer or Hootsuite, then
pay again for every extra brand. Cue is a self-hostable alternative built around a single
operator managing many clients:

- **Multi-client by design** - clients are first-class workspaces, each with its own connected
  accounts, brand color, and queue.
- **Two platforms that matter for B2B + brand** - LinkedIn and Instagram, done properly.
- **Free to run** - Supabase, Cloudflare R2, GitHub Actions and Vercel free tiers cover the
  whole stack. The only paid pieces are optional (X/Twitter API, AI assists).
- **Privacy-minded retention** - post text and media are purged after 7 days; a permanent,
  lightweight history row (client, platform, permalink, published date) survives for the record.

---

## Features

### Built (MVP)

- **App shell** - Buffer-style sidebar + topbar, fully branded with the Cue logo and palette,
  dark/light aware.
- **Dashboard** - at-a-glance stats and upcoming posts across every client.
- **Composer** - pick a client and target accounts, write once, attach media, then **Schedule**,
  **Post now**, or **Save draft**, with a live per-platform preview.
- **Calendar** - month grid of scheduled posts, color-coded per client.
- **Queue** - filter by status, retry failed targets, delete, and jump to live permalinks.
- **Clients** - add clients, connect their LinkedIn / Instagram accounts via OAuth, and monitor
  connection health.
- **Settings** - account details and integration-readiness checks.
- **Scheduling engine** - atomically claims due targets, publishes per account, retries up to
  3×, rolls each post up to an overall status, and writes a permanent `PostHistory` record.
- **Publish adapters** - LinkedIn Posts API and Instagram Graph API (via **Instagram Login** -
  no Facebook Page required).
- **Cron endpoints** - `/api/cron/publish`, `/api/cron/keepalive` (warms the DB + refreshes
  tokens), and `/api/cron/cleanup` (7-day purge + R2 object delete), all Bearer-secured.
- **GitHub Actions** - publish (every 5 min), keepalive (every 5 days), cleanup (daily).
- **Token encryption at rest** - OAuth access/refresh tokens are encrypted with `TOKEN_ENC_KEY`.
- **Zero-credential dev mode** - runs locally without any secrets by auto-logging in as a
  seeded admin, so the whole UI is browsable before you wire a single integration.

---

## Tech stack

| Layer         | Choice                                               | Notes                                                |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Framework     | **Next.js 16** (App Router) + **React 19**           | Server Components, server actions                    |
| Language      | **TypeScript 5**                                     | strict                                               |
| Database      | **Supabase** (Postgres)                              | pooled URL for app, direct URL for migrations        |
| ORM           | **Prisma 6**                                         | classic `url` / `directUrl` (not v7 driver adapters) |
| Auth          | **Supabase Auth** (`@supabase/ssr`)                  | dev mode bypasses with a seeded admin                |
| Media storage | **Cloudflare R2** (S3 API)                           | public bucket, keys purged on cleanup                |
| Scheduling    | **GitHub Actions** cron → secured API routes         | free, no always-on server                            |
| UI            | **shadcn/ui** (on `@base-ui/react`) + **Tailwind 4** | `render` prop, not `asChild`                         |
| Motion        | **Framer Motion**                                    |                                                      |
| Validation    | **Zod 4**                                            |                                                      |
| Hosting       | **Vercel** (free tier)                               |                                                      |

---

## Architecture

```
                 ┌──────────────────────────────────────────────┐
                 │                  Next.js app                  │
   Browser ────► │  App Router · Server Components · Actions     │
                 │  Composer · Calendar · Queue · Clients        │
                 └───────┬───────────────────────┬──────────────┘
                         │                        │
                  Prisma │                        │ S3 API
                         ▼                        ▼
                 ┌───────────────┐        ┌───────────────┐
                 │  Supabase PG  │        │ Cloudflare R2 │
                 │  posts/queue  │        │     media     │
                 └───────────────┘        └───────────────┘
                         ▲
       Bearer-secured    │  /api/cron/*
   ┌─────────────────────┴───────────────────────┐
   │              GitHub Actions cron             │
   │  publish (5m) · keepalive (5d) · cleanup (1d)│
   └───────────────────────┬──────────────────────┘
                            │ publish adapters
                            ▼
                ┌───────────────────────────┐
                │  LinkedIn API · IG Graph  │
                └───────────────────────────┘
```

**Publish flow:** a post fans out into one `PostTarget` per connected account. The publish cron
claims due targets, hands each to its platform adapter, records `externalPostId` + `permalink`,
retries failures (up to 3×), and rolls the parent post up to `PUBLISHED` / `PARTIAL` / `FAILED`.

**Keepalive cron** pings the DB so Supabase's free tier never hits its 7-day inactivity pause,
and refreshes OAuth tokens before they expire.

**Cleanup cron** purges post text + media older than 7 days (and deletes the R2 objects), while
copying the essentials into the permanent `PostHistory` table first.

---

## Data model

Defined in [`prisma/schema.prisma`](prisma/schema.prisma):

- **User** - team members (`ADMIN` / `MANAGER`).
- **Client** - a managed brand/workspace (name, logo, brand color).
- **SocialAccount** - a connected LinkedIn/Instagram account under a client; stores **encrypted**
  access/refresh tokens and expiry.
- **Post** - the composed content for a client (`DRAFT → SCHEDULED → PUBLISHING → PUBLISHED /
PARTIAL / FAILED`).
- **PostTarget** - one publish attempt per account, with its own status, external id, permalink,
  error, and attempt count.
- **MediaAsset** - image/video stored in R2 (public URL + storage key).
- **Comment** - internal collaboration notes on a post.
- **PostHistory** - permanent, lightweight record that survives the 7-day purge (no FK to Post),
  with optional metrics fields reserved for future analytics.

---

## Getting started

> **Requirements:** Node 20+, npm.

```bash
git clone https://github.com/Karanjoshi128/Cue.git
cd Cue
npm install
npm run dev          # http://localhost:3000
```

Dev mode runs **without any credentials** - it auto-logs in as a seeded admin so you can browse
the entire UI immediately. Wire the integrations below when you're ready to publish for real.

---

## Environment variables

Copy the template and fill it in - every key is documented in [`.env.example`](.env.example):

```bash
cp .env.example .env
```

| Group                | Keys                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------- |
| **Database**         | `DATABASE_URL` (pooled, 6543) · `DIRECT_URL` (direct, 5432)                                   |
| **Supabase Auth**    | `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY`    |
| **Cloudflare R2**    | `R2_ACCOUNT_ID` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `R2_BUCKET` · `R2_PUBLIC_URL` |
| **Security**         | `TOKEN_ENC_KEY` (32 bytes) · `CRON_SECRET` (shared with GitHub Actions)                       |
| **LinkedIn**         | `LINKEDIN_CLIENT_ID` · `LINKEDIN_CLIENT_SECRET`                                               |
| **Meta / Instagram** | `META_APP_ID` · `META_APP_SECRET`                                                             |
| **App**              | `APP_URL`                                                                                     |

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # TOKEN_ENC_KEY
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"   # CRON_SECRET
```

---

## Going live - wire credentials

1. **Supabase** - create a project, then set the pooled `DATABASE_URL` (port 6543), the
   `DIRECT_URL` (port 5432), and the `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SERVICE_ROLE_KEY`.
2. **Secrets** - generate `TOKEN_ENC_KEY` and `CRON_SECRET` (commands above).
3. **Cloudflare R2** - create a bucket and an API token, enable public access, fill `R2_*`.
4. **LinkedIn & Meta apps** - create dev apps, set the redirect URIs to
   `<APP_URL>/api/oauth/{linkedin,instagram}/callback`, and fill the client id/secret pairs.
5. **Push schema + seed:**
   ```bash
   npm run db:push      # create tables in Supabase
   npm run db:seed      # demo admin + sample clients (optional)
   ```
6. **Run:** `npm run dev` → http://localhost:3000

---

## Deploy (Vercel) + cron

- Deploy the repo to **Vercel** and add every env var in the project settings.
- Add these **GitHub repo secrets** so the scheduled workflows can reach your app:
  `PUBLISH_URL`, `KEEPALIVE_URL`, `CLEANUP_URL` (your deployed `/api/cron/*` URLs) and
  `CRON_SECRET` (the same value as the app).
- The workflows in [`.github/workflows/`](.github/workflows/) then fire on schedule -
  publish every 5 minutes, keepalive every 5 days, cleanup daily.

---

## Project structure

```
src/
├─ app/
│  ├─ (app)/                 # authenticated shell: dashboard, composer, calendar, queue, clients, settings
│  ├─ api/
│  │  ├─ cron/               # publish · keepalive · cleanup (Bearer-secured)
│  │  ├─ oauth/              # linkedin & instagram start + callback
│  │  └─ upload/             # media upload to R2
│  ├─ auth/ · login/ · logout/
│  └─ icon / opengraph image assets
├─ components/
│  ├─ ui/                    # shadcn primitives (base-ui)
│  ├─ brand/                 # logo
│  └─ composer, queue-list, clients-manager, sidebar, topbar, …
└─ lib/
   ├─ platforms/             # linkedin + instagram adapters (+ shared types)
   ├─ publish.ts             # scheduling engine
   ├─ crypto.ts              # token encryption
   ├─ r2.ts · prisma.ts · auth.ts · cron-auth.ts
   └─ supabase/              # ssr client + server helpers
prisma/   schema.prisma · seed.ts
docs/     PLAN.md · future_Scope.md
.github/  workflows/ (publish, keepalive, cleanup)
```

---

## Scripts

| Command              | What it does                                    |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Start the dev server                            |
| `npm run build`      | Production build (runs `prisma generate` first) |
| `npm run start`      | Start the production server                     |
| `npm run lint`       | ESLint                                          |
| `npm run db:push`    | Push the Prisma schema to the database          |
| `npm run db:migrate` | Create/apply a dev migration                    |
| `npm run db:seed`    | Seed demo admin + sample clients                |
| `npm run db:studio`  | Open Prisma Studio                              |

---

## Design decisions

- **Prisma 6, not 7** - v7's config/driver-adapter rework added too much friction for the win;
  Cue uses the classic `url` / `directUrl` setup.
- **shadcn on base-ui** - components use the **`render` prop**, not `asChild`.
- **Brand icons are inline SVGs** - `lucide-react` v1 dropped brand glyphs, so platform icons
  live in `src/components/platform-icons.tsx`.
- **Instagram Login (not Facebook Login)** - no Facebook Page needed; the account just has to be
  Professional/Business/Creator. Facebook Login is kept as a fallback path.
- **No Sanity CMS** - posts are relational/transactional, so Postgres + Prisma fit; media lives
  in R2.
- **DB-touching pages** use `export const dynamic = "force-dynamic"`.

> Full planning context lives in [`docs/PLAN.md`](docs/PLAN.md) and
> [`docs/future_Scope.md`](docs/future_Scope.md).

---

## Roadmap

The MVP is **LinkedIn + Instagram** publishing and scheduling. Staged for later (see
[`docs/future_Scope.md`](docs/future_Scope.md)): more platforms (X/Twitter, Facebook, Threads,
YouTube, TikTok), AI caption assists, analytics on the `PostHistory` metrics fields, approval
workflows, and team roles beyond admin/manager.

Explicitly **out of scope** by decision: browser extension, native mobile apps, and a public API.

---

<div align="center">
<sub>Built with Next.js · Supabase · Prisma · Cloudflare R2 - designed to run on free tiers.</sub>
</div>
