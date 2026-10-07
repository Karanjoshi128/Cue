import { HeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Neutral fallback for any (app) route without a loading.tsx of its own.
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <HeaderSkeleton />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
