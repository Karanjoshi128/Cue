import { ImageResponse } from "next/og";
import { inkOn } from "@/components/post-bits";
import { getPublicBioMeta, SITE_URL } from "@/lib/bio/data";

// The picture a link page shows when it's shared (WhatsApp, iMessage, X),
// instead of Cue's own: the client's picture or initials, title and bio.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Link page";

/** The profile picture as a data URL; Instagram's links expire, so null on any failure. */
async function picture(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2)).toUpperCase();
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug.toLowerCase();
  const page = await getPublicBioMeta(slug);
  const color = page?.color ?? "#2A6FF2";
  const avatar = await picture(page?.avatarUrl ?? null);
  const host = SITE_URL.replace(/^https?:\/\//, "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 64,
          padding: "0 96px",
          background: "#f4f3ee",
          color: "#121420",
          borderTop: `16px solid ${color}`,
        }}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img>
          <img src={avatar} alt="" width={260} height={260} style={{ borderRadius: 999, border: `8px solid ${color}` }} />
        ) : (
          <div
            style={{
              width: 260,
              height: 260,
              borderRadius: 999,
              background: color,
              color: inkOn(color),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 96,
              fontWeight: 700,
            }}
          >
            {initials(page?.name ?? "Cue")}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 20 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>
            {(page?.title ?? "Link page").slice(0, 60)}
          </div>
          {page?.bio && (
            <div style={{ fontSize: 34, color: "#5b5d6b", lineHeight: 1.35 }}>{page.bio.slice(0, 120)}</div>
          )}
          <div style={{ fontSize: 26, color: "#5b5d6b", marginTop: 12 }}>{`${host}/b/${slug}`}</div>
        </div>
      </div>
    ),
    size,
  );
}
