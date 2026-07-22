import { Skeleton } from "@/components/ui/skeleton";

// Neutral fallback for any (app) route that has no loading.tsx of its own.
// Deliberately shapeless: every current route ships its own skeleton, so this
// only ever covers new routes, where guessing a layout would look wrong.
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
