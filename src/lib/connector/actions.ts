"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { toResult } from "@/lib/to-result";
import { workspaceHasFeature } from "@/lib/plans";
import { checkAuthorizeRequest, errorRedirect, issueCode } from "./oauth";
import { requestOrigin } from "./origin";

/**
 * The consent screen's answer. Everything is checked again from the form,
 * since it came back through the browser. Allow sends a one-time code to the
 * app; Cancel sends it access_denied.
 */
export async function answerAuthorization(formData: FormData) {
  const params: Record<string, string> = {};
  for (const [k, v] of formData) if (typeof v === "string" && !k.startsWith("$")) params[k] = v;
  const origin = await requestOrigin();
  const check = await checkAuthorizeRequest(params, origin);
  if (!check.ok) {
    if ("redirect" in check) redirect(check.redirect);
    throw new ApiError(400, check.fatal);
  }
  const { request } = check;
  if (formData.get("decision") !== "allow") {
    redirect(errorRedirect(request.redirectUri, origin, request.state, "access_denied", "The person declined."));
  }
  // Refuses Cue support viewing a workspace: it must be the member themselves.
  const user = await requireUser();
  if (!(await workspaceHasFeature(user.workspaceId, "api"))) {
    throw new ApiError(403, "API access, which the connector uses, is turned off for this workspace.");
  }
  redirect(await issueCode(request, user, origin));
}

/** Disconnects an app from Settings: its tokens stop working straight away. */
export async function disconnectApp(grantId: string) {
  return toResult(async () => {
    const user = await requireUser();
    await prisma.oAuthGrant.updateMany({
      where: { id: z.string().min(1).max(100).parse(grantId), userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    revalidatePath("/settings");
  });
}
