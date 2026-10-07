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
  isToday,
  isTomorrow,
} from "date-fns";
import type { Platform } from "@prisma/client";
import { getCalendarPosts } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";
import { getTimeZone } from "@/lib/timezone-server";
import { zoned } from "@/lib/timezone";
import {
  ClientMonogram,
  PlatformIcon,
  StatusBadge,
  StatusDot,
} from "@/components/post-bits";
import {
  LinkedinIcon,
  InstagramIcon,
  YoutubeIcon,
} from "@/components/platform-icons";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, ChevronLeft, ChevronRight, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

type CalPost = Awaited<ReturnType<typeof getCalendarPosts>>[number];
type View = "month" | "week" | "list";
type PlatformFilter = "LINKEDIN" | "INSTAGRAM" | "YOUTUBE" | undefined;
type Ctx = { in: ReturnType<typeof zoned> };

const tint = (color: string | null) =>
  `color-mix(in oklch, ${color ?? "var(--primary)"} 11%, var(--card))`;

/** A single post chip inside a day cell. */
function PostChip({ p, ctx }: { p: CalPost; ctx: Ctx }) {
  const editable = p.status === "DRAFT" || p.status === "SCHEDULED";
  const platforms = [
    ...new Set(p.targets.map((t) => t.platform)),
  ] as Platform[];
  return (
    <Link
      href={editable ? `/composer?edit=${p.id}` : "/queue"}
      className={cn(
        "group/chip flex items-center gap-1.5 rounded-md py-1 pr-1.5 pl-2 text-[0.6875rem] leading-tight shadow-[inset_2px_0_0_0_var(--chip)] transition-[filter] hover:brightness-[0.97] dark:hover:brightness-125",
        p.status === "PUBLISHED" && "opacity-60",
      )}
      style={
        {
          "--chip": p.client.color ?? "var(--primary)",
          backgroundColor: tint(p.client.color),
        } as React.CSSProperties
      }
      title={`${p.client.name}: ${p.title || p.body}`}
    >
      {p.status !== "SCHEDULED" && <StatusDot status={p.status} />}
      {p.scheduledAt && (
        <span className="text-muted-foreground hidden shrink-0 font-mono tabular-nums sm:inline">
          {format(p.scheduledAt, "h:mmaaaaa", ctx)}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-medium">
        {p.title || p.body}
      </span>
      <span className="text-muted-foreground hidden shrink-0 items-center gap-0.5 xl:flex">
        {platforms.map((pl) => (
          <PlatformIcon key={pl} platform={pl} className="size-2.5" />
        ))}
      </span>
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
  ctx,
  week,
}: {
  day: Date;
  posts: CalPost[];
  base: Date;
  maxVisible: number;
  minH: string;
  ctx: Ctx;
  week: boolean;
}) {
  const dayPosts = posts.filter(
    (p) => p.scheduledAt && isSameDay(p.scheduledAt, day, ctx),
  );
  const inMonth = week || isSameMonth(day, base, ctx);
  const today = isToday(day, ctx);
  const weekend = ["Sat", "Sun"].includes(format(day, "EEE", ctx));
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1 p-1.5 sm:p-2",
        minH,
        // Opaque fills only: the grid's 1px gaps are the parent's border
        // colour, so a translucent cell would read as grey.
        inMonth
          ? weekend
            ? "bg-[color-mix(in_oklch,var(--card),var(--muted)_55%)]"
            : "bg-card"
          : "bg-[color-mix(in_oklch,var(--card),var(--muted)_85%)]",
      )}
    >
      {!inMonth && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-50 bg-[repeating-linear-gradient(135deg,var(--grid-line)_0_1px,transparent_1px_7px)]"
        />
      )}
      <div className="relative flex items-center justify-between">
        <span
          className={cn(
            "grid h-6 min-w-6 place-items-center rounded-full px-1 font-mono text-xs tabular-nums",
            today
              ? "bg-primary text-primary-foreground font-semibold"
              : inMonth
                ? "text-foreground"
                : "text-muted-foreground/60",
          )}
        >
          {format(day, "d", ctx)}
        </span>
        {week && (
          <span className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">
            {format(day, "EEE", ctx)}
          </span>
        )}
        <Link
          href={`/composer?date=${format(day, "yyyy-MM-dd", ctx)}`}
          aria-label={`Schedule a post on ${format(day, "MMMM d", ctx)}`}
          className="text-muted-foreground hover:text-primary hover:bg-card grid size-6 place-items-center rounded-md opacity-100 transition focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Plus className="size-3.5" />
        </Link>
      </div>
      <div className="relative space-y-1">
        {dayPosts.slice(0, maxVisible).map((p) => (
          <PostChip key={p.id} p={p} ctx={ctx} />
        ))}
        {dayPosts.length > maxVisible && (
          <Link
            href={`/calendar?view=list`}
            className="text-muted-foreground hover:text-foreground block px-1 font-mono text-[0.625rem]"
          >
            +{dayPosts.length - maxVisible} more
          </Link>
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
  ctx,
  week = false,
}: {
  days: Date[];
  posts: CalPost[];
  base: Date;
  maxVisible: number;
  minH: string;
  ctx: Ctx;
  week?: boolean;
}) {
  return (
    <div className="bg-card overflow-x-auto rounded-2xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.04)]">
      <div className="bg-border grid min-w-180 grid-cols-7 gap-px">
        {!week &&
          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="bg-card text-muted-foreground px-2 py-2.5 font-mono text-[0.625rem] font-medium tracking-widest uppercase"
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
            ctx={ctx}
            week={week}
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
    platformParam === "LINKEDIN" ||
    platformParam === "INSTAGRAM" ||
    platformParam === "YOUTUBE"
      ? platformParam
      : undefined;
  const [clientId, timeZone] = await Promise.all([
    getScopeClientId(),
    getTimeZone(),
  ]);
  // Every day boundary is the viewer's, not the server's (UTC on Vercel).
  const ctx: Ctx = { in: zoned(timeZone) };

  // ---- Month view ----
  if (view === "month") {
    const offset = Number.parseInt(m ?? "0", 10) || 0;
    const base = addMonths(new Date(), offset, ctx);
    const gridStart = startOfWeek(startOfMonth(base, ctx), ctx);
    const gridEnd = endOfWeek(endOfMonth(base, ctx), ctx);
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd }, ctx);
    const posts = await getCalendarPosts(
      gridStart,
      gridEnd,
      clientId,
      platform,
    );

    return (
      <Shell
        view="month"
        title={
          <>
            {format(base, "MMMM", ctx)} <em>{format(base, "yyyy", ctx)}</em>
          </>
        }
        count={posts.length}
        offset={offset}
        platform={platform}
      >
        <Grid
          days={days}
          posts={posts}
          base={base}
          maxVisible={3}
          minH="min-h-32"
          ctx={ctx}
        />
      </Shell>
    );
  }

  // ---- Week view ----
  if (view === "week") {
    const offset = Number.parseInt(w ?? "0", 10) || 0;
    const base = addWeeks(new Date(), offset, ctx);
    const gridStart = startOfWeek(base, ctx);
    const gridEnd = endOfWeek(base, ctx);
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd }, ctx);
    const posts = await getCalendarPosts(
      gridStart,
      gridEnd,
      clientId,
      platform,
    );

    return (
      <Shell
        view="week"
        title={
          <>
            {format(gridStart, "d MMM", ctx)} <em>to</em>{" "}
            {format(gridEnd, "d MMM", ctx)}
          </>
        }
        count={posts.length}
        offset={offset}
        platform={platform}
      >
        <Grid
          days={days}
          posts={posts}
          base={base}
          maxVisible={10}
          minH="min-h-96"
          ctx={ctx}
          week
        />
      </Shell>
    );
  }

  // ---- List view ----
  const from = startOfDay(new Date(), ctx);
  const to = addMonths(from, 6, ctx);
  const posts = await getCalendarPosts(from, to, clientId, platform);
  const byDay = new Map<string, CalPost[]>();
  for (const p of posts) {
    if (!p.scheduledAt) continue;
    const key = format(p.scheduledAt, "yyyy-MM-dd", ctx);
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(p);
  }

  return (
    <Shell
      view="list"
      title={
        <>
          Coming <em>up</em>
        </>
      }
      count={posts.length}
      platform={platform}
    >
      {posts.length === 0 ? (
        <div className="bg-card relative overflow-hidden rounded-2xl border px-6 py-20 text-center">
          <div
            aria-hidden
            className="bg-grid pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_at_center,black,transparent_70%)]"
          />
          <p className="headline relative text-2xl">
            Nothing in the next <em>six months.</em>
          </p>
          <Button render={<Link href="/composer" />} className="relative mt-5">
            <Plus /> Schedule a post
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {[...byDay.entries()].map(([key, dayPosts]) => {
            const day = dayPosts[0].scheduledAt!;
            return (
              <section key={key} className="grid gap-3 md:grid-cols-[9rem_1fr]">
                <div className="md:sticky md:top-20 md:self-start">
                  <div className="label-caps">
                    {isToday(day, ctx)
                      ? "Today"
                      : isTomorrow(day, ctx)
                        ? "Tomorrow"
                        : format(day, "EEEE", ctx)}
                  </div>
                  <div className="headline mt-1 text-2xl">
                    {format(day, "d MMM", ctx)}
                  </div>
                </div>
                <ul className="bg-card divide-border divide-y overflow-hidden rounded-2xl border">
                  {dayPosts.map((p) => {
                    const editable =
                      p.status === "DRAFT" || p.status === "SCHEDULED";
                    const platforms = [
                      ...new Set(p.targets.map((t) => t.platform)),
                    ] as Platform[];
                    return (
                      <li key={p.id}>
                        <Link
                          href={editable ? `/composer?edit=${p.id}` : "/queue"}
                          className="hover:bg-accent/50 group flex items-center gap-4 px-4 py-3.5 transition-colors"
                        >
                          <span className="w-16 shrink-0 font-mono text-xs tabular-nums">
                            {p.scheduledAt ? format(p.scheduledAt, "h:mm a", ctx) : "-"}
                          </span>
                          <ClientMonogram
                            name={p.client.name}
                            color={p.client.color}
                            className="size-8 rounded-lg text-[0.625rem]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 text-sm font-medium">
                              <span className="truncate">{p.client.name}</span>
                              <span className="text-muted-foreground flex gap-1">
                                {platforms.map((pl) => (
                                  <PlatformIcon key={pl} platform={pl} className="size-3" />
                                ))}
                              </span>
                            </span>
                            <span className="text-muted-foreground line-clamp-1 text-sm">
                              {p.title || p.body}
                            </span>
                          </span>
                          <StatusBadge status={p.status} className="hidden sm:inline-flex" />
                          <ArrowRight className="text-muted-foreground size-4 shrink-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

const segmented =
  "bg-muted flex items-center gap-0.5 rounded-lg p-0.5";
const segment = (active: boolean) =>
  cn(
    "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
    active
      ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_0_rgb(20_20_40/0.06)]"
      : "text-muted-foreground hover:text-foreground",
  );

/** Header, toolbar and view switcher shared by all three views. */
function Shell({
  view,
  title,
  count,
  offset,
  platform,
  children,
}: {
  view: View;
  title: React.ReactNode;
  count: number;
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
  const platforms: {
    key: PlatformFilter;
    label: string;
    Icon?: typeof LinkedinIcon;
  }[] = [
    { key: undefined, label: "All" },
    { key: "LINKEDIN", label: "LinkedIn", Icon: LinkedinIcon },
    { key: "INSTAGRAM", label: "Instagram", Icon: InstagramIcon },
    { key: "YOUTUBE", label: "YouTube", Icon: YoutubeIcon },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow={
          <>
            Calendar
            <span className="text-border">/</span>
            {count} post{count === 1 ? "" : "s"}
            {platform ? ` on ${platforms.find((p) => p.key === platform)?.label}` : ""}
          </>
        }
        title={title}
        actions={
          <>
            {view !== "list" && (
              <div className="flex items-center gap-1">
                <Button
                  render={<Link href={stepLink(-1)} />}
                  variant="outline"
                  size="icon"
                  aria-label={view === "week" ? "Previous week" : "Previous month"}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  render={<Link href={`/calendar?view=${view}${platformQS}`} />}
                  variant="outline"
                >
                  Today
                </Button>
                <Button
                  render={<Link href={stepLink(1)} />}
                  variant="outline"
                  size="icon"
                  aria-label={view === "week" ? "Next week" : "Next month"}
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
            <Button render={<Link href="/composer" />}>
              <Plus /> New post
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={segmented} role="group" aria-label="View">
          {views.map((v) => (
            <Link
              key={v.key}
              href={`/calendar?view=${v.key}${platformQS}`}
              aria-current={view === v.key ? "page" : undefined}
              className={segment(view === v.key)}
            >
              {v.label}
            </Link>
          ))}
        </div>
        <div className={segmented} role="group" aria-label="Network">
          {platforms.map((p) => {
            const active = platform === p.key;
            return (
              <Link
                key={p.label}
                href={platformLink(p.key)}
                aria-label={p.label}
                aria-pressed={active}
                className={segment(active)}
              >
                {p.Icon ? <p.Icon className="size-3.5" /> : null}
                <span className={cn(p.Icon && "hidden md:inline")}>{p.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
