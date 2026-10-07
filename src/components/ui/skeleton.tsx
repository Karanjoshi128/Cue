import { cn } from "@/lib/utils"

// A light sweep instead of a pulse: reads as "loading", not "broken".
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-shimmer rounded-md bg-muted bg-size-[250%_100%] bg-no-repeat",
        "bg-[linear-gradient(100deg,transparent_30%,color-mix(in_oklch,var(--foreground)_5%,transparent)_50%,transparent_70%)]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
