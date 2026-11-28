"use client";

import { useEffect, useRef } from "react";

/*
 * The footer's giant "cue". The first time the footer scrolls into view, each
 * letter drops in from above the footer like a hard block (think a LEGO brick
 * or a wooden letter), not a rubber one:
 *
 * 1. It falls under gravity, turning slowly, slightly tilted.
 * 2. One bottom corner hits the floor first. The block pivots on that corner
 *    and slaps down flat (clack), and the floor jolts.
 * 3. The slap kicks the far side back up a little, twice, each time lower,
 *    and then it sits dead still. The letter never hops straight up as a
 *    whole and never changes shape: that is what reads as rubber.
 *
 * The motion is computed once and played with the Web Animations API. With
 * reduced motion the letters are simply there. The 3D look is an extruded
 * face (stacked text shadows, .wordmark-3d in globals.css) plus a perspective
 * lean and turn while falling.
 */

interface LetterSpec {
  ch: string;
  /** Start delay, ms. */
  delay: number;
  /** Tilt in the page plane when the corner touches down, deg. Negative
   *  lands on the left corner, positive on the right. */
  tilt: number;
  /** Lean towards (+) or away from the viewer at touchdown, deg. */
  lean: number;
  /** Turn about the vertical axis at touchdown, deg. */
  turn: number;
}

const LETTERS: LetterSpec[] = [
  { ch: "c", delay: 0, tilt: -11, lean: 9, turn: -16 },
  { ch: "u", delay: 150, tilt: 9, lean: -7, turn: 12 },
  { ch: "e", delay: 290, tilt: -7, lean: 6, turn: 18 },
];

const FALL = 0.62; // seconds of free fall
const TOPPLE = 0.09; // corner touchdown to flat
/** The two rebounds after the slap: peak (share of the touchdown tilt) and
 *  how long each lasts. Short and low, like a hard block clacking. */
const REBOUNDS = [
  { peak: 0.2, time: 0.11 },
  { peak: 0.06, time: 0.06 },
];
const SPIN = 0.55; // how much more tilted it was at the start of the fall
const STEP = 1 / 120;

/** Contact profile after touchdown: 1 at touchdown, 0 when flat, small
 *  positive bumps for the rebounds, then 0. Multiply by the touchdown angle. */
function settle(d: number) {
  if (d < TOPPLE) {
    const u = d / TOPPLE;
    return 1 - u * u; // falls over faster and faster, like a toppling block
  }
  let t = d - TOPPLE;
  for (const r of REBOUNDS) {
    if (t < r.time) {
      const u = t / r.time;
      return r.peak * 4 * u * (1 - u); // up and back down under gravity
    }
    t -= r.time;
  }
  return 0;
}

const SETTLED = TOPPLE + REBOUNDS.reduce((s, r) => s + r.time, 0);

/** Keyframes for one letter falling `distance` px and coming to rest. */
function fallKeyframes(distance: number, spec: LetterSpec): { frames: Keyframe[]; ms: number } {
  const g = (2 * distance) / FALL ** 2;
  const end = FALL + SETTLED + 0.05;

  const frames: Keyframe[] = [];
  for (let t = 0; t <= end + 1e-9; t += STEP) {
    let y = 0;
    let k: number; // share of the touchdown angles
    let turn: number;
    if (t < FALL) {
      const s = FALL - t; // time left before touchdown
      y = -(distance - 0.5 * g * t * t);
      k = 1 + SPIN * (s / FALL); // turning steadily as it falls
      turn = spec.turn * (1 + SPIN * (s / FALL));
    } else {
      const d = t - FALL;
      k = settle(d);
      // Friction stops the turn quickly once it's on the floor.
      turn = spec.turn * Math.max(0, 1 - d / TOPPLE) ** 2;
    }
    frames.push({
      offset: Math.min(1, t / end),
      transform:
        `translateY(${y.toFixed(1)}px) ` +
        `rotateY(${turn.toFixed(2)}deg) ` +
        `rotateX(${(spec.lean * k).toFixed(2)}deg) ` +
        `rotateZ(${(spec.tilt * k).toFixed(2)}deg)`,
      opacity: 1,
    });
  }
  frames[frames.length - 1] = { offset: 1, transform: "none", opacity: 1 };
  return { frames, ms: end * 1000 };
}

/** The floor's jolt at each hit: touchdown, the slap flat, the first rebound. */
function thud(box: HTMLElement, at: number, px: number) {
  box.animate(
    [
      { transform: "translateY(0)" },
      { transform: `translateY(${px}px)`, offset: 0.25 },
      { transform: `translateY(${-px * 0.3}px)`, offset: 0.6 },
      { transform: "translateY(0)" },
    ],
    { duration: 160, delay: at, easing: "ease-out", composite: "add" },
  );
}

export function FooterWordmark() {
  const boxRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const letters = letterRefs.current.filter((l): l is HTMLSpanElement => !!l);
    const show = () => letters.forEach((l) => (l.style.opacity = "1"));

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      show();
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const footerTop = box.closest("footer")?.getBoundingClientRect().top ?? 0;
        letters.forEach((el, i) => {
          const spec = LETTERS[i];
          // Pivot on the corner that lands first, at the letter's foot.
          el.style.transformOrigin = spec.tilt < 0 ? "12% 80%" : "88% 80%";
          // Start fully above the footer, so it falls in from out of view.
          const distance = el.getBoundingClientRect().bottom - footerTop + 12;
          const { frames, ms } = fallKeyframes(distance, spec);
          const anim = el.animate(frames, { duration: ms, delay: spec.delay, easing: "linear", fill: "both" });
          anim.finished.then(show, show);
          const touchdown = spec.delay + FALL * 1000;
          thud(box, touchdown, 3);
          thud(box, touchdown + TOPPLE * 1000, 5);
          thud(box, touchdown + (TOPPLE + REBOUNDS[0].time) * 1000, 1.5);
        });
      },
      { threshold: 0.35 },
    );
    io.observe(box);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      aria-hidden
      // Clip only the bottom and sides (the page cuts the letters off), so
      // they can fall in from well above the box, behind the footer's text.
      className="relative -z-10 h-[calc(min(100vw,1200px)*0.19)] [clip-path:inset(-200vh_0_0_0)] xl:h-[230px]"
    >
      <span className="font-display wordmark-3d absolute top-[-0.21em] left-1/2 -translate-x-1/2 text-[calc(min(100vw,1200px)*0.367)] leading-none font-extrabold tracking-[-0.06em] whitespace-nowrap select-none [perspective:1100px] xl:text-[440px]">
        {LETTERS.map((l, i) => (
          <span
            key={l.ch}
            ref={(el) => {
              letterRefs.current[i] = el;
            }}
            className="wordmark-letter"
          >
            {l.ch}
          </span>
        ))}
      </span>
    </div>
  );
}
