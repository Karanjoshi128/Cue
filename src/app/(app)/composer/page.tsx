import { format } from "date-fns";
import { getClients, getPost } from "@/lib/data";
import { Composer, type ComposerInitial } from "@/components/composer";

export const dynamic = "force-dynamic";

export default async function ComposerPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; date?: string }>;
}) {
  const { edit, date } = await searchParams;
  const clients = await getClients();
  const plain = clients.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    accounts: c.accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      displayName: a.displayName,
    })),
  }));

  let initial: ComposerInitial | undefined;
  if (edit) {
    const post = await getPost(edit);
    // Only drafts/scheduled posts are editable; ignore anything else.
    if (post && (post.status === "DRAFT" || post.status === "SCHEDULED")) {
      initial = {
        id: post.id,
        clientId: post.clientId,
        body: post.body,
        accountIds: post.targets.map((t) => t.accountId),
        scheduledAt: post.scheduledAt
          ? format(post.scheduledAt, "yyyy-MM-dd'T'HH:mm")
          : "",
        media: post.media.map((m) => ({
          type: m.type,
          url: m.url,
          storageKey: m.storageKey,
        })),
      };
    }
  }

  // A date passed from the calendar prefills the schedule field (09:00 local).
  const prefillDate =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T09:00` : undefined;

  return (
    <Composer clients={plain} initial={initial} prefillDate={prefillDate} />
  );
}
