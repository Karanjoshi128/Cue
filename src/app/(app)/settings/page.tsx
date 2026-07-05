import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getUsers, getWorkspace } from "@/lib/data";
import { ProfileForm } from "@/components/profile-form";
import { WorkspaceForm } from "@/components/workspace-form";
import { TeamManager } from "@/components/team-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [user, users, workspace] = await Promise.all([
    getCurrentUser(),
    getUsers(),
    getWorkspace(),
  ]);
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="text-muted-foreground text-sm">
          Manage your account, workspace, and team.
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
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkspaceForm name={workspace?.name ?? "-"} isAdmin={isAdmin} />
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
            isAdmin={isAdmin}
          />
        </CardContent>
      </Card>
    </div>
  );
}
