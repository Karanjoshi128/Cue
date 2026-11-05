import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";

/** The public help centre's frame: site header and footer around an editorial title block. */
export function HelpShell({
  trail,
  title,
  description,
  children,
}: {
  /** Breadcrumb after "Help", e.g. the guide's topic. */
  trail?: string;
  title: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <SiteHeader />
      <main>
        <div className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="bg-grid pointer-events-none absolute inset-0 mask-[linear-gradient(to_bottom,black,transparent)]"
          />
          <div className="relative mx-auto max-w-6xl px-5 pt-14 pb-10 sm:px-8 sm:pt-20">
            <div className="label-caps flex items-center gap-2">
              {trail ? (
                <>
                  <Link href="/help" className="hover:text-foreground transition-colors">
                    Help
                  </Link>
                  <span className="text-border">/</span>
                  <span>{trail}</span>
                </>
              ) : (
                "Help centre"
              )}
            </div>
            <h1 className="headline mt-3 text-4xl text-balance sm:text-5xl">{title}</h1>
            {description && (
              <p className="text-muted-foreground mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-pretty">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
