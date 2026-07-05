"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!email) return toast.error("Enter your email");
    setLoading(true);
    const t = toast.loading("Sending magic link…");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      toast.success("Magic link sent", { id: t });
      setSent(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send link", {
        id: t,
      });
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="bg-muted/60 rounded-xl border p-4 text-center">
        <p className="text-base">
          Check <strong>{email}</strong> for a magic sign-in link.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-left">
      <div className="space-y-1.5">
        <label htmlFor="email" className="label-caps">
          Work email
        </label>
        <Input
          id="email"
          type="email"
          placeholder="you@agency.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          className="h-11 md:text-base"
        />
      </div>
      <Button
        onClick={send}
        disabled={loading}
        className="h-11 w-full text-base font-medium"
      >
        {loading ? "Sending…" : "Send magic link"}
      </Button>
    </div>
  );
}
