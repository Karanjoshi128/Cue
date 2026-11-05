import { getThemesPage } from "@/lib/admin-data";
import { SiteThemeSelector } from "@/components/admin/admin-controls";
import { AdminHeader, Ago, Panel } from "@/components/admin/admin-ui";

export const metadata = { title: "Themes" };

export default async function AdminThemesPage() {
  const { current, lastChange } = await getThemesPage();
  return (
    <>
      <AdminHeader
        eyebrow="Controls"
        title="Themes"
        description="The look of the whole site for a season or a festival. It changes every page for everyone, on top of each person's light or dark setting."
      />
      <Panel
        title="Site theme"
        description="Each card shows the theme in light (left) and dark (right)."
      >
        <SiteThemeSelector current={current} />
        {lastChange && (
          <p className="text-muted-foreground mt-4 text-xs">
            Last changed by {lastChange.actorEmail} <Ago date={lastChange.createdAt} />.
          </p>
        )}
      </Panel>
    </>
  );
}
