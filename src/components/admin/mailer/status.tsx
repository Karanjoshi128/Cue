import { Pill } from "@/components/admin/admin-ui";

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" | "idle" }> = {
  DRAFT: { label: "Draft", tone: "idle" },
  SCHEDULED: { label: "Scheduled", tone: "warn" },
  SENDING: { label: "Sending", tone: "warn" },
  SENT: { label: "Sent", tone: "good" },
  FAILED: { label: "Failed", tone: "bad" },
  CANCELLED: { label: "Stopped", tone: "idle" },
};

export function CampaignStatus({ status }: { status: string }) {
  const s = CAMPAIGN_STATUS[status] ?? { label: status, tone: "idle" as const };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export const SEND_STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" | "idle" }> = {
  PENDING: { label: "Waiting", tone: "idle" },
  SENDING: { label: "Sending", tone: "warn" },
  SENT: { label: "Sent", tone: "good" },
  FAILED: { label: "Failed", tone: "bad" },
  SKIPPED: { label: "Skipped", tone: "idle" },
};

/** A thin bar: how much of the campaign is done. */
export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="bg-primary h-full rounded-full transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}
