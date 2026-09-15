"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError, type TenantContext } from "@/lib/rbac/guard";
import { recordAudit } from "@/lib/audit/record";
import { addRecommendationSchema, createCategorySchema, updateRecommendationSchema } from "@/lib/validation/metadata";
import { getTemplate } from "./attribute-library";
import { resolveChildDepth, seedRecommendationsForCategory } from "./category-service";
import type { ActionResult } from "@/lib/auth/actions";

/*
 * Category administration.
 *
 * Creating categories stays on the catalog permissions (a manager curating the
 * catalog is normal work), but editing what a category *recommends* is
 * configuration and needs organization.manage, in line with every other
 * metadata change.
 */

function categoryPermission(kind: "PRODUCT" | "SERVICE" | "EXPENSE"): "products.edit" | "services.edit" | "expenses.void" {
  if (kind === "PRODUCT") return "products.edit";
  if (kind === "SERVICE") return "services.edit";
  return "expenses.void";
}

export async function createCategoryAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ categoryId: string; seededRecommendations: number }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { kind, name, parentId } = parsed.data;

  try {
    requirePermission(ctx, categoryPermission(kind));
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const depth = await resolveChildDepth(tx, ctx.organizationId, kind, parentId || null);

      const duplicate = await tx.category.findFirst({
        where: { organizationId: ctx.organizationId, kind, parentId: parentId || null, name },
      });
      if (duplicate) throw new ForbiddenError("A category with this name already exists here");

      const created = await tx.category.create({
        data: { organizationId: ctx.organizationId, kind, name, parentId: parentId || null, depth },
      });

      // Recommendations are seeded from the code library when the name matches
      // a known taxonomy; otherwise the category simply starts with none.
      const seeded = await seedRecommendationsForCategory(tx, ctx.organizationId, created.id, name);

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "category.created",
        targetType: "Category",
        targetId: created.id,
        metadata: { kind, name, parentId: parentId || null, seededRecommendations: seeded },
      });

      return { categoryId: created.id, seededRecommendations: seeded };
    });

    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    if (error instanceof Error && error.message === "Parent category not found") {
      return { ok: false, error: "That parent category could not be found." };
    }
    throw error;
  }
}

async function requireRecommendationAccess(
  organizationId: string,
): Promise<{ ctx: TenantContext; userId: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "organization.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: error.message };
    throw error;
  }

  return { ctx, userId: user.id };
}

export async function addRecommendationAction(organizationId: string, input: unknown): Promise<ActionResult> {
  const access = await requireRecommendationAccess(organizationId);
  if ("error" in access) return { ok: false, error: access.error };
  const { ctx, userId } = access;

  const parsed = addRecommendationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const template = getTemplate(parsed.data.templateKey);
  if (!template) return { ok: false, error: "Unknown attribute." };

  const category = await db.category.findFirst({
    where: { id: parsed.data.categoryId, organizationId: ctx.organizationId },
  });
  if (!category) return { ok: false, error: "Category not found." };

  const duplicate = await db.categoryFieldRecommendation.findUnique({
    where: { categoryId_templateKey: { categoryId: parsed.data.categoryId, templateKey: parsed.data.templateKey } },
  });
  if (duplicate) return { ok: false, error: "That attribute is already recommended for this category." };

  await db.$transaction(async (tx) => {
    const last = await tx.categoryFieldRecommendation.findFirst({
      where: { categoryId: parsed.data.categoryId },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });

    const created = await tx.categoryFieldRecommendation.create({
      data: {
        organizationId: ctx.organizationId,
        categoryId: parsed.data.categoryId,
        templateKey: parsed.data.templateKey,
        label: template.label,
        reason: parsed.data.reason || null,
        recommendRequired: parsed.data.recommendRequired,
        displayOrder: (last?.displayOrder ?? -1) + 1,
      },
    });

    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: userId,
      action: "category_recommendation.added",
      targetType: "CategoryFieldRecommendation",
      targetId: created.id,
      metadata: { categoryId: parsed.data.categoryId, templateKey: parsed.data.templateKey },
    });
  });

  return { ok: true, data: undefined };
}

export async function updateRecommendationAction(recommendationId: string, input: unknown): Promise<ActionResult> {
  const existing = await db.categoryFieldRecommendation.findUnique({ where: { id: recommendationId } });
  if (!existing) return { ok: false, error: "Recommendation not found" };

  const access = await requireRecommendationAccess(existing.organizationId);
  if ("error" in access) return { ok: false, error: access.error };
  const { ctx, userId } = access;

  const parsed = updateRecommendationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await db.$transaction(async (tx) => {
    await tx.categoryFieldRecommendation.update({ where: { id: recommendationId }, data: parsed.data });
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: userId,
      action: "category_recommendation.updated",
      targetType: "CategoryFieldRecommendation",
      targetId: recommendationId,
      metadata: { templateKey: existing.templateKey, ...parsed.data },
    });
  });

  return { ok: true, data: undefined };
}

export async function removeRecommendationAction(recommendationId: string): Promise<ActionResult> {
  const existing = await db.categoryFieldRecommendation.findUnique({ where: { id: recommendationId } });
  if (!existing) return { ok: false, error: "Recommendation not found" };

  const access = await requireRecommendationAccess(existing.organizationId);
  if ("error" in access) return { ok: false, error: access.error };
  const { ctx, userId } = access;

  // Removing a recommendation only stops it being suggested; any field already
  // created from it keeps working and keeps its data.
  await db.$transaction(async (tx) => {
    await tx.categoryFieldRecommendation.delete({ where: { id: recommendationId } });
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: userId,
      action: "category_recommendation.removed",
      targetType: "CategoryFieldRecommendation",
      targetId: recommendationId,
      metadata: { categoryId: existing.categoryId, templateKey: existing.templateKey },
    });
  });

  return { ok: true, data: undefined };
}
