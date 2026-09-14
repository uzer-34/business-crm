"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, ForbiddenError } from "@/lib/rbac/guard";
import {
  createProductSchema,
  editProductSchema,
  createVariantSchema,
  generateVariantMatrixSchema,
} from "@/lib/validation/catalog";
import { findOrCreateCategory } from "./category";
import { recordAudit } from "@/lib/audit/record";
import type { ActionResult } from "@/lib/auth/actions";

function skuFragment(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

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

      const created = await tx.product.create({
        data: {
          organizationId: ctx.organizationId,
          categoryId,
          createdByUserId: user.id,
          ...rest,
        },
      });

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "product.created",
        targetType: "Product",
        targetId: created.id,
        metadata: { sku: created.sku },
      });

      return created;
    });

    return { ok: true, data: { productId: product.id } };
  } catch {
    return { ok: false, error: "Could not create product" };
  }
}

async function loadProductContext(userId: string, productId: string) {
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) return null;

  const ctx = await loadTenantContext(userId, product.organizationId);
  if (!ctx) return null;

  return { product, ctx };
}

export async function editProductAction(productId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const loaded = await loadProductContext(user.id, productId);
  if (!loaded) return { ok: false, error: "Product not found" };
  const { ctx } = loaded;

  try {
    requirePermission(ctx, "products.edit");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = editProductSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existingSku = await db.product.findFirst({
    where: { organizationId: ctx.organizationId, sku: parsed.data.sku, id: { not: productId } },
  });
  if (existingSku) return { ok: false, error: "A product with this SKU already exists" };

  if (parsed.data.preferredSupplierId) {
    const supplier = await db.supplier.findFirst({
      where: { id: parsed.data.preferredSupplierId, organizationId: ctx.organizationId },
    });
    if (!supplier) return { ok: false, error: "Preferred supplier not found" };
  }

  try {
    await db.$transaction(async (tx) => {
      const { categoryName, ...rest } = parsed.data;
      const categoryId = categoryName
        ? await findOrCreateCategory(tx, { organizationId: ctx.organizationId, kind: "PRODUCT", name: categoryName })
        : null;

      await tx.product.update({ where: { id: productId }, data: { categoryId, ...rest } });

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "product.updated",
        targetType: "Product",
        targetId: productId,
      });
    });

    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: "Could not update product" };
  }
}

export async function archiveProductAction(productId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const loaded = await loadProductContext(user.id, productId);
  if (!loaded) return { ok: false, error: "Product not found" };
  const { ctx } = loaded;

  try {
    requirePermission(ctx, "products.archive");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { archivedAt: new Date() } });
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: user.id,
      action: "product.archived",
      targetType: "Product",
      targetId: productId,
    });
  });

  return { ok: true, data: undefined };
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

// A clothing/retail catalog can easily need a Size x Color combination for
// every product — adding each variant one at a time (createProductVariantAction
// above) doesn't scale to that. Generates every combination, skipping (not
// failing on) any whose derived SKU already exists, so re-running after
// adding a new size/color only creates what's missing.
export async function generateVariantMatrixAction(
  productId: string,
  input: unknown,
): Promise<ActionResult<{ created: number; skipped: number }>> {
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

  const parsed = generateVariantMatrixSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existingVariants = await db.productVariant.findMany({ where: { productId }, select: { sku: true } });
  const existingSkus = new Set(existingVariants.map((v) => v.sku));

  const toCreate: { sku: string; attributes: { size: string; color: string } }[] = [];
  for (const size of parsed.data.sizes) {
    for (const color of parsed.data.colors) {
      const sku = `${product.sku}-${skuFragment(size)}-${skuFragment(color)}`;
      if (existingSkus.has(sku) || toCreate.some((v) => v.sku === sku)) continue;
      toCreate.push({ sku, attributes: { size, color } });
    }
  }

  if (toCreate.length > 0) {
    await db.productVariant.createMany({
      data: toCreate.map((v) => ({ productId, sku: v.sku, attributes: v.attributes })),
    });
  }

  const totalRequested = parsed.data.sizes.length * parsed.data.colors.length;
  return { ok: true, data: { created: toCreate.length, skipped: totalRequested - toCreate.length } };
}
