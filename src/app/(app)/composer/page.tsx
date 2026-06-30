import { getClients } from "@/lib/data";
import { Composer } from "@/components/composer";

export const dynamic = "force-dynamic";

export default async function ComposerPage() {
  const clients = await getClients();
  const plain = clients.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    accounts: c.accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      displayName: a.displayName,
    })),
  }));
  return <Composer clients={plain} />;
}
