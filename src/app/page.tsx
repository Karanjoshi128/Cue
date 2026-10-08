import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  KeyRound,
  Lock,
  MailCheck,
  Unplug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LinkedinIcon,
  InstagramIcon,
  YoutubeIcon,
} from "@/components/platform-icons";
import { getAuth } from "@/lib/auth";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { HeroStage } from "@/components/marketing/hero-stage";
import {
  ProductShot,
  Reveal,
  ScrollStatement,
} from "@/components/marketing/motion";
import {
  ApiDemo,
  ApprovalDemo,
  ComposeDemo,
  CountdownDemo,
  WorkspaceDemo,
} from "@/components/marketing/feature-demos";
import { Acts } from "@/components/marketing/acts";
import { LiveDashboard } from "@/components/marketing/demo/loader";
import { Spotlight } from "@/components/fx/spotlight";
import { cn } from "@/lib/utils";

// Public marketing home. Kept outside the (app) group so it renders for
// signed-out visitors - the app itself lives under /dashboard.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cue - social media scheduling for agencies",
  description:
    "Cue is a social media scheduling tool for agencies. Plan, schedule, and publish posts to your clients' LinkedIn, Instagram, and YouTube accounts from one calendar.",
};

const TICKER = [
  "LinkedIn: text, images, galleries, documents, links, polls",
  "Instagram: images, carousels, Reels",
  "YouTube: videos with title, tags, category and visibility",
  "A workspace per client",
  "Approvals and notes",
  "One calendar for the whole roster",
  "Connection health alerts",
  "An API with idempotent writes",
];

const DEMO_HINTS = [
  "Drag a post to another day on the Calendar",
  "Schedule one for \u201cIn 1 minute\u201d and watch it go live",
  "Switch clients from the top bar",
  "Approve or retry posts in the Queue",
];

const PLATFORMS = [
  {
    Icon: LinkedinIcon,
    name: "LinkedIn",
    color: "#0a66c2",
    who: "Personal profiles",
    can: [
      "Text posts",
      "Single images and multi-image galleries",
      "Documents as swipeable carousels",
      "Link previews with your own title",
      "Polls",
    ],
  },
  {
    Icon: InstagramIcon,
    name: "Instagram",
    color: "#e1306c",
    who: "Business and Creator accounts",
    can: ["Single images", "Carousels", "Reels"],
  },
  {
    Icon: YoutubeIcon,
    name: "YouTube",
    color: "#ff0033",
    who: "Channels",
    can: [
      "Video uploads",
      "Title and description",
      "Tags and category",
      "Public, unlisted or private",
    ],
  },
];

const TRUST = [
  {
    Icon: Lock,
    title: "Official consent screens",
    body: "Accounts connect through LinkedIn's, Meta's and Google's own sign-in. Cue never sees a password.",
  },
  {
    Icon: KeyRound,
    title: "Encrypted tokens",
    body: "Access tokens are encrypted at rest and used only to publish what you schedule.",
  },
  {
    Icon: Unplug,
    title: "Disconnect any time",
    body: "Remove an account in one click, or revoke Cue from the network's own settings.",
  },
  {
    Icon: MailCheck,
    title: "Passwordless sign-in",
    body: "Your team signs in with a one-time code sent by email. Nothing to leak or reuse.",
  },
];

function SectionHead({
  eyebrow,
  title,
  body,
  className,
  center = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <Reveal className={cn("max-w-2xl", center && "mx-auto text-center", className)}>
      <div className={cn("label-caps flex items-center gap-2", center && "justify-center")}>
        <span className="bg-primary size-1.5 rounded-full" />
        {eyebrow}
      </div>
      <h2 className="headline mt-4 text-4xl sm:text-5xl lg:text-[3.5rem]">{title}</h2>
      {body && (
        <p className="text-muted-foreground mt-5 text-lg leading-relaxed text-pretty">
          {body}
        </p>
      )}
    </Reveal>
  );
}

function Bento({
  title,
  body,
  children,
  className,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Spotlight className={cn("rounded-3xl", className)}>
      <div className="bg-card flex h-full flex-col rounded-3xl border p-5 sm:p-6">
        <div className="mb-5">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            {body}
          </p>
        </div>
        <div className="mt-auto flex flex-1 flex-col justify-end">{children}</div>
      </div>
    </Spotlight>
  );
}

