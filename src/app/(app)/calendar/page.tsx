import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  eachDayOfInterval,
  addMonths,
  addWeeks,
  format,
  isSameMonth,
  isSameDay,
} from "date-fns";
import type { Platform } from "@prisma/client";
import { getCalendarPosts } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";
import { ClientDot, PlatformIcon, StatusBadge } from "@/components/post-bits";
import { LinkedinIcon, InstagramIcon } from "@/components/platform-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

type CalPost = Awaited<ReturnType<typeof getCalendarPosts>>[number];
type View = "month" | "week" | "list";
type PlatformFilter = "LINKEDIN" | "INSTAGRAM" | undefined;

/** A single post chip inside a day cell. */
function PostChip({ p }: { p: CalPost }) {
  const editable = p.status === "DRAFT" || p.status === "SCHEDULED";
  const platforms = [...new Set(p.targets.map((t) => t.platform))] as Platform[];
  return (
    <Link
      href={editable ? `/composer?edit=${p.id}` : "/queue"}
      className="bg-accent hover:bg-accent/70 flex items-center gap-1 rounded border-l-2 px-1.5 py-1 text-xs transition-colors"
      style={{ borderLeftColor: p.client.color ?? "var(--primary)" }}
      title={p.body}
    >
      <span className="text-muted-foreground flex shrink-0 items-center gap-0.5">
        {platforms.map((pl) => (
          <PlatformIcon key={pl} platform={pl} className="size-3" />
        ))}
      </span>
      {p.scheduledAt && (
        <span className="text-muted-foreground hidden shrink-0 tabular-nums sm:inline">
          {format(p.scheduledAt, "h:mm a")}
        </span>
      )}
      <span className="truncate">{p.body}</span>
    </Link>
  );
}

/** One day cell used by both month and week grids. */
function DayCell({
  day,
  posts,
  base,
  maxVisible,
  minH,
}: {
  day: Date;
  posts: CalPost[];
  base: Date;
  maxVisible: number;
  minH: string;
}) {
  const dayPosts = posts.filter(
    (p) => p.scheduledAt && isSameDay(p.scheduledAt, day),
  );
  return (
    <div
      className={cn(
        "group bg-background relative p-1.5",
        minH,
        isSameMonth(day, base) ? "" : "opacity-40",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <Link
          href={`/composer?date=${format(day, "yyyy-MM-dd")}`}
          aria-label={`Schedule a post on ${format(day, "MMMM d")}`}
          className="text-muted-foreground hover:text-primary opacity-100 transition focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Plus className="size-3.5" />
        </Link>
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full text-xs",
            isSameDay(day, new Date())
              ? "bg-primary text-primary-foreground font-semibold"
              : "text-muted-foreground",
          )}
        >
          {format(day, "d")}
        </span>
      </div>
      <div className="space-y-1">
        {dayPosts.slice(0, maxVisible).map((p) => (
          <PostChip key={p.id} p={p} />
        ))}
        {dayPosts.length > maxVisible && (
          <div className="text-muted-foreground px-1 text-[10px]">
            +{dayPosts.length - maxVisible} more
          </div>
        )}
      </div>
    </div>
  );
}

