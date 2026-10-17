import { getClients } from "@/lib/data";
import { ClientsManager } from "@/components/clients-manager";
import { isLinkedInPage, linkedinPagesConfigured } from "@/lib/linkedin-pages";
import { COMMENT_SCOPES } from "@/lib/publish";

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
      // Connected with comment access (first comments), so a reconnect asks
      // for it again instead of dropping it.
      comments: Boolean(COMMENT_SCOPES[a.platform] && a.scopes?.includes(COMMENT_SCOPES[a.platform]!)),
    })),
  }));
  return (
    <ClientsManager clients={plain} linkedinPages={linkedinPagesConfigured()} />
  );
}
