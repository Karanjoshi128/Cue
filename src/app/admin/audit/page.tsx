import Link from "next/link";
import { listAudit } from "@/lib/admin-data";
import { AdminHeader, Empty, Mono, Pager, Panel, qs, SearchForm, Table, Td, Th, When } from "@/components/admin/admin-ui";

export const metadata = { title: "Audit log" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const data = await listAudit({ q: sp.q, page: Number(sp.page) || 1 });

  return (
    <>
      <AdminHeader
        eyebrow="Accountability"
        title="Audit log"
        description="Every action taken in this panel: who, what, when and why. Entries are never edited or deleted, and outlive what they describe."
        actions={<SearchForm placeholder="Search action, admin, reason or ID" q={sp.q} />}
      />
      <Panel flush>
        {data.rows.length === 0 ? (
          <Empty>No entries{sp.q ? " match" : " yet"}.</Empty>
        ) : (
          <Table className="min-w-[860px]">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Workspace</Th>
                <Th>Reason</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((a) => (
                <tr key={a.id}>
                  <Td><When date={a.createdAt} pattern="d MMM yyyy, HH:mm:ss" /></Td>
                  <Td>
                    <Mono>{a.action}</Mono>
                    {a.details && (
                      <div className="text-muted-foreground mt-0.5 max-w-72 truncate text-xs" title={JSON.stringify(a.details)}>
                        {JSON.stringify(a.details)}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {a.workspaceId ? (
                      a.workspaceName ? (
                        <Link href={`/admin/workspaces/${a.workspaceId}`} className="underline-offset-4 hover:underline">
                          {a.workspaceName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Deleted</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">Platform</span>
                    )}
                  </Td>
                  <Td className="max-w-80 text-sm">{a.reason ?? <span className="text-muted-foreground">-</span>}</Td>
                  <Td className="text-xs">{a.actorEmail}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={data.page} total={data.total} href={(page) => qs("/admin/audit", { q: sp.q, page })} />
      </Panel>
    </>
  );
}
