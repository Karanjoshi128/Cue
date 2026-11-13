import type { User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { ensureFreshAccessToken } from "@/lib/tokens";
import { replyToComment as replyOnInstagram } from "@/lib/automations/instagram-api";
import { REPLY_LIMIT } from "./config";
import { replyToYouTubeComment } from "./youtube";

// Replying from the Reply Desk, shared by its page (actions.ts) and the
// connector (src/lib/connector/tools.ts). Callers authenticate `user` first.

export async function ownedComment(workspaceId: string, id: string) {
  const comment = await prisma.inboxComment.findFirst({
    // Parsed: ids arrive from server actions and the connector.
    where: { id: z.string().min(1).max(100).parse(id), account: { client: { workspaceId } } },
    include: { account: true },
  });
  if (!comment) throw new ApiError(404, "That comment is gone.");
  return comment;
}

/** Replies publicly under the comment, as the client's account. */
export async function postDeskReply(user: User, id: string, text: string): Promise<void> {
  const body = z.string().trim().min(1, "Write a reply first.").max(REPLY_LIMIT).parse(text);
  const comment = await ownedComment(user.workspaceId, id);
  let replyId: string;
  try {
    const token = await ensureFreshAccessToken(comment.account);
    replyId =
      comment.platform === "INSTAGRAM"
        ? await replyOnInstagram(token, comment.externalId, body)
        : await replyToYouTubeComment(token, comment.externalId, body);
  } catch (err) {
    throw new ApiError(502, err instanceof Error ? err.message : "The reply didn't go.");
  }
  await prisma.inboxComment.update({
    where: { id: comment.id },
    data: {
      state: "REPLIED",
      replyText: body,
      replyId,
      repliedAt: new Date(),
      repliedBy: user.name ?? user.email,
    },
  });
}
