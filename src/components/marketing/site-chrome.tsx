import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowRight } from "lucide-react";

export const CONTACT_EMAIL = "joshikaran0008@gmail.com";

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/#how", label: "How it works" },
  { href: "/#platforms", label: "Platforms" },
  { href: "/#trust", label: "Trust" },
];

/** Public-site header: logo, section links, sign-in. */
export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="bg-background/70 supports-backdrop-filter:bg-background/55 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-5 sm:px-8">
        <Link href="/" aria-label="Cue home" className="shrink-0">
          <Logo className="h-8 w-auto" />
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
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
            className="group rounded-full pr-3 pl-4"
          >
            {signedIn ? "Open dashboard" : "Get started"}
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Public-site footer with the legal links app reviewers look for. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo className="h-8 w-auto" />
          <p className="text-muted-foreground max-w-xs text-sm leading-relaxed">
            Cue is social media scheduling for agencies: LinkedIn, Instagram
            and YouTube for every client, from one calendar.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { href: "/#product", label: "Features" },
            { href: "/#how", label: "How it works" },
            { href: "/#platforms", label: "Platforms" },
            { href: "/login", label: "Sign in" },
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            { href: "/privacy", label: "Privacy Policy" },
            { href: "/terms", label: "Terms of Service" },
            { href: "/data-deletion", label: "Data deletion" },
          ]}
        />
        <FooterCol
          title="Contact"
          links={[{ href: `mailto:${CONTACT_EMAIL}`, label: CONTACT_EMAIL }]}
        />
      </div>
      <div className="border-t">
        <div className="text-muted-foreground mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 font-mono text-[0.6875rem] tracking-wider uppercase sm:px-8">
          <span>© {new Date().getFullYear()} Cue</span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="bg-standby size-1.5 rounded-full" /> Standby
            </span>
            <span className="flex items-center gap-1.5">
              <span className="bg-live size-1.5 rounded-full" /> Go
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <div className="label-caps mb-4">{title}</div>
      <ul className="space-y-2.5 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-foreground/80 hover:text-foreground break-all underline-offset-4 transition-colors hover:underline"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Wrapper for the legal pages: site chrome plus an editorial title block. */
export function LegalShell({
  title,
  updated,
  signedIn = false,
  children,
}: {
  title: string;
  updated?: string;
  signedIn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <SiteHeader signedIn={signedIn} />
      <main>
        <div className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="bg-grid pointer-events-none absolute inset-0 mask-[linear-gradient(to_bottom,black,transparent)]"
          />
          <div className="relative mx-auto max-w-3xl px-5 pt-16 pb-12 sm:px-8 sm:pt-24">
            <div className="label-caps">Legal</div>
            <h1 className="headline mt-3 text-5xl sm:text-6xl">{title}</h1>
            {updated && (
              <p className="text-muted-foreground mt-4 font-mono text-xs tracking-wider uppercase">
                Last updated {updated}
              </p>
            )}
          </div>
        </div>
        <article className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
