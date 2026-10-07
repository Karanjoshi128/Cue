import { cn } from "@/lib/utils";

/**
 * The editorial header every app page opens with: a mono eyebrow, a serif
 * headline, an optional line of context, and the page's primary actions.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-8 gap-y-5",
        className,
      )}
    >
      <div className="min-w-0 space-y-2.5">
        {eyebrow && (
          <div className="label-caps flex items-center gap-2">{eyebrow}</div>
        )}
        <h1 className="headline text-[2rem] sm:text-[2.6rem]">{title}</h1>
        {description && (
          <p className="text-muted-foreground max-w-2xl text-[0.9375rem] leading-relaxed text-pretty">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

/** A small keyboard hint, e.g. <Kbd>N</Kbd>. */
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "border-border bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border px-1 font-mono text-[0.625rem] leading-none font-medium shadow-[inset_0_-1px_0_0_var(--border)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
