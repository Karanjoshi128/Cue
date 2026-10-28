import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceId } from "@/lib/auth";
import { hasFeature } from "@/lib/plans";
import {
  bioPath,
  readLinks,
  readPostLinks,
  readTiles,
  suggestSlug,
  type BioLink,
  type BioTile,
} from "./config";
import { GRID_EXPIRED_MS, GRID_FRESH_MS, refreshGrid } from "./grid";

export const SITE_URL = (process.env.APP_URL ?? "https://trycue.space").replace(/\/$/, "");

// ---------------------------------------------------------------------------
// The public page (src/app/b/[slug]). No sign-in: it finds the page by its
// address and shows it only while it's published, the workspace isn't
// suspended and link pages are on for it.
// ---------------------------------------------------------------------------

/** What the page shows, with every link and post pointing at its click counter. */
export interface BioViewData {
  name: string;
  title: string;
  bio: string | null;
  color: string | null;
  avatarUrl: string | null;
  links: { id: string; label: string; href: string }[];
  tiles: { id: string; image: string; caption: string; video: boolean; href: string }[];
}

const loadPublished = cache(async (slug: string) => {
  const page = await prisma.bioPage.findUnique({
    where: { slug },
    include: {
      client: {
        select: {
          name: true,
          color: true,
          workspace: { select: { disabledFeatures: true, suspendedAt: true } },
        },
      },
    },
  });
  const ws = page?.client.workspace;
  if (!page?.published || !ws || ws.suspendedAt || !hasFeature(ws, "bio_pages")) return null;
  return page;
});

export async function getPublicBioPage(
  slug: string,
): Promise<{ id: string; view: BioViewData; refreshAfter: boolean } | null> {
  let page = await loadPublished(slug);
  if (!page) return null;

  // An old grid's image links may already be dead: read it before showing it.
  // A grid that's merely not fresh is refreshed after this view.
  let refreshAfter = false;
  if (page.accountId) {
    const age = page.gridAt ? Date.now() - page.gridAt.getTime() : Infinity;
    if (age > GRID_EXPIRED_MS) {
      try {
        if (await refreshGrid(page.id)) {
          const grid = await prisma.bioPage.findUnique({
            where: { id: page.id },
            select: { grid: true, avatarUrl: true },
          });
          if (grid) page = { ...page, ...grid };
        }
      } catch (err) {
        console.error(`[bio] couldn't read the grid for /b/${slug}:`, err);
      }
    } else {
      refreshAfter = age > GRID_FRESH_MS;
    }
  }

  const go = (target: string) => `${bioPath(page.slug)}/go/${encodeURIComponent(target)}`;
  return {
    id: page.id,
    refreshAfter,
    view: {
      name: page.client.name,
      title: page.title,
      bio: page.bio,
      color: page.client.color,
      avatarUrl: page.avatarUrl,
      links: readLinks(page.links).map((l) => ({ id: l.id, label: l.label, href: go(l.id) })),
      tiles: page.accountId
        ? readTiles(page.grid).map((t) => ({
            id: t.id,
            image: t.image,
            caption: t.caption,
            video: t.video,
            href: go(t.id),
          }))
        : [],
    },
  };
}

/** For metadata: the same lookup, without touching Instagram. */
export async function getPublicBioMeta(slug: string) {
  const page = await loadPublished(slug);
  return page
    ? { title: page.title, bio: page.bio, name: page.client.name, color: page.client.color, avatarUrl: page.avatarUrl }
    : null;
}

/**
 * Where a link or post sends a visitor: the link's address, or the post's
 * own link if it has one, else the post on Instagram. Only addresses saved on
 * the page, so the counter can't be pointed anywhere else.
 */
