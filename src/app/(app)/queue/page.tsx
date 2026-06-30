import { getPosts } from "@/lib/data";
import { QueueList } from "@/components/queue-list";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const posts = await getPosts();
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
  return <QueueList posts={plain} />;
}
