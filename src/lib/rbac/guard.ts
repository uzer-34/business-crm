import "server-only";
import { db } from "@/lib/db";
import { isPermissionKey, type PermissionKey } from "./permissions";

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
  /** Stable role key (e.g. "owner"), used for metadata role visibility. */
  roleKey: string;
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

  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    membership.role.organizationId !== membership.organizationId
  ) {
    return null;
  }

  return {
    userId,
    membershipId: membership.id,
    organizationId: membership.organizationId,
    roleId: membership.roleId,
    roleKey: membership.role.key,
    allBranches: membership.allBranches,
    // Fail closed on keys introduced outside the tenant catalog. In
    // particular, platform capabilities must never flow through tenant roles.
    permissions: new Set(
      membership.role.permissions
        .map((rp) => rp.permission.key)
        .filter(isPermissionKey),
    ),
  };
}

export function requirePermission(ctx: TenantContext, permission: PermissionKey): void {
  if (!isPermissionKey(permission) || !ctx.permissions.has(permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

/**
 * A membership scoped to specific branches may only act on those branches
 * unless allBranches is set. Always check this before reading or writing
 * branch-scoped data.
 */
export async function assertBranchAccess(ctx: TenantContext, branchId: string): Promise<void> {
  const branch = await db.branch.findFirst({
    where: { id: branchId, organizationId: ctx.organizationId },
    select: { id: true },
  });

  if (!branch) {
    throw new ForbiddenError("No access to this branch");
  }

  if (ctx.allBranches) return;

  const link = await db.membershipBranch.findUnique({
    where: { membershipId_branchId: { membershipId: ctx.membershipId, branchId } },
  });

  if (!link) {
    throw new ForbiddenError("No access to this branch");
  }
}

/** Returns only branches the active tenant membership may access. */
export async function getAccessibleBranchIds(ctx: TenantContext): Promise<string[]> {
  const branches = await db.branch.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(ctx.allBranches
        ? {}
        : { membershipBranches: { some: { membershipId: ctx.membershipId } } }),
    },
    select: { id: true },
  });

  return branches.map((branch) => branch.id);
}
