import type { CommentKind } from "@prisma/client";

// Client-safe. Sorts a comment so the Reply Desk can show real questions
// first. Rules, not AI: AI (src/lib/ai.ts) refines it when it's switched on.

// Asking words in English and common Hinglish ("kitna", "kab", "kaise"), and
// the usual "link?", "dm me" requests.
const ASKING =
  /(^|[^\p{L}])(how|what|when|where|which|who|why|price|cost|rate|charges?|kitna|kitne|kitni|kab|kaha|kahan|kaise|kya|available|availability|size|sizes|ship|shipping|deliver|delivery|order|buy|link|dm|details|info|discount|offer)([^\p{L}]|$)/iu;

const PRAISE =
  /^(nice|wow|love( it| this)?|great|amazing|awesome|beautiful|cool|super|so good|first|wah|mast|badhiya|bahut badhiya|great work|good one)[\s!.]*$/iu;

export function classifyComment(text: string): CommentKind {
  const t = text.trim();
  if (!t) return "NOISE";
  // Emoji, punctuation and spaces only.
  const letters = t.replace(/[\p{Extended_Pictographic}\p{P}\p{S}\s‍️]/gu, "");
  if (!letters) return "NOISE";
  // Only tagging friends.
  if (/^(@[\w.]+[\s,]*)+$/u.test(t)) return "NOISE";
  if (t.includes("?") || ASKING.test(t)) return "QUESTION";
  if (PRAISE.test(t) || [...letters].length <= 3) return "NOISE";
  return "OTHER";
}
