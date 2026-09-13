"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createServiceSchema } from "@/lib/validation/catalog";
import { findOrCreateCategory } from "./category";
import type { ActionResult } from "@/lib/auth/actions";

export async function createServiceAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ serviceId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "services.create");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const service = await db.$transaction(async (tx) => {
    const { categoryName, ...rest } = parsed.data;
    const categoryId = categoryName
      ? await findOrCreateCategory(tx, { organizationId: ctx.organizationId, kind: "SERVICE", name: categoryName })
      : undefined;

    return tx.service.create({
      data: {
        organizationId: ctx.organizationId,
        categoryId,
        createdByUserId: user.id,
        ...rest,
      },
    });
  });

  return { ok: true, data: { serviceId: service.id } };
}
