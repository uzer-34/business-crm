"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import {
  inviteEmployeeSchema,
  changeEmployeeRoleSchema,
  changeEmployeeBranchesSchema,
} from "@/lib/validation/employees";
import type { ActionResult } from "@/lib/auth/actions";

// Nobody can grant a role with a permission they don't hold themselves —
// otherwise a Manager (who already has employees.manage) could invite
// someone into a role with more power than the Manager has, whether that's
// the Owner role or a custom role an Owner built with a broad permission
// set. An Owner's own ctx.permissions always contains the full catalog, so
// this naturally still lets an Owner grant anything, including Owner.
function requireCanGrantRole(ctx: { permissions: Set<string> }, targetRolePermissionKeys: string[]) {
  const missing = targetRolePermissionKeys.find((key) => !ctx.permissions.has(key));
  if (missing) {
    throw new ForbiddenError("You cannot grant a role with permissions you don't have yourself");
  }
}

export async function inviteEmployeeAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ membershipId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "employees.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = inviteEmployeeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const role = await db.role.findFirst({
    where: { organizationId: ctx.organizationId, key: parsed.data.roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  if (!role) return { ok: false, error: "Role not found for this organization" };

  try {
    requireCanGrantRole(
      ctx,
      role.permissions.map((rp) => rp.permission.key),
    );
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (!parsed.data.allBranches && parsed.data.branchIds.length > 0) {
    const validBranches = await db.branch.count({
      where: { id: { in: parsed.data.branchIds }, organizationId: ctx.organizationId, archivedAt: null },
    });
    if (validBranches !== parsed.data.branchIds.length) {
      return { ok: false, error: "One or more branches were not found" };
    }
  }

  const { identifier } = parsed.data;
  const isEmail = identifier.channel === "EMAIL";

  try {
    const membership = await db.$transaction(async (tx) => {
      const invitedUser = await tx.user.upsert({
        where: isEmail ? { email: identifier.target } : { phone: identifier.target },
        create: isEmail ? { email: identifier.target } : { phone: identifier.target },
        update: {},
      });

      const existing = await tx.membership.findUnique({
        where: { userId_organizationId: { userId: invitedUser.id, organizationId: ctx.organizationId } },
      });
      if (existing) {
        throw new Error("This person is already a member of this organization");
      }

      const created = await tx.membership.create({
        data: {
          userId: invitedUser.id,
          organizationId: ctx.organizationId,
          roleId: role.id,
          status: "INVITED",
          allBranches: parsed.data.allBranches,
          branches: parsed.data.allBranches
            ? undefined
            : { create: parsed.data.branchIds.map((branchId) => ({ branchId })) },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorUserId: user.id,
          action: "employee.invited",
          targetType: "Membership",
          targetId: created.id,
          metadata: { channel: identifier.channel, roleKey: parsed.data.roleKey },
        },
      });

      return created;
    });

    return { ok: true, data: { membershipId: membership.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not invite this person";
    return { ok: false, error: message };
  }
}

export async function changeEmployeeRoleAction(membershipId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const membership = await db.membership.findUnique({ where: { id: membershipId } });
  if (!membership) return { ok: false, error: "Membership not found" };

  const ctx = await loadTenantContext(user.id, membership.organizationId);
  if (!ctx) return { ok: false, error: "Membership not found" };

  try {
    requirePermission(ctx, "employees.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = changeEmployeeRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const role = await db.role.findFirst({
    where: { organizationId: ctx.organizationId, key: parsed.data.roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  if (!role) return { ok: false, error: "Role not found for this organization" };

  try {
    requireCanGrantRole(
      ctx,
      role.permissions.map((rp) => rp.permission.key),
    );
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  await db.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membershipId }, data: { roleId: role.id } });
    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "employee.role_changed",
        targetType: "Membership",
        targetId: membershipId,
        metadata: { roleKey: parsed.data.roleKey },
      },
    });
  });

  return { ok: true, data: undefined };
}

