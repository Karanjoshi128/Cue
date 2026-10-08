"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { navItems, isActive } from "@/components/nav-items";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClientSwitcher, type ClientOption } from "@/components/client-switcher";
import { CommandMenu } from "@/components/command-menu";
import {
  NavList,
  NextCueCard,
  UserMenu,
  type NextCueData,
  type ShellUser,
} from "@/components/app-sidebar";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** Slide-out navigation for < md screens (the sidebar is hidden there). */
function MobileNav({
  nextCue,
  user,
  workspaceName,
}: {
  nextCue: NextCueData | null;
  user: ShellUser;
  workspaceName: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1 shell:hidden"
            aria-label="Open menu"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        // The whole menu scrolls as one column, so short screens (small
        // phones, landscape) never squeeze the nav out of view.
        className="bg-canvas w-[82%] max-w-xs gap-0 overflow-y-auto p-3"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-10 items-center px-2">
          <Link href="/dashboard" onClick={close} aria-label="Cue dashboard">
            <Logo className="h-8 w-auto" />
          </Link>
        </div>
        <Button
          render={<Link href="/composer" />}
          className="mt-5 h-10 w-full"
          onClick={close}
        >
          <Plus className="size-4" /> New post
        </Button>
        <nav aria-label="Main" className="mt-7 shrink-0">
          <NavList onNavigate={close} layoutGroup="mobile-nav" />
        </nav>
        <div className="min-h-6 flex-1" />
        <NextCueCard cue={nextCue} onNavigate={close} className="mb-3 shrink-0" />
        <UserMenu user={user} workspaceName={workspaceName} />
      </SheetContent>
    </Sheet>
  );
}

export function AppTopbar({
  user,
  workspaceName,
  clients,
  scopeClientId,
  nextCue,
}: {
  user: ShellUser;
  workspaceName: string;
  clients: ClientOption[];
  scopeClientId?: string;
  nextCue: NextCueData | null;
}) {
  const pathname = usePathname();
  const page = navItems.find((i) => isActive(pathname, i.href));

  return (
    <header className="bg-background/75 supports-backdrop-filter:bg-background/65 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur-xl shell:px-6">
      <MobileNav nextCue={nextCue} user={user} workspaceName={workspaceName} />
      <Link
        href="/dashboard"
        className="grid size-9 place-items-center rounded-lg shell:hidden"
        aria-label="Cue dashboard"
      >
        <LogoMark size={26} />
      </Link>

      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1 text-[0.8125rem]"
      >
        <span className="text-muted-foreground hidden max-w-40 truncate px-1 lg:block">
          {workspaceName}
        </span>
        <span aria-hidden className="text-border hidden text-lg font-light lg:block">
          /
        </span>
        {clients.length > 0 && (
          <ClientSwitcher clients={clients} current={scopeClientId} />
        )}
        {page && (
          <>
            <span aria-hidden className="text-border hidden text-lg font-light sm:block">
              /
            </span>
            <span className="hidden items-center gap-1.5 px-1 font-medium sm:flex">
              <page.icon className="text-muted-foreground size-3.5" />
              {page.label}
            </span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-1.5">
        <CommandMenu clients={clients} />
        <ThemeToggle />
        <Button
          render={<Link href="/composer" />}
          size="sm"
          className="shell:hidden"
          aria-label="New post"
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </header>
  );
}
