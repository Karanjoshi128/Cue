import Link from "next/link";
import type { Metadata } from "next";
import {
  CalendarClock,
  CheckCircle2,
  LayoutGrid,
  Users,
  ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  LinkedinIcon,
  InstagramIcon,
  YoutubeIcon,
} from "@/components/platform-icons";
import { getAuth } from "@/lib/auth";

// Public marketing home. Kept outside the (app) group so it renders for
// signed-out visitors - the app itself lives under /dashboard.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cue - social media scheduling for agencies",
  description:
    "Cue is a social media scheduling tool for agencies. Plan, schedule, and publish posts to your clients' LinkedIn, Instagram, and YouTube accounts from one calendar.",
};

const features = [
  {
    icon: Users,
    title: "A workspace per client",
    body: "Keep every client's accounts, drafts, and calendar separate, so nothing is ever posted to the wrong brand.",
  },
  {
    icon: CalendarClock,
    title: "Schedule once, publish everywhere",
    body: "Write a post, pick the accounts, choose a time. Cue publishes it for you and reports back when it lands.",
  },
  {
    icon: CheckCircle2,
    title: "Approvals before anything goes live",
    body: "Hold posts for review, leave comments, and only publish once the work has been signed off.",
  },
  {
    icon: LayoutGrid,
    title: "One calendar for the whole roster",
    body: "See everything scheduled across every client in a single view, and catch gaps before they happen.",
  },
];

const platforms = [
  {
    icon: LinkedinIcon,
    label: "LinkedIn",
    note: "Text, images, documents, links, and polls",
  },
  {
    icon: InstagramIcon,
    label: "Instagram",
    note: "Single images, carousels, and Reels",
  },
  {
    icon: YoutubeIcon,
    label: "YouTube",
    note: "Video uploads with title and visibility",
  },
];

const steps = [
  {
    n: "1",
    title: "Connect your client's accounts",
    body: "The account owner signs in on the platform's own consent screen and authorizes Cue. You never handle their password.",
  },
  {
    n: "2",
    title: "Compose and schedule",
    body: "Write the caption, attach media, preview how it will look on each network, and pick a publish time.",
  },
  {
    n: "3",
    title: "Cue publishes it",
    body: "At the scheduled moment Cue posts to each connected account and records the result and the live link.",
  },
];

export default async function HomePage() {
  const { user } = await getAuth();

  return (
    <main className="bg-background text-foreground min-h-screen">
      {/* Header */}
      <header className="border-border border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo className="h-8 w-auto" />
          <Button
            render={<Link href={user ? "/dashboard" : "/login"} />}
            size="sm"
          >
            {user ? "Go to dashboard" : "Sign in"}
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="border-border relative overflow-hidden border-b">
        <div
          aria-hidden
          className="bg-primary/10 pointer-events-none absolute top-0 left-1/2 size-136 -translate-x-1/2 -translate-y-2/3 rounded-full blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center sm:py-24">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Cue - social media scheduling for agencies
          </h1>
          <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg leading-relaxed">
            <strong className="text-foreground">Cue</strong> helps social media
            managers plan, schedule, and publish content for the clients they
            manage. Connect each client&apos;s{" "}
            <strong className="text-foreground">
              LinkedIn, Instagram, and YouTube
            </strong>{" "}
            accounts once, then run every brand from a single calendar instead
            of logging in and out all day.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              render={<Link href={user ? "/dashboard" : "/login"} />}
              className="h-11 px-6 text-base"
            >
              {user ? "Go to dashboard" : "Get started"}
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <p className="text-muted-foreground mt-4 text-sm">
            No password needed - sign in with a one-time code.
          </p>
        </div>
      </section>

      {/* Platforms */}
      <section className="border-border border-b">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Publish to the networks your clients actually use
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-2xl text-center">
            Accounts are connected through each platform&apos;s official API and
            consent screen, and can be disconnected at any time.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {platforms.map((p) => (
              <div
                key={p.label}
                className="bg-card rounded-xl border p-6 text-center"
              >
                <p.icon className="mx-auto size-8" />
                <div className="mt-3 font-semibold">{p.label}</div>
                <p className="text-muted-foreground mt-1.5 text-sm">{p.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-border border-b">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            What Cue does
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {features.map((f) => (
              <div key={f.title} className="bg-card rounded-xl border p-6">
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-border border-b">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <ol className="mt-8 grid gap-5 sm:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="bg-card rounded-xl border p-6">
                <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-sm font-semibold">
                  {s.n}
                </span>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Logo className="h-7 w-auto" />
            <p className="text-muted-foreground mt-2 text-sm">
              Cue · Social scheduling for every client
            </p>
          </div>
          <nav className="text-muted-foreground flex flex-wrap gap-4 text-sm">
            <Link href="/privacy" className="hover:text-foreground underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground underline">
              Terms
            </Link>
            <Link
              href="/data-deletion"
              className="hover:text-foreground underline"
            >
              Data deletion
            </Link>
            <a
              href="mailto:joshikaran0008@gmail.com"
              className="hover:text-foreground underline"
            >
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
