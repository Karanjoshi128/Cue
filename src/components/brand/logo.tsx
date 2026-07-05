import Image from "next/image";
import { cn } from "@/lib/utils";

// The horizontal logo has an ink-navy wordmark that's unreadable on the dark
// surface, so we ship a light-wordmark variant and swap purely with CSS
// `dark:` classes (SSR-safe, no theme JS). The blue mark is identical in both.
export function Logo({ className }: { className?: string }) {
  const shared = {
    alt: "Cue",
    width: 120,
    height: 40,
    priority: true,
    // Let both axes scale from the aspect ratio so a height class (e.g. h-10)
    // doesn't trip Next's "modified one dimension" warning.
    style: { width: "auto", height: "auto" } as const,
  };
  return (
    <>
      <Image
        {...shared}
        src="/brand/cue-logo-horizontal.png"
        className={cn("dark:hidden", className)}
      />
      <Image
        {...shared}
        src="/brand/cue-logo-horizontal-dark.png"
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/brand/cue_icon.png"
      alt="Cue"
      width={size}
      height={size}
      priority
    />
  );
}
