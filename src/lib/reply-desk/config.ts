// Client-safe. The Reply Desk reads comments, which needs Instagram's comment
// permission (Advanced Access via App Review) and YouTube's youtube.force-ssl
// (Google verification) before it can serve clients. Hidden until then; the
// flag is inlined at build, so changing it needs a redeploy.
export function replyDeskEnabled(): boolean {
  return process.env.NEXT_PUBLIC_REPLY_DESK === "1";
}

export const REPLY_LIMIT = 2000;

export const DESK_FILTERS = ["questions", "open", "noise", "replied", "done"] as const;
export type DeskFilter = (typeof DESK_FILTERS)[number];
