"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AutomationSettings } from "@/lib/automations/settings";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return <div className="flex items-center justify-between gap-4"><label htmlFor={id} className="text-sm font-medium">{label}</label><Switch id={id} checked={checked} onCheckedChange={onChange} /></div>;
}
export function CampaignControls({ timeZone, settings, onChange, startsAt, endsAt, onDates, oncePerPerson }: {
  timeZone: string; settings: AutomationSettings; onChange: (v: AutomationSettings) => void; startsAt: string; endsAt: string; onDates: (v: { startsAt?: string; endsAt?: string }) => void; oncePerPerson: boolean;
}) {
  const set = (v: Partial<AutomationSettings>) => onChange({ ...settings, ...v });
  return <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-semibold">Matching, campaign & tracking</summary><div className="mt-4 space-y-4">
    <Toggle label="Match the whole message exactly" checked={settings.exactMatch ?? false} onChange={(exactMatch) => set({ exactMatch })} />
    <p className="text-muted-foreground text-xs">With exact matching, GUIDE matches “guide”, but not “guide please”. Capitalization is ignored. “Any comment” still matches everything.</p>
    <div className="space-y-1.5"><label htmlFor="auto-exclusions" className="text-sm font-medium">Exclude keywords</label><Input id="auto-exclusions" defaultValue={settings.excludedKeywords?.join(", ") ?? ""} placeholder="already bought, not interested" onBlur={(e) => set({ excludedKeywords: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} /><p className="text-muted-foreground text-xs">Whole words or phrases, separated by commas. Excluded messages do not start this automation.</p></div>
    <div className="space-y-1.5"><label htmlFor="auto-priority" className="text-sm font-medium">Priority</label><Input id="auto-priority" type="number" min="0" max="100" value={settings.priority ?? 0} onChange={(e) => set({ priority: Number(e.target.value) })} /><p className="text-muted-foreground text-xs">Higher numbers win when rules overlap. A specific post wins over an all-post rule; keyword rules win over a catch-all at equal priority.</p></div>
    {!oncePerPerson && <div className="space-y-1.5"><label htmlFor="auto-cooldown" className="text-sm font-medium">Wait before contacting the same person again (hours)</label><Input id="auto-cooldown" type="number" min="1" max="720" placeholder="No additional cooldown" value={settings.cooldownHours ?? ""} onChange={(e) => set({ cooldownHours: e.target.value ? Number(e.target.value) : undefined })} /></div>}
    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><label htmlFor="auto-start" className="text-sm font-medium">Starts at</label><Input id="auto-start" type="datetime-local" value={startsAt} onChange={(e) => onDates({ startsAt: e.target.value })} /></div><div className="space-y-1.5"><label htmlFor="auto-end" className="text-sm font-medium">Ends at</label><Input id="auto-end" type="datetime-local" value={endsAt} onChange={(e) => onDates({ endsAt: e.target.value })} /></div></div>
    <p className="text-muted-foreground text-xs">Times use {timeZone}. Leave blank to start when enabled and keep running. The end time also stops queued messages and follow-ups.</p>
    <div className="space-y-1.5"><label htmlFor="auto-lead-tags" className="text-sm font-medium">Tag matching leads</label><Input id="auto-lead-tags" defaultValue={settings.leadTags?.join(", ") ?? ""} placeholder="guide, launch-week" onBlur={(e) => set({ leadTags: e.target.value.split(",").map((v) => v.trim()).filter(Boolean) })} /></div>
    <Toggle label="Track visits to the DM button link" checked={settings.trackClicks ?? false} onChange={(trackClicks) => set({ trackClicks })} />
    <p className="text-muted-foreground text-xs">Uses a Cue redirect. Reports link visits, not Instagram read receipts or purchases. Known preview bots are excluded; activity attribution lasts 30 days. The destination keeps working after that.</p>
  </div></details>;
}