function Grid({
  days,
  posts,
  base,
  maxVisible,
  minH,
}: {
  days: Date[];
  posts: CalPost[];
  base: Date;
  maxVisible: number;
  minH: string;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="bg-border grid min-w-160 grid-cols-7 gap-px overflow-hidden rounded-lg border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-muted text-muted-foreground py-2 text-center text-xs font-medium"
          >
            {d}
          </div>
        ))}
        {days.map((day) => (
          <DayCell
            key={day.toISOString()}
            day={day}
            posts={posts}
            base={base}
            maxVisible={maxVisible}
            minH={minH}
          />
        ))}
      </div>
    </div>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    m?: string;
    w?: string;
    platform?: string;
  }>;
}) {
  const { view: viewParam, m, w, platform: platformParam } = await searchParams;
  const view: View =
    viewParam === "week" || viewParam === "list" ? viewParam : "month";
  const platform: PlatformFilter =
    platformParam === "LINKEDIN" || platformParam === "INSTAGRAM"
      ? platformParam
      : undefined;
  const clientId = await getScopeClientId();

  // ---- Month view ----
  if (view === "month") {
    const offset = Number.parseInt(m ?? "0", 10) || 0;
    const base = addMonths(new Date(), offset);
    const gridStart = startOfWeek(startOfMonth(base));
    const gridEnd = endOfWeek(endOfMonth(base));
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const posts = await getCalendarPosts(gridStart, gridEnd, clientId, platform);

    return (
      <Shell
        view="month"
        title={format(base, "MMMM yyyy")}
        offset={offset}
        platform={platform}
      >
        <Grid days={days} posts={posts} base={base} maxVisible={3} minH="min-h-28" />
      </Shell>
    );
  }

  // ---- Week view ----
  if (view === "week") {
    const offset = Number.parseInt(w ?? "0", 10) || 0;
    const base = addWeeks(new Date(), offset);
    const gridStart = startOfWeek(base);
    const gridEnd = endOfWeek(base);
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const posts = await getCalendarPosts(gridStart, gridEnd, clientId, platform);

    return (
      <Shell
        view="week"
        title={`${format(gridStart, "MMM d")} – ${format(gridEnd, "MMM d, yyyy")}`}
        offset={offset}
        platform={platform}
      >
        <Grid days={days} posts={posts} base={base} maxVisible={8} minH="min-h-64" />
      </Shell>
    );
  }

  // ---- List view ----
  const from = startOfDay(new Date());
  const to = addMonths(from, 6);
  const posts = await getCalendarPosts(from, to, clientId, platform);
  const byDay = new Map<string, CalPost[]>();
  for (const p of posts) {
    if (!p.scheduledAt) continue;
    const key = format(p.scheduledAt, "yyyy-MM-dd");
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(p);
  }

  return (
    <Shell view="list" title="Upcoming" platform={platform}>
      {posts.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border py-12 text-center text-sm">
          Nothing scheduled in the next 6 months.
        </div>
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([key, dayPosts]) => (
            <div key={key}>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
                {format(new Date(key), "EEEE, MMMM d")}
              </h3>
              <ul className="divide-border divide-y rounded-lg border">
                {dayPosts.map((p) => {
                  const editable =
                    p.status === "DRAFT" || p.status === "SCHEDULED";
                  return (
                    <li key={p.id}>
                      <Link
                        href={editable ? `/composer?edit=${p.id}` : "/queue"}
                        className="hover:bg-accent flex items-center gap-3 px-3 py-2.5 text-sm transition-colors"
                      >
                        <span className="text-muted-foreground w-16 shrink-0 tabular-nums text-xs">
                          {p.scheduledAt ? format(p.scheduledAt, "h:mm a") : "—"}
                        </span>
                        <ClientDot color={p.client.color} />
                        <span className="w-28 shrink-0 truncate font-medium">
                          {p.client.name}
                        </span>
                        <span className="text-muted-foreground min-w-0 flex-1 truncate">
                          {p.body}
                        </span>
                        <StatusBadge status={p.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

/** Toolbar + view switcher wrapper shared by all three views. */
function Shell({
  view,
  title,
  offset,
  platform,
  children,
}: {
  view: View;
  title: string;
  offset?: number;
  platform?: PlatformFilter;
  children: React.ReactNode;
}) {
  const offsetParam = view === "week" ? "w" : "m";
  const platformQS = platform ? `&platform=${platform}` : "";
  const stepLink = (delta: number) =>
    `/calendar?view=${view}&${offsetParam}=${(offset ?? 0) + delta}${platformQS}`;
  // Switch platform while keeping the current view + period.
  const platformLink = (p: PlatformFilter) =>
    `/calendar?view=${view}&${offsetParam}=${offset ?? 0}${p ? `&platform=${p}` : ""}`;

  const views: { key: View; label: string }[] = [
    { key: "month", label: "Month" },
    { key: "week", label: "Week" },
    { key: "list", label: "List" },
  ];
  const platforms: { key: PlatformFilter; label: string; Icon?: typeof LinkedinIcon }[] = [
    { key: undefined, label: "All" },
    { key: "LINKEDIN", label: "LinkedIn", Icon: LinkedinIcon },
    { key: "INSTAGRAM", label: "Instagram", Icon: InstagramIcon },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Platform filter */}
          <div className="bg-muted flex rounded-lg p-0.5">
            {platforms.map((p) => {
              const active = platform === p.key;
              return (
                <Link
                  key={p.label}
                  href={platformLink(p.key)}
                  aria-label={p.label}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.Icon ? <p.Icon className="size-3.5" /> : p.label}
                </Link>
              );
            })}
          </div>

          <div className="bg-muted flex rounded-lg p-0.5">
            {views.map((v) => (
              <Link
                key={v.key}
                href={`/calendar?view=${v.key}${platformQS}`}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  view === v.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
              </Link>
            ))}
          </div>

          {view !== "list" && (
            <>
              <Button
                render={<Link href={stepLink(-1)} />}
                variant="ghost"
                size="icon"
                aria-label={view === "week" ? "Previous week" : "Previous month"}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                render={<Link href={`/calendar?view=${view}${platformQS}`} />}
                variant="ghost"
                size="sm"
              >
                Today
              </Button>
              <Button
                render={<Link href={stepLink(1)} />}
                variant="ghost"
                size="icon"
                aria-label={view === "week" ? "Next week" : "Next month"}
              >
                <ChevronRight className="size-4" />
              </Button>
            </>
          )}
          <Button render={<Link href="/composer" />} size="sm">
            <Plus className="size-4" /> New
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
