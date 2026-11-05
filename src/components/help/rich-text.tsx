import Link from "next/link";
import { Fragment } from "react";

/*
 * Renders the guides' inline markup: **on-screen label**, [text](href) and
 * `code`. Help links (/help/...) are rewritten to the copy being read, so the
 * in-app guide keeps people inside the app.
 */

const TOKEN = /(\*\*.+?\*\*|\[.+?\]\(.+?\)|`.+?`)/g;

export function helpHref(href: string, base: string) {
  return href.startsWith("/help") ? base + href.slice("/help".length) : href;
}

export function RichText({ text, base }: { text: string; base: string }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="text-foreground font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="bg-muted text-foreground rounded-[5px] border px-1 py-px font-mono text-[0.8em]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        const link = /^\[(.+?)\]\((.+?)\)$/.exec(part);
        if (link) {
          const href = helpHref(link[2], base);
          const internal = href.startsWith("/");
          return internal ? (
            <Link
              key={i}
              href={href}
              prefetch={base === "/help" ? undefined : false}
              className="text-primary font-medium underline-offset-4 hover:underline"
            >
              {link[1]}
            </Link>
          ) : (
            <a
              key={i}
              href={href}
              className="text-primary font-medium underline-offset-4 hover:underline"
            >
              {link[1]}
            </a>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
