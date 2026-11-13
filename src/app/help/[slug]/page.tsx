import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpShell } from "@/components/help/help-shell";
import { GuideBody } from "@/components/help/guide-view";
import { HELP_GUIDES, getGuide, groupOf, plain } from "@/lib/help";

const SITE = (process.env.APP_URL ?? "https://trycue.space").replace(/\/$/, "");

// Every guide is known at build time; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  return {
    title: `${guide.title} | Help`,
    description: guide.summary,
    alternates: { canonical: `/help/${guide.slug}` },
    openGraph: {
      title: `${guide.title} · Cue Help`,
      description: guide.summary,
      url: `/help/${guide.slug}`,
      type: "article",
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  const group = groupOf(guide.group);

  // Breadcrumbs plus the guide as an article, for search results.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Help", item: `${SITE}/help` },
        { "@type": "ListItem", position: 2, name: group.title, item: `${SITE}/help#${group.key}` },
        { "@type": "ListItem", position: 3, name: guide.title, item: `${SITE}/help/${guide.slug}` },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: guide.title,
      description: plain(guide.summary),
      url: `${SITE}/help/${guide.slug}`,
      inLanguage: "en",
      isPartOf: { "@type": "WebSite", name: "Cue", url: SITE },
      publisher: { "@type": "Organization", name: "Cue", url: SITE },
    },
  ];

  return (
    <HelpShell trail={group.title} title={guide.title} description={guide.summary}>
      <script
        type="application/ld+json"
        // JSON from our own constants, not user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <GuideBody guide={guide} base="/help" />
    </HelpShell>
  );
}
