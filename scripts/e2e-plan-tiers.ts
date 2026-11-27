/*
 * Plan tiers (src/lib/plans.ts): the sign-up tier, the internal Unlimited
 * tier, and the limits each tier enforces, against a THROWAWAY local
 * Postgres. It refuses any database that isn't local with "test" in its name:
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55434/cue_test \
 *   npx tsx scripts/e2e-plan-tiers.ts
 * Push the schema to that database first (prisma db push with a copy of
 * schema.prisma that has the local URL in place of env("DATABASE_URL")).
 */
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CUSTOMER_PLANS,
  getWorkspaceUsage,
  limitProblem,
  overLimits,
  PLAN_ORDER,
  PLANS,
  SIGNUP_PLAN,
} from "@/lib/plans";

const DB = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DB) || !/test/.test(DB.split("/").pop() ?? "")) {
  throw new Error("Refusing: needs a local test database (see the top of this file).");
}

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra === undefined ? "" : "  " + JSON.stringify(extra)}`);
  if (!cond) failures++;
}

const TAG = `tiers-${Date.now()}`;

/** A workspace on `plan` with an admin, `clients` clients and `posts` posts this month. */
async function workspace(plan: Plan | undefined, clients: number, posts = 0, extraMembers = 0) {
  const ws = await prisma.workspace.create({ data: { name: `${TAG} ${plan ?? "default"}`, ...(plan && { plan }) } });
  const admin = await prisma.user.create({
    data: { email: `${ws.id}@test.local`, role: "ADMIN", workspaceId: ws.id },
  });
  await prisma.membership.create({ data: { userId: admin.id, workspaceId: ws.id, role: "ADMIN" } });
  for (let i = 0; i < extraMembers; i++) {
    const u = await prisma.user.create({ data: { email: `${ws.id}-m${i}@test.local`, workspaceId: ws.id } });
    await prisma.membership.create({ data: { userId: u.id, workspaceId: ws.id } });
  }
  const ids: string[] = [];
  for (let i = 0; i < clients; i++) {
    ids.push((await prisma.client.create({ data: { name: `Client ${i}`, workspaceId: ws.id } })).id);
  }
  if (posts) {
    await prisma.post.createMany({
      data: Array.from({ length: posts }, (_, i) => ({ clientId: ids[0], authorId: admin.id, body: `Post ${i}` })),
    });
  }
  return ws;
}

async function main() {
  // --- The tiers themselves ---------------------------------------------
  check("customers see exactly Free, Pro, Agency", JSON.stringify(CUSTOMER_PLANS) === JSON.stringify(["FREE", "PRO", "AGENCY"]), CUSTOMER_PLANS);
  check("Unlimited is internal", PLANS.UNLIMITED.internal === true);
  check("every plan has an order slot", PLAN_ORDER.length === Object.keys(PLANS).length);
  check("sign-ups start on Free", SIGNUP_PLAN === "FREE");

  const plain = await workspace(undefined, 0);
  check("a workspace created without a plan is Free (schema default)", plain.plan === "FREE", plain.plan);

  // --- Free: 2 clients, 2 members, 30 posts a month ---------------------
  const free = await workspace("FREE", 2, 30, 1);
  const clientMsg = await limitProblem(free.id, "clients");
  check("Free at 2 clients refuses a third", clientMsg?.includes("Free plan includes 2 clients") === true, clientMsg);
  check("Free at 2 members refuses a third", (await limitProblem(free.id, "members"))?.includes("2 team members") === true);
  check("Free at 30 posts refuses the 31st", (await limitProblem(free.id, "postsPerMonth"))?.includes("30 posts a month") === true);
  check("Free with no keys allows its 1 API key", (await limitProblem(free.id, "apiKeys")) === null);
  check("Free allows an upload under 1 GB", (await limitProblem(free.id, "storageBytes", 10 * 1024 * 1024)) === null);
  check("Free refuses an upload over 1 GB", (await limitProblem(free.id, "storageBytes", 1024 ** 3 + 1)) !== null);

  // --- Pro and Agency, and the internal tier -----------------------------
  const pro = await workspace("PRO", 2, 30, 1);
  check("Pro at 2 clients allows more", (await limitProblem(pro.id, "clients")) === null);
  check("Pro at 30 posts allows more", (await limitProblem(pro.id, "postsPerMonth")) === null);
  const pro10 = await workspace("PRO", 10);
  check("Pro at 10 clients refuses an 11th", (await limitProblem(pro10.id, "clients"))?.includes("Pro plan includes 10 clients") === true);
  const agency = await workspace("AGENCY", 10);
  check("Agency at 10 clients allows more", (await limitProblem(agency.id, "clients")) === null);
  const unlimited = await workspace("UNLIMITED", 10, 30, 3);
  check("Unlimited has no client limit", (await limitProblem(unlimited.id, "clients", 1000)) === null);
  check("Unlimited has no post limit", (await limitProblem(unlimited.id, "postsPerMonth", 10_000)) === null);

  // --- What a downgrade leaves over (setWorkspacePlan's message) ---------
  const usage = await getWorkspaceUsage(pro10.id);
  const over = overLimits("FREE", usage);
  check("Pro -> Free with 10 clients reports clients 10 of 2", over.length === 1 && over[0].key === "clients" && over[0].used === 10 && over[0].limit === 2, over);
  check("Pro -> Agency reports nothing over", overLimits("AGENCY", usage).length === 0);
  check("anything -> Unlimited reports nothing over", overLimits("UNLIMITED", await getWorkspaceUsage(unlimited.id)).length === 0);
  check("at the limit is not over it", overLimits("FREE", await getWorkspaceUsage(free.id)).length === 0, overLimits("FREE", await getWorkspaceUsage(free.id)));

  // --- Clean up -----------------------------------------------------------
  const mine = await prisma.workspace.findMany({ where: { name: { startsWith: TAG } }, select: { id: true } });
  const wsIds = mine.map((w) => w.id);
  await prisma.post.deleteMany({ where: { client: { workspaceId: { in: wsIds } } } });
  await prisma.membership.deleteMany({ where: { workspaceId: { in: wsIds } } });
  await prisma.user.deleteMany({ where: { workspaceId: { in: wsIds } } });
  await prisma.workspace.deleteMany({ where: { id: { in: wsIds } } });

  await prisma.$disconnect();
  console.log(failures ? `\n${failures} FAILED` : "\nAll plan tier checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
