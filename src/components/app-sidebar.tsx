"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Logo } from "@/components/brand/logo";
import { navItems } from "@/components/nav-items";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-sidebar border-border hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/">
          <Logo />
        </Link>
      </div>

      <div className="px-3">
        <Button
          render={<Link href="/composer" />}
          className="w-full justify-start gap-2"
        >
          <Plus className="size-4" />
          New post
        </Button>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="bg-accent absolute inset-0 rounded-md"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <item.icon className="relative size-4" />
              <span className="relative">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="text-muted-foreground border-border border-t px-5 py-4 text-xs">
        Cue · v0.1
      </div>
    </aside>
  );
}
