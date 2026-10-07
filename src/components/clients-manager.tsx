"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import type { Platform } from "@prisma/client";
import {
  createClient,
  updateClient,
  deleteClient,
  disconnectAccount,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ClientMonogram,
  PlatformIcon,
  PLATFORM_META,
} from "@/components/post-bits";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import {
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Unplug,
} from "lucide-react";

interface AccountLite {
  id: string;
  platform: Platform;
  displayName: string;
  tokenExpires: string | null;
  renewable: boolean;
}
interface ClientLite {
  id: string;
  name: string;
  color: string | null;
  postCount: number;
  accounts: AccountLite[];
}

type ConfirmState = {
  title: string;
  body: string;
  action: string;
  run: () => Promise<void>;
} | null;

// Friendly messages for the ?error= codes the OAuth connect routes redirect with.
const CONNECT_ERRORS: Record<string, string> = {
  not_your_client: "That client isn't in your workspace.",
  linkedin_not_configured: "LinkedIn isn't set up on the server yet.",
  instagram_not_configured: "Instagram isn't set up on the server yet.",
  linkedin_denied: "LinkedIn connection was cancelled.",
  instagram_denied: "Instagram connection was cancelled.",
  linkedin_token: "LinkedIn didn't return a valid token. Please try again.",
  instagram_token:
    "Instagram couldn't be connected. It must be a Business or Creator account.",
  linkedin_profile: "Couldn't read that LinkedIn profile. Please try again.",
  instagram_profile:
    "Couldn't read that Instagram profile. It must be a Business or Creator account.",
  youtube_not_configured: "YouTube isn't set up on the server yet.",
  youtube_denied: "YouTube connection was cancelled.",
  youtube_token: "YouTube (Google) didn't return a valid token. Please try again.",
  youtube_profile: "Couldn't read that Google account. Please try again.",
};

// Distinct, mid-saturation brand colours that read on both themes.
const SWATCHES = [
  "#196bf5",
  "#7c4dff",
  "#d6409f",
  "#e5484d",
  "#f2701f",
  "#f2a01f",
  "#2f9e5b",
  "#14a39a",
  "#0e8ac7",
  "#23395b",
  "#8b5e3c",
  "#5b6070",
];

const CONNECTABLE: Platform[] = ["LINKEDIN", "INSTAGRAM", "YOUTUBE"];
const CONNECT_HINT: Record<Platform, string> = {
  LINKEDIN: "Personal profile",
  INSTAGRAM: "Business or Creator account",
  YOUTUBE: "YouTube channel",
};

/** Health of a connected account based on its token expiry. */
function tokenHealth(account: AccountLite): {
  tone: "ok" | "warn" | "bad";
  label: string;
} {
  // Google access tokens last an hour and are renewed at publish time, so for
  // YouTube only the refresh token matters - and it's dropped once Google
  // rejects it (see ensureFreshAccessToken).
  if (account.platform === "YOUTUBE") {
    return account.renewable
      ? { tone: "ok", label: "Connected" }
      : { tone: "bad", label: "Reconnect needed" };
  }
  if (!account.tokenExpires) return { tone: "ok", label: "Connected" };
  const ms = new Date(account.tokenExpires).getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  if (ms <= 0) return { tone: "bad", label: "Expired" };
  if (days <= 7) return { tone: "warn", label: `Expires in ${days}d` };
  return { tone: "ok", label: `Valid ${days}d` };
}

const TONE = {
  ok: "text-live-ink",
  warn: "text-standby-ink",
  bad: "text-fault-ink",
};
const DOT = { ok: "text-live", warn: "text-standby", bad: "text-fault" };

