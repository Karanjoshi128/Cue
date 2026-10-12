import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getAuth } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { CONTACT_EMAIL } from "@/components/marketing/site-chrome";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Access paused",
  robots: { index: false, follow: false },
};

// Where a banned person, or a member of a suspended workspace, lands instead
// of the app. Anyone else is sent on to where they belong.
export default async function LockedPage() {
  const { user, blocked } = await getAuth();
  if (!blocked) redirect(user ? "/dashboard" : "/login");

  const suspended = blocked.kind === "suspended";
  return (
    <main className="bg-canvas grid min-h-dvh place-items-center px-4 py-12">
      <div className="bg-card w-full max-w-md rounded-2xl border p-7 shadow-[0_12px_32px_-12px_rgb(20_20_40/0.12)] sm:p-9">
        <Logo className="h-7 w-auto" />
        <span className="bg-muted mt-8 grid size-11 place-items-center rounded-xl">
          <Lock className="text-muted-foreground size-5" aria-hidden />
        </span>
        <h1 className="headline mt-5 text-[1.75rem]">
          {suspended ? "This workspace is suspended" : "Your access is paused"}
        </h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {suspended
            ? "Nobody in this workspace can use Cue right now, and its scheduled posts are on hold. Nothing has been deleted."
            : "Your account can't use Cue right now. Nothing has been deleted."}
          {blocked.reason && (
            <>
              {" "}Reason given: <span className="text-foreground">{blocked.reason}</span>
            </>
          )}
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          If you think this is a mistake, email{" "}
          <a className="text-foreground underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <div className="mt-7 flex gap-2">
          {/* A plain anchor: sign-out is a GET handler, so it must never be prefetched. */}
          <a href="/logout" className="bg-foreground text-background rounded-lg px-4 py-2 text-sm font-medium">
            Sign out
          </a>
          <Link href="/" className="text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 text-sm">
            Cue home
          </Link>
        </div>
      </div>
    </main>
  );
}
