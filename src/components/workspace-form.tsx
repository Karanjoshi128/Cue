"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { renameWorkspace } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function WorkspaceForm({
  name,
  isAdmin,
}: {
  name: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  const dirty = value.trim() !== name && value.trim().length > 0;

  function save() {
    const t = toast.loading("Saving…");
    startTransition(async () => {
      try {
        await renameWorkspace(value.trim());
        toast.success("Workspace renamed", { id: t });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save", {
          id: t,
        });
      }
    });
  }

  if (!isAdmin) {
    return (
      <div className="text-sm">
        <div className="flex justify-between py-1">
          <span className="text-muted-foreground">Name</span>
          <span>{name}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Workspace name</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Workspace name"
          maxLength={60}
        />
        <Button onClick={save} disabled={!dirty || pending}>
          Save
        </Button>
      </div>
    </div>
  );
}
