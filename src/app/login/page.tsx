import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "@/components/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel (desktop only) */}
      <div className="bg-primary text-primary-foreground relative hidden flex-col justify-between p-10 lg:flex">
        <span className="text-xl font-semibold tracking-tight">Cue</span>
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold leading-snug">
            One calm dashboard for every client&apos;s social.
          </h2>
          <p className="text-primary-foreground/80 text-sm">
            Schedule and publish to LinkedIn and Instagram across all your
            clients — from a single place.
          </p>
        </div>
        <p className="text-primary-foreground/60 text-xs">
          Built to run on free tiers.
        </p>
      </div>

      {/* Form */}
      <div className="grid place-items-center px-4 py-16">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex justify-center lg:hidden">
            <Logo className="h-10 w-auto" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Welcome back</h1>
            <p className="text-muted-foreground text-sm">
              Sign in to schedule your clients&apos; posts.
            </p>
          </div>

          {configured ? (
            <LoginForm />
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                Auth isn&apos;t configured yet — running in local dev mode.
              </p>
              <Button render={<Link href="/" />} className="w-full">
                Enter app
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