export default async function HomePage() {
  const { user } = await getAuth();
  const signedIn = Boolean(user);
  const primaryHref = signedIn ? "/dashboard" : "/login";
  const primaryLabel = signedIn ? "Open dashboard" : "Get started";

  return (
    <div className="bg-background text-foreground min-h-dvh overflow-x-clip">
      <SiteHeader signedIn={signedIn} />

      <main>
        {/* ---------------- Hero ---------------- */}
        <section className="grain relative isolate">
          <div
            aria-hidden
            className="bg-grid pointer-events-none absolute inset-0 -z-10 mask-[radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
          />
          {/* A stage spotlight falling from above. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 left-[38%] -z-10 h-[46rem] w-[60rem] -translate-x-1/2 rotate-[-8deg] bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_65%)] blur-2xl"
          />
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 pt-14 pb-24 sm:px-8 lg:grid-cols-[1.12fr_1fr] lg:pt-20 lg:pb-32">
            <div>
              <Link
                href={primaryHref}
                className="bg-card text-muted-foreground hover:text-foreground animate-rise inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1.5 text-xs shadow-[0_0_0_1px_var(--border)] transition-colors"
              >
                <span className="bg-live/12 text-live-ink flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[0.625rem] font-semibold tracking-wider uppercase">
                  <span className="tally text-live" data-live="true" />
                  Live
                </span>
                Publishing to LinkedIn, Instagram and YouTube
                <ArrowRight className="size-3" />
              </Link>

              <h1 className="mt-8">
                <span
                  className="label-caps animate-rise block text-[0.75rem]"
                  style={{ animationDelay: "60ms" }}
                >
                  Cue · Social media scheduling for agencies
                </span>
                <span className="headline mt-5 block text-[clamp(2.5rem,11.5vw,5.5rem)] leading-[0.93] tracking-[-0.035em] lg:text-[clamp(3.4rem,7.4vw,7rem)]">
                  <span className="animate-rise block" style={{ animationDelay: "120ms" }}>
                    Every client.
                  </span>
                  <span className="animate-rise block" style={{ animationDelay: "220ms" }}>
                    Every channel.
                  </span>
                  <span className="animate-rise block" style={{ animationDelay: "320ms" }}>
                    <em className="text-primary">On cue.</em>
                  </span>
                </span>
              </h1>

              <p
                className="text-muted-foreground animate-rise mt-8 max-w-xl text-lg leading-relaxed text-pretty"
                style={{ animationDelay: "420ms" }}
              >
                <strong className="text-foreground font-medium">Cue</strong>{" "}
                helps social media managers plan, schedule and publish content
                for the clients they manage. Connect each client&apos;s{" "}
                <strong className="text-foreground font-medium">
                  LinkedIn, Instagram and YouTube
                </strong>{" "}
                accounts once, then run every brand from one calendar instead of
                logging in and out all day.
              </p>

              <div
                className="animate-rise mt-9 flex flex-wrap items-center gap-3"
                style={{ animationDelay: "520ms" }}
              >
                <Button
                  render={<Link href={primaryHref} />}
                  size="xl"
                  className="group rounded-full pr-5 pl-6"
                >
                  {primaryLabel}
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Button>
                <Button
                  render={<Link href="#how" />}
                  size="xl"
                  variant="outline"
                  className="rounded-full px-6"
                >
                  See how it works
                </Button>
              </div>
              <p
                className="text-muted-foreground animate-rise mt-5 text-sm"
                style={{ animationDelay: "600ms" }}
              >
                Sign in with a one-time code. No password to remember.
              </p>
            </div>

            <div className="animate-rise relative px-2 sm:px-10 lg:px-0" style={{ animationDelay: "300ms" }}>
              <HeroStage />
            </div>
          </div>
        </section>

        {/* ---------------- Ticker ---------------- */}
        <section
          aria-label="What Cue publishes"
          className="bg-foreground text-background relative overflow-hidden py-4"
        >
          <div className="flex w-max animate-marquee [--marquee-duration:60s] hover:[animation-play-state:paused]">
            {[0, 1].map((dup) => (
              <ul
                key={dup}
                aria-hidden={dup === 1}
                className="flex shrink-0 items-center"
              >
                {TICKER.map((t) => (
                  <li
                    key={t}
                    className="flex items-center gap-6 pr-6 font-mono text-xs tracking-[0.14em] whitespace-nowrap uppercase"
                  >
                    <span className="opacity-90">{t}</span>
                    <span className="text-[#4c8dff]">◆</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        {/* ---------------- The problem ---------------- */}
        <section className="mx-auto max-w-5xl px-5 py-28 sm:px-8 sm:py-40">
          <div className="label-caps mb-8 flex items-center gap-2">
            <span className="bg-primary size-1.5 rounded-full" />
            The problem
          </div>
          <ScrollStatement
            className="headline text-[clamp(2rem,4.6vw,3.75rem)] leading-[1.12]"
            text="Fifteen clients. Three networks. Forty-five logins, a shared spreadsheet, and a reminder at 6:59 for the post due at seven. Cue swaps all of it for *one calendar that calls every post for you.*"
          />
        </section>

        {/* ---------------- Product shot ---------------- */}
        <section className="relative">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <SectionHead
              center
              eyebrow="The product"
              title={
                <>
                  The whole roster, <em>at a glance.</em>
                </>
              }
              body="This is the real interface, running on sample data. Click around: everything works, and nothing you do here leaves your browser."
            />
            <Reveal className="mx-auto mt-10 hidden max-w-4xl flex-wrap items-center justify-center gap-2 md:flex">
              {DEMO_HINTS.map((h) => (
                <span
                  key={h}
                  className="bg-card text-muted-foreground inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs shadow-[0_0_0_1px_var(--border)]"
                >
                  <span className="bg-primary size-1.5 rounded-full" />
                  {h}
                </span>
              ))}
            </Reveal>
            <ProductShot className="mx-auto mt-8 max-w-6xl">
              <LiveDashboard />
            </ProductShot>
            <p className="text-muted-foreground mx-auto mt-5 hidden max-w-xl text-center text-xs md:block">
              Sample clients and posts. The demo resets when you reload, or with
              the reset button in its top bar.
            </p>
          </div>
        </section>

        {/* ---------------- Features ---------------- */}
        <section id="product" className="scroll-mt-20 px-5 pt-36 pb-24 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <SectionHead
              eyebrow="What Cue does"
              title={
                <>
                  Everything a post needs <em>before it goes out.</em>
                </>
              }
              body="Try them: these are working pieces of the product, running on sample data."
            />
            <div className="mt-14 grid gap-4 lg:grid-cols-6">
              <Reveal className="lg:col-span-4 lg:row-span-2">
                <Bento
                  className="h-full"
                  title="Write once, tailor per network"
                  body="Draft a caption and see it the way LinkedIn and Instagram will show it, then adjust each before it ships."
                >
                  <ComposeDemo />
                </Bento>
              </Reveal>
              <Reveal className="lg:col-span-2" delay={0.05}>
                <Bento
                  className="h-full"
                  title="A workspace per client"
                  body="Accounts, colours and calendars stay apart, so nothing lands on the wrong brand."
                >
                  <WorkspaceDemo />
                </Bento>
              </Reveal>
              <Reveal className="lg:col-span-2" delay={0.1}>
                <Bento
                  className="h-full"
                  title="Approvals built in"
                  body="Send a post for review, trade notes, and publish only once it's signed off."
                >
                  <ApprovalDemo />
                </Bento>
              </Reveal>
              <Reveal className="lg:col-span-2">
                <Bento
                  className="h-full"
                  title="Know what's next"
                  body="A live countdown to the next post, for one client or the whole roster."
                >
                  <CountdownDemo />
                </Bento>
              </Reveal>
              <Reveal className="lg:col-span-4" delay={0.05}>
                <Bento
                  className="h-full"
                  title="An API for your pipelines"
                  body="Create and schedule posts from scripts and automations with a workspace key. Retries are safe with an idempotency key."
                >
                  <ApiDemo />
                </Bento>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ---------------- How it works ---------------- */}
        <section id="how" className="scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <SectionHead
              center
              eyebrow="How it works"
              title={
                <>
                  A show in <em>three acts.</em>
                </>
              }
              body="Connect once, plan as far ahead as you like, and let Cue run the night."
              className="mb-20"
            />
            <Acts />
          </div>
        </section>

        {/* ---------------- Platforms ---------------- */}
        <section id="platforms" className="bg-canvas scroll-mt-20 border-y px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-7xl">
            <SectionHead
              eyebrow="Platforms"
              title={
                <>
                  The networks your clients <em>actually use.</em>
                </>
              }
              body="Connected through each platform's official API, with the formats each one supports."
            />
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {PLATFORMS.map((p, i) => (
                <Reveal key={p.name} delay={i * 0.07}>
                  <Spotlight color={p.color} className="h-full rounded-3xl">
                    <div className="bg-card relative flex h-full flex-col overflow-hidden rounded-3xl border p-7">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full opacity-[0.12] blur-2xl"
                        style={{ backgroundColor: p.color }}
                      />
                      <p.Icon className="size-9" style={{ color: p.color }} />
                      <h3 className="headline mt-8 text-3xl">{p.name}</h3>
                      <p className="text-muted-foreground mt-1 font-mono text-[0.6875rem] tracking-wider uppercase">
                        {p.who}
                      </p>
                      <ul className="mt-6 space-y-2.5 text-sm">
                        {p.can.map((c) => (
                          <li key={c} className="flex items-start gap-2.5">
                            <span
                              className="mt-[0.45rem] size-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                            {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Spotlight>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Why "Cue" ---------------- */}
        <section className="dark grain relative isolate overflow-hidden bg-[#07080b] px-5 py-24 text-white sm:px-8 sm:py-32">
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-40 -left-40 -z-10 size-[40rem] rounded-full bg-[#196bf5]/20 blur-[140px]"
          />
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.1fr_1fr]">
            <Reveal>
              <figure className="relative">
                <div className="relative aspect-[3/2] overflow-hidden rounded-3xl shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_40px_100px_-30px_rgb(0_0_0/0.8)]">
                  <Image
                    src="/marketing/backstage-cue-light.jpg"
                    alt="A backstage cue light in a dark theatre, its amber lamp and green lamp glowing beside a navy curtain"
                    fill
                    sizes="(min-width: 1024px) 640px, 100vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-4 flex items-center gap-4 font-mono text-[0.6875rem] tracking-[0.14em] text-white/50 uppercase">
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#f5a524] shadow-[0_0_10px_2px_rgb(245_165_36/0.6)]" />
                    Standby
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#1fc677] shadow-[0_0_10px_2px_rgb(31_198_119/0.6)]" />
                    Go
                  </span>
                </figcaption>
              </figure>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="label-caps flex items-center gap-2 text-white/50">
                <span className="size-1.5 rounded-full bg-[#4c8dff]" />
                Why &ldquo;Cue&rdquo;
              </div>
              <h2 className="headline mt-4 text-4xl text-white sm:text-5xl">
                In theatre, nothing moves until the cue is{" "}
                <em className="text-[#7aa8ff]">called.</em>
              </h2>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/60">
                A stage manager watches the clock and calls every light, sound
                and curtain at the right moment, so the performers never have
                to. Cue does that job for your content. You plan the show; each
                post waits on standby until it&apos;s time to go.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ---------------- Trust ---------------- */}
        <section id="trust" className="scroll-mt-20 px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1fr_1.3fr]">
            <SectionHead
              eyebrow="Trust"
              title={
                <>
                  Built on the networks&rsquo; <em>official</em> APIs.
                </>
              }
              body={
                <>
                  Read exactly what Cue stores and how to remove it in the{" "}
                  <Link href="/privacy" className="text-foreground underline underline-offset-4">
                    Privacy Policy
                  </Link>{" "}
                  and the{" "}
                  <Link href="/data-deletion" className="text-foreground underline underline-offset-4">
                    data deletion guide
                  </Link>
                  .
                </>
              }
            />
            <div className="grid gap-px overflow-hidden rounded-3xl border bg-border sm:grid-cols-2">
              {TRUST.map((t, i) => (
                <Reveal key={t.title} delay={i * 0.05} className="bg-card p-7">
                  <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                    <t.Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 font-semibold tracking-tight">{t.title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                    {t.body}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- Final call ---------------- */}
        <section className="px-3 pb-3 sm:px-5 sm:pb-5">
          <div className="dark grain relative isolate overflow-hidden rounded-[32px] bg-[#07080b] px-5 py-28 text-center text-white sm:py-40">
            <div
              aria-hidden
              className="bg-grid pointer-events-none absolute inset-0 -z-10 mask-[radial-gradient(ellipse_at_center,black,transparent_70%)]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[38rem] w-[44rem] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgb(76_141_255/0.35),transparent_65%)] blur-xl"
            />
            <Reveal>
              <div className="font-mono text-[0.6875rem] tracking-[0.3em] text-white/45 uppercase">
                Places, please
              </div>
              <h2 className="headline mx-auto mt-6 max-w-4xl text-[clamp(3.5rem,10vw,9rem)] leading-[0.9] text-white">
                Take your <em className="text-[#7aa8ff]">cue.</em>
              </h2>
              <p className="mx-auto mt-7 max-w-md text-lg leading-relaxed text-white/60">
                Set up a workspace, connect your first client, and put next
                week on the sheet.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Button
                  render={<Link href={primaryHref} />}
                  size="xl"
                  className="group rounded-full pr-5 pl-7"
                >
                  {primaryLabel}
                  <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                </Button>
                <Button
                  render={<a href="mailto:joshikaran0008@gmail.com" />}
                  size="xl"
                  variant="ghost"
                  className="rounded-full px-6 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  Talk to us <ArrowUpRight />
                </Button>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
