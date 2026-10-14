import { getClients } from "@/lib/data";
import { ClientsManager } from "@/components/clients-manager";
import { isLinkedInPage, linkedinPagesConfigured } from "@/lib/linkedin-pages";
import { COMMENT_SCOPES } from "@/lib/publish";
import { hasAutomationScopes } from "@/lib/automations/config";

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
      // The extra access the account was connected with, so a reconnect asks
      // for it again instead of dropping it: messages too (automations), or
      // comments alone (first comments).
      extra: hasAutomationScopes(a.scopes)
        ? ("automations" as const)
        : COMMENT_SCOPES[a.platform] && a.scopes?.includes(COMMENT_SCOPES[a.platform]!)
          ? ("comments" as const)
          : null,
    })),
  }));
  return (
    <ClientsManager clients={plain} linkedinPages={linkedinPagesConfigured()} />
  );
}
