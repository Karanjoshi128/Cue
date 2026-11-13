import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { HelpSearch } from "@/components/help/help-search";
import { GuideIcon } from "@/components/help/guide-view";
import { HELP_GROUPS, START_HERE, getGuide, guidesIn, searchIndex } from "@/lib/help";
import type { HelpGuide } from "@/lib/help";

/** The help centre's front page body: search, "Start here", every topic. */
export function HelpHomeBody({ base }: { base: string }) {
  const prefetch = base === "/help" ? undefined : false;
  const start = START_HERE.map((s) => getGuide(s)).filter((g): g is HelpGuide => !!g);

  return (
    <HelpSearch index={searchIndex()} base={base}>
      <div className="space-y-12">
        <section aria-labelledby="start-here">
          <h2 id="start-here" className="label-caps mb-4">
            Start here: three steps to your first post
          </h2>
          <ol className="grid gap-3 md:grid-cols-3">
            {start.map((g, i) => (
              <li key={g.slug}>
                <Link
                  href={`${base}/${g.slug}`}
                  prefetch={prefetch}
                  className="bg-card hover:border-foreground/25 group flex h-full flex-col rounded-2xl border p-5 shadow-[0_1px_2px_0_rgb(20_20_40/0.04)] transition-colors"
                >
                  <span className="text-primary font-mono text-[0.6875rem] font-medium tracking-wider">
                    0{i + 1}
                  </span>
                  <span className="mt-2 font-medium">{g.title}</span>
                  <span className="text-muted-foreground mt-1 flex-1 text-sm leading-relaxed">
                    {g.summary}
                  </span>
                  <span className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-medium">
                    Read <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="topics" className="space-y-8">
          <h2 id="topics" className="label-caps">
            Every guide, by topic
          </h2>
          <div className="grid gap-5 md:grid-cols-2">
            {HELP_GROUPS.map((group) => {
              const Icon = group.icon;
              const guides = guidesIn(group.key);
              return (
                <section
                  key={group.key}
                  id={group.key}
                  aria-labelledby={`${group.key}-title`}
                  className="bg-card scroll-mt-24 rounded-2xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.04)]"
                >
                  <div className="flex items-start gap-3 border-b px-5 py-4">
                    <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 id={`${group.key}-title`} className="text-[0.9375rem] font-semibold tracking-tight">
                        {group.title}
                      </h3>
                      <p className="text-muted-foreground mt-0.5 text-sm">{group.description}</p>
                    </div>
                  </div>
                  <ul className="p-2">
                    {guides.map((g) => (
                      <li key={g.slug}>
                        <Link
                          href={`${base}/${g.slug}`}
                          prefetch={prefetch}
                          className="hover:bg-accent/60 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
                        >
                          <GuideIcon guide={g} className="text-muted-foreground size-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{g.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>

        <section className="bg-card flex flex-wrap items-center gap-4 rounded-2xl border p-5 sm:p-6">
          <span className="bg-muted flex size-10 items-center justify-center rounded-xl">
            <Mail className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-medium">Still stuck?</h2>
            <p className="text-muted-foreground text-sm">
              Email us your workspace name and what you were trying to do, and we&apos;ll help you sort it out.
            </p>
          </div>
          <a
            href="mailto:karan@trycue.space"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium transition-colors"
          >
            karan@trycue.space
          </a>
        </section>
      </div>
    </HelpSearch>
  );
}
