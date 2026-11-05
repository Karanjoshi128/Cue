import { requirePlatformAdmin } from "@/lib/admin-guard";
import { getSendingPage } from "@/lib/mailer/data";
import { Ago, Empty, Mono, Panel, Pill } from "@/components/admin/admin-ui";
import {
  AccountDialog,
  DeleteAccountButton,
  FooterForm,
  MailerPauseControl,
  TestAccountButton,
} from "@/components/admin/mailer/sending-controls";

export const metadata = { title: "Sending" };

const APP_URL = (process.env.APP_URL ?? "https://trycue.space").replace(/\/+$/, "");

export default async function MailerSendingPage() {
  const me = await requirePlatformAdmin();
  const { accounts, settings, heartbeat, workerStale: stale } = await getSendingPage();

  return (
    <>
      <Panel
        title="Sending accounts"
        description="Resend accounts that email goes out through. Each campaign picks one."
        actions={<AccountDialog trigger="add" />}
        flush
      >
        {accounts.length === 0 ? (
          <Empty>No sending account yet. Add one to start; the setup steps are below.</Empty>
        ) : (
          <ul className="divide-y">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    {!a.active ? (
                      <Pill tone="idle">Off</Pill>
                    ) : a.lastError ? (
                      <Pill tone="bad">Test failed</Pill>
                    ) : a.lastVerifiedAt ? (
                      <Pill tone="good">Verified</Pill>
                    ) : (
                      <Pill tone="warn">Not tested</Pill>
                    )}
                    <Pill tone={a.hasWebhookSecret ? "good" : "idle"}>
                      {a.hasWebhookSecret ? "Tracking on" : "No tracking"}
                    </Pill>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {a.fromName} &lt;{a.fromEmail}&gt;
                    {a.replyTo ? ` · replies to ${a.replyTo}` : ""}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    Sent in the last 24 hours: <span className="text-foreground font-mono">{a.sentToday}</span> of {a.perDay} ·
                    up to {a.perMinute} a minute
                    {a.lastVerifiedAt && (
                      <>
                        {" "}· last test <Ago date={a.lastVerifiedAt} />
                      </>
                    )}
                  </p>
                  {a.lastError && <p className="text-destructive text-xs break-words">{a.lastError}</p>}
                  <p className="text-muted-foreground text-xs">
                    Webhook URL: <Mono className="break-all">{`${APP_URL}/api/mailer/webhook/${a.id}`}</Mono>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <TestAccountButton accountId={a.id} defaultTo={me} />
                  <AccountDialog trigger="edit" account={a} />
                  <DeleteAccountButton accountId={a.id} name={a.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Sending" description="The worker runs every minute.">
        <div className="space-y-4">
          <MailerPauseControl paused={settings.paused} />
          <p className="text-muted-foreground border-t pt-3 text-xs">
            {heartbeat ? (
              <>
                Last run <Ago date={heartbeat.lastRunAt} />:{" "}
                {heartbeat.ok ? "OK" : <span className="text-destructive">{heartbeat.error}</span>}
                {stale && " · The worker hasn't run in the last 5 minutes. Check the pg_cron job (setup step 5)."}
              </>
            ) : (
              "The worker hasn't run yet. Set up the pg_cron job (setup step 5)."
            )}
          </p>
        </div>
      </Panel>

      <Panel title="Email footer" description="On every email, with the unsubscribe link.">
        <FooterForm name={settings.footerName} address={settings.footerAddress} />
      </Panel>

      <Panel title="Setup steps" description="Once per Resend account.">
        <ol className="text-muted-foreground list-decimal space-y-2.5 pl-5 text-sm leading-relaxed [&_strong]:text-foreground [&_strong]:font-medium">
          <li>
            Create a <strong>separate Resend account</strong> for marketing, not the one that sends Cue&apos;s sign-in codes.
            If people mark marketing email as spam and Resend pauses that account, sign-in keeps working.
          </li>
          <li>
            In it, <strong>Domains → Add domain</strong>: add <Mono>trycue.space</Mono> and put the DNS records it shows into
            Cloudflare (SPF, DKIM, and a DMARC record). Wait until Resend says Verified.
          </li>
          <li>
            <strong>API Keys → Create API key</strong> with Sending access. Add a sending account above with it, then use
            <strong> Send test</strong>.
          </li>
          <li>
            Optional, recommended: <strong>Webhooks → Add endpoint</strong> with the account&apos;s webhook URL (shown on its
            row), events <Mono>email.delivered</Mono>, <Mono>email.bounced</Mono>, <Mono>email.complained</Mono>,{" "}
            <Mono>email.opened</Mono>, <Mono>email.clicked</Mono>. Paste its signing secret into the account.
          </li>
          <li>
            The worker: a Supabase pg_cron job that calls <Mono>{`${APP_URL}/api/cron/mailer`}</Mono> every minute with the
            cron secret. The SQL is in <Mono>docs/mailer.md</Mono>.
          </li>
          <li>
            Make sure replies have somewhere to go: create the sender address (or a reply-to) as a real mailbox in Zoho.
          </li>
        </ol>
      </Panel>
    </>
  );
}
