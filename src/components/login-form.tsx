"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Supabase allows one code per email every 60 seconds by default.
const RESEND_COOLDOWN_S = 60;

/**
 * Passwordless sign-in via an emailed one-time code.
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
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

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
      setCooldown(RESEND_COOLDOWN_S);
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
      window.location.href = "/dashboard";
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "That code didn't work - try again",
        { id: t },
      );
      setLoading(false);
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === "code" ? (
        <motion.form
          key="code"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <div className="bg-muted/50 flex items-start gap-3 rounded-xl border px-4 py-3">
            <Mail className="text-primary mt-0.5 size-4 shrink-0" />
            <p className="text-sm leading-relaxed">
              <span className="font-medium">Check your inbox.</span>{" "}
              <span className="text-muted-foreground">
                We sent a sign-in code to{" "}
                <span className="text-foreground font-medium break-all">{email}</span>
                .
              </span>
            </p>
          </div>
          {/* Supabase's email OTP length is configurable (6-10 digits), so accept
              the whole range - hard-coding 6 silently truncates a longer code and
              fails with a misleading "Token has expired or is invalid". */}
          <div className="space-y-2">
            <label htmlFor="code" className="label-caps block">
              Sign-in code
            </label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="••••••••"
              maxLength={10}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              className="h-14 text-center font-mono text-2xl tracking-[0.45em] md:text-2xl"
            />
          </div>
          <Button
            type="submit"
            size="xl"
            disabled={loading || code.length < 6}
            className="w-full"
          >
            {loading ? <Loader2 className="animate-spin" /> : null}
            {loading ? "Signing in…" : "Verify and sign in"}
          </Button>
          <div className="text-muted-foreground flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setStep("email");
                setCode("");
              }}
              className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <ArrowLeft className="size-3.5" /> Different email
            </button>
            <button
              type="button"
              disabled={loading || cooldown > 0}
              onClick={() => sendCode(true)}
              className="hover:text-foreground font-mono text-xs tabular-nums transition-colors disabled:opacity-60 disabled:hover:text-muted-foreground"
            >
              {cooldown > 0
                ? `Resend in 0:${String(cooldown).padStart(2, "0")}`
                : "Resend code"}
            </button>
          </div>
        </motion.form>
      ) : (
        <motion.form
          key="email"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 16 }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
        >
          <div className="space-y-2">
            <label htmlFor="email" className="label-caps block">
              Work email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@agency.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 text-base md:text-base"
            />
          </div>
          <Button type="submit" size="xl" disabled={loading} className="group w-full">
            {loading ? <Loader2 className="animate-spin" /> : null}
            {loading ? "Sending…" : "Email me a sign-in code"}
            {!loading && (
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            )}
          </Button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
