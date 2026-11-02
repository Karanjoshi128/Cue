import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuth } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { pendingInvitesFor } from "@/lib/invites";
import { AuthShell } from "@/components/auth-shell";
import { OnboardingForm } from "@/components/onboarding-form";
import { InviteActions } from "@/components/invite-actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up your workspace",
};

const STAGE_TITLE = (
  <>
    First, <em className="text-[#7aa8ff]">set the stage.</em>
  </>
);
const STAGE_BODY =
  "A workspace holds your clients, their connected accounts, and everything you schedule for them. Invite your team once it's ready.";

/**
 * Signed in, but not in a workspace yet (or any more). Before creating an
 * empty one, check whether they were invited: a wrong email is the usual
 * reason someone lands here, and an empty workspace would hide that.
 * `?create=1` shows the form; existing members arrive with it from the
 * switcher's "Create a workspace".
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const { user, email, needsOnboarding, viewAs } = await getAuth();
  const { create } = await searchParams;
  if (!email) redirect("/login");
  if (viewAs) redirect("/dashboard");
  const creating = create === "1";
  // Already in a workspace and not asking for another → into the app.
  if (user && !creating) redirect("/dashboard");
  if (!user && !needsOnboarding) redirect("/login");

  const handle = email.split("@")[0];
  const suggestion = user ? "" : handle ? `${handle}'s workspace` : "";
  const footer = (
    <>
      Signed in as <span className="text-foreground">{email}</span>
      {" · "}
      <a href="/logout" className="hover:text-foreground underline underline-offset-2">
        Use a different email
      </a>
    </>
  );

  if (creating) {
    return (
      <AuthShell
        stageTitle={STAGE_TITLE}
        stageBody={STAGE_BODY}
        eyebrow="New workspace"
        title={
          <>
            Name your <em>workspace.</em>
          </>
        }
        description="Usually your agency's name. You can rename it any time."
        footer={footer}
      >
        <OnboardingForm suggestion={suggestion} />
        {user && (
          <Button render={<Link href="/dashboard" />} variant="ghost" className="mt-3 w-full">
            Cancel
          </Button>
        )}
      </AuthShell>
    );
  }

  const invites = await pendingInvitesFor(email);
  if (invites.length) {
    return (
      <AuthShell
        stageTitle={STAGE_TITLE}
        stageBody={STAGE_BODY}
        eyebrow={
          <>
            <span className="tally text-standby" data-live="true" />
            {invites.length === 1 ? "An invitation is waiting" : `${invites.length} invitations are waiting`}
          </>
        }
        title={
          <>
            You&apos;ve been <em>invited.</em>
          </>
        }
        description="Accept to join the workspace. You can be in more than one."
        footer={footer}
      >
        <ul className="space-y-3">
          {invites.map((i) => (
            <li key={i.id} className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.workspace.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  From {i.invitedBy?.name || i.invitedBy?.email || "a teammate"} ·{" "}
                  {i.role === "ADMIN" ? "Admin" : "Manager"}
                </p>
              </div>
              <InviteActions token={decrypt(i.tokenEnc)} workspaceName={i.workspace.name} compact />
            </li>
          ))}
        </ul>
        <Button render={<Link href="/onboarding?create=1" />} variant="ghost" className="mt-4 w-full">
          Create my own workspace instead
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      stageTitle={STAGE_TITLE}
      stageBody={STAGE_BODY}
      eyebrow="Almost there"
      title={
        <>
          No workspace <em>yet.</em>
        </>
      }
      description={`There's no Cue workspace for ${email}.`}
      footer={footer}
    >
      <div className="space-y-4">
        <div className="bg-muted/50 rounded-xl border px-4 py-3 text-sm leading-relaxed">
          <p className="font-medium">Waiting for an invite from your team?</p>
          <p className="text-muted-foreground mt-1">
            Invites are tied to one email address. Check you signed in with the address the
            invite was sent to, or ask your admin to send it again.
          </p>
        </div>
        <Button render={<a href="/logout" />} variant="outline" size="xl" className="w-full">
          Use a different email
        </Button>
        <Button render={<Link href="/onboarding?create=1" />} size="xl" className="w-full">
          Create my own workspace
        </Button>
      </div>
    </AuthShell>
  );
}
