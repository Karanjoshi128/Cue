import type { AutomationIdea } from "@/lib/ai";
import { LIMITS, type AutomationPreset } from "./config";
import { cleanKeywords } from "./match";

/** A web address as https, or null: DM buttons must be https. */
function httpsUrl(value: string | null): string | null {
  const v = value?.trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    if (u.protocol === "http:") u.protocol = "https:";
    return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Claude's reading of a described automation, held to the editor's limits.
 * It's a suggestion: the editor opens with it and the person saves it.
 */
export function presetFromIdea(idea: AutomationIdea): AutomationPreset {
  const keywords = cleanKeywords(idea.keywords)
    .filter((k) => k.length <= LIMITS.keywordLength)
    .slice(0, LIMITS.keywords);
  const buttonUrl = httpsUrl(idea.link);
  // No keyword means every comment or story reply; a DM trigger needs one.
  const matchMode =
    !keywords.length && idea.trigger !== "DM_KEYWORD"
      ? "ANY_COMMENT"
      : idea.matchMode === "ANY_COMMENT" && keywords.length
        ? "WORD"
        : idea.matchMode;
  return {
    name: idea.name.trim().slice(0, LIMITS.name) || "New automation",
    trigger: idea.trigger,
    matchMode,
    keywords,
    replies:
      idea.trigger === "COMMENT"
        ? idea.publicReplies
            .map((r) => r.trim().slice(0, LIMITS.replyLength))
            .filter(Boolean)
            .slice(0, LIMITS.replies)
        : [],
    dmText: idea.dmText.trim().slice(0, LIMITS.dmLength),
    buttonUrl,
    buttonLabel: buttonUrl ? (idea.buttonLabel?.trim() || "Open the link").slice(0, LIMITS.buttonLabel) : null,
    followGate: idea.followGate,
    collect: idea.collect,
    followUp: idea.followUp,
  };
}
