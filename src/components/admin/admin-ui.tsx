import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  OctagonX,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGE_SIZE, type AccountHealth } from "@/lib/admin-data";
import { getTimeZone } from "@/lib/timezone-server";
import { zoned } from "@/lib/timezone";

// Presentational pieces shared by the admin pages. Server components only.

export function AdminHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0 space-y-2">
        {eyebrow && <div className="label-caps flex flex-wrap items-center gap-2">{eyebrow}</div>}
        <h1 className="headline text-[1.75rem] sm:text-[2.25rem]">{title}</h1>
        {description && (
          <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed text-pretty">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  id,
  flush,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** No inner padding: for tables that run edge to edge. */
  flush?: boolean;
}) {
  return (
    <section id={id} className={cn("bg-card min-w-0 scroll-mt-24 rounded-2xl border", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>}
            {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? "" : "px-4 py-4 sm:px-5"}>{children}</div>
    </section>
  );
}

/** One headline number. Values wear text ink; status rides on the icon + note. */
export function StatTile({
  label,
  value,
  note,
  href,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  href?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const body = (
    <>
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        {tone && <ToneIcon tone={tone} />}
        {label}
      </div>
      <div className="mt-2 font-mono text-[1.75rem] leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {note && <div className="text-muted-foreground mt-2 text-xs">{note}</div>}
    </>
  );
  const cls = "bg-card block rounded-2xl border p-4 transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-foreground/25 outline-none focus-visible:ring-3 focus-visible:ring-ring/30")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function ToneIcon({ tone, className }: { tone: "good" | "warn" | "bad" | "idle"; className?: string }) {
  if (tone === "good") return <CheckCircle2 className={cn("text-live size-3.5 shrink-0", className)} aria-hidden />;
  if (tone === "warn") return <AlertTriangle className={cn("text-standby-ink size-3.5 shrink-0", className)} aria-hidden />;
  if (tone === "bad") return <OctagonX className={cn("text-destructive size-3.5 shrink-0", className)} aria-hidden />;
  return <CircleDashed className={cn("text-muted-foreground size-3.5 shrink-0", className)} aria-hidden />;
}

/** A small status chip: icon + label, never colour alone. */
export function Pill({
  tone = "idle",
  children,
  className,
}: {
  tone?: "good" | "warn" | "bad" | "idle";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-card inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.6875rem] font-medium whitespace-nowrap shadow-[0_0_0_1px_var(--border)]",
        tone === "good" && "text-live-ink",
        tone === "warn" && "text-standby-ink",
        tone === "bad" && "text-destructive",
        tone === "idle" && "text-muted-foreground",
        className,
      )}
    >
      <ToneIcon tone={tone} className="size-3" />
      {children}
    </span>
  );
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs", className)}>{children}</span>;
}

/** An exact time in the viewer's own time zone (from the app's tz cookie). */
export async function When({ date, pattern = "d MMM yyyy, HH:mm" }: { date: Date; pattern?: string }) {
  const tz = await getTimeZone();
  return (
    <time dateTime={date.toISOString()} title={tz} className="whitespace-nowrap">
      {format(date, pattern, { in: zoned(tz) })}
    </time>
  );
}

/** Relative time, with the exact timestamp on hover. */
export function Ago({ date, empty = "Never" }: { date: Date | string | null | undefined; empty?: string }) {
  if (!date) return <span className="text-muted-foreground">{empty}</span>;
  const d = new Date(date);
  return (
    <time dateTime={d.toISOString()} title={d.toUTCString()} className="whitespace-nowrap">
      {formatDistanceToNowStrict(d, { addSuffix: true })}
    </time>
  );
}

/** Horizontally scrollable table, so wide data never breaks a phone layout. */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full min-w-[640px] border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        "text-muted-foreground border-b px-4 py-2.5 text-left text-[0.6875rem] font-medium tracking-wider whitespace-nowrap uppercase first:pl-4 sm:first:pl-5",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b px-4 py-3 align-top first:pl-4 sm:first:pl-5", className)}>{children}</td>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground px-4 py-10 text-center text-sm">{children}</p>;
}

/** GET search form: the query lives in the URL, so results are linkable. */
export function SearchForm({
  placeholder,
  q,
  hidden,
}: {
  placeholder: string;
  q?: string;
  hidden?: Record<string, string | undefined>;
}) {
  return (
    <form role="search" className="relative w-full sm:w-80">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden />
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/15 h-9 w-full rounded-lg border pr-3 pl-9 text-sm outline-none focus-visible:ring-4"
      />
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
    </form>
  );
}

/** Filter chips that are plain links. */
export function FilterTabs({
  items,
  active,
}: {
  items: { key: string; label: string; href: string; count?: number }[];
  active: string;
}) {
  return (
    <nav aria-label="Filter" className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === active ? "page" : undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] transition-colors",
            i.key === active
              ? "bg-foreground text-background border-foreground"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {i.label}
          {i.count !== undefined && <span className="font-mono text-[0.6875rem] tabular-nums opacity-70">{i.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Pager({
  page,
  total,
  href,
}: {
  page: number;
  total: number;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
      <span className="text-muted-foreground">
        Page {page} of {pages} · {total} total
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link className="bg-card hover:bg-accent rounded-lg border px-3 py-1.5" href={href(page - 1)}>
            Previous
          </Link>
        )}
        {page < pages && (
          <Link className="bg-card hover:bg-accent rounded-lg border px-3 py-1.5" href={href(page + 1)}>
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}

/** Builds an admin URL from a path and query params, skipping empty ones. */
export function qs(path: string, params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

export function truncate(text: string, n = 90) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export const ACCOUNT_HEALTH: Record<AccountHealth, { tone: "good" | "warn" | "bad" | "idle"; label: string }> = {
  ok: { tone: "good", label: "Connected" },
  renews: { tone: "good", label: "Auto-renews" },
  expiring: { tone: "warn", label: "Expires soon" },
  expired: { tone: "bad", label: "Expired" },
  reconnect: { tone: "bad", label: "Needs reconnect" },
  unknown: { tone: "idle", label: "No expiry info" },
};
