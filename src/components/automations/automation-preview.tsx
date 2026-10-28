"use client";

import { useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import type { AutomationTrigger, KeywordMatch, LeadField } from "@prisma/client";
import { ExternalLink, ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/post-bits";
import { COPY } from "@/lib/automations/config";
import { matchesKeywords } from "@/lib/automations/match";
import { fillPreview } from "@/components/automations/bits";
import { cn } from "@/lib/utils";

const SAMPLE_USER = "maya.creates";
const SAMPLE_ANSWER: Record<LeadField, string> = {
  EMAIL: "maya@example.com",
  PHONE: "+91 98765 43210",
};

export interface PreviewProps {
  accountName: string;
  trigger: AutomationTrigger;
  postLabel: string;
  thumbUrl: string | null;
  keywords: string[];
  matchMode: KeywordMatch;
  fuzzy: boolean;
  reply: string | null;
  dmText: string | null;
  button: { label: string; url: string } | null;
  /** The follow gate's first DM, when it's on. */
  gateText: string | null;
  /** What's asked before the link, when anything is. */
  collect: LeadField | null;
  askText: string | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Bubble({ from, children }: { from: "them" | "you"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.8125rem] leading-snug break-words whitespace-pre-wrap",
        from === "you" ? "bg-muted rounded-bl-md" : "bg-primary text-primary-foreground ml-auto rounded-br-md",
      )}
    >
      {children}
    </div>
  );
}

function ButtonCard({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="bg-card flex max-w-[85%] items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-[0.8125rem] font-semibold">
      <span className="truncate">{label}</span>
      {hint && (
        <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-[0.6875rem] font-normal">
          <span className="truncate">{hint}</span>
          <ExternalLink className="size-3 shrink-0" />
        </span>
      )}
    </div>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 py-0.5 font-mono text-[0.625rem] tracking-wider uppercase">
      <span className="bg-border h-px flex-1" />
      {children}
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

/**
 * What a follower sees: their comment (or story reply, or DM), the public
 * reply, and the conversation that follows. The "try" box runs the same
 * matcher as the engine.
 */
export function AutomationPreview(p: PreviewProps) {
  const handle = p.accountName.replace(/^@/, "") || "youraccount";
  const sample =
    p.matchMode === "ANY_COMMENT"
      ? p.trigger === "STORY_REPLY"
        ? "🔥🔥"
        : "Love this! 😍"
      : p.keywords[0]
        ? `${p.keywords[0].toUpperCase()} please 🙏`
        : "";
  const [tryText, setTryText] = useState<string | null>(null);
  const [brokenThumb, setBrokenThumb] = useState<string | null>(null);
  const text = tryText ?? sample;
  const hit = text.trim() !== "" && matchesKeywords(text, p.keywords, p.matchMode, p.fuzzy);
  const showThumb = p.thumbUrl && brokenThumb !== p.thumbUrl;
  const isComment = p.trigger === "COMMENT";

  return (
    <div className="space-y-3">
      {isComment ? (
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
                {text || <span className="text-muted-foreground">Type a comment below</span>}
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
      ) : (
        <div className="bg-card space-y-2.5 rounded-xl border px-3.5 py-3">
          <div className="label-caps">
            {p.trigger === "STORY_REPLY" ? `${SAMPLE_USER} replied to your story` : `${SAMPLE_USER} sent a DM`}
          </div>
          {p.trigger === "STORY_REPLY" && (
            <div className="bg-muted/60 text-muted-foreground ml-auto grid aspect-[9/16] w-16 place-items-center rounded-lg text-[0.625rem]">
              Story
            </div>
          )}
          <Bubble from="them">{text || "Type a message below"}</Bubble>
        </div>
      )}

      <AnimatePresence initial={false}>
        {hit && p.dmText && (
          <motion.div
            key="dm"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="bg-card space-y-2 rounded-xl border px-3.5 py-3"
          >
            <div className="label-caps mb-1">DM to {SAMPLE_USER}</div>
            {p.gateText !== null && (
              <>
                <Bubble from="you">{fillPreview(p.gateText || COPY.gate, SAMPLE_USER)}</Bubble>
                <ButtonCard label={COPY.tapLabel} />
                <Step>they tap, and they follow you</Step>
              </>
            )}
            {p.collect && (
              <>
                <Bubble from="you">{fillPreview(p.askText || COPY.ask[p.collect], SAMPLE_USER)}</Bubble>
                <Bubble from="them">{SAMPLE_ANSWER[p.collect]}</Bubble>
              </>
            )}
            <Bubble from="you">{fillPreview(p.dmText, SAMPLE_USER)}</Bubble>
            {p.button && (
              <ButtonCard label={p.button.label || "Button"} hint={p.button.url ? hostOf(p.button.url) : "link"} />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-1.5">
        <label htmlFor="auto-try" className="label-caps flex items-center justify-between">
          Try {isComment ? "a comment" : "a message"}
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
          value={text}
          onChange={(e) => setTryText(e.target.value)}
          placeholder={isComment ? "Type what a follower might comment" : "Type what a follower might send"}
        />
      </div>
    </div>
  );
}
