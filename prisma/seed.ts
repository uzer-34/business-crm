import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PERMISSION_CATALOG, SYSTEM_ROLES } from "../src/lib/rbac/permissions.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function seedPermissionCatalog() {
  for (const permission of PERMISSION_CATALOG) {
    await db.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { description: permission.description, category: permission.category },
    });
  }
  console.log(`Seeded ${PERMISSION_CATALOG.length} permissions.`);
}

/**
 * New permission catalog entries only get granted to organizations created
 * *after* the catalog changed (createOrganizationForUser seeds roles from
 * SYSTEM_ROLES once, at creation time). Re-running the seed backfills every
 * existing system role (Owner/Manager/Employee) so their grants stay in
 * sync with SYSTEM_ROLES. Additive only — never revokes a permission the
 * catalog dropped, since an org may be relying on it via a manual grant.
 */
async function backfillSystemRolePermissions() {
  const permissionRows = await db.permission.findMany();
  const permissionIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  let grantsAdded = 0;

  for (const roleTemplate of SYSTEM_ROLES) {
    const roles = await db.role.findMany({
      where: { key: roleTemplate.key, isSystem: true },
      include: { permissions: true },
    });

    for (const role of roles) {
      const existingPermissionIds = new Set(role.permissions.map((rp) => rp.permissionId));
      const missing = roleTemplate.permissions
        .map((key) => permissionIdByKey.get(key))
        .filter((id): id is string => id !== undefined)
        .filter((id) => !existingPermissionIds.has(id));

      if (missing.length > 0) {
        await db.rolePermission.createMany({
          data: missing.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
        grantsAdded += missing.length;
      }
    }
  }

  console.log(`Backfilled ${grantsAdded} role/permission grant(s) on existing organizations.`);
}

async function main() {
  await seedPermissionCatalog();
  await backfillSystemRolePermissions();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
