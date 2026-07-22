import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the composer: editor card on the left, preview column on the right.
export default function Loading() {
  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5 rounded-xl border p-6">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-32 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="flex flex-wrap gap-2 pt-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </div>
  );
}
