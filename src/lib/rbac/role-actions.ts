"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createRoleSchema, updateRolePermissionsSchema, renameRoleSchema } from "@/lib/validation/roles";
import type { ActionResult } from "@/lib/auth/actions";

export async function createCustomRoleAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ roleId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "roles.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.role.findFirst({
    where: { organizationId: ctx.organizationId, key: parsed.data.key },
  });
  if (existing) return { ok: false, error: "A role with this key already exists" };

  const permissionRows = await db.permission.findMany({
    where: { key: { in: parsed.data.permissionKeys } },
  });

  const role = await db.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        organizationId: ctx.organizationId,
        key: parsed.data.key,
        name: parsed.data.name,
        isSystem: false,
      },
    });

    if (permissionRows.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionRows.map((p) => ({ roleId: created.id, permissionId: p.id })),
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "role.created",
        targetType: "Role",
        targetId: created.id,
        metadata: { key: parsed.data.key, name: parsed.data.name },
      },
    });

    return created;
  });

  return { ok: true, data: { roleId: role.id } };
}

export async function renameRoleAction(roleId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) return { ok: false, error: "Role not found" };

  const ctx = await loadTenantContext(user.id, role.organizationId);
  if (!ctx) return { ok: false, error: "Role not found" };

  try {
    requirePermission(ctx, "roles.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = renameRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.role.update({ where: { id: roleId }, data: { name: parsed.data.name } });
  return { ok: true, data: undefined };
}

// System roles can have their permissions adjusted (per schema.prisma's own
// comment on Role.isSystem) EXCEPT Owner, which always keeps the full
// catalog — it's the safety-net role; letting someone strip roles.manage
// (or anything else) from it risks locking every Owner in the org out of
// managing roles at all, with no way back in through the UI.
export async function updateRolePermissionsAction(roleId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) return { ok: false, error: "Role not found" };

  const ctx = await loadTenantContext(user.id, role.organizationId);
  if (!ctx) return { ok: false, error: "Role not found" };

  try {
    requirePermission(ctx, "roles.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (role.key === "owner") {
    return { ok: false, error: "The Owner role always keeps every permission" };
  }

  const parsed = updateRolePermissionsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const permissionRows = await db.permission.findMany({
    where: { key: { in: parsed.data.permissionKeys } },
  });

  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    if (permissionRows.length > 0) {
      await tx.rolePermission.createMany({
        data: permissionRows.map((p) => ({ roleId, permissionId: p.id })),
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "role.permissions_changed",
        targetType: "Role",
        targetId: roleId,
        metadata: { permissionKeys: parsed.data.permissionKeys },
      },
    });
  });

  return { ok: true, data: undefined };
}

export async function deleteCustomRoleAction(roleId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role) return { ok: false, error: "Role not found" };

  const ctx = await loadTenantContext(user.id, role.organizationId);
  if (!ctx) return { ok: false, error: "Role not found" };

  try {
    requirePermission(ctx, "roles.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (role.isSystem) {
    return { ok: false, error: "System roles cannot be deleted" };
  }

  const memberCount = await db.membership.count({ where: { roleId } });
  if (memberCount > 0) {
    return { ok: false, error: `${memberCount} member(s) still hold this role — reassign them first` };
  }

  await db.$transaction(async (tx) => {
    await tx.role.delete({ where: { id: roleId } });
    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "role.deleted",
        targetType: "Role",
        targetId: roleId,
        metadata: { key: role.key, name: role.name },
      },
    });
  });

  return { ok: true, data: undefined };
}
