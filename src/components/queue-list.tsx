"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, isToday, isTomorrow } from "date-fns";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import type {
  ApprovalStatus,
  Platform,
  PostStatus,
  TargetStatus,
} from "@prisma/client";
import {
  addComment,
  deleteComment,
  deletePost,
  retryPost,
  setApproval,
} from "@/lib/actions";
import { POST_FILTERS, type PostFilter } from "@/lib/post-filters";
import { zoned } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ClientMonogram,
  PlatformIcon,
  StatusBadge,
  StatusDot,
  PLATFORM_META,
} from "@/components/post-bits";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  MessageSquare,
  Pencil,
  RotateCw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";

interface TargetLite {
  id: string;
  platform: Platform;
  status: TargetStatus;
  error: string | null;
  permalink: string | null;
}
interface CommentLite {
  id: string;
  body: string;
  authorName: string;
  authorId: string;
  createdAt: string;
}
interface PostLite {
  id: string;
  body: string;
  status: PostStatus;
  approval: ApprovalStatus;
  scheduledAt: string | null;
  clientName: string;
  clientColor: string | null;
  targets: TargetLite[];
  comments: CommentLite[];
}

const FILTERS = POST_FILTERS;
type Filter = PostFilter;

const FILTER_LABEL: Record<Filter, string> = {
  ALL: "All",
  DRAFT: "Drafts",
  SCHEDULED: "Scheduled",
  PUBLISHING: "Publishing",
  PUBLISHED: "Published",
  PARTIAL: "Partial",
  FAILED: "Failed",
};

const approvalMeta: Record<
  ApprovalStatus,
  { label: string; className: string } | null
> = {
  APPROVED: null,
  PENDING: {
    label: "In review",
    className: "text-standby-ink bg-standby/12",
  },
  CHANGES_REQUESTED: {
    label: "Changes requested",
    className: "text-fault-ink bg-fault/10",
  },
};

