import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin-guard";
import { SEND_FILTERS, getCampaignEditor, getCampaignReport, type SendFilter } from "@/lib/mailer/data";
import { previewFooter } from "@/lib/mailer/footer";
import { renderEmail } from "@/lib/mailer/render";
import { SAMPLE_VARS } from "@/lib/mailer/merge";
import {
  Ago,
  Empty,
  FilterTabs,
  Mono,
  Pager,
  Panel,
  Pill,
  SearchForm,
  StatTile,
  Table,
  Td,
  Th,
  When,
  qs,
} from "@/components/admin/admin-ui";
import { CampaignEditor } from "@/components/admin/mailer/campaign-editor";
import { CampaignActions, LiveRefresh } from "@/components/admin/mailer/campaign-actions";
import { CampaignStatus, Progress, SEND_STATUS } from "@/components/admin/mailer/status";

export const metadata = { title: "Campaign" };

const FILTER_LABELS: Record<SendFilter, string> = {
  all: "Everyone",
  sent: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  waiting: "Waiting",
  failed: "Failed",
  skipped: "Skipped",
  bounced: "Bounced",
  complained: "Spam",
};

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ f?: string; q?: string; page?: string }>;
}) {
  const me = await requirePlatformAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const filter = (SEND_FILTERS as readonly string[]).includes(sp.f ?? "") ? (sp.f as SendFilter) : "all";
  const q = sp.q?.trim().slice(0, 100);
  const page = Math.max(1, Number(sp.page) || 1);

  const report = await getCampaignReport(id.slice(0, 100), { filter, q, page });
  if (!report) notFound();
  const { campaign: c, sends, total, waiting, tracking } = report;

  const back = (
    <Link href="/admin/mailer" prefetch={false} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
      <ArrowLeft className="size-3.5" /> All campaigns
    </Link>
  );

  // Drafts open in the editor.
  if (c.status === "DRAFT") {
    const [data, footer] = await Promise.all([getCampaignEditor(c.id), previewFooter(c.accountId)]);
    return (
      <>
        {back}
        <CampaignEditor
          key={c.id}
          accounts={data.accounts}
          templates={data.templates}
          tags={data.tags}
          fields={data.fields}
          draft={{
            id: c.id,
            name: c.name,
            accountId: c.accountId,
            subject: c.subject,
            preheader: c.preheader,
            bodyHtml: c.bodyHtml,
            audience: c.audience,
          }}
          template={null}
          footer={footer}
          me={me}
        />
      </>
    );
  }

  const footer = await previewFooter(c.accountId);
  const preview = renderEmail({
    subject: c.subject,
    preheader: c.preheader,
    bodyHtml: c.bodyHtml,
    vars: SAMPLE_VARS,
    footer,
    unsubscribeUrl: "#unsubscribe",
  });
  const done = c.sent + c.failed + c.skipped;
  const pct = (n: number) => (c.sent ? `${Math.round((n / c.sent) * 100)}% of sent` : undefined);
  // Delivered, opened, clicked, bounced and spam only arrive when the account's webhook is set up.
  const tracked = (n: number, note?: string) => (tracking ? (pct(n) ?? note) : "Tracking is off (see Sending)");

  return (
    <>
      {c.status === "SENDING" && <LiveRefresh />}
      {back}
      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2">
            {c.name} <CampaignStatus status={c.status} />
          </span>
        }
        description={
          <>
            {c.account ? `${c.account.fromName} <${c.account.fromEmail}>` : "No sending account"} ·{" "}
            {c.audience.tags.length ? `tags: ${c.audience.tags.join(", ")}` : "all contacts"}
            {c.audience.excludeTags.length ? `, leaving out ${c.audience.excludeTags.join(", ")}` : ""}
          </>
        }
        actions={<CampaignActions id={c.id} status={c.status} sent={c.sent} />}
      >
        <div className="space-y-4">
          {c.status === "SCHEDULED" && c.scheduledAt ? (
            <p className="text-sm">
              Starts <When date={c.scheduledAt} /> (<Ago date={c.scheduledAt} />). Who gets it is worked out then.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Progress done={done} total={c.total} />
              <p className="text-muted-foreground text-xs">
                {done.toLocaleString()} of {c.total.toLocaleString()} handled
                {waiting ? ` · ${waiting.toLocaleString()} still waiting` : ""}
                {c.startedAt && (
                  <>
                    {" "}· started <Ago date={c.startedAt} />
                  </>
                )}
                {c.completedAt && (
                  <>
                    {" "}· finished <Ago date={c.completedAt} />
                  </>
                )}
              </p>
            </div>
          )}
          {c.status !== "SCHEDULED" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="Sent" value={c.sent.toLocaleString()} note={`of ${c.total.toLocaleString()}`} />
              <StatTile label="Delivered" value={c.delivered.toLocaleString()} note={tracked(c.delivered)} />
              <StatTile label="Opened" value={c.opened.toLocaleString()} note={tracked(c.opened, "Approximate")} />
              <StatTile label="Clicked" value={c.clicked.toLocaleString()} note={tracked(c.clicked)} />
              <StatTile label="Failed" value={c.failed.toLocaleString()} tone={c.failed ? "bad" : undefined} />
              <StatTile label="Skipped" value={c.skipped.toLocaleString()} note="Do-not-email or stopped" />
              <StatTile label="Bounced" value={c.bounced.toLocaleString()} tone={c.bounced ? "warn" : undefined} />
              <StatTile label="Marked as spam" value={c.complained.toLocaleString()} tone={c.complained ? "bad" : undefined} />
            </div>
          )}
        </div>
      </Panel>

      {c.status !== "SCHEDULED" && (
        <Panel title="Who got it" flush>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <FilterTabs
              active={filter}
              items={SEND_FILTERS.map((f) => ({ key: f, label: FILTER_LABELS[f], href: qs(`/admin/mailer/campaigns/${c.id}`, { f: f === "all" ? undefined : f, q }) }))}
            />
            <SearchForm placeholder="Search an address" q={q} hidden={{ f: filter === "all" ? undefined : filter }} />
          </div>
          {sends.length === 0 ? (
            <Empty>Nobody here.</Empty>
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Address</Th>
                    <Th>Status</Th>
                    <Th>Since</Th>
                    <Th>Details</Th>
                  </tr>
                </thead>
                <tbody>
                  {sends.map((s) => {
                    const st = SEND_STATUS[s.status] ?? { label: s.status, tone: "idle" as const };
                    const extra = [
                      s.deliveredAt && "delivered",
                      s.openedAt && "opened",
                      s.clickedAt && "clicked",
                      s.bouncedAt && "bounced",
                      s.complainedAt && "marked as spam",
                    ].filter(Boolean);
                    return (
                      <tr key={s.id}>
                        <Td>
                          <Mono>{s.email}</Mono>
                          {s.name && <div className="text-muted-foreground text-xs">{s.name}</div>}
                        </Td>
                        <Td>
                          <Pill tone={s.bouncedAt || s.complainedAt ? "bad" : st.tone}>{st.label}</Pill>
                        </Td>
                        <Td className="text-muted-foreground text-xs whitespace-nowrap">
                          {s.sentAt ? <Ago date={s.sentAt} /> : s.status === "PENDING" && s.attempts > 0 ? `retry ${s.attempts + 1} of 3` : ""}
                        </Td>
                        <Td className="text-muted-foreground max-w-md text-xs break-words">
                          {extra.length > 0 && <span className="text-foreground">{extra.join(", ")}</span>}
                          {extra.length > 0 && s.error ? " · " : ""}
                          {s.error}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <Pager page={page} total={total} href={(p) => qs(`/admin/mailer/campaigns/${c.id}`, { f: filter === "all" ? undefined : filter, q, page: p })} />
            </>
          )}
        </Panel>
      )}

      <Panel title="The email" description={`Subject: ${preview.subject}${c.preheader ? ` · ${c.preheader}` : ""}`}>
        <iframe title="Email as sent" sandbox="" srcDoc={preview.html} className="h-[36rem] w-full rounded-lg border bg-white" />
        <p className="text-muted-foreground mt-2 text-xs">Shown with sample values. Each person saw their own name and fields.</p>
      </Panel>
    </>
  );
}
