import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { CheckCircle2, XCircle } from "lucide-react";

export const dynamic = "force-dynamic";

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span>{label}</span>
      {ok ? (
        <span className="text-mint flex items-center gap-1">
          <CheckCircle2 className="size-4" /> Configured
        </span>
      ) : (
        <span className="text-muted-foreground flex items-center gap-1">
          <XCircle className="size-4" /> Not set
        </span>
      )}
    </div>
  );
}

export default async function SettingsPage() {
  const user = await getCurrentUser();

  const integrations = [
    { label: "Supabase (database + auth)", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) },
    { label: "Cloudflare R2 (media)", ok: Boolean(process.env.R2_ACCOUNT_ID) },
    { label: "LinkedIn app", ok: Boolean(process.env.LINKEDIN_CLIENT_ID) },
    { label: "Meta / Instagram app", ok: Boolean(process.env.META_APP_ID) },
    { label: "Cron secret", ok: Boolean(process.env.CRON_SECRET) },
    { label: "Token encryption key", ok: Boolean(process.env.TOKEN_ENC_KEY) },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Name</span>
            <span>{user?.name ?? "—"}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email ?? "—"}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Role</span>
            <span className="capitalize">{user?.role.toLowerCase() ?? "—"}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent className="divide-border divide-y">
          {integrations.map((i) => (
            <Status key={i.label} ok={i.ok} label={i.label} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
