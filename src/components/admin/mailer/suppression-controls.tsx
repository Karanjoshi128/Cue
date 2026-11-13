"use client";

import { useState } from "react";
import { Loader2, Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRun } from "@/components/admin/admin-controls";
import { addSuppressions, removeSuppression } from "@/lib/mailer/actions";

export function AddSuppressionDialog() {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const emails = text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus /> Add addresses
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Never email these addresses</DialogTitle>
            <DialogDescription>
              For people who asked by reply or by phone. They&apos;re skipped by every campaign, even if they&apos;re in a list
              you import later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="sp-emails">Email addresses</Label>
            <Textarea id="sp-emails" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={"one@example.com\ntwo@example.com"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-note">Note (optional)</Label>
            <Input id="sp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Asked by reply, 5 Nov" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending || emails.length === 0}
              onClick={() =>
                run(
                  () => addSuppressions(emails, note),
                  () => {
                    setOpen(false);
                    setText("");
                    setNote("");
                  },
                )
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              Add {emails.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RemoveSuppressionButton({ email, reason }: { email: string; reason: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState("");
  const risky = reason === "bounced" || reason === "complained";
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Undo2 /> Allow again
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email {email} again?</DialogTitle>
            <DialogDescription>
              {reason === "unsubscribed"
                ? "They unsubscribed. Only do this if they asked to hear from you again."
                : risky
                  ? `This address ${reason === "bounced" ? "bounced" : "marked your email as spam"}. Emailing it again can hurt the sending domain's reputation.`
                  : "It was added to this list by hand."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rs-why">Why</Label>
            <Input id="rs-why" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder="Asked to resubscribe by email" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant={risky ? "destructive" : "default"}
              disabled={pending || why.trim().length < 3}
              onClick={() => run(() => removeSuppression(email, why), () => setOpen(false))}
            >
              {pending && <Loader2 className="animate-spin" />}
              Allow again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
