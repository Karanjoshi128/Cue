import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { getMailerHome } from "@/lib/mailer/data";
import { Ago, Empty, Panel, Table, Td, Th } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { CampaignStatus, Progress } from "@/components/admin/mailer/status";
import { LiveRefresh } from "@/components/admin/mailer/campaign-actions";

export const metadata = { title: "Campaigns" };

export default async function MailerCampaignsPage() {
  const { campaigns, accounts, contacts, suppressed, settings, heartbeat } = await getMailerHome();
  const setup = [
    { done: accounts > 0, label: "Add a sending account", href: "/admin/mailer/sending" },
    { done: contacts > 0, label: "Add or import contacts", href: "/admin/mailer/contacts" },
    { done: campaigns.length > 0, label: "Write your first campaign", href: "/admin/mailer/campaigns/new" },
  ];
  const sending = campaigns.some((c) => c.status === "SENDING");

  return (
    <>
      {sending && <LiveRefresh />}
      {settings.paused && (
        <div className="border-standby/40 bg-standby/10 rounded-xl border px-4 py-3 text-sm">
          All email is paused. Nothing goes out until you resume it on{" "}
          <Link href="/admin/mailer/sending" className="font-medium underline underline-offset-4" prefetch={false}>
            Sending
          </Link>
          .
        </div>
      )}
      {setup.some((s) => !s.done) && (
        <Panel title="Get set up" description="Three steps before the first send.">
          <ol className="grid gap-2 sm:grid-cols-3">
            {setup.map((s, i) => (
              <li key={s.label}>
                <Link
                  href={s.href}
                  prefetch={false}
                  className="hover:border-foreground/25 flex items-center gap-3 rounded-xl border p-3 text-sm transition-colors"
                >
                  <span
                    className={
                      s.done
                        ? "bg-live text-background flex size-6 items-center justify-center rounded-full"
                        : "text-muted-foreground flex size-6 items-center justify-center rounded-full border font-mono text-xs"
                    }
                  >
                    {s.done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className={s.done ? "text-muted-foreground line-through" : "font-medium"}>{s.label}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <Panel
        title="Campaigns"
        description={
          <>
            {contacts.toLocaleString()} contacts · {suppressed.toLocaleString()} on the do-not-email list ·{" "}
            {heartbeat ? (
              <>
                worker last ran <Ago date={heartbeat.lastRunAt} />
              </>
            ) : (
              "the worker hasn't run yet"
            )}
          </>
        }
        actions={
          <Button size="sm" render={<Link href="/admin/mailer/campaigns/new" prefetch={false} />}>
            <Plus /> New campaign
          </Button>
        }
        flush
      >
        {campaigns.length === 0 ? (
          <Empty>No campaigns yet.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Status</Th>
                <Th>Progress</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const done = c.sent + c.failed + c.skipped;
                return (
                  <tr key={c.id}>
                    <Td>
                      <Link href={`/admin/mailer/campaigns/${c.id}`} prefetch={false} className="font-medium underline-offset-4 hover:underline">
                        {c.name}
                      </Link>
                      <div className="text-muted-foreground max-w-md truncate text-xs">{c.subject || "(no subject)"}</div>
                    </Td>
                    <Td>
                      <CampaignStatus status={c.status} />
                    </Td>
                    <Td className="min-w-40">
                      {c.total > 0 ? (
                        <div className="space-y-1">
                          <Progress done={done} total={c.total} />
                          <div className="text-muted-foreground text-xs">
                            {c.sent.toLocaleString()} sent of {c.total.toLocaleString()}
                            {c.delivered ? ` · ${c.delivered.toLocaleString()} delivered` : ""}
                            {c.failed ? ` · ${c.failed} failed` : ""}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">{c.account ? `From ${c.account.name}` : "No account chosen"}</span>
                      )}
                    </Td>
                    <Td className="text-muted-foreground text-xs whitespace-nowrap">
                      {c.status === "SCHEDULED" && c.scheduledAt ? (
                        <>
                          Starts <Ago date={c.scheduledAt} />
                        </>
                      ) : c.completedAt ? (
                        <>
                          Finished <Ago date={c.completedAt} />
                        </>
                      ) : c.startedAt ? (
                        <>
                          Started <Ago date={c.startedAt} />
                        </>
                      ) : (
                        <>
                          Edited <Ago date={c.updatedAt} />
                        </>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