export function QueueList({
  posts,
  initialFilter = "ALL",
  currentUserId,
  timeZone,
}: {
  posts: PostLite[];
  initialFilter?: Filter;
  currentUserId: string;
  timeZone: string;
}) {
  const router = useRouter();
  const ctx = useMemo(() => ({ in: zoned(timeZone) }), [timeZone]);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const counts = useMemo(() => {
    const c = Object.fromEntries(FILTERS.map((f) => [f, 0])) as Record<Filter, number>;
    c.ALL = posts.length;
    for (const p of posts) c[p.status as Filter] = (c[p.status as Filter] ?? 0) + 1;
    return c;
  }, [posts]);

  const q = query.trim().toLowerCase();
  const shown = posts.filter(
    (p) =>
      (filter === "ALL" || p.status === filter) &&
      (!q ||
        p.body.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q)),
  );

  function when(iso: string) {
    const d = new Date(iso);
    return {
      day: isToday(d, ctx)
        ? "Today"
        : isTomorrow(d, ctx)
          ? "Tomorrow"
          : format(d, "EEE d MMM", ctx),
      time: format(d, "h:mm a", ctx),
    };
  }

  function toggleComments(id: string) {
    setOpenComments((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onApproval(id: string, approval: ApprovalStatus, ok: string) {
    const t = toast.loading("Updating…");
    startTransition(async () => {
      try {
        await setApproval(id, approval);
        toast.success(ok, { id: t });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed", { id: t });
      }
    });
  }

  function onAddComment(id: string) {
    const body = (drafts[id] ?? "").trim();
    if (!body) return;
    startTransition(async () => {
      try {
        await addComment(id, body);
        setDrafts((d) => ({ ...d, [id]: "" }));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to comment");
      }
    });
  }

  function onDeleteComment(id: string) {
    startTransition(async () => {
      try {
        await deleteComment(id);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function onRetry(id: string) {
    const t = toast.loading("Retrying…");
    startTransition(async () => {
      try {
        await retryPost(id);
        toast.success("Retrying…", { id: t });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Retry failed", { id: t });
      }
    });
  }
  function onDelete() {
    if (!confirmId) return;
    const id = confirmId;
    const t = toast.loading("Deleting…");
    startTransition(async () => {
      try {
        await deletePost(id);
        toast.success("Deleted", { id: t });
        setConfirmId(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed", {
          id: t,
        });
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="scrollbar-none bg-muted -mx-1 flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl p-1 sm:mx-0"
          role="tablist"
          aria-label="Filter by status"
        >
          {FILTERS.map((f) => {
            const active = filter === f;
            const n = counts[f] ?? 0;
            return (
              <button
                key={f}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f)}
                className={cn(
                  "relative flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  !active && n === 0 && f !== "ALL" && "opacity-55",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="queue-filter"
                    className="bg-card absolute inset-0 rounded-lg shadow-[0_0_0_1px_var(--border),0_1px_2px_0_rgb(20_20_40/0.06)]"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                {f !== "ALL" && <StatusDot status={f} className="relative" />}
                <span className="relative">{FILTER_LABEL[f]}</span>
                <span className="text-muted-foreground relative font-mono text-[0.6875rem] tabular-nums">
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts or clients"
            aria-label="Search posts or clients"
            className="pl-9"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="bg-card relative overflow-hidden rounded-2xl border px-6 py-20 text-center">
          <div
            aria-hidden
            className="bg-grid pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_at_center,black,transparent_70%)]"
          />
          <p className="headline relative text-2xl">
            {q ? (
              <>
                No match for <em>&ldquo;{query}&rdquo;</em>
              </>
            ) : (
              <>
                Nothing <em>here.</em>
              </>
            )}
          </p>
          <p className="text-muted-foreground relative mt-2 text-sm">
            {q
              ? "Try a client name or a word from the caption."
              : filter === "FAILED"
                ? "No failed posts. Everything went out as planned."
                : "Posts you write show up here, newest first."}
          </p>
          {!q && (
            <Button render={<Link href="/composer" />} className="relative mt-5">
              Write a post
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {shown.map((post) => {
              const t = post.scheduledAt ? when(post.scheduledAt) : null;
              const err = post.targets.find((x) => x.error)?.error;
              const editable =
                post.status === "DRAFT" || post.status === "SCHEDULED";
              const commentsOpen = openComments.has(post.id);
              return (
                <motion.li
                  key={post.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="bg-card overflow-hidden rounded-2xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.04)]"
                >
                  {err && (
                    <div className="text-fault-ink bg-fault/[0.07] border-fault/15 flex items-start gap-2 border-b px-5 py-2.5 text-xs">
                      <AlertTriangle className="mt-px size-3.5 shrink-0" />
                      <span className="leading-relaxed">{err}</span>
                    </div>
                  )}
                  <div className="grid gap-4 p-5 sm:grid-cols-[7.5rem_1fr]">
                    {/* Time column */}
                    <div className="flex items-center gap-3 sm:block">
                      {t ? (
                        <>
                          <div className="font-mono text-[0.6875rem] tracking-wide uppercase">
                            {t.day}
                          </div>
                          <div className="text-muted-foreground font-mono text-[0.6875rem] tracking-wide uppercase sm:mt-0.5">
                            {t.time}
                          </div>
                        </>
                      ) : (
                        <div className="text-muted-foreground font-mono text-[0.6875rem] tracking-wide uppercase">
                          Unscheduled
                        </div>
                      )}
                      <StatusBadge status={post.status} className="ml-auto sm:mt-3 sm:ml-0" />
                    </div>

                    {/* Body */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <ClientMonogram
                          name={post.clientName}
                          color={post.clientColor}
                          className="size-7 rounded-lg text-[0.625rem]"
                        />
                        <span className="truncate text-sm font-semibold">
                          {post.clientName}
                        </span>
                        {approvalMeta[post.approval] && (
                          <span
                            className={cn(
                              "rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium",
                              approvalMeta[post.approval]!.className,
                            )}
                          >
                            {approvalMeta[post.approval]!.label}
                          </span>
                        )}
                      </div>

                      <p className="mt-3 line-clamp-4 text-[0.9375rem] leading-relaxed wrap-break-word whitespace-pre-wrap">
                        {post.body}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {post.targets.map((tg) => (
                          <span
                            key={tg.id}
                            className="bg-background flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs shadow-[0_0_0_1px_var(--border)]"
                            title={tg.error ?? tg.status.toLowerCase()}
                          >
                            <PlatformIcon platform={tg.platform} brand className="size-3.5" />
                            <StatusDot status={tg.status} />
                            {tg.permalink ? (
                              <a
                                href={tg.permalink}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-primary inline-flex items-center gap-0.5 self-stretch font-medium"
                              >
                                View <ArrowUpRight className="size-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">
                                {PLATFORM_META[tg.platform].label}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action strip */}
                  <div className="bg-muted/35 flex flex-wrap items-center gap-1 border-t px-3 py-2">
                    {editable &&
                      (post.approval === "APPROVED" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            onApproval(post.id, "PENDING", "Sent for approval")
                          }
                        >
                          Send for approval
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            className="text-live-ink"
                            onClick={() =>
                              onApproval(post.id, "APPROVED", "Approved")
                            }
                          >
                            <Check /> Approve
                          </Button>
                          {post.approval === "PENDING" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() =>
                                onApproval(
                                  post.id,
                                  "CHANGES_REQUESTED",
                                  "Changes requested",
                                )
                              }
                            >
                              <X /> Request changes
                            </Button>
                          )}
                        </>
                      ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Toggle comments"
                      aria-expanded={commentsOpen}
                      onClick={() => toggleComments(post.id)}
                      className={cn(commentsOpen && "bg-accent")}
                    >
                      <MessageSquare />
                      {post.comments.length > 0 ? post.comments.length : "Note"}
                    </Button>
                    <div className="ml-auto flex gap-1">
                      {editable && (
                        <Button
                          render={<Link href={`/composer?edit=${post.id}`} />}
                          size="sm"
                          variant="ghost"
                        >
                          <Pencil /> Edit
                        </Button>
                      )}
                      {(post.status === "FAILED" ||
                        post.status === "PARTIAL") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => onRetry(post.id)}
                        >
                          <RotateCw /> Retry
                        </Button>
                      )}
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setConfirmId(post.id)}
                        aria-label="Delete post"
                        className="hover:text-destructive"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {commentsOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-4 border-t px-5 py-4">
                          {post.comments.length === 0 ? (
                            <p className="text-muted-foreground text-xs">
                              No notes yet. Leave one for your team or the
                              approver.
                            </p>
                          ) : (
                            <ol className="space-y-3">
                              {post.comments.map((c) => (
                                <li key={c.id} className="flex gap-3 text-sm">
                                  <span className="bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full font-mono text-[0.625rem] font-semibold uppercase">
                                    {c.authorName.slice(0, 2)}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">
                                        {c.authorName}
                                      </span>
                                      <span className="text-muted-foreground font-mono text-[0.6875rem]">
                                        {format(
                                          new Date(c.createdAt),
                                          "d MMM, h:mm a",
                                          ctx,
                                        )}
                                      </span>
                                      {c.authorId === currentUserId && (
                                        <button
                                          type="button"
                                          aria-label="Delete comment"
                                          className="text-muted-foreground hover:text-destructive -m-1 ml-auto p-1"
                                          onClick={() => onDeleteComment(c.id)}
                                        >
                                          <X className="size-3.5" />
                                        </button>
                                      )}
                                    </div>
                                    <p className="text-muted-foreground mt-0.5 wrap-break-word whitespace-pre-wrap">
                                      {c.body}
                                    </p>
                                  </div>
                                </li>
                              ))}
                            </ol>
                          )}
                          <div className="flex gap-2">
                            <Input
                              value={drafts[post.id] ?? ""}
                              aria-label="Add a note"
                              onChange={(e) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [post.id]: e.target.value,
                                }))
                              }
                              placeholder="Add a note…"
                              onKeyDown={(e) =>
                                e.key === "Enter" && onAddComment(post.id)
                              }
                            />
                            <Button
                              size="icon"
                              disabled={pending || !(drafts[post.id] ?? "").trim()}
                              onClick={() => onAddComment(post.id)}
                              aria-label="Add comment"
                            >
                              <Send />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <Dialog
        open={Boolean(confirmId)}
        onOpenChange={(o) => !o && setConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. Anything already published stays live
              on the platform.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              <Trash2 /> Delete post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
