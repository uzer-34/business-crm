"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, assertBranchAccess, ForbiddenError } from "@/lib/rbac/guard";
import { recordMovementSchema, transferStockSchema } from "@/lib/validation/inventory";
import { applyStockMovement, getStockQuantity } from "./stock";
import type { ActionResult } from "@/lib/auth/actions";

export async function recordMovementAction(organizationId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  const parsed = recordMovementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { branchId, productId, variantId, type, quantityDelta, reason } = parsed.data;

  try {
    requirePermission(ctx, "inventory.adjust");
    await assertBranchAccess(ctx, branchId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const product = await db.product.findFirst({ where: { id: productId, organizationId: ctx.organizationId } });
  if (!product) return { ok: false, error: "Product not found" };

  try {
    await db.$transaction(async (tx) => {
      if (quantityDelta < 0) {
        const current = await getStockQuantity(tx, { branchId, productId, variantId });
        if (current + quantityDelta < 0) {
          throw new Error("Insufficient stock for this movement");
        }
      }

      await applyStockMovement(tx, {
        organizationId: ctx.organizationId,
        branchId,
        productId,
        variantId,
        type,
        quantityDelta,
        reason,
        actorUserId: user.id,
      });

      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorUserId: user.id,
          action: "inventory.movement_recorded",
          targetType: "Product",
          targetId: productId,
          metadata: { branchId, variantId: variantId ?? null, type, quantityDelta },
        },
      });
    });

    return { ok: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record movement";
    return { ok: false, error: message };
  }
}

export async function transferStockAction(organizationId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  const parsed = transferStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { fromBranchId, toBranchId, productId, variantId, quantity, reason } = parsed.data;

  if (fromBranchId === toBranchId) {
    return { ok: false, error: "Source and destination branches must differ" };
  }

  try {
    requirePermission(ctx, "inventory.transfer");
    await assertBranchAccess(ctx, fromBranchId);
    await assertBranchAccess(ctx, toBranchId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const product = await db.product.findFirst({ where: { id: productId, organizationId: ctx.organizationId } });
  if (!product) return { ok: false, error: "Product not found" };

  const transferGroupId = randomUUID();

  try {
    await db.$transaction(async (tx) => {
      const current = await getStockQuantity(tx, { branchId: fromBranchId, productId, variantId });
      if (current < quantity) {
        throw new Error("Insufficient stock at the source branch");
      }

      await applyStockMovement(tx, {
        organizationId: ctx.organizationId,
        branchId: fromBranchId,
        productId,
        variantId,
        type: "TRANSFER_OUT",
        quantityDelta: -quantity,
        reason,
        transferGroupId,
        actorUserId: user.id,
      });

      await applyStockMovement(tx, {
        organizationId: ctx.organizationId,
        branchId: toBranchId,
        productId,
        variantId,
        type: "TRANSFER_IN",
        quantityDelta: quantity,
        reason,
        transferGroupId,
        actorUserId: user.id,
      });

      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorUserId: user.id,
          action: "inventory.transfer",
          targetType: "Product",
          targetId: productId,
          metadata: { fromBranchId, toBranchId, variantId: variantId ?? null, quantity },
        },
      });
    });

    return { ok: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not transfer stock";
    return { ok: false, error: message };
  }
}
