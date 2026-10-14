import type { KeywordMatch } from "@prisma/client";

// Client-safe keyword matching, shared by the engine and the editor's preview.

/** Lowercase and fold full-width and compatibility characters, so "ＬＩＮＫ" is "link". */
export function normalize(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().trim();
}

/** Trims, lowercases and de-duplicates what the user typed, dropping blanks. */
export function cleanKeywords(raw: string[]): string[] {
  return [...new Set(raw.map(normalize).filter(Boolean))];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does a comment trigger the rule? WORD needs the keyword as a whole word or
 * phrase, so "link" matches "LINK pls 🙏" and "send the link!" but not
 * "linked". It also works for emoji and non-Latin scripts, since a boundary
 * is anything that isn't a letter or digit.
 */
export function matchesKeywords(
  comment: string,
  keywords: string[],
  mode: KeywordMatch,
): boolean {
  if (mode === "ANY_COMMENT") return true;
  const text = normalize(comment);
  if (!text) return false;
  return keywords.some((raw) => {
    const kw = normalize(raw);
    if (!kw) return false;
    if (mode === "CONTAINS") return text.includes(kw);
    return new RegExp(
      `(^|[^\\p{L}\\p{N}_])${escapeRegExp(kw)}($|[^\\p{L}\\p{N}_])`,
      "u",
    ).test(text);
  });
}