export async function bioDestination(
  slug: string,
  target: string,
): Promise<{ pageId: string; url: string | null } | null> {
  const page = await loadPublished(slug);
  if (!page) return null;
  const link = readLinks(page.links).find((l) => l.id === target);
  const tile = page.accountId ? readTiles(page.grid).find((t) => t.id === target) : undefined;
  const url = link?.url ?? (tile ? readPostLinks(page.postLinks)[tile.id] || tile.permalink : null);
  return { pageId: page.id, url: url && /^https?:\/\//i.test(url) ? url : null };
}

// ---------------------------------------------------------------------------
// The editor (src/app/(app)/bio), self-scoped to the caller's workspace.
// ---------------------------------------------------------------------------

export interface BioEditorPage {
  slug: string;
  title: string;
  bio: string | null;
  accountId: string | null;
  links: BioLink[];
  postLinks: Record<string, string>;
  grid: BioTile[];
  avatarUrl: string | null;
  gridAt: string | null;
  published: boolean;
}

export interface BioStats {
  views: number;
  clicks: number;
  /** Clicks per link id or post id. */
  byTarget: Record<string, number>;
}

export const STATS_DAYS = 30;

async function bioStats(pageId: string): Promise<BioStats> {
  const since = new Date(Date.now() - STATS_DAYS * 24 * 60 * 60 * 1000);
  const rows = await prisma.bioClick.groupBy({
    by: ["target"],
    where: { pageId, day: { gte: since } },
    _sum: { count: true },
  });
  const byTarget: Record<string, number> = {};
  let views = 0;
  let clicks = 0;
  for (const r of rows) {
    const n = r._sum.count ?? 0;
    if (r.target === "view") views = n;
    else {
      byTarget[r.target] = n;
      clicks += n;
    }
  }
  return { views, clicks, byTarget };
}

/** A free address for a new page: the client's name, then variations. */
async function freeSlug(name: string): Promise<string> {
  const base = suggestSlug(name);
  const candidates = [base, `${base}-bio`, ...[2, 3, 4, 5].map((n) => `${base}-${n}`)];
  const taken = await prisma.bioPage.findMany({
    where: { slug: { in: candidates } },
    select: { slug: true },
  });
  const used = new Set(taken.map((t) => t.slug));
  return candidates.find((c) => !used.has(c)) ?? `${base.slice(0, 20)}-${Date.now().toString(36).slice(-6)}`;
}

export async function getBioEditor(scopeClientId: string | undefined, requested: string | undefined) {
  const workspaceId = await requireWorkspaceId();
  const [workspace, clients] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { disabledFeatures: true } }),
    prisma.client.findMany({
      where: { workspaceId, ...(scopeClientId ? { id: scopeClientId } : {}) },
      select: {
        id: true,
        name: true,
        color: true,
        bioPage: { select: { slug: true, published: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const featureOn = !!workspace && hasFeature(workspace, "bio_pages");
  const list = clients.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    slug: c.bioPage?.slug ?? null,
    published: c.bioPage?.published ?? false,
  }));
  const selected = clients.find((c) => c.id === requested) ?? clients[0];
  if (!selected) return { featureOn, siteUrl: SITE_URL, clients: list, editor: null };

  const [accounts, page] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { clientId: selected.id, platform: "INSTAGRAM" },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    }),
    prisma.bioPage.findUnique({ where: { clientId: selected.id } }),
  ]);

  return {
    featureOn,
    siteUrl: SITE_URL,
    clients: list,
    editor: {
      client: { id: selected.id, name: selected.name, color: selected.color },
      accounts,
      suggestedSlug: page ? page.slug : await freeSlug(selected.name),
      page: page
        ? ({
            slug: page.slug,
            title: page.title,
            bio: page.bio,
            accountId: page.accountId,
            links: readLinks(page.links),
            postLinks: readPostLinks(page.postLinks),
            grid: readTiles(page.grid),
            avatarUrl: page.avatarUrl,
            gridAt: page.gridAt?.toISOString() ?? null,
            published: page.published,
          } satisfies BioEditorPage)
        : null,
      stats: page ? await bioStats(page.id) : null,
    },
  };
}

export type BioEditorData = Awaited<ReturnType<typeof getBioEditor>>;
