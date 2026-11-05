"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRun } from "@/components/admin/admin-controls";
import {
  deleteMailerAccount,
  saveMailerAccount,
  saveMailerSettings,
  setMailerPaused,
  testMailerAccount,
} from "@/lib/mailer/actions";

export interface AccountView {
  id: string;
  name: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  perMinute: number;
  perDay: number;
  active: boolean;
  hasWebhookSecret: boolean;
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>}
    </div>
  );
}

/** Add or edit a sending account. Keys are write-only: blank on edit keeps the saved one. */
export function AccountDialog({ account, trigger }: { account?: AccountView; trigger: "add" | "edit" }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const blank = {
    name: "",
    fromName: "Cue",
    fromEmail: "hello@trycue.space",
    replyTo: "",
    apiKey: "",
    webhookSecret: "",
    perMinute: "60",
    perDay: "100",
    active: true,
  };
  const [f, setF] = useState(blank);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  function openDialog() {
    setF(
      account
        ? {
            name: account.name,
            fromName: account.fromName,
            fromEmail: account.fromEmail,
            replyTo: account.replyTo ?? "",
            apiKey: "",
            webhookSecret: "",
            perMinute: String(account.perMinute),
            perDay: String(account.perDay),
            active: account.active,
          }
        : blank,
    );
    setOpen(true);
  }

  return (
    <>
      {trigger === "add" ? (
        <Button size="sm" onClick={openDialog}>
          <Plus /> Add sending account
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={openDialog}>
          <Pencil /> Edit
        </Button>
      )}
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{account ? `Edit ${account.name}` : "Add a sending account"}</DialogTitle>
            <DialogDescription>
              A Resend account that email goes out through. Use a different Resend account from the one that sends
              Cue&apos;s sign-in codes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field id="ma-name" label="Account name" hint="Only you see this, e.g. Marketing.">
                <Input id="ma-name" value={f.name} onChange={set("name")} maxLength={60} />
              </Field>
            </div>
            <Field id="ma-from-name" label="Sender name" hint="What recipients see as From.">
              <Input id="ma-from-name" value={f.fromName} onChange={set("fromName")} maxLength={80} />
            </Field>
            <Field id="ma-from" label="Sender email" hint="Its domain must be verified in this Resend account.">
              <Input id="ma-from" type="email" value={f.fromEmail} onChange={set("fromEmail")} />
            </Field>
            <div className="sm:col-span-2">
              <Field id="ma-reply" label="Reply-to (optional)" hint="Where replies go, if not the sender email. It must be a real inbox.">
                <Input id="ma-reply" type="email" value={f.replyTo} onChange={set("replyTo")} placeholder="karan@trycue.space" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                id="ma-key"
                label="Resend API key"
                hint={account ? "Leave blank to keep the saved key." : "Resend → API Keys → Create (Sending access is enough). Starts with re_."}
              >
                <Input id="ma-key" type="password" autoComplete="off" value={f.apiKey} onChange={set("apiKey")} placeholder={account ? "••••••••  (saved)" : "re_…"} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                id="ma-whsec"
                label="Webhook signing secret (optional)"
                hint={
                  account?.hasWebhookSecret
                    ? "Saved. Leave blank to keep it. Turns on delivered, bounced and complaint tracking."
                    : "Turns on delivered, bounced and complaint tracking. See the setup steps on this page. Starts with whsec_."
                }
              >
                <Input id="ma-whsec" type="password" autoComplete="off" value={f.webhookSecret} onChange={set("webhookSecret")} placeholder="whsec_…" />
              </Field>
            </div>
            <Field id="ma-min" label="Per minute" hint="At most this many emails a minute.">
              <Input id="ma-min" type="number" min={1} max={600} value={f.perMinute} onChange={set("perMinute")} />
            </Field>
            <Field id="ma-day" label="Per day" hint="Resend free plan: 100 a day.">
              <Input id="ma-day" type="number" min={1} value={f.perDay} onChange={set("perDay")} />
            </Field>
            <label className="flex items-center gap-3 text-sm sm:col-span-2">
              <Switch checked={f.active} onCheckedChange={(v) => setF((p) => ({ ...p, active: !!v }))} />
              Active (campaigns can send from it)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    saveMailerAccount({
                      id: account?.id,
                      name: f.name,
                      fromName: f.fromName,
                      fromEmail: f.fromEmail,
                      replyTo: f.replyTo,
                      apiKey: f.apiKey || undefined,
                      webhookSecret: f.webhookSecret || undefined,
                      perMinute: Number(f.perMinute),
                      perDay: Number(f.perDay),
                      active: f.active,
                    }),
                  () => setOpen(false),
                )
              }
            >
              {pending && <Loader2 className="animate-spin" />}
              {account ? "Save" : "Add account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TestAccountButton({ accountId, defaultTo }: { accountId: string; defaultTo: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Send /> Send test
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a test email</DialogTitle>
            <DialogDescription>A short email through this account, to check the key and the domain work.</DialogDescription>
          </DialogHeader>
          <Field id="ta-to" label="Send to">
            <Input id="ta-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button disabled={pending || !to} onClick={() => run(() => testMailerAccount(accountId, to), () => setOpen(false))}>
              {pending && <Loader2 className="animate-spin" />}
              Send test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteAccountButton({ accountId, name }: { accountId: string; name: string }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" aria-label={`Delete ${name}`} onClick={() => setOpen(true)}>
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              Its saved key is removed. Past campaigns keep their logs. Campaigns can&apos;t send from it any more.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => deleteMailerAccount(accountId), () => setOpen(false))}>
              {pending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function FooterForm({ name, address }: { name: string; address: string | null }) {
  const { pending, run } = useRun();
  const [n, setN] = useState(name);
  const [a, setA] = useState(address ?? "");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="ft-name" label="Name in the footer" hint="Shown at the bottom of every email, with the reply address.">
        <Input id="ft-name" value={n} onChange={(e) => setN(e.target.value)} maxLength={80} />
      </Field>
      <Field id="ft-addr" label="Postal address (optional)" hint="US law (CAN-SPAM) asks for one if you email people in the US. A PO box works.">
        <Input id="ft-addr" value={a} onChange={(e) => setA(e.target.value)} maxLength={200} />
      </Field>
      <div className="sm:col-span-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => saveMailerSettings({ footerName: n, footerAddress: a }))}>
          {pending && <Loader2 className="animate-spin" />}
          Save footer
        </Button>
      </div>
    </div>
  );
}

export function MailerPauseControl({ paused }: { paused: boolean }) {
  const { pending, run } = useRun();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{paused ? "All email is paused" : "Sending is on"}</div>
        <p className="text-muted-foreground text-xs">
          {paused
            ? "Nothing goes out, scheduled campaigns wait. Resume to carry on where it stopped."
            : "Stops every campaign straight away, mid-send included. Nothing is lost."}
        </p>
      </div>
      <Button size="sm" variant={paused ? "default" : "destructive"} disabled={pending} onClick={() => run(() => setMailerPaused(!paused))}>
        {pending && <Loader2 className="animate-spin" />}
        {paused ? "Resume sending" : "Pause all email"}
      </Button>
    </div>
  );
}
