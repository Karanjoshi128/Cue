// YouTube tag + category rules, shared by the composer (live budget counter)
// and the server (validation), so the number a user watches is exactly the one
// that gets enforced. Pure functions only - this is imported by client code.

/** YouTube's total tag budget, in characters. */
export const YOUTUBE_TAG_BUDGET = 500;

/**
 * Trims every tag, drops empties, and removes duplicates while keeping the
 * first occurrence's position and casing. Duplicates are matched
 * case-insensitively because YouTube treats "Shorts" and "shorts" as the same
 * tag, so keeping both would only waste budget.
 */
export function cleanYoutubeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * How much of the 500-character budget a tag list uses. YouTube charges each
 * tag its length plus 1 for the separator, plus 2 more when it contains a
 * space, because it stores those wrapped in quotes.
 */
export function youtubeTagsCost(tags: readonly string[]): number {
  return tags.reduce(
    (sum, tag) => sum + tag.length + 1 + (tag.includes(" ") ? 2 : 0),
    0,
  );
}

/**
 * The first problem with a (cleaned) tag list, or null if YouTube will accept
 * it. `<` and `>` are rejected here rather than at publish time: YouTube
 * refuses the whole upload over them, and for a scheduled post that failure
 * would otherwise surface hours later with nobody watching.
 */
export function youtubeTagsProblem(tags: readonly string[]): string | null {
  const bad = tags.find((t) => /[<>]/.test(t));
  if (bad) return `YouTube tags can't contain < or > (in "${bad}").`;
  const cost = youtubeTagsCost(tags);
  if (cost > YOUTUBE_TAG_BUDGET) {
    return `YouTube tags use ${cost} of ${YOUTUBE_TAG_BUDGET} characters. Remove some tags.`;
  }
  return null;
}

/**
 * Assignable video categories. The id is what the Data API expects; posts
 * without one fall back to 22 (People & Blogs) in the adapter.
 */
export const YOUTUBE_CATEGORIES = [
  { id: "1", label: "Film & Animation" },
  { id: "2", label: "Autos & Vehicles" },
  { id: "10", label: "Music" },
  { id: "15", label: "Pets & Animals" },
  { id: "17", label: "Sports" },
  { id: "19", label: "Travel & Events" },
  { id: "20", label: "Gaming" },
  { id: "22", label: "People & Blogs" },
  { id: "23", label: "Comedy" },
  { id: "24", label: "Entertainment" },
  { id: "25", label: "News & Politics" },
  { id: "26", label: "Howto & Style" },
  { id: "27", label: "Education" },
  { id: "28", label: "Science & Technology" },
  { id: "29", label: "Nonprofits & Activism" },
] as const;

export const DEFAULT_YOUTUBE_CATEGORY = "22";
