"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { createWorkspace } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Re-throw the special error `redirect()` uses so a successful create still
// navigates; only real failures surface as a toast.
function isRedirect(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

export function OnboardingForm({ suggestion }: { suggestion?: string }) {
  const [name, setName] = useState(suggestion ?? "");
  const [loading, setLoading] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Give your workspace a name");
    setLoading(true);
    try {
      await createWorkspace(trimmed);
      // On success the server action redirects to the dashboard.
    } catch (e) {
      if (isRedirect(e)) throw e;
      toast.error(e instanceof Error ? e.message : "Couldn't create workspace");
      setLoading(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="space-y-2">
        <label htmlFor="workspace" className="label-caps block">
          Workspace name
        </label>
        <Input
          id="workspace"
          placeholder="Acme Agency"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          className="h-12 text-base md:text-base"
          autoFocus
        />
      </div>
      <Button type="submit" size="xl" disabled={loading} className="group w-full">
        {loading ? <Loader2 className="animate-spin" /> : null}
        {loading ? "Creating…" : "Create workspace"}
        {!loading && (
          <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
        )}
      </Button>
    </form>
  );
}
