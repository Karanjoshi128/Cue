import { cookies } from "next/headers";
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { TZDate } from "@date-fns/tz";
import { getCalendarPosts, getClientOptions, getUnscheduledPosts } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";
import { getTimeZone } from "@/lib/timezone-server";
import { zoned } from "@/lib/timezone";
import {
  CAL_COOKIE,
  PLATFORMS,
  STATUS_FILTERS,
  parseIds,
  parseList,
  parsePrefs,
  parseView,
  type CalendarFilters,
} from "@/lib/calendar-shared";
import { CalendarBoard } from "@/components/calendar/calendar-board";

export const dynamic = "force-dynamic";

type Search = {
  view?: string;
  d?: string;
  c?: string;
  p?: string;
  s?: string;
  post?: string;
  // Older links (the dashboard's week strip): offsets from today.
  w?: string;
  m?: string;
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [scopeClientId, timeZone, jar, clients] = await Promise.all([
    getScopeClientId(),
    getTimeZone(),
    cookies(),
    getClientOptions(),
  ]);
  const ctx = { in: zoned(timeZone) };
  const prefs = parsePrefs(jar.get(CAL_COOKIE)?.value);

  // The URL wins; with none of it, fall back to what this browser used last.
  const fromUrl = ["view", "c", "p", "s"].some((k) => sp[k as keyof Search] !== undefined);
  const view = parseView(sp.view) ?? (fromUrl ? undefined : prefs.view) ?? "week";
  const saved: CalendarFilters = prefs.filters ?? { clients: [], platforms: [], statuses: [] };
  const known = new Set(clients.map((c) => c.id));
  const filters: CalendarFilters = fromUrl
    ? {
        clients: parseIds(sp.c).filter((id) => known.has(id)),
        platforms: parseList(sp.p, PLATFORMS),
        statuses: parseList(sp.s, STATUS_FILTERS.map((s) => s.key)),
      }
    : { ...saved, clients: saved.clients.filter((id) => known.has(id)) };
  // The topbar switcher narrows every page to one client; the calendar follows.
  const scopeClient = scopeClientId ? clients.find((c) => c.id === scopeClientId) : undefined;
  const effective: CalendarFilters = scopeClient ? { ...filters, clients: [scopeClient.id] } : filters;

  // Anchor day, in the viewer's zone (noon, clear of DST edges).
  const today = TZDate.tz(timeZone);
  let anchor: Date = today;
  if (sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d)) {
    const [y, mo, da] = sp.d.split("-").map(Number);
    anchor = new TZDate(y, mo - 1, da, 12, 0, timeZone);
  } else if (sp.w && /^-?\d{1,3}$/.test(sp.w)) {
    anchor = addWeeks(today, Number(sp.w), ctx);
  } else if (sp.m && /^-?\d{1,3}$/.test(sp.m)) {
    anchor = addMonths(today, Number(sp.m), ctx);
  }
  const anchorKey = format(anchor, "yyyy-MM-dd", ctx);

  let from: Date;
  let to: Date;
  if (view === "week") {
    from = startOfWeek(anchor, ctx);
    to = endOfWeek(anchor, ctx);
  } else if (view === "month") {
    from = startOfWeek(startOfMonth(anchor, ctx), ctx);
    to = endOfWeek(endOfMonth(anchor, ctx), ctx);
  } else {
    from = startOfDay(anchor, ctx);
    to = addMonths(from, 6, ctx);
  }

  const [posts, unscheduled] = await Promise.all([
    getCalendarPosts(from, to, effective),
    getUnscheduledPosts(effective.clients),
  ]);

  const days =
    view === "list"
      ? [...new Set(posts.filter((p) => p.scheduledAt).map((p) => format(new Date(p.scheduledAt!), "yyyy-MM-dd", ctx)))]
      : eachDayOfInterval({ start: from, end: to }, ctx).map((d) => format(d, "yyyy-MM-dd", ctx));

  return (
    <CalendarBoard
      view={view}
      anchor={anchorKey}
      days={days}
      posts={posts}
      unscheduled={unscheduled}
      clients={clients}
      filters={effective}
      savedClients={filters.clients}
      scopeClient={scopeClient}
      timeZone={timeZone}
      nowIso={new Date().toISOString()}
      density={prefs.density ?? "comfortable"}
      drawer={prefs.drawer ?? false}
      openPostId={sp.post && /^[a-z0-9_-]{1,64}$/i.test(sp.post) ? sp.post : undefined}
    />
  );
}
