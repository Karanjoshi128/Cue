"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AutomationLeadView } from "@/lib/automations/data";
import { updateAutomationLead } from "@/lib/automation-actions";
import { unwrap } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function LeadDetails({ lead, onClose }: { lead: AutomationLeadView; onClose: () => void }) {
  const router = useRouter();
  const [tags, setTags] = useState(lead.tags.join(", "));
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [paused, setPaused] = useState(lead.automationPaused);
  const [busy, start] = useTransition();
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>{lead.username ? `@${lead.username}` : "Instagram lead"}</DialogTitle><DialogDescription>{lead.accountName} · {lead.clientName}</DialogDescription></DialogHeader>
    <div className="space-y-4"><div className="flex items-center justify-between gap-4"><label htmlFor="lead-pause" className="text-sm font-medium">Pause automation for this person</label><Switch id="lead-pause" checked={paused} onCheckedChange={setPaused} /></div><p className="text-muted-foreground text-xs">Use this when taking over in Instagram’s inbox. Queued messages and reminders stop. Sending STOP also pauses automation. Resume only when the person wants automated replies again.</p><div className="space-y-1.5"><label htmlFor="lead-tags" className="text-sm font-medium">Tags</label><Input id="lead-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="customer, guide, follow-up" /></div><div className="space-y-1.5"><label htmlFor="lead-notes" className="text-sm font-medium">Team notes</label><Textarea id="lead-notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Useful context for your team" /></div><p className="text-muted-foreground text-xs">Notes stay in this workspace and are never sent to Instagram.</p></div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={() => start(async () => { try { unwrap(await updateAutomationLead(lead.id, { tags: tags.split(",").map((v) => v.trim()).filter(Boolean), notes, automationPaused: paused })); toast.success("Lead updated"); router.refresh(); onClose(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not update lead."); } })}>{busy ? "Saving…" : "Save changes"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
