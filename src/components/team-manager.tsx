"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import type { Role } from "@prisma/client";
import {
  getInviteLink,
  inviteMember,
  removeMember,
  resendInvite,
  revokeInvite,
  updateMemberRole,
} from "@/lib/actions";
import { unwrap } from "@/lib/action-result";
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
import { Link2, Mail, RotateCw, UserPlus, X } from "lucide-react";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  lastSeenAt: string | null;
}

interface PendingInvite {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  /** Worked out on the server, so rendering stays pure. */
  expired: boolean;
  lastSentAt: string | null;
  invitedBy: string | null;
}

// value -> label so the Select trigger shows "Manager"/"Admin", not the raw enum.
const ROLE_LABELS: Record<Role, string> = { MANAGER: "Manager", ADMIN: "Admin" };

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Invite link copied");
  } catch {
    toast.error("Couldn't copy. Here it is: " + text);
  }
}

export function TeamManager({
  members,
  invites,
  currentUserId,
  isAdmin,
}: {
  members: Member[];
  invites: PendingInvite[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MANAGER");
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  function run(fn: () => Promise<void>, ok?: string) {
    const t = toast.loading("Saving…");
    startTransition(async () => {
      try {
        await fn();
        if (ok) toast.success(ok, { id: t });
        else toast.dismiss(t);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed", { id: t });
      }
    });
  }

  function invite() {
    const address = email.trim();
    if (!address) return toast.error("Enter an email");
    run(async () => {
      const { link, emailed } = unwrap(await inviteMember({ email: address, role }));
      setEmail("");
      setRole("MANAGER");
      if (emailed) {
        toast.success(`Invite emailed to ${address}`, {
          action: { label: "Copy link", onClick: () => void copy(link) },
        });
      } else {
        toast.success(`Invite created for ${address}`, {
          description: "Email isn't set up yet, so share the link yourself.",
          action: { label: "Copy link", onClick: () => void copy(link) },
          duration: 15_000,
        });
      }
    });
  }

  // Managers can invite managers; admins choose either role.
  const roleChoices: Role[] = isAdmin ? ["MANAGER", "ADMIN"] : ["MANAGER"];

  return (
    <div className="space-y-5">
      <div className="bg-muted/40 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row">
        <Input
          type="email"
          aria-label="Teammate email address"
          placeholder="teammate@agency.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && invite()}
        />
        {isAdmin && (
          <Select value={role} items={ROLE_LABELS} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="sm:w-36" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleChoices.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button onClick={invite} disabled={pending}>
          <UserPlus className="size-4" /> Invite
        </Button>
      </div>

      <div className="divide-border divide-y rounded-xl border">
        {members.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
            <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full font-mono text-[0.625rem] font-semibold uppercase">
              {(u.name ?? u.email).slice(0, 2)}
            </span>
            <div className="min-w-36 flex-1">
              <div className="truncate font-medium">
                {u.name ?? u.email}
                {u.id === currentUserId && (
                  <span className="text-muted-foreground font-normal"> (you)</span>
                )}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {u.email}
                {u.id !== currentUserId && (
                  <span suppressHydrationWarning>
                    {" · "}
                    {u.lastSeenAt
                      ? `active ${formatDistanceToNowStrict(new Date(u.lastSeenAt), { addSuffix: true })}`
                      : "hasn't signed in yet"}
                  </span>
                )}
              </div>
            </div>

            {/* Role and remove wrap under the name on narrow screens. */}
            <div className="ml-auto flex items-center gap-2">
              {isAdmin ? (
                <Select
                  value={u.role}
                  items={ROLE_LABELS}
                  onValueChange={(v) =>
                    run(() => updateMemberRole(u.id, v as "ADMIN" | "MANAGER"), "Role updated")
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
                <span className="text-muted-foreground capitalize">{u.role.toLowerCase()}</span>
              )}

              {/* Keeps the role column aligned on your own row. */}
              {isAdmin && u.id === currentUserId && <span aria-hidden className="size-8 shrink-0" />}
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
          </div>
        ))}
      </div>

      {invites.length > 0 && (
        <div className="space-y-2">
          <p className="label-caps">Pending invites</p>
          <div className="divide-border divide-y rounded-xl border border-dashed">
            {invites.map((i) => {
              const expired = i.expired;
              const manageable = isAdmin || i.role === "MANAGER";
              return (
                <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
                  <span className="text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full border border-dashed">
                    <Mail className="size-3.5" />
                  </span>
                  <div className="min-w-36 flex-1">
                    <div className="truncate font-medium">{i.email}</div>
                    <div className="text-muted-foreground truncate text-xs" suppressHydrationWarning>
                      {ROLE_LABELS[i.role]}
                      {" · "}
                      {expired ? (
                        <span className="text-fault-ink">expired</span>
                      ) : (
                        `expires ${formatDistanceToNowStrict(new Date(i.expiresAt), { addSuffix: true })}`
                      )}
                      {i.invitedBy && ` · invited by ${i.invitedBy}`}
                    </div>
                  </div>
                  {manageable && (
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(async () => {
                            const { emailed } = unwrap(await resendInvite(i.id));
                            toast.success(
                              emailed ? `Invite sent again to ${i.email}` : "Invite renewed for 7 days. Share the link yourself.",
                            );
                          })
                        }
                      >
                        <RotateCw /> {expired ? "Renew" : "Resend"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            try {
                              await copy(unwrap(await getInviteLink(i.id)).link);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Couldn't get the link.");
                            }
                          })
                        }
                      >
                        <Link2 /> Copy link
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Revoke the invite for ${i.email}`}
                        className="hover:text-destructive"
                        disabled={pending}
                        onClick={() => run(async () => unwrap(await revokeInvite(i.id)), "Invite revoked")}
                      >
                        <X />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Admins manage the workspace, team and API keys. Managers create and schedule posts,
        and can invite other managers.
      </p>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.email}?</DialogTitle>
            <DialogDescription>
              They&apos;ll lose access to this workspace, and their API keys for it stop
              working. Their posts stay. You can invite them again later.
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
