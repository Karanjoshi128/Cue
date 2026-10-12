import Link from "next/link";
import { listWorkspaces } from "@/lib/admin-data";
import { PLANS } from "@/lib/plans";
import {
  AdminHeader,
  Ago,
  Empty,
  FilterTabs,
  Pager,
  Panel,
  Pill,
  qs,
  SearchForm,
  Table,
  Td,
  Th,
} from "@/components/admin/admin-ui";

export const metadata = { title: "Workspaces" };

export default async function AdminWorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; deleted?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status === "suspended" || sp.status === "active" ? sp.status : undefined;
  const data = await listWorkspaces({ q: sp.q, status, page: Number(sp.page) || 1 });
  const link = (extra: Record<string, string | number | undefined>) =>
    qs("/admin/workspaces", { q: sp.q, status, ...extra });

  return (
    <>
      <AdminHeader
        eyebrow="Tenants"
        title="Workspaces"
        description="Every workspace on Cue. Open one to change its plan and features, view it as its admin, suspend it, or delete it."
      />
      {sp.deleted && (
        <p className="bg-card rounded-xl border px-4 py-3 text-sm" role="status">
          The workspace was deleted. The audit log has the details.
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          active={status ?? "all"}
          items={[
            { key: "all", label: "All", href: qs("/admin/workspaces", { q: sp.q }) },
            { key: "active", label: "Active", href: qs("/admin/workspaces", { q: sp.q, status: "active" }) },
            { key: "suspended", label: "Suspended", href: qs("/admin/workspaces", { q: sp.q, status: "suspended" }) },
          ]}
        />
        <SearchForm placeholder="Search name, member email or ID" q={sp.q} hidden={{ status }} />
      </div>
      <Panel flush>
        {data.rows.length === 0 ? (
          <Empty>No workspaces match.</Empty>
        ) : (
          <Table className="min-w-[900px]">
            <thead>
              <tr>
                <Th>Workspace</Th>
                <Th>Plan</Th>
                <Th className="text-right">Members</Th>
                <Th className="text-right">Clients</Th>
                <Th className="text-right">Posts this month</Th>
                <Th>Storage</Th>
                <Th>Last active</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((w) => (
                <tr key={w.id} className="hover:bg-muted/40">
                  <Td>
                    <Link href={`/admin/workspaces/${w.id}`} className="font-medium underline-offset-4 hover:underline">
                      {w.name}
                    </Link>
                    <div className="text-muted-foreground text-xs">{w.owner ?? "No members"}</div>
                    {w.suspended && <Pill tone="bad" className="mt-1.5">Suspended</Pill>}
                  </Td>
                  <Td>{PLANS[w.plan].label}</Td>
                  <Td className="text-right font-mono tabular-nums">{w.members}</Td>
                  <Td className="text-right font-mono tabular-nums">{w.clients}</Td>
                  <Td className="text-right font-mono tabular-nums">{w.postsThisMonth}</Td>
                  <Td>{w.storage ? `Own ${w.storage === "R2" ? "R2" : "S3"}` : <span className="text-muted-foreground">Cue&apos;s</span>}</Td>
                  <Td><Ago date={w.lastSeenAt} /></Td>
                  <Td><Ago date={w.createdAt} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={data.page} total={data.total} href={(page) => link({ page })} />
      </Panel>
    </>
  );
}
