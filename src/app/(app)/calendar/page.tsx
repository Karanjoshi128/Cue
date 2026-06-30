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
import { ClientDot } from "@/components/post-bits";
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
              className={`bg-background min-h-28 p-1.5 ${
                isSameMonth(day, base) ? "" : "opacity-40"
              }`}
            >
              <div
                className={`mb-1 text-right text-xs ${
                  isSameDay(day, new Date())
                    ? "text-primary font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayPosts.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="bg-accent flex items-center gap-1 rounded px-1.5 py-1 text-xs"
                    title={p.body}
                  >
                    <ClientDot color={p.client.color} />
                    <span className="truncate">{p.body}</span>
                  </div>
                ))}
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
