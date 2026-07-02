"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateProfile } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    startTransition(async () => {
      try {
        await updateProfile({ name: value.trim() });
        toast.success("Profile updated");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Display name</Label>
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your name"
          />
          <Button onClick={save} disabled={!dirty || pending}>
            Save
          </Button>
        </div>
      </div>
      <div className="text-sm">
        <div className="flex justify-between py-1">
          <span className="text-muted-foreground">Email</span>
          <span>{email}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-muted-foreground">Role</span>
          <span className="capitalize">{role.toLowerCase()}</span>
        </div>
      </div>
    </div>
  );
}
