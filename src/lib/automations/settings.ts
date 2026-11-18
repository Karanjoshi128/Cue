import { z } from "zod";
import { matchesKeywords, normalize } from "./match";
import { LIMITS } from "./config";

const copy = (max: number) => z.string().trim().max(max).optional();
export const automationSettingsSchema = z.object({
  openingDm: z.boolean().optional(),
  gateButtonLabel: copy(LIMITS.buttonLabel),
  followPrompt: copy(LIMITS.dmLength),
  invalidAnswerText: copy(LIMITS.dmLength),
  excludedKeywords: z.array(z.string().trim().min(1).max(LIMITS.keywordLength)).max(30).optional(),
  exactMatch: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  cooldownHours: z.number().int().min(1).max(24 * 30).optional(),
  leadTags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  trackClicks: z.boolean().optional(),
}).strict();
export type AutomationSettings = z.infer<typeof automationSettingsSchema>;
export function automationSettings(value: unknown): AutomationSettings {
  return value == null ? {} : automationSettingsSchema.parse(value);
}

type MatchRule = { keywords: string[]; matchMode: "WORD" | "CONTAINS" | "ANY_COMMENT"; fuzzy: boolean; settings?: unknown };
/** One matcher for the preview and real events, including exclusions and exact phrases. */
export function ruleMatch(text: string, rule: MatchRule): { matched: boolean; reason: string } {
  const settings = automationSettings(rule.settings);
  const excluded = settings.excludedKeywords?.find((kw) => matchesKeywords(text, [kw], "WORD"));
  if (excluded) return { matched: false, reason: `Excluded by “${excluded}”` };
  const matched = settings.exactMatch && rule.matchMode !== "ANY_COMMENT"
    ? rule.keywords.some((kw) => normalize(text) === normalize(kw))
    : matchesKeywords(text, rule.keywords, rule.matchMode, rule.fuzzy);
  return { matched, reason: matched ? "Matches this automation" : "No matching keyword" };
}

export function campaignActive(rule: { enabled: boolean; startsAt?: Date | null; endsAt?: Date | null }, at = new Date()): boolean {
  return rule.enabled && (!rule.startsAt || rule.startsAt <= at) && (!rule.endsAt || rule.endsAt > at);
}

export function compareRules(a: { scope?: string; matchMode: string; settings?: unknown; createdAt: Date }, b: { scope?: string; matchMode: string; settings?: unknown; createdAt: Date }): number {
  return Number(a.scope !== "ONE_POST") - Number(b.scope !== "ONE_POST")
    || (automationSettings(b.settings).priority ?? 0) - (automationSettings(a.settings).priority ?? 0)
    || Number(a.matchMode === "ANY_COMMENT") - Number(b.matchMode === "ANY_COMMENT")
    || a.createdAt.getTime() - b.createdAt.getTime();
}
