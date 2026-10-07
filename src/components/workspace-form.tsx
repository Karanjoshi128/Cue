"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { renameWorkspace } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    return <div className="font-medium">{name}</div>;
  }

  return (
    <div className="space-y-2">
      <label htmlFor="workspace-name" className="label-caps block">
        Workspace name
      </label>
      <div className="flex gap-2">
        <Input
          id="workspace-name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && save()}
          placeholder="Workspace name"
          maxLength={60}
          className="max-w-sm"
        />
        <Button onClick={save} disabled={!dirty || pending}>
          Save
        </Button>
      </div>
    </div>
  );
}
