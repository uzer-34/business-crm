import "server-only";
import { db } from "@/lib/db";
import type { PermissionKey } from "./permissions";

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type TenantContext = {
  userId: string;
  membershipId: string;
  organizationId: string;
  roleId: string;
  allBranches: boolean;
  permissions: Set<PermissionKey>;
};

/**
 * Resolves the caller's active membership and permission set purely from
 * their userId (taken from the verified session, never from the request
 * body/query). This is the only supported way to learn a caller's
 * organizationId — callers must never trust an organizationId passed by
 * the client.
 */
export async function loadTenantContext(
  userId: string,
  organizationId: string,
): Promise<TenantContext | null> {
  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return null;
  }

  return {
    userId,
    membershipId: membership.id,
    organizationId: membership.organizationId,
    roleId: membership.roleId,
    allBranches: membership.allBranches,
    permissions: new Set(
      membership.role.permissions.map((rp) => rp.permission.key as PermissionKey),
    ),
  };
}

export function requirePermission(ctx: TenantContext, permission: PermissionKey): void {
  if (!ctx.permissions.has(permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

/**
 * A membership scoped to specific branches may only act on those branches
 * unless allBranches is set. Always check this before reading or writing
 * branch-scoped data.
 */
export async function assertBranchAccess(ctx: TenantContext, branchId: string): Promise<void> {
  if (ctx.allBranches) return;

  const link = await db.membershipBranch.findUnique({
    where: { membershipId_branchId: { membershipId: ctx.membershipId, branchId } },
  });

  if (!link) {
    throw new ForbiddenError("No access to this branch");
  }
}
