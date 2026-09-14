"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import type { CategoryKind } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/auth/actions";

// Which permission gates managing a category depends on its kind — the
// same back-office/frontline split used everywhere else in the RBAC
// catalog. Expense categories use expenses.void (the one expense
// permission Employee doesn't get) since there's no dedicated
// expenses.edit key and renaming shared taxonomy is a back-office action,
// same reasoning as voiding one.
function categoryPermission(kind: CategoryKind): "products.edit" | "services.edit" | "expenses.void" {
  if (kind === "PRODUCT") return "products.edit";
  if (kind === "SERVICE") return "services.edit";
  return "expenses.void";
}

async function loadCategoryContext(userId: string, categoryId: string) {
  const category = await db.category.findUnique({ where: { id: categoryId } });
  if (!category) return null;

  const ctx = await loadTenantContext(userId, category.organizationId);
  if (!ctx) return null;

  return { category, ctx };
}

export async function editCategoryAction(categoryId: string, name: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const loaded = await loadCategoryContext(user.id, categoryId);
  if (!loaded) return { ok: false, error: "Category not found" };
  const { category, ctx } = loaded;

  try {
    requirePermission(ctx, categoryPermission(category.kind));
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name is required" };

  const duplicate = await db.category.findFirst({
    where: {
      organizationId: ctx.organizationId,
      kind: category.kind,
      name: { equals: trimmed, mode: "insensitive" },
      id: { not: categoryId },
    },
  });
  if (duplicate) return { ok: false, error: "A category with this name already exists" };

  await db.category.update({ where: { id: categoryId }, data: { name: trimmed } });
  return { ok: true, data: undefined };
}

export async function archiveCategoryAction(categoryId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const loaded = await loadCategoryContext(user.id, categoryId);
  if (!loaded) return { ok: false, error: "Category not found" };
  const { category, ctx } = loaded;

  try {
    requirePermission(ctx, categoryPermission(category.kind));
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  await db.category.update({ where: { id: categoryId }, data: { archivedAt: new Date() } });
  return { ok: true, data: undefined };
}
