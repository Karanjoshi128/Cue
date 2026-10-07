import Link from "next/link";
import {
  addDays,
  differenceInCalendarWeeks,
  format,
  isToday,
  isTomorrow,
  startOfDay,
} from "date-fns";
import type { Platform } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Spotlight } from "@/components/fx/spotlight";
import { NumberTicker } from "@/components/fx/number-ticker";
import { Countdown } from "@/components/fx/countdown";
import { LiveClock } from "@/components/fx/live-clock";
import { getDashboardStats } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";
import { getCurrentUser } from "@/lib/auth";
import { getTimeZone } from "@/lib/timezone-server";
import { zoned } from "@/lib/timezone";
import {
  ClientDot,
  ClientMonogram,
  PlatformIcon,
  PLATFORM_META,
} from "@/components/post-bits";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  PenLine,
  Plus,
  Unplug,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const clientId = await getScopeClientId();
  const [user, stats, timeZone] = await Promise.all([
    getCurrentUser(),
    getDashboardStats(clientId),
    getTimeZone(),
  ]);
  const ctx = { in: zoned(timeZone) };
  const {
    clients,
    scheduled,
    published,
    failed,
    expiring,
    drafts,
    pending,
    upcoming,
    clientList,
    horizon,
    accounts,
  } = stats;

  const now = new Date();
  const hour = Number(format(now, "H", ctx));
  const greeting =
    hour < 5
      ? "Working late"
      : hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";
  const firstName = (user?.name?.trim() || user?.email || "")
    .split(/[@ ]/)[0]
    .replace(/^./, (c) => c.toUpperCase());

  const whenLabel = (d: Date) =>
    isToday(d, ctx)
      ? `Today · ${format(d, "h:mm a", ctx)}`
      : isTomorrow(d, ctx)
        ? `Tomorrow · ${format(d, "h:mm a", ctx)}`
        : format(d, "EEE d MMM · h:mm a", ctx);

  const summary =
    scheduled === 0
      ? "Nothing is on standby yet. Write a post and give it a time, and Cue takes it from there."
      : `${scheduled} post${scheduled === 1 ? "" : "s"} on standby${
          !clientId && clients > 1 ? ` across ${clients} clients` : ""
        }.${failed > 0 ? ` ${failed} ${failed === 1 ? "needs" : "need"} a retry.` : ""}`;

  const next = upcoming[0];
  const rest = upcoming.slice(next ? 1 : 0);

  // Two-week strip, bucketed by the viewer's calendar day.
  const today = startOfDay(now, ctx);
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i, ctx);
    const key = format(day, "yyyy-MM-dd", ctx);
    return {
      day,
      key,
      posts: horizon.filter(
        (p) => p.scheduledAt && format(p.scheduledAt, "yyyy-MM-dd", ctx) === key,
      ),
    };
  });
  const busiest = Math.max(1, ...days.map((d) => d.posts.length));

  const tiles = [
    {
      label: "On standby",
      caption: "Scheduled to publish",
      value: scheduled,
      href: "/queue?status=SCHEDULED",
      tone: "text-standby",
    },
    {
      label: "Gone live",
      caption: "Published, all time",
      value: published,
      href: "/queue?status=PUBLISHED",
      tone: "text-live",
    },
    {
      label: "Faults",
      caption: failed ? "Need a retry" : "Nothing failed",
      value: failed,
      href: "/queue?status=FAILED",
      tone: "text-fault",
    },
    {
      label: clientId ? "Client" : "Clients",
      caption: `${accounts} account${accounts === 1 ? "" : "s"} connected`,
      value: clients,
      href: "/clients",
      tone: "text-primary",
    },
  ];

  const attention = [
    failed > 0 && {
      label: "Failed to publish",
      hint: "Open the queue and retry",
      value: failed,
      href: "/queue?status=FAILED",
      icon: AlertTriangle,
      tone: "text-fault-ink bg-fault/10",
    },
    expiring > 0 && {
      label: "Accounts to reconnect",
      hint: "Expiring soon or disconnected",
      value: expiring,
      href: "/clients",
      icon: Unplug,
      tone: "text-standby-ink bg-standby/12",
    },
    pending > 0 && {
      label: "Awaiting approval",
      hint: "Review before it goes out",
      value: pending,
      href: "/queue",
      icon: Clock,
      tone: "text-primary bg-primary/10",
    },
    drafts > 0 && {
      label: "Drafts",
      hint: "Finish and schedule",
      value: drafts,
      href: "/queue?status=DRAFT",
      icon: PenLine,
      tone: "text-muted-foreground bg-muted",
    },
  ].filter(Boolean) as {
    label: string;
    hint: string;
    value: number;
    href: string;
    icon: typeof PenLine;
    tone: string;
  }[];

  const setup = [
    { done: clients > 0, label: "Add your first client", href: "/clients" },
    {
      done: accounts > 0,
      label: "Connect a LinkedIn, Instagram or YouTube account",
      href: "/clients",
    },
    {
      done: scheduled + published + drafts > 0,
      label: "Write and schedule a post",
      href: "/composer",
    },
  ];
  const setupDone = setup.filter((s) => s.done).length;
  const showSetup = !clientId && setupDone < setup.length;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow={
          <>
            <span className="tally text-live" data-live="true" />
            <span>{format(now, "EEE d MMM", ctx)}</span>
            <span className="text-border">/</span>
            <LiveClock />
          </>
        }
        title={
          <>
            {greeting}
            {firstName ? (
              <>
                , <em>{firstName}.</em>
              </>
            ) : (
              "."
            )}
          </>
        }
        description={summary}
        actions={
          <>
            <Button render={<Link href="/calendar" />} variant="outline">
              <CalendarDays /> Calendar
            </Button>
            <Button render={<Link href="/composer" />}>
              <Plus /> New post
            </Button>
          </>
        }
      />

      {showSetup && (
        <section className="bg-card relative overflow-hidden rounded-2xl border p-6 sm:p-7">
          <div
            aria-hidden
            className="bg-dots pointer-events-none absolute inset-y-0 right-0 w-1/2 mask-[linear-gradient(to_left,black,transparent)]"
          />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-md space-y-2">
              <div className="label-caps">
                Setup · {setupDone} of {setup.length}
              </div>
              <h2 className="headline text-2xl">
                Three cues and you&apos;re <em>live.</em>
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Cue publishes for you once a client has a connected account and
                something on the schedule.
              </p>
            </div>
            <ol className="w-full max-w-md space-y-2">
              {setup.map((s, i) => (
                <li key={s.label}>
                  <Link
                    href={s.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors",
                      s.done
                        ? "bg-muted/40 text-muted-foreground"
                        : "bg-background hover:border-primary/40",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full font-mono text-[0.6875rem]",
                        s.done
                          ? "bg-live text-white"
                          : "shadow-[inset_0_0_0_1px_var(--border)]",
                      )}
                    >
                      {s.done ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className={cn("flex-1", s.done && "line-through")}>
                      {s.label}
                    </span>
                    {!s.done && (
                      <ArrowRight className="text-muted-foreground group-hover:text-primary size-4 transition-transform group-hover:translate-x-0.5" />
                    )}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Next cue + stats */}
      <div className="grid gap-4 lg:grid-cols-12">
        {next?.scheduledAt ? (
          <Link
            href={`/composer?edit=${next.id}`}
            className="group border-beam bg-card relative isolate flex min-h-72 flex-col overflow-hidden rounded-2xl border p-6 [--beam-duration:9s] sm:p-7 lg:col-span-7"
          >
            <div
              aria-hidden
              className="bg-grid pointer-events-none absolute inset-0 -z-10 mask-[radial-gradient(ellipse_at_top_right,black,transparent_65%)]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-24 -z-10 size-72 rounded-full opacity-25 blur-3xl"
              style={{ backgroundColor: next.client.color ?? "var(--primary)" }}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="label-caps flex items-center gap-2">
                <span className="tally text-standby" data-live="true" />
                Next cue
              </span>
              <span className="flex items-center gap-1.5">
                {[...new Set(next.targets.map((t) => t.platform))].map((p) => (
                  <span
                    key={p}
                    title={PLATFORM_META[p as Platform].label}
                    className="bg-background grid size-7 place-items-center rounded-lg shadow-[0_0_0_1px_var(--border)]"
                  >
                    <PlatformIcon platform={p as Platform} brand className="size-3.5" />
                  </span>
                ))}
              </span>
            </div>

            <Countdown
              to={next.scheduledAt}
              className="mt-6 block text-5xl leading-none font-medium tracking-[-0.04em] sm:text-6xl"
            />
            <div className="text-muted-foreground mt-3 font-mono text-xs tracking-wide uppercase">
              {whenLabel(next.scheduledAt)}
            </div>

            <div className="mt-auto flex items-end gap-4 pt-8">
              <ClientMonogram name={next.client.name} color={next.client.color} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{next.client.name}</div>
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm leading-relaxed">
                  {next.title || next.body}
                </p>
              </div>
              <span className="bg-foreground text-background hidden size-9 shrink-0 place-items-center rounded-full transition-transform group-hover:-rotate-45 sm:grid">
                <ArrowRight className="size-4" />
              </span>
            </div>
          </Link>
        ) : (
          <div className="bg-card relative isolate flex min-h-72 flex-col items-start justify-end overflow-hidden rounded-2xl border p-7 lg:col-span-7">
            <div
              aria-hidden
              className="bg-grid pointer-events-none absolute inset-0 -z-10 mask-[radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
            />
            <span className="label-caps flex items-center gap-2">
              <span className="tally text-muted-foreground/40" />
              Next cue
            </span>
            <h2 className="headline mt-3 text-3xl">
              The stage is <em>clear.</em>
            </h2>
            <p className="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">
              No posts are scheduled. Line one up and a live countdown will
              appear here.
            </p>
            <Button render={<Link href="/composer" />} className="mt-5">
              <Plus /> Schedule a post
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:col-span-5">
          {tiles.map((t) => (
            <Spotlight key={t.label} className="rounded-2xl">
              <Link
                href={t.href}
                className="bg-card group flex h-full min-h-34 flex-col justify-between rounded-2xl border p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="label-caps flex items-center gap-1.5">
                    <span className={cn("tally size-1.5", t.tone)} />
                    {t.label}
                  </span>
                  <ArrowUpRight className="text-muted-foreground size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div>
                  <NumberTicker
                    value={t.value}
                    className="headline block text-[2.75rem] leading-none"
                  />
                  <div className="text-muted-foreground mt-1.5 text-xs">
                    {t.caption}
                  </div>
                </div>
              </Link>
            </Spotlight>
          ))}
        </div>
      </div>

      {/* Two-week cue stack */}
      <section className="bg-card rounded-2xl border p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">
              The next two weeks
            </h2>
            <p className="text-muted-foreground text-xs">
              Each mark is a post, in its client&apos;s colour. Click a day to
              open that week.
            </p>
          </div>
          <span className="label-caps">
            {format(days[0].day, "d MMM", ctx)} to{" "}
            {format(days[13].day, "d MMM", ctx)}
          </span>
        </div>
        <div className="scrollbar-none -mx-1 mt-5 overflow-x-auto px-1">
          <ol className="grid min-w-[42rem] grid-cols-14 gap-1.5">
            {days.map(({ day, key, posts }, i) => {
              const weekend = ["Sat", "Sun"].includes(format(day, "EEE", ctx));
              const week = differenceInCalendarWeeks(day, now, ctx);
              return (
                <li key={key}>
                  <Link
                    href={
                      posts.length
                        ? `/calendar?view=week&w=${week}`
                        : `/composer?date=${key}`
                    }
                    title={`${format(day, "EEEE d MMMM", ctx)}: ${posts.length} post${posts.length === 1 ? "" : "s"}`}
                    className={cn(
                      "group hover:border-primary/40 flex h-36 flex-col rounded-xl border p-2 transition-colors",
                      i === 0
                        ? "border-primary/50 bg-primary/[0.04]"
                        : weekend
                          ? "bg-muted/50"
                          : "bg-background",
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono text-[0.625rem] tracking-wider uppercase",
                        i === 0 ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {i === 0 ? "Today" : format(day, "EEE", ctx)}
                    </span>
                    <span className="mt-0.5 text-sm font-semibold tabular-nums">
                      {format(day, "d", ctx)}
                    </span>
                    <span className="mt-auto flex flex-col-reverse gap-[3px]">
                      {posts.slice(0, 6).map((p) => (
                        <span
                          key={p.id}
                          className={cn(
                            "h-[5px] rounded-full",
                            p.status !== "SCHEDULED" && "opacity-40",
                          )}
                          style={{
                            backgroundColor: p.client.color ?? "var(--primary)",
                            width: `${55 + (45 * posts.length) / busiest}%`,
                          }}
                        />
                      ))}
                      {posts.length > 6 && (
                        <span className="text-muted-foreground font-mono text-[0.625rem]">
                          +{posts.length - 6}
                        </span>
                      )}
                      {posts.length === 0 && (
                        <Plus className="text-muted-foreground/0 group-hover:text-primary size-3.5 transition-colors" />
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Run of show */}
        <section className="bg-card rounded-2xl border lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
            <div>
              <h2 className="text-[0.9375rem] font-semibold tracking-tight">
                Run of show
              </h2>
              <p className="text-muted-foreground text-xs">
                What&apos;s scheduled after the next cue, in order.
              </p>
            </div>
            <Link
              href="/calendar?view=list"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
            >
              Full schedule <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
          {rest.length === 0 ? (
            <div className="text-muted-foreground px-6 py-14 text-center text-sm">
              {next
                ? "Only the next cue is scheduled so far."
                : "Nothing scheduled yet."}{" "}
              <Link href="/composer" className="text-primary font-medium hover:underline">
                Add a post
              </Link>
            </div>
          ) : (
            <ol className="relative mt-3 pb-3">
              {rest.map((post) => {
                const platforms = [
                  ...new Set(post.targets.map((t) => t.platform)),
                ] as Platform[];
                return (
                  <li key={post.id} className="group/item">
                    <Link
                      href={`/composer?edit=${post.id}`}
                      className="hover:bg-accent/60 group grid grid-cols-[4.5rem_1rem_1fr] items-start gap-x-3 px-5 py-3 transition-colors sm:grid-cols-[6.5rem_1rem_1fr_auto] sm:px-6"
                    >
                      <span className="pt-0.5 font-mono text-[0.6875rem] leading-tight tracking-wide uppercase">
                        <span className="text-foreground block">
                          {post.scheduledAt
                            ? isToday(post.scheduledAt, ctx)
                              ? "Today"
                              : isTomorrow(post.scheduledAt, ctx)
                                ? "Tomorrow"
                                : format(post.scheduledAt, "EEE d MMM", ctx)
                            : "-"}
                        </span>
                        <span className="text-muted-foreground">
                          {post.scheduledAt
                            ? format(post.scheduledAt, "h:mm a", ctx)
                            : ""}
                        </span>
                      </span>
                      <span className="relative flex h-full justify-center">
                        <span className="bg-border absolute -top-3 -bottom-3 w-px group-first/item:top-2 group-last/item:bottom-auto group-last/item:h-5" />
                        <ClientDot
                          color={post.client.color}
                          className="ring-card relative mt-1 ring-4"
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span className="truncate">{post.client.name}</span>
                          <span className="text-muted-foreground flex items-center gap-1">
                            {platforms.map((p) => (
                              <PlatformIcon key={p} platform={p} className="size-3" />
                            ))}
                          </span>
                        </span>
                        <span className="text-muted-foreground mt-0.5 line-clamp-1 text-sm">
                          {post.title || post.body}
                        </span>
                      </span>
                      <ArrowRight className="text-muted-foreground mt-1 hidden size-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 sm:block" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <div className="space-y-4">
          {/* Needs attention */}
          <section className="bg-card rounded-2xl border p-5">
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">
              Needs attention
            </h2>
            {attention.length === 0 ? (
              <div className="mt-4 flex items-center gap-3 rounded-xl bg-[color-mix(in_oklch,var(--live)_8%,transparent)] px-3.5 py-3 text-sm">
                <CheckCircle2 className="text-live size-5 shrink-0" />
                <span>
                  <span className="font-medium">All clear.</span>{" "}
                  <span className="text-muted-foreground">
                    Nothing is waiting on you.
                  </span>
                </span>
              </div>
            ) : (
              <ul className="mt-3 space-y-1">
                {attention.map((a) => (
                  <li key={a.label}>
                    <Link
                      href={a.href}
                      className="hover:bg-accent/60 -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors"
                    >
                      <span
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-lg",
                          a.tone,
                        )}
                      >
                        <a.icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {a.label}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {a.hint}
                        </span>
                      </span>
                      <span className="font-mono text-sm font-medium tabular-nums">
                        {a.value}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Roster */}
          <section className="bg-card rounded-2xl border p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[0.9375rem] font-semibold tracking-tight">
                {clientId ? "This client" : "Roster"}
              </h2>
              <Link
                href="/clients"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
              >
                Manage <ArrowUpRight className="size-3.5" />
              </Link>
            </div>
            {clientList.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">
                No clients yet.{" "}
                <Link href="/clients" className="text-primary font-medium hover:underline">
                  Add one
                </Link>
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {clientList.map((c) => {
                  const max = Math.max(1, ...clientList.map((x) => x.scheduled));
                  return (
                    <li key={c.id} className="flex items-center gap-3">
                      <ClientMonogram
                        name={c.name}
                        color={c.color}
                        className="size-7 rounded-lg text-[0.625rem]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{c.name}</span>
                          <span className="text-muted-foreground shrink-0 font-mono text-[0.6875rem]">
                            {c.scheduled} queued
                          </span>
                        </div>
                        <div className="bg-muted mt-1.5 h-1 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(c.scheduled / max) * 100}%`,
                              backgroundColor: c.color ?? "var(--primary)",
                            }}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
