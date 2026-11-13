import type { AutomationRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceId } from "@/lib/auth";
import { hasFeature } from "@/lib/plans";
import { aiEnabled } from "@/lib/ai";
import { hasAutomationScopes } from "./config";

// The Automations page. Self-scoped to the caller's workspace like
// src/lib/data.ts, and returns plain values so it can go straight to the
// client component.

export async function getAutomationsPage(clientId?: string) {
  const workspaceId = await requireWorkspaceId();
  const inScope = { workspaceId, ...(clientId ? { id: clientId } : {}) };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [workspace, accounts, rules, runs, posts, leads, leadTotal] = await Promise.all([
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
      where: { rule: { client: inScope } },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        rule: {
          select: {
            name: true,
            client: { select: { name: true, color: true } },
          },
        },
      },
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
      where: { client: inScope },
      orderBy: { lastSeenAt: "desc" },
      take: 100,
      include: {
        client: { select: { name: true, color: true } },
        account: { select: { displayName: true } },
      },
    }),
    prisma.lead.count({ where: { client: inScope } }),
  ]);

  const counts = await prisma.automationRun.groupBy({
    by: ["ruleId", "status"],
    where: { ruleId: { in: rules.map((r) => r.id) }, createdAt: { gte: weekAgo } },
    _count: { _all: true },
  });
  const week = new Map<string, Partial<Record<AutomationRunStatus, number>>>();
  for (const c of counts) {
    const row = week.get(c.ruleId) ?? {};
    row[c.status] = c._count._all;
    week.set(c.ruleId, row);
  }

  return {
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
      matchedCount: r.matchedCount,
      dmSentCount: r.dmSentCount,
      replyCount: r.replyCount,
      deliveredCount: r.deliveredCount,
      leadCount: r.leadCount,
      heldCount: r.heldCount,
      lastTriggeredAt: r.lastTriggeredAt?.toISOString() ?? null,
      week: week.get(r.id) ?? {},
    })),
    runs: runs.map((run) => ({
      id: run.id,
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
      heldReason: run.heldReason,
      error: run.dmError ?? run.replyError ?? run.lastError,
      createdAt: run.createdAt.toISOString(),
    })),
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

export type AutomationsPageData = Awaited<ReturnType<typeof getAutomationsPage>>;
export type AutomationRuleView = AutomationsPageData["rules"][number];
export type AutomationAccountView = AutomationsPageData["accounts"][number];
export type AutomationRunView = AutomationsPageData["runs"][number];
export type AutomationPostView = AutomationsPageData["posts"][number];
export type AutomationLeadView = AutomationsPageData["leads"][number];
