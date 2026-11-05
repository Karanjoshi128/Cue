"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resubscribeWithToken, unsubscribeWithToken } from "@/lib/mailer/public-actions";

type State = "subscribed" | "unsubscribed" | "blocked";

/** The unsubscribe page's buttons. Nothing changes until a button is pressed. */
export function UnsubscribeControls({ token, email, initial }: { token: string; email: string; initial: State }) {
  const [state, setState] = useState<State>(initial);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  function act(fn: (t: string) => Promise<{ ok: boolean }>, next: State) {
    setError(false);
    start(async () => {
      try {
        const r = await fn(token);
        if (r.ok) setState(next);
        else setError(true);
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="mt-6 space-y-5">
      {state === "subscribed" && (
        <>
          <div className="space-y-2">
            <h1 className="headline text-[1.75rem]">Unsubscribe?</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              <strong className="text-foreground font-medium">{email}</strong> will stop getting news and
              updates from Cue. Emails about your own Cue account, like sign-in codes, aren&apos;t affected.
            </p>
          </div>
          <Button size="lg" className="w-full" disabled={pending} onClick={() => act(unsubscribeWithToken, "unsubscribed")}>
            {pending ? "Unsubscribing…" : "Unsubscribe"}
          </Button>
        </>
      )}
      {state === "unsubscribed" && (
        <>
          <div className="space-y-2" role="status">
            <h1 className="headline text-[1.75rem]">You&apos;re unsubscribed.</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We won&apos;t send news or updates to <strong className="text-foreground font-medium">{email}</strong>{" "}
              again. Sorry to see you go.
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => act(resubscribeWithToken, "subscribed")}
          >
            {pending ? "One moment…" : "Unsubscribed by mistake? Resubscribe"}
          </Button>
        </>
      )}
      {state === "blocked" && (
        <div className="space-y-2" role="status">
          <h1 className="headline text-[1.75rem]">You won&apos;t get these emails.</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            <strong className="text-foreground font-medium">{email}</strong> is already off our list. To start
            getting them again, reply to one of our emails.
          </p>
        </div>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          That didn&apos;t work. Please try again in a moment.
        </p>
      )}
    </div>
  );
}
