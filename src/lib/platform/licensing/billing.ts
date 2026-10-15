import { Prisma } from "@/generated/prisma/client";

export type PlatformPurchaseKind = "LIFETIME" | "SUBSCRIPTION" | "INSTALLMENT";
export type PlatformScheduleKind =
  | "LIFETIME_PAYMENT"
  | "SUBSCRIPTION_CYCLE"
  | "INSTALLMENT";
export type PlatformScheduleStatus = "OPEN" | "CANCELED";
export type PlatformPaymentDirection = "RECEIPT" | "REFUND";
export type PlatformPaymentStatus = "PENDING" | "SETTLED" | "FAILED" | "VOIDED";
export type PlatformBillingItemState = "UPCOMING" | "DUE" | "PARTIAL" | "PAID" | "CANCELED";

export type PurchaseScheduleDraft = {
  kind: PlatformScheduleKind;
  sequence: number;
  dueAt: Date;
  amount: string;
  currencyCode: string;
};

type MoneyValue = string | Prisma.Decimal;

export type BillingScheduleEntry = Omit<PurchaseScheduleDraft, "amount"> & {
  id: string;
  status: PlatformScheduleStatus;
  amount: MoneyValue;
};

export type BillingPaymentEntry = {
  scheduleItemId: string;
  amount: MoneyValue;
  currencyCode: string;
  direction: PlatformPaymentDirection;
  status: PlatformPaymentStatus;
};

export type PlatformBillingItemSummary = {
  id: string;
  sequence: number;
  dueAt: string;
  scheduledAmount: string;
  settledNetAmount: string;
  outstandingAmount: string;
  state: PlatformBillingItemState;
};

export type PlatformBillingSummary = {
  currencyCode: string;
  totalOutstanding: string;
  amountDueNow: string;
  items: PlatformBillingItemSummary[];
};

export class BillingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingInputError";
  }
}

function parseMoney(value: MoneyValue, label: string, allowZero = false): Prisma.Decimal {
  const stringValue = typeof value === "string" ? value : value.toString();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(stringValue)) {
    throw new BillingInputError(`${label} must be a non-negative amount with at most two decimals`);
  }
  const amount = new Prisma.Decimal(stringValue);
  if (!amount.isFinite() || (allowZero ? amount.isNegative() : !amount.isPositive())) {
    throw new BillingInputError(`${label} must be ${allowZero ? "non-negative" : "greater than zero"}`);
  }
  return amount;
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new BillingInputError("Currency must be a 3-letter code");
  return currency;
}

function validateSequenceAndDates(items: readonly PurchaseScheduleDraft[]): void {
  let previousDueAt = Number.NEGATIVE_INFINITY;
  items.forEach((item, index) => {
    if (item.sequence !== index + 1) {
      throw new BillingInputError("Schedule sequence must start at 1 and be contiguous");
    }
    const dueAt = item.dueAt.getTime();
    if (!Number.isFinite(dueAt) || dueAt < previousDueAt) {
      throw new BillingInputError("Schedule due dates must be valid and non-decreasing");
    }
    previousDueAt = dueAt;
  });
}

/**
 * Validates only the explicit, caller-supplied amounts and dates. It does not
 * calculate interest, fees, tax, renewal dates, or an access-state decision.
 */
export function validatePlatformPurchaseSchedule(input: {
  kind: PlatformPurchaseKind;
  contractAmount: string;
  currencyCode: string;
  schedule: readonly PurchaseScheduleDraft[];
}): void {
  const contractAmount = parseMoney(input.contractAmount, "Contract amount");
  const currencyCode = normalizeCurrency(input.currencyCode);
  const schedule = [...input.schedule].sort((a, b) => a.sequence - b.sequence);

  if (schedule.length === 0) throw new BillingInputError("At least one explicit due date is required");
  validateSequenceAndDates(schedule);

  for (const [index, item] of schedule.entries()) {
    parseMoney(item.amount, `Schedule amount ${index + 1}`);
    if (normalizeCurrency(item.currencyCode) !== currencyCode) {
      throw new BillingInputError("Schedule and purchase currencies must match");
    }
  }

  if (input.kind === "LIFETIME") {
    if (schedule.length !== 1 || schedule[0].kind !== "LIFETIME_PAYMENT") {
      throw new BillingInputError("A lifetime purchase requires one explicit payment due date");
    }
    if (!new Prisma.Decimal(schedule[0].amount).equals(contractAmount)) {
      throw new BillingInputError("Lifetime due amount must equal the contract amount");
    }
    return;
  }

  if (input.kind === "INSTALLMENT") {
    if (schedule.length < 2 || schedule.some((item) => item.kind !== "INSTALLMENT")) {
      throw new BillingInputError("An installment purchase requires at least two installment dates");
    }
    const scheduledTotal = schedule.reduce(
      (total, item) => total.plus(new Prisma.Decimal(item.amount)),
      new Prisma.Decimal(0),
    );
    if (!scheduledTotal.equals(contractAmount)) {
      throw new BillingInputError("Installment amounts must equal the stated contract amount");
    }
    return;
  }

  if (schedule.some((item) => item.kind !== "SUBSCRIPTION_CYCLE")) {
    throw new BillingInputError("Subscription schedules can contain only explicit billing cycles");
  }
  if (schedule.some((item) => !new Prisma.Decimal(item.amount).equals(contractAmount))) {
    throw new BillingInputError("Each subscription cycle must match the stated per-cycle amount");
  }
}

