import "server-only";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  loadPlatformContext,
  PlatformForbiddenError,
  requirePlatformCapability,
} from "../authorization";
import { validatePlatformPurchaseSchedule } from "./billing";

const entitlementState = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "REVOKED"]);
const transitionInput = z.object({
  entitlementId: z.string().trim().min(1).max(128),
  expectedState: entitlementState,
  nextState: entitlementState,
  decisionReference: z.string().trim().min(8).max(160),
});

const pendingPaymentInput = z.object({
  purchaseId: z.string().trim().min(1).max(128),
  scheduleItemId: z.string().trim().min(1).max(128),
  amount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  externalReference: z.string().trim().max(160).optional(),
});

const purchaseInput = z.object({
  organizationId: z.string().trim().min(1).max(128),
  kind: z.enum(["LIFETIME", "SUBSCRIPTION", "INSTALLMENT"]),
  contractAmount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  billingIntervalUnit: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]).optional(),
  billingIntervalCount: z.number().int().positive().optional(),
  schedule: z.array(z.object({
    sequence: z.number().int().positive(),
    dueAt: z.coerce.date(),
    amount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  })).min(1).max(240),
}).superRefine((value, context) => {
  const hasInterval = value.billingIntervalUnit !== undefined || value.billingIntervalCount !== undefined;
  if (value.kind === "SUBSCRIPTION" &&
    (value.billingIntervalUnit === undefined || value.billingIntervalCount === undefined)) {
    context.addIssue({ code: "custom", message: "Subscriptions require an explicit billing interval" });
  }
  if (value.kind !== "SUBSCRIPTION" && hasInterval) {
    context.addIssue({ code: "custom", message: "Billing intervals apply only to subscriptions" });
  }
});

export class PlatformLicensingConflictError extends Error {
  constructor() {
    super("Licensing record changed concurrently; reload and retry");
    this.name = "PlatformLicensingConflictError";
  }
}

async function currentPlatformContext(capability: "platform.licensing.manage" | "platform.payments.record") {
  const user = await getCurrentUser();
  if (!user) throw new PlatformForbiddenError();
  return requirePlatformCapability(await loadPlatformContext(user.id), capability);
}

/** Creates a pending control-plane purchase record; it grants no tenant access. */
export async function createPlatformPurchaseRecord(input: unknown): Promise<{ purchaseId: string }> {
  const parsed = purchaseInput.parse(input);
  const context = await currentPlatformContext("platform.licensing.manage");
  const scheduleKind = parsed.kind === "LIFETIME"
    ? "LIFETIME_PAYMENT" as const
    : parsed.kind === "SUBSCRIPTION"
      ? "SUBSCRIPTION_CYCLE" as const
      : "INSTALLMENT" as const;
  const schedule = parsed.schedule.map((item) => ({
    ...item,
    kind: scheduleKind,
    currencyCode: parsed.currencyCode,
  }));
  validatePlatformPurchaseSchedule({
    kind: parsed.kind,
    contractAmount: parsed.contractAmount,
    currencyCode: parsed.currencyCode,
    schedule,
  });

  return db.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { id: parsed.organizationId },
      select: { id: true },
    });
    if (!organization) throw new Error("Organization was not found");

    const purchase = await tx.platformPurchase.create({
      data: {
        organizationId: organization.id,
        kind: parsed.kind,
        contractAmount: parsed.contractAmount,
        currencyCode: parsed.currencyCode,
        billingIntervalUnit: parsed.billingIntervalUnit ?? null,
        billingIntervalCount: parsed.billingIntervalCount ?? null,
        entitlement: { create: { state: "PENDING" } },
        schedule: {
          create: schedule.map(({ kind, sequence, dueAt, amount, currencyCode }) => ({
            kind,
            sequence,
            dueAt,
            amount,
            currencyCode,
          })),
        },
      },
      select: { id: true },
    });
    await tx.platformAuditLog.create({
      data: {
        actorPrincipalId: context.principalId,
        action: "platform.licensing.purchase_record_created",
        targetType: "PlatformPurchase",
        targetId: purchase.id,
        metadata: {
          organizationId: organization.id,
          kind: parsed.kind,
          contractAmount: parsed.contractAmount,
          currencyCode: parsed.currencyCode,
          scheduleCount: schedule.length,
        },
      },
      select: { id: true },
    });
    return { purchaseId: purchase.id };
  });
}

/**
 * Applies only the requested, explicitly authorized state change. There are
 * no date-, payment-, or tenant-access-driven transitions in this module.
 */
export async function transitionPlatformEntitlement(input: unknown): Promise<void> {
  const parsed = transitionInput.parse(input);
  if (parsed.expectedState === parsed.nextState) {
    throw new Error("The next entitlement state must differ from the expected state");
  }
  const context = await currentPlatformContext("platform.licensing.manage");

  await db.$transaction(async (tx) => {
    const changed = await tx.platformEntitlement.updateMany({
      where: { id: parsed.entitlementId, state: parsed.expectedState },
      data: { state: parsed.nextState },
    });
    if (changed.count !== 1) throw new PlatformLicensingConflictError();

    await tx.platformAuditLog.create({
      data: {
        actorPrincipalId: context.principalId,
        action: "platform.licensing.entitlement_state_changed",
        targetType: "PlatformEntitlement",
        targetId: parsed.entitlementId,
        metadata: {
          from: parsed.expectedState,
          to: parsed.nextState,
          decisionReference: parsed.decisionReference,
        },
      },
      select: { id: true },
    });
  });
}

/**
 * Records a provider-neutral pending receipt only. It cannot mark money
 * settled, verify payment, initiate a refund, or change entitlement state.
 */
export async function recordPendingPlatformReceipt(input: unknown): Promise<{ paymentId: string }> {
  const parsed = pendingPaymentInput.parse(input);
  const context = await currentPlatformContext("platform.payments.record");

  return db.$transaction(async (tx) => {
    const scheduleItem = await tx.platformBillingScheduleItem.findUnique({
      where: {
        purchaseId_id: { purchaseId: parsed.purchaseId, id: parsed.scheduleItemId },
      },
      select: {
        id: true,
        purchaseId: true,
        status: true,
        currencyCode: true,
        purchase: { select: { currencyCode: true } },
      },
    });
    if (!scheduleItem || scheduleItem.status !== "OPEN") {
      throw new Error("An open platform billing schedule item is required");
    }
    if (
      parsed.currencyCode !== scheduleItem.currencyCode ||
      parsed.currencyCode !== scheduleItem.purchase.currencyCode
    ) {
      throw new Error("Payment currency must match the purchase and schedule");
    }

    const payment = await tx.platformPayment.create({
      data: {
        purchaseId: scheduleItem.purchaseId,
        scheduleItemId: scheduleItem.id,
        recordedById: context.principalId,
        direction: "RECEIPT",
        status: "PENDING",
        amount: parsed.amount,
        currencyCode: parsed.currencyCode,
        externalReference: parsed.externalReference || null,
      },
      select: { id: true },
    });
    await tx.platformAuditLog.create({
      data: {
        actorPrincipalId: context.principalId,
        action: "platform.payments.pending_receipt_recorded",
        targetType: "PlatformPayment",
        targetId: payment.id,
        metadata: {
          purchaseId: scheduleItem.purchaseId,
          scheduleItemId: scheduleItem.id,
          amount: parsed.amount,
          currencyCode: parsed.currencyCode,
        },
      },
      select: { id: true },
    });
    return { paymentId: payment.id };
  });
}
