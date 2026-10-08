"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import {
  motion,
  useAnimationControls,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * Fades and lifts its children in the first time they scroll into view.
 *
 * Server-rendered visible, so the content is there without JavaScript and for
 * crawlers. After hydration, only blocks that start below the fold are hidden
 * (off-screen, so nobody sees the swap) and then revealed on entry.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const controls = useAnimationControls();
  const reduce = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      // The preference can resolve after a first pass already hid this block.
      controls.set({ opacity: 1, y: 0 });
      return;
    }
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    controls.set({ opacity: 0, y });
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        controls.start({
          opacity: 1,
          y: 0,
          transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay },
        });
        io.disconnect();
      },
      { rootMargin: "0px 0px -60px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [controls, reduce, y, delay]);

  return (
    <motion.div ref={ref} animate={controls} className={className}>
      {children}
    </motion.div>
  );
}

/** "*one calendar*." marks an emphasis run; stars are stripped for display. */
function tokenize(text: string) {
  const out: { w: string; em: boolean }[] = [];
  let inEm = false;
  for (const raw of text.split(" ")) {
    if (raw.startsWith("*")) inEm = true;
    out.push({ w: raw.replace(/\*/g, ""), em: inEm });
    if (raw.replace(/[.,;:!?]+$/, "").endsWith("*")) inEm = false;
  }
  return out;
}

function Word({
  children,
  progress,
  range,
  em,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
  em?: boolean;
}) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  const Tag = em ? motion.em : motion.span;
  return (
    <Tag style={{ opacity }} className={cn(em && "text-primary")}>
      {children}{" "}
    </Tag>
  );
}

/**
 * A statement that lights up word by word as it scrolls through the
 * viewport. `*word*` segments render in the italic accent.
 */
export function ScrollStatement({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.5"],
  });
  const tokens = tokenize(text);

  if (reduce) {
    return (
      <p ref={ref} className={className}>
        {tokens.map((t, i) =>
          t.em ? (
            <em key={i} className="text-primary">
              {t.w}{" "}
            </em>
          ) : (
            <span key={i}>{t.w} </span>
          ),
        )}
      </p>
    );
  }

  return (
    <p ref={ref} className={className}>
      {tokens.map((t, i) => (
        <Word
          key={i}
          progress={scrollYProgress}
          range={[i / tokens.length, (i + 1) / tokens.length]}
          em={t.em}
        >
          {t.w}
        </Word>
      ))}
    </p>
  );
}

/**
 * The product in a browser frame that starts tipped back and settles flat as
 * it scrolls in. Light and dark captures swap with the theme.
 */
export function ProductShot({
  light,
  dark,
  alt,
  url = "trycue.space/dashboard",
  className,
  children,
}: {
  light?: string;
  dark?: string;
  alt?: string;
  url?: string;
  className?: string;
  /** Live content to show instead of the light/dark screenshot. */
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "start 0.25"],
  });
  const rotateX = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 22, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0.9, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 60, 0]);

  return (
    <div ref={ref} className={cn("[perspective:1600px]", className)}>
      <motion.div
        style={{ rotateX, scale, y, transformOrigin: "50% 0%" }}
        className="bg-card overflow-hidden rounded-[22px] p-1.5 shadow-[0_0_0_1px_var(--border),0_40px_120px_-40px_rgb(20_30_80/0.45)]"
      >
        <div className="bg-muted/70 flex items-center gap-2 rounded-t-[16px] border-b px-4 py-2.5">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="bg-background text-muted-foreground mx-auto flex h-6 w-full max-w-xs items-center justify-center rounded-md font-mono text-[0.625rem] tracking-wide">
            {url}
          </span>
          <span className="w-12" />
        </div>
        {children ? (
          <div className="overflow-hidden rounded-b-[16px]">{children}</div>
        ) : (
          <div className="relative aspect-[16/10] overflow-hidden rounded-b-[16px]">
            <Image
              src={light!}
              alt={alt ?? ""}
              fill
              sizes="(min-width: 1280px) 1200px, 100vw"
              className="object-cover object-top dark:hidden"
            />
            <Image
              src={dark!}
              alt={alt ?? ""}
              fill
              sizes="(min-width: 1280px) 1200px, 100vw"
              className="hidden object-cover object-top dark:block"
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}
