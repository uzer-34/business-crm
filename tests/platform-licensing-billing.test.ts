import { describe, expect, it } from "vitest";
import {
  BillingInputError,
  calculatePlatformBillingSummary,
  validatePlatformPurchaseSchedule,
  type BillingScheduleEntry,
} from "@/lib/platform/licensing/billing";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("platform licensing schedule and amount-due calculations", () => {
  it("validates lifetime purchase terms using one explicit due date", () => {
    expect(() => validatePlatformPurchaseSchedule({
      kind: "LIFETIME",
      contractAmount: "100.00",
      currencyCode: "INR",
      schedule: [{
        kind: "LIFETIME_PAYMENT",
        sequence: 1,
        dueAt: date("2026-10-15"),
        amount: "100.00",
        currencyCode: "INR",
      }],
    })).not.toThrow();
  });

  it("requires EMI schedule totals to match the stated contract amount", () => {
    const schedule = [
      { kind: "INSTALLMENT" as const, sequence: 1, dueAt: date("2026-10-01"), amount: "40.00", currencyCode: "INR" },
      { kind: "INSTALLMENT" as const, sequence: 2, dueAt: date("2026-11-01"), amount: "60.00", currencyCode: "INR" },
    ];
    expect(() => validatePlatformPurchaseSchedule({
      kind: "INSTALLMENT",
      contractAmount: "100.00",
      currencyCode: "INR",
      schedule,
    })).not.toThrow();
    expect(() => validatePlatformPurchaseSchedule({
      kind: "INSTALLMENT",
      contractAmount: "99.00",
      currencyCode: "INR",
      schedule,
    })).toThrow(BillingInputError);
  });

  it("validates recurring cycle amounts without inventing future renewals", () => {
    expect(() => validatePlatformPurchaseSchedule({
      kind: "SUBSCRIPTION",
      contractAmount: "29.00",
      currencyCode: "USD",
      schedule: [
        { kind: "SUBSCRIPTION_CYCLE", sequence: 1, dueAt: date("2026-10-01"), amount: "29.00", currencyCode: "USD" },
        { kind: "SUBSCRIPTION_CYCLE", sequence: 2, dueAt: date("2026-11-01"), amount: "29.00", currencyCode: "USD" },
      ],
    })).not.toThrow();
  });

  it("calculates outstanding and due-now separately while ignoring pending receipts", () => {
    const schedule: BillingScheduleEntry[] = [
      { id: "due", kind: "INSTALLMENT", sequence: 1, dueAt: date("2026-10-01"), amount: "100.00", currencyCode: "INR", status: "OPEN" },
      { id: "upcoming", kind: "INSTALLMENT", sequence: 2, dueAt: date("2026-11-01"), amount: "200.00", currencyCode: "INR", status: "OPEN" },
    ];
    const result = calculatePlatformBillingSummary({
      schedule,
      payments: [
        { scheduleItemId: "due", amount: "40.00", currencyCode: "INR", direction: "RECEIPT", status: "SETTLED" },
        { scheduleItemId: "due", amount: "60.00", currencyCode: "INR", direction: "RECEIPT", status: "PENDING" },
      ],
      asOf: date("2026-10-11"),
    });

    expect(result).toEqual({
      currencyCode: "INR",
      totalOutstanding: "260.00",
      amountDueNow: "60.00",
      items: [
        expect.objectContaining({ id: "due", state: "PARTIAL", settledNetAmount: "40.00", outstandingAmount: "60.00" }),
        expect.objectContaining({ id: "upcoming", state: "UPCOMING", outstandingAmount: "200.00" }),
      ],
    });
  });

  it("treats settled refunds as a reverse receipt but does not create a negative due", () => {
    const result = calculatePlatformBillingSummary({
      schedule: [{
        id: "item-1", kind: "LIFETIME_PAYMENT", sequence: 1, dueAt: date("2026-10-01"),
        amount: "100.00", currencyCode: "USD", status: "OPEN",
      }],
      payments: [
        { scheduleItemId: "item-1", amount: "100.00", currencyCode: "USD", direction: "RECEIPT", status: "SETTLED" },
        { scheduleItemId: "item-1", amount: "25.00", currencyCode: "USD", direction: "REFUND", status: "SETTLED" },
      ],
      asOf: date("2026-10-11"),
    });
    expect(result.amountDueNow).toBe("25.00");
  });

  it("rejects unsupported currency mismatches, overpayments, and orphaned payment history", () => {
    const schedule: BillingScheduleEntry[] = [{
      id: "item-1", kind: "LIFETIME_PAYMENT", sequence: 1, dueAt: date("2026-10-01"),
      amount: "100.00", currencyCode: "USD", status: "OPEN",
    }];
    expect(() => calculatePlatformBillingSummary({
      schedule,
      payments: [{ scheduleItemId: "item-1", amount: "1.00", currencyCode: "EUR", direction: "RECEIPT", status: "SETTLED" }],
      asOf: date("2026-10-11"),
    })).toThrow(BillingInputError);
    expect(() => calculatePlatformBillingSummary({
      schedule,
      payments: [{ scheduleItemId: "item-1", amount: "101.00", currencyCode: "USD", direction: "RECEIPT", status: "SETTLED" }],
      asOf: date("2026-10-11"),
    })).toThrow(/exceed/);
    expect(() => calculatePlatformBillingSummary({
      schedule,
      payments: [{ scheduleItemId: "missing", amount: "1.00", currencyCode: "USD", direction: "RECEIPT", status: "SETTLED" }],
      asOf: date("2026-10-11"),
    })).toThrow(/reference/);
  });
});