export function ClientsManager({ clients }: { clients: ClientLite[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");

  // Add / edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);

  // Shared confirm dialog (delete client / disconnect account)
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  // Surface the OAuth connect result once, then strip the query so it doesn't
  // re-fire on refresh. Read from window to avoid a Suspense boundary.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;
    if (connected) {
      const label =
        connected === "instagram"
          ? "Instagram"
          : connected === "youtube"
            ? "YouTube"
            : "LinkedIn";
      toast.success(`${label} account connected`);
    } else if (error) {
      toast.error(CONNECT_ERRORS[error] ?? "Couldn't connect the account.");
    }
    window.history.replaceState(null, "", "/clients");
  }, []);

  function openAdd() {
    setEditingId(null);
    setName("");
    // Suggest the next unused swatch so new clients stay distinguishable.
    const used = new Set(clients.map((c) => c.color?.toLowerCase()));
    setColor(SWATCHES.find((s) => !used.has(s)) ?? SWATCHES[0]);
    setFormOpen(true);
  }
  function openEdit(c: ClientLite) {
    setEditingId(c.id);
    setName(c.name);
    setColor(c.color ?? SWATCHES[0]);
    setFormOpen(true);
  }

  function saveClient() {
    if (!name.trim()) return toast.error("Enter a name");
    const t = toast.loading(editingId ? "Saving…" : "Adding client…");
    startTransition(async () => {
      try {
        if (editingId) {
          await updateClient(editingId, { name, color });
          toast.success("Client updated", { id: t });
        } else {
          await createClient({ name, color });
          toast.success("Client added", { id: t });
        }
        setFormOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed", { id: t });
      }
    });
  }

  function runConfirm() {
    if (!confirm) return;
    const t = toast.loading(`${confirm.action}…`);
    startTransition(async () => {
      try {
        await confirm.run();
        toast.success("Done", { id: t });
        setConfirm(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed", { id: t });
      }
    });
  }

  function connect(clientId: string, platform: Platform) {
    window.location.assign(
      `/api/oauth/${platform.toLowerCase()}/start?clientId=${clientId}`,
    );
  }

  const accountCount = clients.reduce((n, c) => n + c.accounts.length, 0);
  const q = query.trim().toLowerCase();
  const shown = q
    ? clients.filter((c) => c.name.toLowerCase().includes(q))
    : clients;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        eyebrow={
          <>
            Clients
            <span className="text-border">/</span>
            {clients.length} client{clients.length === 1 ? "" : "s"}
            <span className="text-border">/</span>
            {accountCount} account{accountCount === 1 ? "" : "s"}
          </>
        }
        title={
          <>
            Your <em>roster.</em>
          </>
        }
        description="Each client keeps its own accounts, colour, queue and calendar, so nothing is ever posted to the wrong brand."
        actions={
          <Button onClick={openAdd}>
            <Plus /> Add client
          </Button>
        }
      />

      {clients.length > 6 && (
        <div className="relative w-full sm:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a client"
            aria-label="Find a client"
            className="pl-9"
          />
        </div>
      )}

      {clients.length === 0 ? (
        <div className="bg-card relative overflow-hidden rounded-2xl border px-6 py-20 text-center">
          <div
            aria-hidden
            className="bg-grid pointer-events-none absolute inset-0 mask-[radial-gradient(ellipse_at_center,black,transparent_70%)]"
          />
          <div className="relative mx-auto flex w-fit -space-x-2">
            {SWATCHES.slice(0, 4).map((s, i) => (
              <span
                key={s}
                className="ring-card size-10 rounded-xl ring-4"
                style={{ backgroundColor: s, transform: `rotate(${(i - 1.5) * 6}deg)` }}
              />
            ))}
          </div>
          <p className="headline relative mt-6 text-3xl">
            Add your first <em>client.</em>
          </p>
          <p className="text-muted-foreground relative mx-auto mt-2 max-w-sm text-sm">
            Give them a name and a colour, then connect their LinkedIn,
            Instagram or YouTube.
          </p>
          <Button onClick={openAdd} className="relative mt-6">
            <Plus /> Add client
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {shown.map((c) => {
              const connected = new Set(c.accounts.map((a) => a.platform));
              return (
                <motion.article
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="bg-card group/card relative flex flex-col overflow-hidden rounded-2xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.04)]"
                >
                  {/* Brand wash */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-80"
                    style={{
                      background: `linear-gradient(180deg, color-mix(in oklch, ${c.color ?? "var(--primary)"} 14%, transparent), transparent)`,
                    }}
                  />
                  <div className="relative flex items-start gap-3 p-5 pb-4">
                    <ClientMonogram name={c.name} color={c.color} className="size-11 rounded-xl text-sm" />
                    <div className="min-w-0 flex-1 pt-0.5">
                      <h2 className="truncate text-[0.9375rem] font-semibold tracking-tight">
                        {c.name}
                      </h2>
                      <p className="text-muted-foreground font-mono text-[0.6875rem] tracking-wide uppercase">
                        {c.postCount} post{c.postCount === 1 ? "" : "s"} ·{" "}
                        {c.accounts.length} account{c.accounts.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${c.name}`}
                            className="-mt-1 -mr-1"
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => openEdit(c)}>
                          <Pencil /> Edit client
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            setConfirm({
                              title: `Delete ${c.name}?`,
                              body: "This permanently removes the client, its connected accounts, and all its posts.",
                              action: "Delete client",
                              run: () => deleteClient(c.id),
                            })
                          }
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="relative flex-1 px-5">
                    {c.accounts.length === 0 ? (
                      <div className="text-muted-foreground rounded-xl border border-dashed px-4 py-4 text-center text-xs">
                        No accounts yet. Connect one below.
                      </div>
                    ) : (
                      <ul className="divide-border divide-y rounded-xl border">
                        {c.accounts.map((a) => {
                          const h = tokenHealth(a);
                          return (
                            <li
                              key={a.id}
                              className="group/acct flex items-center gap-3 px-3 py-2.5"
                            >
                              <PlatformIcon platform={a.platform} brand className="size-4" />
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {a.displayName}
                              </span>
                              <span
                                className={cn(
                                  "flex shrink-0 items-center gap-1.5 text-[0.6875rem] font-medium",
                                  TONE[h.tone],
                                )}
                              >
                                <span
                                  className={cn("tally size-1.5", DOT[h.tone])}
                                  data-live={h.tone !== "ok" ? "true" : undefined}
                                />
                                {h.label}
                              </span>
                              <button
                                type="button"
                                aria-label={`Disconnect ${a.displayName}`}
                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 -my-1 grid size-7 place-items-center rounded-md transition-all sm:opacity-0 sm:group-hover/acct:opacity-100 sm:focus-visible:opacity-100"
                                onClick={() =>
                                  setConfirm({
                                    title: `Disconnect ${a.displayName}?`,
                                    body: "Cue will no longer be able to publish to this account until it's reconnected.",
                                    action: "Disconnect",
                                    run: () => disconnectAccount(a.id),
                                  })
                                }
                              >
                                <Unplug className="size-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="relative mt-4 flex items-center gap-2 border-t px-5 py-3">
                    <span className="label-caps mr-auto">
                      {c.accounts.length ? "Add account" : "Connect"}
                    </span>
                    {CONNECTABLE.map((p) => (
                      <Tooltip key={p}>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => connect(c.id, p)}
                              aria-label={`Connect ${PLATFORM_META[p].label} for ${c.name}`}
                              className="relative w-11 gap-1 px-0"
                            />
                          }
                        >
                          <PlatformIcon platform={p} brand className="size-3.5" />
                          <Plus className="text-muted-foreground size-3" />
                        </TooltipTrigger>
                        <TooltipContent>
                          {connected.has(p)
                            ? `Add another ${PLATFORM_META[p].label} account`
                            : CONNECT_HINT[p]}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
          {q && shown.length === 0 && (
            <p className="text-muted-foreground col-span-full py-10 text-center text-sm">
              No client matches &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit client" : "Add a client"}</DialogTitle>
            <DialogDescription>
              The colour tags this client across the calendar, queue and
              dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4 rounded-xl border p-4">
            <ClientMonogram
              name={name.trim() || "New client"}
              color={color}
              className="size-12 rounded-xl text-sm transition-colors"
            />
            <div className="min-w-0">
              <div className="truncate font-semibold">
                {name.trim() || "New client"}
              </div>
              <div className="text-muted-foreground font-mono text-xs uppercase">
                {color}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="client-name" className="label-caps block">
              Name
            </label>
            <Input
              id="client-name"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveClient()}
              placeholder="Acme Co."
            />
          </div>
          <div className="space-y-2">
            <span className="label-caps block">Colour</span>
            <div className="flex flex-wrap items-center gap-2">
              {SWATCHES.map((s) => {
                const on = color.toLowerCase() === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setColor(s)}
                    aria-label={`Use colour ${s}`}
                    aria-pressed={on}
                    className={cn(
                      "grid size-8 place-items-center rounded-lg transition-transform outline-none hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/40",
                      on && "ring-foreground ring-offset-background ring-2 ring-offset-2",
                    )}
                    style={{ backgroundColor: s }}
                  >
                    {on && <Check className="size-4 text-white" strokeWidth={3} />}
                  </button>
                );
              })}
              <label
                className="text-muted-foreground hover:text-foreground relative grid size-8 cursor-pointer place-items-center rounded-lg border border-dashed transition-colors"
                title="Custom colour"
              >
                <Plus className="size-4" />
                <input
                  type="color"
                  aria-label="Custom colour"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveClient} disabled={pending}>
              {editingId ? "Save changes" : "Add client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shared confirm dialog */}
      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={runConfirm} disabled={pending}>
              {confirm?.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
