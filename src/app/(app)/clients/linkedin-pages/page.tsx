import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { pageUrn, readPending, type LinkedInPage } from "@/lib/linkedin-pages";
import { LinkedInPagePicker } from "@/components/linkedin-page-picker";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/**
 * Step two of connecting LinkedIn Pages: LinkedIn has shared the Pages this
 * member can post to (see /api/oauth/linkedin-page/callback), and the user
 * assigns each one to a client. One consent covers every client, which keeps
 * the connect inside the Development tier's daily call limit.
 */
export default async function LinkedInPagesPage() {
  const user = await requireUser();
  const pending = await readPending(user.id);
  if (!pending) return <Expired />;

  const clients = await prisma.client.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      accounts: { where: { platform: "LINKEDIN" }, select: { externalId: true } },
    },
  });

  const pages = pending.pages.map((page) => {
    const connectedTo = clients.filter((c) =>
      c.accounts.some((a) => a.externalId === pageUrn(page.id)),
    );
    return {
      ...page,
      connectedTo: connectedTo.map((c) => c.name),
      suggested: suggestClient(page, clients, connectedTo[0]?.id, {
        originId: pending.token.clientId,
        onlyPage: pending.pages.length === 1,
      }),
    };
  });

  return (
    <LinkedInPagePicker
      pages={pages}
      clients={clients.map(({ id, name, color }) => ({ id, name, color }))}
    />
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The client a Page most likely belongs to: the one it's already connected
 * to (so reconnecting is one click), then a client whose name matches the
 * Page's, then the card the connect started from if LinkedIn returned a
 * single Page. Otherwise nothing, so no Page is connected by guesswork.
 */
function suggestClient(
  page: LinkedInPage,
  clients: { id: string; name: string }[],
  connectedClientId: string | undefined,
  { originId, onlyPage }: { originId: string; onlyPage: boolean },
): string | null {
  if (connectedClientId) return connectedClientId;
  const p = norm(page.name);
  if (p.length >= 3) {
    const match = clients.find((c) => {
      const n = norm(c.name);
      return n.length >= 3 && (n === p || p.includes(n) || n.includes(p));
    });
    if (match) return match.id;
  }
  if (onlyPage && clients.some((c) => c.id === originId)) return originId;
  return null;
}

function Expired() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Clients / LinkedIn Pages"
        title={
          <>
            This link has <em>expired.</em>
          </>
        }
        description="The LinkedIn Page connection is only held for 15 minutes. Start again from a client's card with the LinkedIn Page button."
      />
      <Button render={<Link href="/clients" />}>Back to Clients</Button>
    </div>
  );
}
