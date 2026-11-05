import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { GuideBody } from "@/components/help/guide-view";
import { getGuide, groupOf } from "@/lib/help";

// Behind sign-in like every app page: rendered per request, never prerendered.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return {};
  return {
    title: `${guide.title} | Help`,
    alternates: { canonical: `/help/${guide.slug}` },
    robots: { index: false, follow: false },
  };
}

export default async function InAppGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();
  const group = groupOf(guide.group);

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <PageHeader
        eyebrow={
          <>
            <Link href="/guide" prefetch={false} className="hover:text-foreground transition-colors">
              Help
            </Link>
            <span className="text-border">/</span>
            {group.title}
          </>
        }
        title={guide.title}
        description={guide.summary}
      />
      <GuideBody guide={guide} base="/guide" />
    </div>
  );
}
