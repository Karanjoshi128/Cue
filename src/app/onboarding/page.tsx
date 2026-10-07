import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuth } from "@/lib/auth";
import { AuthShell } from "@/components/auth-shell";
import { OnboardingForm } from "@/components/onboarding-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up your workspace",
};

export default async function OnboardingPage() {
  const { user, email, needsOnboarding } = await getAuth();
  // Already a member → into the app. Not authenticated → back to login.
  if (user) redirect("/dashboard");
  if (!email || !needsOnboarding) redirect("/login");

  const handle = email.split("@")[0];
  const suggestion = handle ? `${handle}'s workspace` : "";

  return (
    <AuthShell
      stageTitle={
        <>
          First, <em className="text-[#7aa8ff]">set the stage.</em>
        </>
      }
      stageBody="A workspace holds your clients, their connected accounts, and everything you schedule for them. Invite your team once it's ready."
      eyebrow={
        <>
          <span className="tally text-standby" data-live="true" />
          Step 1 of 1
        </>
      }
      title={
        <>
          Name your <em>workspace.</em>
        </>
      }
      description="Usually your agency's name. You can rename it any time."
      footer={
        <>
          Signed in as <span className="text-foreground">{email}</span>
        </>
      }
    >
      <OnboardingForm suggestion={suggestion} />
    </AuthShell>
  );
}