/**
 * Calculates amount due from explicit schedule rows and settled ledger entries.
 * Pending/failed/voided records do not reduce the balance. `DUE` means the
 * supplied due date has arrived; no grace period, late fee, suspension, or
 * entitlement transition is inferred here.
 */
export function calculatePlatformBillingSummary(input: {
  schedule: readonly BillingScheduleEntry[];
  payments: readonly BillingPaymentEntry[];
  asOf: Date;
}): PlatformBillingSummary {
  if (!Number.isFinite(input.asOf.getTime())) throw new BillingInputError("asOf must be a valid date");
  if (input.schedule.length === 0) throw new BillingInputError("A billing schedule is required");

  const currencyCode = normalizeCurrency(input.schedule[0].currencyCode);
  const scheduleById = new Map<string, BillingScheduleEntry>();
  const receiptsByItem = new Map<string, Prisma.Decimal>();
  const refundsByItem = new Map<string, Prisma.Decimal>();

  for (const item of input.schedule) {
    if (scheduleById.has(item.id)) throw new BillingInputError("Schedule item IDs must be unique");
    if (normalizeCurrency(item.currencyCode) !== currencyCode) {
      throw new BillingInputError("Schedule currencies must match");
    }
    parseMoney(item.amount, `Schedule amount ${item.sequence}`);
    if (!Number.isFinite(item.dueAt.getTime())) throw new BillingInputError("Schedule due date is invalid");
    scheduleById.set(item.id, item);
    receiptsByItem.set(item.id, new Prisma.Decimal(0));
    refundsByItem.set(item.id, new Prisma.Decimal(0));
  }

  for (const payment of input.payments) {
    if (!scheduleById.has(payment.scheduleItemId)) {
      throw new BillingInputError("Payment must reference an item in this schedule");
    }
    if (normalizeCurrency(payment.currencyCode) !== currencyCode) {
      throw new BillingInputError("Payment and schedule currencies must match");
    }
    const amount = parseMoney(payment.amount, "Payment amount");
    if (payment.status !== "SETTLED") continue;
    const entries = payment.direction === "RECEIPT" ? receiptsByItem : refundsByItem;
    entries.set(payment.scheduleItemId, entries.get(payment.scheduleItemId)!.plus(amount));
  }

  const items = [...input.schedule]
    .sort((a, b) => a.sequence - b.sequence)
    .map((item): PlatformBillingItemSummary => {
      const scheduledAmount = new Prisma.Decimal(item.amount);
      const receipts = receiptsByItem.get(item.id)!;
      const refunds = refundsByItem.get(item.id)!;
      if (refunds.greaterThan(receipts)) {
        throw new BillingInputError("Settled refunds exceed settled receipts; reconcile explicitly");
      }
      const netPaid = receipts.minus(refunds);
      const outstanding = item.status === "CANCELED"
        ? new Prisma.Decimal(0)
        : scheduledAmount.minus(netPaid);
      if (outstanding.isNegative()) {
        throw new BillingInputError("Settled payments exceed the schedule amount; reconcile explicitly");
      }

      const state: PlatformBillingItemState = item.status === "CANCELED"
        ? "CANCELED"
        : outstanding.isZero()
          ? "PAID"
          : netPaid.greaterThan(0)
            ? "PARTIAL"
            : item.dueAt.getTime() <= input.asOf.getTime()
              ? "DUE"
              : "UPCOMING";

      return {
        id: item.id,
        sequence: item.sequence,
        dueAt: item.dueAt.toISOString(),
        scheduledAmount: scheduledAmount.toFixed(2),
        settledNetAmount: netPaid.toFixed(2),
        outstandingAmount: outstanding.toFixed(2),
        state,
      };
    });

  const totalOutstanding = items.reduce(
    (total, item) => total.plus(item.outstandingAmount),
    new Prisma.Decimal(0),
  );
  const amountDueNow = items.reduce(
    (total, item) =>
      item.state !== "CANCELED" && new Date(item.dueAt).getTime() <= input.asOf.getTime()
        ? total.plus(item.outstandingAmount)
        : total,
    new Prisma.Decimal(0),
  );

  return {
    currencyCode,
    totalOutstanding: totalOutstanding.toFixed(2),
    amountDueNow: amountDueNow.toFixed(2),
    items,
  };
}
