import { getClients } from "@/lib/data";
import { ClientsManager } from "@/components/clients-manager";
import { isLinkedInPage, linkedinPagesConfigured } from "@/lib/linkedin-pages";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await getClients();
  const plain = clients.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    postCount: c._count.posts,
    accounts: c.accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      displayName: a.displayName,
      tokenExpires: a.tokenExpires?.toISOString() ?? null,
      renewable: a.refreshToken !== null,
      isPage: isLinkedInPage(a.externalId),
    })),
  }));
  return (
    <ClientsManager clients={plain} linkedinPages={linkedinPagesConfigured()} />
  );
}
