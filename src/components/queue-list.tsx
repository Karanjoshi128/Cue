"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ClientDot,
  PlatformIcon,
  StatusBadge,
} from "@/components/post-bits";
import { cn } from "@/lib/utils";
import {
  Check,
  ExternalLink,
  MessageSquare,
  Pencil,
  RotateCw,
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

const approvalMeta: Record<
  ApprovalStatus,
  { label: string; className: string } | null
> = {
  APPROVED: null,
  PENDING: {
    label: "In review",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  CHANGES_REQUESTED: {
    label: "Changes requested",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
};

export function QueueList({
  posts,
  initialFilter = "ALL",
  currentUserId,
}: {
  posts: PostLite[];
  initialFilter?: Filter;
  currentUserId: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const shown =
    filter === "ALL" ? posts : posts.filter((p) => p.status === filter);

  function toggleComments(id: string) {
    setOpenComments((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onApproval(id: string, approval: ApprovalStatus, ok: string) {
    startTransition(async () => {
      try {
        await setApproval(id, approval);
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
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
    startTransition(async () => {
      try {
        await retryPost(id);
        toast.success("Retrying…");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Retry failed");
      }
    });
  }
  function onDelete() {
    if (!confirmId) return;
    const id = confirmId;
    startTransition(async () => {
      try {
        await deletePost(id);
        toast.success("Deleted");
        setConfirmId(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-sm capitalize transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {f.toLowerCase()}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No posts here.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {shown.map((post) => (
              <motion.li
                key={post.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
              >
                <Card>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <ClientDot color={post.clientColor} />
                        <span className="text-sm font-medium">
                          {post.clientName}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {post.scheduledAt
                            ? format(new Date(post.scheduledAt), "MMM d, h:mm a")
                            : "Draft"}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {approvalMeta[post.approval] && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "font-medium",
                              approvalMeta[post.approval]!.className,
                            )}
                          >
                            {approvalMeta[post.approval]!.label}
                          </Badge>
                        )}
                        <StatusBadge status={post.status} />
                      </div>
                    </div>

                    <p className="text-sm whitespace-pre-wrap">{post.body}</p>

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {post.targets.map((t) => (
                        <span
                          key={t.id}
                          className="text-muted-foreground flex items-center gap-1 text-xs"
                          title={t.error ?? t.status}
                        >
                          <PlatformIcon platform={t.platform} />
                          {t.permalink ? (
                            <a
                              href={t.permalink}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-primary inline-flex items-center gap-0.5"
                            >
                              View <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            <span className="capitalize">
                              {t.status.toLowerCase()}
                            </span>
                          )}
                        </span>
                      ))}
                      <div className="ml-auto flex gap-1">
                        {(post.status === "DRAFT" ||
                          post.status === "SCHEDULED") && (
                          <Button
                            render={
                              <Link href={`/composer?edit=${post.id}`} />
                            }
                            size="sm"
                            variant="ghost"
                          >
                            <Pencil className="size-4" /> Edit
                          </Button>
                        )}
                        {(post.status === "FAILED" ||
                          post.status === "PARTIAL") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => onRetry(post.id)}
                          >
                            <RotateCw className="size-4" /> Retry
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setConfirmId(post.id)}
                          aria-label="Delete post"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {post.targets.some((t) => t.error) && (
                      <p className="text-destructive bg-destructive/10 rounded-md px-2 py-1 text-xs">
                        {post.targets.find((t) => t.error)?.error}
                      </p>
                    )}

                    <div className="flex items-center gap-1 border-t pt-2">
                      {(post.status === "DRAFT" ||
                        post.status === "SCHEDULED") &&
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
                              onClick={() =>
                                onApproval(post.id, "APPROVED", "Approved")
                              }
                            >
                              <Check className="size-4" /> Approve
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
                                <X className="size-4" /> Request changes
                              </Button>
                            )}
                          </>
                        ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => toggleComments(post.id)}
                      >
                        <MessageSquare className="size-4" />
                        {post.comments.length > 0 && post.comments.length}
                      </Button>
                    </div>

                    {openComments.has(post.id) && (
                      <div className="space-y-3 border-t pt-3">
                        {post.comments.length === 0 ? (
                          <p className="text-muted-foreground text-xs">
                            No comments yet.
                          </p>
                        ) : (
                          post.comments.map((c) => (
                            <div key={c.id} className="text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {c.authorName}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                  {format(
                                    new Date(c.createdAt),
                                    "MMM d, h:mm a",
                                  )}
                                </span>
                                {c.authorId === currentUserId && (
                                  <button
                                    type="button"
                                    aria-label="Delete comment"
                                    className="text-muted-foreground hover:text-destructive ml-auto"
                                    onClick={() => onDeleteComment(c.id)}
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-muted-foreground whitespace-pre-wrap">
                                {c.body}
                              </p>
                            </div>
                          ))
                        )}
                        <div className="flex gap-2">
                          <Input
                            value={drafts[post.id] ?? ""}
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
                            size="sm"
                            disabled={pending || !(drafts[post.id] ?? "").trim()}
                            onClick={() => onAddComment(post.id)}
                            aria-label="Add comment"
                          >
                            <Send className="size-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.li>
            ))}
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
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            This can&apos;t be undone. Already-published posts stay live on the
            platform.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
