import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the dashboard: a row of stat cards above the upcoming-posts panel.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[86px] w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
