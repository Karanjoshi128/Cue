"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, OctagonX, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRun } from "@/components/admin/admin-controls";
import { cancelCampaign, deleteCampaign, duplicateCampaign, unscheduleCampaign } from "@/lib/mailer/actions";

type Status = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";

function Confirm({
  open,
  setOpen,
  title,
  body,
  action,
  label,
  pending,
  destructive,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  title: string;
  body: string;
  action: () => void;
  label: string;
  pending: boolean;
  destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Keep it
          </Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={pending} onClick={action}>
            {pending && <Loader2 className="animate-spin" />}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CampaignActions({ id, status, sent }: { id: string; status: Status; sent: number }) {
  const router = useRouter();
  const { pending, run } = useRun();
  const [dup, startDup] = useTransition();
  const [open, setOpen] = useState<null | "cancel" | "delete" | "unschedule">(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "SENDING" && (
        <Button size="sm" variant="destructive" onClick={() => setOpen("cancel")}>
          <OctagonX /> Stop sending
        </Button>
      )}
      {status === "SCHEDULED" && (
        <Button size="sm" variant="outline" onClick={() => setOpen("unschedule")}>
          <Pencil /> Unschedule and edit
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={dup}
        onClick={() =>
          startDup(async () => {
            const r = await duplicateCampaign(id);
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.message);
            router.push(`/admin/mailer/campaigns/${r.id}`);
          })
        }
      >
        {dup ? <Loader2 className="animate-spin" /> : <Copy />} Duplicate
      </Button>
      {status !== "SENDING" && status !== "SCHEDULED" && (
        <Button size="sm" variant="ghost" onClick={() => setOpen("delete")}>
          <Trash2 /> Delete
        </Button>
      )}

      <Confirm
        open={open === "cancel"}
        setOpen={(o) => setOpen(o ? "cancel" : null)}
        title="Stop sending?"
        body={`Nobody else gets it. ${sent} already sent stay sent. You can't restart it, but you can duplicate it.`}
        label="Stop sending"
        destructive
        pending={pending}
        action={() => run(() => cancelCampaign(id), () => setOpen(null))}
      />
      <Confirm
        open={open === "unschedule"}
        setOpen={(o) => setOpen(o ? "unschedule" : null)}
        title="Unschedule it?"
        body="It goes back to being a draft and won't be sent until you schedule or send it again."
        label="Unschedule"
        pending={pending}
        action={() => run(() => unscheduleCampaign(id), () => setOpen(null))}
      />
      <Confirm
        open={open === "delete"}
        setOpen={(o) => setOpen(o ? "delete" : null)}
        title="Delete this campaign?"
        body="Its log of who got it is deleted too. This can't be undone."
        label="Delete"
        destructive
        pending={pending}
        action={() => run(() => deleteCampaign(id), () => router.replace("/admin/mailer"))}
      />
    </div>
  );
}

/** Refreshes the page every few seconds while a campaign is sending, so the numbers move. */
export function LiveRefresh({ every = 5000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
