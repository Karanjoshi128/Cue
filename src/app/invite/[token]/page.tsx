import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { hashInviteToken, inviteState } from "@/lib/invites";
import { AuthShell } from "@/components/auth-shell";
import { InviteActions } from "@/components/invite-actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your invitation",
  // Invite links are private; keep them out of search engines.
  robots: { index: false, follow: false },
};

const STAGE_TITLE = (
  <>
    Every client. Every channel. <em className="text-[#7aa8ff]">On cue.</em>
  </>
);
const STAGE_BODY =
  "Cue is where the team plans and schedules posts for every client on LinkedIn, Instagram and YouTube.";

/**
 * Where an invitation email lands. Opening it changes nothing: the invited
 * person signs in with the invited address and clicks Accept.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = /^[A-Za-z0-9_-]{16,80}$/.test(token)
    ? await prisma.invite.findUnique({
        where: { tokenHash: hashInviteToken(token) },
        include: {
          workspace: { select: { name: true } },
          invitedBy: { select: { name: true, email: true } },
        },
      })
    : null;

  if (!invite) {
    return (
      <Notice title={<>This link <em>doesn&apos;t work.</em></>}>
        It may have been mistyped or cut short. Ask the person who invited you to send it again.
      </Notice>
    );
  }

  const state = inviteState(invite);
  const ws = invite.workspace.name;
  const inviter = invite.invitedBy?.name || invite.invitedBy?.email || "Someone";
  const roleLabel = invite.role === "ADMIN" ? "an admin" : "a manager";

  if (state === "accepted") {
    return (
      <Notice title={<>You&apos;re <em>in.</em></>} cta={{ href: "/dashboard", label: `Open ${ws}` }}>
        This invitation to {ws} has already been accepted.
      </Notice>
    );
  }
  if (state !== "pending") {
    const why =
      state === "expired"
        ? `This invitation expired on ${format(invite.expiresAt, "d MMMM")}.`
        : state === "revoked"
          ? "This invitation was withdrawn."
          : "This invitation was declined.";
    return (
      <Notice title={<>This invite is <em>closed.</em></>}>
        {why} Ask {inviter} to invite you again from {ws}&apos;s team settings.
      </Notice>
    );
  }

  const { email } = await getAuth();
  const here = `/invite/${token}`;
  const signIn = `/login?${new URLSearchParams({ email: invite.email, next: here })}`;

  return (
    <AuthShell
      stageTitle={STAGE_TITLE}
      stageBody={STAGE_BODY}
      eyebrow={
        <>
          <span className="tally text-standby" data-live="true" />
          Invitation
        </>
      }
      title={
        <>
          Join <em>{ws}.</em>
        </>
      }
      description={`${inviter} invited you to ${ws} on Cue as ${roleLabel}.`}
      footer={
        <>
          Sent to <span className="text-foreground">{invite.email}</span>. Expires{" "}
          {format(invite.expiresAt, "d MMMM")}.
        </>
      }
    >
      {!email ? (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Sign in with <span className="text-foreground font-medium">{invite.email}</span> to
            accept. We&apos;ll email you a one-time code, then bring you back here.
          </p>
          <Button render={<Link href={signIn} />} size="xl" className="w-full">
            Sign in to accept
          </Button>
        </div>
      ) : email.toLowerCase() !== invite.email ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">
            This invite is for <span className="font-medium">{invite.email}</span>, but you&apos;re
            signed in as <span className="font-medium">{email}</span>.
          </p>
          <Button
            // A plain link: sign-out is a GET handler, so it must not be prefetched.
            render={<a href={`/logout?${new URLSearchParams({ next: signIn })}`} />}
            size="xl"
            className="w-full"
          >
            Sign out and use {invite.email}
          </Button>
          <Button render={<Link href="/dashboard" />} variant="ghost" className="w-full">
            Not now
          </Button>
        </div>
      ) : (
        <InviteActions token={token} workspaceName={ws} />
      )}
    </AuthShell>
  );
}

function Notice({
  title,
  children,
  cta = { href: "/login", label: "Go to sign in" },
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  cta?: { href: string; label: string };
}) {
  return (
    <AuthShell
      stageTitle={STAGE_TITLE}
      stageBody={STAGE_BODY}
      eyebrow="Invitation"
      title={title}
      description={children}
    >
      <Button render={<Link href={cta.href} />} size="xl" className="w-full">
        {cta.label}
      </Button>
    </AuthShell>
  );
}
