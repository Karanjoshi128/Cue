// AI helpers (Claude). Everything here is optional: without ANTHROPIC_API_KEY
// the features that use it are hidden and these return nothing.

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Why a comment should be held as abusive, or null to let it through.
 * Filled in with the Claude call in the AI step; until then it holds nothing.
 */
export async function moderateComment(text: string): Promise<string | null> {
  void text;
  return null;
}
