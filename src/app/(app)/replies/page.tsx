import { notFound } from "next/navigation";
import { getScopeClientId } from "@/lib/client-scope";
import { DESK_FILTERS, replyDeskEnabled, type DeskFilter } from "@/lib/reply-desk/config";
import { getReplyDeskPage } from "@/lib/reply-desk/data";
import { ReplyDeskView } from "@/components/reply-desk-view";

export const dynamic = "force-dynamic";

export default async function RepliesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; connected?: string }>;
}) {
  // Hidden until Instagram and Google approve comment access (reply-desk/config.ts).
  if (!replyDeskEnabled()) notFound();
  const [{ show, connected }, clientId] = await Promise.all([searchParams, getScopeClientId()]);
  const filter: DeskFilter = DESK_FILTERS.includes(show as DeskFilter) ? (show as DeskFilter) : "questions";
  const data = await getReplyDeskPage(filter, clientId);
  return <ReplyDeskView data={data} filter={filter} justConnected={!!connected} />;
}
