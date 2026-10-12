import Link from "next/link";
import { listTargets, type PostsTab } from "@/lib/admin-data";
import { cancelTarget, releaseStuckTarget, retryTarget } from "@/lib/admin-actions";
import { PlatformIcon } from "@/components/post-bits";
import { ActionButton } from "@/components/admin/admin-controls";
import {
  AdminHeader,
  Ago,
  Empty,
  FilterTabs,
  Pager,
  Panel,
  Pill,
  qs,
  Table,
  Td,
  Th,
  truncate,
  When,
} from "@/components/admin/admin-ui";

export const metadata = { title: "Posts" };

const TABS: { key: PostsTab; label: string; blurb: string }[] = [
  { key: "failed", label: "Failed", blurb: "Out of attempts. Retry sends it back to the queue for the next publisher run." },
  { key: "stuck", label: "Stuck", blurb: "Claimed by a publisher run that never finished. The publisher frees these after 20 minutes; release one now to retry sooner." },
  { key: "overdue", label: "Overdue", blurb: "Due more than 10 minutes ago and still waiting, with the reason it's held." },
  { key: "upcoming", label: "Next 24 hours", blurb: "Everything due in the next day. Cancel stops a post going out." },
];

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "failed") as PostsTab;
  const data = await listTargets(tab, Number(sp.page) || 1);

  return (
    <>
      <AdminHeader
        eyebrow="Publishing"
        title="Posts"
        description="One row per post per account, across every workspace."
      />
      <FilterTabs
        active={tab}
        items={TABS.map((t) => ({ key: t.key, label: t.label, href: qs("/admin/posts", { tab: t.key }), count: data.counts[t.key] }))}
      />
      <p className="text-muted-foreground text-sm">{TABS.find((t) => t.key === tab)?.blurb}</p>
      <Panel flush>
        {data.rows.length === 0 ? (
          <Empty>Nothing here.</Empty>
        ) : (
          <Table className="min-w-[980px]">
            <thead>
              <tr>
                <Th>Post</Th>
                <Th>Account</Th>
                <Th>Workspace</Th>
                <Th>Due</Th>
                <Th>{tab === "overdue" ? "Held because" : tab === "failed" ? "Error" : "Attempts"}</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((t) => (
                <tr key={t.id}>
                  <Td className="max-w-80">
                    <p className="text-sm">{truncate(t.post.title || t.post.body, 110)}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">{t.post.client.name}</p>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2">
                      <PlatformIcon platform={t.platform} className="size-4" />
                      {t.account.displayName}
                    </span>
                  </Td>
                  <Td>
                    <Link href={`/admin/workspaces/${t.post.client.workspace.id}`} className="underline-offset-4 hover:underline">
                      {t.post.client.workspace.name}
                    </Link>
                  </Td>
                  <Td>
                    {t.post.scheduledAt ? (
                      <>
                        <div><When date={t.post.scheduledAt} pattern="d MMM, HH:mm" /></div>
                        <div className="text-muted-foreground text-xs"><Ago date={t.post.scheduledAt} /></div>
                      </>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td className="max-w-80">
                    {tab === "overdue" ? (
                      <Pill tone={t.heldBecause === "Publisher hasn't picked it up" ? "bad" : "warn"}>{t.heldBecause}</Pill>
                    ) : tab === "failed" ? (
                      <span className="text-destructive text-xs">{t.error ? truncate(t.error, 180) : "No error recorded"}</span>
                    ) : (
                      <span className="font-mono text-xs">{t.attempts}</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1.5">
                      {tab === "failed" && (
                        <ActionButton label="Retry" action={retryTarget.bind(null, t.id)} />
                      )}
                      {tab === "stuck" && (
                        <ActionButton
                          label="Release"
                          action={releaseStuckTarget.bind(null, t.id)}
                          title="Release this post?"
                          description="Puts it back in the queue. Only do this if the publisher really stopped: if it's still uploading, the post could go out twice."
                          reason="optional"
                        />
                      )}
                      {(tab === "upcoming" || tab === "overdue") && (
                        <ActionButton
                          label="Cancel"
                          destructive
                          action={cancelTarget.bind(null, t.id)}
                          title="Cancel this post?"
                          description="It won't go out to this account. The workspace sees it as failed, with your reason."
                          reason="required"
                          confirmLabel="Cancel post"
                        />
                      )}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pager page={data.page} total={data.total} href={(page) => qs("/admin/posts", { tab, page })} />
      </Panel>
    </>
  );
}
