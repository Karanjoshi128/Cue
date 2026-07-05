import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getUsers } from "@/lib/data";
import { ProfileForm } from "@/components/profile-form";
import { TeamManager } from "@/components/team-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [user, users] = await Promise.all([getCurrentUser(), getUsers()]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-muted-foreground text-sm">
          Manage your account and team.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            name={user?.name ?? ""}
            email={user?.email ?? "-"}
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
    </div>
  );
}
