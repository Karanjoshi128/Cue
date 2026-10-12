import Link from "next/link";
import { listUsers } from "@/lib/admin-data";
import { banUser, removeUser, unbanUser } from "@/lib/admin-actions";
import { ActionButton, RoleSelect } from "@/components/admin/admin-controls";
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
  truncate,
} from "@/components/admin/admin-ui";

export const metadata = { title: "Users" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status === "banned" ? "banned" : undefined;
  const data = await listUsers({ q: sp.q, status, page: Number(sp.page) || 1 });

  return (
    <>
      <AdminHeader
        eyebrow="People"
        title="Users"
        description="Everyone with access to a workspace. Ban someone to lock them out without losing their posts."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterTabs
          active={status ?? "all"}
          items={[
            { key: "all", label: "All", href: qs("/admin/users", { q: sp.q }) },
            { key: "banned", label: "Banned", href: qs("/admin/users", { q: sp.q, status: "banned" }) },
          ]}
        />
        <SearchForm placeholder="Search email, name or ID" q={sp.q} hidden={{ status }} />
      </div>
      <Panel flush>
        {data.rows.length === 0 ? (
          <Empty>No users match.</Empty>
        ) : (
          <Table className="min-w-[920px]">
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Workspace</Th>
                <Th>Role</Th>
                <Th>Last active</Th>
                <Th>Joined</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <div className="font-medium">{u.name || u.email.split("@")[0]}</div>
                    <div className="text-muted-foreground text-xs">{u.email}</div>
                  </Td>
                  <Td>
                    <Link href={`/admin/workspaces/${u.workspace.id}`} className="underline-offset-4 hover:underline">
                      {u.workspace.name}
                    </Link>
                    {u.workspace.suspendedAt && <Pill tone="bad" className="ml-2">Suspended</Pill>}
                  </Td>
                  <Td><RoleSelect userId={u.id} role={u.role} /></Td>
                  <Td><Ago date={u.lastSeenAt} /></Td>
                  <Td><Ago date={u.createdAt} /></Td>
                  <Td>
                    {u.bannedAt ? (
                      <Pill tone="bad">Banned{u.bannedReason ? `: ${truncate(u.bannedReason, 24)}` : ""}</Pill>
                    ) : (
                      <Pill tone="good">Active</Pill>
                    )}
                  </Td>
                  <Td className="text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1.5">
                      {u.bannedAt ? (
                        <ActionButton label="Unban" action={unbanUser.bind(null, u.id)} title={`Unban ${u.email}?`} reason="optional" />
                      ) : (
                        <ActionButton
                          label="Ban"
                          destructive
                          action={banUser.bind(null, u.id)}
                          title={`Ban ${u.email}?`}
                          description="They're locked out of Cue and API keys acting as them stop working. Their posts and data stay."
                          reason="required"
                        />
                      )}
                      <ActionButton
                        label="Remove"
                        variant="ghost"
                        destructive
                        action={removeUser.bind(null, u.id)}
                        title={`Remove ${u.email}?`}
                        description={`Deletes their membership of ${u.workspace.name}. Only possible for people with no posts or comments.`}
                        reason="required"
                      />
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={data.page} total={data.total} href={(page) => qs("/admin/users", { q: sp.q, status, page })} />
      </Panel>
    </>
  );
}
