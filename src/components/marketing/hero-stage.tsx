"use client";

import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { Check, Heart, MessageCircle, Send, ThumbsUp } from "lucide-react";
import { CueSheet, useCueClock } from "@/components/marketing/cue-sheet";
import {
  InstagramIcon,
  LinkedinIcon,
  YoutubeIcon,
} from "@/components/platform-icons";
import { cn } from "@/lib/utils";

const ROWS = 5;

/** "Standby 08:30" until its cue is called, then a green "Live". */
function CueTag({ live, time }: { live: boolean; time: string }) {
  return (
    <span className="relative inline-flex h-6 min-w-[5.5rem] items-center justify-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {live ? (
          <motion.span
            key="live"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex h-6 items-center gap-1 rounded-full bg-[#14b26a] px-2.5 font-mono text-[0.625rem] font-semibold tracking-wider text-white uppercase shadow-[0_6px_20px_-6px_rgb(20_178_106/0.7)]"
          >
            <Check className="size-3" strokeWidth={3} /> Live
          </motion.span>
        ) : (
          <motion.span
            key="standby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-background/90 text-standby-ink inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-[0.625rem] font-semibold tracking-wider uppercase shadow-[0_0_0_1px_var(--border)] backdrop-blur"
          >
            <span className="bg-standby size-1.5 rounded-full" />
            {time}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * The hero's "stage": the live cue sheet on a dark panel, with the posts it
 * calls floating around it and going live in step. Tilts toward the pointer.
 */
export function HeroStage({ className }: { className?: string }) {
  const reduce = usePrefersReducedMotion();
  const called = useCueClock(ROWS, 2300);
  const isLive = (i: number) => called > i;

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 120, damping: 20 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-9, 9]), { stiffness: 120, damping: 20 });

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }

  return (
    <div
      className={cn("relative [perspective:1400px]", className)}
      onPointerMove={onMove}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <motion.div
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        className="relative sm:mb-60"
      >
        {/* The stage */}
        <div className="dark grain relative overflow-hidden rounded-[28px] bg-[#07080b] p-2.5 shadow-[0_50px_100px_-30px_rgb(10_20_60/0.55),0_0_0_1px_rgb(255_255_255/0.06)_inset]">
          <div
            aria-hidden
            className="bg-grid pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_at_top,black,transparent_70%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[130%] -translate-x-1/2 rounded-full bg-[#196bf5]/30 blur-[90px]"
          />
          <CueSheet
            rows={ROWS}
            called={called}
            className="relative border-white/[0.07] bg-white/[0.025]"
          />
        </div>

        {/* Instagram: Fernwood Coffee (cue 0) */}
        <motion.div
          style={{ translateZ: 70 }}
          animate={{ y: isLive(0) ? -4 : 0 }}
          className="bg-card absolute -right-2 -bottom-60 hidden w-44 rotate-[3deg] overflow-hidden rounded-2xl shadow-[0_24px_60px_-16px_rgb(20_20_40/0.35),0_0_0_1px_var(--border)] sm:block xl:-right-8"
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="rounded-full bg-linear-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[1.5px]">
              <span className="bg-card block rounded-full p-[1.5px]">
                <span className="block size-5 rounded-full bg-[#a8754d]" />
              </span>
            </span>
            <span className="truncate text-[0.6875rem] font-semibold">fernwoodcoffee</span>
            <InstagramIcon className="ml-auto size-3.5 text-[#e1306c]" />
          </div>
          <div className="relative aspect-square">
            <Image
              src="/marketing/demo-latte.jpg"
              alt="A flat white with tulip latte art"
              fill
              sizes="192px"
              className={cn(
                "object-cover transition-[filter] duration-700",
                !isLive(0) && "saturate-[0.6]",
              )}
            />
            <span className="absolute top-2 right-2">
              <CueTag live={isLive(0)} time="08:30" />
            </span>
          </div>
          <div className="flex items-center gap-2.5 px-3 pt-2 pb-2.5 text-[0.625rem] leading-snug">
            <Heart className="size-3.5 shrink-0" />
            <MessageCircle className="size-3.5 shrink-0" />
            <Send className="size-3.5 shrink-0" />
            <span className="text-muted-foreground truncate">The Guji is back.</span>
          </div>
        </motion.div>

        {/* LinkedIn: Atlas Architecture (cue 1) */}
        <motion.div
          style={{ translateZ: 90 }}
          animate={{ y: isLive(1) ? -4 : 0 }}
          className="bg-card absolute -bottom-64 -left-3 hidden w-60 -rotate-[2deg] overflow-hidden rounded-2xl shadow-[0_24px_60px_-16px_rgb(20_20_40/0.35),0_0_0_1px_var(--border)] sm:block xl:-left-8"
        >
          <div className="flex items-start gap-2 px-3 pt-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#23395b] font-mono text-[0.5625rem] font-semibold text-white">
              AA
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center gap-1 text-[0.6875rem] font-semibold">
                Atlas Architecture
                <LinkedinIcon className="size-3 text-[#0a66c2]" />
              </div>
              <div className="text-muted-foreground text-[0.625rem]">Architecture studio</div>
            </div>
            <CueTag live={isLive(1)} time="09:00" />
          </div>
          <p className="px-3 pt-2 pb-2 text-[0.6875rem] leading-snug">
            Riverside Library: how one roof brings daylight to every reading
            table.
          </p>
          <div className="relative aspect-[16/8]">
            <Image
              src="/marketing/demo-library.jpg"
              alt="A daylit library reading room"
              fill
              sizes="256px"
              className={cn(
                "object-cover transition-[filter] duration-700",
                !isLive(1) && "saturate-[0.6]",
              )}
            />
          </div>
          <div className="text-muted-foreground flex items-center justify-around px-2 py-1.5 text-[0.5625rem]">
            <span className="flex items-center gap-1"><ThumbsUp className="size-3" /> Like</span>
            <span className="flex items-center gap-1"><MessageCircle className="size-3" /> Comment</span>
            <span className="flex items-center gap-1"><Send className="size-3" /> Send</span>
          </div>
        </motion.div>

        {/* YouTube: Pulse Fitness (cue 2), a toast-like confirmation */}
        <AnimatePresence>
          {isLive(2) && (
            <motion.div
              key="yt"
              style={{ translateZ: 110 }}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="bg-card absolute -top-7 -right-3 hidden items-center gap-3 rounded-xl px-3 py-2.5 shadow-[0_20px_50px_-14px_rgb(20_20_40/0.4),0_0_0_1px_var(--border)] sm:flex xl:-right-10"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-[#ff0033]/10">
                <YoutubeIcon className="size-4 text-[#ff0033]" />
              </span>
              <span className="leading-tight">
                <span className="block text-[0.6875rem] font-semibold">
                  Video published
                </span>
                <span className="text-muted-foreground block text-[0.625rem]">
                  Pulse Fitness · 10:15
                </span>
              </span>
              <span className="grid size-5 place-items-center rounded-full bg-[#14b26a] text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
