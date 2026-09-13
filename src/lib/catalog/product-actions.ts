"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import { createProductSchema, createVariantSchema } from "@/lib/validation/catalog";
import { findOrCreateCategory } from "./category";
import type { ActionResult } from "@/lib/auth/actions";

export async function createProductAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ productId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  try {
    requirePermission(ctx, "products.create");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existingSku = await db.product.findUnique({
    where: { organizationId_sku: { organizationId: ctx.organizationId, sku: parsed.data.sku } },
  });
  if (existingSku) return { ok: false, error: "A product with this SKU already exists" };

  if (parsed.data.preferredSupplierId) {
    const supplier = await db.supplier.findFirst({
      where: { id: parsed.data.preferredSupplierId, organizationId: ctx.organizationId },
    });
    if (!supplier) return { ok: false, error: "Preferred supplier not found" };
  }

  try {
    const product = await db.$transaction(async (tx) => {
      const { categoryName, ...rest } = parsed.data;
      const categoryId = categoryName
        ? await findOrCreateCategory(tx, { organizationId: ctx.organizationId, kind: "PRODUCT", name: categoryName })
        : undefined;

      return tx.product.create({
        data: {
          organizationId: ctx.organizationId,
          categoryId,
          createdByUserId: user.id,
          ...rest,
        },
      });
    });

    return { ok: true, data: { productId: product.id } };
  } catch {
    return { ok: false, error: "Could not create product" };
  }
}

export async function createProductVariantAction(productId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return { ok: false, error: "Product not found" };

  const ctx = await loadTenantContext(user.id, product.organizationId);
  if (!ctx) return { ok: false, error: "Product not found" };

  try {
    requirePermission(ctx, "products.edit");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = createVariantSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existingSku = await db.productVariant.findUnique({
    where: { productId_sku: { productId, sku: parsed.data.sku } },
  });
  if (existingSku) return { ok: false, error: "A variant with this SKU already exists" };

  await db.productVariant.create({
    data: { productId, ...parsed.data },
  });

  return { ok: true, data: undefined };
}
