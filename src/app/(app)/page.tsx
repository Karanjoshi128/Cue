import Link from "next/link";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getDashboardStats } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";
import { ClientDot, StatusBadge } from "@/components/post-bits";
import { Users, CalendarClock, Send, AlertTriangle, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const clientId = await getScopeClientId();
  const { clients, scheduled, published, failed, expiring, upcoming } =
    await getDashboardStats(clientId);

  const alerts = [
    failed > 0 && {
      href: "/queue?status=FAILED",
      text: `${failed} post ${failed === 1 ? "target" : "targets"} failed to publish`,
      cta: "Review",
    },
    expiring > 0 && {
      href: "/clients",
      text: `${expiring} connected ${expiring === 1 ? "account is" : "accounts are"} expiring soon`,
      cta: "Reconnect",
    },
  ].filter(Boolean) as { href: string; text: string; cta: string }[];

  const stats = [
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

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="border-amber-300/60 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-colors"
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span className="flex-1">{a.text}</span>
              <span className="font-medium">{a.cta} →</span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group">
            <Card className="transition-colors group-hover:border-primary/40">
              <CardContent className="flex items-center gap-4 py-5">
                <div className={`rounded-lg p-2.5 ${s.tint}`}>
                  <s.icon className="size-5" />
                </div>
                <div>
                  <div className="text-2xl font-semibold">{s.value}</div>
                  <div className="text-muted-foreground text-sm">
                    {s.label}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Upcoming posts</CardTitle>
          <Button
            render={<Link href="/composer" />}
            size="sm"
            variant="outline"
          >
            <Plus className="size-4" /> New post
          </Button>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <div className="text-muted-foreground py-10 text-center text-sm">
              Nothing scheduled yet.{" "}
              <Link href="/composer" className="text-primary underline">
                Create your first post
              </Link>
              .
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {upcoming.map((post) => (
                <li
                  key={post.id}
                  className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <ClientDot color={post.client.color} />
                    <span className="w-32 truncate text-sm font-medium">
                      {post.client.name}
                    </span>
                  </div>
                  <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
                    {post.body}
                  </p>
                  <span className="text-muted-foreground hidden text-xs sm:block">
                    {post.scheduledAt
                      ? format(post.scheduledAt, "MMM d, h:mm a")
                      : "—"}
                  </span>
                  <StatusBadge status={post.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
