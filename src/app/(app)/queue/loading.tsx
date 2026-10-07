import { HeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <HeaderSkeleton />
      <div className="flex flex-wrap justify-between gap-3">
        <Skeleton className="h-10 w-160 max-w-full rounded-xl" />
        <Skeleton className="h-9 w-64 rounded-lg" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
