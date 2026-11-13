"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Copy, Unplug } from "lucide-react";
import { disconnectApp } from "@/lib/connector/actions";
import { unwrap } from "@/lib/action-result";
import { Button } from "@/components/ui/button";

export interface ConnectedApp {
  id: string;
  name: string;
  host: string;
  createdAt: string;
  lastUsedAt: string | null;
  useCount: number;
}

/** Settings > Claude and ChatGPT: the address to paste, and apps connected as you. */
export function ConnectorSettings({ mcpUrl, apps }: { mcpUrl: string; apps: ConnectedApp[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Couldn't copy. Select it instead.");
    }
  };

  const disconnect = (app: ConnectedApp) => {
    setBusy(app.id);
    startTransition(async () => {
      try {
        unwrap(await disconnectApp(app.id));
        toast.success(`${app.name} disconnected`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't disconnect.");
      } finally {
        setBusy(null);
      }
    });
  };

  const command = `claude mcp add --transport http cue ${mcpUrl}`;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-sm font-medium">Connector address</div>
        <div className="flex gap-2">
          <code className="bg-muted/60 min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-xs leading-5">
            {mcpUrl}
          </code>
          <Button variant="outline" size="sm" className="h-9" onClick={() => copy(mcpUrl, "Address")}>
            <Copy /> Copy
          </Button>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          In Claude or ChatGPT, add a custom connector and paste this address. You&apos;ll sign in to
          Cue and choose Allow, and the assistant can then draft, schedule and check posts as you.
          In Claude Code, run{" "}
          <button
            type="button"
            onClick={() => copy(command, "Command")}
            className="bg-muted hover:bg-muted/70 rounded px-1 py-0.5 font-mono text-[0.6875rem] break-all"
          >
            {command}
          </button>
          .
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Connected as you</div>
        {apps.length ? (
          <ul className="divide-y rounded-xl border">
            {apps.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{a.name}</div>
                  <div className="text-muted-foreground text-xs" suppressHydrationWarning>
                    via {a.host} · connected {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                    {a.lastUsedAt
                      ? ` · last used ${formatDistanceToNow(new Date(a.lastUsedAt), { addSuffix: true })}`
                      : " · not used yet"}
                  </div>
                </div>
                <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => disconnect(a)}>
                  <Unplug /> Disconnect
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-5 text-center text-sm">
            No apps connected yet.
          </p>
        )}
      </div>
    </div>
  );
}
