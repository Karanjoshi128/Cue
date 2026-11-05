import { getSuppressionPage } from "@/lib/mailer/data";
import { Ago, Empty, Mono, Pager, Panel, Pill, SearchForm, Table, Td, Th, qs } from "@/components/admin/admin-ui";
import { AddSuppressionDialog, RemoveSuppressionButton } from "@/components/admin/mailer/suppression-controls";

export const metadata = { title: "Do-not-email" };

const REASONS: Record<string, { label: string; tone: "good" | "warn" | "bad" | "idle" }> = {
  unsubscribed: { label: "Unsubscribed", tone: "idle" },
  bounced: { label: "Bounced", tone: "warn" },
  complained: { label: "Marked as spam", tone: "bad" },
  manual: { label: "Added by hand", tone: "idle" },
};

export default async function DoNotEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim().slice(0, 100);
  const { rows, total, byReason } = await getSuppressionPage({ q, page });

  return (
    <Panel
      title="Do-not-email list"
      description={
        <>
          Never emailed again, whatever list they&apos;re in: {byReason.unsubscribed ?? 0} unsubscribed, {byReason.bounced ?? 0}{" "}
          bounced, {byReason.complained ?? 0} marked as spam, {byReason.manual ?? 0} added by hand.
        </>
      }
      actions={
        <>
          <SearchForm placeholder="Search addresses" q={q} />
          <AddSuppressionDialog />
        </>
      }
      flush
    >
      {rows.length === 0 ? (
        <Empty>{q ? "No address matches that." : "Nobody yet. Unsubscribes, bounces and spam complaints land here automatically."}</Empty>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Address</Th>
                <Th>Why</Th>
                <Th>When</Th>
                <Th>Note</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const reason = REASONS[r.reason] ?? { label: r.reason, tone: "idle" as const };
                return (
                  <tr key={r.email}>
                    <Td>
                      <Mono>{r.email}</Mono>
                    </Td>
                    <Td>
                      <Pill tone={reason.tone}>{reason.label}</Pill>
                    </Td>
                    <Td className="text-muted-foreground whitespace-nowrap">
                      <Ago date={r.createdAt} />
                    </Td>
                    <Td className="text-muted-foreground text-xs">{r.note ?? (r.createdBy ? `by ${r.createdBy}` : "")}</Td>
                    <Td className="text-right">
                      <RemoveSuppressionButton email={r.email} reason={r.reason} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pager page={page} total={total} href={(p) => qs("/admin/mailer/do-not-email", { q, page: p })} />
        </>
      )}
    </Panel>
  );
}
