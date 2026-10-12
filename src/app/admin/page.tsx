import Link from "next/link";
import { getAdminOverview } from "@/lib/admin-data";
import { PlatformIcon } from "@/components/post-bits";
import {
  AdminHeader,
  Ago,
  Empty,
  Panel,
  Pill,
  StatTile,
  Table,
  Td,
  Th,
} from "@/components/admin/admin-ui";

export const metadata = { title: "Overview" };

const PLATFORM_LABELS = { LINKEDIN: "LinkedIn", INSTAGRAM: "Instagram", YOUTUBE: "YouTube" } as const;

export default async function AdminOverviewPage() {
  const o = await getAdminOverview();
  const hb = o.publisher.heartbeat;
  const stale = o.publisher.stale;
  const publisherTone = o.publisher.paused ? "bad" : !hb ? "warn" : !hb.ok || stale ? "bad" : "good";

  return (
    <>
      <AdminHeader
        eyebrow="Platform"
        title="Overview"
        description="Everything across every workspace, at a glance."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Workspaces"
          value={o.totals.workspaces}
          note={o.totals.suspended ? `${o.totals.suspended} suspended` : "None suspended"}
          href="/admin/workspaces"
        />
        <StatTile
          label="Users"
          value={o.totals.users}
          note={o.totals.banned ? `${o.totals.banned} banned` : "None banned"}
          href="/admin/users"
        />
        <StatTile label="Clients" value={o.totals.clients} />
        <StatTile label="Connected accounts" value={o.totals.accounts} href="/admin/accounts" />
        <StatTile label="New workspaces" value={o.signups.workspaces} note="Last 7 days" />
        <StatTile label="New users" value={o.signups.users} note="Last 7 days" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Published" value={o.posts.published24} note="Last 24 hours" tone="good" />
        <StatTile
          label="Failed"
          value={o.posts.failed24}
          note="Due in the last 24 hours"
          tone={o.posts.failed24 ? "bad" : "good"}
          href="/admin/posts?tab=failed"
        />
        <StatTile label="Scheduled" value={o.posts.upcoming24} note="Next 24 hours" href="/admin/posts?tab=upcoming" />
      </div>

      <Panel
        title="Publisher"
        description="Supabase calls the publisher every 5 minutes."
        actions={
          <Pill tone={publisherTone}>
            {o.publisher.paused
              ? "Paused"
              : !hb
                ? "No runs recorded yet"
                : !hb.ok
                  ? "Last run failed"
                  : stale
                    ? "Not running"
                    : "Running"}
          </Pill>
        }
      >
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground text-xs">Last run</dt>
            <dd className="mt-1 font-medium">{hb ? <Ago date={hb.lastRunAt} /> : "Never"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Last result</dt>
            <dd className="mt-1 font-medium">
              {!hb
                ? "-"
                : hb.ok
                  ? summaryText(hb.summary)
                  : <span className="text-destructive">{hb.error ?? "Failed"}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Overdue</dt>
            <dd className="mt-1 font-medium">
              <Link className="underline-offset-4 hover:underline" href="/admin/posts?tab=overdue">
                {o.publisher.overdue} should have gone out
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Stuck mid-publish</dt>
            <dd className="mt-1 font-medium">
              <Link className="underline-offset-4 hover:underline" href="/admin/posts?tab=stuck">
                {o.publisher.stuck} stuck
              </Link>
            </dd>
          </div>
        </dl>
        {!hb && (
          <p className="text-muted-foreground mt-3 text-xs">
            The heartbeat is written on each run from this version on, so it fills in after the next run.
          </p>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="Results by platform" description="Posts due in the last 7 days." flush>
          <Table className="min-w-[420px]">
            <thead>
              <tr>
                <Th>Platform</Th>
                <Th className="text-right">Published</Th>
                <Th className="text-right">Failed</Th>
                <Th className="text-right">Success rate</Th>
              </tr>
            </thead>
            <tbody>
              {o.platforms.map((p) => (
                <tr key={p.platform}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <PlatformIcon platform={p.platform} className="size-4" />
                      {PLATFORM_LABELS[p.platform]}
                    </span>
                  </Td>
                  <Td className="text-right font-mono tabular-nums">{p.published}</Td>
                  <Td className="text-right font-mono tabular-nums">{p.failed}</Td>
                  <Td className="text-right">
                    {p.total === 0 ? (
                      <span className="text-muted-foreground">No posts</span>
                    ) : (
                      <Pill tone={p.failed / p.total > 0.2 ? "bad" : p.failed ? "warn" : "good"}>
                        {Math.round((p.published / p.total) * 100)}%
                      </Pill>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel title="Newest workspaces" actions={<Link className="text-sm underline-offset-4 hover:underline" href="/admin/workspaces">All</Link>} flush>
          {o.recentWorkspaces.length === 0 ? (
            <Empty>No workspaces yet.</Empty>
          ) : (
            <ul className="divide-y">
              {o.recentWorkspaces.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <Link href={`/admin/workspaces/${w.id}`} className="block truncate text-sm font-medium underline-offset-4 hover:underline">
                      {w.name}
                    </Link>
                    <span className="text-muted-foreground block truncate text-xs">{w.owner ?? "No members"}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    <Ago date={w.createdAt} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent admin actions" actions={<Link className="text-sm underline-offset-4 hover:underline" href="/admin/audit">Audit log</Link>} flush>
        {o.recentAudit.length === 0 ? (
          <Empty>Nothing yet. Every action taken here is recorded.</Empty>
        ) : (
          <ul className="divide-y">
            {o.recentAudit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0">
                  <span className="font-mono text-xs">{a.action}</span>
                  {a.reason && <span className="text-muted-foreground"> · {a.reason}</span>}
                </span>
                <span className="text-muted-foreground text-xs">
                  {a.actorEmail} · <Ago date={a.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function summaryText(summary: unknown): string {
  const s = (summary ?? {}) as { processed?: number; published?: number; failed?: number; paused?: boolean };
  if (s.paused) return "Skipped (paused)";
  if (!s.processed) return "Nothing was due";
  return `${s.published ?? 0} published, ${s.failed ?? 0} failed`;
}
