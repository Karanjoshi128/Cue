"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  Loader2,
  MessageCircleReply,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  draftDeskReply,
  markDeskDone,
  refreshDesk,
  replyToDeskComment,
  setDeskState,
} from "@/lib/reply-desk/actions";
import { unwrap } from "@/lib/action-result";
import { DESK_MAX, DESK_PAGE, REPLY_LIMIT, type DeskFilter } from "@/lib/reply-desk/config";
import type { DeskAccount, DeskComment, ReplyDeskData } from "@/lib/reply-desk/data";
import { Kbd, PageHeader } from "@/components/page-header";
import { PillTabs } from "@/components/pill-tabs";
import { ClientDot, PlatformIcon } from "@/components/post-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const TABS: { key: DeskFilter; label: string }[] = [
  { key: "questions", label: "Questions" },
  { key: "open", label: "Other" },
  { key: "abuse", label: "Abusive" },
  { key: "noise", label: "Low priority" },
  { key: "replied", label: "Replied" },
  { key: "done", label: "Done" },
];

const EMPTY: Record<DeskFilter, string> = {
  questions: "No open questions. Anyone asking something shows up here first.",
  open: "No other comments waiting.",
  abuse: "No abusive comments. Cue's AI flags them here when AI helpers are on.",
  noise: "No emoji-only or tag-a-friend comments to look through.",
  replied: "Replies sent from Cue show up here.",
  done: "Comments marked done show up here.",
};

function ago(iso: string | null): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never";
}

