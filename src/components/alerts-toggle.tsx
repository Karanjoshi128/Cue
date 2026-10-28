"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setEmailAlerts } from "@/lib/actions";
import { unwrap } from "@/lib/action-result";
import { Switch } from "@/components/ui/switch";

/** Settings > Account: the alert emails an admin gets. */
export function AlertsToggle({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    setOn(next);
    startTransition(async () => {
      try {
        unwrap(await setEmailAlerts(next));
        toast.success(next ? "Alert emails on" : "Alert emails off");
      } catch (e) {
        setOn(!next);
        toast.error(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  return (
    <label className="flex items-start justify-between gap-4 border-t pt-5 text-sm">
      <span>
        <span className="font-medium">Email me alerts</span>
        <span className="text-muted-foreground block text-xs leading-relaxed">
          When a post fails for good, an account needs reconnecting, or an automation gets
          suddenly busy.
          {!configured && " Email isn't set up on this server yet, so none are sent."}
        </span>
      </span>
      <Switch checked={on} onCheckedChange={change} disabled={pending} className="mt-0.5" />
    </label>
  );
}
