import { HeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the composer: numbered steps on the left, the preview on the right.
export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-6xl">
        <HeaderSkeleton actions={0} />
      </div>
      <div className="mx-auto grid max-w-6xl gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-112 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
