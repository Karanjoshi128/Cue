import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <main className="bg-canvas grain relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-16 text-center">
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_at_center,black,transparent_65%)]"
      />
      <Link href="/" aria-label="Cue home" className="relative mb-14">
        <Logo className="h-9 w-auto" />
      </Link>
      <div className="relative font-mono text-[0.6875rem] tracking-[0.2em] text-muted-foreground uppercase">
        Cue 404 <span className="text-border mx-2">/</span> Not on the sheet
      </div>
      <h1 className="headline relative mt-4 text-5xl sm:text-7xl">
        This cue was <em>never called.</em>
      </h1>
      <p className="text-muted-foreground relative mt-5 max-w-md text-[0.9375rem] leading-relaxed">
        The page you&apos;re after doesn&apos;t exist, or it moved. Head back
        and pick up from the top.
      </p>
      <div className="relative mt-8 flex flex-wrap justify-center gap-2">
        <Button render={<Link href="/dashboard" />} size="lg">
          Go to dashboard
        </Button>
        <Button render={<Link href="/" />} size="lg" variant="outline">
          Cue home
        </Button>
      </div>
    </main>
  );
}
