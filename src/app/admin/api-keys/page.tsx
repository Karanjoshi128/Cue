import Link from "next/link";
import { listApiKeys } from "@/lib/admin-data";
import { adminRevokeApiKey } from "@/lib/admin-actions";
import { ActionButton } from "@/components/admin/admin-controls";
import {
  AdminHeader,
  Ago,
  Empty,
  FilterTabs,
  Mono,
  Pager,
  Panel,
  Pill,
  qs,
  SearchForm,
  Table,
  Td,
  Th,
} from "@/components/admin/admin-ui";

export const metadata = { title: "API keys" };

export default async function AdminApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status === "active" || sp.status === "revoked" ? sp.status : undefined;
  const data = await listApiKeys({ q: sp.q, status, page: Number(sp.page) || 1 });

  return (
    <>
      <AdminHeader
        eyebrow="Integrations"
        title="API keys"
        description="Every key across workspaces. Only a prefix is stored in readable form; the key itself is never recoverable."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          active={status ?? "all"}
          items={[
            { key: "all", label: "All", href: qs("/admin/api-keys", { q: sp.q }) },
            { key: "active", label: "Active", href: qs("/admin/api-keys", { q: sp.q, status: "active" }) },
            { key: "revoked", label: "Revoked", href: qs("/admin/api-keys", { q: sp.q, status: "revoked" }) },
          ]}
        />
        <SearchForm placeholder="Search name, prefix, workspace or email" q={sp.q} hidden={{ status }} />
      </div>
      <Panel flush>
        {data.rows.length === 0 ? (
          <Empty>No keys match.</Empty>
        ) : (
          <Table className="min-w-[880px]">
            <thead>
              <tr>
                <Th>Key</Th>
                <Th>Workspace</Th>
                <Th>Acts as</Th>
                <Th className="text-right">Requests</Th>
                <Th>Last used</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((k) => (
                <tr key={k.id}>
                  <Td>
                    <div className="font-medium">{k.name}</div>
                    <Mono className="text-muted-foreground">{k.prefix}…</Mono>
                  </Td>
                  <Td>
                    <Link href={`/admin/workspaces/${k.workspace.id}`} className="underline-offset-4 hover:underline">
                      {k.workspace.name}
                    </Link>
                  </Td>
                  <Td className="text-xs">{k.user.email}</Td>
                  <Td className="text-right font-mono tabular-nums">{k.useCount}</Td>
                  <Td><Ago date={k.lastUsedAt} /></Td>
                  <Td>{k.revokedAt ? <Pill>Revoked</Pill> : <Pill tone="good">Active</Pill>}</Td>
                  <Td className="text-right">
                    {!k.revokedAt && (
                      <ActionButton
                        label="Revoke"
                        destructive
                        action={adminRevokeApiKey.bind(null, k.id)}
                        title={`Revoke "${k.name}"?`}
                        description={`Anything using it stops working immediately. ${k.workspace.name} can create a new key.`}
                        reason="optional"
                      />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={data.page} total={data.total} href={(page) => qs("/admin/api-keys", { q: sp.q, status, page })} />
      </Panel>
    </>
  );
}
