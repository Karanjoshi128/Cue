"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Plug,
  ScrollText,
  Send,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/accounts", label: "Accounts", icon: Plug },
  { href: "/admin/posts", label: "Posts", icon: Send },
  { href: "/admin/api-keys", label: "API keys", icon: KeyRound },
  { href: "/admin/storage", label: "Storage", icon: HardDrive },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
  { href: "/admin/platform", label: "Platform", icon: SlidersHorizontal },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Sidebar list on wide screens, a scrolling strip of chips on narrow ones. */
export function AdminNav({ variant }: { variant: "side" | "strip" }) {
  const pathname = usePathname();
  if (variant === "strip") {
    return (
      <nav aria-label="Admin" className="overflow-x-auto lg:hidden">
        <ul className="flex w-max gap-1 px-4 pb-2.5 sm:px-6">
          {ITEMS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3 text-[0.8125rem] whitespace-nowrap transition-colors",
                  isActive(pathname, href)
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }
  return (
    <nav aria-label="Admin" className="sticky top-24">
      <ul className="space-y-0.5">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                isActive(pathname, href)
                  ? "bg-card text-foreground font-medium shadow-[0_0_0_1px_var(--border)]"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/60",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
