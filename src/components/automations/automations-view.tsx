"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  AtSign,
  CalendarClock,
  Check,
  Copy,
  Download,
  Lock,
  MessageCircleReply,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
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
  retryAutomationRun,
} from "@/lib/automation-actions";
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates";
import { AutomationOverview } from "./overview";
import { CommentRecovery } from "./comment-recovery";
import { LeadDetails } from "./lead-details";
import { unwrap } from "@/lib/action-result";
import {
  RUN_RETENTION_DAYS,
  type AutomationPreset,
  type AutomationsTab,
} from "@/lib/automations/config";
import type {
  AutomationAccountView,
  AutomationLeadView,
  AutomationRuleView,
  AutomationRunView,
  AutomationsPageData,
} from "@/lib/automations/data";
import { zoned } from "@/lib/timezone";
import { PageHeader } from "@/components/page-header";
import { ClientDot, PlatformIcon } from "@/components/post-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PillTabs } from "@/components/pill-tabs";
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
import { fillPreview, KeywordChip, RunBadge, TriggerSummary } from "@/components/automations/bits";
import { DescribeAutomation } from "@/components/automations/describe-automation";
import { cn } from "@/lib/utils";

function ago(iso: string | null): string {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never";
}

/** Where a conversation has got to, in words, for the activity log. */
function stageNote(run: AutomationRunView): string | null {
  if (run.status !== "SENT" && run.status !== "PARTIAL") return null;
  if (run.delivered) return "Link delivered";
  if (run.stage === "WAIT_TAP") return "Waiting for their tap";
  if (run.stage === "WAIT_FOLLOW") return "Asked them to follow first";
  if (run.stage === "WAIT_ANSWER") return "Waiting for their answer";
  return null;
}

const TRIGGER_NOTE = { COMMENT: "", STORY_REPLY: "story reply · ", DM_KEYWORD: "DM · " } as const;
const SOURCE_LABEL = { COMMENT: "Comment", STORY_REPLY: "Story reply", DM_KEYWORD: "DM" } as const;

type ActivityFilter = "all" | "held" | "failed" | "waiting";

/** Reconnect with comment and message access, then come back here. */
export function reconnectHref(clientId: string) {
  return `/api/oauth/instagram/start?clientId=${clientId}&automations=1&next=/automations`;
}

