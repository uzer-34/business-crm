"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createBranchSchema } from "@/lib/validation/branch";
import type { ActionResult } from "@/lib/auth/actions";

export async function createBranchAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ branchId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "branches.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createBranchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const branch = await db.branch.create({
    data: { organizationId: ctx.organizationId, ...parsed.data },
  });

  await db.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "branch.created",
      targetType: "Branch",
      targetId: branch.id,
    },
  });

  return { ok: true, data: { branchId: branch.id } };
}
