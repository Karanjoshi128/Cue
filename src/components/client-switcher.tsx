"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { ClientDot } from "@/components/post-bits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SCOPE_COOKIE } from "@/lib/scope";
import { cn } from "@/lib/utils";

export interface ClientOption {
  id: string;
  name: string;
  color: string | null;
}

/** Scope every data page to one client ("all" clears it). */
export function writeClientScope(id: string) {
  // 1-year cookie; read server-side to scope every data page.
  document.cookie = `${SCOPE_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
}

export function ClientSwitcher({
  clients,
  current,
}: {
  clients: ClientOption[];
  current?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const active = clients.find((c) => c.id === current);
  const q = query.trim().toLowerCase();
  const shown = q
    ? clients.filter((c) => c.name.toLowerCase().includes(q))
    : clients;

  function select(id: string) {
    writeClientScope(id);
    router.refresh();
  }

  return (
    <DropdownMenu onOpenChange={(open) => !open && setQuery("")}>
      <DropdownMenuTrigger
        className={cn(
          "hover:bg-accent aria-expanded:bg-accent flex h-8 min-w-0 items-center gap-2 rounded-lg px-2.5 text-[0.8125rem] font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30",
          active &&
            "bg-card shadow-[0_0_0_1px_var(--border),0_1px_2px_0_rgb(20_20_40/0.05)]",
        )}
      >
        {active ? (
          <ClientDot color={active.color} />
        ) : (
          <span className="flex -space-x-1">
            {clients.slice(0, 3).map((c) => (
              <span
                key={c.id}
                className="ring-background size-2.5 rounded-full ring-2"
                style={{ backgroundColor: c.color ?? "var(--primary)" }}
              />
            ))}
          </span>
        )}
        <span className="max-w-36 truncate">
          {active?.name ?? "All clients"}
        </span>
        <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {clients.length > 6 && (
          <>
            <div className="flex items-center gap-2 px-2 pt-1 pb-1.5">
              <Search className="text-muted-foreground size-3.5" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Keep typing from triggering the menu's typeahead.
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="Find a client…"
                aria-label="Find a client"
                className="placeholder:text-muted-foreground h-7 w-full bg-transparent text-sm outline-none"
              />
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {!q && (
          <DropdownMenuItem onClick={() => select("all")}>
            <span className="bg-muted-foreground/40 size-2.5 rounded-full" />
            All clients
            {!current && <Check className="text-primary ml-auto size-4" />}
          </DropdownMenuItem>
        )}
        <div className="max-h-72 overflow-y-auto">
          {shown.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => select(c.id)}>
              <ClientDot color={c.color} />
              <span className="truncate">{c.name}</span>
              {current === c.id && (
                <Check className="text-primary ml-auto size-4" />
              )}
            </DropdownMenuItem>
          ))}
          {shown.length === 0 && (
            <div className="text-muted-foreground px-2 py-3 text-center text-xs">
              No client matches “{query}”.
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
