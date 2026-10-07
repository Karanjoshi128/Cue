"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import type { Platform } from "@prisma/client";
import { Logo, LogoMark } from "@/components/brand/logo";
import { navGroups, navItems, isActive } from "@/components/nav-items";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/page-header";
import { Countdown } from "@/components/fx/countdown";
import { ClientDot, PlatformIcon } from "@/components/post-bits";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Settings2,
  Sun,
} from "lucide-react";

export interface NextCueData {
  id: string;
  label: string;
  scheduledAt: string;
  when: string;
  clientName: string;
  clientColor: string | null;
  platforms: Platform[];
}

export interface ShellUser {
  name: string | null;
  email: string;
  role: string;
}

export function initialsOf(user: ShellUser) {
  const source = user.name?.trim() || user.email.split("@")[0];
  const words = source.split(/[\s._-]+/).filter(Boolean);
  return (
    (words.length > 1 ? words[0][0] + words[1][0] : source.slice(0, 2)) || "?"
  ).toUpperCase();
}

/** The grouped navigation list. `compact` renders the icon-only rail. */
export function NavList({
  compact = false,
  onNavigate,
  layoutGroup = "nav",
}: {
  compact?: boolean;
  onNavigate?: () => void;
  layoutGroup?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-5">
      {navGroups.map((group, gi) => (
        <div key={group.key}>
          <div
            className={cn(
              "label-caps px-3 pb-2",
              compact && "lg:block hidden",
            )}
          >
            {group.label}
          </div>
          {compact && gi > 0 && (
            <div className="bg-border mx-auto mb-3 h-px w-6 lg:hidden" />
          )}
          <ul className="space-y-0.5">
            {navItems
              .filter((i) => i.group === group.key)
              .map((item) => {
                const active = isActive(pathname, item.href);
                const link = (
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group/nav relative flex h-9 items-center gap-3 rounded-lg px-3 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                      compact && "justify-center px-0 lg:justify-start lg:px-3",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId={`${layoutGroup}-active`}
                        className="bg-sidebar-accent absolute inset-0 rounded-lg shadow-[0_0_0_1px_var(--sidebar-border),0_1px_3px_0_rgb(20_20_40/0.06)]"
                        transition={{ type: "spring", stiffness: 520, damping: 42 }}
                      />
                    )}
                    <item.icon
                      className={cn(
                        "relative size-[1.05rem] transition-colors",
                        active ? "text-primary" : "group-hover/nav:text-foreground",
                      )}
                    />
                    <span className={cn("relative", compact && "hidden lg:inline")}>
                      {item.label}
                    </span>
                  </Link>
                );
                return (
                  <li key={item.href}>
                    {compact ? (
                      <Tooltip>
                        <TooltipTrigger render={link} />
                        <TooltipContent side="right" className="lg:hidden">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** The live "next cue" card: what goes out next, and how long until it does. */
export function NextCueCard({
  cue,
  onNavigate,
  className,
}: {
  cue: NextCueData | null;
  onNavigate?: () => void;
  className?: string;
}) {
  if (!cue) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed p-3.5",
          className,
        )}
      >
        <div className="label-caps flex items-center gap-1.5">
          <span className="tally text-muted-foreground/40" />
          Next cue
        </div>
        <p className="mt-2 text-sm font-medium">Nothing on standby</p>
        <Link
          href="/composer"
          onClick={onNavigate}
          className="text-primary mt-0.5 inline-block text-xs font-medium hover:underline"
        >
          Schedule a post
        </Link>
      </div>
    );
  }

  return (
    <Link
      href={`/composer?edit=${cue.id}`}
      onClick={onNavigate}
      className={cn(
        "border-beam bg-card hover:bg-accent/60 block rounded-xl border p-3.5 shadow-[0_1px_2px_0_rgb(20_20_40/0.04)] transition-colors",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps flex items-center gap-1.5">
          <span className="tally text-standby" data-live="true" />
          Next cue
        </span>
        <span className="text-muted-foreground flex items-center gap-1">
          {cue.platforms.map((p) => (
            <PlatformIcon key={p} platform={p} className="size-3" />
          ))}
        </span>
      </div>
      <Countdown
        to={cue.scheduledAt}
        className="mt-2 block text-[1.4rem] leading-none font-medium tracking-tight"
      />
      <div className="text-muted-foreground mt-1.5 truncate font-mono text-[0.6875rem] tracking-wide uppercase">
        {cue.when}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs font-medium">
        <ClientDot color={cue.clientColor} />
        <span className="truncate">{cue.clientName}</span>
      </div>
      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
        {cue.label}
      </p>
    </Link>
  );
}

/** Account menu: identity, settings, theme, sign out. */
export function UserMenu({
  user,
  workspaceName,
  compact = false,
}: {
  user: ShellUser;
  workspaceName: string;
  compact?: boolean;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left outline-none transition-colors hover:shadow-[0_0_0_1px_var(--sidebar-border)] focus-visible:ring-3 focus-visible:ring-ring/30 aria-expanded:bg-sidebar-accent",
          compact && "justify-center lg:justify-start",
        )}
        aria-label="Account menu"
      >
        <span className="bg-foreground text-background grid size-8 shrink-0 place-items-center rounded-lg font-mono text-[0.6875rem] font-semibold tracking-wider">
          {initialsOf(user)}
        </span>
        <span className={cn("min-w-0 flex-1", compact && "hidden lg:block")}>
          <span className="block truncate text-[0.8125rem] font-medium leading-tight">
            {user.name || user.email.split("@")[0]}
          </span>
          <span className="text-muted-foreground block truncate text-xs leading-tight">
            {workspaceName}
          </span>
        </span>
        <ChevronsUpDown
          className={cn(
            "text-muted-foreground size-3.5 shrink-0",
            compact && "hidden lg:block",
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="text-foreground block truncate text-sm font-medium">
              {user.name || "Signed in"}
            </span>
            <span className="block truncate">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings2 /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme ?? "system"}
            onValueChange={(v) => setTheme(String(v))}
          >
            <DropdownMenuRadioItem value="light">
              <Sun /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon /> Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor /> System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {/* A plain anchor: sign-out is a GET handler, so it must never be prefetched. */}
        <DropdownMenuItem render={<a href="/logout" />}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({
  nextCue,
  user,
  workspaceName,
}: {
  nextCue: NextCueData | null;
  user: ShellUser;
  workspaceName: string;
}) {
  const pathname = usePathname();
  // sticky + an explicit height pins the rail to the viewport; without the
  // height, align-items:stretch grows it with the page and it scrolls along.
  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col py-3 pr-2 pl-3 md:flex md:w-[76px] lg:w-[248px]">
      <div className="flex h-10 items-center justify-center px-2 lg:justify-start">
        <Link href="/dashboard" aria-label="Cue dashboard" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
          <span className="lg:hidden">
            <LogoMark size={30} />
          </span>
          <span className="hidden lg:block">
            <Logo className="h-8 w-auto" />
          </span>
        </Link>
      </div>

      <Button
        render={<Link href="/composer" />}
        className="mt-5 h-10 w-full justify-center px-0 lg:justify-between lg:px-3"
        aria-label="New post"
      >
        <span className="flex items-center gap-2">
          <Plus className="size-4" />
          <span className="hidden lg:inline">New post</span>
        </span>
        <Kbd className="hidden border-white/20 bg-white/15 text-white/90 shadow-none lg:inline-flex">
          N
        </Kbd>
      </Button>

      <nav aria-label="Main" className="mt-7 flex-1 overflow-y-auto">
        <NavList compact />
      </nav>

      {/* The dashboard leads with its own, larger next-cue card. */}
      {pathname !== "/dashboard" && (
        <NextCueCard cue={nextCue} className="mb-3 hidden lg:block" />
      )}

      <UserMenu user={user} workspaceName={workspaceName} compact />
    </aside>
  );
}
