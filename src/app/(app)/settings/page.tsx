import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getApiKeys, getUsers, getWorkspace } from "@/lib/data";
import { ProfileForm } from "@/components/profile-form";
import { WorkspaceForm } from "@/components/workspace-form";
import { TeamManager } from "@/components/team-manager";
import { ApiKeysManager } from "@/components/api-keys-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [user, users, workspace] = await Promise.all([
    getCurrentUser(),
    getUsers(),
    getWorkspace(),
  ]);
  const isAdmin = user?.role === "ADMIN";
  // Admin-only: getApiKeys() itself refuses non-admins, so don't ask.
  const apiKeys = isAdmin ? await getApiKeys() : [];

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

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>API keys</CardTitle>
          </CardHeader>
          <CardContent>
            <ApiKeysManager
              keys={apiKeys.map((k) => ({
                id: k.id,
                name: k.name,
                prefix: k.prefix,
                lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
                revokedAt: k.revokedAt?.toISOString() ?? null,
                createdAt: k.createdAt.toISOString(),
                createdBy: k.user.name ?? k.user.email,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