export async function suspendEmployeeAction(membershipId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const membership = await db.membership.findUnique({ where: { id: membershipId } });
  if (!membership) return { ok: false, error: "Membership not found" };

  const ctx = await loadTenantContext(user.id, membership.organizationId);
  if (!ctx) return { ok: false, error: "Membership not found" };

  try {
    requirePermission(ctx, "employees.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (membership.id === ctx.membershipId) {
    return { ok: false, error: "You cannot suspend yourself" };
  }
  if (membership.status !== "ACTIVE") {
    return { ok: false, error: "Only active members can be suspended" };
  }

  await db.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } });
    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "employee.suspended",
        targetType: "Membership",
        targetId: membershipId,
      },
    });
  });

  return { ok: true, data: undefined };
}

export async function reactivateEmployeeAction(membershipId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const membership = await db.membership.findUnique({ where: { id: membershipId } });
  if (!membership) return { ok: false, error: "Membership not found" };

  const ctx = await loadTenantContext(user.id, membership.organizationId);
  if (!ctx) return { ok: false, error: "Membership not found" };

  try {
    requirePermission(ctx, "employees.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (membership.status !== "SUSPENDED") {
    return { ok: false, error: "Only suspended members can be reactivated" };
  }

  await db.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membershipId }, data: { status: "ACTIVE" } });
    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "employee.reactivated",
        targetType: "Membership",
        targetId: membershipId,
      },
    });
  });

  return { ok: true, data: undefined };
}

export async function changeEmployeeBranchesAction(membershipId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const membership = await db.membership.findUnique({ where: { id: membershipId } });
  if (!membership) return { ok: false, error: "Membership not found" };

  const ctx = await loadTenantContext(user.id, membership.organizationId);
  if (!ctx) return { ok: false, error: "Membership not found" };

  try {
    requirePermission(ctx, "employees.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = changeEmployeeBranchesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  if (!parsed.data.allBranches && parsed.data.branchIds.length > 0) {
    const validBranches = await db.branch.count({
      where: { id: { in: parsed.data.branchIds }, organizationId: ctx.organizationId, archivedAt: null },
    });
    if (validBranches !== parsed.data.branchIds.length) {
      return { ok: false, error: "One or more branches were not found" };
    }
  }

  await db.$transaction(async (tx) => {
    await tx.membershipBranch.deleteMany({ where: { membershipId } });
    await tx.membership.update({
      where: { id: membershipId },
      data: {
        allBranches: parsed.data.allBranches,
        branches: parsed.data.allBranches
          ? undefined
          : { create: parsed.data.branchIds.map((branchId) => ({ branchId })) },
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "employee.branches_changed",
        targetType: "Membership",
        targetId: membershipId,
        metadata: { allBranches: parsed.data.allBranches, branchIds: parsed.data.branchIds },
      },
    });
  });

  return { ok: true, data: undefined };
}

// A hard delete, not another status like suspend — the person is fully
// severed from the org, not just locked out. Safe to do this way: every FK
// that can point at a Membership (Customer/Task/Order.assignedToId,
// Notification) is either SetNull or cascades in schema.prisma, so real
// history (the customer, the order, the task) survives with its assignment
// cleared, it just isn't silently deleted along with the membership.
export async function removeEmployeeAction(membershipId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const membership = await db.membership.findUnique({ where: { id: membershipId }, include: { role: true } });
  if (!membership) return { ok: false, error: "Membership not found" };

  const ctx = await loadTenantContext(user.id, membership.organizationId);
  if (!ctx) return { ok: false, error: "Membership not found" };

  try {
    requirePermission(ctx, "employees.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (membership.id === ctx.membershipId) {
    return { ok: false, error: "You cannot remove yourself" };
  }

  if (membership.role.key === "owner") {
    const ownerCount = await db.membership.count({
      where: { organizationId: ctx.organizationId, role: { key: "owner" }, status: { not: "SUSPENDED" } },
    });
    if (ownerCount <= 1) {
      return { ok: false, error: "Cannot remove the only Owner" };
    }
  }

  await db.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "employee.removed",
        targetType: "Membership",
        targetId: membershipId,
        metadata: { roleKey: membership.role.key },
      },
    });
    await tx.membership.delete({ where: { id: membershipId } });
  });

  return { ok: true, data: undefined };
}
