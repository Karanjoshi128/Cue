"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateProfile } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProfileForm({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  const dirty = value.trim() !== name && value.trim().length > 0;

  function save() {
    const t = toast.loading("Saving…");
    startTransition(async () => {
      try {
        await updateProfile({ name: value.trim() });
        toast.success("Profile updated", { id: t });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save", {
          id: t,
        });
      }
    });
  }

  const initials = (value.trim() || email.split("@")[0])
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span className="bg-foreground text-background grid size-12 shrink-0 place-items-center rounded-xl font-mono text-sm font-semibold tracking-wider">
          {initials}
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold">{name || "No name set"}</div>
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <span className="truncate">{email}</span>
            <span className="bg-muted text-foreground shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium capitalize">
              {role.toLowerCase()}
            </span>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="display-name" className="label-caps block">
          Display name
        </label>
        <div className="flex gap-2">
          <Input
            id="display-name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && dirty && save()}
            placeholder="Your name"
            className="max-w-sm"
          />
          <Button onClick={save} disabled={!dirty || pending}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
