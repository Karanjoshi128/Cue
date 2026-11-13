import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { notFound, permanentRedirect } from "next/navigation";
import { bioPath } from "@/lib/bio/config";
import { getPublicBioMeta, getPublicBioPage } from "@/lib/bio/data";
import { refreshGrid } from "@/lib/bio/grid";
import { countHit, isBot } from "@/lib/bio/clicks";
import { BioView } from "@/components/bio/bio-view";

// A client's public link page: trycue.space/b/<slug>. No sign-in.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).slug.toLowerCase();
  const page = await getPublicBioMeta(slug);
  if (!page) return { title: "Page not found", robots: { index: false } };
  const description = page.bio ?? `Links from ${page.name}.`;
  return {
    title: { absolute: page.title },
    description,
    alternates: { canonical: bioPath(slug) },
    openGraph: { title: page.title, description, url: bioPath(slug), type: "profile" },
  };
}

export default async function BioPublicPage({ params }: Props) {
  const { slug } = await params;
  // Addresses are lowercase; someone typing /b/Acme still lands.
  if (slug !== slug.toLowerCase()) permanentRedirect(bioPath(slug.toLowerCase()));

  const page = await getPublicBioPage(slug);
  if (!page) notFound();

  const userAgent = (await headers()).get("user-agent");
  after(async () => {
    if (!isBot(userAgent)) {
      await countHit(page.id, "view").catch((err) => console.error("[bio] view not counted:", err));
    }
    if (page.refreshAfter) {
      await refreshGrid(page.id).catch((err) => console.error(`[bio] grid refresh for /b/${slug}:`, err));
    }
  });

  return (
    <main className="bg-background min-h-dvh">
      <BioView data={page.view} />
    </main>
  );
}
