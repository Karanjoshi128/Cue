import Link from "next/link";
import { format, isToday, isTomorrow } from "date-fns";
import type { Platform } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDashboardStats } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";
import { getCurrentUser } from "@/lib/auth";
import { ClientDot, PlatformIcon } from "@/components/post-bits";
import {
  Users,
  CalendarClock,
  CalendarDays,
  Send,
  AlertTriangle,
  Plus,
  PenLine,
  Clock,
  Unplug,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

function whenLabel(d: Date): string {
  if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Tomorrow, ${format(d, "h:mm a")}`;
  return format(d, "EEE, MMM d · h:mm a");
}

export default async function DashboardPage() {
  const clientId = await getScopeClientId();
  const [user, stats] = await Promise.all([
    getCurrentUser(),
    getDashboardStats(clientId),
  ]);
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
  } = stats;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name ?? user?.email ?? "").split(/[@ ]/)[0];

  const statCards = [
    {
      label: "Clients",
      value: clients,
      icon: Users,
      href: "/clients",
      tint: "bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
    },
    {
      label: "Scheduled",
      value: scheduled,
      icon: CalendarClock,
      href: "/queue?status=SCHEDULED",
      tint: "bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300",
    },
    {
      label: "Published",
      value: published,
      icon: Send,
      href: "/queue?status=PUBLISHED",
      tint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300",
    },
    {
      label: "Failed",
      value: failed,
      icon: AlertTriangle,
      href: "/queue?status=FAILED",
      tint: "bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300",
    },
  ];

  const attention = [
    drafts > 0 && {
      label: "Drafts",
      value: drafts,
      href: "/queue?status=DRAFT",
      icon: PenLine,
    },
    pending > 0 && {
      label: "Awaiting approval",
      value: pending,
      href: "/queue",
      icon: Clock,
    },
    failed > 0 && {
      label: "Failed to publish",
      value: failed,
      href: "/queue?status=FAILED",
      icon: AlertTriangle,
    },
    expiring > 0 && {
      label: "Accounts expiring",
      value: expiring,
      href: "/clients",
      icon: Unplug,
    },
  ].filter(Boolean) as {
    label: string;
    value: number;
    href: string;
    icon: typeof PenLine;
  }[];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm">
            {format(new Date(), "EEEE, MMMM d")} · here&apos;s what&apos;s
            happening across your clients.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            render={<Link href="/calendar" />}
            variant="outline"
            size="sm"
          >
            <CalendarDays className="size-4" /> Calendar
          </Button>
          <Button render={<Link href="/composer" />} size="sm">
            <Plus className="size-4" /> New post
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <Link key={s.label} href={s.href} className="group">
            <Card className="transition-colors group-hover:border-primary/40">
              <CardContent className="flex items-center gap-4 py-5">
                <div className={`rounded-lg p-2.5 ${s.tint}`}>
                  <s.icon className="size-5" />
                </div>
                <div>
                  <div className="text-2xl font-semibold">{s.value}</div>
                  <div className="text-muted-foreground text-sm">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upcoming posts */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Upcoming posts</CardTitle>
            <Link
              href="/calendar"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-sm"
            >
              Calendar <ArrowUpRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <div className="text-muted-foreground py-12 text-center text-sm">
                Nothing scheduled yet.{" "}
                <Link href="/composer" className="text-primary underline">
                  Create your first post
                </Link>
                .
              </div>
            ) : (
              <ul className="divide-border divide-y">
                {upcoming.map((post) => {
                  const platforms = [
                    ...new Set(post.targets.map((t) => t.platform)),
                  ] as Platform[];
                  return (
                    <li key={post.id}>
                      <Link
                        href={
                          post.status === "SCHEDULED"
                            ? `/composer?edit=${post.id}`
                            : "/queue"
                        }
                        className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors"
                      >
                        <ClientDot color={post.client.color} />
                        <span className="w-28 shrink-0 truncate text-sm font-medium">
                          {post.client.name}
                        </span>
                        <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                          {post.body}
                        </p>
                        <span className="text-muted-foreground hidden items-center gap-1.5 sm:flex">
                          {platforms.map((p) => (
                            <PlatformIcon key={p} platform={p} />
                          ))}
                        </span>
                        <span className="text-muted-foreground hidden w-40 shrink-0 text-right text-xs md:block">
                          {post.scheduledAt ? whenLabel(post.scheduledAt) : "-"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Right rail */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
            </CardHeader>
            <CardContent>
              {attention.length === 0 ? (
                <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
                  <CheckCircle2 className="text-mint size-4" />
                  You&apos;re all caught up.
                </div>
              ) : (
                <ul className="space-y-1">
                  {attention.map((a) => (
                    <li key={a.label}>
                      <Link
                        href={a.href}
                        className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors"
                      >
                        <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
                          <a.icon className="size-4" />
                        </span>
                        <span className="flex-1">{a.label}</span>
                        <span className="font-semibold">{a.value}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Your clients</CardTitle>
              <Link
                href="/clients"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-sm"
              >
                Manage <ArrowUpRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent>
              {clientList.length === 0 ? (
                <div className="text-muted-foreground py-2 text-sm">
                  No clients yet.
                </div>
              ) : (
                <ul className="space-y-1">
                  {clientList.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-2 py-1.5 text-sm"
                    >
                      <ClientDot color={c.color} />
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {c.scheduled} scheduled
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
