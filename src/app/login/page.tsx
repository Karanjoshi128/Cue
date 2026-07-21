import Link from "next/link";
import { CalendarClock, Check, Users } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "@/components/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const highlights = [
  { icon: CalendarClock, label: "Schedule" },
  { icon: Check, label: "Approvals" },
  { icon: Users, label: "Clients" },
];

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="bg-linear-to-b from-muted to-background relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      {/* Faint dotted texture, masked to fade at the edges (theme-aware via --border) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(var(--border) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(ellipse at center, black, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black, transparent 70%)",
        }}
      />
      {/* Soft ambient brand glow behind the card */}
      <div
        aria-hidden
        className="bg-primary/10 pointer-events-none absolute top-0 left-1/2 size-136 -translate-x-1/2 -translate-y-1/3 rounded-full blur-3xl"
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-card shadow-primary/5 rounded-2xl border p-8 shadow-xl sm:p-10">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <Logo className="h-9 w-auto" />
          </div>

          {/* Heading */}
          <div className="space-y-2 text-center">
            <h1 className="text-foreground text-3xl font-semibold tracking-tight">
              Welcome back
            </h1>
            <p className="text-muted-foreground text-base">
              Sign in to schedule your clients&apos; posts across LinkedIn and
              Instagram.
            </p>
          </div>

          {/* Sign-in form (or local-dev fallback) */}
          <div className="mt-8">
            {configured ? (
              <LoginForm />
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-muted-foreground text-base">
                  Auth isn&apos;t configured yet — running in local dev mode.
                </p>
                <Button
                  render={<Link href="/dashboard" />}
                  className="h-11 w-full text-base font-medium"
                >
                  Enter app
                </Button>
              </div>
            )}
          </div>

          {/* Passwordless reassurance */}
          <p className="text-muted-foreground mt-5 text-center text-sm">
            No password needed — we&apos;ll email you a one-time sign-in code.
          </p>

          {/* Value strip keeps the card feeling full and confident */}
          <div className="mt-8 grid grid-cols-3 gap-3 border-t pt-6">
            {highlights.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 text-center"
              >
                <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
                  <Icon className="size-5" />
                </span>
                <span className="text-muted-foreground text-sm font-medium">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Slim trust footer under the card */}
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Built for agencies · Runs on free tiers · LinkedIn + Instagram
        </p>
        <p className="text-muted-foreground mt-2 text-center text-xs">
          <Link href="/privacy" className="hover:text-foreground underline">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-foreground underline">
            Terms
          </Link>
        </p>
      </div>
    </main>
  );
}
