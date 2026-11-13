"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { toResult } from "@/lib/to-result";
import { workspaceHasFeature } from "@/lib/plans";
import { aiEnabled, draftCommentReply } from "@/lib/ai";
import { replyDeskEnabled } from "./config";
import { ownedComment, postDeskReply } from "./reply";
import { syncReplyDesk } from "./sync";

// Reply Desk actions (src/app/(app)/replies). Scoped to the caller's
// workspace and refused while the desk is off.

async function deskUser() {
  const user = await requireUser();
  if (!replyDeskEnabled()) throw new ApiError(403, "The Reply Desk isn't available yet.");
  if (!(await workspaceHasFeature(user.workspaceId, "reply_desk"))) {
    throw new ApiError(403, "The Reply Desk is switched off for this workspace.");
  }
  return user;
}

/** Replies publicly under the comment, as the client's account. */
export async function replyToDeskComment(id: string, text: string) {
  return toResult(async () => {
    const user = await deskUser();
    await postDeskReply(user, id, text);
    revalidatePath("/replies");
  });
}

/** Marks a comment done (nothing to say) or back to open. */
export async function setDeskState(id: string, state: "OPEN" | "DONE") {
  return toResult(async () => {
    const user = await deskUser();
    const comment = await ownedComment(user.workspaceId, id);
    const next = z.enum(["OPEN", "DONE"]).parse(state);
    await prisma.inboxComment.update({ where: { id: comment.id }, data: { state: next } });
    revalidatePath("/replies");
  });
}

/** Reads every account's comments now instead of waiting for the next run. */
export async function refreshDesk() {
  return toResult(async () => {
    const user = await deskUser();
    const summary = await syncReplyDesk({ workspaceId: user.workspaceId, budgetMs: 25_000 });
    revalidatePath("/replies");
    return summary;
  });
}

/** An AI draft of a reply, in the client's voice, for the person to edit. */
export async function draftDeskReply(id: string) {
  return toResult(async () => {
    const user = await deskUser();
    if (!aiEnabled() || !(await workspaceHasFeature(user.workspaceId, "ai"))) {
      throw new ApiError(403, "AI helpers aren't switched on.");
    }
    const comment = await ownedComment(user.workspaceId, id);
    const client = await prisma.client.findUnique({
      where: { id: comment.clientId },
      select: { name: true },
    });
    return draftCommentReply({
      brand: client?.name ?? comment.account.displayName,
      platform: comment.platform,
      post: comment.mediaTitle,
      comment: comment.text,
      author: comment.author,
    });
  });
}
