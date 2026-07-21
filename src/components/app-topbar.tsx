"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { navItems } from "@/components/nav-items";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClientSwitcher } from "@/components/client-switcher";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function titleFor(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  const match = navItems.find(
    (i) => i.href !== "/" && pathname.startsWith(i.href),
  );
  return match?.label ?? "Cue";
}

/** Slide-out navigation for < md screens (the sidebar is hidden there). */
function MobileNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
        <div className="flex h-16 items-center px-5">
          <Link href="/dashboard" onClick={() => setOpen(false)}>
            <Logo />
          </Link>
        </div>

        <div className="px-3">
          <Button
            render={<Link href="/composer" />}
            className="w-full justify-start gap-2"
            onClick={() => setOpen(false)}
          >
            <Plus className="size-4" />
            New post
          </Button>
        </div>

        <nav className="mt-4 flex flex-col gap-1 px-3">
          {navItems.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

interface ClientOption {
  id: string;
  name: string;
  color: string | null;
}

export function AppTopbar({
  userEmail,
  clients,
  scopeClientId,
}: {
  userEmail: string;
  clients: ClientOption[];
  scopeClientId?: string;
}) {
  const pathname = usePathname();

  return (
    <header className="bg-background/80 border-border sticky top-0 z-10 flex h-16 items-center justify-between border-b px-5 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav pathname={pathname} />
        <h1 className="hidden text-lg font-semibold sm:block">
          {titleFor(pathname)}
        </h1>
        {clients.length > 0 && (
          <>
            <span className="text-border hidden sm:block">/</span>
            <ClientSwitcher clients={clients} current={scopeClientId} />
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none" aria-label="Account menu">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                {userEmail.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate font-normal">
                {userEmail}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/settings" />}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/logout" />}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
