import Link from "next/link";
import { listAccounts } from "@/lib/admin-data";
import { PlatformIcon } from "@/components/post-bits";
import {
  ACCOUNT_HEALTH,
  AdminHeader,
  Ago,
  Empty,
  FilterTabs,
  Panel,
  Pill,
  qs,
  SearchForm,
  Table,
  Td,
  Th,
  truncate,
} from "@/components/admin/admin-ui";

export const metadata = { title: "Connected accounts" };

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter === "attention" ? "attention" : undefined;
  const data = await listAccounts({ q: sp.q, filter });

  return (
    <>
      <AdminHeader
        eyebrow="Integrations"
        title="Connected accounts"
        description="Every LinkedIn, Instagram and YouTube account across workspaces, with token health. Only the workspace can reconnect an account, so flag it to them."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          active={filter ?? "all"}
          items={[
            { key: "all", label: "All", href: qs("/admin/accounts", { q: sp.q }), count: filter ? undefined : data.total },
            { key: "attention", label: "Needs attention", href: qs("/admin/accounts", { q: sp.q, filter: "attention" }), count: data.attention },
          ]}
        />
        <SearchForm placeholder="Search account, client or workspace" q={sp.q} hidden={{ filter }} />
      </div>
      <Panel flush>
        {data.rows.length === 0 ? (
          <Empty>{filter ? "Every account looks healthy." : "No accounts match."}</Empty>
        ) : (
          <Table className="min-w-[900px]">
            <thead>
              <tr>
                <Th>Account</Th>
                <Th>Client · Workspace</Th>
                <Th>Health</Th>
                <Th>Token expiry</Th>
                <Th>Last publish</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <span className="flex items-center gap-2 font-medium">
                      <PlatformIcon platform={a.platform} className="size-4" />
                      {a.displayName}
                    </span>
                    <div className="text-muted-foreground text-xs">
                      Connected <Ago date={a.createdAt} />
                    </div>
                  </Td>
                  <Td>
                    <div>{a.client.name}</div>
                    <Link href={`/admin/workspaces/${a.client.workspace.id}`} className="text-muted-foreground text-xs underline-offset-4 hover:underline">
                      {a.client.workspace.name}
                    </Link>
                  </Td>
                  <Td>
                    <Pill tone={ACCOUNT_HEALTH[a.health].tone}>{ACCOUNT_HEALTH[a.health].label}</Pill>
                  </Td>
                  <Td>{a.health === "renews" ? <span className="text-muted-foreground">Renews itself</span> : <Ago date={a.tokenExpires} empty="Unknown" />}</Td>
                  <Td>
                    {a.lastStatus ? (
                      <>
                        <div>
                          {a.lastStatus === "PUBLISHED" ? "Published" : "Failed"} <Ago date={a.lastAt} />
                        </div>
                        {a.lastError && <div className="text-destructive max-w-80 text-xs">{truncate(a.lastError, 140)}</div>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Nothing yet</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
