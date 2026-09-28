"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { createApiKey, revokeApiKey } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, KeyRound } from "lucide-react";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string;
}

export function ApiKeysManager({ keys }: { keys: ApiKeyRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  // The plaintext key, held only while its one-time dialog is open.
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  function create() {
    if (!name.trim()) return toast.error("Give the key a name");
    const t = toast.loading("Creating key…");
    startTransition(async () => {
      try {
        const { key } = await createApiKey(name.trim());
        setNewKey(key);
        setName("");
        toast.success("API key created", { id: t });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create key", {
          id: t,
        });
      }
    });
  }

  function revoke(key: ApiKeyRow) {
    const t = toast.loading("Revoking…");
    startTransition(async () => {
      try {
        await revokeApiKey(key.id);
        setRevokeTarget(null);
        toast.success(`Revoked "${key.name}"`, { id: t });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to revoke", {
          id: t,
        });
      }
    });
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy - select the key and copy it manually");
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Keys let scripts and automations create and schedule posts in this
        workspace through the API. A key acts as the admin who created it.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Key name, e.g. YouTube Shorts pipeline"
          maxLength={60}
        />
        <Button onClick={create} disabled={pending} className="shrink-0">
          <KeyRound className="size-4" /> Create key
        </Button>
      </div>

      {keys.length === 0 ? (
        <p className="text-muted-foreground py-2 text-sm">No API keys yet.</p>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {keys.map((k) => {
            const revoked = Boolean(k.revokedAt);
            return (
              <li
                key={k.id}
                className="flex flex-wrap items-center gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{k.name}</span>
                    {revoked ? (
                      <Badge variant="outline">Revoked</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </div>
                  {/* Timestamps render in the viewer's timezone, which the
                      server can't know - so the SSR text may differ. */}
                  <div
                    className="text-muted-foreground text-xs"
                    suppressHydrationWarning
                  >
                    <code className="font-mono">{k.prefix}…</code> · created{" "}
                    {format(new Date(k.createdAt), "MMM d, yyyy")} by{" "}
                    {k.createdBy} ·{" "}
                    {k.lastUsedAt
                      ? `last used ${formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })}`
                      : "never used"}
                  </div>
                </div>
                {!revoked && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => setRevokeTarget(k)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* One-time reveal of a new key. */}
      <Dialog
        open={newKey !== null}
        onOpenChange={(open) => !open && setNewKey(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your API key</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            This is the only time the full key is shown. Cue stores only a hash
            of it, so if you lose it, revoke it and create a new one.
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={newKey ?? ""}
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="outline"
              onClick={() => newKey && copy(newKey)}
              aria-label="Copy API key"
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>I&apos;ve saved it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation. */}
      <Dialog
        open={revokeTarget !== null}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke &ldquo;{revokeTarget?.name}&rdquo;?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Anything using this key stops working immediately. This can&apos;t
            be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => revokeTarget && revoke(revokeTarget)}
            >
              Revoke key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
