import type { ApprovalStatus, Platform, PostStatus, TargetStatus } from "@prisma/client";

// Client-safe calendar vocabulary, shared by the server page (which parses the
// URL and cookie) and the browser board (which builds links and saves prefs).

export type CalendarView = "week" | "month" | "list";
export type Density = "comfortable" | "compact";
export type StatusFilter = "SCHEDULED" | "DRAFT" | "PUBLISHED" | "FAILED" | "APPROVAL";

export const PLATFORMS: Platform[] = ["LINKEDIN", "INSTAGRAM", "YOUTUBE"];
export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "DRAFT", label: "Draft" },
  { key: "PUBLISHED", label: "Published" },
  { key: "FAILED", label: "Failed" },
  { key: "APPROVAL", label: "Needs approval" },
];

export interface CalendarFilters {
  /** Empty means every client. */
  clients: string[];
  platforms: Platform[];
  statuses: StatusFilter[];
}

/** What a post is, for the glyph on its card. */
export type PostKind = "text" | "image" | "carousel" | "video" | "document" | "poll" | "link";

/** A post as the calendar board receives it (dates as ISO strings). */
export interface CalendarPost {
  id: string;
  title: string | null;
  body: string;
  status: PostStatus;
  approval: ApprovalStatus;
  scheduledAt: string | null;
  kind: PostKind;
  client: { id: string; name: string; color: string | null };
  targets: {
    id: string;
    platform: Platform;
    status: TargetStatus;
    account: string;
    error: string | null;
    permalink: string | null;
  }[];
  media: { type: "IMAGE" | "VIDEO" | "DOCUMENT"; url: string; title: string | null }[];
}

export interface ClientOption {
  id: string;
  name: string;
  color: string | null;
}

/** Drafts and scheduled posts move; nothing mid-upload does. */
export function isMovable(p: Pick<CalendarPost, "status" | "targets">): boolean {
  return (
    (p.status === "DRAFT" || p.status === "SCHEDULED") &&
    !p.targets.some((t) => t.status === "PROCESSING")
  );
}

export function isEditable(p: Pick<CalendarPost, "status">): boolean {
  return p.status === "DRAFT" || p.status === "SCHEDULED";
}

export function needsApproval(p: Pick<CalendarPost, "approval">): boolean {
  return p.approval === "PENDING" || p.approval === "CHANGES_REQUESTED";
}

// ---------------------------------------------------------------------------
// URL + remembered preferences
// ---------------------------------------------------------------------------

/** Remembers view, filters, density and the drawer between visits. */
export const CAL_COOKIE = "cue_cal";

export interface CalendarPrefs {
  view?: CalendarView;
  density?: Density;
  drawer?: boolean;
  filters?: CalendarFilters;
}

export function parseView(v: unknown): CalendarView | undefined {
  return v === "week" || v === "month" || v === "list" ? v : undefined;
}

export function parseList<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (typeof raw !== "string" || !raw) return [];
  const set = new Set(allowed);
  return raw.split(",").filter((x): x is T => set.has(x as T));
}

export function parseIds(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  return raw.split(",").filter((x) => /^[a-z0-9_-]{1,64}$/i.test(x)).slice(0, 100);
}

export function parsePrefs(raw: string | undefined): CalendarPrefs {
  if (!raw) return {};
  try {
    const v = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const f = (v.filters ?? {}) as Record<string, unknown>;
    return {
      view: parseView(v.view),
      density: v.density === "compact" ? "compact" : v.density === "comfortable" ? "comfortable" : undefined,
      drawer: typeof v.drawer === "boolean" ? v.drawer : undefined,
      filters: {
        clients: Array.isArray(f.clients) ? parseIds(f.clients.join(",")) : [],
        platforms: Array.isArray(f.platforms) ? parseList(f.platforms.join(","), PLATFORMS) : [],
        statuses: Array.isArray(f.statuses)
          ? parseList(f.statuses.join(","), STATUS_FILTERS.map((s) => s.key))
          : [],
      },
    };
  } catch {
    return {};
  }
}

export function serializePrefs(prefs: CalendarPrefs): string {
  return encodeURIComponent(JSON.stringify(prefs));
}

/** The calendar URL for a view, anchor day (yyyy-MM-dd) and filters. */
export function calendarHref(view: CalendarView, anchor: string, f: CalendarFilters): string {
  const q = new URLSearchParams({ view, d: anchor });
  if (f.clients.length) q.set("c", f.clients.join(","));
  if (f.platforms.length) q.set("p", f.platforms.join(","));
  if (f.statuses.length) q.set("s", f.statuses.join(","));
  return `/calendar?${q.toString()}`;
}

export function activeFilterCount(f: CalendarFilters): number {
  return (f.clients.length ? 1 : 0) + (f.platforms.length ? 1 : 0) + (f.statuses.length ? 1 : 0);
}
