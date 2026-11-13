"use client";

import { useState } from "react";
import type { Platform } from "@prisma/client";
import { Check, ChevronDown, ListFilter, Search, X } from "lucide-react";
import {
  PLATFORMS,
  STATUS_FILTERS,
  activeFilterCount,
  type CalendarFilters,
  type ClientOption,
  type StatusFilter,
} from "@/lib/calendar-shared";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ClientMonogram, PLATFORM_META, PlatformIcon, StatusDot } from "@/components/post-bits";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<StatusFilter, string> = {
  SCHEDULED: "SCHEDULED",
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
  APPROVAL: "PENDING",
};

const pill = (active: boolean) =>
  cn(
    "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
    active
      ? "bg-primary/10 border-primary/40 text-foreground"
      : "bg-card text-muted-foreground hover:text-foreground",
  );

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function FilterBar({
  filters,
  clients,
  scopeClient,
  onChange,
  onShowAllClients,
}: {
  filters: CalendarFilters;
  clients: ClientOption[];
  /** Set when the topbar switcher narrows the app to one client. */
  scopeClient?: ClientOption;
  onChange: (next: CalendarFilters) => void;
  onShowAllClients: () => void;
}) {
  const count = activeFilterCount({ ...filters, clients: scopeClient ? [] : filters.clients });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ListFilter className="text-muted-foreground size-4" aria-hidden />
      {scopeClient ? (
        <span className={pill(true)}>
          <ClientMonogram
            name={scopeClient.name}
            color={scopeClient.color}
            className="size-4 rounded text-[0.5rem]"
          />
          {scopeClient.name} only
          <button
            type="button"
            onClick={onShowAllClients}
            aria-label="Show all clients"
            className="text-muted-foreground hover:text-foreground -mr-1 ml-0.5 grid size-5 place-items-center rounded"
          >
            <X className="size-3" />
          </button>
        </span>
      ) : (
        <ClientPicker
          clients={clients}
          selected={filters.clients}
          onChange={(c) => onChange({ ...filters, clients: c })}
        />
      )}

      <div className="flex items-center gap-1" role="group" aria-label="Networks">
        {PLATFORMS.map((p: Platform) => {
          const active = filters.platforms.includes(p);
          return (
            <button
              key={p}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...filters, platforms: toggle(filters.platforms, p) })}
              className={pill(active)}
            >
              <PlatformIcon platform={p} brand={active} className="size-3.5" />
              <span className="hidden lg:inline">{PLATFORM_META[p].label}</span>
            </button>
          );
        })}
      </div>

      <Popover>
        <PopoverTrigger render={<button type="button" className={pill(filters.statuses.length > 0)} />}>
          {filters.statuses.length === 0
            ? "Any status"
            : filters.statuses.length === 1
              ? STATUS_FILTERS.find((s) => s.key === filters.statuses[0])?.label
              : `${filters.statuses.length} statuses`}
          <ChevronDown className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 gap-0.5 p-1.5">
          {STATUS_FILTERS.map((s) => {
            const on = filters.statuses.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onChange({ ...filters, statuses: toggle(filters.statuses, s.key) })}
                className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
              >
                <StatusDot status={STATUS_DOT[s.key]} />
                <span className="flex-1">{s.label}</span>
                {on && <Check className="text-primary size-4" />}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      {count > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({ clients: scopeClient ? filters.clients : [], platforms: [], statuses: [] })
          }
          className="text-muted-foreground"
        >
          Clear
          <span className="bg-primary text-primary-foreground grid size-4 place-items-center rounded-full font-mono text-[0.625rem]">
            {count}
          </span>
        </Button>
      )}
    </div>
  );
}

function ClientPicker({
  clients,
  selected,
  onChange,
}: {
  clients: ClientOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const chosen = clients.filter((c) => selected.includes(c.id));
  const shown = q.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    : clients;
  return (
    <Popover onOpenChange={(open) => !open && setQ("")}>
      <PopoverTrigger render={<button type="button" className={pill(selected.length > 0)} />}>
        {chosen.length === 0 ? (
          "All clients"
        ) : (
          <>
            <span className="flex -space-x-1">
              {chosen.slice(0, 3).map((c) => (
                <ClientMonogram
                  key={c.id}
                  name={c.name}
                  color={c.color}
                  className="ring-card size-4 rounded text-[0.5rem] ring-1"
                />
              ))}
            </span>
            {chosen.length === 1 ? chosen[0].name : `${chosen.length} clients`}
          </>
        )}
        <ChevronDown className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-1 p-1.5">
        {clients.length > 8 && (
          <label className="flex items-center gap-2 rounded-md border px-2">
            <Search className="text-muted-foreground size-3.5" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a client"
              className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => onChange([])}
          className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
        >
          <span className="flex-1">All clients</span>
          {selected.length === 0 && <Check className="text-primary size-4" />}
        </button>
        <div className="max-h-72 overflow-y-auto">
          {shown.map((c) => {
            const on = selected.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onChange(toggle(selected, c.id))}
                className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
              >
                <ClientMonogram name={c.name} color={c.color} className="size-5 rounded text-[0.5625rem]" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {on && <Check className="text-primary size-4" />}
              </button>
            );
          })}
          {shown.length === 0 && (
            <p className="text-muted-foreground px-2 py-3 text-center text-xs">No client matches.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
