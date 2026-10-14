import { notFound } from "next/navigation";
import { getScopeClientId } from "@/lib/client-scope";
import { getTimeZone } from "@/lib/timezone-server";
import { automationsEnabled } from "@/lib/automations/config";
import { getAutomationsPage } from "@/lib/automations/data";
import { AutomationsView } from "@/components/automations/automations-view";

export const dynamic = "force-dynamic";

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string }>;
}) {
  // Hidden until Meta grants comment and message access (lib/automations/config.ts).
  if (!automationsEnabled()) notFound();

  const [{ connected }, clientId, timeZone] = await Promise.all([
    searchParams,
    getScopeClientId(),
    getTimeZone(),
  ]);
  const data = await getAutomationsPage(clientId);

  return (
    <AutomationsView
      data={data}
      timeZone={timeZone}
      justConnected={connected === "instagram"}
    />
  );
}
