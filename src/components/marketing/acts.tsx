"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { Check, Lock } from "lucide-react";
import { CueSheet } from "@/components/marketing/cue-sheet";
import { Reveal } from "@/components/marketing/motion";
import { LiveComposer } from "@/components/marketing/demo/loader";
import {
  LinkedinIcon,
  InstagramIcon,
  YoutubeIcon,
} from "@/components/platform-icons";
import { cn } from "@/lib/utils";

const ACTS = [
  {
    n: "I",
    label: "Connect",
    title: "The account owner says yes, once.",
    body: "Each client signs in on LinkedIn's, Instagram's or Google's own consent screen and authorises Cue. You never handle a password, and access can be revoked any time.",
  },
  {
    n: "II",
    label: "Compose",
    title: "Write it, preview it, pick a time.",
    body: "Attach images, a video or a document, tailor the caption per network, and see each preview before it ships. Send it for approval when a client wants a look first.",
  },
  {
    n: "III",
    label: "Cue",
    title: "Cue calls it. You get the link.",
    body: "When its time comes, Cue publishes to every connected account and records the result and the live link. If a network says no, you see why and retry in one click.",
  },
];

function ConnectVisual() {
  const rows = [
    { Icon: LinkedinIcon, color: "#0a66c2", name: "LinkedIn", who: "Atlas Architecture" },
    { Icon: InstagramIcon, color: "#e1306c", name: "Instagram", who: "@fernwoodcoffee" },
    { Icon: YoutubeIcon, color: "#ff0033", name: "YouTube", who: "Pulse Fitness" },
  ];
  return (
    <div className="bg-card rounded-2xl border p-4 shadow-[0_20px_60px_-30px_rgb(20_20_40/0.35)]">
      <div className="text-muted-foreground mb-3 flex items-center gap-2 font-mono text-[0.625rem] tracking-[0.12em] uppercase">
        <Lock className="size-3" /> Official consent screens
      </div>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li
            key={r.name}
            className="bg-background flex items-center gap-3 rounded-xl border px-3 py-2.5"
          >
            <span
              className="grid size-8 place-items-center rounded-lg"
              style={{ backgroundColor: `color-mix(in oklch, ${r.color} 12%, transparent)` }}
            >
              <r.Icon className="size-4" style={{ color: r.color }} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm font-medium">{r.name}</span>
              <span className="text-muted-foreground block truncate text-xs">{r.who}</span>
            </span>
            <motion.span
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 + 0.15 * i, type: "spring", stiffness: 400, damping: 18 }}
              className="bg-live grid size-5 place-items-center rounded-full text-white"
            >
              <Check className="size-3" strokeWidth={3} />
            </motion.span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComposeVisual() {
  return (
    <div className="bg-card overflow-hidden rounded-2xl p-1.5 shadow-[0_0_0_1px_var(--border),0_20px_60px_-30px_rgb(20_20_40/0.35)]">
      <div className="overflow-hidden rounded-[12px]">
        <LiveComposer />
      </div>
      <p className="text-muted-foreground px-2 pt-2 pb-1 text-xs">
        Live: pick a client, edit the caption, and schedule it.
      </p>
    </div>
  );
}

function CueVisual() {
  return (
    <div className="dark rounded-2xl bg-[#07080b] p-2 shadow-[0_30px_80px_-30px_rgb(10_20_60/0.6)]">
      <CueSheet rows={4} title="Publishing log · Today" />
    </div>
  );
}

const VISUALS = [ConnectVisual, ComposeVisual, CueVisual];

function Marker({
  progress,
  at,
  n,
}: {
  progress: MotionValue<number>;
  at: number;
  n: string;
}) {
  const lit = useTransform(progress, [at - 0.04, at + 0.02], [0, 1]);
  const bg = useTransform(lit, (v) =>
    v > 0.5 ? "var(--primary)" : "var(--card)",
  );
  const color = useTransform(lit, (v) =>
    v > 0.5 ? "var(--primary-foreground)" : "var(--muted-foreground)",
  );
  return (
    <motion.span
      style={{ backgroundColor: bg, color }}
      className="relative z-10 grid size-9 place-items-center rounded-full font-serif text-sm italic shadow-[0_0_0_1px_var(--border),0_0_0_6px_var(--background)] transition-colors"
    >
      {n}
    </motion.span>
  );
}

export function Acts() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.6", "end 0.6"],
  });
  const fill = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  const height = useTransform(fill, (v) => `${(reduce ? 1 : v) * 100}%`);

  return (
    <div ref={ref} className="relative">
      {/* Tracing beam */}
      <div
        aria-hidden
        className="bg-border absolute top-2 bottom-2 left-[1.125rem] w-px md:left-1/2"
      >
        <motion.div
          style={{ height }}
          className="w-px bg-linear-to-b from-[#196bf5] via-[#4c8dff] to-[#14b26a] shadow-[0_0_12px_1px_rgb(25_107_245/0.5)]"
        />
      </div>

      <ol className="space-y-20 md:space-y-28">
        {ACTS.map((act, i) => {
          const Visual = VISUALS[i];
          const flip = i % 2 === 1;
          return (
            <li
              key={act.n}
              className="relative grid gap-8 pl-14 md:grid-cols-2 md:gap-16 md:pl-0"
            >
              <div className="absolute top-0 left-0 md:left-1/2 md:-translate-x-1/2">
                <Marker progress={scrollYProgress} at={i / ACTS.length + 0.04} n={act.n} />
              </div>
              <Reveal
                className={cn("md:pt-1", flip ? "md:order-2 md:pl-12" : "md:pr-12 md:text-right")}
              >
                <div className="label-caps">
                  Act {act.n} · {act.label}
                </div>
                <h3 className="headline mt-3 text-3xl sm:text-4xl">{act.title}</h3>
                <p className={cn("text-muted-foreground mt-4 max-w-md leading-relaxed", !flip && "md:ml-auto")}>
                  {act.body}
                </p>
              </Reveal>
              <Reveal
                delay={0.1}
                className={cn(flip ? "md:order-1 md:pr-12" : "md:pl-12")}
              >
                <Visual />
              </Reveal>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
