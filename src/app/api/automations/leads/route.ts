import { NextResponse, type NextRequest } from "next/server";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/auth";
import { getScopeClientId } from "@/lib/client-scope";
import { workspaceFeatureAvailable, workspaceHasFeature } from "@/lib/plans";

export const dynamic = "force-dynamic";

const SOURCE = { COMMENT: "Comment", STORY_REPLY: "Story reply", DM_KEYWORD: "DM" } as const;

/**
 * One CSV cell. Quoted, and a leading = + - @ is defused, because a lead's
 * "email" is whatever a stranger typed and spreadsheets run formulas.
 */
function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  // Phones are saved as plain digits with an optional +, so they're safe.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d{7,15}$/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}

/** File-name safe: "Kiln Coffee" becomes "kiln-coffee". */
function slug(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

/**
 * The leads list as CSV: the client in the top bar, or every client.
 * ?with=email or ?with=phone keeps only people who shared one.
 */
export async function GET(req: NextRequest) {
  const { user } = await getAuth();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (
    !(await workspaceFeatureAvailable(user.workspaceId, "ig_automations")) ||
    !(await workspaceHasFeature(user.workspaceId, "ig_automations"))
  ) {
    return NextResponse.json({ error: "Instagram automations aren't on." }, { status: 404 });
  }
  const clientId = await getScopeClientId();
  const only = req.nextUrl.searchParams.get("with");
  const leads = await prisma.lead.findMany({
    where: {
      client: { workspaceId: user.workspaceId, ...(clientId ? { id: clientId } : {}) },
      ...(only === "email" ? { email: { not: null } } : only === "phone" ? { phone: { not: null } } : {}),
    },
    orderBy: { lastSeenAt: "desc" },
    include: {
      client: { select: { name: true } },
      account: { select: { displayName: true } },
    },
  });

  const header = [
    "Client",
    "Instagram account",
    "Username",
    "Email",
    "Phone",
    "Source",
    "Last automation",
    "Times",
    "First seen (UTC)",
    "Last seen (UTC)",
    "Tags", "Notes", "Automation paused",
  ];
  const rows = leads.map((l) =>
    [
      l.client.name,
      // Handles without the @, which a spreadsheet could read as a formula.
      l.account.displayName.replace(/^@/, ""),
      l.username ?? "",
      l.email,
      l.phone,
      SOURCE[l.source],
      l.lastRule,
      l.touches,
      l.createdAt.toISOString(),
      l.lastSeenAt.toISOString(),
      l.tags.join("; "), l.notes, l.automationPaused ? "Yes" : "No",
    ]
      .map(cell)
      .join(","),
  );
  // A byte-order mark so Excel reads the file as UTF-8 (names in any script).
  const csv = "﻿" + [header.map(cell).join(","), ...rows].join("\r\n");
  const client = clientId ? await prisma.client.findFirst({ where: { id: clientId }, select: { name: true } }) : null;
  const name = ["cue-leads", client ? slug(client.name) : null, only === "email" || only === "phone" ? `with-${only}` : null]
    .filter(Boolean)
    .join("-");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${format(new Date(), "yyyy-MM-dd")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
