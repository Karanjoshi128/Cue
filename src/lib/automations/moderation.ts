import type { AutomationRule } from "@prisma/client";
import { normalize } from "./match";

/**
 * Why a comment should be held for review instead of answered, or null.
 * Hold words match anywhere in the comment, in any script. The AI check
 * (rule.aiModeration, src/lib/ai.ts) runs only while `aiAllowed`: a key is
 * set and AI helpers are on for the workspace.
 */
export async function holdReason(
  rule: Pick<AutomationRule, "holdWords" | "aiModeration">,
  text: string,
  aiAllowed: boolean,
): Promise<string | null> {
  const t = normalize(text);
  const word = rule.holdWords.map(normalize).find((w) => w && t.includes(w));
  if (word) return `Contains "${word}"`;
  if (rule.aiModeration && aiAllowed) {
    const { moderateComment } = await import("@/lib/ai");
    return moderateComment(text);
  }
  return null;
}
