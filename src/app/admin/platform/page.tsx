import { getPlatformPage } from "@/lib/admin-data";
import { AnnouncementControl, PauseControl } from "@/components/admin/admin-controls";
import { AdminHeader, Ago, Mono, Panel } from "@/components/admin/admin-ui";
import { automationsEnabled } from "@/lib/automations/config";

export const metadata = { title: "Platform" };

export default async function AdminPlatformPage() {
  const { settings, heartbeat, automationsHeartbeat, admins } = await getPlatformPage();
  return (
    <>
      <AdminHeader
        eyebrow="Controls"
        title="Platform"
        description="Switches that affect every workspace at once."
      />
      <Panel title="Publishing" description="The emergency brake, for an outage or a platform misbehaving.">
        <PauseControl paused={settings.publishingPaused} reason={settings.pausedReason} />
      </Panel>
      <Panel title="Announcement banner" description="A message at the top of the app for every signed-in user.">
        <AnnouncementControl current={settings.announcement} tone={settings.announcementTone} />
      </Panel>
      <Panel title="Publisher heartbeat">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Last run</dt>
          <dd>{heartbeat ? <Ago date={heartbeat.lastRunAt} /> : "None recorded yet"}</dd>
          <dt className="text-muted-foreground">Result</dt>
          <dd>{heartbeat ? (heartbeat.ok ? "OK" : <span className="text-destructive">{heartbeat.error}</span>) : "-"}</dd>
          <dt className="text-muted-foreground">Details</dt>
          <dd className="min-w-0 break-all"><Mono>{heartbeat?.summary ? JSON.stringify(heartbeat.summary) : "-"}</Mono></dd>
        </dl>
      </Panel>
      {automationsEnabled() && (
        <Panel title="Instagram automations heartbeat" description="The every-minute comment check (POST /api/cron/automations).">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-muted-foreground">Last run</dt>
            <dd>{automationsHeartbeat ? <Ago date={automationsHeartbeat.lastRunAt} /> : "None recorded yet"}</dd>
            <dt className="text-muted-foreground">Result</dt>
            <dd>{automationsHeartbeat ? (automationsHeartbeat.ok ? "OK" : <span className="text-destructive">{automationsHeartbeat.error}</span>) : "-"}</dd>
            <dt className="text-muted-foreground">Details</dt>
            <dd className="min-w-0 break-all"><Mono>{automationsHeartbeat?.summary ? JSON.stringify(automationsHeartbeat.summary) : "-"}</Mono></dd>
          </dl>
        </Panel>
      )}
      <Panel title="Platform admins" description="Set with the PLATFORM_ADMIN_EMAILS environment variable (comma-separated). Without it, the default below applies.">
        <ul className="space-y-1 text-sm">
          {admins.map((a) => (
            <li key={a}><Mono>{a}</Mono></li>
          ))}
        </ul>
        {settings.updatedBy && (
          <p className="text-muted-foreground mt-3 text-xs">
            Settings last changed by {settings.updatedBy} <Ago date={settings.updatedAt} />.
          </p>
        )}
      </Panel>
    </>
  );
}
