"use client";

import Link from "next/link";
import { useSignedIn } from "@/components/marketing/account-links";

/**
 * The landing's account links. The page is static, so whether the visitor is
 * signed in is read in the browser: signed-in people go to their dashboard,
 * everyone else to sign-in (which also creates the account).
 */

export function NavAccount() {
  const signedIn = useSignedIn();
  return (
    <div className="flex items-center gap-[18px]">
      {!signedIn && (
        <Link href="/login" className="hidden text-[15px] font-medium text-white transition-opacity hover:opacity-80 sm:block">
          Sign in
        </Link>
      )}
      <Link
        href={signedIn ? "/dashboard" : "/login"}
        className="rounded-[10px] bg-white px-[18px] py-2.5 text-[15px] font-bold text-[#1f1b2d] transition-colors hover:bg-white/90"
      >
        {signedIn ? "Open dashboard" : "Start free"}
      </Link>
    </div>
  );
}

/** A call to action: `label` for visitors, "Open dashboard" once signed in. */
export function AccountCta({ label, className }: { label: React.ReactNode; className?: string }) {
  const signedIn = useSignedIn();
  return (
    <Link href={signedIn ? "/dashboard" : "/login"} className={className}>
      {signedIn ? "Open dashboard" : label}
    </Link>
  );
}
