import Image from "next/image";
import { Play } from "lucide-react";
import type { BioViewData } from "@/lib/bio/data";
import { ClientMonogram } from "@/components/post-bits";
import { cn } from "@/lib/utils";

/**
 * A client's link page: picture, title, bio, links and recent posts. The
 * public page (src/app/b/[slug]) and the editor's preview both render it; in
 * the preview every link opens in a new tab and nothing is counted.
 */
export function BioView({
  data,
  preview = false,
  className,
}: {
  data: BioViewData;
  preview?: boolean;
  className?: string;
}) {
  const away = preview ? { target: "_blank", rel: "noreferrer" } : {};
  return (
    <div className={cn("mx-auto flex w-full max-w-md flex-col items-center px-5 pt-12 pb-8 text-center", className)}>
      <div className="rounded-full p-[3px]" style={{ background: data.color ?? "var(--primary)" }}>
        {data.avatarUrl ? (
          <span className="border-background bg-muted relative block size-22 overflow-hidden rounded-full border-[3px]">
            <Image src={data.avatarUrl} alt="" fill unoptimized sizes="88px" className="object-cover" />
          </span>
        ) : (
          <ClientMonogram
            name={data.name}
            color={data.color}
            className="border-background size-22 rounded-full border-[3px] text-xl"
          />
        )}
      </div>

      <h1 className="headline mt-5 text-[1.9rem] wrap-break-word">{data.title}</h1>
      {data.bio && (
        <p className="text-muted-foreground mt-2.5 max-w-sm text-[0.9375rem] leading-relaxed wrap-break-word whitespace-pre-line text-pretty">
          {data.bio}
        </p>
      )}

      {data.links.length > 0 && (
        <ul className="mt-8 w-full space-y-3">
          {data.links.map((l) => (
            <li key={l.id}>
              <a
                href={l.href}
                {...away}
                className="bg-card shadow-hairline hover:shadow-[0_0_0_1px_var(--border),0_8px_20px_-10px_rgb(20_20_40/0.3)] focus-visible:outline-ring block rounded-2xl px-5 py-4 text-[0.9375rem] font-medium wrap-break-word transition hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      )}

      {data.tiles.length > 0 && (
        <section className="mt-10 w-full text-left">
          <h2 className="label-caps mb-3">Latest posts</h2>
          <ul className="grid grid-cols-3 gap-1 overflow-hidden rounded-xl">
            {data.tiles.map((t) => (
              <li key={t.id}>
                <a
                  href={t.href}
                  {...away}
                  aria-label={t.caption ? `Post: ${t.caption.slice(0, 80)}` : "Post"}
                  className="bg-muted focus-visible:outline-ring relative block aspect-square focus-visible:outline-2 focus-visible:-outline-offset-2"
                >
                  <Image src={t.image} alt="" fill unoptimized sizes="160px" className="object-cover" />
                  {t.video && (
                    <Play className="absolute top-1.5 right-1.5 size-3.5 fill-white text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.5)]" />
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <a
        href="https://trycue.space"
        {...away}
        className="text-muted-foreground hover:text-foreground mt-12 font-mono text-[0.6875rem] tracking-wide"
      >
        Made with Cue
      </a>
    </div>
  );
}
