"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createServiceSchema, editServiceSchema } from "@/lib/validation/catalog";
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

async function loadServiceContext(userId: string, serviceId: string) {
  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service) return null;

  const ctx = await loadTenantContext(userId, service.organizationId);
  if (!ctx) return null;

  return { service, ctx };
}

export async function editServiceAction(serviceId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const loaded = await loadServiceContext(user.id, serviceId);
  if (!loaded) return { ok: false, error: "Service not found" };
  const { ctx } = loaded;

  try {
    requirePermission(ctx, "services.edit");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = editServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.$transaction(async (tx) => {
    const { categoryName, ...rest } = parsed.data;
    const categoryId = categoryName
      ? await findOrCreateCategory(tx, { organizationId: ctx.organizationId, kind: "SERVICE", name: categoryName })
      : null;

    await tx.service.update({ where: { id: serviceId }, data: { categoryId, ...rest } });
  });

  return { ok: true, data: undefined };
}

export async function archiveServiceAction(serviceId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const loaded = await loadServiceContext(user.id, serviceId);
  if (!loaded) return { ok: false, error: "Service not found" };
  const { ctx } = loaded;

  try {
    requirePermission(ctx, "services.archive");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  await db.service.update({ where: { id: serviceId }, data: { archivedAt: new Date() } });
  return { ok: true, data: undefined };
}
