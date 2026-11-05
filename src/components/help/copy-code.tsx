"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A literal block from a guide, with a copy button. */
export function CopyCode({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="overflow-hidden rounded-xl border">
      <figcaption className="bg-muted/60 flex items-center justify-between border-b px-4 py-2">
        <span className="label-caps">{label}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard blocked (e.g. insecure context): leave the text selectable.
            }
          }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="bg-card overflow-x-auto p-4 font-mono text-[0.8125rem] leading-relaxed">
        <code>{text}</code>
      </pre>
    </figure>
  );
}
