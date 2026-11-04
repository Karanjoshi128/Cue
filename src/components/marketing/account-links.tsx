"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * The marketing pages are static, so who's visiting is worked out in the
 * browser: a Supabase session cookie (sb-<ref>-auth-token, possibly split
 * into .0/.1 chunks) means signed in. It only picks a link; /dashboard still
 * checks the session properly and sends anyone without one to /login.
 */
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/;

const subscribe = () => () => {};

function useSignedIn() {
  // Signed out during prerender and hydration, then the real state.
  return useSyncExternalStore(
    subscribe,
    () => SESSION_COOKIE.test(document.cookie),
    () => false,
  );
}

/** Header's sign-in link and main button. */
export function HeaderAccount() {
  const signedIn = useSignedIn();
  return (
    <>
      {!signedIn && (
        <Link
          href="/login"
          className="text-muted-foreground hover:text-foreground hidden px-3 text-sm transition-colors sm:block"
        >
          Sign in
        </Link>
      )}
      <Button
        render={<Link href={signedIn ? "/dashboard" : "/login"} />}
        variant="ink"
        className="group rounded-full px-4 sm:pr-3"
      >
        {/* Phones get the short label so the header never overflows. */}
        <span className="sm:hidden">{signedIn ? "Dashboard" : "Get started"}</span>
        <span className="hidden sm:inline">
          {signedIn ? "Open dashboard" : "Get started"}
        </span>
        <ArrowRight className="hidden transition-transform group-hover:translate-x-0.5 sm:block" />
      </Button>
    </>
  );
}

/** A plain link to the dashboard if signed in, otherwise to sign-in. */
export function AccountLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const signedIn = useSignedIn();
  return (
    <Link href={signedIn ? "/dashboard" : "/login"} className={className}>
      {children}
    </Link>
  );
}

/** The page's big call to action: "Open dashboard" or "Get started". */
export function AccountButton({ className }: { className?: string }) {
  const signedIn = useSignedIn();
  return (
    <Button
      render={<Link href={signedIn ? "/dashboard" : "/login"} />}
      size="xl"
      className={cn("group rounded-full pr-5", className)}
    >
      {signedIn ? "Open dashboard" : "Get started"}
      <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
    </Button>
  );
}
