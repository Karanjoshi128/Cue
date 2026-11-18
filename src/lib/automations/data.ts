import { automationSettings } from "./settings";
import type { AutomationRunStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceId } from "@/lib/auth";
import { hasFeature } from "@/lib/plans";
import { aiEnabled } from "@/lib/ai";
import { hasAutomationScopes } from "./config";

// The Automations page. Self-scoped to the caller's workspace like
// src/lib/data.ts, and returns plain values so it can go straight to the
// client component.

export async function getAutomationsPage(clientId?: string, period: 7 | 30 = 7, activityPage = 1, leadPage = 1, leadQuery = "", activityFilter = "all") {
  const workspaceId = await requireWorkspaceId();
  const inScope = { workspaceId, ...(clientId ? { id: clientId } : {}) };
  const activityWhere: Prisma.AutomationRunWhereInput = { rule: { client: inScope },
    ...(activityFilter === "held" ? { status: "HELD" } : activityFilter === "failed" ? { OR: [{ status: { in: ["FAILED", "PARTIAL"] } }, { status: "QUEUED", lastError: { not: null } }] } : activityFilter === "waiting" ? { status: { in: ["SENT", "PARTIAL"] }, stage: { in: ["WAIT_TAP", "WAIT_FOLLOW", "WAIT_ANSWER"] }, deliveredAt: null } : {}),
  };
  const reportSince = new Date(Date.now() - period * 24 * 60 * 60 * 1000);
  activityPage = Math.max(1, Math.min(10000, Math.floor(activityPage) || 1));
  leadPage = Math.max(1, Math.min(10000, Math.floor(leadPage) || 1));
  leadQuery = leadQuery.trim().slice(0, 100);
  const leadWhere: Prisma.LeadWhereInput = { client: inScope, ...(leadQuery ? { OR: [{ username: { contains: leadQuery, mode: "insensitive" } }, { email: { contains: leadQuery, mode: "insensitive" } }, { phone: { contains: leadQuery } }, { tags: { has: leadQuery } }, { notes: { contains: leadQuery, mode: "insensitive" } }] } : {}) };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const runInclude = {
    rule: {
      select: {
        name: true,
        client: { select: { name: true, color: true } },
      },
    },
  } as const;
  const [workspace, accounts, rules, runs, held, heldTotal, failed, posts, leads, leadTotal] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { disabledFeatures: true },
    }),
    prisma.socialAccount.findMany({
      where: { platform: "INSTAGRAM", client: inScope },
      select: {
        id: true,
        clientId: true,
        displayName: true,
        scopes: true,
        webhooksSubscribedAt: true,
        commentsCheckedAt: true,
        client: { select: { name: true, color: true } },
      },
      orderBy: [{ client: { name: "asc" } }, { displayName: "asc" }],
    }),
    prisma.automationRule.findMany({
      where: { client: inScope },
      include: {
        client: { select: { name: true, color: true } },
        account: { select: { displayName: true } },
        post: { select: { body: true, scheduledAt: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.automationRun.findMany({
      where: activityWhere,
      orderBy: { createdAt: "desc" },
      take: 40, skip: (activityPage - 1) * 40,
      include: runInclude,
    }),
    // Held comments wait for a person however old they are, so they're read
    // apart from the newest-40 log.
    prisma.automationRun.findMany({
      where: { status: "HELD", rule: { client: inScope } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: runInclude,
    }),
    prisma.automationRun.count({ where: { status: "HELD", rule: { client: inScope } } }),
    // This week's failures, also apart from the newest 40, to match the cards.
    prisma.automationRun.findMany({
      where: { status: { in: ["FAILED", "PARTIAL"] }, createdAt: { gte: weekAgo }, rule: { client: inScope } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: runInclude,
    }),
    // Cue posts headed for Instagram that haven't gone out yet: a rule can be
    // set on one now and starts watching it once it publishes.
    prisma.post.findMany({
      where: {
        client: inScope,
        status: { in: ["DRAFT", "SCHEDULED", "PUBLISHING"] },
        targets: { some: { platform: "INSTAGRAM" } },
      },
      select: {
        id: true,
        clientId: true,
        body: true,
        scheduledAt: true,
        status: true,
        targets: { where: { platform: "INSTAGRAM" }, select: { accountId: true } },
      },
      orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 60,
    }),
    // The newest leads; the CSV export has all of them.
    prisma.lead.findMany({
      where: leadWhere,
      orderBy: { lastSeenAt: "desc" },
      take: 100, skip: (leadPage - 1) * 100,
      include: {
        client: { select: { name: true, color: true } },
        account: { select: { displayName: true } },
      },
    }),
    prisma.lead.count({ where: leadWhere }),
  ]);

  const counts = await prisma.automationRun.groupBy({
    by: ["ruleId", "status"],
    where: { ruleId: { in: rules.map((r) => r.id) }, createdAt: { gte: weekAgo } },
    _count: { _all: true },
  });
  // People part-way through a conversation, by the step they stopped at.
  const stages = await prisma.automationRun.groupBy({
    by: ["ruleId", "stage"],
    where: {
      ruleId: { in: rules.map((r) => r.id) },
      status: { in: ["SENT", "PARTIAL"] },
      deliveredAt: null,
      stage: { in: ["WAIT_TAP", "WAIT_FOLLOW", "WAIT_ANSWER"] },
    },
    _count: { _all: true },
  });
  const waiting = new Map<string, Partial<Record<"WAIT_TAP" | "WAIT_FOLLOW" | "WAIT_ANSWER", number>>>();
  for (const s of stages) {
    const row = waiting.get(s.ruleId) ?? {};
    row[s.stage as "WAIT_TAP" | "WAIT_FOLLOW" | "WAIT_ANSWER"] = s._count._all;
    waiting.set(s.ruleId, row);
  }

  const week = new Map<string, Partial<Record<AutomationRunStatus, number>>>();
  for (const c of counts) {
    const row = week.get(c.ruleId) ?? {};
    row[c.status] = c._count._all;
    week.set(c.ruleId, row);
  }

  const reportWhere = { rule: { client: inScope }, createdAt: { gte: reportSince } };
  const [matched, dmSent, delivered, collected, visited, visits, activityTotal] = await Promise.all([
    prisma.automationRun.count({ where: reportWhere }),
    prisma.automationRun.count({ where: { ...reportWhere, dmSentAt: { not: null } } }),
    prisma.automationRun.count({ where: { ...reportWhere, deliveredAt: { not: null } } }),
    prisma.automationRun.count({ where: { ...reportWhere, collectedAt: { not: null } } }),
    prisma.automationRun.count({ where: { ...reportWhere, clickedAt: { not: null } } }),
    prisma.automationRun.aggregate({ where: reportWhere, _sum: { clickCount: true } }),
    prisma.automationRun.count({ where: activityWhere }),
  ]);
  return {
    report: { days: period, matched, dmSent, delivered, collected, visited, visits: visits._sum.clickCount ?? 0 },
    pagination: { activityFilter, activityPage, activityTotal, leadPage, leadQuery },
    featureOn: !!workspace && hasFeature(workspace, "ig_automations"),
    aiOn: aiEnabled() && !!workspace && hasFeature(workspace, "ai"),
    accounts: accounts.map((a) => ({
      id: a.id,
      clientId: a.clientId,
      clientName: a.client.name,
      clientColor: a.client.color,
      displayName: a.displayName,
      ready: hasAutomationScopes(a.scopes),
      webhooks: a.webhooksSubscribedAt !== null,
      checkedAt: a.commentsCheckedAt?.toISOString() ?? null,
    })),
    rules: rules.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.client.name,
      clientColor: r.client.color,
      accountId: r.accountId,
      accountName: r.account.displayName,
      name: r.name,
      enabled: r.enabled,
      trigger: r.trigger,
      scope: r.scope,
      mediaId: r.mediaId,
      mediaPermalink: r.mediaPermalink,
      mediaCaption: r.mediaCaption,
      mediaThumbUrl: r.mediaThumbUrl,
      postId: r.postId,
      post: r.post
        ? {
            body: r.post.body,
            scheduledAt: r.post.scheduledAt?.toISOString() ?? null,
            status: r.post.status,
          }
        : null,
      keywords: r.keywords,
      matchMode: r.matchMode,
      fuzzy: r.fuzzy,
      replies: r.replies,
      dmText: r.dmText,
      dmVariants: r.dmVariants,
      rotateEvery: r.rotateEvery,
      dmButtonLabel: r.dmButtonLabel,
      dmButtonUrl: r.dmButtonUrl,
      oncePerPerson: r.oncePerPerson,
      followGate: r.followGate,
      gateText: r.gateText,
      collect: r.collect,
      askText: r.askText,
      followUpText: r.followUpText,
      followUpMinutes: r.followUpMinutes,
      holdWords: r.holdWords,
      aiModeration: r.aiModeration,
      settings: automationSettings(r.settings), nextPost: r.nextPost,
      startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null,
      matchedCount: r.matchedCount,
      dmSentCount: r.dmSentCount,
      replyCount: r.replyCount,
      deliveredCount: r.deliveredCount,
      leadCount: r.leadCount,
      heldCount: r.heldCount,
      lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
      week: week.get(r.id) ?? {},
      waiting: waiting.get(r.id) ?? {},
    })),
    runs: runs.map(runView),
    held: held.map(runView),
    heldTotal,
    failed: failed.map(runView),
    leads: leads.map((l) => ({
      id: l.id,
      clientName: l.client.name,
      clientColor: l.client.color,
      accountName: l.account.displayName,
      username: l.username,
      email: l.email,
      phone: l.phone,
      source: l.source,
      lastRule: l.lastRule,
      touches: l.touches,
      tags: l.tags, notes: l.notes, automationPaused: l.automationPaused,
      lastSeenAt: l.lastSeenAt.toISOString(),
    })),
    leadTotal,
    posts: posts.map((p) => ({
      id: p.id,
      clientId: p.clientId,
      body: p.body,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      status: p.status,
      accountIds: p.targets.map((t) => t.accountId),
    })),
  };
}

type RunRow = Prisma.AutomationRunGetPayload<{
  include: { rule: { select: { name: true; client: { select: { name: true; color: true } } } } };
}>;

function runView(run: RunRow) {
  return {
    id: run.id,
    ruleId: run.ruleId,
    ruleName: run.rule.name,
    clientName: run.rule.client.name,
    clientColor: run.rule.client.color,
    commenter: run.commenterUsername,
    comment: run.commentText,
    trigger: run.trigger,
    status: run.status,
    stage: run.stage,
    source: run.source,
    dmSent: run.dmMessageId !== null,
    replied: run.replyId !== null,
    delivered: run.deliveredAt !== null,
    clicked: run.clickedAt !== null, clickCount: run.clickCount,
    heldReason: run.heldReason,
    error: run.dmError ?? run.replyError ?? run.lastError,
    createdAt: run.createdAt.toISOString(),
  };
}

export type AutomationsPageData = Awaited<ReturnType<typeof getAutomationsPage>>;
export type AutomationRuleView = AutomationsPageData["rules"][number];
export type AutomationAccountView = AutomationsPageData["accounts"][number];
export type AutomationRunView = AutomationsPageData["runs"][number];
export type AutomationPostView = AutomationsPageData["posts"][number];
export type AutomationLeadView = AutomationsPageData["leads"][number];
