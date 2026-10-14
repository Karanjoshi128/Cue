"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import type { KeywordMatch } from "@prisma/client";
import { ExternalLink, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/post-bits";
import { matchesKeywords } from "@/lib/automations/match";
import { fillPreview } from "@/components/automations/bits";
import { cn } from "@/lib/utils";

const SAMPLE_USER = "maya.creates";

export interface PreviewProps {
  accountName: string;
  postLabel: string;
  thumbUrl: string | null;
  keywords: string[];
  matchMode: KeywordMatch;
  reply: string | null;
  dmText: string | null;
  button: { label: string; url: string } | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * What a follower sees: their comment, the public reply under it, and the DM.
 * The "try a comment" box runs the same matcher as the engine.
 */
export function AutomationPreview(p: PreviewProps) {
  const handle = p.accountName.replace(/^@/, "") || "youraccount";
  const sample =
    p.matchMode === "ANY_COMMENT"
      ? "Love this! 😍"
      : p.keywords[0]
        ? `${p.keywords[0].toUpperCase()} please 🙏`
        : "";
  const [tryText, setTryText] = useState<string | null>(null);
  const [brokenThumb, setBrokenThumb] = useState<string | null>(null);
  const comment = tryText ?? sample;
  const hit = comment.trim() !== "" && matchesKeywords(comment, p.keywords, p.matchMode);
  const showThumb = p.thumbUrl && brokenThumb !== p.thumbUrl;

  return (
    <div className="space-y-3">
      <div className="bg-card overflow-hidden rounded-xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.04)]">
        <div className="flex items-center gap-2.5 border-b px-3.5 py-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-[conic-gradient(from_200deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5,#feda75)] p-[1.5px]">
            <span className="bg-card grid size-full place-items-center rounded-full font-mono text-[0.625rem] font-semibold uppercase">
              {handle.slice(0, 1)}
            </span>
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold">{handle}</span>
          <PlatformIcon platform="INSTAGRAM" brand className="size-3.5" />
        </div>

        <div className="bg-muted/60 relative flex aspect-[16/9] items-center justify-center overflow-hidden">
          {showThumb ? (
            <Image
              src={p.thumbUrl!}
              alt=""
              fill
              unoptimized
              sizes="360px"
              className="object-cover"
              onError={() => setBrokenThumb(p.thumbUrl)}
            />
          ) : (
            <div className="text-muted-foreground flex max-w-[80%] flex-col items-center gap-2 text-center text-xs">
              <ImageIcon className="size-5 opacity-60" />
              <span className="line-clamp-2">{p.postLabel}</span>
            </div>
          )}
        </div>

        <div className="space-y-3 px-3.5 py-3 text-[0.8125rem] leading-snug">
          <div className="flex items-start gap-2.5">
            <span className="bg-muted text-muted-foreground grid size-6 shrink-0 place-items-center rounded-full font-mono text-[0.625rem] font-semibold uppercase">
              m
            </span>
            <p className="min-w-0 flex-1 break-words">
              <span className="font-semibold">{SAMPLE_USER}</span>{" "}
              {comment || <span className="text-muted-foreground">Type a comment below</span>}
            </p>
          </div>

          <AnimatePresence initial={false}>
            {hit && p.reply && (
              <motion.div
                key="reply"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-start gap-2.5 pl-8"
              >
                <span className="bg-primary/10 text-primary grid size-6 shrink-0 place-items-center rounded-full font-mono text-[0.625rem] font-semibold uppercase">
                  {handle.slice(0, 1)}
                </span>
                <p className="min-w-0 flex-1 break-words">
                  <span className="font-semibold">{handle}</span>{" "}
                  {fillPreview(p.reply, SAMPLE_USER)}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {hit && p.dmText && (
          <motion.div
            key="dm"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="bg-card rounded-xl border px-3.5 py-3"
          >
            <div className="label-caps mb-2.5">DM to {SAMPLE_USER}</div>
            <div className="max-w-[85%] space-y-1.5">
              <div className="bg-muted rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[0.8125rem] leading-snug break-words whitespace-pre-wrap">
                {fillPreview(p.dmText, SAMPLE_USER)}
              </div>
              {p.button && (
                <div className="bg-card flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-[0.8125rem] font-semibold">
                  <span className="truncate">{p.button.label || "Button"}</span>
                  <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-[0.6875rem] font-normal">
                    <span className="truncate">{p.button.url ? hostOf(p.button.url) : "link"}</span>
                    <ExternalLink className="size-3 shrink-0" />
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-1.5">
        <label htmlFor="auto-try" className="label-caps flex items-center justify-between">
          Try a comment
          <span
            className={cn(
              "flex items-center gap-1.5 normal-case",
              hit ? "text-live-ink" : "text-muted-foreground",
            )}
          >
            <span className={cn("tally size-1.5", hit ? "text-live" : "text-muted-foreground/40")} />
            {hit ? "Triggers" : "No match"}
          </span>
        </label>
        <Input
          id="auto-try"
          value={comment}
          onChange={(e) => setTryText(e.target.value)}
          placeholder="Type what a follower might comment"
        />
      </div>
    </div>
  );
}
