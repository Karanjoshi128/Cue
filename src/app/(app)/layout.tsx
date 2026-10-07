import { redirect } from "next/navigation";
import { format } from "date-fns";
import type { Platform } from "@prisma/client";
import { AppSidebar, type NextCueData } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAuth } from "@/lib/auth";
import { getClientOptions, getNextCue, getWorkspace } from "@/lib/data";
import { getScopeClientId } from "@/lib/client-scope";
import { getTimeZone } from "@/lib/timezone-server";
import { zoned } from "@/lib/timezone";

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

  const scopeClientId = await getScopeClientId();
  const [clients, workspace, cue, timeZone] = await Promise.all([
    getClientOptions(),
    getWorkspace(),
    getNextCue(scopeClientId),
    getTimeZone(),
  ]);

  const nextCue: NextCueData | null =
    cue?.scheduledAt
      ? {
          id: cue.id,
          label: cue.title || cue.body,
          scheduledAt: cue.scheduledAt.toISOString(),
          when: format(cue.scheduledAt, "EEE d MMM · h:mm a", {
            in: zoned(timeZone),
          }),
          clientName: cue.client.name,
          clientColor: cue.client.color,
          platforms: [
            ...new Set(cue.targets.map((t) => t.platform)),
          ] as Platform[],
        }
      : null;

  const shellUser = { name: user.name, email: user.email, role: user.role };
  const workspaceName = workspace?.name ?? "Workspace";

  return (
    <TooltipProvider delay={300}>
      <div className="bg-canvas min-h-dvh md:flex">
        <AppSidebar
          nextCue={nextCue}
          user={shellUser}
          workspaceName={workspaceName}
        />
        <div className="min-w-0 flex-1 md:py-2 md:pr-2">
          {/* The working surface: an inset sheet on md+, full-bleed on phones.
              On md+ it is its own scroll container, so the rail never moves. */}
          <div
            id="app-panel"
            className="bg-background flex min-h-dvh flex-col md:h-[calc(100dvh-1rem)] md:min-h-0 md:overflow-y-auto md:rounded-2xl md:shadow-[0_0_0_1px_var(--border),0_1px_3px_0_rgb(20_20_40/0.04),0_12px_32px_-12px_rgb(20_20_40/0.08)]"
          >
            <AppTopbar
              user={shellUser}
              workspaceName={workspaceName}
              clients={clients}
              scopeClientId={scopeClientId}
              nextCue={nextCue}
            />
            <main className="flex-1 px-4 pt-7 pb-16 sm:px-6 md:px-10 md:pt-10">
              {children}
            </main>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
