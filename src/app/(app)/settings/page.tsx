import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getUsers } from "@/lib/data";
import { ProfileForm } from "@/components/profile-form";
import { TeamManager } from "@/components/team-manager";
import { LinkedinIcon, InstagramIcon } from "@/components/platform-icons";
import { Database, HardDrive, Clock, KeyRound } from "lucide-react";

export const dynamic = "force-dynamic";

function Status({
  ok,
  label,
  icon: Icon,
}: {
  ok: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 text-sm">
      <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-lg">
        <Icon className="size-4" />
      </span>
      <span className="flex-1">{label}</span>
      {ok ? (
        <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-full px-2 py-0.5 text-xs font-medium">
          Configured
        </span>
      ) : (
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-medium">
          Not set
        </span>
      )}
    </div>
  );
}

export default async function SettingsPage() {
  const [user, users] = await Promise.all([getCurrentUser(), getUsers()]);

  const integrations = [
    { label: "Supabase (database + auth)", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), icon: Database },
    { label: "Cloudflare R2 (media)", ok: Boolean(process.env.R2_ACCOUNT_ID), icon: HardDrive },
    { label: "LinkedIn app", ok: Boolean(process.env.LINKEDIN_CLIENT_ID), icon: LinkedinIcon },
    { label: "Meta / Instagram app", ok: Boolean(process.env.META_APP_ID), icon: InstagramIcon },
    { label: "Cron secret", ok: Boolean(process.env.CRON_SECRET), icon: Clock },
    { label: "Token encryption key", ok: Boolean(process.env.TOKEN_ENC_KEY), icon: KeyRound },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-muted-foreground text-sm">
          Manage your account, team, and integrations.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            name={user?.name ?? ""}
            email={user?.email ?? "—"}
            role={user?.role ?? "MANAGER"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamManager
            members={users.map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role,
            }))}
            currentUserId={user?.id ?? ""}
            isAdmin={user?.role === "ADMIN"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {integrations.map((i) => (
            <Status key={i.label} ok={i.ok} label={i.label} icon={i.icon} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
