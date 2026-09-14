"use server";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, assertBranchAccess, ForbiddenError } from "@/lib/rbac/guard";
import { createOrderSchema, fulfillOrderItemSchema, processReturnSchema } from "@/lib/validation/sales";
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
  const { branchId, customerId, assignedToId, vehicleId, odometerReading, notes, items } = parsed.data;

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

  if (vehicleId) {
    const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, organizationId: ctx.organizationId } });
    if (!vehicle) return { ok: false, error: "Vehicle not found" };
    if (customerId && vehicle.customerId !== customerId) {
      return { ok: false, error: "Vehicle does not belong to this customer" };
    }
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
        vehicleId,
        odometerReading,
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

// Restocks inventory and records what came back — deliberately does not
// touch Payment/Invoice/Order.amountPaid. Reversing money already
// collected is a real feature (a credit note, a cash refund) that this
// phase intentionally leaves as a manual follow-up rather than guessing
// at a refund policy no one asked for yet (brief §45/§46: don't build
// what isn't needed, and a feature isn't complete until every one of
// functionality/security/persistence/UX/error-handling/testing is
// actually addressed — silently mutating payment state without a real
// refund flow behind it would fail that bar, not meet it).
export async function processReturnAction(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const parsed = processReturnSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { orderItemId, quantity, reason } = parsed.data;

  const item = await db.orderItem.findUnique({ where: { id: orderItemId }, include: { order: true } });
  if (!item) return { ok: false, error: "Order item not found" };

  const ctx = await loadTenantContext(user.id, item.order.organizationId);
  if (!ctx) return { ok: false, error: "Order item not found" };

  try {
    requirePermission(ctx, "sales.return");
    await assertBranchAccess(ctx, item.order.branchId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  const returnable = item.quantityFulfilled - item.quantityReturned;
  if (quantity > returnable) {
    return { ok: false, error: `Cannot return more than the ${returnable} still with the customer` };
  }

  await db.$transaction(async (tx) => {
    if (item.productId) {
      await applyStockMovement(tx, {
        organizationId: ctx.organizationId,
        branchId: item.order.branchId,
        productId: item.productId,
        variantId: item.variantId,
        type: "RETURN",
        quantityDelta: quantity,
        reason,
        orderItemId: item.id,
        actorUserId: user.id,
      });
    }

    await tx.orderItem.update({
      where: { id: item.id },
      data: { quantityReturned: { increment: quantity } },
    });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "order.item_returned",
        targetType: "OrderItem",
        targetId: item.id,
        metadata: { orderId: item.orderId, quantity, reason: reason ?? null },
      },
    });
  });

  return { ok: true, data: undefined };
}

// Only allowed while nothing has actually happened against the order yet
// (no fulfillment, no payment, no invoice) — same restraint as
// processReturnAction above: reversing stock/payment/invoice state that
// already exists is a real feature (a credit note, a cash refund) this
// action deliberately doesn't guess at. An order that's moved past
// PENDING needs a return, not a cancel.
export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found" };

  const ctx = await loadTenantContext(user.id, order.organizationId);
  if (!ctx) return { ok: false, error: "Order not found" };

  try {
    requirePermission(ctx, "sales.cancel");
    await assertBranchAccess(ctx, order.branchId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (order.status === "CANCELLED") {
    return { ok: false, error: "This order is already cancelled" };
  }

  const [items, invoiceCount] = await Promise.all([
    db.orderItem.findMany({ where: { orderId } }),
    db.invoice.count({ where: { orderId } }),
  ]);

  if (items.some((i) => i.quantityFulfilled > 0)) {
    return { ok: false, error: "Cannot cancel an order that's already been fulfilled — process a return instead" };
  }
  if (new Prisma.Decimal(order.amountPaid).greaterThan(0)) {
    return { ok: false, error: "Cannot cancel an order with a payment already recorded" };
  }
  if (invoiceCount > 0) {
    return { ok: false, error: "Cannot cancel an order that already has an invoice" };
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "order.cancelled",
        targetType: "Order",
        targetId: orderId,
      },
    });

    if (order.customerId) {
      await logActivity(tx, {
        organizationId: ctx.organizationId,
        subjectType: "Customer",
        subjectId: order.customerId,
        type: "order.cancelled",
        actorUserId: user.id,
        metadata: { orderNumber: order.orderNumber },
      });
    }
  });

  return { ok: true, data: undefined };
}

// Order-level mirror of recordOrderPaymentAction, for an order that never
// got invoiced (Order.amountPaid is tracked directly, no Payment ledger
// like Invoice has) — see refundInvoicePaymentAction's comment for why
// this exists now instead of being guessed at earlier.
export async function refundOrderPaymentAction(orderId: string, input: unknown): Promise<ActionResult> {
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

  const amount = new Prisma.Decimal(parsed.data.amount);
  if (amount.greaterThan(order.amountPaid)) {
    return { ok: false, error: `Cannot refund more than the ${order.amountPaid.toString()} paid` };
  }

  const newAmountPaid = new Prisma.Decimal(order.amountPaid).minus(amount);
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
        action: "order.payment_refunded",
        targetType: "Order",
        targetId: orderId,
        metadata: { amount: amount.toString(), paymentStatus },
      },
    });
  });

  return { ok: true, data: undefined };
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
