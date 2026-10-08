"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { MousePointerClick } from "lucide-react";
import type { DemoView } from "./model";

/** The static capture shown until the live demo has loaded, and on phones. */
function Poster({
  light,
  dark,
  alt,
  aspect,
  note,
}: {
  light: string;
  dark: string;
  alt: string;
  aspect: string;
  note?: boolean;
}) {
  return (
    <div className="relative w-full" style={{ aspectRatio: aspect }}>
      <Image src={light} alt={alt} fill sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover object-top dark:hidden" />
      <Image src={dark} alt={alt} fill sizes="(min-width: 1280px) 1200px, 100vw" className="hidden object-cover object-top dark:block" />
      {note && (
        <span className="bg-background/90 text-muted-foreground absolute right-3 bottom-3 left-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs shadow-float backdrop-blur">
          <MousePointerClick className="size-3.5 shrink-0" />
          Open this page on a larger screen to try the live demo.
        </span>
      )}
    </div>
  );
}

const DASHBOARD_POSTER = {
  light: "/marketing/app-dashboard-light.webp",
  dark: "/marketing/app-dashboard-dark.webp",
  alt: "The Cue dashboard",
  aspect: "16 / 10",
};
const COMPOSER_POSTER = {
  light: "/marketing/app-composer-crop-light.webp",
  dark: "/marketing/app-composer-crop-dark.webp",
  alt: "The Cue composer",
  // Matches the live composer's 820x780 design size, so nothing shifts on load.
  aspect: "820 / 780",
};

// Client-only: the demo runs on the visitor's clock and local state, so there
// is nothing meaningful to server-render, and skipping SSR rules out any
// hydration mismatch from times and dates.
const DemoApp = dynamic(() => import("./demo-app"), {
  ssr: false,
  loading: () => <Poster {...DASHBOARD_POSTER} />,
});

const ComposeDemoApp = dynamic(
  () =>
    import("./demo-app").then((m) => {
      function Focused() {
        return <m.default initialView="compose" bare width={820} height={780} />;
      }
      return Focused;
    }),
  { ssr: false, loading: () => <Poster {...COMPOSER_POSTER} /> },
);

/**
 * Whether the screen is wide enough for a demo to be usable. Each demo is
 * scaled to fit its frame, so below these widths its text and controls would
 * be too small to read or tap; those screens get the screenshot instead (and
 * never download the demo code).
 */
function useMinWidth(px: number) {
  const query = `(min-width: ${px}px)`;
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function LiveDashboard({ initialView = "dashboard" }: { initialView?: DemoView }) {
  // Full width frame: ~75% scale at 1024px.
  const wide = useMinWidth(1024);
  return wide ? <DemoApp initialView={initialView} /> : <Poster {...DASHBOARD_POSTER} note />;
}

export function LiveComposer() {
  // Half-width column in "How it works": ~60% scale from 1200px.
  const wide = useMinWidth(1200);
  return wide ? <ComposeDemoApp /> : <Poster {...COMPOSER_POSTER} />;
}
