import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Lightbulb, TriangleAlert } from "lucide-react";
import { PlatformIcon } from "@/components/post-bits";
import { SettingsNav } from "@/components/settings-nav";
import { CopyCode } from "@/components/help/copy-code";
import { RichText, helpHref } from "@/components/help/rich-text";
import { getGuide, groupOf, neighbours } from "@/lib/help";
import type { HelpGuide, HelpSection, HelpShot } from "@/lib/help";
import { HELP_SHOTS } from "@/lib/help/shots.generated";
import { cn } from "@/lib/utils";

/*
 * One guide, shared by the public help centre (/help) and the in-app copy
 * (/guide). `base` is the copy being read; help links stay inside it.
 */

export function GuideIcon({ guide, className }: { guide: HelpGuide; className?: string }) {
  if (guide.platform) return <PlatformIcon platform={guide.platform} brand className={className} />;
  const Icon = guide.icon;
  return <Icon className={className} />;
}

export function GuideBody({ guide, base }: { guide: HelpGuide; base: string }) {
  const { prev, next } = neighbours(guide.slug);
  const related = (guide.related ?? []).map(getGuide).filter((g): g is HelpGuide => !!g);
  const prefetch = base === "/help" ? undefined : false;

  return (
    <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
      <nav
        aria-label="On this page"
        className="hidden lg:sticky lg:top-24 lg:block lg:self-start"
      >
        <p className="label-caps mb-3">On this page</p>
        <SettingsNav sections={guide.sections.map((s) => ({ id: s.id, label: s.title }))} />
        <Link
          href={base}
          prefetch={prefetch}
          className="text-muted-foreground hover:text-foreground mt-6 inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-3.5" /> All guides
        </Link>
      </nav>

      <div className="min-w-0 space-y-6">
        {guide.sections.map((s) => (
          <Section key={s.id} section={s} base={base} />
        ))}

        {related.length > 0 && (
          <section aria-labelledby="related" className="pt-2">
            <h2 id="related" className="label-caps mb-3">
              Related guides
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {related.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`${base}/${g.slug}`}
                    prefetch={prefetch}
                    className="bg-card hover:border-foreground/25 flex h-full items-start gap-3 rounded-xl border p-4 transition-colors"
                  >
                    <GuideIcon guide={g} className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{g.title}</span>
                      <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-xs leading-relaxed">
                        {g.summary}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(prev || next) && (
          <nav aria-label="More in this topic" className="flex flex-wrap gap-3 border-t pt-6">
            {prev && (
              <Link
                href={`${base}/${prev.slug}`}
                prefetch={prefetch}
                className="hover:border-foreground/25 flex min-w-0 flex-1 flex-col rounded-xl border p-4 transition-colors"
              >
                <span className="label-caps flex items-center gap-1.5">
                  <ArrowLeft className="size-3" /> Previous
                </span>
                <span className="mt-1 truncate text-sm font-medium">{prev.title}</span>
              </Link>
            )}
            {next && (
              <Link
                href={`${base}/${next.slug}`}
                prefetch={prefetch}
                className="hover:border-foreground/25 flex min-w-0 flex-1 flex-col items-end rounded-xl border p-4 text-right transition-colors"
              >
                <span className="label-caps flex items-center gap-1.5">
                  Next <ArrowRight className="size-3" />
                </span>
                <span className="mt-1 max-w-full truncate text-sm font-medium">{next.title}</span>
              </Link>
            )}
          </nav>
        )}

        <p className="text-muted-foreground text-sm">
          Something here wrong or unclear? Email{" "}
          <a
            href="mailto:karan@trycue.space"
            className="text-foreground underline-offset-4 hover:underline"
          >
            karan@trycue.space
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function Section({ section: s, base }: { section: HelpSection; base: string }) {
  return (
    <section
      id={s.id}
      aria-labelledby={`${s.id}-title`}
      className="bg-card scroll-mt-24 rounded-2xl border p-5 shadow-[0_1px_2px_0_rgb(20_20_40/0.04)] sm:p-6"
    >
      <h2 id={`${s.id}-title`} className="text-[1.0625rem] font-semibold tracking-tight">
        {s.title}
      </h2>
      <div className="text-muted-foreground mt-3 space-y-4 text-[0.9375rem] leading-relaxed">
        {s.intro && (
          <p>
            <RichText text={s.intro} base={base} />
          </p>
        )}
        {s.shot && <Shot shot={s.shot} />}

        {s.steps && (
          <ol className="space-y-4">
            {s.steps.map((step, i) => (
              <li key={i} className="flex gap-3.5">
                <span
                  aria-hidden
                  className="text-primary bg-primary/10 mt-px flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[0.6875rem] font-semibold"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <p>
                    <RichText text={step.text} base={base} />
                  </p>
                  {step.shot && <Shot shot={step.shot} />}
                </div>
              </li>
            ))}
          </ol>
        )}

        {s.points && (
          <ul className="marker:text-muted-foreground/60 list-disc space-y-2 pl-5">
            {s.points.map((p, i) => (
              <li key={i} className="pl-1">
                <RichText text={p} base={base} />
              </li>
            ))}
          </ul>
        )}

        {s.table && (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {s.table.head.map((h, i) => (
                    <th key={i} scope="col" className="text-foreground px-4 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.table.rows.map((row, r) => (
                  <tr key={r} className="align-top">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={cn("px-4 py-2.5 leading-relaxed", c === 0 && "text-foreground")}
                      >
                        <RichText text={cell} base={base} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {s.code && <CopyCode label={s.code.label} text={s.code.text} />}

        {s.tips && s.tips.length > 0 && (
          <Callout tone="tip" items={s.tips} base={base} />
        )}
        {s.warnings && s.warnings.length > 0 && (
          <Callout tone="warn" items={s.warnings} base={base} />
        )}

        {s.faq && (
          <dl className="divide-y rounded-xl border">
            {s.faq.map((f, i) => (
              <div key={i} className="px-4 py-3.5">
                <dt className="text-foreground text-sm font-medium">
                  <RichText text={f.q} base={base} />
                </dt>
                <dd className="mt-1 text-sm leading-relaxed">
                  <RichText text={f.a} base={base} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}

function Callout({
  tone,
  items,
  base,
}: {
  tone: "tip" | "warn";
  items: string[];
  base: string;
}) {
  const Icon = tone === "tip" ? Lightbulb : TriangleAlert;
  return (
    <aside
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed",
        tone === "tip"
          ? "bg-muted/40"
          : "border-standby/40 bg-standby/10 text-foreground/85",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "tip" ? "text-muted-foreground" : "text-standby-ink",
        )}
      />
      <div className="min-w-0">
        <p className="label-caps mb-1">{tone === "tip" ? "Good to know" : "Watch out"}</p>
        <ul className="space-y-1.5">
          {items.map((t, i) => (
            <li key={i}>
              <RichText text={t} base={base} />
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function Shot({ shot }: { shot: HelpShot }) {
  const size = HELP_SHOTS[shot.id];
  if (!size) return null;
  return (
    <figure className="overflow-hidden rounded-xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.05)]">
      <Image
        src={`/help/${shot.id}.png`}
        alt={shot.alt}
        width={size.width}
        height={size.height}
        sizes="(min-width: 1024px) 720px, 100vw"
        className="h-auto w-full"
      />
    </figure>
  );
}

/** The guide's eyebrow trail, title and summary, shared by both copies' headers. */
export function guideHeading(guide: HelpGuide) {
  return { group: groupOf(guide.group).title, title: guide.title, summary: guide.summary };
}

export { helpHref };