export function AutomationsView({
  data,
  timeZone,
  justConnected,
  initialTab = "automations",
}: {
  data: AutomationsPageData;
  timeZone: string;
  justConnected: boolean;
  initialTab?: AutomationsTab;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<AutomationsTab>(initialTab);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>((["held", "failed", "waiting"].includes(data.pagination.activityFilter) ? data.pagination.activityFilter : "all") as ActivityFilter);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<{
    key: number;
    rule: AutomationRuleView | null;
    accountId?: string;
    preset?: AutomationPreset;
    copyOf?: AutomationRuleView;
  }>({ key: 0, rule: null });
  const [toDelete, setToDelete] = useState<AutomationRuleView | null>(null);
  const [toSend, setToSend] = useState<AutomationRunView | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [ruleQuery, setRuleQuery] = useState("");
  const [recoveryRule, setRecoveryRule] = useState<AutomationRuleView | null>(null);
  const [selectedLead, setSelectedLead] = useState<AutomationLeadView | null>(null);
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>("all");

  useEffect(() => {
    if (!justConnected) return;
    toast.success("Instagram connected with comment access");
    router.replace("/automations");
  }, [justConnected, router]);

  const ready = data.accounts.filter((a) => a.ready);
  const accountById = new Map(data.accounts.map((a) => [a.id, a]));
  // A rule only runs when its account can read comments and send DMs.
  const blockedBy = (rule: AutomationRuleView) => {
    const account = accountById.get(rule.accountId);
    return account && !account.ready ? account : null;
  };
  const live = data.featureOn ? data.rules.filter((r) => r.enabled && !blockedBy(r) && (!r.startsAt || new Date(r.startsAt) <= new Date()) && (!r.endsAt || new Date(r.endsAt) > new Date())).length : 0;
  const failedThisWeek = data.rules.reduce((n, r) => n + (r.week.FAILED ?? 0), 0);
  const currentRuleFilter = RULE_FILTERS.find((f) => f.key === ruleFilter) ?? RULE_FILTERS[0];
  const shownRules = data.rules.filter((r) => currentRuleFilter.match(r, !!blockedBy(r)) && [r.name, r.clientName, r.accountName, ...r.keywords].some((text) => text.toLowerCase().includes(ruleQuery.toLowerCase())));

  function navigate(params: Record<string, string>) {
    const url = new URL(window.location.href);
    Object.entries(params).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key));
    router.push(`${url.pathname}${url.search}`);
  }

  function showTab(next: AutomationsTab, filter?: ActivityFilter) {
    setTab(next);
    if (filter) { setActivityFilter(filter); navigate({ activityFilter: filter, activityPage: "1", tab: next }); }
    // Keep the address shareable without a server round trip.
    const url = new URL(window.location.href);
    if (next === "automations") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

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
  function openDuplicate(rule: AutomationRuleView) {
    setEditor((e) => ({ key: e.key + 1, rule: null, copyOf: rule }));
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

  function resolve(run: AutomationRunView, send: boolean) {
    // Sending can't be taken back: show what goes out first.
    if (send && toSend?.id !== run.id) {
      setToSend(run);
      return;
    }
    setToSend(null);
    startTransition(async () => {
      try {
        unwrap(await resolveHeld(run.id, send));
        toast.success(
          send
            ? `Sending to ${run.commenter ? `@${run.commenter}` : "them"} now`
            : "Dismissed. Nothing was sent.",
        );
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
    <div className="mx-auto max-w-6xl min-w-0 space-y-8">
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
        description={`When someone comments a keyword on ${
          new Set(data.accounts.map((a) => a.clientName)).size === 1
            ? `${data.accounts[0].clientName}'s`
            : "a client's"
        } Instagram post, Cue replies under the comment and sends them a DM with the link, the guide or the price they asked for.`}
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

      {(data.heldTotal > 0 || failedThisWeek > 0) && (
        <NeedsYou
          held={data.held}
          heldTotal={data.heldTotal}
          failed={failedThisWeek}
          timeZone={timeZone}
          busy={pending}
          onResolve={resolve}
          onShow={(filter) => showTab("activity", filter)}
        />
      )}

      <PillTabs
        label="Automations sections"
        active={tab}
        onSelect={(t) => showTab(t)}
        className="w-fit"
        tabs={[
          { key: "automations", label: "Automations", count: data.rules.length },
          { key: "activity", label: "Activity", count: data.heldTotal || undefined, alert: true },
          { key: "leads", label: "Leads", count: data.leadTotal },
        ]}
      />

      {tab === "automations" && (
        <div className="space-y-8">
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

          <AutomationOverview report={data.report} onPeriod={(days) => navigate({ period: String(days) })} />
          <details className="rounded-2xl border p-5" open={data.rules.length === 0 || undefined}><summary className="cursor-pointer text-sm font-semibold">Start with a template</summary><p className="text-muted-foreground mt-2 text-xs">Choose an outcome, then review the account, keyword, message and link before saving.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{AUTOMATION_TEMPLATES.map((template) => <button key={template.id} type="button" disabled={!ready.length || !data.featureOn} className="bg-card hover:border-primary/50 rounded-xl border p-4 text-left transition-colors disabled:opacity-50" onClick={() => openDescribed(template.preset, ready.length === 1 ? ready[0].id : "")}><span className="block text-sm font-semibold">{template.preset.name}</span><span className="text-muted-foreground mt-1 block text-xs leading-relaxed">{template.description}</span></button>)}</div></details>
          <section className="space-y-4">
            <Input aria-label="Search automations" placeholder="Search automations, keywords or accounts" value={ruleQuery} onChange={(e) => setRuleQuery(e.target.value)} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[0.9375rem] font-semibold tracking-tight">Your automations</h2>
              {data.rules.length > 3 && (
                <PillTabs
                  label="Show automations"
                  size="sm"
                  active={ruleFilter}
                  onSelect={setRuleFilter}
                  tabs={RULE_FILTERS.map((f) => ({
                    key: f.key,
                    label: f.label,
                    count: data.rules.filter((r) => f.match(r, !!blockedBy(r))).length,
                    alert: f.key === "attention",
                  }))}
                />
              )}
            </div>
            {data.rules.length ? (
              <div className="space-y-6">
                {groupByClient(shownRules).map((group) => (
                  <div key={group.key} className="space-y-3">
                    {group.show && (
                      <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
                        <ClientDot color={group.color} className="size-2" />
                        {group.name}
                        <span className="font-mono tabular-nums">{group.rules.length}</span>
                      </h3>
                    )}
                    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                      {group.rules.map((rule) => (
                        <RuleCard
                          key={rule.id}
                          rule={rule}
                          blockedBy={blockedBy(rule)}
                          timeZone={timeZone}
                          busy={pending}
                          checking={checking === rule.accountId}
                          onToggle={(v) => toggle(rule, v)}
                          onEdit={() => openEdit(rule)}
                          onRecover={() => setRecoveryRule(rule)}
                            onDuplicate={() => openDuplicate(rule)}
                          onCheck={() => checkNow(rule.accountId)}
                          onDelete={() => setToDelete(rule)}
                          onShowFailed={() => showTab("activity", "failed")}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {shownRules.length === 0 && (
                  <div className="text-muted-foreground rounded-2xl border border-dashed px-5 py-8 text-center text-sm">
                    None here.
                  </div>
                )}
              </div>
            ) : (
              <HowItWorks canCreate={ready.length > 0 && data.featureOn} onNew={() => openNew()} />
            )}
          </section>
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-4"><Activity
          runs={data.runs}
          held={data.held}
          failed={data.failed}
          filter={activityFilter}
          onFilter={(filter) => { setActivityFilter(filter); navigate({ activityFilter: filter, activityPage: "1", tab: "activity" }); }}
          timeZone={timeZone}
          busy={pending}
          onResolve={resolve}
        /><Pager page={data.pagination.activityPage} size={40} total={data.pagination.activityTotal} onPage={(page) => navigate({ activityPage: String(page), tab: "activity" })} /></div>
      )}

      {tab === "leads" && (
        <div className="space-y-4"><Leads key={data.pagination.leadQuery} leads={data.leads} total={data.leadTotal} busy={pending} onRemove={removeLead} onEdit={setSelectedLead} initialQuery={data.pagination.leadQuery} onSearch={(query) => navigate({ leadQuery: query, leadPage: "1", tab: "leads" })} /><Pager page={data.pagination.leadPage} size={100} total={data.leadTotal} onPage={(page) => navigate({ leadPage: String(page), tab: "leads" })} /></div>
      )}

      {recoveryRule && <CommentRecovery rule={recoveryRule} onClose={() => setRecoveryRule(null)} />}
      {selectedLead && <LeadDetails key={selectedLead.id} lead={selectedLead} onClose={() => setSelectedLead(null)} />}
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
        copyOf={editor.copyOf}
      />

      <SendAnywayDialog
        run={toSend}
        rule={toSend ? (data.rules.find((r) => r.id === toSend.ruleId) ?? null) : null}
        busy={pending}
        onCancel={() => setToSend(null)}
        onSend={(run) => resolve(run, true)}
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

/** Held comments and this week's failures, above the tabs so they can't be missed. */
function NeedsYou({
  held,
  heldTotal,
  failed,
  timeZone,
  busy,
  onResolve,
  onShow,
}: {
  held: AutomationRunView[];
  heldTotal: number;
  failed: number;
  timeZone: string;
  busy: boolean;
  onResolve: (run: AutomationRunView, send: boolean) => void;
  onShow: (filter: ActivityFilter) => void;
}) {
  const shown = held.slice(0, 3);
  return (
    <section
      aria-labelledby="needs-you"
      className="border-standby/30 bg-standby/6 space-y-3 rounded-2xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="needs-you" className="flex items-center gap-2 text-[0.9375rem] font-semibold tracking-tight">
          <span aria-hidden className="tally text-standby size-2" />
          Needs you
        </h2>
        <div className="flex flex-wrap gap-1">
          {heldTotal > shown.length && (
            <Button size="sm" variant="ghost" onClick={() => onShow("held")}>
              All {heldTotal} held <ArrowRight />
            </Button>
          )}
          {failed > 0 && (
            <Button size="sm" variant="ghost" className="text-fault-ink" onClick={() => onShow("failed")}>
              {failed} failed this week <ArrowRight />
            </Button>
          )}
        </div>
      </div>
      {shown.length > 0 && (
        <>
          <p className="text-muted-foreground text-xs leading-relaxed">
            These matched an automation but were held for a hold word or abuse, so nothing was
            sent. Send anyway replies and DMs them as the automation would. Dismiss drops them.
          </p>
          <ol className="bg-card divide-y rounded-xl border">
            {shown.map((run) => (
              <RunItem key={run.id} run={run} timeZone={timeZone} busy={busy} onResolve={onResolve} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

const ACTIVITY_FILTERS: {
  key: ActivityFilter;
  label: string;
  match: (r: AutomationRunView) => boolean;
}[] = [
  { key: "all", label: "All", match: () => true },
  { key: "held", label: "Held", match: (r) => r.status === "HELD" },
  {
    key: "failed",
    label: "Failed",
    match: (r) => r.status === "FAILED" || r.status === "PARTIAL" || (r.status === "QUEUED" && !!r.error),
  },
  {
    key: "waiting",
    label: "Waiting on them",
    match: (r) =>
      (r.status === "SENT" || r.status === "PARTIAL") &&
      !r.delivered &&
      (r.stage === "WAIT_TAP" || r.stage === "WAIT_FOLLOW" || r.stage === "WAIT_ANSWER"),
  },
];

const ACTIVITY_EMPTY: Record<ActivityFilter, string> = {
  all: "Nothing yet. Matching comments show up here as they happen.",
  held: "Nothing held. Comments with a hold word, or abuse when AI holding is on, wait here.",
  failed: "No failures in the latest activity.",
  waiting: "Nobody is part-way through a conversation right now.",
};

function Activity({
  runs,
  filter,
  onFilter,
  timeZone,
  busy,
  onResolve,
}: {
  runs: AutomationRunView[];
  held: AutomationRunView[];
  failed: AutomationRunView[];
  filter: ActivityFilter;
  onFilter: (f: ActivityFilter) => void;
  timeZone: string;
  busy: boolean;
  onResolve: (run: AutomationRunView, send: boolean) => void;
}) {
  const current = ACTIVITY_FILTERS.find((f) => f.key === filter) ?? ACTIVITY_FILTERS[0];
  const shown = runs;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">Activity</h2>
          <p className="text-muted-foreground text-xs">
            The latest comments, story replies and DMs your automations acted on. Kept for{" "}
            {RUN_RETENTION_DAYS} days.
          </p>
        </div>
        <PillTabs
          label="Show"
          size="sm"
          active={current.key}
          onSelect={onFilter}
          tabs={ACTIVITY_FILTERS.map((f) => ({
            key: f.key,
            label: f.label,

            alert: f.key === "held",
          }))}
        />
      </div>
      {shown.length ? (
        <ol className="bg-card divide-y rounded-2xl border">
          {shown.map((run) => (
            <RunItem key={run.id} run={run} timeZone={timeZone} busy={busy} onResolve={onResolve} />
          ))}
        </ol>
      ) : (
        <div className="text-muted-foreground rounded-2xl border border-dashed px-5 py-8 text-center text-sm">
          {ACTIVITY_EMPTY[current.key]}
        </div>
      )}
    </section>
  );
}

function RunItem({
  run,
  timeZone,
  busy,
  onResolve,
}: {
  run: AutomationRunView;
  timeZone: string;
  busy: boolean;
  onResolve: (run: AutomationRunView, send: boolean) => void;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const ctx = { in: zoned(timeZone) };
  const note = stageNote(run);
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <time
        dateTime={run.createdAt}
        className="text-muted-foreground shrink-0 pt-0.5 font-mono text-[0.6875rem] tracking-wide whitespace-nowrap uppercase sm:w-36"
      >
        {format(new Date(run.createdAt), "d MMM · h:mm a", ctx)}
      </time>
      <div className="min-w-0 flex-1 basis-56">
        <p className={cn("text-sm wrap-break-word", run.status !== "HELD" && "line-clamp-2")}>
          <span className="font-semibold">{run.commenter ? `@${run.commenter}` : "Someone"}</span>{" "}
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
        {run.clicked && <p className="text-live-ink mt-1 text-xs">Link visited - {run.clickCount} visit{run.clickCount === 1 ? "" : "s"}</p>}
        {(run.status === "FAILED" || run.status === "PARTIAL") && <Button type="button" size="xs" variant="outline" className="mt-2" disabled={busy || retrying} onClick={() => startRetry(async () => { try { unwrap(await retryAutomationRun(run.id)); toast.success("Unsent replies checked for retry"); router.refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not retry."); } })}>Retry unsent replies</Button>}
        {note && (
          <p className={cn("mt-1 text-xs", run.delivered ? "text-live-ink" : "text-standby-ink")}>{note}</p>
        )}
        {run.status === "HELD" && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-standby-ink text-xs">Held: {run.heldReason}</span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => onResolve(run, true)}
              disabled={busy}
              aria-label={`Send anyway to ${run.commenter ? `@${run.commenter}` : "them"}`}
            >
              <Check /> Send anyway
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onResolve(run, false)}
              disabled={busy}
              aria-label={`Dismiss ${run.commenter ? `@${run.commenter}` : "this"}: nothing is sent`}
            >
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
      <RunBadge
        status={run.status}
        retrying={run.status === "QUEUED" && !!run.error}
        dismissed={run.status === "SKIPPED" && !!run.heldReason}
      />
    </li>
  );
}

function Leads({
  leads,
  total,
  busy,
  onRemove, onEdit, initialQuery, onSearch,
}: {
  leads: AutomationLeadView[];
  total: number;
  busy: boolean;
  onRemove: (id: string) => void;
  onEdit: (lead: AutomationLeadView) => void;
  initialQuery: string;
  onSearch: (query: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [only, setOnly] = useState<"all" | "email" | "phone">("all");
  const q = query.trim().toLowerCase();
  const shown = leads
    .filter((l) => (only === "email" ? !!l.email : only === "phone" ? !!l.phone : true))
    .filter((l) =>
      q ? [l.username, l.email, l.phone, l.lastRule, l.clientName, l.notes, ...l.tags].some((v) => v?.toLowerCase().includes(q)) : true,
    );
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">Leads</h2>
          <p className="text-muted-foreground text-xs">
            Everyone an automation talked to, with any email or phone they shared. {total} matching
            {total > leads.length ? `; showing ${leads.length} on this page. CSV exports all leads` : ""}.
          </p>
        </div>
        {(total > 0 || initialQuery) && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, phone or tag"
                onKeyDown={(e) => { if (e.key === "Enter") onSearch(query); }}
                aria-label="Search leads"
                className="h-8 pl-8"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => onSearch(query)}>Search all leads</Button>
            <PillTabs
              label="Who"
              size="sm"
              active={only}
              onSelect={setOnly}
              tabs={[
                { key: "all", label: "Everyone" },
                { key: "email", label: "With email", count: leads.filter((l) => l.email).length },
                { key: "phone", label: "With phone", count: leads.filter((l) => l.phone).length },
              ]}
            />
            <Button
              variant="outline"
              size="sm"
              render={<a href={`/api/automations/leads${only === "all" ? "" : `?with=${only}`}`} download />}
            >
              <Download /> Export CSV
            </Button>
          </div>
        )}
      </div>
      {shown.length ? (
        <div className="bg-card overflow-hidden rounded-2xl border">
          <div className="label-caps hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_7rem_2rem] gap-4 border-b px-5 py-2.5 md:grid">
            <span>Person</span>
            <span>Contact</span>
            <span>From</span>
            <span>Last seen</span>
            <span />
          </div>
          <ul className="divide-y">
            {shown.map((lead) => (
              <li
                key={lead.id}
                className="group/lead grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_7rem_2rem] md:px-5"
              >
                <p className="truncate text-sm font-semibold">
                  <button type="button" onClick={() => onEdit(lead)} className="text-left hover:underline">{lead.username ? `@${lead.username}` : "Instagram user"}</button>
                  {lead.automationPaused && <span className="text-standby-ink ml-2 text-xs">Paused</span>}
                  {lead.tags.length > 0 && <span className="text-muted-foreground block truncate text-xs font-normal">{lead.tags.join(", ")}</span>}
                  {lead.touches > 1 && (
                    <span className="text-muted-foreground ml-1.5 text-xs font-normal" title={`${lead.touches} conversations`}>
                      ×{lead.touches}
                    </span>
                  )}
                </p>
                <div className="col-start-1 row-start-2 min-w-0 text-xs md:col-start-auto md:row-start-auto">
                  {lead.email || lead.phone ? (
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {lead.email && <span className="truncate">{lead.email}</span>}
                      {lead.phone && <span className="truncate font-mono">{lead.phone}</span>}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No email or phone</span>
                  )}
                </div>
                <p className="text-muted-foreground col-start-1 row-start-3 flex min-w-0 items-center gap-1.5 text-xs md:col-start-auto md:row-start-auto">
                  <ClientDot color={lead.clientColor} className="size-2 shrink-0" />
                  <span className="truncate">
                    {lead.clientName} · {SOURCE_LABEL[lead.source]}
                    {lead.lastRule && ` · ${lead.lastRule}`}
                  </span>
                </p>
                <span
                  className="text-muted-foreground col-start-2 row-start-1 text-right text-xs md:col-start-auto md:row-start-auto md:text-left"
                  suppressHydrationWarning
                >
                  {ago(lead.lastSeenAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${lead.username ?? "this lead"}`}
                  onClick={() => onRemove(lead.id)}
                  disabled={busy}
                  className="col-start-2 row-span-2 row-start-2 justify-self-end md:col-start-auto md:row-span-1 md:row-start-auto md:opacity-0 md:group-hover/lead:opacity-100 md:focus-visible:opacity-100"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-muted-foreground rounded-2xl border border-dashed px-5 py-8 text-center text-sm">
          {q ? `No leads match "${query.trim()}".` : "No leads yet. Everyone an automation talks to is added here."}
        </div>
      )}
    </section>
  );
}

type RuleFilter = "all" | "live" | "paused" | "attention";

const RULE_FILTERS: {
  key: RuleFilter;
  label: string;
  match: (r: AutomationRuleView, blocked: boolean) => boolean;
}[] = [
  { key: "all", label: "All", match: () => true },
  { key: "live", label: "Live", match: (r, blocked) => r.enabled && !blocked && (!r.startsAt || new Date(r.startsAt) <= new Date()) && (!r.endsAt || new Date(r.endsAt) > new Date()) },
  { key: "paused", label: "Paused", match: (r) => !r.enabled },
  {
    key: "attention",
    label: "Needs attention",
    match: (r, blocked) => (r.enabled && blocked) || (r.week.FAILED ?? 0) > 0,
  },
];

/** Rules under their client's name, once there's more than one client. */
function groupByClient(rules: AutomationRuleView[]) {
  const groups = new Map<string, { key: string; name: string; color: string | null; rules: AutomationRuleView[] }>();
  for (const r of rules) {
    const g = groups.get(r.clientId) ?? { key: r.clientId, name: r.clientName, color: r.clientColor, rules: [] };
    g.rules.push(r);
    groups.set(r.clientId, g);
  }
  const list = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  return list.map((g) => ({ ...g, show: list.length > 1 }));
}

function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Each step of the rule, with its share of the comments it matched. */
function funnel(rule: AutomationRuleView) {
  const steps: { label: string; value: number; pct: number | null; title?: string }[] = [
    { label: "Matched", value: rule.matchedCount, pct: null, title: "Comments or messages that matched" },
  ];
  if (rule.dmText !== null) {
    steps.push({ label: "DM sent", value: rule.dmSentCount, pct: pct(rule.dmSentCount, rule.matchedCount) });
    steps.push({
      label: "Got the link",
      value: rule.deliveredCount,
      pct: pct(rule.deliveredCount, rule.matchedCount),
      title: "Reached the final message, after any follow check or question",
    });
  } else {
    steps.push({ label: "Replied", value: rule.replyCount, pct: pct(rule.replyCount, rule.matchedCount) });
  }
  if (rule.collect) {
    steps.push({ label: rule.collect === "EMAIL" ? "Emails" : "Phones", value: rule.leadCount, pct: pct(rule.leadCount, rule.matchedCount) });
  } else if (rule.trigger === "COMMENT" && rule.dmText !== null && rule.replies.length > 0) {
    steps.push({ label: "Replied", value: rule.replyCount, pct: pct(rule.replyCount, rule.matchedCount) });
  } else if (rule.holdWords.length > 0 || rule.aiModeration) {
    steps.push({ label: "Held", value: rule.heldCount, pct: null });
  }
  return steps;
}

/** People part-way through, in words: "3 haven't tapped, 1 not following yet". */
function waitingNote(rule: AutomationRuleView): string | null {
  const w = rule.waiting;
  const parts = [
    w.WAIT_TAP ? `${w.WAIT_TAP} haven't tapped yet` : null,
    w.WAIT_FOLLOW ? `${w.WAIT_FOLLOW} not following yet` : null,
    w.WAIT_ANSWER ? `${w.WAIT_ANSWER} haven't answered yet` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** What Send anyway will send, before it does. */
function SendAnywayDialog({
  run,
  rule,
  busy,
  onCancel,
  onSend,
}: {
  run: AutomationRunView | null;
  rule: AutomationRuleView | null;
  busy: boolean;
  onCancel: () => void;
  onSend: (run: AutomationRunView) => void;
}) {
  const who = run?.commenter ? `@${run.commenter}` : "them";
  return (
    <Dialog open={!!run} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send to {who}?</DialogTitle>
          <DialogDescription>
            It was held for: {run?.heldReason ?? "review"}. Sending can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        {run && (
          <div className="space-y-2 text-sm">
            <p className="bg-muted/50 rounded-lg px-3 py-2 wrap-break-word">
              <span className="font-semibold">{who}</span> &ldquo;{run.comment}&rdquo;
            </p>
            {rule && rule.replies.length > 0 && run.trigger === "COMMENT" && (
              <p className="text-muted-foreground">
                Public reply:{" "}
                <span className="text-foreground">
                  &ldquo;{fillPreview(rule.replies[0], run.commenter ?? "them")}&rdquo;
                </span>
                {rule.replies.length > 1 ? " (or another of its wordings)" : ""}
              </p>
            )}
            {rule?.dmText && (
              <p className="text-muted-foreground">
                DM:{" "}
                <span className="text-foreground">&ldquo;{fillPreview(rule.dmText, run.commenter ?? "them")}&rdquo;</span>
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => run && onSend(run)} disabled={busy}>
            <Send /> Send to {who}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
              <div className="text-muted-foreground text-xs">
                {a.clientName} ·{" "}
                {a.ready ? (
                  <span suppressHydrationWarning>checked {ago(a.checkedAt)}</span>
                ) : (
                  <span className="text-standby-ink">needs comment and DM access</span>
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
                render={<a href={reconnectHref(a.clientId)} />}
                title="Opens Instagram for a minute to allow comments and DMs, then brings you back"
              >
                <Unplug /> Allow access
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
  blockedBy,
  timeZone,
  busy,
  checking,
  onToggle,
  onEdit,
  onRecover,
  onDuplicate,
  onCheck,
  onDelete,
  onShowFailed,
}: {
  rule: AutomationRuleView;
  /** The account, when it can't run automations yet (no comment access). */
  blockedBy: AutomationAccountView | null;
  timeZone: string;
  busy: boolean;
  checking: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onRecover: () => void;
  onDuplicate: () => void;
  onCheck: () => void;
  onDelete: () => void;
  onShowFailed: () => void;
}) {
  const ctx = { in: zoned(timeZone) };
  const failed = rule.week.FAILED ?? 0;
  const waitingForPost = rule.scope === "ONE_POST" && !rule.mediaId && (!!rule.postId || rule.nextPost);
  const postGone = rule.scope === "ONE_POST" && !rule.mediaId && !rule.postId && !rule.nextPost;

  return (
    <article
      className={cn(
        "bg-card flex min-w-0 flex-col gap-4 rounded-2xl border p-4 transition-opacity sm:p-5",
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
          <h3 className="truncate text-[0.9375rem] font-semibold tracking-tight">
            <button
              type="button"
              onClick={onEdit}
              className="max-w-full truncate rounded text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {rule.name}
            </button>
          </h3>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span className={cn("shrink-0 font-medium", rule.enabled && !blockedBy ? "text-live-ink" : undefined)}>
              {!rule.enabled ? "Paused" : blockedBy ? "Not running" : rule.endsAt && new Date(rule.endsAt) <= new Date() ? "Ended" : rule.startsAt && new Date(rule.startsAt) > new Date() ? "Scheduled" : "Live"}
            </span>
            <span aria-hidden>·</span>
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
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCheck} disabled={busy}>
              <RefreshCw className={cn(checking && "animate-spin")} /> Check comments now
            </DropdownMenuItem>
            {rule.trigger === "COMMENT" && <DropdownMenuItem onClick={onRecover} disabled={busy || !rule.enabled}>Recover missed comments</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {blockedBy && (
        <div className="bg-standby/8 text-standby-ink flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2.5 text-xs">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 basis-48">
            Not running: {blockedBy.displayName} needs comment and DM access.
          </span>
          <Button variant="outline" size="xs" render={<a href={reconnectHref(blockedBy.clientId)} />}>
            <Unplug /> Allow access
          </Button>
        </div>
      )}

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
                {rule.nextPost ? "the next published post" : "a scheduled post"}
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
                title={rule.mediaCaption ?? undefined}
                className="hover:bg-muted inline-flex max-w-full min-w-0 items-center gap-2 rounded-lg py-0.5 pr-1.5 font-medium"
              >
                <MediaThumb url={rule.mediaThumbUrl} className="size-6 shrink-0 rounded-md" />
                <span className="truncate">{rule.mediaCaption || "this post"}</span>
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
              <span
                className="bg-standby/10 text-standby-ink inline-flex h-6 max-w-full items-center rounded-md px-2 text-[0.6875rem] font-medium"
                title={rule.holdWords.join(", ") || undefined}
              >
                <span className="truncate">
                  Holds{" "}
                  {[
                    rule.holdWords.slice(0, 3).map((w) => w.toUpperCase()).join(", ") +
                      (rule.holdWords.length > 3 ? ` +${rule.holdWords.length - 3}` : ""),
                    rule.aiModeration ? "abuse (AI)" : "",
                  ]
                    .filter(Boolean)
                    .join(" + ")}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <footer className="mt-auto space-y-3 border-t pt-4">
        <dl className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4">
          {funnel(rule).map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="label-caps truncate" title={s.title}>
                {s.label}
              </dt>
              <dd className="mt-1 flex items-baseline gap-1.5">
                <span className="headline text-xl leading-none">{s.value}</span>
                {s.pct !== null && (
                  <span className="text-muted-foreground font-mono text-[0.6875rem] tabular-nums">{s.pct}%</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground flex flex-wrap gap-x-2 gap-y-1 text-xs" suppressHydrationWarning>
          <span>All time · last {rule.lastTriggeredAt ? ago(rule.lastTriggeredAt) : "never"}</span>
          {waitingNote(rule) && <span className="text-standby-ink">· {waitingNote(rule)}</span>}
        </p>
        {failed > 0 && (
          <button
            type="button"
            onClick={onShowFailed}
            className="text-fault-ink col-span-full flex items-center gap-1.5 text-left text-xs hover:underline"
          >
            <AlertTriangle className="size-3.5 shrink-0" />
            {failed} failed this week. See why in Activity.
          </button>
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
            Cue answers new comments as they arrive. Instagram allows one DM per
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

function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (n: number) => void }) {
  if (total <= size && page === 1) return null;
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground text-xs">Page {page} of {Math.max(1, Math.ceil(total / size))}</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><Button type="button" variant="outline" size="sm" disabled={page * size >= total} onClick={() => onPage(page + 1)}>Next</Button></div></div>;
}
