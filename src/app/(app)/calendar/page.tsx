import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  format,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { getCalendarPosts } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const offset = Number.parseInt(m ?? "0", 10) || 0;
  const base = addMonths(new Date(), offset);

  const gridStart = startOfWeek(startOfMonth(base));
  const gridEnd = endOfWeek(endOfMonth(base));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const posts = await getCalendarPosts(gridStart, gridEnd);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{format(base, "MMMM yyyy")}</h2>
        <div className="flex items-center gap-2">
          <Button
            render={<Link href={`/calendar?m=${offset - 1}`} />}
            variant="ghost"
            size="icon"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button render={<Link href="/calendar" />} variant="ghost" size="sm">
            Today
          </Button>
          <Button
            render={<Link href={`/calendar?m=${offset + 1}`} />}
            variant="ghost"
            size="icon"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button render={<Link href="/composer" />} size="sm">
            <Plus className="size-4" /> New
          </Button>
        </div>
      </div>

      <div className="bg-border grid grid-cols-7 gap-px overflow-hidden rounded-lg border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="bg-muted text-muted-foreground py-2 text-center text-xs font-medium"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const dayPosts = posts.filter(
            (p) => p.scheduledAt && isSameDay(p.scheduledAt, day),
          );
          return (
            <div
              key={day.toISOString()}
              className={`group bg-background relative min-h-28 p-1.5 ${
                isSameMonth(day, base) ? "" : "opacity-40"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <Link
                  href={`/composer?date=${format(day, "yyyy-MM-dd")}`}
                  aria-label={`Schedule a post on ${format(day, "MMMM d")}`}
                  className="text-muted-foreground hover:text-primary opacity-0 transition group-hover:opacity-100"
                >
                  <Plus className="size-3.5" />
                </Link>
                <span
                  className={`text-xs ${
                    isSameDay(day, new Date())
                      ? "text-primary font-bold"
                      : "text-muted-foreground"
                  }`}
                >
                  {format(day, "d")}
                </span>
              </div>
              <div className="space-y-1">
                {dayPosts.slice(0, 3).map((p) => {
                  const editable =
                    p.status === "DRAFT" || p.status === "SCHEDULED";
                  return (
                    <Link
                      key={p.id}
                      href={editable ? `/composer?edit=${p.id}` : "/queue"}
                      className="bg-accent hover:bg-accent/70 flex items-center gap-1 rounded border-l-2 px-1.5 py-1 text-xs transition-colors"
                      style={{ borderLeftColor: p.client.color ?? "#2A6FF2" }}
                      title={p.body}
                    >
                      {p.scheduledAt && (
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          {format(p.scheduledAt, "h:mm a")}
                        </span>
                      )}
                      <span className="truncate">{p.body}</span>
                    </Link>
                  );
                })}
                {dayPosts.length > 3 && (
                  <div className="text-muted-foreground px-1 text-[10px]">
                    +{dayPosts.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
