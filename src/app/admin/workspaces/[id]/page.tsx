import Link from "next/link";
import { format } from "date-fns";
import { getWorkspaceDetail } from "@/lib/admin-data";
import {
  adminRemoveStorage,
  adminRevokeApiKey,
  banUser,
  removeUser,
  startViewAs,
  suspendWorkspace,
  unbanUser,
  unsuspendWorkspace,
} from "@/lib/admin-actions";
import { FEATURE_KEYS, FEATURES, formatBytes, LIMIT_LABELS, PLANS, type LimitKey } from "@/lib/plans";
import { PlatformIcon, StatusBadge } from "@/components/post-bits";
import {
  ActionButton,
  DeleteWorkspaceButton,
  FeatureSwitch,
  PlanSelect,
  RetestStorageButton,
  RoleSelect,
} from "@/components/admin/admin-controls";
import {
  ACCOUNT_HEALTH,
  AdminHeader,
  Ago,
  Empty,
  Mono,
  Panel,
  Pill,
  Table,
  Td,
  Th,
  truncate,
  When,
} from "@/components/admin/admin-ui";

export const metadata = { title: "Workspace" };

export default async function AdminWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await getWorkspaceDetail(id);
  const owner = ws.users[0];
  const plan = PLANS[ws.plan];
  const limitRows = (Object.keys(LIMIT_LABELS) as LimitKey[]).map((key) => {
    const used = ws.usage[key];
    const limit = plan.limits[key];
    const fmt = (n: number) => (key === "storageBytes" ? formatBytes(n) : String(n));
    return {
      key,
      label: LIMIT_LABELS[key],
      used: fmt(used),
      limit: limit === null ? "No limit" : fmt(limit),
      // Over the limit is red; at it (nothing more can be added) or close is amber.
      tone: (limit === null ? "good" : used > limit ? "bad" : used >= limit * 0.8 ? "warn" : "good") as "good" | "warn" | "bad",
    };
  });

  return (
    <>
      <AdminHeader
        eyebrow={
          <>
            <Link href="/admin/workspaces" className="hover:text-foreground">Workspaces</Link>
            <span className="text-border">/</span>
            <Mono className="normal-case">{ws.id}</Mono>
          </>
        }
        title={ws.name}
        description={
          <>
            Created {format(ws.createdAt, "d MMM yyyy")} · {ws.users.length} member{ws.users.length === 1 ? "" : "s"} ·{" "}
            {plan.label} plan
          </>
        }
        actions={
          <>
            <ActionButton
              label="View as admin"
              variant="ink"
              action={startViewAs.bind(null, ws.id)}
              title={`View ${ws.name} as its admin?`}
              description={`Opens the app as ${owner?.email ?? "its admin"} sees it, read-only, for 30 minutes. Nothing can be changed while viewing, and this is logged.`}
              reason="optional"
              confirmLabel="Open read-only view"
            />
            {ws.suspendedAt ? (
              <ActionButton
                label="Unsuspend"
                action={unsuspendWorkspace.bind(null, ws.id)}
                title={`Unsuspend ${ws.name}?`}
                description="Members can sign in again and the API works again. Scheduled posts that came due while suspended go out on the next publisher run."
                reason="optional"
              />
            ) : (
              <ActionButton
                label="Suspend"
                destructive
                action={suspendWorkspace.bind(null, ws.id)}
                title={`Suspend ${ws.name}?`}
                description="Members are locked out with a notice, API keys stop working, and nothing publishes until you unsuspend. No data is deleted."
                reason="required"
              />
            )}
            <DeleteWorkspaceButton workspaceId={ws.id} name={ws.name} />
          </>
        }
      />

      {ws.suspendedAt && (
        <div className="border-destructive/30 bg-destructive/5 rounded-xl border px-4 py-3 text-sm" role="status">
          <Pill tone="bad">Suspended</Pill>{" "}
          <span className="ml-1">
            Since <When date={ws.suspendedAt} />
            {ws.suspendedReason ? `: ${ws.suspendedReason}` : ""}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel
          title="Plan and usage"
          description="Limits are checked when members add clients, people, posts, API keys or uploads."
          actions={<PlanSelect workspaceId={ws.id} plan={ws.plan} />}
          flush
        >
          <Table className="min-w-[420px]">
            <thead>
              <tr>
                <Th>Limit</Th>
                <Th className="text-right">Used</Th>
                <Th className="text-right">Allowed</Th>
              </tr>
            </thead>
            <tbody>
              {limitRows.map((r) => (
                <tr key={r.key}>
                  <Td>{r.label}</Td>
                  <Td className="text-right">
                    <Pill tone={r.tone}>{r.used}</Pill>
                  </Td>
                  <Td className="text-muted-foreground text-right">{r.limit}</Td>
                </tr>
              ))}
              <tr>
                <Td>API requests (all time)</Td>
                <Td className="text-right font-mono tabular-nums">{ws.usage.apiCalls}</Td>
                <Td className="text-muted-foreground text-right">Not limited</Td>
              </tr>
            </tbody>
          </Table>
          <p className="text-muted-foreground px-4 py-3 text-xs sm:px-5">
            Storage counts files on Cue&apos;s bucket uploaded since sizes were recorded; a workspace&apos;s own bucket
            isn&apos;t limited.
          </p>
        </Panel>

        <Panel title="Features" description="Switching one off takes effect immediately.">
          <div className="divide-y">
            {FEATURE_KEYS.map((key) => (
              <FeatureSwitch
                key={key}
                workspaceId={ws.id}
                feature={key}
                enabled={!ws.disabledFeatures.includes(key)}
                label={FEATURES[key].label}
                description={FEATURES[key].description}
              />
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Members" flush>
        <Table className="min-w-[860px]">
          <thead>
            <tr>
              <Th>Person</Th>
              <Th>Role</Th>
              <Th>Last active</Th>
              <Th className="text-right">Posts</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {ws.users.map((u) => (
              <tr key={u.id}>
                <Td>
                  <div className="font-medium">{u.name || u.email.split("@")[0]}</div>
                  <div className="text-muted-foreground text-xs">{u.email}</div>
                </Td>
                <Td><RoleSelect userId={u.id} role={u.role} /></Td>
                <Td><Ago date={u.lastSeenAt} /></Td>
                <Td className="text-right font-mono tabular-nums">{u._count.posts}</Td>
                <Td>
                  {u.bannedAt ? (
                    <Pill tone="bad" className="max-w-56" >Banned{u.bannedReason ? `: ${truncate(u.bannedReason, 30)}` : ""}</Pill>
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
                        description="They're signed out of Cue and can't use it, and API keys acting as them stop working. Their posts and data stay."
                        reason="required"
                      />
                    )}
                    <ActionButton
                      label="Remove"
                      variant="ghost"
                      destructive
                      action={removeUser.bind(null, u.id)}
                      title={`Remove ${u.email} from ${ws.name}?`}
                      description="Deletes their membership. Only possible for people who haven't written posts or comments; ban them otherwise."
                      reason="required"
                    />
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel title="Clients and connected accounts" flush>
        {ws.clients.length === 0 ? (
          <Empty>No clients yet.</Empty>
        ) : (
          <ul className="divide-y">
            {ws.clients.map((c) => (
              <li key={c.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: c.color ?? "#888" }} aria-hidden />
                  {c.name}
                  <span className="text-muted-foreground text-xs font-normal">· {c._count.posts} posts</span>
                </div>
                {c.accounts.length === 0 ? (
                  <p className="text-muted-foreground mt-1.5 text-xs">No accounts connected.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {c.accounts.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <PlatformIcon platform={a.platform} className="size-4" />
                        <span className="min-w-0">{a.displayName}</span>
                        <Pill tone={ACCOUNT_HEALTH[a.health].tone}>{ACCOUNT_HEALTH[a.health].label}</Pill>
                        {a.tokenExpires && a.health !== "renews" && (
                          <span className="text-muted-foreground text-xs">
                            Token expiry <Ago date={a.tokenExpires} />
                          </span>
                        )}
                        {a.lastError && (
                          <span className="text-destructive basis-full text-xs">Last failure: {truncate(a.lastError, 160)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title="API keys" flush>
          {ws.apiKeys.length === 0 ? (
            <Empty>No API keys.</Empty>
          ) : (
            <ul className="divide-y">
              {ws.apiKeys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium">
                      {k.name} <Mono className="text-muted-foreground">{k.prefix}…</Mono>
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {k.user.email} · {k.useCount} requests · last used <Ago date={k.lastUsedAt} />
                    </div>
                  </div>
                  {k.revokedAt ? (
                    <Pill>Revoked</Pill>
                  ) : (
                    <ActionButton
                      label="Revoke"
                      destructive
                      action={adminRevokeApiKey.bind(null, k.id)}
                      title={`Revoke "${k.name}"?`}
                      description="Anything using it stops working immediately. The workspace can make a new one."
                      reason="optional"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Media storage">
          {ws.storage ? (
            <div className="space-y-3 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-muted-foreground">Provider</dt>
                <dd>{ws.storage.provider === "R2" ? "Cloudflare R2" : "S3-compatible"}</dd>
                <dt className="text-muted-foreground">Bucket</dt>
                <dd><Mono>{ws.storage.bucket}</Mono></dd>
                {ws.storage.endpoint && (
                  <>
                    <dt className="text-muted-foreground">Endpoint</dt>
                    <dd className="break-all"><Mono>{new URL(ws.storage.endpoint).host}</Mono></dd>
                  </>
                )}
                <dt className="text-muted-foreground">Public URL</dt>
                <dd className="break-all"><Mono>{ws.storage.publicUrl}</Mono></dd>
                <dt className="text-muted-foreground">Last verified</dt>
                <dd><Ago date={ws.storage.verifiedAt} /></dd>
              </dl>
              {ws.disabledFeatures.includes("custom_storage") && (
                <p className="text-standby-ink text-xs">Own storage is switched off, so uploads currently go to Cue&apos;s bucket.</p>
              )}
              <div className="flex flex-wrap items-start gap-2">
                <RetestStorageButton workspaceId={ws.id} />
                <ActionButton
                  label="Disconnect"
                  variant="ghost"
                  destructive
                  action={adminRemoveStorage.bind(null, ws.id)}
                  title="Disconnect this bucket?"
                  description="New uploads go to Cue's storage. Files already in the bucket stay there, and existing posts keep pointing at them."
                  reason="required"
                />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Uses Cue&apos;s storage.</p>
          )}
        </Panel>
      </div>

      <Panel title="Recent posts" flush>
        {ws.recentPosts.length === 0 ? (
          <Empty>No posts yet.</Empty>
        ) : (
          <ul className="divide-y">
            {ws.recentPosts.map((p) => (
              <li key={p.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={p.status} />
                  <span className="text-muted-foreground text-xs">
                    {p.client.name} · {p.scheduledAt ? <>due <When date={p.scheduledAt} pattern="d MMM, HH:mm" /></> : "no date"}
                    {p.approval !== "APPROVED" && ` · ${p.approval === "PENDING" ? "awaiting approval" : "changes requested"}`}
                  </span>
                </div>
                <p className="mt-1.5 text-sm">{truncate(p.title || p.body, 140)}</p>
                <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                  {p.targets.map((t) => (
                    <li key={t.id} className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <PlatformIcon platform={t.platform} className="size-3.5" />
                      <span>
                        {t.status.toLowerCase()}
                        {t.error && <span className="text-destructive">: {truncate(t.error, 80)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Admin activity on this workspace" flush>
        {ws.auditLog.length === 0 ? (
          <Empty>No admin actions yet.</Empty>
        ) : (
          <ul className="divide-y">
            {ws.auditLog.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0">
                  <Mono>{a.action}</Mono>
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
