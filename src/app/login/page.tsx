import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Cue to schedule your clients' LinkedIn, Instagram and YouTube posts.",
};

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <AuthShell
      stageTitle={
        <>
          Every client. Every channel.{" "}
          <em className="text-[#7aa8ff]">On cue.</em>
        </>
      }
      stageBody="Plan the week for your whole roster, then let Cue call each post at exactly the right moment."
      eyebrow={
        <>
          <span className="tally text-live" data-live="true" />
          Sign in
        </>
      }
      title={
        <>
          Welcome <em>back.</em>
        </>
      }
      description="Schedule your clients' posts across LinkedIn, Instagram and YouTube. No password: we'll email you a one-time code."
      footer={
        <>
          By signing in you agree to the{" "}
          <Link href="/terms" className="hover:text-foreground underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="hover:text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </>
      }
    >
      {configured ? (
        <LoginForm />
      ) : (
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Auth isn&apos;t configured yet, so Cue is running in local dev mode.
          </p>
          <Button render={<Link href="/dashboard" />} size="xl" className="w-full">
            Enter app
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
