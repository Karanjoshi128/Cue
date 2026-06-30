"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/components/nav-items";
import { LogoMark } from "@/components/brand/logo";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
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

export function AppTopbar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <header className="bg-background/80 border-border sticky top-0 z-10 flex h-16 items-center justify-between border-b px-5 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="md:hidden">
          <LogoMark size={24} />
        </span>
        <h1 className="text-lg font-semibold">{titleFor(pathname)}</h1>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger className="outline-none">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
              {userEmail.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate font-normal">
            {userEmail}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings" />}>
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/logout" />}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
