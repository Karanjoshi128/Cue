import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "manager@cue.app" },
    update: {},
    create: { email: "manager@cue.app", name: "Social Manager", role: "ADMIN" },
  });

  const clients = [
    { name: "Northwind Coffee", color: "#2A6FF2" },
    { name: "Lumen Fitness", color: "#10B981" },
    { name: "Atlas Realty", color: "#F59E0B" },
  ];

  for (const c of clients) {
    const existing = await prisma.client.findFirst({ where: { name: c.name } });
    if (!existing) {
      await prisma.client.create({ data: c });
    }
  }

  const first = await prisma.client.findFirst({ orderBy: { createdAt: "asc" } });
  if (first) {
    const hasPost = await prisma.post.findFirst({ where: { clientId: first.id } });
    if (!hasPost) {
      await prisma.post.create({
        data: {
          clientId: first.id,
          authorId: admin.id,
          body: "Fresh roast just dropped. ☕ Tag a friend who needs a Monday boost!",
          status: "DRAFT",
        },
      });
    }
  }

  console.log("Seed complete:", { admin: admin.email, clients: clients.length });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
