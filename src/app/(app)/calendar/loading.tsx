import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-48 rounded-lg" />
      </div>
      <Skeleton className="h-140 w-full rounded-lg" />
    </div>
  );
}
