"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpRight,
  AtSign,
  CalendarClock,
  Check,
  Download,
  Lock,
  MessageCircleReply,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import {
  checkCommentsNow,
  deleteAutomation,
  deleteLead,
  resolveHeld,
  setAutomationEnabled,
} from "@/lib/automation-actions";
import { unwrap } from "@/lib/action-result";
import { RUN_RETENTION_DAYS, type AutomationPreset } from "@/lib/automations/config";
import type {
  AutomationAccountView,
  AutomationRuleView,
  AutomationsPageData,
} from "@/lib/automations/data";
import { zoned } from "@/lib/timezone";
import { PageHeader } from "@/components/page-header";
import { ClientDot, PlatformIcon } from "@/components/post-bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AutomationEditor, MediaThumb } from "@/components/automations/automation-editor";
import { KeywordChip, RunBadge, TriggerSummary } from "@/components/automations/bits";
import { DescribeAutomation } from "@/components/automations/describe-automation";
import { cn } from "@/lib/utils";

function ago(iso: string | null): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never";
}

/** Where a conversation has got to, in words, for the activity log. */
function stageNote(run: AutomationsPageData["runs"][number]): string | null {
  if (run.status !== "SENT" && run.status !== "PARTIAL") return null;
  if (run.delivered) return "Link delivered";
  if (run.stage === "WAIT_TAP") return "Waiting for their tap";
  if (run.stage === "WAIT_FOLLOW") return "Asked them to follow first";
  if (run.stage === "WAIT_ANSWER") return "Waiting for their answer";
  return null;
}

const TRIGGER_NOTE = { COMMENT: "", STORY_REPLY: "story reply · ", DM_KEYWORD: "DM · " } as const;
const SOURCE_LABEL = { COMMENT: "Comment", STORY_REPLY: "Story reply", DM_KEYWORD: "DM" } as const;

