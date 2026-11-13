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

/** The comment's words: runs of letters and digits, in any script. */
function words(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Edit distance with adjacent swaps counting as one edit (optimal string
 * alignment), stopping early once it's over `max`.
 */
function distance(a: string, b: string, max: number): number {
  const x = [...a];
  const y = [...b];
  if (Math.abs(x.length - y.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) =>
    Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= x.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[x.length][y.length];
}

/**
 * A typo of a one-word keyword. Short words are where typos turn into other
 * real words ("link" and "line"), so 4-letter keywords only forgive swapped
 * or doubled letters ("lnik", "linkk"), and 5+ letters forgive any one slip.
 * Under 4 letters must be exact.
 */
function nearMiss(word: string, kw: string): boolean {
  const len = [...kw].length;
  if (len < 4 || word === kw) return false;
  if (len === 4) {
    const doubled = word.replace(/(.)\1/gu, "$1") === kw;
    const swapped =
      word.length === kw.length &&
      [...word].sort().join("") === [...kw].sort().join("") &&
      distance(word, kw, 1) === 1;
    return doubled || swapped;
  }
  return distance(word, kw, 1) <= 1;
}

/**
 * Does a comment trigger the rule? WORD needs the keyword as a whole word or
 * phrase, so "link" matches "LINK pls 🙏" and "send the link!" but not
 * "linked". It also works for emoji and non-Latin scripts, since a boundary
 * is anything that isn't a letter or digit. With `fuzzy`, a one-word keyword
 * also matches a near miss (see nearMiss).
 */
export function matchesKeywords(
  comment: string,
  keywords: string[],
  mode: KeywordMatch,
  fuzzy = false,
): boolean {
  if (mode === "ANY_COMMENT") return true;
  const text = normalize(comment);
  if (!text) return false;
  const commentWords = fuzzy && mode === "WORD" ? words(text) : [];
  return keywords.some((raw) => {
    const kw = normalize(raw);
    if (!kw) return false;
    if (mode === "CONTAINS") return text.includes(kw);
    const exact = new RegExp(
      `(^|[^\\p{L}\\p{N}_])${escapeRegExp(kw)}($|[^\\p{L}\\p{N}_])`,
      "u",
    ).test(text);
    if (exact || !fuzzy || /[^\p{L}\p{N}]/u.test(kw)) return exact;
    return commentWords.some((w) => nearMiss(w, kw));
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** An email address in a reply, if there is one. */
export function findEmail(text: string): string | null {
  const hit = text.split(/\s+/).map((t) => t.replace(/[.,;:!?)]+$/, "")).find((t) => EMAIL.test(t));
  return hit ? hit.toLowerCase() : null;
}

/** A phone number in a reply (7 to 15 digits, an optional leading +), if there is one. */
export function findPhone(text: string): string | null {
  const m = text.match(/\+?\d[\d\s().-]{5,}\d/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (m[0].trim().startsWith("+") ? "+" : "") + digits;
}
