import { cookies } from "next/headers";
import { decrypt, encrypt } from "@/lib/crypto";
import { LINKEDIN_REST, LINKEDIN_VERSION } from "@/lib/platforms/linkedin";

/*
 * LinkedIn Company Pages come through a second LinkedIn app. Community
 * Management API (w_organization_social) can't share an app with Sign In /
 * Share on LinkedIn, so Page accounts have their own client id and secret,
 * and are told apart from profiles by their author URN. The publishing
 * adapter is URN-agnostic; only connecting and token refresh differ.
 * Playbook: docs/linkedin-pages-access.md.
 */

export const PAGE_SCOPES = "rw_organization_admin w_organization_social";

const ORG_PREFIX = "urn:li:organization:";

/** Page roles that can publish as the Page. Analysts, recruiting and sponsored-content posters can't. */
const POSTING_ROLES = new Set(["ADMINISTRATOR", "CONTENT_ADMINISTRATOR"]);

// Both cookies must stay under the browser's 4 KB limit, so the list is capped.
export const MAX_PAGES = 30;
const MAX_NAME = 50;

const STATE_COOKIE = "cue_li_page_state";
const TOKEN_COOKIE = "cue_li_page_token";
const LIST_COOKIE = "cue_li_page_list";
const PENDING_TTL_S = 15 * 60;

export function isLinkedInPage(externalId: string): boolean {
  return externalId.startsWith(ORG_PREFIX);
}

export function pageUrn(id: string): string {
  return `${ORG_PREFIX}${id}`;
}

export function linkedinPagesConfigured(): boolean {
  return Boolean(
    process.env.LINKEDIN_PAGES_CLIENT_ID && process.env.LINKEDIN_PAGES_CLIENT_SECRET,
  );
}

/** The app credentials that issued an account's token, by its author URN. */
export function linkedinCredentials(externalId: string | undefined) {
  return externalId && isLinkedInPage(externalId)
    ? {
        clientId: process.env.LINKEDIN_PAGES_CLIENT_ID ?? "",
        clientSecret: process.env.LINKEDIN_PAGES_CLIENT_SECRET ?? "",
      }
    : {
        clientId: process.env.LINKEDIN_CLIENT_ID ?? "",
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
      };
}

export interface LinkedInPage {
  /** Numeric organization id; the URN is pageUrn(id). */
  id: string;
  name: string;
}

function restHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

/**
 * The Pages this member can publish to (approved Administrator or Content
 * admin), with their names. Costs one call for the list plus one or two per
 * Page, which is why Cue connects every Page from a single consent: the
 * Development tier allows 100 calls per member per day.
 */
export async function listPostablePages(accessToken: string): Promise<LinkedInPage[]> {
  const ids = new Set<string>();
  for (let start = 0; start < 1000; start += 100) {
    const res = await fetch(
      `${LINKEDIN_REST}/organizationAcls?q=roleAssignee&state=APPROVED&start=${start}&count=100`,
      { headers: restHeaders(accessToken), cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error(`organizationAcls ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      elements?: { role?: string; organization?: string; organizationTarget?: string }[];
    };
    const elements = data.elements ?? [];
    for (const el of elements) {
      // The docs show both field names depending on the finder.
      const urn = el.organization ?? el.organizationTarget;
      if (urn && isLinkedInPage(urn) && el.role && POSTING_ROLES.has(el.role)) {
        ids.add(urn.slice(ORG_PREFIX.length));
      }
    }
    if (elements.length < 100) break;
  }
  const chosen = [...ids].slice(0, MAX_PAGES);
  return Promise.all(
    chosen.map(async (id) => ({ id, name: await pageName(accessToken, id) })),
  );
}

/**
 * A Page's display name. The single lookup is admin-only, so a Content admin
 * falls back to organizationsLookup, which the Development tier may refuse
 * (it's a batch finder), and then to the id.
 */
async function pageName(accessToken: string, id: string): Promise<string> {
  const clip = (s: string) => s.trim().slice(0, MAX_NAME);
  try {
    const res = await fetch(`${LINKEDIN_REST}/organizations/${id}`, {
      headers: restHeaders(accessToken),
      cache: "no-store",
    });
    if (res.ok) {
      const org = (await res.json()) as { localizedName?: string };
      if (org.localizedName) return clip(org.localizedName);
    }
    const lookup = await fetch(`${LINKEDIN_REST}/organizationsLookup?ids=List(${id})`, {
      headers: restHeaders(accessToken),
      cache: "no-store",
    });
    if (lookup.ok) {
      const data = (await lookup.json()) as {
        results?: Record<string, { localizedName?: string }>;
      };
      const name = data.results?.[id]?.localizedName;
      if (name) return clip(name);
    }
  } catch {
    // Fall through to the id: a nameless Page can still be connected.
  }
  return `LinkedIn Page ${id}`;
}

// ---------------------------------------------------------------------------
// Short-lived cookies carrying the connect flow from LinkedIn's redirect to
// the Page picker. Encrypted (AES-GCM) so they can't be read or forged.
// ---------------------------------------------------------------------------

export interface PendingToken {
  userId: string;
  /** The client card the connect started from; preselected where it fits. */
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt: number;
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export const stateCookie = {
  name: STATE_COOKIE,
  options: { ...cookieOptions, maxAge: 10 * 60 },
};

export const pendingCookies = {
  token: TOKEN_COOKIE,
  list: LIST_COOKIE,
  options: { ...cookieOptions, maxAge: PENDING_TTL_S },
  encodeToken: (t: PendingToken) => encrypt(JSON.stringify(t)),
  // Pairs, not objects, to keep the cookie small.
  encodeList: (pages: LinkedInPage[]) =>
    encrypt(JSON.stringify(pages.map((p) => [p.id, p.name]))),
};

/** The pending connection for this user, or null if it's missing, expired or someone else's. */
export async function readPending(
  userId: string,
): Promise<{ token: PendingToken; pages: LinkedInPage[] } | null> {
  const jar = await cookies();
  const rawToken = jar.get(TOKEN_COOKIE)?.value;
  const rawList = jar.get(LIST_COOKIE)?.value;
  if (!rawToken || !rawList) return null;
  try {
    const token = JSON.parse(decrypt(rawToken)) as PendingToken;
    const pairs = JSON.parse(decrypt(rawList)) as [string, string][];
    if (token.userId !== userId || token.expiresAt <= Date.now()) return null;
    return { token, pages: pairs.map(([id, name]) => ({ id, name })) };
  } catch {
    return null;
  }
}

// Deleting by name alone sends no Path, which wouldn't match the "/" cookies.
export async function clearPending(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: TOKEN_COOKIE, path: "/" });
  jar.delete({ name: LIST_COOKIE, path: "/" });
}