export function AutomationsView({
  data,
  timeZone,
  justConnected,
}: {
  data: AutomationsPageData;
  timeZone: string;
  justConnected: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<{
    key: number;
    rule: AutomationRuleView | null;
    accountId?: string;
    preset?: AutomationPreset;
  }>({ key: 0, rule: null });
  const [toDelete, setToDelete] = useState<AutomationRuleView | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  useEffect(() => {
    if (!justConnected) return;
    toast.success("Instagram connected with comment access");
    router.replace("/automations");
  }, [justConnected, router]);

  const ready = data.accounts.filter((a) => a.ready);
  const live = data.rules.filter((r) => r.enabled).length;
  const ctx = { in: zoned(timeZone) };

  function openNew(accountId?: string) {
    setEditor((e) => ({ key: e.key + 1, rule: null, accountId }));
    setEditorOpen(true);
  }
  function openDescribed(preset: AutomationPreset, accountId: string) {
    setEditor((e) => ({ key: e.key + 1, rule: null, accountId, preset }));
    setEditorOpen(true);
  }
  function openEdit(rule: AutomationRuleView) {
    setEditor((e) => ({ key: e.key + 1, rule }));
    setEditorOpen(true);
  }

  function toggle(rule: AutomationRuleView, enabled: boolean) {
    startTransition(async () => {
      try {
        unwrap(await setAutomationEnabled(rule.id, enabled));
        toast.success(enabled ? `${rule.name} is live` : `${rule.name} is paused`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update.");
      }
    });
  }

  function remove() {
    if (!toDelete) return;
    const rule = toDelete;
    const t = toast.loading("Deleting…");
    startTransition(async () => {
      try {
        unwrap(await deleteAutomation(rule.id));
        toast.success("Automation deleted", { id: t });
        setToDelete(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't delete.", { id: t });
      }
    });
  }

  function resolve(runId: string, send: boolean) {
    startTransition(async () => {
      try {
        unwrap(await resolveHeld(runId, send));
        toast.success(send ? "Sent" : "Dismissed");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't update.");
      }
    });
  }

  function removeLead(id: string) {
    startTransition(async () => {
      try {
        unwrap(await deleteLead(id));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't remove.");
      }
    });
  }

  function checkNow(accountId: string) {
    setChecking(accountId);
    startTransition(async () => {
      try {
        const r = unwrap(await checkCommentsNow(accountId));
        toast.success(
          r.matched
            ? `${r.matched} new match${r.matched === 1 ? "" : "es"}, ${r.sent} sent`
            : `Checked ${r.comments} comment${r.comments === 1 ? "" : "s"}. No new matches.`,
          r.error ? { description: r.error } : undefined,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't check comments.");
      } finally {
        setChecking(null);
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow={
          <>
            <PlatformIcon platform="INSTAGRAM" className="size-3" />
            Automations
            <span className="text-border">/</span>
            <span className={live ? "text-live-ink" : undefined}>{live} live</span>
          </>
        }
        title={
          <>
            Comments that <em>answer back.</em>
          </>
        }
        description="When someone comments a keyword on a client's Instagram post, Cue replies under the comment and sends them a DM with the link, the guide or the price they asked for."
        actions={
          <Button onClick={() => openNew()} disabled={!ready.length || !data.featureOn}>
            <Plus /> New automation
          </Button>
        }
      />

      {!data.featureOn && (
        <div className="bg-fault/8 text-fault-ink flex items-start gap-3 rounded-2xl border border-fault/20 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Instagram automations are switched off for this workspace. Nothing here runs
          until Cue support turns them back on.
        </div>
      )}

      <AccountsStrip
        accounts={data.accounts}
        checking={checking}
        onCheck={checkNow}
        onNew={openNew}
        busy={pending}
      />

      {data.aiOn && data.featureOn && ready.length > 0 && (
        <DescribeAutomation accounts={ready} onDraft={openDescribed} />
      )}

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">Your automations</h2>
          <span className="label-caps">{data.rules.length} total</span>
        </div>
        {data.rules.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.rules.map((rule) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                timeZone={timeZone}
                busy={pending}
                checking={checking === rule.accountId}
                onToggle={(v) => toggle(rule, v)}
                onEdit={() => openEdit(rule)}
                onCheck={() => checkNow(rule.accountId)}
                onDelete={() => setToDelete(rule)}
              />
            ))}
          </div>
        ) : (
          <HowItWorks canCreate={ready.length > 0 && data.featureOn} onNew={() => openNew()} />
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">Recent activity</h2>
            <p className="text-muted-foreground text-xs">
              Every comment, story reply and DM an automation acted on. Kept for{" "}
              {RUN_RETENTION_DAYS} days.
            </p>
          </div>
        </div>
        {data.runs.length ? (
          <ol className="bg-card divide-y rounded-2xl border">
            {data.runs.map((run) => (
              <li key={run.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                <time
                  dateTime={run.createdAt}
                  className="text-muted-foreground shrink-0 pt-0.5 font-mono text-[0.6875rem] tracking-wide whitespace-nowrap uppercase sm:w-36"
                >
                  {format(new Date(run.createdAt), "d MMM · h:mm a", ctx)}
                </time>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-sm">
                    <span className="font-semibold">
                      {run.commenter ? `@${run.commenter}` : "Someone"}
                    </span>{" "}
                    <span className="text-muted-foreground">&ldquo;{run.comment}&rdquo;</span>
                  </p>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                    <ClientDot color={run.clientColor} className="size-2" />
                    {TRIGGER_NOTE[run.trigger]}
                    {run.clientName} · {run.ruleName}
                    {run.dmSent && (
                      <span className="text-live-ink inline-flex items-center gap-1">
                        · <Send className="size-3" /> DM
                      </span>
                    )}
                    {run.replied && (
                      <span className="text-live-ink inline-flex items-center gap-1">
                        · <MessageCircleReply className="size-3" /> Reply
                      </span>
                    )}
                  </p>
                  {stageNote(run) && (
                    <p className={cn("mt-1 text-xs", run.delivered ? "text-live-ink" : "text-standby-ink")}>
                      {stageNote(run)}
                    </p>
                  )}
                  {run.status === "HELD" && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-standby-ink text-xs">Held: {run.heldReason}</span>
                      <Button size="xs" variant="outline" onClick={() => resolve(run.id, true)} disabled={pending}>
                        <Check /> Send anyway
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => resolve(run.id, false)} disabled={pending}>
                        <X /> Dismiss
                      </Button>
                    </div>
                  )}
                  {run.error && run.status !== "SENT" && run.status !== "HELD" && (
                    <p
                      className={cn(
                        "mt-1 text-xs leading-relaxed",
                        run.status === "QUEUED" ? "text-standby-ink" : "text-fault-ink",
                      )}
                    >
                      {run.error}
                    </p>
                  )}
                </div>
                <RunBadge status={run.status} retrying={run.status === "QUEUED" && !!run.error} />
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-muted-foreground rounded-2xl border border-dashed px-5 py-8 text-center text-sm">
            Nothing yet. Matching comments show up here as they happen.
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[0.9375rem] font-semibold tracking-tight">Leads</h2>
            <p className="text-muted-foreground text-xs">
              Everyone an automation talked to, with any email or phone they shared.{" "}
              {data.leadTotal} in total.
            </p>
          </div>
          {data.leadTotal > 0 && (
            <Button variant="outline" size="sm" render={<a href="/api/automations/leads" download />}>
              <Download /> Export CSV
            </Button>
          )}
        </div>
        {data.leads.length ? (
          <ul className="bg-card divide-y rounded-2xl border">
            {data.leads.map((lead) => (
              <li key={lead.id} className="group/lead flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-semibold">
                    {lead.username ? `@${lead.username}` : "Instagram user"}
                  </p>
                  <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
                    <ClientDot color={lead.clientColor} className="size-2" />
                    {lead.clientName} · {SOURCE_LABEL[lead.source]}
                    {lead.lastRule && ` · ${lead.lastRule}`}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {lead.email && (
                    <span className="inline-flex items-center gap-1.5">
                      <AtSign className="text-muted-foreground size-3.5" /> {lead.email}
                    </span>
                  )}
                  {lead.phone && <span className="font-mono">{lead.phone}</span>}
                  <span className="text-muted-foreground" suppressHydrationWarning>
                    {lead.touches > 1 ? `${lead.touches} times · ` : ""}
                    {ago(lead.lastSeenAt)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${lead.username ?? "this lead"}`}
                  onClick={() => removeLead(lead.id)}
                  disabled={pending}
                  className="sm:opacity-0 sm:group-hover/lead:opacity-100 sm:focus-visible:opacity-100"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-muted-foreground rounded-2xl border border-dashed px-5 py-8 text-center text-sm">
            No leads yet. Everyone an automation talks to is added here.
          </div>
        )}
      </section>

      {/* Keyed so each open starts from that rule's values (or a blank form). */}
      <AutomationEditor
        key={editor.key}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        rule={editor.rule}
        accounts={ready}
        posts={data.posts}
        defaultAccountId={editor.accountId}
        timeZone={timeZone}
        aiOn={data.aiOn}
        preset={editor.preset}
      />

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {toDelete?.name}?</DialogTitle>
            <DialogDescription>
              It stops replying straight away, and its activity log is deleted. People who
              already got the DM keep it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              Delete automation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountsStrip({
  accounts,
  checking,
  onCheck,
  onNew,
  busy,
}: {
  accounts: AutomationAccountView[];
  checking: string | null;
  onCheck: (accountId: string) => void;
  onNew: (accountId: string) => void;
  busy: boolean;
}) {
  if (!accounts.length) {
    return (
      <section className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5">
        <div className="space-y-1">
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">
            Connect an Instagram account first
          </h2>
          <p className="text-muted-foreground text-sm">
            Automations run on a client&apos;s Instagram professional account.
          </p>
        </div>
        <Button render={<Link href="/clients" />} variant="outline">
          Go to Clients <ArrowUpRight />
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="label-caps">Instagram accounts</div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <li
            key={a.id}
            className="bg-card flex items-center gap-3 rounded-xl border px-3.5 py-3"
          >
            <ClientDot color={a.clientColor} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{a.displayName}</div>
              <div className="text-muted-foreground truncate text-xs">
                {a.clientName} ·{" "}
                {a.ready ? (
                  <span suppressHydrationWarning>checked {ago(a.checkedAt)}</span>
                ) : (
                  <span className="text-standby-ink">needs comment access</span>
                )}
              </div>
            </div>
            {a.ready ? (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Check ${a.displayName}'s comments now`}
                  title="Check comments now"
                  onClick={() => onCheck(a.id)}
                  disabled={busy}
                >
                  <RefreshCw className={cn(checking === a.id && "animate-spin")} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`New automation for ${a.displayName}`}
                  title="New automation"
                  onClick={() => onNew(a.id)}
                >
                  <Plus />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                // A full page load: the connect route redirects on to Instagram.
                render={
                  <a href={`/api/oauth/instagram/start?clientId=${a.clientId}&automations=1&next=/automations`} />
                }
              >
                <Unplug /> Reconnect
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RuleCard({
  rule,
  timeZone,
  busy,
  checking,
  onToggle,
  onEdit,
  onCheck,
  onDelete,
}: {
  rule: AutomationRuleView;
  timeZone: string;
  busy: boolean;
  checking: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onCheck: () => void;
  onDelete: () => void;
}) {
  const ctx = { in: zoned(timeZone) };
  const failed = rule.week.FAILED ?? 0;
  const waitingForPost = rule.scope === "ONE_POST" && !rule.mediaId && !!rule.postId;
  const postGone = rule.scope === "ONE_POST" && !rule.mediaId && !rule.postId;

  return (
    <article
      className={cn(
        "bg-card flex flex-col gap-4 rounded-2xl border p-5 transition-opacity",
        !rule.enabled && "opacity-75",
      )}
    >
      <header className="flex items-start gap-3">
        <Switch
          checked={rule.enabled}
          onCheckedChange={onToggle}
          disabled={busy}
          aria-label={rule.enabled ? `Pause ${rule.name}` : `Turn on ${rule.name}`}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[0.9375rem] font-semibold tracking-tight">{rule.name}</h3>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ClientDot color={rule.clientColor} className="size-2" />
            <span className="truncate">
              {rule.clientName} · {rule.accountName}
            </span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Actions for ${rule.name}`}
                className="-mt-1 -mr-1"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCheck} disabled={busy}>
              <RefreshCw className={cn(checking && "animate-spin")} /> Check comments now
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="space-y-3 text-sm leading-relaxed">
        {rule.trigger !== "COMMENT" ? (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
            <span className="text-muted-foreground">When someone</span>
            {rule.matchMode === "ANY_COMMENT" ? (
              <span className="font-medium">
                {rule.trigger === "STORY_REPLY" ? "replies to a story" : "sends any DM"}
              </span>
            ) : (
              <>
                <span>{rule.trigger === "STORY_REPLY" ? "replies to a story with" : "sends a DM with"}</span>
                {rule.keywords.map((k, i) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    {i > 0 && <span className="text-muted-foreground">or</span>}
                    <KeywordChip>{k}</KeywordChip>
                  </span>
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
            <span className="text-muted-foreground">When someone</span>
            <TriggerSummary keywords={rule.keywords} matchMode={rule.matchMode} />
            <span className="text-muted-foreground">on</span>
            {rule.scope === "ANY_POST" ? (
              <span className="font-medium">any post</span>
            ) : waitingForPost ? (
              <span className="inline-flex items-center gap-1.5 font-medium">
                <CalendarClock className="text-standby size-3.5" />
                a scheduled post
                {rule.post?.scheduledAt && (
                  <span className="text-muted-foreground font-normal">
                    ({format(new Date(rule.post.scheduledAt), "d MMM, h:mm a", ctx)})
                  </span>
                )}
              </span>
            ) : postGone ? (
              <span className="text-fault-ink font-medium">a post that was deleted</span>
            ) : (
              <a
                href={rule.mediaPermalink ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="hover:bg-muted inline-flex max-w-full items-center gap-2 rounded-lg py-0.5 pr-1.5 font-medium"
              >
                <MediaThumb url={rule.mediaThumbUrl} className="size-6 rounded-md" />
                <span className="truncate">
                  {rule.mediaCaption?.slice(0, 40) || "this post"}
                </span>
              </a>
            )}
          </div>
        )}
        {waitingForPost && (
          <p className="text-standby-ink text-xs">Starts when the post goes live.</p>
        )}

        <ul className="space-y-1.5">
          {rule.replies.length > 0 && (
            <li className="flex items-start gap-2">
              <MessageCircleReply className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="text-muted-foreground">Replies </span>
                &ldquo;<span className="line-clamp-1 inline">{rule.replies[0]}</span>&rdquo;
                {rule.replies.length > 1 && (
                  <span className="text-muted-foreground"> +{rule.replies.length - 1} more</span>
                )}
              </span>
            </li>
          )}
          {rule.dmText && (
            <li className="flex items-start gap-2">
              <Send className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="text-muted-foreground">DMs </span>
                &ldquo;<span className="line-clamp-2 inline">{rule.dmText}</span>&rdquo;
                {rule.dmButtonLabel && (
                  <KeywordChip className="ml-1.5 h-5 font-sans text-[0.6875rem] normal-case">
                    {rule.dmButtonLabel}
                  </KeywordChip>
                )}
                {rule.dmVariants.length > 0 && (
                  <span className="text-muted-foreground"> +{rule.dmVariants.length} wordings</span>
                )}
              </span>
            </li>
          )}
        </ul>

        {(rule.followGate || rule.collect || rule.followUpText || rule.holdWords.length > 0 || rule.aiModeration) && (
          <div className="flex flex-wrap gap-1.5">
            {rule.followGate && (
              <span className="bg-muted inline-flex h-6 items-center gap-1 rounded-md px-2 text-[0.6875rem] font-medium">
                <Lock className="size-3" /> Followers only
              </span>
            )}
            {rule.collect && (
              <span className="bg-muted inline-flex h-6 items-center gap-1 rounded-md px-2 text-[0.6875rem] font-medium">
                <AtSign className="size-3" /> Asks for {rule.collect === "EMAIL" ? "email" : "phone"}
              </span>
            )}
            {rule.followUpText && (
              <span className="bg-muted inline-flex h-6 items-center rounded-md px-2 text-[0.6875rem] font-medium">
                One follow-up
              </span>
            )}
            {(rule.holdWords.length > 0 || rule.aiModeration) && (
              <span className="bg-muted inline-flex h-6 items-center rounded-md px-2 text-[0.6875rem] font-medium">
                Holds {rule.aiModeration ? "abuse" : `${rule.holdWords.length} word${rule.holdWords.length === 1 ? "" : "s"}`}
              </span>
            )}
          </div>
        )}
      </div>

      <footer className="mt-auto grid grid-cols-4 gap-2 border-t pt-4">
        {[
          { label: "Matched", value: rule.matchedCount },
          { label: "Delivered", value: rule.deliveredCount },
          rule.collect
            ? { label: "Leads", value: rule.leadCount }
            : rule.trigger === "COMMENT"
              ? { label: "Replies", value: rule.replyCount }
              : { label: "Held", value: rule.heldCount },
        ].map((s) => (
          <div key={s.label}>
            <div className="label-caps">{s.label}</div>
            <div className="headline mt-1 text-xl leading-none">{s.value}</div>
          </div>
        ))}
        <div>
          <div className="label-caps">Last</div>
          <div className="text-muted-foreground mt-1.5 text-xs" suppressHydrationWarning>
            {rule.lastTriggeredAt ? ago(rule.lastTriggeredAt) : "Not yet"}
          </div>
        </div>
        {failed > 0 && (
          <p className="text-fault-ink col-span-4 flex items-center gap-1.5 text-xs">
            <AlertTriangle className="size-3.5" />
            {failed} failed this week. See recent activity below.
          </p>
        )}
      </footer>
    </article>
  );
}

function HowItWorks({ canCreate, onNew }: { canCreate: boolean; onNew: () => void }) {
  const steps = [
    { n: "01", title: "A follower comments", body: "Your keyword, like LINK or GUIDE, on a post you pick or any post." },
    { n: "02", title: "Cue replies under it", body: "A friendly public reply, picked at random from your variations." },
    { n: "03", title: "And sends them a DM", body: "With the link, the guide or the price, plus a button to open it." },
  ];
  return (
    <div className="bg-card relative overflow-hidden rounded-2xl border p-6 sm:p-7">
      <div
        aria-hidden
        className="bg-dots pointer-events-none absolute inset-y-0 right-0 w-1/2 mask-[linear-gradient(to_left,black,transparent)]"
      />
      <div className="relative space-y-6">
        <div className="max-w-lg space-y-2">
          <div className="label-caps">How it works</div>
          <h3 className="headline text-2xl">
            Comment, reply, <em>DM.</em>
          </h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Cue checks each account&apos;s comments every minute. Instagram allows one DM per
            comment, sent within 7 days of it.
          </p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="bg-background rounded-xl border p-4">
              <span className="text-primary font-mono text-[0.6875rem] font-medium tracking-wider">
                {s.n}
              </span>
              <div className="mt-1.5 text-sm font-semibold">{s.title}</div>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
        {canCreate && (
          <Button onClick={onNew}>
            <Plus /> Create your first automation
          </Button>
        )}
      </div>
    </div>
  );
}
