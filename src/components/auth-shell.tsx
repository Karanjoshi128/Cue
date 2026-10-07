import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { CueSheet } from "@/components/marketing/cue-sheet";
import {
  LinkedinIcon,
  InstagramIcon,
  YoutubeIcon,
} from "@/components/platform-icons";

/**
 * Split layout for sign-in and onboarding: a dark "stage" with the live cue
 * sheet on the left (desktop only), the form on the right.
 */
export function AuthShell({
  stageTitle,
  stageBody,
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  stageTitle: React.ReactNode;
  stageBody: React.ReactNode;
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="bg-background grid min-h-dvh lg:grid-cols-[1.08fr_1fr]">
      {/* The stage: always dark, whatever the theme. */}
      <aside className="dark grain relative hidden flex-col justify-between overflow-hidden bg-[#07080b] p-10 text-white lg:flex xl:p-14">
        <div
          aria-hidden
          className="bg-grid pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_at_30%_40%,black,transparent_75%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-40 size-144 rounded-full bg-[#196bf5]/25 blur-[120px]"
        />
        <Link href="/" aria-label="Cue home" className="relative w-fit">
          <Logo className="h-9 w-auto" />
        </Link>

        <div className="relative max-w-xl">
          <h2 className="headline text-5xl text-white xl:text-6xl">
            {stageTitle}
          </h2>
          <p className="mt-5 max-w-md text-[0.9375rem] leading-relaxed text-white/55">
            {stageBody}
          </p>
          <CueSheet className="mt-10" />
        </div>

        <div className="relative flex items-center justify-between gap-6 text-xs text-white/40">
          <span>Publishes through each network&apos;s official API.</span>
          <span className="flex items-center gap-3 text-white/55">
            <LinkedinIcon className="size-4" />
            <InstagramIcon className="size-4" />
            <YoutubeIcon className="size-4" />
          </span>
        </div>
      </aside>

      <section className="relative flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Cue home" className="lg:invisible">
            <Logo className="h-8 w-auto" />
          </Link>
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            What is Cue?
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-14">
          <div className="label-caps flex items-center gap-2">{eyebrow}</div>
          <h1 className="headline mt-3 text-[2.75rem]">{title}</h1>
          <p className="text-muted-foreground mt-3 text-[0.9375rem] leading-relaxed">
            {description}
          </p>
          <div className="mt-9">{children}</div>
        </div>

        {footer && (
          <div className="text-muted-foreground text-center text-xs">{footer}</div>
        )}
      </section>
    </main>
  );
}
