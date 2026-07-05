import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { getAuth } from "@/lib/auth";
import { getClients } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, needsOnboarding } = await getAuth();

  if (!user) {
    // Authenticated but no workspace yet → onboarding; otherwise → login.
    redirect(needsOnboarding ? "/onboarding" : "/login");
  }

  const [clients, scopeClientId] = await Promise.all([
    getClients(),
    getScopeClientId(),
  ]);

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          userEmail={user.email}
          clients={clients.map((c) => ({
            id: c.id,
            name: c.name,
            color: c.color,
          }))}
          scopeClientId={scopeClientId}
        />
        <main className="flex-1 px-5 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
