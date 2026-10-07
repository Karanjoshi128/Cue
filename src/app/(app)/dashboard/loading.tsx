import { HeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the dashboard: next cue + stat tiles, the two-week strip, two panels.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <HeaderSkeleton actions={2} />
      <div className="grid gap-4 lg:grid-cols-12">
        <Skeleton className="h-72 rounded-2xl lg:col-span-7" />
        <div className="grid grid-cols-2 gap-4 lg:col-span-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-34 rounded-2xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}