/** Open for more than a day: shown in the standby colour. */
function waitingLong(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > 24 * 60 * 60 * 1000;
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
  // The comment the keyboard is on, and the one with its reply box open.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composingId, setComposingId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (!justConnected) return;
    toast.success("Connected with comment access");
    router.replace("/replies");
  }, [justConnected, router]);

  const comments = data.comments;
  const openIds = comments.filter((c) => c.state === "OPEN").map((c) => c.id);

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

  function markDone(id: string) {
    startTransition(async () => {
      try {
        unwrap(await setDeskState(id, "DONE"));
        if (composingId === id) setComposingId(null);
        toast.success("Marked done", {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                unwrap(await setDeskState(id, "OPEN"));
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Couldn't undo.");
              }
            },
          },
        });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update.");
      }
    });
  }

  // Links that keep the current filter, order and length.
  const showParam = filter === "questions" ? null : filter;
  function href(patch: { sort?: "oldest" | null; limit?: number | null }) {
    const q = new URLSearchParams();
    if (showParam) q.set("show", showParam);
    const sort = patch.sort !== undefined ? patch.sort : data.oldestFirst ? "oldest" : null;
    if (sort) q.set("sort", sort);
    const limit = patch.limit !== undefined ? patch.limit : data.limit > DESK_PAGE ? data.limit : null;
    if (limit) q.set("limit", String(limit));
    const qs = q.toString();
    return qs ? `/replies?${qs}` : "/replies";
  }
  const total = data.counts[filter];
  const clientNames = [...new Set(data.accounts.map((a) => a.clientName))];
  // Nothing can be read: say so instead of an empty "no questions".
  const noAccess = data.accounts.length > 0 && !data.accounts.some((a) => a.ready);
  const stillOpen = (["questions", "open", "abuse", "noise"] as const)
    .filter((f) => f !== filter && data.counts[f] > 0)
    .map(
      (f) =>
        `${data.counts[f]} ${f === "questions" ? "question" : f === "open" ? "other" : f === "abuse" ? "abusive" : "low priority"}`,
    );

  function markAllDone() {
    const t = toast.loading("Clearing…");
    startTransition(async () => {
      try {
        const n = unwrap(await markDeskDone(openIds));
        toast.success(`${n} comment${n === 1 ? "" : "s"} marked done`, { id: t });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update.", { id: t });
      }
    });
  }

  // Keyboard triage: j/k move, r replies, e marks done, Escape closes the box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return;
      if (!comments.length) return;
      const at = comments.findIndex((c) => c.id === activeId);
      const move = (to: number) => {
        const next = comments[Math.max(0, Math.min(comments.length - 1, to))];
        setActiveId(next.id);
        const row = rows.current.get(next.id);
        row?.focus({ preventScroll: true });
        row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      };
      if (e.key === "j") move(at < 0 ? 0 : at + 1);
      else if (e.key === "k") move(at < 0 ? 0 : at - 1);
      else if (e.key === "r" && at >= 0 && comments[at].state === "OPEN") setComposingId(comments[at].id);
      else if (e.key === "e" && at >= 0 && comments[at].state === "OPEN") {
        markDone(comments[at].id);
        // The done one leaves the list: carry on with the one after it.
        const next = comments[at + 1] ?? comments[at - 1];
        if (next) {
          setActiveId(next.id);
          rows.current.get(next.id)?.focus({ preventScroll: true });
        }
      }
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // markDone is recreated each render; the effect re-binds with the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, activeId]);

  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-8">
      <PageHeader
        eyebrow={
          <>
            Reply Desk
            <span className="text-border">/</span>
            <span className={data.counts.questions ? "text-standby-ink" : undefined}>
              {data.counts.questions} question{data.counts.questions === 1 ? "" : "s"}
            </span>
            {data.questionsElsewhere > 0 && (
              <>
                <span className="text-border">/</span>
                <span className="text-muted-foreground">
                  {data.questionsElsewhere} more in other clients
                </span>
              </>
            )}
          </>
        }
        title={
          <>
            Every comment, <em>one desk.</em>
          </>
        }
        description={`Questions on Instagram and YouTube posts come first. Reply here and it posts under the comment as ${
          clientNames.length === 1 ? clientNames[0] : "that client's account"
        }.`}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PillTabs
            label="Show"
            active={filter}
            tabs={TABS.map((t) => ({
              key: t.key,
              label: t.label,
              count: data.counts[t.key],
              alert: t.key === "questions" || t.key === "abuse",
              href: t.key === "questions" ? "/replies" : `/replies?show=${t.key}`,
            }))}
          />
          <div className="flex flex-wrap items-center gap-3">
            {filter !== "replied" && total > 1 && (
              <PillTabs
                label="Order"
                size="sm"
                active={data.oldestFirst ? "oldest" : "newest"}
                tabs={[
                  { key: "newest", label: "Newest first", href: href({ sort: null }) },
                  { key: "oldest", label: "Waiting longest", href: href({ sort: "oldest" }) },
                ]}
              />
            )}
            {comments.length > 0 && (
              <p className="text-muted-foreground hidden items-center gap-1.5 text-xs lg:flex">
                <Kbd>J</Kbd>
                <Kbd>K</Kbd> move <Kbd className="ml-1.5">R</Kbd> reply <Kbd className="ml-1.5">E</Kbd> done
              </p>
            )}
            {(filter === "noise" || filter === "abuse") && openIds.length > 0 && (
              <Button size="sm" variant="outline" onClick={markAllDone} disabled={pending}>
                <CheckCheck /> Mark all {openIds.length} done
              </Button>
            )}
          </div>
        </div>

        {comments.length ? (
          <ul className="space-y-2.5">
            {comments.map((c) => (
              <CommentCard
                key={c.id}
                ref={(el) => {
                  if (el) rows.current.set(c.id, el);
                  else rows.current.delete(c.id);
                }}
                comment={c}
                aiOn={data.aiOn}
                active={c.id === activeId}
                composing={c.id === composingId}
                onCompose={(on) => {
                  setActiveId(c.id);
                  setComposingId(on ? c.id : null);
                }}
                onDone={() => markDone(c.id)}
                busy={pending}
              />
            ))}
          </ul>
        ) : noAccess ? (
          <div className="bg-standby/6 border-standby/30 space-y-2 rounded-2xl border px-5 py-6 text-center text-sm">
            <p className="font-medium">Cue can&apos;t see these comments yet.</p>
            <p className="text-muted-foreground">
              Use Allow comments next to the account above. It opens Instagram or Google for a
              minute, then brings you back here.
            </p>
          </div>
        ) : (
          <div className="text-muted-foreground space-y-1 rounded-2xl border border-dashed px-5 py-10 text-center text-sm">
            <p>{filter === "replied" || filter === "done" || !stillOpen.length ? EMPTY[filter] : "All caught up here."}</p>
            {filter !== "replied" && filter !== "done" && stillOpen.length > 0 && (
              <p className="text-xs">Still open: {stillOpen.join(", ")}.</p>
            )}
          </div>
        )}
        {comments.length > 0 && total > comments.length && (
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <span className="text-muted-foreground text-xs">
              Showing {comments.length} of {total}
            </span>
            {data.limit < DESK_MAX && (
              <Button
                variant="outline"
                size="sm"
                render={<Link href={href({ limit: data.limit + DESK_PAGE })} scroll={false} />}
              >
                Show {Math.min(DESK_PAGE, total - comments.length)} more
              </Button>
            )}
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

function CommentCard({
  ref,
  comment: c,
  aiOn,
  active,
  composing,
  onCompose,
  onDone,
  busy: listBusy,
}: {
  ref: (el: HTMLLIElement | null) => void;
  comment: DeskComment;
  aiOn: boolean;
  active: boolean;
  composing: boolean;
  onCompose: (on: boolean) => void;
  onDone: () => void;
  busy: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"reply" | "draft" | "state" | null>(null);
  const [, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (composing) box.current?.focus();
  }, [composing]);

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

  const send = () =>
    run("reply", async () => {
      unwrap(await replyToDeskComment(c.id, text));
      toast.success("Reply posted");
      setText("");
      onCompose(false);
      router.refresh();
    });

  const draft = () => {
    onCompose(true);
    run("draft", async () => {
      setText(unwrap(await draftDeskReply(c.id)));
      box.current?.focus();
    });
  };

  const who = c.author ? (c.platform === "INSTAGRAM" ? `@${c.author}` : c.author) : "Someone";
  const platform = c.platform === "INSTAGRAM" ? "Instagram" : "YouTube";
  const abusive = c.kind === "ABUSE";
  const disabled = busy !== null || listBusy;
  // AI drafts leave facts it can't know as [blanks]; they mustn't go out.
  const blank = /\[[^\]\n]{1,40}\]/.exec(text)?.[0] ?? null;

  return (
    <li
      ref={ref}
      tabIndex={-1}
      aria-labelledby={`c-${c.id}`}
      className={cn(
        "bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.04)] transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "ring-primary/50 ring-2",
      )}
    >
      <div className="space-y-2 px-4 py-3.5 sm:px-5">
        <h3 id={`c-${c.id}`} className="sr-only">
          {who} on {platform}, {c.clientName}
        </h3>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <PlatformIcon platform={c.platform} brand className="size-3.5" />
          <span className="sr-only">{platform}</span>
          <ClientDot color={c.clientColor} className="size-2" />
          <span className="text-foreground font-medium">{c.clientName}</span>
          <span className="truncate">· {c.accountName}</span>
          <span
            suppressHydrationWarning
            className={cn(c.state === "OPEN" && waitingLong(c.postedAt) && "text-standby-ink font-medium")}
            title={c.state === "OPEN" && waitingLong(c.postedAt) ? "Waiting over a day" : undefined}
          >
            · {ago(c.postedAt)}
          </span>
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
          <span className="font-semibold">{who}</span> {c.text}
        </p>
        {abusive && c.state === "OPEN" && (
          <p className="text-muted-foreground text-xs">
            Cue can&apos;t hide or delete comments yet. To remove it, open it on {platform}.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {c.mediaUrl ? (
            <a
              href={c.mediaUrl}
              target="_blank"
              rel="noreferrer"
              title={c.mediaTitle ?? undefined}
              className="text-muted-foreground hover:text-foreground inline-flex max-w-full min-w-0 flex-1 basis-48 items-center gap-1 text-xs"
            >
              <span className="truncate">on &ldquo;{c.mediaTitle || "this post"}&rdquo;</span>
              <ArrowUpRight className="size-3 shrink-0" />
            </a>
          ) : (
            <span className="flex-1" />
          )}
          {c.state === "OPEN" && !composing && (
            <div className="-mr-1.5 flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onCompose(true)}
                disabled={disabled}
                aria-label={`Reply to ${who}`}
              >
                <MessageCircleReply /> Reply
              </Button>
              {aiOn && !abusive && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={draft}
                  disabled={disabled}
                  aria-label={`Draft a reply to ${who} with AI`}
                >
                  {busy === "draft" ? <Loader2 className="animate-spin" /> : <Sparkles />} Draft with AI
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={onDone}
                disabled={disabled}
                aria-label={`Mark done: ${who}'s comment`}
                title="Nothing to say? Mark it done."
              >
                <Check /> Done
              </Button>
            </div>
          )}
        </div>
      </div>

      {c.state === "OPEN" && composing && (
        <div className="bg-muted/35 space-y-2 border-t px-4 py-3 sm:px-5">
          <Textarea
            ref={box}
            value={text}
            rows={3}
            maxLength={REPLY_LIMIT}
            aria-label={`Reply to ${who}`}
            placeholder={`Reply to ${who}. It posts under the comment, as ${c.clientName}.`}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={blank ? true : undefined}
            aria-describedby={blank ? `blank-${c.id}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && !disabled && !blank) {
                e.preventDefault();
                send();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCompose(false);
              }
            }}
            className="bg-card"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!text.trim() || disabled || !!blank} onClick={send}>
              {busy === "reply" ? <Loader2 className="animate-spin" /> : <MessageCircleReply />} Post reply
            </Button>
            {aiOn && !abusive && (
              <Button size="sm" variant="outline" disabled={disabled} onClick={draft}>
                {busy === "draft" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {text.trim() ? "Draft again" : "Draft with AI"}
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy === "reply"} onClick={() => onCompose(false)}>
              Cancel
            </Button>
            {blank ? (
              <span id={`blank-${c.id}`} className="text-standby-ink ml-auto text-xs font-medium">
                Fill in {blank} first
              </span>
            ) : (
              <span className="text-muted-foreground ml-auto hidden text-xs sm:inline">
                <Kbd>Ctrl</Kbd> <Kbd>Enter</Kbd> posts
              </span>
            )}
          </div>
        </div>
      )}

      {c.state !== "OPEN" && (
        <div className="bg-muted/35 flex flex-wrap items-center gap-3 border-t px-4 py-2.5 text-sm sm:px-5">
          {c.state === "REPLIED" && c.replyText === null ? (
            <p className="min-w-0 flex-1">
              <span className="text-live-ink font-medium">Answered</span>
              <span className="text-muted-foreground" suppressHydrationWarning>
                {" "}
                by {c.repliedBy} {ago(c.repliedAt)}
              </span>
            </p>
          ) : c.state === "REPLIED" ? (
            <p className="min-w-0 flex-1">
              <span className="text-live-ink font-medium">Replied</span>
              <span className="text-muted-foreground" suppressHydrationWarning>
                {" "}
                by {c.repliedBy} {ago(c.repliedAt)}:
              </span>{" "}
              &ldquo;{c.replyText}&rdquo;
            </p>
          ) : (
            <p className="text-muted-foreground min-w-0 flex-1">Done in Cue. It&apos;s still on {platform}.</p>
          )}
          {c.state === "DONE" && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
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
