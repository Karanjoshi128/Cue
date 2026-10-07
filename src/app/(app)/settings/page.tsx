import { getCurrentUser } from "@/lib/auth";
import { getApiKeys, getUsers, getWorkspace } from "@/lib/data";
import { ProfileForm } from "@/components/profile-form";
import { WorkspaceForm } from "@/components/workspace-form";
import { TeamManager } from "@/components/team-manager";
import { ApiKeysManager } from "@/components/api-keys-manager";
import { ThemePicker } from "@/components/theme-picker";
import { Kbd, PageHeader } from "@/components/page-header";
import { navItems } from "@/components/nav-items";

export const dynamic = "force-dynamic";

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="bg-card scroll-mt-24 rounded-2xl border shadow-[0_1px_2px_0_rgb(20_20_40/0.04)]"
    >
      <div className="border-b px-5 py-4 sm:px-6">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const [user, users, workspace] = await Promise.all([
    getCurrentUser(),
    getUsers(),
    getWorkspace(),
  ]);
  const isAdmin = user?.role === "ADMIN";
  // Admin-only: getApiKeys() itself refuses non-admins, so don't ask.
  const apiKeys = isAdmin ? await getApiKeys() : [];

  const sections = [
    { id: "account", label: "Account" },
    { id: "workspace", label: "Workspace" },
    { id: "team", label: "Team" },
    ...(isAdmin ? [{ id: "api-keys", label: "API keys" }] : []),
    { id: "appearance", label: "Appearance" },
    { id: "shortcuts", label: "Shortcuts" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader
        eyebrow={
          <>
            Settings
            <span className="text-border">/</span>
            {workspace?.name ?? "Workspace"}
          </>
        }
        title={
          <>
            Make it <em>yours.</em>
          </>
        }
        description="Your account, the workspace, who's on the team, and how Cue looks."
      />

      <div className="grid gap-8 lg:grid-cols-[11rem_1fr]">
        <nav
          aria-label="Settings sections"
          className="hidden lg:sticky lg:top-24 lg:block lg:self-start"
        >
          <ul className="border-border space-y-0.5 border-l">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-muted-foreground hover:text-foreground hover:border-foreground -ml-px block border-l border-transparent py-1.5 pl-4 text-sm transition-colors"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <Section
            id="account"
            title="Account"
            description="How you appear to teammates in notes and approvals."
          >
            <ProfileForm
              name={user?.name ?? ""}
              email={user?.email ?? "-"}
              role={user?.role ?? "MANAGER"}
            />
          </Section>

          <Section
            id="workspace"
            title="Workspace"
            description={
              isAdmin
                ? "The name your team sees. Only admins can change it."
                : "The workspace you belong to."
            }
          >
            <WorkspaceForm name={workspace?.name ?? "-"} isAdmin={isAdmin} />
          </Section>

          <Section
            id="team"
            title="Team"
            description="Invited teammates get access as soon as they sign in with that email."
          >
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
          </Section>

          {isAdmin && (
            <Section
              id="api-keys"
              title="API keys"
              description="Let scripts and automations create and schedule posts through the API."
            >
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
            </Section>
          )}

          <Section
            id="appearance"
            title="Appearance"
            description="Paper for daylight, control room for late nights. Saved on this device."
          >
            <ThemePicker />
          </Section>

          <Section
            id="shortcuts"
            title="Keyboard shortcuts"
            description="Move around Cue without reaching for the mouse."
          >
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Command menu</dt>
                <dd className="flex gap-1">
                  <Kbd>Ctrl</Kbd>
                  <Kbd>K</Kbd>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">New post</dt>
                <dd>
                  <Kbd>N</Kbd>
                </dd>
              </div>
              {navItems.map((n) => (
                <div key={n.href} className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Go to {n.label}</dt>
                  <dd className="flex gap-1">
                    <Kbd>G</Kbd>
                    <Kbd>{n.key.toUpperCase()}</Kbd>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground mt-4 text-xs">
              On a Mac, use <Kbd>⌘</Kbd> in place of <Kbd>Ctrl</Kbd>.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
