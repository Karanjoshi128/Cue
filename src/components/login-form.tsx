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
      <p className="text-sm">
        Check <strong>{email}</strong> for a magic sign-in link.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Input
        type="email"
        aria-label="Email address"
        placeholder="you@agency.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
      />
      <Button onClick={send} disabled={loading} className="w-full">
        {loading ? "Sending…" : "Send magic link"}
      </Button>
    </div>
  );
}
