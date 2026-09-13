"use server";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, assertBranchAccess, ForbiddenError } from "@/lib/rbac/guard";
import { createPurchaseOrderSchema, receiveItemSchema, recordPaymentSchema } from "@/lib/validation/purchasing";
import { applyStockMovement } from "@/lib/inventory/stock";
import type { ActionResult } from "@/lib/auth/actions";

export async function createPurchaseOrderAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ purchaseOrderId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  const parsed = createPurchaseOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { branchId, supplierId, notes, items } = parsed.data;

  try {
    requirePermission(ctx, "purchases.create");
    await assertBranchAccess(ctx, branchId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, organizationId: ctx.organizationId, archivedAt: null },
  });
  if (!supplier) return { ok: false, error: "Supplier not found" };

  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await db.product.findMany({
    where: { id: { in: productIds }, organizationId: ctx.organizationId },
    include: { variants: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  for (const item of items) {
    const product = productById.get(item.productId);
    if (!product) return { ok: false, error: "One of the selected products was not found" };
    if (item.variantId && !product.variants.some((v) => v.id === item.variantId)) {
      return { ok: false, error: `Selected variant does not belong to ${product.name}` };
    }
  }

  let subtotal = new Prisma.Decimal(0);
  let taxTotal = new Prisma.Decimal(0);
  for (const item of items) {
    const lineSubtotal = new Prisma.Decimal(item.unitCost).times(item.quantityOrdered);
    subtotal = subtotal.plus(lineSubtotal);
    taxTotal = taxTotal.plus(lineSubtotal.times(item.taxRatePercent).dividedBy(100));
  }
  const total = subtotal.plus(taxTotal);

  const purchaseOrder = await db.$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { poSequence: { increment: 1 } },
    });
    const orderNumber = `PO-${String(org.poSequence).padStart(4, "0")}`;

    const created = await tx.purchaseOrder.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        supplierId,
        orderNumber,
        notes,
        subtotal,
        taxTotal,
        total,
        createdByUserId: user.id,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
            taxRatePercent: item.taxRatePercent,
          })),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "purchase_order.created",
        targetType: "PurchaseOrder",
        targetId: created.id,
        metadata: { orderNumber, supplierId, branchId, total: total.toString() },
      },
    });

    return created;
  });

  return { ok: true, data: { purchaseOrderId: purchaseOrder.id } };
}

export async function receivePurchaseOrderItemAction(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = receiveItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { purchaseOrderItemId, quantity } = parsed.data;

  const item = await db.purchaseOrderItem.findUnique({
    where: { id: purchaseOrderItemId },
    include: { purchaseOrder: true },
  });
  if (!item) return { ok: false, error: "Purchase order item not found" };

  const ctx = await loadTenantContext(user.id, item.purchaseOrder.organizationId);
  if (!ctx) return { ok: false, error: "Purchase order item not found" };

  try {
    requirePermission(ctx, "purchases.receive");
    await assertBranchAccess(ctx, item.purchaseOrder.branchId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (item.purchaseOrder.status === "CANCELLED") {
    return { ok: false, error: "This purchase order was cancelled" };
  }

  const remaining = item.quantityOrdered - item.quantityReceived;
  if (quantity > remaining) {
    return { ok: false, error: `Cannot receive more than the ${remaining} remaining` };
  }

  await db.$transaction(async (tx) => {
    await applyStockMovement(tx, {
      organizationId: ctx.organizationId,
      branchId: item.purchaseOrder.branchId,
      productId: item.productId,
      variantId: item.variantId,
      type: "PURCHASE",
      quantityDelta: quantity,
      purchaseOrderItemId: item.id,
      actorUserId: user.id,
    });

    await tx.purchaseOrderItem.update({
      where: { id: item.id },
      data: { quantityReceived: { increment: quantity } },
    });

    // The update above already ran in this transaction, so this fetch
    // reflects the incremented quantityReceived for `item` — no need to
    // add `quantity` again here.
    const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: item.purchaseOrderId } });
    const allReceived = allItems.every((i) => i.quantityReceived >= i.quantityOrdered);

    await tx.purchaseOrder.update({
      where: { id: item.purchaseOrderId },
      data: { status: allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
    });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "purchase_order.item_received",
        targetType: "PurchaseOrderItem",
        targetId: item.id,
        metadata: { purchaseOrderId: item.purchaseOrderId, quantity },
      },
    });
  });

  return { ok: true, data: undefined };
}

export async function recordPurchaseOrderPaymentAction(
  purchaseOrderId: string,
  input: unknown,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const purchaseOrder = await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
  if (!purchaseOrder) return { ok: false, error: "Purchase order not found" };

  const ctx = await loadTenantContext(user.id, purchaseOrder.organizationId);
  if (!ctx) return { ok: false, error: "Purchase order not found" };

  try {
    requirePermission(ctx, "purchases.receive");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const outstanding = new Prisma.Decimal(purchaseOrder.total).minus(purchaseOrder.amountPaid);
  const amount = new Prisma.Decimal(parsed.data.amount);
  if (amount.greaterThan(outstanding)) {
    return { ok: false, error: `Amount exceeds the outstanding balance of ${outstanding.toString()}` };
  }

  const newAmountPaid = new Prisma.Decimal(purchaseOrder.amountPaid).plus(amount);
  const paymentStatus = newAmountPaid.greaterThanOrEqualTo(purchaseOrder.total)
    ? "PAID"
    : newAmountPaid.greaterThan(0)
      ? "PARTIALLY_PAID"
      : "UNPAID";

  await db.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { amountPaid: newAmountPaid, paymentStatus },
    });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "purchase_order.payment_recorded",
        targetType: "PurchaseOrder",
        targetId: purchaseOrderId,
        metadata: { amount: amount.toString(), paymentStatus },
      },
    });
  });

  return { ok: true, data: undefined };
}
