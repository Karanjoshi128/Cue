import { format } from "date-fns";
import { getClients, getPost } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";
import { getTimeZone } from "@/lib/timezone-server";
import { zoned } from "@/lib/timezone";
import { Composer, type ComposerInitial } from "@/components/composer";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function ComposerPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; date?: string }>;
}) {
  const { edit, date } = await searchParams;
  const [clients, scopeClientId, timeZone] = await Promise.all([
    getClients(),
    getScopeClientId(),
    getTimeZone(),
  ]);
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
        title: post.title ?? "",
        youtubePrivacy:
          (post.youtubePrivacy as ComposerInitial["youtubePrivacy"]) ?? null,
        youtubeTags: post.youtubeTags,
        youtubeCategoryId: post.youtubeCategoryId,
        accountIds: post.targets.map((t) => t.accountId),
        // The picker shows wall-clock time, so format in the viewer's zone:
        // in the server's (UTC) zone, saving an untouched edit would shift
        // the post by the viewer's UTC offset.
        scheduledAt: post.scheduledAt
          ? format(post.scheduledAt, "yyyy-MM-dd'T'HH:mm", {
              in: zoned(timeZone),
            })
          : "",
        media: post.media.map((m) => ({
          type: m.type,
          url: m.url,
          storageKey: m.storageKey,
          title: m.title ?? undefined,
        })),
        overrides: Object.fromEntries(
          post.targets
            .filter((t) => t.bodyOverride)
            .map((t) => [t.accountId, t.bodyOverride as string]),
        ),
        link: (post.link as ComposerInitial["link"]) ?? null,
        poll: (post.poll as ComposerInitial["poll"]) ?? null,
      };
    }
  }

  // A date passed from the calendar prefills the schedule field (09:00 local).
  const prefillDate =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T09:00` : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        className="mx-auto max-w-6xl"
        eyebrow={
          initial ? (
            <>
              <span className="tally text-standby" />
              Editing a {edit && initial.scheduledAt ? "scheduled post" : "draft"}
            </>
          ) : (
            "Compose"
          )
        }
        title={
          initial ? (
            <>
              Fine-tune the <em>cue.</em>
            </>
          ) : (
            <>
              Write it once. <em>Cue it everywhere.</em>
            </>
          )
        }
        description={
          initial
            ? "Changes apply to every account this post targets."
            : "Pick the client and accounts, write the post, then choose when it goes out."
        }
      />
      <Composer
        clients={plain}
        initial={initial}
        prefillDate={prefillDate}
        defaultClientId={scopeClientId}
      />
    </div>
  );
}
