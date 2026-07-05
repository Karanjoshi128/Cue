"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { Platform } from "@prisma/client";
import {
  createClient,
  updateClient,
  deleteClient,
  disconnectAccount,
} from "@/lib/actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlatformIcon, ClientDot } from "@/components/post-bits";
import { LinkedinIcon, InstagramIcon } from "@/components/platform-icons";
import {
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Unplug,
} from "lucide-react";

interface AccountLite {
  id: string;
  platform: Platform;
  displayName: string;
  tokenExpires: string | null;
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

/** Health of a connected account based on its token expiry. */
function tokenHealth(tokenExpires: string | null): {
  ok: boolean;
  label: string;
} {
  if (!tokenExpires) return { ok: true, label: "Connected" };
  const ms = new Date(tokenExpires).getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  if (ms <= 0) return { ok: false, label: "Expired" };
  if (days <= 7) return { ok: false, label: `Expires in ${days}d` };
  return { ok: true, label: `Expires in ${days}d` };
}

export function ClientsManager({ clients }: { clients: ClientLite[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Add / edit dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2A6FF2");

  // Shared confirm dialog (delete client / disconnect account)
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  function openAdd() {
    setEditingId(null);
    setName("");
    setColor("#2A6FF2");
    setFormOpen(true);
  }
  function openEdit(c: ClientLite) {
    setEditingId(c.id);
    setName(c.name);
    setColor(c.color ?? "#2A6FF2");
    setFormOpen(true);
  }

  function saveClient() {
    if (!name.trim()) return toast.error("Enter a name");
    startTransition(async () => {
      try {
        if (editingId) {
          await updateClient(editingId, { name, color });
          toast.success("Client updated");
        } else {
          await createClient({ name, color });
          toast.success("Client added");
        }
        setFormOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function runConfirm() {
    if (!confirm) return;
    startTransition(async () => {
      try {
        await confirm.run();
        toast.success("Done");
        setConfirm(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  }

  function connect(clientId: string, platform: "linkedin" | "instagram") {
    window.location.href = `/api/oauth/${platform}/start?clientId=${clientId}`;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Clients</h2>
        <Button onClick={openAdd}>
          <Plus className="size-4" /> Add client
        </Button>
      </div>

      {clients.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No clients yet. Add your first one to start scheduling.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {clients.map((c) => (
            <motion.div key={c.id} layout>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClientDot color={c.color} />
                    {c.name}
                    <span className="text-muted-foreground ml-auto text-xs font-normal">
                      {c.postCount} posts
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="text-muted-foreground hover:text-foreground -mr-1 outline-none"
                        aria-label="Client actions"
                      >
                        <MoreVertical className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(c)}>
                          <Pencil className="size-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() =>
                            setConfirm({
                              title: `Delete ${c.name}?`,
                              body: "This permanently removes the client, its connected accounts, and all its posts.",
                              action: "Delete client",
                              run: () => deleteClient(c.id),
                            })
                          }
                        >
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {c.accounts.length > 0 && (
                    <div className="space-y-1.5">
                      {c.accounts.map((a) => {
                        const health = tokenHealth(a.tokenExpires);
                        return (
                          <div
                            key={a.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <PlatformIcon platform={a.platform} />
                            <span className="text-muted-foreground">
                              {a.displayName}
                            </span>
                            <span
                              className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
                                health.ok
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                  : health.label === "Expired"
                                    ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                              }`}
                            >
                              {health.label}
                            </span>
                            <button
                              type="button"
                              aria-label={`Disconnect ${a.displayName}`}
                              className="text-muted-foreground hover:text-destructive"
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
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => connect(c.id, "linkedin")}
                    >
                      <LinkedinIcon className="size-4" /> LinkedIn
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => connect(c.id, "instagram")}
                    >
                      <InstagramIcon className="size-4" /> Instagram
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit client" : "Add a client"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Co."
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-16 rounded border"
              />
            </div>
          </div>
          <DialogFooter>
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
          </DialogHeader>
          <p className="text-muted-foreground text-sm">{confirm?.body}</p>
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
