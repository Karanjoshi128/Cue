import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Production-safe seed: no sample clients or demo posts. It only bootstraps a
// single ADMIN on a brand-new, empty database so local dev (which auto-logs in
// as the first user when Supabase isn't configured) has someone to sign in as.
// On any database that already has users, this is a no-op.
async function main() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(`Seed skipped — ${userCount} user(s) already exist.`);
    return;
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@cue.app";
  await prisma.user.create({
    data: { email, name: "Admin", role: "ADMIN" },
  });
  console.log(`Seed complete: created bootstrap admin ${email}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
