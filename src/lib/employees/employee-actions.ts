"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createInvitationToken, getInvitationExpiry, hashInvitationToken } from "./invitation-token";
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
): Promise<ActionResult<{ membershipId: string; invitationToken: string; expiresAt: string }>> {
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

  const expiresAt = getInvitationExpiry();
  if (!expiresAt) {
    return {
      ok: false,
      error: "Employee invitations are unavailable until EMPLOYEE_INVITATION_TTL_HOURS is set to a whole number from 1 to 720.",
    };
  }

  const role = await db.role.findFirst({
    where: { organizationId: ctx.organizationId, key: parsed.data.roleKey },
    include: { permissions: { include: { permission: true } } },
  });
  if (!role) return { ok: false, error: "Role not found for this organization" };

  if (role.key === "owner" && ctx.roleKey !== "owner") {
    return { ok: false, error: "Only an Owner can invite another Owner" };
  }

  try {
    requireCanGrantRole(
      ctx,
      role.permissions.map((rp) => rp.permission.key),
    );
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (parsed.data.allBranches && !ctx.allBranches) {
    return { ok: false, error: "You cannot grant access to branches you cannot access" };
  }

  if (!parsed.data.allBranches && parsed.data.branchIds.length > 0) {
    const validBranches = await db.branch.count({
      where: { id: { in: parsed.data.branchIds }, organizationId: ctx.organizationId, archivedAt: null },
    });
    if (validBranches !== parsed.data.branchIds.length) {
      return { ok: false, error: "One or more branches were not found" };
    }

    if (!ctx.allBranches) {
      const accessibleBranches = await db.membershipBranch.count({
        where: { membershipId: ctx.membershipId, branchId: { in: parsed.data.branchIds } },
      });
      if (accessibleBranches !== parsed.data.branchIds.length) {
        return { ok: false, error: "You cannot grant access to branches you cannot access" };
      }
    }
  }

  const { identifier } = parsed.data;
  const isEmail = identifier.channel === "EMAIL";
  const { token: invitationToken, tokenHash } = createInvitationToken();

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
      if (existing && existing.status !== "INVITED") {
        throw new EmployeeInvitationError("This person is already a member of this organization");
      }

      let created;
      if (existing) {
        await tx.membershipBranch.deleteMany({ where: { membershipId: existing.id } });
        created = await tx.membership.update({
          where: { id: existing.id },
          data: {
            roleId: role.id,
            allBranches: parsed.data.allBranches,
            invitedAt: new Date(),
            joinedAt: null,
            invitationTokenHash: tokenHash,
            invitationExpiresAt: expiresAt,
            invitedByMembershipId: ctx.membershipId,
            branches: parsed.data.allBranches
              ? undefined
              : { create: parsed.data.branchIds.map((branchId) => ({ branchId })) },
          },
        });
      } else {
        created = await tx.membership.create({
          data: {
            userId: invitedUser.id,
            organizationId: ctx.organizationId,
            roleId: role.id,
            status: "INVITED",
            allBranches: parsed.data.allBranches,
            invitationTokenHash: tokenHash,
            invitationExpiresAt: expiresAt,
            invitedByMembershipId: ctx.membershipId,
            branches: parsed.data.allBranches
              ? undefined
              : { create: parsed.data.branchIds.map((branchId) => ({ branchId })) },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorUserId: user.id,
          action: existing ? "employee.invitation_resent" : "employee.invited",
          targetType: "Membership",
          targetId: created.id,
          metadata: {
            channel: identifier.channel,
            roleKey: parsed.data.roleKey,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      return created;
    });

    return {
      ok: true,
      data: { membershipId: membership.id, invitationToken, expiresAt: expiresAt.toISOString() },
    };
  } catch (error) {
    if (error instanceof EmployeeInvitationError) return { ok: false, error: error.message };
    if (prismaErrorCode(error) === "P2002") {
      return { ok: false, error: "This person is already a member of this organization" };
    }
    return { ok: false, error: "Could not create the invitation. Try again." };
  }
}

class EmployeeInvitationError extends Error {}

function prismaErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export async function acceptEmployeeInvitationAction(token: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in with the invited email or phone before accepting this invitation." };
  if (typeof token !== "string" || token.length !== 43 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return { ok: false, error: "This invitation link is invalid or expired." };
  }

  const tokenHash = hashInvitationToken(token);
  const now = new Date();

  try {
    await db.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { invitationTokenHash: tokenHash },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          branches: { include: { branch: true } },
          invitedByMembership: {
            include: {
              role: { include: { permissions: { include: { permission: true } } } },
              branches: { include: { branch: true } },
            },
          },
        },
      });

      if (
        !membership ||
        membership.status !== "INVITED" ||
        membership.userId !== user.id ||
        !membership.invitationExpiresAt ||
        membership.invitationExpiresAt.getTime() <= now.getTime()
      ) {
        throw new EmployeeInvitationError("This invitation link is invalid or expired, or it belongs to a different account.");
      }

      if (membership.role.organizationId !== membership.organizationId) {
        throw new EmployeeInvitationError("The assigned role is not available in this organization. Ask an Owner to invite you again.");
      }

      const inviter = membership.invitedByMembership;
      if (!inviter || inviter.organizationId !== membership.organizationId || inviter.status !== "ACTIVE") {
        throw new EmployeeInvitationError("The person who sent this invitation is no longer authorized. Ask an Owner to invite you again.");
      }

      const inviterPermissionKeys = new Set(inviter.role.permissions.map((rp) => rp.permission.key));
      if (!inviterPermissionKeys.has("employees.manage")) {
        throw new EmployeeInvitationError("The person who sent this invitation is no longer authorized. Ask an Owner to invite you again.");
      }

      const ungrantablePermission = membership.role.permissions.find(
        (rp) => !inviterPermissionKeys.has(rp.permission.key),
      );
      if (ungrantablePermission) {
        throw new EmployeeInvitationError("The assigned role now contains permissions the inviter cannot grant. Ask an Owner to invite you again.");
      }

      if (membership.allBranches && !inviter.allBranches) {
        throw new EmployeeInvitationError("The inviter no longer has authority to grant access to all branches. Ask an Owner to invite you again.");
      }

      const invitedBranchIds = membership.branches.map((link) => link.branchId);
      if (
        membership.branches.some(
          (link) => link.branch.archivedAt !== null || link.branch.organizationId !== membership.organizationId,
        )
      ) {
        throw new EmployeeInvitationError("One or more invited branches are no longer available. Ask an Owner to invite you again.");
      }
      if (
        !inviter.allBranches &&
        invitedBranchIds.some(
          (branchId) =>
            !inviter.branches.some((link) => link.branchId === branchId && link.branch.archivedAt === null),
        )
      ) {
        throw new EmployeeInvitationError("The inviter no longer has authority to grant one or more branches. Ask an Owner to invite you again.");
      }

      const consumed = await tx.membership.updateMany({
        where: {
          id: membership.id,
          organizationId: membership.organizationId,
          userId: user.id,
          status: "INVITED",
          invitationTokenHash: tokenHash,
          invitationExpiresAt: { gt: now },
          invitedByMembershipId: inviter.id,
        },
        data: {
          status: "ACTIVE",
          joinedAt: now,
          invitationTokenHash: null,
          invitationExpiresAt: null,
          invitedByMembershipId: null,
        },
      });
      if (consumed.count !== 1) {
        throw new EmployeeInvitationError("This invitation has already been used or expired. Ask an Owner to invite you again.");
      }

      await tx.auditLog.create({
        data: {
          organizationId: membership.organizationId,
          actorUserId: user.id,
          action: "employee.invitation_accepted",
          targetType: "Membership",
          targetId: membership.id,
          metadata: { invitedByMembershipId: inviter.id },
        },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof EmployeeInvitationError) return { ok: false, error: error.message };
    if (prismaErrorCode(error) === "P2034") {
      return { ok: false, error: "Membership authorization changed during acceptance. Refresh and try again." };
    }
    return { ok: false, error: "Could not accept this invitation. Try again." };
  }

  return { ok: true, data: undefined };
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

  if (parsed.data.allBranches && !ctx.allBranches) {
    return { ok: false, error: "You cannot grant access to branches you cannot access" };
  }

  if (!parsed.data.allBranches && parsed.data.branchIds.length > 0) {
    const validBranches = await db.branch.count({
      where: { id: { in: parsed.data.branchIds }, organizationId: ctx.organizationId, archivedAt: null },
    });
    if (validBranches !== parsed.data.branchIds.length) {
      return { ok: false, error: "One or more branches were not found" };
    }

    if (!ctx.allBranches) {
      const accessibleBranches = await db.membershipBranch.count({
        where: { membershipId: ctx.membershipId, branchId: { in: parsed.data.branchIds } },
      });
      if (accessibleBranches !== parsed.data.branchIds.length) {
        return { ok: false, error: "You cannot grant access to branches you cannot access" };
      }
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
    // Pending invitations retain a tenant-consistent FK to their issuer.
    // Revoke those links before deleting the issuer; invitees will need a
    // fresh invitation from an active member.
    await tx.membership.updateMany({
      where: { organizationId: ctx.organizationId, status: "INVITED", invitedByMembershipId: membershipId },
      data: { invitationTokenHash: null, invitationExpiresAt: null, invitedByMembershipId: null },
    });
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
