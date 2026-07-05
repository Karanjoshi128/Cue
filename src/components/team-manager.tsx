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
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
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
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
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

      <div className="divide-border divide-y">
        {members.map((u) => (
          <div key={u.id} className="flex items-center gap-3 py-2 text-sm">
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

            {isAdmin && u.id !== currentUserId && (
              <button
                type="button"
                aria-label={`Remove ${u.email}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setRemoveTarget(u)}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        Invited teammates get access as soon as they sign in with that email.
        The first user is the admin.
      </p>

      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.email}?</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            They&apos;ll lose access to Cue. You can invite them again later.
          </p>
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
