"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown } from "lucide-react";
import { ClientDot } from "@/components/post-bits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SCOPE_COOKIE } from "@/lib/scope";

interface ClientOption {
  id: string;
  name: string;
  color: string | null;
}

export function ClientSwitcher({
  clients,
  current,
}: {
  clients: ClientOption[];
  current?: string;
}) {
  const router = useRouter();
  const active = clients.find((c) => c.id === current);

  function select(id: string) {
    // 1-year cookie; read server-side to scope every data page.
    document.cookie = `${SCOPE_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none">
        {active ? (
          <ClientDot color={active.color} />
        ) : (
          <span className="bg-muted-foreground/40 size-2.5 rounded-full" />
        )}
        <span className="max-w-32 truncate font-medium">
          {active?.name ?? "All clients"}
        </span>
        <ChevronsUpDown className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onClick={() => select("all")}>
          <span className="bg-muted-foreground/40 size-2.5 rounded-full" />
          All clients
          {!current && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        {clients.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => select(c.id)}>
            <ClientDot color={c.color} />
            <span className="truncate">{c.name}</span>
            {current === c.id && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
