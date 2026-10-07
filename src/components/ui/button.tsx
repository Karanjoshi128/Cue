import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.2),0_1px_2px_0_rgb(10_20_60/0.25),0_0_0_1px_rgb(10_40_140/0.25)] hover:bg-[color-mix(in_oklch,var(--primary),black_8%)]",
        ink: "bg-foreground text-background shadow-[inset_0_1px_0_0_rgb(255_255_255/0.12),0_1px_2px_0_rgb(0_0_0/0.2)] hover:bg-foreground/88",
        outline:
          "border-border bg-card text-foreground shadow-[0_1px_1px_0_rgb(0_0_0/0.04)] hover:border-[color-mix(in_oklch,var(--border),var(--foreground)_14%)] hover:bg-accent aria-expanded:bg-accent dark:bg-card dark:hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--primary)_8%)] aria-expanded:bg-secondary",
        ghost:
          "text-foreground/80 hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/18 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/18 dark:hover:bg-destructive/28 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-2 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4",
        xl: "h-12 gap-2.5 rounded-xl px-6 text-base",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  nativeButton,
  render,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  // When rendering as a custom element (e.g. a Next.js <Link> / anchor via the
  // `render` prop), default `nativeButton` to false so base-ui doesn't warn
  // about missing native <button> semantics. Explicit values still win.
  const resolvedNativeButton =
    nativeButton ?? (render ? false : undefined)

  return (
    <ButtonPrimitive
      data-slot="button"
      render={render}
      nativeButton={resolvedNativeButton}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
