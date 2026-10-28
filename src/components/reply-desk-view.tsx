"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { ArrowUpRight, Check, Loader2, MessageCircleReply, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { draftDeskReply, refreshDesk, replyToDeskComment, setDeskState } from "@/lib/reply-desk/actions";
import { unwrap } from "@/lib/action-result";
import { REPLY_LIMIT, type DeskFilter } from "@/lib/reply-desk/config";
import type { DeskAccount, DeskComment, ReplyDeskData } from "@/lib/reply-desk/data";
import { PageHeader } from "@/components/page-header";
import { ClientDot, PlatformIcon } from "@/components/post-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TABS: { key: DeskFilter; label: string }[] = [
  { key: "questions", label: "Questions" },
  { key: "open", label: "All open" },
  { key: "noise", label: "Noise" },
  { key: "replied", label: "Replied" },
  { key: "done", label: "Done" },
];

const EMPTY: Record<DeskFilter, string> = {
  questions: "No open questions. Anyone asking something shows up here first.",
  open: "Nothing waiting for a reply.",
  noise: "No emoji-only or tag-a-friend comments to look through.",
  replied: "Replies sent from Cue show up here.",
  done: "Comments marked done show up here.",
};

function ago(iso: string | null): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never";
}

export function ReplyDeskView({
  data,
  filter,
  justConnected,
}: {
  data: ReplyDeskData;
  filter: DeskFilter;
  justConnected: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!justConnected) return;
    toast.success("Connected with comment access");
    router.replace("/replies");
  }, [justConnected, router]);

  function refresh() {
    setRefreshing(true);
    startTransition(async () => {
      try {
        const r = unwrap(await refreshDesk());
        toast.success(
          r.added ? `${r.added} new comment${r.added === 1 ? "" : "s"}` : "No new comments",
          r.errors.length ? { description: r.errors[0] } : undefined,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't refresh.");
      } finally {
        setRefreshing(false);
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow={
          <>
            Reply Desk
            <span className="text-border">/</span>
            <span className={data.counts.questions ? "text-standby-ink" : undefined}>
              {data.counts.questions} question{data.counts.questions === 1 ? "" : "s"}
            </span>
          </>
        }
        title={
          <>
            Every comment, <em>one desk.</em>
          </>
        }
        description="Questions on your clients' Instagram and YouTube posts come first. Reply here and it posts under the comment, as the client."
        actions={
          <Button variant="outline" onClick={refresh} disabled={pending || !data.featureOn}>
            <RefreshCw className={cn(refreshing && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {!data.featureOn && (
        <div className="bg-fault/8 text-fault-ink rounded-2xl border border-fault/20 p-4 text-sm">
          The Reply Desk is switched off for this workspace. Cue support can turn it back on.
        </div>
      )}

      <Accounts accounts={data.accounts} />

      <div className="space-y-4">
        <nav className="bg-muted -mx-1 flex max-w-full gap-0.5 overflow-x-auto rounded-xl p-1 sm:mx-0" aria-label="Show">
          {TABS.map((t) => {
            const active = t.key === filter;
            return (
              <Link
                key={t.key}
                href={t.key === "questions" ? "/replies" : `/replies?show=${t.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-[0.8125rem] font-medium transition-colors",
                  active
                    ? "bg-card text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_0_rgb(20_20_40/0.06)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">
                  {data.counts[t.key]}
                </span>
              </Link>
            );
          })}
        </nav>

        {data.comments.length ? (
          <ul className="space-y-3">
            {data.comments.map((c) => (
              <CommentCard key={c.id} comment={c} aiOn={data.aiOn} />
            ))}
          </ul>
        ) : (
          <div className="text-muted-foreground rounded-2xl border border-dashed px-5 py-10 text-center text-sm">
            {EMPTY[filter]}
          </div>
        )}
      </div>
    </div>
  );
}

function Accounts({ accounts }: { accounts: DeskAccount[] }) {
  if (!accounts.length) {
    return (
      <div className="bg-card rounded-2xl border p-5 text-sm">
        Connect a client&apos;s Instagram or YouTube account in{" "}
        <Link href="/clients" className="text-primary underline underline-offset-2">
          Clients
        </Link>{" "}
        to see its comments here.
      </div>
    );
  }
  return (
    <section className="space-y-3">
      <div className="label-caps">Accounts</div>
      <ul className="flex flex-wrap gap-2">
        {accounts.map((a) => (
          <li key={a.id} className="bg-card flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm">
            <PlatformIcon platform={a.platform} brand className="size-3.5" />
            <ClientDot color={a.clientColor} className="size-2" />
            <span className="max-w-40 truncate font-medium">{a.displayName}</span>
            {a.ready ? (
              <span className="text-muted-foreground text-xs" suppressHydrationWarning>
                checked {ago(a.syncedAt)}
              </span>
            ) : (
              <a
                href={`/api/oauth/${a.platform === "INSTAGRAM" ? "instagram" : "youtube"}/start?clientId=${a.clientId}&comments=1${a.platform === "INSTAGRAM" ? "&next=/replies" : ""}`}
                className="text-primary text-xs font-medium hover:underline"
              >
                Allow comments
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommentCard({ comment: c, aiOn }: { comment: DeskComment; aiOn: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"reply" | "draft" | "state" | null>(null);
  const [, startTransition] = useTransition();

  const run = (kind: "reply" | "draft" | "state", fn: () => Promise<void>) => {
    setBusy(kind);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <li className="bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.04)]">
      <div className="space-y-3 p-5">
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <PlatformIcon platform={c.platform} brand className="size-3.5" />
          <ClientDot color={c.clientColor} className="size-2" />
          <span className="text-foreground font-medium">{c.clientName}</span>
          <span>· {c.accountName}</span>
          <span suppressHydrationWarning>· {ago(c.postedAt)}</span>
          {c.kind === "QUESTION" && (
            <span className="text-standby-ink bg-standby/12 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium">
              Question
            </span>
          )}
          {c.kind === "ABUSE" && (
            <span className="text-fault-ink bg-fault/10 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium">
              Abusive
            </span>
          )}
        </div>
        <p className="text-[0.9375rem] leading-relaxed wrap-break-word whitespace-pre-wrap">
          <span className="font-semibold">{c.author ? (c.platform === "INSTAGRAM" ? `@${c.author}` : c.author) : "Someone"}</span>{" "}
          {c.text}
        </p>
        {c.mediaUrl && (
          <a
            href={c.mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex max-w-full items-center gap-1 text-xs"
          >
            <span className="truncate">on &ldquo;{c.mediaTitle?.slice(0, 80) || "this post"}&rdquo;</span>
            <ArrowUpRight className="size-3 shrink-0" />
          </a>
        )}
      </div>

      {c.state === "OPEN" ? (
        <div className="bg-muted/35 space-y-2 border-t px-5 py-3">
          <Textarea
            value={text}
            rows={2}
            maxLength={REPLY_LIMIT}
            aria-label="Reply"
            placeholder="Write a reply. It posts under the comment, as the client."
            onChange={(e) => setText(e.target.value)}
            className="bg-card"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!text.trim() || busy !== null}
              onClick={() =>
                run("reply", async () => {
                  unwrap(await replyToDeskComment(c.id, text));
                  toast.success("Reply posted");
                  router.refresh();
                })
              }
            >
              {busy === "reply" ? <Loader2 className="animate-spin" /> : <MessageCircleReply />} Reply
            </Button>
            {aiOn && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  run("draft", async () => {
                    setText(unwrap(await draftDeskReply(c.id)));
                  })
                }
              >
                {busy === "draft" ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft with AI
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={busy !== null}
              onClick={() =>
                run("state", async () => {
                  unwrap(await setDeskState(c.id, "DONE"));
                  router.refresh();
                })
              }
            >
              <Check /> Mark done
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-muted/35 flex flex-wrap items-center gap-3 border-t px-5 py-3 text-sm">
          {c.state === "REPLIED" ? (
            <p className="min-w-0 flex-1">
              <span className="text-live-ink font-medium">Replied</span>
              <span className="text-muted-foreground" suppressHydrationWarning>
                {" "}
                by {c.repliedBy} {ago(c.repliedAt)}:
              </span>{" "}
              &ldquo;{c.replyText}&rdquo;
            </p>
          ) : (
            <p className="text-muted-foreground min-w-0 flex-1">Marked done.</p>
          )}
          {c.state === "DONE" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() =>
                run("state", async () => {
                  unwrap(await setDeskState(c.id, "OPEN"));
                  router.refresh();
                })
              }
            >
              <RotateCcw /> Reopen
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
