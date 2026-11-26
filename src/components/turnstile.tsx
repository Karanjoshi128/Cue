"use client";

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile missing"));
    s.onerror = () => {
      scriptPromise = null; // let a later mount try again
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile, the check that a person (not a bot) is asking for a
 * sign-in code. "interaction-only" keeps it invisible unless Cloudflare
 * wants a click. Each token works once: bump `resetKey` after using it.
 */
export function Turnstile({
  siteKey,
  onToken,
  onError,
  resetKey,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  onError?: () => void;
  resetKey: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  // Latest callbacks without re-rendering the widget.
  const cb = useRef({ onToken, onError });
  useEffect(() => {
    cb.current = { onToken, onError };
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !el.current) return;
        widget.current = api.render(el.current, {
          sitekey: siteKey,
          action: "login",
          appearance: "interaction-only",
          theme: "auto",
          size: "flexible",
          callback: (token: string) => cb.current.onToken(token),
          "expired-callback": () => cb.current.onToken(null),
          "error-callback": () => {
            cb.current.onToken(null);
            cb.current.onError?.();
          },
        });
      })
      .catch(() => cb.current.onError?.());
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile)
        window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey > 0 && widget.current && window.turnstile) {
      window.turnstile.reset(widget.current);
    }
  }, [resetKey]);

  return <div ref={el} className="flex justify-center [&:has(iframe)]:mt-4" />;
}
