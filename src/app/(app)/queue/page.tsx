import { getPosts } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";
import { QueueList } from "@/components/queue-list";

export const dynamic = "force-dynamic";

const FILTERS = [
  "ALL",
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PARTIAL",
  "FAILED",
] as const;
type Filter = (typeof FILTERS)[number];

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const upper = status?.toUpperCase();
  const initialFilter: Filter = FILTERS.includes(upper as Filter)
    ? (upper as Filter)
    : "ALL";

  const clientId = await getScopeClientId();
  const posts = await getPosts({ clientId });
  const plain = posts.map((p) => ({
    id: p.id,
    body: p.body,
    status: p.status,
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
  }));
  return <QueueList posts={plain} initialFilter={initialFilter} />;
}
