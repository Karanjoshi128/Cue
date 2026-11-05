import type { ThemeSwatch } from "@/lib/site-themes";

/** A miniature of the app shell, drawn in the given palette. */
export function ThemeMiniature({ colors: c, lights }: { colors: ThemeSwatch; lights?: readonly string[] }) {
  return (
    <div className="relative flex h-full gap-1.5 p-2" style={{ background: c.canvas }}>
      {lights && (
        <div className="absolute inset-x-0 top-0 flex justify-around px-1" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className="mt-0.5 size-1 rounded-full"
              style={{ background: lights[i % lights.length], boxShadow: `0 0 4px 1px ${lights[i % lights.length]}` }}
            />
          ))}
        </div>
      )}
      <div className="flex w-1/4 flex-col gap-1 pt-1">
        <span className="h-1.5 w-3/4 rounded-full" style={{ background: c.accent }} />
        <span className="mt-1 h-1 w-full rounded-full" style={{ background: c.soft }} />
        <span className="h-1 w-2/3 rounded-full" style={{ background: c.soft }} />
        <span className="h-1 w-3/4 rounded-full" style={{ background: c.soft }} />
      </div>
      <div className="flex-1 rounded-md p-1.5" style={{ background: c.panel, boxShadow: `0 0 0 1px ${c.line}` }}>
        <span className="block h-1.5 w-1/2 rounded-full" style={{ background: c.ink }} />
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-5 rounded" style={{ background: i === 0 ? c.accent : c.soft }} />
          ))}
        </div>
        <span className="mt-1.5 block h-1 w-3/4 rounded-full" style={{ background: c.soft }} />
      </div>
    </div>
  );
}
