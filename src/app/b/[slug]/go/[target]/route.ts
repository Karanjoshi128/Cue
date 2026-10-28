import { after, NextResponse } from "next/server";
import { bioPath } from "@/lib/bio/config";
import { bioDestination } from "@/lib/bio/data";
import { countHit, isBot } from "@/lib/bio/clicks";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; target: string }> };

/**
 * A tap on a link or post: counted, then sent on to the address saved on the
 * page. A link removed since the page loaded goes back to the page.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { slug, target } = await params;
  const page = slug.toLowerCase();
  const dest = await bioDestination(page, target);
  if (!dest) return new NextResponse("Not found", { status: 404 });
  if (!dest.url) return NextResponse.redirect(new URL(bioPath(page), req.url), 302);

  if (!isBot(req.headers.get("user-agent"))) {
    after(() => countHit(dest.pageId, target).catch((err) => console.error("[bio] click not counted:", err)));
  }
  const res = NextResponse.redirect(dest.url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
