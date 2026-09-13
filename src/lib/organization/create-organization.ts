import "server-only";
import { db } from "@/lib/db";
import { SYSTEM_ROLES } from "@/lib/rbac/permissions";
import type { CreateOrganizationInput } from "@/lib/validation/organization";

/**
 * Creates an organization together with its default branch, its seeded
 * system roles (Owner/Manager/Employee, wired to the global permission
 * catalog), and an ACTIVE Owner membership for the creating user. Runs in a
 * single transaction so a failure partway through never leaves an
 * org without an owner.
 */
export async function createOrganizationForUser(userId: string, input: CreateOrganizationInput) {
  return db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.name,
        countryCode: input.countryCode,
        currencyCode: input.currencyCode,
        timezone: input.timezone,
        locale: input.locale,
        industryKey: input.industryKey,
      },
    });

    await tx.branch.create({
      data: {
        organizationId: organization.id,
        name: "Main Branch",
        countryCode: input.countryCode,
        isDefault: true,
      },
    });

    const permissionRows = await tx.permission.findMany();
    if (permissionRows.length === 0) {
      throw new Error("Permission catalog is not seeded. Run `npm run db:seed` first.");
    }
    const permissionByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

    let ownerRoleId: string | null = null;
    for (const roleTemplate of SYSTEM_ROLES) {
      const role = await tx.role.create({
        data: {
          organizationId: organization.id,
          key: roleTemplate.key,
          name: roleTemplate.name,
          isSystem: true,
        },
      });
      if (roleTemplate.key === "owner") ownerRoleId = role.id;

      const permissionIds = roleTemplate.permissions
        .map((key) => permissionByKey.get(key))
        .filter((id): id is string => Boolean(id));

      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }
    }

    if (!ownerRoleId) {
      throw new Error("Owner role was not seeded");
    }

    await tx.membership.create({
      data: {
        userId,
        organizationId: organization.id,
        roleId: ownerRoleId,
        status: "ACTIVE",
        allBranches: true,
        joinedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        actorUserId: userId,
        action: "organization.created",
        targetType: "Organization",
        targetId: organization.id,
      },
    });

    return organization;
  });
}
