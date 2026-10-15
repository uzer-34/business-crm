"use server";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { loadTenantContext, requirePermission, assertBranchAccess, ForbiddenError } from "@/lib/rbac/guard";
import { loadAccessibleCustomerInOrganization } from "@/lib/customer/access";
import { recordInvoicePaymentSchema } from "@/lib/validation/invoicing";
import type { ActionResult } from "@/lib/auth/actions";

export async function createInvoiceFromOrderAction(orderId: string): Promise<ActionResult<{ invoiceId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: true, variant: true, service: true } } },
  });
  if (!order) return { ok: false, error: "Order not found" };

  const ctx = await loadTenantContext(user.id, order.organizationId);
  if (!ctx) return { ok: false, error: "Order not found" };

  try {
    requirePermission(ctx, "invoices.create");
    await assertBranchAccess(ctx, order.branchId);
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (order.customerId && !(await loadAccessibleCustomerInOrganization(user.id, order.customerId, ctx.organizationId))) {
    return { ok: false, error: "Customer not found" };
  }

  if (order.status === "CANCELLED") {
    return { ok: false, error: "Cannot invoice a cancelled order" };
  }

  const invoice = await db.$transaction(async (tx) => {
    // Lock the order before checking its invoice state or copying pre-invoice
    // receipts. Order-level payment actions take the same row lock, so a
    // receipt cannot slip in while invoice creation is underway.
    await tx.order.updateMany({ where: { id: order.id }, data: { updatedAt: new Date() } });
    const existing = await tx.invoice.findFirst({ where: { orderId: order.id }, select: { id: true } });
    if (existing) return null;

    const orderPayments = await tx.orderPayment.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    const amountPaid = orderPayments.reduce((total, payment) => total.plus(payment.amount), new Prisma.Decimal(0));
    const paymentStatus = amountPaid.greaterThanOrEqualTo(order.total)
      ? "PAID"
      : amountPaid.greaterThan(0)
        ? "PARTIALLY_PAID"
        : "UNPAID";

    const org = await tx.organization.update({
      where: { id: ctx.organizationId },
      data: { invoiceSequence: { increment: 1 } },
    });
    const invoiceNumber = `INV-${String(org.invoiceSequence).padStart(4, "0")}`;

    const created = await tx.invoice.create({
      data: {
        organizationId: ctx.organizationId,
        orderId: order.id,
        customerId: order.customerId,
        branchId: order.branchId,
        invoiceNumber,
        amountPaid,
        paymentStatus,
        subtotal: order.subtotal,
        discountTotal: order.discountTotal,
        taxTotal: order.taxTotal,
        total: order.total,
        createdByUserId: user.id,
        items: {
          create: order.items.map((item) => ({
            description: item.product
              ? `${item.product.name}${item.variant ? ` (${item.variant.sku})` : ""}`
              : (item.service?.name ?? "Item"),
            quantity: item.quantityOrdered,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            taxRatePercent: item.taxRatePercent,
          })),
        },
      },
    });

    if (orderPayments.length > 0) {
      await tx.payment.createMany({
        data: orderPayments.map((payment) => ({
          organizationId: ctx.organizationId,
          invoiceId: created.id,
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference,
          recordedByUserId: payment.recordedByUserId,
          createdAt: payment.createdAt,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "invoice.created",
        targetType: "Invoice",
        targetId: created.id,
        metadata: { invoiceNumber, orderId: order.id, total: order.total.toString() },
      },
    });

    return created;
  });

  if (!invoice) return { ok: false, error: "An invoice already exists for this order" };

  return { ok: true, data: { invoiceId: invoice.id } };
}

export async function recordInvoicePaymentAction(invoiceId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { ok: false, error: "Invoice not found" };

  const ctx = await loadTenantContext(user.id, invoice.organizationId);
  if (!ctx) return { ok: false, error: "Invoice not found" };

  try {
    requirePermission(ctx, "payments.record");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (invoice.status === "VOID") {
    return { ok: false, error: "This invoice was voided" };
  }

  const parsed = recordInvoicePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const outstanding = new Prisma.Decimal(invoice.total).minus(invoice.amountPaid);
  const amount = new Prisma.Decimal(parsed.data.amount);
  if (amount.greaterThan(outstanding)) {
    return { ok: false, error: `Amount exceeds the outstanding balance of ${outstanding.toString()}` };
  }

  const newAmountPaid = new Prisma.Decimal(invoice.amountPaid).plus(amount);
  const paymentStatus = newAmountPaid.greaterThanOrEqualTo(invoice.total)
    ? "PAID"
    : newAmountPaid.greaterThan(0)
      ? "PARTIALLY_PAID"
      : "UNPAID";

  const recorded = await db.$transaction(async (tx) => {
    // Compare-and-update the cached balance in the same transaction as the
    // payment row. Two requests that read the same balance cannot both apply.
    const updated = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        organizationId: ctx.organizationId,
        amountPaid: invoice.amountPaid,
        status: { not: "VOID" },
      },
      data: { amountPaid: newAmountPaid, paymentStatus },
    });
    if (updated.count !== 1) return false;

    await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        invoiceId,
        amount,
        method: parsed.data.method,
        reference: parsed.data.reference,
        recordedByUserId: user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "payment.recorded",
        targetType: "Invoice",
        targetId: invoiceId,
        metadata: { amount: amount.toString(), method: parsed.data.method, paymentStatus },
      },
    });
    return true;
  });

  if (!recorded) {
    return { ok: false, error: "The invoice balance changed. Refresh and try again." };
  }

  return { ok: true, data: undefined };
}

