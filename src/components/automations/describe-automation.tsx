"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Mic, Sparkles, Square } from "lucide-react";
import { draftAutomationFromText } from "@/lib/automation-actions";
import { unwrap } from "@/lib/action-result";
import type { AutomationPreset } from "@/lib/automations/config";
import type { AutomationsPageData } from "@/lib/automations/data";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// The browser's speech-to-text (Chrome, Edge, Safari). Typed loosely: it
// isn't in every TypeScript DOM library yet.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function speechRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};

/**
 * "When someone comments MENU on a reel, DM them the menu link": Claude turns
 * a sentence, typed or spoken, into an automation, and the editor opens with
 * it for the person to check and save.
 */
export function DescribeAutomation({
  accounts,
  onDraft,
}: {
  accounts: AutomationsPageData["accounts"];
  onDraft: (preset: AutomationPreset, accountId: string) => void;
}) {
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [listening, setListening] = useState(false);
  const [pending, startTransition] = useTransition();
  const recognition = useRef<Recognition | null>(null);
  // Known only in the browser; false while rendering on the server.
  const canListen = useSyncExternalStore(noop, () => speechRecognition() !== null, () => false);

  function listen() {
    if (listening) return recognition.current?.stop();
    const Ctor = speechRecognition();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-IN";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let heard = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) heard += e.results[i][0].transcript;
      }
      if (heard.trim()) setText((t) => (t.trim() ? `${t.trim()} ${heard.trim()}` : heard.trim()));
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") toast.error("Allow the microphone to describe it out loud.");
      else if (e.error !== "no-speech" && e.error !== "aborted") toast.error("Couldn't hear that. Try typing it.");
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }

  function setUp() {
    recognition.current?.stop();
    startTransition(async () => {
      try {
        const preset = unwrap(await draftAutomationFromText(text, accountId));
        onDraft(preset, accountId);
        setText("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't set that up.");
      }
    });
  }

  const items = Object.fromEntries(accounts.map((a) => [a.id, `${a.displayName} · ${a.clientName}`]));

  return (
    <section className="bg-card space-y-3 rounded-2xl border p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary size-4" />
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">Describe it</h2>
        <span className="text-muted-foreground text-xs">Claude fills in the rest; you check it before it goes live.</span>
      </div>
      <Textarea
        value={text}
        rows={2}
        maxLength={600}
        aria-label="Describe the automation"
        placeholder="When someone comments MENU on a reel, reply publicly and DM them the menu link, but only if they follow us."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && !pending) setUp();
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {accounts.length > 1 && (
          <Select value={accountId} items={items} onValueChange={(v) => setAccountId(v as string)}>
            <SelectTrigger className="w-full sm:w-72" aria-label="Account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {items[a.id]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto flex items-center gap-2">
          {canListen && (
            <Button
              variant="outline"
              size="icon"
              onClick={listen}
              disabled={pending}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Say it instead"}
              title={listening ? "Stop listening" : "Say it instead (your browser turns speech into text)"}
              className={cn(listening && "border-fault/40 text-fault-ink")}
            >
              {listening ? <Square className="fill-current" /> : <Mic />}
            </Button>
          )}
          <Button onClick={setUp} disabled={!text.trim() || pending || !accountId}>
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Set it up
          </Button>
        </div>
      </div>
    </section>
  );
}
