"use server";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, assertBranchAccess, ForbiddenError } from "@/lib/rbac/guard";
import { createOrderSchema, fulfillOrderItemSchema } from "@/lib/validation/sales";
import { recordPaymentSchema } from "@/lib/validation/purchasing";
import { applyStockMovement, getStockQuantity } from "@/lib/inventory/stock";
import { logActivity } from "@/lib/customer/activity";
import type { ActionResult } from "@/lib/auth/actions";

export async function createOrderAction(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ orderId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const ctx = await loadTenantContext(user.id, organizationId);
  if (!ctx) return { ok: false, error: "Not a member of this organization" };

  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { branchId, customerId, assignedToId, notes, items } = parsed.data;

  try {
    requirePermission(ctx, "sales.create");
    await assertBranchAccess(ctx, branchId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (customerId) {
    const customer = await db.customer.findFirst({ where: { id: customerId, organizationId: ctx.organizationId } });
    if (!customer) return { ok: false, error: "Customer not found" };
  }

  if (assignedToId) {
    const membership = await db.membership.findFirst({
      where: { id: assignedToId, organizationId: ctx.organizationId, status: "ACTIVE" },
    });
    if (!membership) return { ok: false, error: "Employee not found in this organization" };
  }

  const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is string => Boolean(id)))];
  const serviceIds = [...new Set(items.map((i) => i.serviceId).filter((id): id is string => Boolean(id)))];
  const [products, services] = await Promise.all([
    db.product.findMany({ where: { id: { in: productIds }, organizationId: ctx.organizationId }, include: { variants: true } }),
    db.service.findMany({ where: { id: { in: serviceIds }, organizationId: ctx.organizationId } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const serviceById = new Map(services.map((s) => [s.id, s]));

  for (const item of items) {
    if (item.productId) {
      const product = productById.get(item.productId);
      if (!product) return { ok: false, error: "One of the selected products was not found" };
      if (item.variantId && !product.variants.some((v) => v.id === item.variantId)) {
        return { ok: false, error: `Selected variant does not belong to ${product.name}` };
      }
    } else if (item.serviceId && !serviceById.has(item.serviceId)) {
      return { ok: false, error: "One of the selected services was not found" };
    }
  }

  let subtotal = new Prisma.Decimal(0);
  let discountTotal = new Prisma.Decimal(0);
  let taxTotal = new Prisma.Decimal(0);
  for (const item of items) {
    const gross = new Prisma.Decimal(item.unitPrice).times(item.quantityOrdered);
    const discount = gross.times(item.discountPercent).dividedBy(100);
    const net = gross.minus(discount);
    subtotal = subtotal.plus(net);
    discountTotal = discountTotal.plus(discount);
    taxTotal = taxTotal.plus(net.times(item.taxRatePercent).dividedBy(100));
  }
  const total = subtotal.plus(taxTotal);

  const order = await db.$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { orderSequence: { increment: 1 } },
    });
    const orderNumber = `SO-${String(org.orderSequence).padStart(4, "0")}`;

    const created = await tx.order.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        customerId,
        assignedToId,
        orderNumber,
        notes,
        subtotal,
        discountTotal,
        taxTotal,
        total,
        createdByUserId: user.id,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            serviceId: item.serviceId,
            quantityOrdered: item.quantityOrdered,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            taxRatePercent: item.taxRatePercent,
          })),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "order.created",
        targetType: "Order",
        targetId: created.id,
        metadata: { orderNumber, branchId, customerId: customerId ?? null, total: total.toString() },
      },
    });

    if (customerId) {
      await logActivity(tx, {
        organizationId: ctx.organizationId,
        subjectType: "Customer",
        subjectId: customerId,
        type: "order.created",
        actorUserId: user.id,
        metadata: { orderNumber },
      });
    }

    return created;
  });

  return { ok: true, data: { orderId: order.id } };
}

export async function fulfillOrderItemAction(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = fulfillOrderItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { orderItemId, quantity } = parsed.data;

  const item = await db.orderItem.findUnique({ where: { id: orderItemId }, include: { order: true } });
  if (!item) return { ok: false, error: "Order item not found" };

  const ctx = await loadTenantContext(user.id, item.order.organizationId);
  if (!ctx) return { ok: false, error: "Order item not found" };

  try {
    requirePermission(ctx, "sales.fulfill");
    await assertBranchAccess(ctx, item.order.branchId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (item.order.status === "CANCELLED") {
    return { ok: false, error: "This order was cancelled" };
  }

  const remaining = item.quantityOrdered - item.quantityFulfilled;
  if (quantity > remaining) {
    return { ok: false, error: `Cannot fulfill more than the ${remaining} remaining` };
  }

  try {
    await db.$transaction(async (tx) => {
      if (item.productId) {
        const currentStock = await getStockQuantity(tx, {
          branchId: item.order.branchId,
          productId: item.productId,
          variantId: item.variantId,
        });
        if (currentStock < quantity) {
          throw new Error(`Insufficient stock: only ${currentStock} available`);
        }

        await applyStockMovement(tx, {
          organizationId: ctx.organizationId,
          branchId: item.order.branchId,
          productId: item.productId,
          variantId: item.variantId,
          type: "SALE",
          quantityDelta: -quantity,
          orderItemId: item.id,
          actorUserId: user.id,
        });
      }

      await tx.orderItem.update({
        where: { id: item.id },
        data: { quantityFulfilled: { increment: quantity } },
      });

      // The update above already ran in this transaction, so this fetch
      // reflects the incremented quantityFulfilled for `item`.
      const allItems = await tx.orderItem.findMany({ where: { orderId: item.orderId } });
      const allFulfilled = allItems.every((i) => i.quantityFulfilled >= i.quantityOrdered);

      await tx.order.update({
        where: { id: item.orderId },
        data: { status: allFulfilled ? "FULFILLED" : "PARTIALLY_FULFILLED" },
      });

      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorUserId: user.id,
          action: "order.item_fulfilled",
          targetType: "OrderItem",
          targetId: item.id,
          metadata: { orderId: item.orderId, quantity },
        },
      });
    });

    return { ok: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fulfill this item";
    return { ok: false, error: message };
  }
}

export async function recordOrderPaymentAction(orderId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found" };

  const ctx = await loadTenantContext(user.id, order.organizationId);
  if (!ctx) return { ok: false, error: "Order not found" };

  try {
    requirePermission(ctx, "sales.fulfill");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const outstanding = new Prisma.Decimal(order.total).minus(order.amountPaid);
  const amount = new Prisma.Decimal(parsed.data.amount);
  if (amount.greaterThan(outstanding)) {
    return { ok: false, error: `Amount exceeds the outstanding balance of ${outstanding.toString()}` };
  }

  const newAmountPaid = new Prisma.Decimal(order.amountPaid).plus(amount);
  const paymentStatus = newAmountPaid.greaterThanOrEqualTo(order.total)
    ? "PAID"
    : newAmountPaid.greaterThan(0)
      ? "PARTIALLY_PAID"
      : "UNPAID";

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { amountPaid: newAmountPaid, paymentStatus },
    });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "order.payment_recorded",
        targetType: "Order",
        targetId: orderId,
        metadata: { amount: amount.toString(), paymentStatus },
      },
    });
  });

  return { ok: true, data: undefined };
}
