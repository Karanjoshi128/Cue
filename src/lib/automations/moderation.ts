import type { AutomationRule } from "@prisma/client";
import { normalize } from "./match";

/**
 * Why a comment should be held for review instead of answered, or null.
 * Hold words match anywhere in the comment, in any script. The AI check
 * (rule.aiModeration) is added by src/lib/ai.ts when a key is configured.
 */
export async function holdReason(
  rule: Pick<AutomationRule, "holdWords" | "aiModeration">,
  text: string,
): Promise<string | null> {
  const t = normalize(text);
  const word = rule.holdWords.map(normalize).find((w) => w && t.includes(w));
  if (word) return `Contains "${word}"`;
  if (rule.aiModeration) {
    const { moderateComment } = await import("@/lib/ai");
    return moderateComment(text);
  }
  return null;
}
