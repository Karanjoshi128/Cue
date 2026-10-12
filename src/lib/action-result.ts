// Server Actions that can fail in ways the user should read ("your plan
// includes 2 clients") return their failure instead of throwing it: a
// production build replaces a thrown error's message with a generic one.

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Client side: the data, or the action's message thrown as a normal Error. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
