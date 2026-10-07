"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Command } from "cmdk";
import {
  AlertTriangle,
  CalendarClock,
  CornerDownLeft,
  FileText,
  LogOut,
  Moon,
  Plus,
  Search,
  Sun,
  UserPlus,
} from "lucide-react";
import { navItems } from "@/components/nav-items";
import { ClientDot } from "@/components/post-bits";
import { Kbd } from "@/components/page-header";
import { writeClientScope, type ClientOption } from "@/components/client-switcher";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/** "⌘K" on Apple platforms, "Ctrl K" elsewhere; ⌘K during SSR. */
function useModKey() {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"),
    () => "⌘K",
  );
}

const itemClass =
  "flex h-10 cursor-default items-center gap-3 rounded-lg px-3 text-sm text-foreground/85 outline-none select-none data-[selected=true]:bg-accent data-[selected=true]:text-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

const groupClass =
  "px-1 pb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase";

/**
 * ⌘K palette plus the app's single-key shortcuts:
 *   ⌘K / Ctrl+K / "/"  open the palette
 *   N                  new post
 *   G then D/N/C/Q/L/S jump to a page
 */
export function CommandMenu({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const pendingG = useRef<number | null>(null);
  const modKey = useModKey();

  const run = useCallback((fn: () => void) => {
    setOpen(false);
    fn();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;

      const key = e.key.toLowerCase();
      if (pendingG.current) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const dest = navItems.find((i) => i.key === key);
        if (dest) {
          e.preventDefault();
          router.push(dest.href);
        }
        return;
      }
      if (key === "g") {
        pendingG.current = window.setTimeout(() => {
          pendingG.current = null;
        }, 900);
        return;
      }
      if (key === "/") {
        e.preventDefault();
        setOpen(true);
      } else if (key === "n") {
        e.preventDefault();
        router.push("/composer");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground bg-card hidden h-8 w-60 items-center gap-2 rounded-lg px-2.5 text-[0.8125rem] shadow-[0_0_0_1px_var(--border),0_1px_1px_0_rgb(0_0_0/0.03)] transition-colors outline-none hover:shadow-[0_0_0_1px_color-mix(in_oklch,var(--border),var(--foreground)_14%)] focus-visible:ring-3 focus-visible:ring-ring/30 md:flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <Kbd>{modKey}</Kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="hover:bg-accent grid size-9 place-items-center rounded-lg md:hidden"
      >
        <Search className="size-[1.1rem]" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="top-[14vh] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
        >
          <DialogTitle className="sr-only">Command menu</DialogTitle>
          <Command loop className="flex flex-col">
            <div className="flex items-center gap-3 border-b px-4">
              <Search className="text-muted-foreground size-4 shrink-0" />
              <Command.Input
                autoFocus
                placeholder="Search pages, clients and actions…"
                className="placeholder:text-muted-foreground h-13 w-full bg-transparent text-[0.9375rem] outline-none"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain py-1">
              <Command.Empty className="text-muted-foreground py-10 text-center text-sm">
                Nothing matches that.
              </Command.Empty>

              <Command.Group heading="Actions" className={groupClass}>
                <Command.Item
                  className={itemClass}
                  onSelect={() => run(() => router.push("/composer"))}
                >
                  <Plus /> New post
                  <Kbd className="ml-auto">N</Kbd>
                </Command.Item>
                <Command.Item
                  className={itemClass}
                  keywords={["schedule", "upcoming"]}
                  onSelect={() =>
                    run(() => router.push("/calendar?view=list"))
                  }
                >
                  <CalendarClock /> See what&apos;s scheduled
                </Command.Item>
                <Command.Item
                  className={itemClass}
                  keywords={["errors", "retry"]}
                  onSelect={() => run(() => router.push("/queue?status=FAILED"))}
                >
                  <AlertTriangle /> Show failed posts
                </Command.Item>
                <Command.Item
                  className={itemClass}
                  onSelect={() => run(() => router.push("/queue?status=DRAFT"))}
                >
                  <FileText /> Show drafts
                </Command.Item>
                <Command.Item
                  className={itemClass}
                  keywords={["connect", "account", "linkedin", "instagram", "youtube"]}
                  onSelect={() => run(() => router.push("/clients"))}
                >
                  <UserPlus /> Add or connect a client
                </Command.Item>
              </Command.Group>

              <Command.Group heading="Go to" className={groupClass}>
                {navItems.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={`Go to ${item.label}`}
                    className={itemClass}
                    onSelect={() => run(() => router.push(item.href))}
                  >
                    <item.icon /> {item.label}
                    <span className="ml-auto flex gap-1">
                      <Kbd>G</Kbd>
                      <Kbd>{item.key.toUpperCase()}</Kbd>
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>

              {clients.length > 0 && (
                <Command.Group heading="Focus on a client" className={groupClass}>
                  <Command.Item
                    value="All clients"
                    className={itemClass}
                    onSelect={() =>
                      run(() => {
                        writeClientScope("all");
                        router.refresh();
                      })
                    }
                  >
                    <span className="bg-muted-foreground/40 size-2.5 rounded-full" />
                    All clients
                  </Command.Item>
                  {clients.map((c, i) => (
                    <Command.Item
                      key={c.id}
                      // Match on the name only: ids are random letters that
                      // make every query fuzzy-match unrelated clients.
                      value={`${c.name}\u200b${i}`}
                      keywords={["client", "focus"]}
                      className={itemClass}
                      onSelect={() =>
                        run(() => {
                          writeClientScope(c.id);
                          router.refresh();
                        })
                      }
                    >
                      <ClientDot color={c.color} />
                      {c.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Preferences" className={groupClass}>
                <Command.Item
                  className={itemClass}
                  keywords={["dark", "light", "mode", "theme"]}
                  onSelect={() =>
                    run(() =>
                      setTheme(resolvedTheme === "dark" ? "light" : "dark"),
                    )
                  }
                >
                  {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                  Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
                </Command.Item>
                <Command.Item
                  className={cn(itemClass, "data-[selected=true]:text-destructive")}
                  keywords={["logout", "log out"]}
                  onSelect={() =>
                    run(() => {
                      window.location.href = "/logout";
                    })
                  }
                >
                  <LogOut /> Sign out
                </Command.Item>
              </Command.Group>
            </Command.List>
            <div className="text-muted-foreground bg-muted/40 flex items-center gap-4 border-t px-4 py-2.5 text-xs">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> to move
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>
                  <CornerDownLeft className="size-2.5" />
                </Kbd>{" "}
                to select
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
