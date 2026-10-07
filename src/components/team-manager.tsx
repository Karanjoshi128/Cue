"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Role } from "@prisma/client";
import {
  inviteMember,
  updateMemberRole,
  removeMember,
} from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { UserPlus, X } from "lucide-react";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: Role;
}

// value -> label so the Select trigger shows "Manager"/"Admin", not the raw enum.
const ROLE_LABELS: Record<Role, string> = { MANAGER: "Manager", ADMIN: "Admin" };

export function TeamManager({
  members,
  currentUserId,
  isAdmin,
}: {
  members: Member[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MANAGER");
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  function run(fn: () => Promise<void>, ok: string) {
    const t = toast.loading("Saving…");
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok, { id: t });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed", { id: t });
      }
    });
  }

  function invite() {
    if (!email.trim()) return toast.error("Enter an email");
    run(async () => {
      await inviteMember({ email: email.trim(), role });
      setEmail("");
      setRole("MANAGER");
    }, "Invite added");
  }

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="bg-muted/40 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row">
          <Input
            type="email"
            aria-label="Teammate email address"
            placeholder="teammate@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && invite()}
          />
          <Select
            value={role}
            items={ROLE_LABELS}
            onValueChange={(v) => setRole(v as Role)}
          >
            <SelectTrigger className="sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MANAGER">Manager</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={invite} disabled={pending}>
            <UserPlus className="size-4" /> Invite
          </Button>
        </div>
      )}

      <div className="divide-border divide-y rounded-xl border">
        {members.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full font-mono text-[0.625rem] font-semibold uppercase">
              {(u.name ?? u.email).slice(0, 2)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {u.name ?? u.email}
                {u.id === currentUserId && (
                  <span className="text-muted-foreground font-normal"> (you)</span>
                )}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {u.email}
              </div>
            </div>

            {isAdmin ? (
              <Select
                value={u.role}
                items={ROLE_LABELS}
                onValueChange={(v) =>
                  run(
                    () => updateMemberRole(u.id, v as "ADMIN" | "MANAGER"),
                    "Role updated",
                  )
                }
              >
                <SelectTrigger className="w-32" disabled={pending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span className="text-muted-foreground capitalize">
                {u.role.toLowerCase()}
              </span>
            )}

            {/* Keeps the role column aligned on your own row. */}
            {isAdmin && u.id === currentUserId && (
              <span aria-hidden className="size-8 shrink-0" />
            )}
            {isAdmin && u.id !== currentUserId && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${u.email}`}
                className="hover:text-destructive"
                onClick={() => setRemoveTarget(u)}
              >
                <X />
              </Button>
            )}
          </div>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        Admins manage the workspace, team and API keys. Managers create and
        schedule posts.
      </p>

      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.email}?</DialogTitle>
            <DialogDescription>
              They&apos;ll lose access to Cue. You can invite them again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const id = removeTarget!.id;
                run(async () => {
                  await removeMember(id);
                  setRemoveTarget(null);
                }, "Member removed");
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
