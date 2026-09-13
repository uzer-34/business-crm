import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PERMISSION_CATALOG } from "../src/lib/rbac/permissions.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  for (const permission of PERMISSION_CATALOG) {
    await db.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { description: permission.description, category: permission.category },
    });
  }
  console.log(`Seeded ${PERMISSION_CATALOG.length} permissions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
