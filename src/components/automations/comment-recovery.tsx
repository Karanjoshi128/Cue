"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { listAccountMedia, previewCommentRecovery, confirmCommentRecovery, type PickableMedia } from "@/lib/automation-actions";
import { unwrap } from "@/lib/action-result";
import type { AutomationRuleView } from "@/lib/automations/data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export function CommentRecovery({ rule, onClose }: { rule: AutomationRuleView; onClose: () => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [media, setMedia] = useState<PickableMedia[]>([]);
  const [mediaId, setMediaId] = useState(rule.mediaId ?? "");
  const [rows, setRows] = useState<{ id: string; text: string; username: string | null; at: string }[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  function run(work: () => Promise<void>) { start(async () => { try { await work(); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not recover comments."); } }); }
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Recover missed comments</DialogTitle><DialogDescription>Check up to 50 recent comments on a post. Only unhandled matches from the last seven days are eligible. Review the people below before queueing replies.</DialogDescription></DialogHeader>
    <p className="text-sm font-medium">{rule.name}</p>
    {rule.scope === "ANY_POST" ? <div className="space-y-2"><Button variant="outline" disabled={busy} onClick={() => run(async () => setMedia(unwrap(await listAccountMedia(rule.accountId))))}>Load recent posts</Button><label htmlFor="recovery-post" className="block text-sm">Post to check</label><select id="recovery-post" className="bg-background w-full rounded-lg border p-2 text-sm" value={mediaId} onChange={(e) => { setMediaId(e.target.value); setRows(null); setSelected([]); }}><option value="">Choose a post</option>{media.map((m) => <option key={m.id} value={m.id}>{m.caption?.slice(0, 90) || m.timestamp || m.id}</option>)}</select></div> : <p className="text-muted-foreground text-sm">{rule.mediaCaption || (rule.mediaId ? "The post watched by this automation" : "This post has not published yet.")}</p>}
    <Button variant="outline" disabled={busy || !mediaId} onClick={() => run(async () => { setRows(unwrap(await previewCommentRecovery(rule.id, mediaId))); setSelected([]); })}>{busy ? "Checking…" : "Preview eligible comments"}</Button>
    {rows && <div className="space-y-3"><p className="text-muted-foreground text-xs">{rows.length} eligible. Previously handled comments are excluded. Repeat limits, contact pauses, moderation and campaign dates still apply. Other tools may already have replied; check Instagram before sending.</p><ul className="max-h-64 space-y-2 overflow-y-auto">{rows.map((row) => <li key={row.id}><label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1" checked={selected.includes(row.id)} onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id))} /><span className="min-w-0 wrap-break-word"><strong>{row.username ? `@${row.username}` : "Instagram user"}</strong><br />{row.text}</span></label></li>)}</ul></div>}
    <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !selected.length} onClick={() => run(async () => { const result = unwrap(await confirmCommentRecovery(rule.id, mediaId, selected)); toast.success(`${result.queued} queued; ${result.checked - result.queued} held or skipped by safety rules`); router.refresh(); onClose(); })}>Queue replies for {selected.length} people</Button></DialogFooter>
  </DialogContent></Dialog>;
}
