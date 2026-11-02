"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { acceptInvite, declineInvite } from "@/lib/actions";
import { Button } from "@/components/ui/button";

/** Accept / Decline on the invite page, and the invite banner. */
export function InviteActions({
  token,
  workspaceName,
  compact = false,
}: {
  token: string;
  workspaceName: string;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [declined, setDeclined] = useState(false);

  function accept() {
    start(async () => {
      const res = await acceptInvite(token);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Welcome to ${workspaceName}`);
      // A hard navigation so the whole app re-reads the new workspace.
      window.location.href = "/dashboard";
    });
  }

  function decline() {
    start(async () => {
      const res = await declineInvite(token);
      if (!res.ok) return void toast.error(res.error);
      setDeclined(true);
      toast.success("Invitation declined");
      if (compact) window.location.reload();
    });
  }

  if (declined && !compact) {
    return (
      <p className="text-muted-foreground text-sm">
        You declined the invitation to {workspaceName}. You can close this page.
      </p>
    );
  }

  return compact ? (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={accept} disabled={pending}>
        Accept
      </Button>
      <Button size="sm" variant="ghost" onClick={decline} disabled={pending}>
        Decline
      </Button>
    </div>
  ) : (
    <div className="space-y-3">
      <Button size="xl" className="group w-full" onClick={accept} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Accept and join {workspaceName}
        {!pending && <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
      </Button>
      <Button variant="ghost" className="w-full" onClick={decline} disabled={pending}>
        Decline
      </Button>
    </div>
  );
}
