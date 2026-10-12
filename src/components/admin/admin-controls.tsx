"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AdminResult } from "@/lib/admin-actions";
import {
  adminRetestStorage,
  clearAnnouncement,
  deleteWorkspace,
  setAnnouncement,
  setPublishingPaused,
  setUserRole,
  setWorkspaceFeature,
  setWorkspacePlan,
} from "@/lib/admin-actions";
import type { StorageTestResult } from "@/lib/storage-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Client controls for the admin panel. Each one calls a server action from
// src/lib/admin-actions.ts, shows its message, and refreshes the page.

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run(fn: () => Promise<AdminResult | undefined>, after?: () => void) {
    start(async () => {
      let res: AdminResult | undefined;
      try {
        res = await fn();
      } catch (e) {
        // A redirect from the action surfaces here as navigation, not an error.
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) return;
        toast.error("Couldn't reach Cue. Try again.");
        return;
      }
      if (res && !res.ok) {
        toast.error(res.error);
        return;
      }
      if (res?.message) toast.success(res.message);
      after?.();
      router.refresh();
    });
  }
  return { pending, run };
}

/**
 * A button that runs an admin action, after a confirmation dialog when the
 * action is risky. `reason` decides whether the dialog asks why (it goes in
 * the audit log).
 */
export function ActionButton({
  label,
  action,
  title,
  description,
  reason = "none",
  confirmLabel,
  destructive,
  variant = "outline",
  size = "sm",
  className,
}: {
  label: React.ReactNode;
  action: (reason: string) => Promise<AdminResult>;
  /** Present = confirm in a dialog first. */
  title?: string;
  description?: React.ReactNode;
  reason?: "required" | "optional" | "none";
  confirmLabel?: string;
  destructive?: boolean;
  variant?: "outline" | "default" | "ghost" | "destructive" | "ink";
  size?: "sm" | "default" | "xs";
  className?: string;
}) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  const needsDialog = !!title || reason !== "none";
  const reasonMissing = reason === "required" && why.trim().length < 3;

  function go() {
    run(() => action(why), () => {
      setOpen(false);
      setWhy("");
    });
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={pending}
        onClick={() => (needsDialog ? setOpen(true) : go())}
      >
        {pending && !needsDialog && <Loader2 className="animate-spin" />}
        {label}
      </Button>
      {needsDialog && (
        <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{title ?? (typeof label === "string" ? label : "Are you sure?")}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            {reason !== "none" && (
              <div className="space-y-1.5">
                <Label htmlFor="admin-reason">
                  Reason {reason === "optional" && <span className="text-muted-foreground font-normal">(optional)</span>}
                </Label>
                <Textarea
                  id="admin-reason"
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  placeholder="Recorded in the audit log"
                  maxLength={500}
                  rows={3}
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant={destructive ? "destructive" : "default"}
                onClick={go}
                disabled={pending || reasonMissing}
              >
                {pending && <Loader2 className="animate-spin" />}
                {confirmLabel ?? (typeof label === "string" ? label : "Confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

const PLAN_LABELS = { FREE: "Free", PRO: "Pro", AGENCY: "Agency", UNLIMITED: "Unlimited" };

export function PlanSelect({ workspaceId, plan }: { workspaceId: string; plan: keyof typeof PLAN_LABELS }) {
  const { pending, run } = useRun();
  return (
    <Select
      value={plan}
      items={PLAN_LABELS}
      onValueChange={(v) => run(() => setWorkspacePlan(workspaceId, String(v)))}
    >
      <SelectTrigger className="w-40" disabled={pending} aria-label="Plan">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(PLAN_LABELS) as (keyof typeof PLAN_LABELS)[]).map((p) => (
          <SelectItem key={p} value={p}>
            {PLAN_LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const ROLE_LABELS = { ADMIN: "Admin", MANAGER: "Manager" };

export function RoleSelect({ userId, role }: { userId: string; role: "ADMIN" | "MANAGER" }) {
  const { pending, run } = useRun();
  return (
    <Select value={role} items={ROLE_LABELS} onValueChange={(v) => run(() => setUserRole(userId, String(v)))}>
      <SelectTrigger size="sm" className="w-28" disabled={pending} aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ADMIN">Admin</SelectItem>
        <SelectItem value="MANAGER">Manager</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function FeatureSwitch({
  workspaceId,
  feature,
  enabled,
  label,
  description,
}: {
  workspaceId: string;
  feature: string;
  enabled: boolean;
  label: string;
  description: string;
}) {
  const { pending, run } = useRun();
  const fieldId = `feature-${feature}`;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <label htmlFor={fieldId} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-muted-foreground block text-xs">{description}</span>
      </label>
      <Switch
        id={fieldId}
        checked={enabled}
        disabled={pending}
        onCheckedChange={(on) => run(() => setWorkspaceFeature(workspaceId, feature, on))}
        aria-label={label}
      />
    </div>
  );
}

const CHECK_TITLES = {
  write: "Write a test file",
  public: "Read it from the public URL",
  cleanup: "Remove the test file",
} as const;

export function RetestStorageButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<StorageTestResult | { ok: false; checks: []; error: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await adminRetestStorage(workspaceId).catch(() => ({
              ok: false as const,
              checks: [] as [],
              error: "Couldn't reach Cue. Try again.",
            }));
            setResult(res);
            if (res.ok) toast.success("The bucket checks out");
            router.refresh();
          })
        }
      >
        {pending && <Loader2 className="animate-spin" />}
        Re-test
      </Button>
      {result && (
        <ul className="space-y-1 text-xs" aria-live="polite">
          {"error" in result && result.error && <li className="text-destructive">{result.error}</li>}
          {result.checks.map((c) => (
            <li key={c.id} className={cn(c.status === "fail" ? "text-destructive" : c.status === "warn" ? "text-standby-ink" : "text-muted-foreground")}>
              {c.status === "ok" ? "Passed" : c.status === "fail" ? "Failed" : c.status === "warn" ? "Warning" : "Skipped"}: {CHECK_TITLES[c.id]}
              {c.detail ? `. ${c.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DeleteWorkspaceButton({ workspaceId, name }: { workspaceId: string; name: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [why, setWhy] = useState("");
  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Delete workspace
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the workspace, its members, clients, connected accounts, posts and API
              keys, and the media it stored on Cue. Its members can sign in again afterwards and would start a
              new, empty workspace. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="confirm-name">Type the workspace name to confirm</Label>
              <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-reason">Reason</Label>
              <Textarea id="delete-reason" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Recorded in the audit log" rows={2} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending || typed.trim() !== name || why.trim().length < 3}
              onClick={() => run(() => deleteWorkspace(workspaceId, typed, why))}
            >
              {pending && <Loader2 className="animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PauseControl({ paused, reason }: { paused: boolean; reason: string | null }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{paused ? "Publishing is paused" : "Publishing is running"}</div>
          <p className="text-muted-foreground text-xs">
            {paused
              ? `Nothing goes out until you resume.${reason ? ` Reason: ${reason}` : ""}`
              : "Scheduled posts go out every 5 minutes. Pausing holds every workspace's posts, including Post now."}
          </p>
        </div>
        {paused ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => setPublishingPaused(false))}>
            {pending && <Loader2 className="animate-spin" />}
            Resume publishing
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={() => setOpen(true)}>
            Pause publishing
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause publishing everywhere?</DialogTitle>
            <DialogDescription>
              No workspace&apos;s posts go out while paused, and Post now is refused. Everyone sees a notice.
              When you resume, overdue posts go out on the next run.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pause-reason">Reason</Label>
            <Textarea id="pause-reason" value={why} onChange={(e) => setWhy(e.target.value)} rows={2} maxLength={500} placeholder="Shown in the audit log" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending || why.trim().length < 3}
              onClick={() => run(() => setPublishingPaused(true, why), () => setOpen(false))}
            >
              {pending && <Loader2 className="animate-spin" />}
              Pause
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AnnouncementControl({
  current,
  tone,
}: {
  current: string | null;
  tone: "info" | "warning";
}) {
  const { pending, run } = useRun();
  const [text, setText] = useState(current ?? "");
  const [t, setT] = useState<"info" | "warning">(tone);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="announcement">Message</Label>
        <Textarea
          id="announcement"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="e.g. Instagram is having an outage; posts may go out late."
        />
        <p className="text-muted-foreground text-xs">{text.length}/280 · Shown at the top of the app for every signed-in user until you remove it.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={t} items={{ info: "Info", warning: "Warning" }} onValueChange={(v) => setT(v as "info" | "warning")}>
          <SelectTrigger size="sm" className="w-32" aria-label="Tone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" disabled={pending || text.trim().length < 3} onClick={() => run(() => setAnnouncement(text, t))}>
          {pending && <Loader2 className="animate-spin" />}
          {current ? "Update banner" : "Publish banner"}
        </Button>
        {current && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => clearAnnouncement(), () => setText(""))}>
            Remove banner
          </Button>
        )}
      </div>
    </div>
  );
}