// Reverses money already collected — the real feature the return flow
// (Phase 12) and order/PO cancel deliberately left open rather than
// guessing at a refund policy. Reuses the existing Payment ledger with a
// negative amount instead of inventing a separate credit-note model: the
// payment history already shows every amount and date, a negative one
// reads as a refund with no new UI concept needed, and Invoice.amountPaid
// (a cached sum of Payment rows) stays correct with no separate code path.
export async function refundInvoicePaymentAction(invoiceId: string, input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { ok: false, error: "Invoice not found" };

  const ctx = await loadTenantContext(user.id, invoice.organizationId);
  if (!ctx) return { ok: false, error: "Invoice not found" };

  try {
    requirePermission(ctx, "payments.record");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (invoice.status === "VOID") {
    return { ok: false, error: "This invoice was voided" };
  }

  const parsed = recordInvoicePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const amount = new Prisma.Decimal(parsed.data.amount);
  if (amount.greaterThan(invoice.amountPaid)) {
    return { ok: false, error: `Cannot refund more than the ${invoice.amountPaid.toString()} paid` };
  }

  const newAmountPaid = new Prisma.Decimal(invoice.amountPaid).minus(amount);
  const paymentStatus = newAmountPaid.greaterThanOrEqualTo(invoice.total)
    ? "PAID"
    : newAmountPaid.greaterThan(0)
      ? "PARTIALLY_PAID"
      : "UNPAID";

  const refunded = await db.$transaction(async (tx) => {
    // Refunds use the same compare-and-update guard as receipts so concurrent
    // requests cannot refund the same cached balance more than once.
    const updated = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        organizationId: ctx.organizationId,
        amountPaid: invoice.amountPaid,
        status: { not: "VOID" },
      },
      data: { amountPaid: newAmountPaid, paymentStatus },
    });
    if (updated.count !== 1) return false;

    await tx.payment.create({
      data: {
        organizationId: ctx.organizationId,
        invoiceId,
        amount: amount.negated(),
        method: parsed.data.method,
        reference: parsed.data.reference,
        recordedByUserId: user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "payment.refunded",
        targetType: "Invoice",
        targetId: invoiceId,
        metadata: { amount: amount.toString(), method: parsed.data.method, paymentStatus },
      },
    });
    return true;
  });

  if (!refunded) {
    return { ok: false, error: "The invoice balance changed. Refresh and try again." };
  }

  return { ok: true, data: undefined };
}

export async function voidInvoiceAction(invoiceId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { ok: false, error: "Invoice not found" };

  const ctx = await loadTenantContext(user.id, invoice.organizationId);
  if (!ctx) return { ok: false, error: "Invoice not found" };

  try {
    requirePermission(ctx, "invoices.void");
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }

  if (invoice.status === "VOID") {
    return { ok: false, error: "This invoice is already void" };
  }
  if (new Prisma.Decimal(invoice.amountPaid).greaterThan(0)) {
    return { ok: false, error: "Cannot void an invoice with recorded payments" };
  }

  const voided = await db.$transaction(async (tx) => {
    // A payment arriving after the preflight read must prevent voiding. The
    // status and balance predicate also serializes against concurrent voids.
    const updated = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        organizationId: ctx.organizationId,
        status: invoice.status,
        amountPaid: invoice.amountPaid,
      },
      data: { status: "VOID", voidedAt: new Date() },
    });
    if (updated.count !== 1) return false;

    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: user.id,
        action: "invoice.voided",
        targetType: "Invoice",
        targetId: invoiceId,
      },
    });
    return true;
  });

  if (!voided) {
    return { ok: false, error: "The invoice changed. Refresh and try again." };
  }

  return { ok: true, data: undefined };
}
