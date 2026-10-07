import { getPosts } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";
import { getCurrentUser } from "@/lib/auth";
import { POST_FILTERS, type PostFilter } from "@/lib/post-filters";
import { QueueList } from "@/components/queue-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getTimeZone } from "@/lib/timezone-server";
import Link from "next/link";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const upper = status?.toUpperCase();
  const initialFilter: PostFilter = POST_FILTERS.includes(upper as PostFilter)
    ? (upper as PostFilter)
    : "ALL";

  const clientId = await getScopeClientId();
  const [posts, user, timeZone] = await Promise.all([
    getPosts({ clientId }),
    getCurrentUser(),
    getTimeZone(),
  ]);
  const plain = posts.map((p) => ({
    id: p.id,
    body: p.body,
    status: p.status,
    approval: p.approval,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    clientName: p.client.name,
    clientColor: p.client.color,
    targets: p.targets.map((t) => ({
      id: t.id,
      platform: t.platform,
      status: t.status,
      error: t.error,
      permalink: t.permalink,
    })),
    comments: p.comments.map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.author.name ?? c.author.email,
      authorId: c.authorId,
      createdAt: c.createdAt.toISOString(),
    })),
  }));
  const awaiting = posts.filter(
    (p) => p.approval === "PENDING" || p.approval === "CHANGES_REQUESTED",
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow={
          <>
            Queue
            <span className="text-border">/</span>
            {posts.length} post{posts.length === 1 ? "" : "s"}
            {awaiting > 0 && (
              <>
                <span className="text-border">/</span>
                <span className="text-standby-ink">{awaiting} in review</span>
              </>
            )}
          </>
        }
        title={
          <>
            Every post, <em>in order.</em>
          </>
        }
        description="Newest first. Approve, edit, or retry anything here, and leave notes for your team."
        actions={
          <Button render={<Link href="/composer" />}>
            <Plus /> New post
          </Button>
        }
      />
      {/* Keyed so a ?status= change (e.g. from the command menu) resets the tab. */}
      <QueueList
        key={initialFilter}
        posts={plain}
        initialFilter={initialFilter}
        currentUserId={user?.id ?? ""}
        timeZone={timeZone}
      />
    </div>
  );
}
