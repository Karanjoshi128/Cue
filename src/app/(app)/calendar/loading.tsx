import { HeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <HeaderSkeleton actions={2} />
      <div className="flex justify-between">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-8 w-72 rounded-lg" />
      </div>
      <Skeleton className="h-160 w-full rounded-2xl" />
    </div>
  );
}
