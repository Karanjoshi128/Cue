"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A surface whose border and fill catch a soft light that follows the
 * pointer. The light is two CSS variables updated on pointermove, so there is
 * no React re-render per frame.
 */
export function Spotlight({
  className,
  children,
  color = "var(--primary)",
  size = 320,
  ...props
}: React.ComponentProps<"div"> & { color?: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${e.clientX - r.left}px`);
    el.style.setProperty("--sy", `${e.clientY - r.top}px`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={cn("group/spot relative isolate", className)}
      style={
        {
          "--spot-color": color,
          "--spot-size": `${size}px`,
        } as React.CSSProperties
      }
      {...props}
    >
      {/* Fill glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          background:
            "radial-gradient(var(--spot-size) circle at var(--sx, 50%) var(--sy, 50%), color-mix(in oklch, var(--spot-color) 9%, transparent), transparent 70%)",
        }}
      />
      {/* Border glow, masked to the 1px ring */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          padding: 1,
          background:
            "radial-gradient(calc(var(--spot-size) * 0.75) circle at var(--sx, 50%) var(--sy, 50%), color-mix(in oklch, var(--spot-color) 70%, transparent), transparent 70%)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      {children}
    </div>
  );
}
