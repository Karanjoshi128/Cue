"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelLinkedInPages, connectLinkedInPages } from "@/lib/linkedin-page-actions";
import { unwrap } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientMonogram, PlatformIcon } from "@/components/post-bits";
import { PageHeader } from "@/components/page-header";

const SKIP = "skip";

interface PickerPage {
  id: string;
  name: string;
  /** Clients this Page is already connected to. */
  connectedTo: string[];
  /** Preselected client id, or null for "Don't connect". */
  suggested: string | null;
}

export function LinkedInPagePicker({
  pages,
  clients,
}: {
  pages: PickerPage[];
  clients: { id: string; name: string; color: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(pages.map((p) => [p.id, p.suggested ?? SKIP])),
  );

  const items: Record<string, string> = {
    [SKIP]: "Don't connect",
    ...Object.fromEntries(clients.map((c) => [c.id, c.name])),
  };
  const chosen = pages.filter((p) => choice[p.id] !== SKIP);

  function connect() {
    const t = toast.loading("Connecting…");
    startTransition(async () => {
      try {
        const { connected } = unwrap(
          await connectLinkedInPages(
            chosen.map((p) => ({ pageId: p.id, clientId: choice[p.id] })),
          ),
        );
        toast.dismiss(t);
        router.push(`/clients?connected=linkedin_page&count=${connected}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't connect.", { id: t });
      }
    });
  }

  function cancel() {
    startTransition(async () => {
      await cancelLinkedInPages();
      router.push("/clients");
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        eyebrow={
          <>
            Clients
            <span className="text-border">/</span>
            LinkedIn Pages
          </>
        }
        title={
          <>
            Match your <em>Pages.</em>
          </>
        }
        description="These are the LinkedIn Pages you can post to. Choose the client each one belongs to. Pages left on “Don't connect” are ignored, and you can come back to add them later."
      />

      <ul className="divide-border bg-card divide-y rounded-2xl border">
        {pages.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5"
          >
            <PlatformIcon platform="LINKEDIN" brand className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="text-muted-foreground truncate text-xs">
                {p.connectedTo.length
                  ? `Connected to ${p.connectedTo.join(", ")}`
                  : `Page ID ${p.id}`}
              </p>
            </div>
            <Select
              value={choice[p.id]}
              items={items}
              onValueChange={(v) =>
                setChoice((prev) => ({ ...prev, [p.id]: String(v) }))
              }
            >
              <SelectTrigger
                className="w-full sm:w-56"
                disabled={pending}
                aria-label={`Client for ${p.name}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SKIP}>Don&apos;t connect</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <ClientMonogram name={c.name} color={c.color} className="size-5 text-[0.5625rem]" />
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={cancel} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={connect} disabled={pending || chosen.length === 0}>
          {chosen.length === 0
            ? "Choose a client"
            : `Connect ${chosen.length} Page${chosen.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
