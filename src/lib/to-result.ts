import { ZodError } from "zod";
import { ApiError } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";

/**
 * Runs a Server Action body and returns its failure as a value when it's one
 * the user should read (ApiError or a validation error), so the message
 * survives a production build. Anything unexpected is rethrown and stays
 * private.
 */
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    if (e instanceof ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Check the form." };
    }
    throw e;
  }
}
