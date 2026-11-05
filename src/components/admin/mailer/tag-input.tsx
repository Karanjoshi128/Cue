"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tags as chips: type and press Enter or comma, or pick one already in use. */
export function TagInput({
  id,
  value,
  onChange,
  suggestions = [],
  placeholder = "Type a tag and press Enter",
}: {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    if (t && !value.includes(t)) onChange([...value, t]);
    setText("");
  };
  const rest = suggestions.filter((s) => !value.includes(s)).slice(0, 12);
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "border-input bg-card focus-within:border-ring focus-within:ring-ring/15 flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 focus-within:ring-4",
        )}
      >
        {value.map((t) => (
          <span key={t} className="bg-muted inline-flex h-6 items-center gap-1 rounded-md pr-1 pl-2 text-xs">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="hover:bg-foreground/10 rounded p-0.5">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) add(v.slice(0, -1));
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text && add(text)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rest.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...value, s])}
              className="text-muted-foreground hover:text-foreground hover:border-foreground/30 h-6 rounded-md border border-dashed px-2 text-xs"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
