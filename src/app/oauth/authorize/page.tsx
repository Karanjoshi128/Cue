import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { featureAvailable, hasFeature } from "@/lib/plans";
import { AUTHORIZE_PATH } from "@/lib/connector/config";
import { checkAuthorizeRequest, hostOf } from "@/lib/connector/oauth";
import { requestOrigin } from "@/lib/connector/origin";
import { answerAuthorization } from "@/lib/connector/actions";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";

// The consent screen an assistant (Claude, ChatGPT) sends a member to when
// they connect Cue. See src/lib/connector/oauth.ts.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect an app",
  robots: { index: false },
};

const FIELDS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
  "resource",
] as const;

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params: Record<string, string> = {};
  for (const k of FIELDS) {
    const v = Array.isArray(raw[k]) ? raw[k][0] : raw[k];
    if (v !== undefined) params[k] = v;
  }

  const origin = await requestOrigin();
  const check = await checkAuthorizeRequest(params, origin);
  if (!check.ok && "redirect" in check) redirect(check.redirect);

  const { user, viewAs, needsOnboarding, blocked } = await getAuth();
  if (check.ok && !user && !blocked) {
    const back = `${AUTHORIZE_PATH}?${new URLSearchParams(params)}`;
    redirect(needsOnboarding ? "/onboarding" : `/login?next=${encodeURIComponent(back)}`);
  }

  const workspace = user
    ? await prisma.workspace.findUnique({
        where: { id: user.workspaceId },
        select: { name: true, disabledFeatures: true, earlyFeatures: true },
      })
    : null;

  const problem = !check.ok
    ? check.fatal
    : blocked || !user
      ? "Your Cue account can't be used right now. Contact Cue support."
      : viewAs
        ? "You're viewing this workspace as Cue support. Sign in as yourself to connect an app."
        : workspace && !hasFeature(workspace, "api")
          ? "API access, which the connector uses, is turned off for this workspace. Contact Cue support."
          : null;

  const shell = {
    stageTitle: (
      <>
        Your assistant, <em className="text-[#7aa8ff]">on cue.</em>
      </>
    ),
    stageBody:
      "Ask Claude or ChatGPT to draft next week's posts, check what's scheduled, or answer the questions waiting in the comments.",
  };

  if (problem || !check.ok || !user) {
    return (
      <AuthShell
        {...shell}
        eyebrow={
          <>
            <span className="tally text-fault" />
            Can&apos;t connect
          </>
        }
        title={
          <>
            Nothing was <em>shared.</em>
          </>
        }
        description={problem ?? "Start connecting again from the app."}
      >
        <Button render={<Link href="/dashboard" />} variant="outline" size="xl" className="w-full">
          Back to Cue
        </Button>
      </AuthShell>
    );
  }

  const host = hostOf(check.request.redirectUri);
  const local = host === "an app on this computer";
  const desk = !!workspace && featureAvailable(workspace, "reply_desk") && hasFeature(workspace, "reply_desk");
  const can = [
    "See your clients, their connected accounts and their posts",
    "Write drafts and schedule posts, and publish when you ask it to",
    "Delete drafts and scheduled posts",
    ...(desk ? ["Read comments waiting for a reply, and reply as the client"] : []),
  ];

  return (
    <AuthShell
      {...shell}
      eyebrow={
        <>
          <span className="tally text-live" data-live="true" />
          Connect an app
        </>
      }
      title={
        <>
          Allow <em className="wrap-break-word">{check.request.clientName.slice(0, 60)}</em>?
        </>
      }
      description={
        <>
          It will use Cue as you ({user.email}) in {workspace?.name ?? "your workspace"}. After you
          choose, you go back to <span className="text-foreground font-medium">{host}</span>.
        </>
      }
    >
      <ul className="space-y-3 text-sm">
        {can.map((line) => (
          <li key={line} className="flex gap-3">
            <Check className="text-live-ink mt-0.5 size-4 shrink-0" />
            {line}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
        It can&apos;t change your team, billing or connected social accounts. Disconnect it any
        time in Settings.
      </p>
      {local && (
        <p className="bg-standby/10 text-standby-ink mt-5 flex gap-2.5 rounded-xl p-3 text-xs leading-relaxed">
          <TriangleAlert className="mt-px size-4 shrink-0" />
          Only allow this if you just started connecting from an app on this computer, like Claude
          Code.
        </p>
      )}
      <form action={answerAuthorization} className="mt-8 flex gap-3">
        {Object.entries(params).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <Button type="submit" name="decision" value="allow" size="xl" className="flex-1">
          Allow
        </Button>
        <Button type="submit" name="decision" value="deny" size="xl" variant="outline">
          Cancel
        </Button>
      </form>
    </AuthShell>
  );
}
