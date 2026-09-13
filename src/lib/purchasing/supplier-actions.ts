"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createSupplierSchema } from "@/lib/validation/purchasing";
import type { ActionResult } from "@/lib/auth/actions";

export async function createSupplierAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ supplierId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "suppliers.create");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createSupplierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, ...rest } = parsed.data;

  const supplier = await db.supplier.create({
    data: {
      organizationId: ctx.organizationId,
      email: email || undefined,
      ...rest,
      createdByUserId: user.id,
    },
  });

  await db.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "supplier.created",
      targetType: "Supplier",
      targetId: supplier.id,
    },
  });

  return { ok: true, data: { supplierId: supplier.id } };
}
