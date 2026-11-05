import type { SiteThemeKey } from "@/lib/site-themes";

// Decoration a site theme draws on every page, beyond its colours (those are
// tokens in globals.css). Pure markup and CSS: no client JavaScript, nothing
// focusable or clickable, and still under prefers-reduced-motion.

const DIWALI_BULBS = ["#ffb02e", "#ff5fa2", "#ffd166", "#ff7a1a"];
// 64px apart, enough for a 3000px-wide screen; the strip clips the rest.
const BULB_COUNT = 48;

/** A string of lamps hung across the top of the page. It scrolls away with
 *  the page, so sticky headers are clear once you start reading. */
function FestiveLights() {
  return (
    <div aria-hidden className="festive-lights">
      {Array.from({ length: BULB_COUNT }, (_, i) => (
        <span
          key={i}
          className="festive-bulb"
          style={
            {
              left: `${i * 64 + 28.5}px`,
              "--bulb": DIWALI_BULBS[i % DIWALI_BULBS.length],
              animationDelay: `${((i * 7) % 11) * 0.23}s`,
              animationDuration: `${1.6 + (i % 3) * 0.45}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function SiteThemeDecor({ theme }: { theme: SiteThemeKey }) {
  if (theme === "diwali") return <FestiveLights />;
  return null;
}
