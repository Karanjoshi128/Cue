"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Passwordless sign-in via a 6-digit emailed code.
 *
 * We deliberately verify a code rather than a click-through magic link:
 * Supabase issues ONE token per request, and `{{ .ConfirmationURL }}` embeds a
 * hash of the same token the code shows. Mail scanners that prefetch links
 * therefore consume the token before the recipient ever clicks, producing
 * "otp_expired". A code can't be prefetched, so sign-in stays reliable.
 */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);

  async function sendCode(resend = false) {
    const address = email.trim().toLowerCase();
    if (!address) return toast.error("Enter your email");
    setLoading(true);
    const t = toast.loading(resend ? "Resending code…" : "Sending your code…");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: address,
        // Only used if a deployment still emails a link; the code is primary.
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setEmail(address);
      setCode("");
      toast.success(`Code sent to ${address}`, { id: t });
      setStep("code");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send code", {
        id: t,
      });
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    const token = code.trim();
    if (token.length < 6) return toast.error("Enter the code from your email");
    setLoading(true);
    const t = toast.loading("Signing you in…");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (error) throw error;
      toast.success("Signed in", { id: t });
      // Hard navigation: guarantees the server re-reads the freshly written
      // auth cookies instead of replaying a cached "/" → /login payload.
      window.location.href = "/";
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "That code didn't work — try again",
        { id: t },
      );
      setLoading(false);
    }
  }

  if (step === "code") {
    return (
      <div className="space-y-4 text-left">
        <p className="text-muted-foreground text-center text-sm">
          We emailed a sign-in code to <strong>{email}</strong>.
        </p>
        {/* Supabase's email OTP length is configurable (6-10 digits), so accept
            the whole range - hard-coding 6 silently truncates a longer code and
            fails with a misleading "Token has expired or is invalid". */}
        <div className="space-y-1.5">
          <label htmlFor="code" className="label-caps">
            Sign-in code
          </label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="Enter the code"
            maxLength={10}
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 10))
            }
            onKeyDown={(e) => e.key === "Enter" && verify()}
            className="h-12 text-center text-xl tracking-[0.3em] md:text-2xl"
          />
        </div>
        <Button
          onClick={verify}
          disabled={loading || code.length < 6}
          className="h-11 w-full text-base font-medium"
        >
          {loading ? "Signing in…" : "Verify & sign in"}
        </Button>
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={loading}
            onClick={() => sendCode(true)}
            className="hover:text-foreground underline disabled:opacity-50"
          >
            Resend code
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setStep("email");
              setCode("");
            }}
            className="hover:text-foreground underline disabled:opacity-50"
          >
            Use a different email
          </button>
        </div>
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
          autoComplete="email"
          placeholder="you@agency.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendCode()}
          className="h-11 md:text-base"
        />
      </div>
      <Button
        onClick={() => sendCode()}
        disabled={loading}
        className="h-11 w-full text-base font-medium"
      >
        {loading ? "Sending…" : "Email me a sign-in code"}
      </Button>
    </div>
  );
}
