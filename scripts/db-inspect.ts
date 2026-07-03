import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [users, clients, posts, accounts] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.client.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { posts: true, accounts: true } } },
    }),
    prisma.post.count(),
    prisma.socialAccount.findMany({ include: { client: true } }),
  ]);

  console.log("\n=== USERS ===");
  for (const u of users) console.log(`  ${u.role}  ${u.email}  (${u.name ?? "—"})`);

  console.log("\n=== CLIENTS ===");
  for (const c of clients)
    console.log(
      `  ${c.name}  — ${c._count.accounts} accounts, ${c._count.posts} posts  [${c.id}]`,
    );

  console.log("\n=== CONNECTED ACCOUNTS ===");
  for (const a of accounts)
    console.log(`  ${a.platform}  ${a.displayName}  → client "${a.client.name}"`);

  console.log(`\nTotal posts: ${posts}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
