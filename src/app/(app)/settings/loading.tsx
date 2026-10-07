import { HeaderSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors Settings: section index on the left, section cards on the right.
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <HeaderSkeleton actions={0} />
      <div className="grid gap-8 lg:grid-cols-[11rem_1fr]">
        <div className="hidden space-y-3 lg:block">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
