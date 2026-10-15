import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlatformPurchaseRecord,
  recordPendingPlatformReceipt,
  transitionPlatformEntitlement,
  PlatformLicensingConflictError,
} from "@/lib/platform/licensing/mutations";
import { PlatformForbiddenError } from "@/lib/platform/authorization";

const state = vi.hoisted(() => ({ capabilities: ["platform.licensing.manage"] as string[] }));
const mocks = vi.hoisted(() => {
  const tx = {
    organization: { findUnique: vi.fn() },
    platformPurchase: { create: vi.fn() },
    platformEntitlement: { updateMany: vi.fn() },
    platformBillingScheduleItem: { findUnique: vi.fn() },
    platformPayment: { create: vi.fn() },
    platformAuditLog: { create: vi.fn() },
  };
  return { tx, transaction: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "platform-user" }),
}));
vi.mock("@/lib/platform/authorization", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform/authorization")>("@/lib/platform/authorization");
  return {
    ...actual,
    loadPlatformContext: vi.fn().mockImplementation(async () => ({
      principalId: "platform-principal",
      userId: "platform-user",
      capabilities: new Set(state.capabilities),
    })),
  };
});

describe("platform licensing mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.capabilities = ["platform.licensing.manage"];
    mocks.tx.organization.findUnique.mockResolvedValue({ id: "org-1" });
    mocks.tx.platformPurchase.create.mockResolvedValue({ id: "purchase-1" });
    mocks.tx.platformEntitlement.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.platformBillingScheduleItem.findUnique.mockResolvedValue({
      id: "schedule-1",
      purchaseId: "purchase-1",
      status: "OPEN",
      currencyCode: "INR",
      purchase: { currencyCode: "INR" },
    });
    mocks.tx.platformPayment.create.mockResolvedValue({ id: "payment-1" });
    mocks.tx.platformAuditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx),
    );
  });

  it("creates a pending EMI purchase with explicit schedule rows and an audit record", async () => {
    await expect(createPlatformPurchaseRecord({
      organizationId: "org-1",
      kind: "INSTALLMENT",
      contractAmount: "100.00",
      currencyCode: "INR",
      schedule: [
        { sequence: 1, dueAt: "2026-10-15T00:00:00.000Z", amount: "40.00" },
        { sequence: 2, dueAt: "2026-11-15T00:00:00.000Z", amount: "60.00" },
      ],
    })).resolves.toEqual({ purchaseId: "purchase-1" });

    expect(mocks.tx.platformPurchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        kind: "INSTALLMENT",
        contractAmount: "100.00",
        currencyCode: "INR",
        entitlement: { create: { state: "PENDING" } },
        schedule: {
          create: [
            expect.objectContaining({ kind: "INSTALLMENT", sequence: 1, amount: "40.00" }),
            expect.objectContaining({ kind: "INSTALLMENT", sequence: 2, amount: "60.00" }),
          ],
        },
      }),
      select: { id: true },
    });
    expect(mocks.tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorPrincipalId: "platform-principal",
        action: "platform.licensing.purchase_record_created",
        targetId: "purchase-1",
      }),
      select: { id: true },
    });
  });

  it("rejects invalid EMI totals before creating a transaction", async () => {
    await expect(createPlatformPurchaseRecord({
      organizationId: "org-1",
      kind: "INSTALLMENT",
      contractAmount: "100.00",
      currencyCode: "INR",
      schedule: [
        { sequence: 1, dueAt: "2026-10-15T00:00:00.000Z", amount: "40.00" },
        { sequence: 2, dueAt: "2026-11-15T00:00:00.000Z", amount: "50.00" },
      ],
    })).rejects.toThrow(/equal the stated contract amount/);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("stores an explicit subscription cadence without generating later billing cycles", async () => {
    await createPlatformPurchaseRecord({
      organizationId: "org-1",
      kind: "SUBSCRIPTION",
      contractAmount: "29.00",
      currencyCode: "USD",
      billingIntervalUnit: "MONTH",
      billingIntervalCount: 1,
      schedule: [{ sequence: 1, dueAt: "2026-10-15T00:00:00.000Z", amount: "29.00" }],
    });

    expect(mocks.tx.platformPurchase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "SUBSCRIPTION",
        contractAmount: "29.00",
        billingIntervalUnit: "MONTH",
        billingIntervalCount: 1,
      }),
      select: { id: true },
    });
    expect(mocks.tx.platformPurchase.create.mock.calls[0][0].data.schedule.create).toHaveLength(1);
  });

  it("requires subscription cadence and does not invent a default", async () => {
    await expect(createPlatformPurchaseRecord({
      organizationId: "org-1",
      kind: "SUBSCRIPTION",
      contractAmount: "29.00",
      currencyCode: "USD",
      schedule: [{ sequence: 1, dueAt: "2026-10-15T00:00:00.000Z", amount: "29.00" }],
    })).rejects.toThrow(/explicit billing interval/);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires licensing-management permission and does not write on denial", async () => {
    state.capabilities = ["platform.organizations.view"];

    await expect(createPlatformPurchaseRecord({
      organizationId: "org-1",
      kind: "LIFETIME",
      contractAmount: "100.00",
      currencyCode: "INR",
      schedule: [{ sequence: 1, dueAt: "2026-10-15T00:00:00.000Z", amount: "100.00" }],
    })).rejects.toBeInstanceOf(PlatformForbiddenError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("uses expected state and audits explicit, manual entitlement transitions", async () => {
    await transitionPlatformEntitlement({
      entitlementId: "entitlement-1",
      expectedState: "PENDING",
      nextState: "ACTIVE",
      decisionReference: "LIC-APPROVAL-42",
    });

    expect(mocks.tx.platformEntitlement.updateMany).toHaveBeenCalledWith({
      where: { id: "entitlement-1", state: "PENDING" },
      data: { state: "ACTIVE" },
    });
    expect(mocks.tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "platform.licensing.entitlement_state_changed",
        metadata: expect.objectContaining({ from: "PENDING", to: "ACTIVE" }),
      }),
      select: { id: true },
    });
  });

  it("returns a stale-state conflict and writes no audit when the compare-and-set loses", async () => {
    mocks.tx.platformEntitlement.updateMany.mockResolvedValue({ count: 0 });

    await expect(transitionPlatformEntitlement({
      entitlementId: "entitlement-1",
      expectedState: "PENDING",
      nextState: "ACTIVE",
      decisionReference: "LIC-APPROVAL-42",
    })).rejects.toBeInstanceOf(PlatformLicensingConflictError);
    expect(mocks.tx.platformAuditLog.create).not.toHaveBeenCalled();
  });

  it("records only pending receipts and writes audit atomically", async () => {
    state.capabilities = ["platform.payments.record"];

    await expect(recordPendingPlatformReceipt({
      purchaseId: "purchase-1",
      scheduleItemId: "schedule-1",
      amount: "25.00",
      currencyCode: "INR",
      externalReference: "manual-ref-1",
    })).resolves.toEqual({ paymentId: "payment-1" });

    expect(mocks.tx.platformPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recordedById: "platform-principal",
        direction: "RECEIPT",
        status: "PENDING",
        amount: "25.00",
      }),
      select: { id: true },
    });
    expect(mocks.tx.platformAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "platform.payments.pending_receipt_recorded" }),
      select: { id: true },
    });
  });
});
