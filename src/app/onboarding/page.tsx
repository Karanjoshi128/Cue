import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { OnboardingForm } from "@/components/onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const { user, email, needsOnboarding } = await getAuth();
  // Already a member → into the app. Not authenticated → back to login.
  if (user) redirect("/");
  if (!email || !needsOnboarding) redirect("/login");

  const handle = email.split("@")[0];
  const suggestion = handle ? `${handle}'s workspace` : "";

  return (
    <main className="bg-linear-to-b from-muted to-background flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="bg-card shadow-primary/5 rounded-2xl border p-8 shadow-xl sm:p-10">
          <div className="mb-8 flex justify-center">
            <Logo className="h-9 w-auto" />
          </div>

          <div className="space-y-2 text-center">
            <h1 className="text-foreground text-3xl font-semibold tracking-tight">
              Name your workspace
            </h1>
            <p className="text-muted-foreground text-base">
              This is your private space for your clients and scheduled posts.
              You can rename it anytime.
            </p>
          </div>

          <div className="mt-8">
            <OnboardingForm suggestion={suggestion} />
          </div>

          <p className="text-muted-foreground mt-5 text-center text-sm">
            Signed in as <span className="text-foreground">{email}</span>
          </p>
        </div>
      </div>
    </main>
  );
}
